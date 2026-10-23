import { projectilePosition, type CombatEvent, type GameState, type WeaponId } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import { mixColor, type Painter3D } from '../../render/Painter3D';
import { SHAKE_TIME } from '../models/barrel3d';
import { shipBob } from '../models/ShipSprite';
import { WIND_X, WIND_Y } from './wind';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** World units per second², down; negative for smoke, which rises */
  gravity: number;
  /** Share of the speed lost per second */
  drag: number;
  /** Share of the wind it drifts with */
  wind: number;
  life: number;
  maxLife: number;
  /** Starting radius, world units */
  size: number;
  /** The radius at the end of life, as a multiple of size */
  growth: number;
  from: number;
  to: number;
  alpha: number;
}

/** A ring spreading on the water around a splash */
interface Ripple {
  x: number;
  y: number;
  from: number;
  to: number;
  life: number;
  maxLife: number;
  alpha: number;
}

/** The fire at the muzzle in the first instant of a shot */
interface Flash {
  at: Vec3;
  dirX: number;
  dirY: number;
  life: number;
  maxLife: number;
  weapon: WeaponId;
}

const PARTICLES = 320;
const RIPPLES = 24;
const FLASHES = 12;

const CANNON_FLASH_TIME = 0.22; // seconds
const HARPOON_FLASH_TIME = 0.12;
const FLAME_LENGTH = 8; // world units, the tongue of fire out of the muzzle
const FLAME_WIDTH = 2.2;
const FLASH_CORE = 3.2; // world units, the radius of the bright ball at the muzzle
const TRAIL_INTERVAL = 0.035; // seconds between the puffs a cannonball leaves behind

const COLORS = {
  flashCore: 0xffe9a8,
  flame: 0xff8f26,
  flameInner: 0xffd36b,
  smokeLight: 0xf4f0e8,
  smokeShade: 0xcbc4b8,
  smokeDark: 0x99938b,
  sparkHot: 0xffd166,
  sparkCool: 0xff5a1f,
  splash: 0xffffff,
  splashFar: 0xcfe8f0,
  splinter: 0xc0925a,
  splinterDark: 0x6b4a2a,
  puff: 0xe8edef,
};

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    gravity: 0,
    drag: 0,
    wind: 0,
    life: 1,
    maxLife: 1,
    size: 0,
    growth: 1,
    from: 0,
    to: 0,
    alpha: 0,
  }));
}

