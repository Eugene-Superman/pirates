import { SHIP_CLASSES, projectilePosition, type GameEvent, type GameState, type WeaponId } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import { mixColor, type Painter3D } from '../../render/Painter3D';
import { shipBob } from '../models/ShipSprite';
import { WIND_X, WIND_Y } from './wind';

const SHAKE_TIME = 0.8; // seconds a unit rocks after a hit (shake), dying out

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

// A boss's barrage is four or five shells of seven balls of grapeshot, each throwing up its spout and ring
const PARTICLES = 400;
const MAX_MUZZLES = 8; // guns of one volley shown firing, at most
const RIPPLES = 48;
const GRAPESHOT_SPRAY = 6; // drops in a ball of grapeshot's spout
const FLASHES = 12;

const CANNON_FLASH_TIME = 0.22; // seconds
const HARPOON_FLASH_TIME = 0.12;
const FLAME_LENGTH = 8; // world units, the tongue of fire out of the muzzle
const FLAME_WIDTH = 2.2;
const FLASH_CORE = 3.2; // world units, the radius of the bright ball at the muzzle
const TRAIL_INTERVAL = 0.035; // seconds between the puffs a cannonball leaves behind, two for a rocket
// A powder keg blowing up, for a blast of radius PERKS.powderKeg.blast: fire, sparks, smoke and water thrown up
const BLAST = { fire: 34, sparks: 26, smoke: 22, spray: 30 } as const;
const LUNGE_TIME = 0.45; // seconds a monster's head stays darted forward after a bite
// A monster coming up from a dive: spouts where its arms strike round it, this many, between these shares of its radius
const SURFACE_ARMS = { count: 9, from: 0.45, to: 0.95 } as const;
const INK_BURST = 26; // drops of ink thrown up as a monster sheds a cloud of it

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
  ink: 0x1b1233,
  inkFar: 0x3a2a6b,
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
  /** When each target was last hit, and each monster last bit, game time */
  private readonly hitTimes = new Map<number, number>();
  private readonly biteTimes = new Map<number, number>();
  private trailClock = 0;

  update(dt: number, state: GameState) {
    for (const event of state.events) this.start(event, state);
    // Settled hits and finished bites are forgotten: bots come and go, each with an id of its own
    for (const [id, at] of this.hitTimes) if (state.time - at > SHAKE_TIME) this.hitTimes.delete(id);
    for (const [id, at] of this.biteTimes) if (state.time - at > LUNGE_TIME) this.biteTimes.delete(id);

    // A thin smoke trail behind every cannonball, so its arc can be followed
    this.trailClock += dt;
    while (this.trailClock >= TRAIL_INTERVAL) {
      this.trailClock -= TRAIL_INTERVAL;
      for (const projectile of state.projectiles) {
        if (projectile.weapon !== 'cannon') continue;
        const at = projectilePosition(projectile);
        if (projectile.kind === 'rocket') this.burst([at.x, at.y, at.z], 2, rocketTrail);
        else this.burst([at.x, at.y, at.z], 1, trail);
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

  /** Seconds since a monster's last bite, while its head is still darted forward from it; null otherwise */
  biteAge(monsterId: number, time: number) {
    const bite = this.biteTimes.get(monsterId);
    return bite === undefined || time - bite >= LUNGE_TIME ? null : time - bite;
  }

  /** How far a monster's head is still darted forward from its last bite: 1 as it bites, 0 once back */
  lunge(monsterId: number, time: number) {
    const bite = this.biteTimes.get(monsterId);
    if (bite === undefined) return 0;
    const t = (time - bite) / LUNGE_TIME;
    return t >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t * 0.3);
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

  private start(event: GameEvent, state: GameState) {
    const { time } = state;
    // A boss's mortar, or a ship's bombardment: fire and smoke up from its deck
    if (event.type === 'barrage') {
      const at: Vec3 = [event.at.x, event.at.y, event.at.z + 2];
      this.flash(at, 0, 0, 'cannon');
      this.burst(at, 18, (p) => smoke(p, 0, 0));
      this.burst(at, 10, (p) => spark(p, 0, 0));
      return;
    }
    // A rocket off a deck: fire and smoke where it leaves
    if (event.type === 'rocket') {
      const at: Vec3 = [event.at.x, event.at.y, event.at.z];
      this.flash(at, event.dirX, event.dirY, 'cannon');
      this.burst(at, 10, (p) => smoke(p, -event.dirX, -event.dirY));
      this.burst(at, 8, (p) => spark(p, -event.dirX, -event.dirY));
      return;
    }
    if (event.type === 'kegDropped') {
      this.burst([event.at.x, event.at.y, 0], 8, (p) => spray(p, 0.5));
      this.ripple(event.at.x, event.at.y, 2, 9, 1, 0.6, 0);
      return;
    }
    if (event.type === 'kegBlast') {
      this.blast(event.at.x, event.at.y, event.radius);
      return;
    }
    // A monster going under, coming up, shedding ink
    if (event.type === 'dive') {
      this.burst([event.at.x, event.at.y, 0], 16, (p) => spray(p, 1));
      this.ripple(event.at.x, event.at.y, 4, 22, 1.4, 0.6, 0);
      return;
    }
    if (event.type === 'surface') {
      this.surfaced(event.at.x, event.at.y, event.radius);
      return;
    }
    if (event.type === 'ink') {
      this.burst([event.at.x, event.at.y, 0], INK_BURST, inkDrop);
      this.ripple(event.at.x, event.at.y, 6, event.radius * 0.4, 1.5, 0.5, 0);
      return;
    }
    // A shell landing is BarrageMarks', which knows where each ball of its shot comes down (shellSplash)
    // The damage, repair, gold, XP and talent numbers are DamageNumbers'
    if (event.type !== 'shot' && event.type !== 'impact' && event.type !== 'bite' && event.type !== 'destroyed') return;
    if (event.type === 'destroyed') {
      // The player's own ship has its sinking animation instead
      if (event.targetId === state.ship.id) return;
      const creature = SHIP_CLASSES[event.kind].nature === 'creature';
      this.destroyed(event.at.x, event.at.y, creature);
      return;
    }
    if (event.type === 'bite') {
      this.biteTimes.set(event.attackerId, time);
      this.hitTimes.set(event.targetId, time);
      this.bitten(event.at.x, event.at.y, event.from.x - event.at.x, event.from.y - event.at.y);
      return;
    }
    const [x, y, z] = [event.at.x, event.at.y, event.at.z];
    const { dirX, dirY, weapon } = event;
    if (event.type === 'shot') {
      // Fire and smoke at every gun of the volley (its one projectile flies from their middle). A broadside of many
      // guns shows MAX_MUZZLES of them, spread along it: more would only fill the pools
      const { muzzles } = event;
      const shown = Math.min(muzzles.length, MAX_MUZZLES);
      for (let k = 0; k < shown; k++) {
        const m = muzzles[Math.floor((k * muzzles.length) / shown)];
        // The ship bobs on the waves; the muzzle goes with it
        const at: Vec3 = [m.x, m.y, m.z + shipBob(time)];
        this.flash(at, dirX, dirY, weapon);
        if (weapon === 'cannon') {
          this.burst(at, 14, (p) => smoke(p, dirX, dirY));
          this.burst(at, 8, (p) => spark(p, dirX, dirY));
        } else {
          this.burst(at, 4, (p) => puff(p, dirX, dirY));
        }
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
    // A rocket bursts into flame on the hull
    if (event.kind === 'rocket') {
      this.burst(at, 14, (p) => fire(p, 0.6));
      this.burst(at, 10, (p) => spark(p, between(-1, 1), between(-1, 1)));
    }
    this.ripple(x, y, 2, cannon ? 9 : 6, 1.2, 0.6, 0);
  }

  /**
   * A shell landing in the sea (BarrageMarks): a bombardment's throws up a column of water, smoke over it, rings
   * spreading; a ball of a boss's grapeshot, a spout of its own and a ring
   */
  shellSplash(x: number, y: number, grapeshot: boolean) {
    if (grapeshot) {
      this.burst([x, y, 0], GRAPESHOT_SPRAY, spout);
      this.ripple(x, y, 1.5, 10, 1.1, 0.55, 0);
      return;
    }
    this.burst([x, y, 0], 26, (p) => spray(p, 1.3));
    this.burst([x, y, 1], 10, (p) => smoke(p, 0, 0));
    this.ripple(x, y, 4, 26, 1.4, 0.7, 0);
    this.ripple(x, y, 3, 18, 1.2, 0.5, 0.25);
  }

  /**
   * A monster coming up: water thrown up where it breaks the surface; from a dive (`radius` > 0) a spout where each of
   * its arms strikes round it too, and a ring spreading as far as they reached
   */
  private surfaced(x: number, y: number, radius: number) {
    const dive = radius > 0;
    this.burst([x, y, 0], dive ? 30 : 10, (p) => spray(p, dive ? 1.5 : 0.7));
    this.ripple(x, y, 3, dive ? radius * 0.5 : 12, 1.3, 0.7, 0);
    if (!dive) return;
    const turn = Math.random() * Math.PI * 2;
    for (let i = 0; i < SURFACE_ARMS.count; i++) {
      const angle = turn + (i / SURFACE_ARMS.count) * Math.PI * 2;
      const out = radius * between(SURFACE_ARMS.from, SURFACE_ARMS.to);
      this.burst([x + Math.cos(angle) * out, y + Math.sin(angle) * out, 0], 5, (p) => spray(p, 0.9));
    }
    this.ripple(x, y, radius * 0.3, radius, 1.6, 0.6, 0.1);
  }

  /** Jaws closing on a hull: water thrown up between them, splinters bitten off, a ring on the water */
  private bitten(x: number, y: number, towardsX: number, towardsY: number) {
    const d = Math.hypot(towardsX, towardsY) || 1;
    this.burst([x, y, 0], 12, (p) => spray(p, 0.8));
    this.burst([x, y, 3], 10, (p) => splinter(p, -towardsX / d, -towardsY / d));
    this.ripple(x, y, 3, 12, 1.2, 0.6, 0);
  }

  /**
   * A powder keg blowing up: a flash and a ball of fire, sparks every way, smoke rising, a column of water and rings
   * spreading as far as the blast reached
   */
  private blast(x: number, y: number, radius: number) {
    const scale = radius / 80;
    this.flash([x, y, 2], 0, 0, 'cannon');
    this.burst([x, y, 2], BLAST.fire, (p) => fire(p, scale));
    this.burst([x, y, 2], BLAST.sparks, (p) => {
      const angle = Math.random() * Math.PI * 2;
      spark(p, Math.cos(angle), Math.sin(angle));
      p.vz = between(8, 22);
    });
    this.burst([x, y, 3], BLAST.smoke, (p) => smoke(p, between(-1, 1), between(-1, 1)));
    this.burst([x, y, 0], BLAST.spray, (p) => spray(p, 1.6));
    this.ripple(x, y, 6, radius, 1.6, 0.8, 0);
    this.ripple(x, y, 4, radius * 0.7, 1.3, 0.6, 0.2);
  }

  /** A target's hit points ran out: a big splash where it was, wood flying from a hull, and rings spreading wide */
  private destroyed(x: number, y: number, creature: boolean) {
    this.burst([x, y, 0], creature ? 40 : 28, (p) => spray(p, creature ? 1.4 : 1.1));
    if (!creature) this.burst([x, y, 2], 26, (p) => splinter(p, between(-1, 1), between(-1, 1)));
    this.ripple(x, y, 4, 22, 1.8, 0.7, 0);
    this.ripple(x, y, 3, 16, 1.5, 0.5, 0.35);
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

/** A rocket's trail: fire out of its tail cooling to smoke */
function rocketTrail(p: Particle) {
  trail(p);
  p.x += between(-0.4, 0.4);
  p.y += between(-0.4, 0.4);
  p.maxLife = 0.8;
  p.size = 0.9;
  p.growth = 2.8;
  p.from = COLORS.flame;
  p.alpha = 0.6;
}

/** scale: 1 for a keg's blast of 80 world units. Fire that swells, rises and cools to smoke */
function fire(p: Particle, scale: number) {
  const angle = Math.random() * Math.PI * 2;
  const out = between(4, 22) * scale;
  p.vx = Math.cos(angle) * out;
  p.vy = Math.sin(angle) * out;
  p.vz = between(6, 18) * scale;
  p.gravity = -4;
  p.drag = 2.2;
  p.wind = 0.5;
  p.maxLife = between(0.5, 0.9);
  p.size = between(1.6, 2.8) * scale;
  p.growth = 2.4;
  p.from = COLORS.flameInner;
  p.to = COLORS.smokeDark;
  p.alpha = 0.9;
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

/** A drop of ink thrown up as a monster sheds a cloud of it: dark, spreading as it falls back */
function inkDrop(p: Particle) {
  spray(p, 1.1);
  p.growth = 2.2;
  p.from = COLORS.ink;
  p.to = COLORS.inkFar;
  p.alpha = 0.85;
}

/** A ball of grapeshot going in: a narrow spout thrown high, falling back */
function spout(p: Particle) {
  const angle = Math.random() * Math.PI * 2;
  const out = between(0.3, 1.6);
  p.vx = Math.cos(angle) * out;
  p.vy = Math.sin(angle) * out;
  p.vz = between(16, 28);
  p.gravity = 40;
  p.drag = 0.3;
  p.maxLife = between(0.6, 0.9);
  p.size = between(0.55, 0.95);
  p.growth = 1.4;
  p.from = COLORS.splash;
  p.to = COLORS.splashFar;
  p.alpha = 0.9;
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
