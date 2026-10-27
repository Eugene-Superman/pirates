import type { DamageStage, ShipClassId } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import { shipBob, type SinkPose, type SpriteShip } from '../models/ShipSprite';

/** What burns: a ship afloat, or a sunk bot's wreck going down */
export interface BurningShip extends SpriteShip {
  readonly speed: number;
  readonly shipClass: { readonly id: ShipClassId };
}
import { WIND_X, WIND_Y } from './wind';

/** Where fire and smoke come from, in ship coordinates (x to the bow, y to starboard, z up), world units */
interface Emitter {
  x: number;
  y: number;
  z: number;
  /** Half-size of the box around the point that particles start in */
  spread: readonly [number, number, number];
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  /** Starting radius, world units */
  size: number;
}

// Ships with a sprite only: the vector-drawn ships don't burn. Emitters are in units of the sloop's size (radius 9)
// prettier-ignore
const EMITTERS: Readonly<Partial<Record<ShipClassId, { burning: Emitter[]; sinking: Emitter[] }>>> = {
  // Matches the sloop model in blender-assets/ships/starter/sloop/build.py (its y points to port, so y is negated here)
  sloop: {
    burning: [
      { x: 8, y: 1, z: 4.8, spread: [1.5, 1.2, 0.3] },
      { x: 4.5, y: -3.6, z: 5.2, spread: [1, 0.8, 0.3] },
      { x: -5.5, y: 3, z: 5.4, spread: [1, 1, 0.4] },
      { x: -11.5, y: -1.2, z: 6.9, spread: [1.2, 1.5, 0.3] },
      { x: 2.4, y: 0, z: 14.6, spread: [1.5, 5.5, 0.6] }, // the burning foot of the sail
    ],
    sinking: [
      { x: 9, y: -2, z: 6.2, spread: [4, 3, 0.5] }, // the sail lying over the bow
      { x: -4, y: 2, z: 5, spread: [3, 2, 0.4] },
      { x: -11.5, y: -1.2, z: 6.9, spread: [1.2, 1.5, 0.3] },
    ],
  },
  // Matches blender-assets/ships/european/coastalBark/build.py (y negated): the waist, the forecastle, the quarterdeck
  // and the burning feet of both courses; going down, the foremast fallen over the bow and the main course
  coastalBark: {
    burning: [
      { x: 2, y: -2, z: 6.2, spread: [2.5, 1.5, 0.4] },
      { x: -6, y: 3, z: 6.2, spread: [1.5, 1.5, 0.4] },
      { x: 13, y: 1.5, z: 8.2, spread: [1.5, 1.2, 0.3] },
      { x: -15, y: -1.5, z: 9, spread: [1.5, 2, 0.3] },
      { x: -1.5, y: 0, z: 16.2, spread: [1.5, 7, 0.6] },
      { x: 10, y: 0, z: 15.3, spread: [1.5, 6.5, 0.6] },
    ],
    sinking: [
      { x: 18, y: -3, z: 8.5, spread: [5, 4, 0.6] },
      { x: -1.5, y: 0, z: 17.5, spread: [1.5, 6, 0.6] },
      { x: -5, y: -2, z: 5.8, spread: [3, 2, 0.4] },
      { x: -15, y: -1.5, z: 8.5, spread: [1.5, 2, 0.3] },
    ],
  },
  // Matches blender-assets/ships/european/corsair/build.py (y negated, times 9 / its radius 16): the waist, the
  // forecastle, the quarterdeck and the burning feet of the courses and the spanker; going down, the foremast fallen
  // over the bow, the main course, the waist and the quarterdeck
  corsair: {
    burning: [
      { x: 1.7, y: -1.4, z: 4.5, spread: [1.7, 1.1, 0.3] },
      { x: -3.9, y: 1.7, z: 4.5, spread: [1.1, 1.1, 0.3] },
      { x: 9.6, y: 1, z: 5.9, spread: [1.1, 0.9, 0.2] },
      { x: -10.7, y: -1.1, z: 6.3, spread: [1.1, 1.3, 0.2] },
      { x: -0.3, y: 0, z: 8.8, spread: [1.1, 4.5, 0.5] },
      { x: 7.9, y: 0, z: 8.4, spread: [1.1, 4.2, 0.5] },
      { x: -11.5, y: 0, z: 8.2, spread: [3.4, 0.8, 0.3] },
    ],
    sinking: [
      { x: 14.6, y: -2.2, z: 6.2, spread: [3.4, 2.8, 0.5] },
      { x: -0.3, y: 0, z: 9.1, spread: [1.1, 3.9, 0.5] },
      { x: -3.4, y: -1.4, z: 4.4, spread: [2, 1.4, 0.3] },
      { x: -10.7, y: -1.1, z: 6.1, spread: [1.1, 1.3, 0.2] },
    ],
  },
  // The bots' ships, from blender-assets/ships/bots/ (y negated, then scaled to the sloop's size): the catch, the
  // little decks and the sail's burning foot of a fishing boat; going down, its side still out of the water
  fishingBoat: {
    burning: [
      { x: -0.9, y: 0, z: 2.7, spread: [3, 2.2, 0.45] },
      { x: -10.5, y: 0, z: 3.9, spread: [1.5, 1.8, 0.3] },
      { x: 12, y: 0, z: 4.4, spread: [1.2, 1.2, 0.3] },
      { x: -0.3, y: -3, z: 9, spread: [3.8, 1.2, 0.75] },
    ],
    sinking: [
      { x: -1.5, y: 3, z: 2.2, spread: [4.5, 1.5, 0.45] },
      { x: -10.5, y: 0, z: 2.8, spread: [1.5, 1.5, 0.3] },
    ],
  },
  // The cargo before the mast, the deckhouse, the boat, the mainsail's and the jib's feet
  merchantSloop: {
    burning: [
      { x: 6.2, y: 0, z: 5.2, spread: [1.8, 2.2, 0.4] },
      { x: -9.6, y: 0, z: 5.1, spread: [1.6, 2, 0.3] },
      { x: -3.5, y: 0, z: 4.1, spread: [2, 2, 0.3] },
      { x: -4, y: -4, z: 9.3, spread: [3.5, 1.5, 0.6] },
      { x: 10, y: -1.2, z: 8, spread: [3, 0.8, 0.6] },
    ],
    sinking: [
      { x: 6, y: 2, z: 3.8, spread: [2.5, 2, 0.4] },
      { x: -9.6, y: 0.5, z: 4.3, spread: [1.5, 1.8, 0.3] },
      { x: -3.5, y: 1.5, z: 3.4, spread: [2, 1.5, 0.3] },
    ],
  },
  // The kegs, the tarpaulin over the cargo, the companionway, the mainsail's and the jib's feet
  smugglerSloop: {
    burning: [
      { x: 6.6, y: 0, z: 4.2, spread: [1.5, 1.8, 0.4] },
      { x: -4.2, y: 0, z: 4.4, spread: [2.5, 2.3, 0.4] },
      { x: -9.4, y: 0, z: 4.2, spread: [1.2, 1.2, 0.3] },
      { x: -4.7, y: -4, z: 9, spread: [3.5, 1.5, 0.6] },
      { x: 10.4, y: -1.1, z: 7.6, spread: [3, 0.8, 0.6] },
    ],
    sinking: [
      { x: 5.7, y: 1.9, z: 3.6, spread: [2.5, 2, 0.4] },
      { x: -4, y: 1.4, z: 3.7, spread: [2.5, 1.5, 0.3] },
      { x: -9.4, y: 0.5, z: 3.8, spread: [1.2, 1.2, 0.3] },
    ],
  },
  // The Baron's ship is the smuggler's stretched (blender-assets/ships/bots/baronBrig/build.py): the same points
  baronBrig: {
    burning: [
      { x: 5.9, y: 0, z: 3.6, spread: [1.35, 1.5, 0.35] },
      { x: -3.8, y: 0, z: 3.8, spread: [2.25, 1.9, 0.35] },
      { x: -8.5, y: 0, z: 3.6, spread: [1.1, 1, 0.25] },
      { x: -4.2, y: -3.3, z: 7.7, spread: [3.15, 1.25, 0.5] },
      { x: 9.35, y: -0.9, z: 6.5, spread: [2.7, 0.65, 0.5] },
    ],
    sinking: [
      { x: 5.1, y: 1.6, z: 3.1, spread: [2.25, 1.65, 0.35] },
      { x: -3.6, y: 1.2, z: 3.2, spread: [2.25, 1.25, 0.25] },
      { x: -8.5, y: 0.4, z: 3.25, spread: [1.1, 1, 0.25] },
    ],
  },
};