function between(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Shots, splashes and hits: the game reports what happened (state.events), this animates it.
// Everything lives in fixed pools reused round-robin, like the wake and the ship fire
export class ShotEffects {
  private readonly particles = makeParticles(PARTICLES);
  private readonly ripples: Ripple[] = Array.from({ length: RIPPLES }, () => ({
    x: 0,
    y: 0,
    from: 0,
    to: 0,
    life: 1,
    maxLife: 1,
    alpha: 0,
  }));
  private readonly flashes: Flash[] = Array.from({ length: FLASHES }, () => ({
    at: [0, 0, 0],
    dirX: 1,
    dirY: 0,
    life: 1,
    maxLife: 1,
    weapon: 'cannon',
  }));
  private nextParticle = 0;
  private nextRipple = 0;
  private nextFlash = 0;
  /** When each target was last hit, game time */
  private readonly hitTimes = new Map<number, number>();
  private trailClock = 0;

  update(dt: number, state: GameState) {
    for (const event of state.events) this.start(event, state.time);

    // A thin smoke trail behind every cannonball, so its arc can be followed
    this.trailClock += dt;
    while (this.trailClock >= TRAIL_INTERVAL) {
      this.trailClock -= TRAIL_INTERVAL;
      for (const projectile of state.projectiles) {
        if (projectile.weapon !== 'cannon') continue;
        const at = projectilePosition(projectile);
        this.burst([at.x, at.y, at.z], 1, trail);
      }
    }

    for (const p of this.particles) {
      if (p.life >= p.maxLife) continue;
      p.life += dt;
      const keep = Math.max(0, 1 - p.drag * dt);
      p.vx *= keep;
      p.vy *= keep;
      p.vz = p.vz * keep - p.gravity * dt;
      p.x += (p.vx + WIND_X * p.wind) * dt;
      p.y += (p.vy + WIND_Y * p.wind) * dt;
      p.z += p.vz * dt;
      // Spray and splinters vanish when they fall back into the sea
      if (p.z < 0 && p.gravity > 0) p.life = p.maxLife;
    }
    for (const r of this.ripples) r.life += dt;
    for (const f of this.flashes) f.life += dt;
  }

  /** How much a target still shakes from its last hit: 1 right after it, 0 once settled */
  shake(targetId: number, time: number) {
    const hit = this.hitTimes.get(targetId);
    return hit === undefined ? 0 : Math.max(0, 1 - (time - hit) / SHAKE_TIME);
  }

  /** Ripples on the water. Drawn with the sea */
  drawWater(p: Painter3D) {
    for (const r of this.ripples) {
      if (r.life < 0 || r.life >= r.maxLife) continue;
      const t = r.life / r.maxLife;
      const radius = r.from + (r.to - r.from) * (1 - (1 - t) ** 2);
      p.ring(r.x, r.y, 0, radius, 0.7 * (1 - t) + 0.2, COLORS.splash, r.alpha * (1 - t));
    }
  }

  /** Everything above the water. Things farther than the ship go to `far` (under the ship sprite), nearer ones to `near` */
  draw(far: Painter3D, near: Painter3D, shipDepth: number) {
    const pick = (at: Vec3) => (far.depth(at) > shipDepth ? far : near);

    for (const p of this.particles) {
      if (p.life >= p.maxLife) continue;
      const t = p.life / p.maxLife;
      const at: Vec3 = [p.x, p.y, p.z];
      const fadeIn = Math.min(1, t * 8);
      pick(at).ball(at, p.size * (1 + (p.growth - 1) * t), mixColor(p.from, p.to, t), p.alpha * fadeIn * (1 - t));
    }

    for (const f of this.flashes) {
      if (f.life >= f.maxLife) continue;
      drawFlash(pick(f.at), f, f.life / f.maxLife);
    }
  }

  private start(event: CombatEvent, time: number) {
    if (event.type === 'holdFire') return;
    const [x, y, z] = [event.at.x, event.at.y, event.at.z];
    const { dirX, dirY, weapon } = event;
    if (event.type === 'shot') {
      // The ship bobs on the waves; the muzzle goes with it
      const at: Vec3 = [x, y, z + shipBob(time)];
      this.flash(at, dirX, dirY, weapon);
      if (weapon === 'cannon') {
        this.burst(at, 14, (p) => smoke(p, dirX, dirY));
        this.burst(at, 8, (p) => spark(p, dirX, dirY));
      } else {
        this.burst(at, 4, (p) => puff(p, dirX, dirY));
      }
      return;
    }

    // Every shot hits: wood flies, water splashes up around the target and rings spread from it
    const at: Vec3 = [x, y, z];
    const cannon = weapon === 'cannon';
    this.hitTimes.set(event.targetId, time);
    this.burst(at, cannon ? 18 : 8, (p) => splinter(p, dirX, dirY));
    this.burst([x, y, 0], cannon ? 10 : 5, (p) => spray(p, cannon ? 0.7 : 0.45));
    this.flash(at, dirX, dirY, cannon ? 'cannon' : 'harpoon');
    if (cannon) this.burst(at, 6, (p) => smoke(p, -dirX, -dirY));
    this.ripple(x, y, 2, cannon ? 9 : 6, 1.2, 0.6, 0);
  }

  private burst(at: Vec3, count: number, init: (p: Particle) => void) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.nextParticle];
      this.nextParticle = (this.nextParticle + 1) % PARTICLES;
      [p.x, p.y, p.z] = at;
      p.life = 0;
      p.wind = 0;
      init(p);
    }
  }

  private flash(at: Vec3, dirX: number, dirY: number, weapon: WeaponId) {
    const f = this.flashes[this.nextFlash];
    this.nextFlash = (this.nextFlash + 1) % FLASHES;
    f.at = at;
    f.dirX = dirX;
    f.dirY = dirY;
    f.weapon = weapon;
    f.life = 0;
    f.maxLife = weapon === 'cannon' ? CANNON_FLASH_TIME : HARPOON_FLASH_TIME;
  }

  /** delay: seconds before the ring appears */
  private ripple(x: number, y: number, from: number, to: number, life: number, alpha: number, delay: number) {
    const r = this.ripples[this.nextRipple];
    this.nextRipple = (this.nextRipple + 1) % RIPPLES;
    Object.assign(r, { x, y, from, to, life: -delay, maxLife: life, alpha });
  }
}

// A cloud, not a ball: puffs start apart, fly out at different speeds, differ in shade and are see-through,
// so where they overlap the cloud gets denser
function smoke(p: Particle, dirX: number, dirY: number) {
  p.x += between(-1, 1);
  p.y += between(-1, 1);
  p.z += between(-0.5, 1);
  const speed = between(10, 28);
  p.vx = dirX * speed + between(-5, 5);
  p.vy = dirY * speed + between(-5, 5);
  p.vz = between(2, 6);
  p.gravity = -1;
  p.drag = 2.4;
  p.wind = 1;
  p.maxLife = between(1.6, 2.8);
  p.size = between(1.2, 2.2);
  p.growth = 3.2;
  p.from = mixColor(COLORS.smokeLight, COLORS.smokeShade, Math.random());
  p.to = COLORS.smokeDark;
  p.alpha = 0.5;
}

