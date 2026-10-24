import type { GameState } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

const LIFE = 2.6; // seconds the whole burst lasts
const RINGS = [0, 0.3, 0.6] as const; // seconds after the level each ring starts spreading
const RING_LIFE = 1.3; // seconds a ring spreads
const RING_REACH = 5; // ship's radii a ring spreads to
const GLOW_REACH = 2.2; // ship's radii the glow on the water round the ship reaches
const PILLAR = { height: 95, rise: 0.3, from: 0.45 } as const; // world units; seconds to rise; share of LIFE it fades from
// The pillar of light, a few lines on top of each other: wide and faint outside, narrow and bright in the middle
const PILLAR_LAYERS = [
  { width: 26, alpha: 0.08 },
  { width: 14, alpha: 0.14 },
  { width: 6, alpha: 0.3 },
  { width: 2.5, alpha: 0.6 },
] as const;
const SPARKS = 48; // sparks a level sends up round the ship
const SPARK_LIFE = [1.1, 1.9] as const; // seconds
const SPARK_RISE = [18, 34] as const; // world units per second
const SPARK_SPIN = 2.2; // radians per second they wind round the ship as they rise
const SPARK_SIZE = 1.5; // world units
const FLASH = { time: 0.5, reach: 2.6, alpha: 0.55 } as const; // a bright flash round the ship at the start
const COLORS = { ring: 0xffd34d, glow: 0xffc94a, pillar: 0xfff0b3, spark: 0xffe27a, halo: 0xfff6cc } as const;

/** A spark winding up round the ship, which it sails with */
interface Spark {
  /** Seconds before it starts, and since */
  delay: number;
  age: number;
  life: number;
  angle: number;
  distance: number;
  rise: number;
}

interface Burst {
  shipId: number;
  x: number;
  y: number;
  radius: number;
  height: number;
  /** Seconds since the level was reached */
  age: number;
  readonly sparks: Spark[];
}

/**
 * A level reached: a flash round the ship, golden rings spreading over the water, the water round it glowing, a
 * pillar of light rising off its deck and sparks winding up round it, while "Level N!" floats up over it
 * (DamageNumbers). For the player's own ship, the only one with levels; it goes with the ship if it sails on. One
 * burst at a time: a second level at once starts it again
 */
export class LevelUpEffect {
  private readonly burst: Burst = {
    shipId: -1,
    x: 0,
    y: 0,
    radius: 0,
    height: 0,
    age: LIFE,
    sparks: Array.from({ length: SPARKS }, () => ({ delay: 0, age: 0, life: 1, angle: 0, distance: 0, rise: 0 })),
  };

  update(dt: number, state: GameState) {
    const b = this.burst;
    for (const event of state.events) {
      if (event.type !== 'level' || event.shipId !== state.ship.id) continue;
      b.shipId = event.shipId;
      b.radius = state.ship.radius;
      b.height = state.ship.height;
      b.age = 0;
      // Cosmetic, so Math.random is fine here
      for (const s of b.sparks) {
        s.delay = Math.random() * 0.7;
        s.age = 0;
        s.life = SPARK_LIFE[0] + Math.random() * (SPARK_LIFE[1] - SPARK_LIFE[0]);
        s.angle = Math.random() * Math.PI * 2;
        s.distance = b.radius * (0.5 + Math.random() * 0.8);
        s.rise = SPARK_RISE[0] + Math.random() * (SPARK_RISE[1] - SPARK_RISE[0]);
      }
    }
    if (b.age >= LIFE) return;
    b.age += dt;
    const ship = state.ships.find((s) => s.id === b.shipId);
    if (ship) {
      b.x = ship.x;
      b.y = ship.y;
    }
    for (const s of b.sparks) {
      if (b.age < s.delay) continue;
      s.age += dt;
    }
  }

  /** The rings and the glow on the water. Drawn with the sea */
  drawWater(p: Painter3D) {
    const b = this.burst;
    if (b.age >= LIFE) return;
    const fade = 1 - b.age / LIFE;
    p.disc(b.x, b.y, 0, b.radius * GLOW_REACH, COLORS.glow, 0.28 * fade * Math.min(1, b.age * 5));
    for (const start of RINGS) {
      const t = (b.age - start) / RING_LIFE;
      if (t < 0 || t >= 1) continue;
      const radius = b.radius * (0.6 + (RING_REACH - 0.6) * (1 - (1 - t) ** 2));
      p.ring(b.x, b.y, 0, radius, 3.5 * (1 - t) + 0.8, COLORS.ring, 0.9 * (1 - t));
    }
  }

  /** The pillar and the sparks, over the ship */
  draw(p: Painter3D) {
    const b = this.burst;
    if (b.age >= LIFE) return;
    const t = b.age / LIFE;
    const grown = Math.min(1, b.age / PILLAR.rise);
    const fade = t < PILLAR.from ? 1 : 1 - (t - PILLAR.from) / (1 - PILLAR.from);
    const top = b.height + PILLAR.height * (1 - (1 - grown) ** 2);
    if (b.age < FLASH.time) {
      const k = b.age / FLASH.time;
      p.ball([b.x, b.y, b.height * 0.7], b.radius * FLASH.reach * (0.6 + 0.4 * k), COLORS.halo, FLASH.alpha * (1 - k));
    }
    for (const { width, alpha } of PILLAR_LAYERS) {
      p.line([b.x, b.y, b.height * 0.5], [b.x, b.y, top], width, COLORS.pillar, alpha * fade);
    }
    for (const s of b.sparks) {
      if (s.age <= 0 || s.age >= s.life) continue;
      const k = s.age / s.life;
      const angle = s.angle + SPARK_SPIN * s.age;
      const x = b.x + Math.cos(angle) * s.distance * (1 - 0.4 * k);
      const y = b.y + Math.sin(angle) * s.distance * (1 - 0.4 * k);
      const z = b.height * 0.6 + s.rise * s.age;
      const alpha = Math.min(1, k * 8) * (1 - k);
      p.ball([x, y, z], SPARK_SIZE * 2.6, COLORS.halo, alpha * 0.3);
      p.ball([x, y, z], SPARK_SIZE * (1 - 0.4 * k), COLORS.spark, alpha);
    }
  }
}