// Spawn rates per second for the whole ship, and how particles behave. Sizes and speeds are for the sloop
// (radius 9) and scale with the ship's radius
const REFERENCE_RADIUS = 9;
const FLAMES_PER_SECOND = { burning: 55, sinking: 40 } as const;
const SMOKE_PER_SECOND = { heavy: 2.5, burning: 10, sinking: 14 } as const;
const FLAME_POOL = 160;
const SMOKE_POOL = 140;
const FLAME_LIFE = [0.45, 0.9] as const; // seconds
const SMOKE_LIFE = [2.4, 3.6] as const;
const FLAME_SIZE = [0.7, 1.4] as const; // world units
const SMOKE_SIZE = [1.2, 2] as const;
const FLAME_RISE = 7; // world units per second
const SMOKE_RISE = 5;
// Flames die out as the burning deck goes under water, over this much of the sinking depth (world units)
const FIRE_DROWN_DEPTH = 4;
const SMOKE_GROWTH = 3; // a puff ends this many times bigger than it starts
// Share of the ship's velocity a particle keeps: flames ride along with a sailing ship, smoke lags behind it
const FLAME_DRAG = 1;
const SMOKE_DRAG = 0.5;
// Share of the wind a particle drifts with: flames cling to the burning wood, smoke goes where the wind blows
const FLAME_WIND = 0.25;
const SMOKE_WIND = 1;