function trail(p: Particle) {
  p.vx = 0;
  p.vy = 0;
  p.vz = 0.5;
  p.gravity = 0;
  p.drag = 0;
  p.wind = 1;
  p.maxLife = 0.6;
  p.size = 0.7;
  p.growth = 2.2;
  p.from = COLORS.smokeLight;
  p.to = COLORS.smokeDark;
  p.alpha = 0.4;
}

function spark(p: Particle, dirX: number, dirY: number) {
  const speed = between(25, 40);
  p.vx = dirX * speed + between(-5, 5);
  p.vy = dirY * speed + between(-5, 5);
  p.vz = between(1, 5);
  p.gravity = 30;
  p.drag = 2;
  p.maxLife = between(0.25, 0.4);
  p.size = 0.35;
  p.growth = 0.6;
  p.from = COLORS.sparkHot;
  p.to = COLORS.sparkCool;
  p.alpha = 1;
}

function puff(p: Particle, dirX: number, dirY: number) {
  p.vx = dirX * between(2, 5) + between(-1, 1);
  p.vy = dirY * between(2, 5) + between(-1, 1);
  p.vz = between(0.5, 1.5);
  p.gravity = -0.5;
  p.drag = 2.5;
  p.wind = 1;
  p.maxLife = between(0.5, 0.8);
  p.size = 0.6;
  p.growth = 2;
  p.from = COLORS.puff;
  p.to = COLORS.smokeLight;
  p.alpha = 0.7;
}

/** scale: 1 for a cannonball, less for a harpoon */
function spray(p: Particle, scale: number) {
  const angle = Math.random() * Math.PI * 2;
  const out = between(0.5, 4) * scale;
  p.vx = Math.cos(angle) * out;
  p.vy = Math.sin(angle) * out;
  p.vz = between(14, 24) * scale;
  p.gravity = 38;
  p.drag = 0.3;
  p.maxLife = between(0.8, 1.2);
  p.size = between(0.9, 1.6) * scale;
  p.growth = 1.3;
  p.from = COLORS.splash;
  p.to = COLORS.splashFar;
  p.alpha = 0.95;
}

function splinter(p: Particle, dirX: number, dirY: number) {
  const angle = Math.random() * Math.PI * 2;
  const out = between(6, 16);
  // Mostly out of the far side, carried on by the shot
  p.vx = Math.cos(angle) * out + dirX * 8;
  p.vy = Math.sin(angle) * out + dirY * 8;
  p.vz = between(6, 14);
  p.gravity = 30;
  p.drag = 0.5;
  p.maxLife = between(0.8, 1.2);
  p.size = between(0.45, 0.8);
  p.growth = 1;
  p.from = COLORS.splinter;
  p.to = COLORS.splinterDark;
  p.alpha = 1;
}

// A cannon's flash is a bright core with a tongue of fire along the shot, drawn as two crossed diamonds so it reads from
// any angle; a harpoon launcher only gives a small pale puff
function drawFlash(p: Painter3D, f: Flash, t: number) {
  const [x, y, z] = f.at;
  const fade = 1 - t;
  if (f.weapon === 'harpoon') {
    p.ball(f.at, 1.1 * (1 + t), COLORS.flashCore, 0.6 * fade);
    return;
  }
  const length = FLAME_LENGTH * (1 - 0.4 * t);
  const width = FLAME_WIDTH * fade + 0.3;
  const tip: Vec3 = [x + f.dirX * length, y + f.dirY * length, z];
  const back: Vec3 = [x - f.dirX * 0.6, y - f.dirY * 0.6, z];
  const sideX = -f.dirY * width;
  const sideY = f.dirX * width;
  p.polygon([back, [x + sideX, y + sideY, z], tip, [x - sideX, y - sideY, z]], COLORS.flame, fade);
  p.polygon([back, [x, y, z + width], tip, [x, y, z - width]], COLORS.flame, fade);
  const inner: Vec3 = [x + f.dirX * length * 0.55, y + f.dirY * length * 0.55, z];
  p.polygon(
    [back, [x + sideX / 2, y + sideY / 2, z], inner, [x - sideX / 2, y - sideY / 2, z]],
    COLORS.flameInner,
    fade,
  );
  p.ball(f.at, FLASH_CORE * fade + 0.6, COLORS.flashCore, fade);
}