// Colors along a flame's life. Each flame is an orange-red body with a yellow core: saturated colors with normal
// blending, because additive light over the pale sail and the blue sea turns white and cyan
const FLAME_COLORS = [0xff9d22, 0xf05a19, 0xb92a16, 0x4f1b12];
const CORE_COLORS = [0xfff0a0, 0xffc93a, 0xff8a1f];
const CORE_SIZE = 0.5; // share of the flame's radius
const CORE_LIFT = 0.25; // the core sits this share of the radius above the body's centre
const SMOKE_DARK = 0x2c2826;
const SMOKE_LIGHT = 0x8f8a84;

function makePool(size: number): Particle[] {
  return Array.from({ length: size }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, maxLife: 1, size: 0 }));
}

// Fire and smoke over a damaged ship. Visual only: the game decides the damage, this just shows it.
// Particles come from fixed pools reused round-robin, so nothing is allocated while it burns
export class ShipFire {
  private readonly flames = makePool(FLAME_POOL);
  private readonly smoke = makePool(SMOKE_POOL);
  private nextFlame = 0;
  private nextSmoke = 0;
  private flameDebt = 0;
  private smokeDebt = 0;

  /** bobPhase: the ship's, see shipBob */
  update(dt: number, ship: BurningShip, stage: DamageStage, pose: SinkPose, time: number, bobPhase = 0) {
    for (const p of this.flames) this.move(p, dt, FLAME_WIND);
    for (const p of this.smoke) this.move(p, dt, SMOKE_WIND);

    const emitters = EMITTERS[ship.shipClass.id];
    if (!emitters) return;
    const scale = ship.radius / REFERENCE_RADIUS;
    const drowning = Math.max(0, 1 - pose.depth / (FIRE_DROWN_DEPTH * scale));
    const afloat = pose.alpha > 0;

    const flameRate =
      stage === 'burning' ? FLAMES_PER_SECOND.burning : stage === 'sinking' ? FLAMES_PER_SECOND.sinking * drowning : 0;
    const smokeRate =
      stage === 'heavy'
        ? SMOKE_PER_SECOND.heavy
        : stage === 'burning'
          ? SMOKE_PER_SECOND.burning
          : stage === 'sinking' && afloat
            ? SMOKE_PER_SECOND.sinking
            : 0;
    const points = stage === 'sinking' ? emitters.sinking : emitters.burning;

    this.flameDebt += flameRate * dt;
    while (this.flameDebt >= 1) {
      this.flameDebt--;
      const p = this.flames[this.nextFlame];
      this.nextFlame = (this.nextFlame + 1) % FLAME_POOL;
      const lift = shipBob(time, bobPhase) - pose.depth;
      this.spawn(p, ship, points, points.length, scale, lift, FLAME_LIFE, FLAME_SIZE, FLAME_RISE, FLAME_DRAG);
    }
    // Smouldering ships smoke from one spot only
    const smokePoints = stage === 'heavy' ? 1 : points.length;
    this.smokeDebt += smokeRate * dt;
    while (this.smokeDebt >= 1) {
      this.smokeDebt--;
      const p = this.smoke[this.nextSmoke];
      this.nextSmoke = (this.nextSmoke + 1) % SMOKE_POOL;
      const lift = shipBob(time, bobPhase) - pose.depth;
      this.spawn(p, ship, points, smokePoints, scale, lift, SMOKE_LIFE, SMOKE_SIZE, SMOKE_RISE, SMOKE_DRAG);
    }
  }

  drawFlames(painter: Painter3D) {
    for (const p of this.flames) {
      if (p.life >= p.maxLife) continue;
      const t = p.life / p.maxLife;
      const radius = p.size * (0.55 + 0.9 * Math.sin(Math.PI * Math.min(1, t * 1.3)));
      const alpha = 0.95 * (1 - t) ** 1.1;
      painter.ball([p.x, p.y, p.z], radius, gradient(FLAME_COLORS, t), alpha);
      // The core burns out first
      if (t < 0.7) {
        const core: Vec3 = [p.x, p.y, p.z + radius * CORE_LIFT];
        painter.ball(core, radius * CORE_SIZE, gradient(CORE_COLORS, t / 0.7), alpha);
      }
    }
  }

  drawSmoke(painter: Painter3D) {
    for (const p of this.smoke) {
      if (p.life >= p.maxLife) continue;
      const t = p.life / p.maxLife;
      const fadeIn = Math.min(1, t * 6);
      const color = gradient([SMOKE_DARK, SMOKE_LIGHT], t);
      painter.ball([p.x, p.y, p.z], p.size * (1 + t * (SMOKE_GROWTH - 1)), color, 0.5 * fadeIn * (1 - t) ** 1.3);
    }
  }

  private move(p: Particle, dt: number, wind: number) {
    if (p.life >= p.maxLife) return;
    p.life += dt;
    p.x += (p.vx + WIND_X * wind) * dt;
    p.y += (p.vy + WIND_Y * wind) * dt;
    p.z += p.vz * dt;
  }

  private spawn(
    p: Particle,
    ship: BurningShip,
    points: readonly Emitter[],
    /** Only the first `count` emitters are used */
    count: number,
    scale: number,
    /** World units the ship is above where it floats: bobbing on the waves, less what it has sunk */
    lift: number,
    life: readonly [number, number],
    size: readonly [number, number],
    rise: number,
    drag: number,
  ) {
    const e = points[Math.floor(Math.random() * count)];
    const lx = (e.x + (Math.random() * 2 - 1) * e.spread[0]) * scale;
    const ly = (e.y + (Math.random() * 2 - 1) * e.spread[1]) * scale;
    const lz = (e.z + (Math.random() * 2 - 1) * e.spread[2]) * scale;
    const cos = Math.cos(ship.rotation);
    const sin = Math.sin(ship.rotation);
    const z = lz + lift;
    // Nothing burns under water
    if (z < 0.3) return;
    p.x = ship.x + lx * cos - ly * sin;
    p.y = ship.y + lx * sin + ly * cos;
    p.z = z;
    p.vx = (Math.random() - 0.5) * 1.5 * scale + cos * ship.speed * drag;
    p.vy = (Math.random() - 0.5) * 1.5 * scale + sin * ship.speed * drag;
    p.vz = rise * scale * (0.7 + Math.random() * 0.6);
    p.life = 0;
    p.maxLife = life[0] + Math.random() * (life[1] - life[0]);
    p.size = (size[0] + Math.random() * (size[1] - size[0])) * scale;
  }
}

/** Color at t (0..1) along evenly spaced stops */
function gradient(stops: readonly number[], t: number) {
  const f = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(f), stops.length - 2);
  const k = f - i;
  const a = stops[i];
  const b = stops[i + 1];
  const r = Math.round(((a >> 16) & 0xff) * (1 - k) + ((b >> 16) & 0xff) * k);
  const g = Math.round(((a >> 8) & 0xff) * (1 - k) + ((b >> 8) & 0xff) * k);
  const bl = Math.round((a & 0xff) * (1 - k) + (b & 0xff) * k);
  return (r << 16) | (g << 8) | bl;
}
