import type { GameState } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

const POOL = 60; // crosses rising at once at most; the oldest is reused
const RINGS = 4;
const RATE = 12; // crosses per second round a ship under repair
const LIFE = [0.9, 1.4] as const; // seconds a cross rises
const RISE = [7, 12] as const; // world units per second
const SIZE = 1.5; // world units: half the cross's arm
const WIDTH = 0.7; // world units
const DECK = 4; // world units above the water they start at
const RING_LIFE = 0.9; // seconds a ring spreads at every repair step
const RING_REACH = 2.2; // the ring spreads to this many of the ship's radii
const COLORS = { cross: 0x7dff8a, glow: 0xd9ffc2, ring: 0x9dffb0 };

/** A cross rising off a ship's deck: it sails with the ship, so it keeps its place on the deck */
interface Cross {
  shipId: number;
  /** Ship coordinates: x to the bow, y to starboard */
  along: number;
  across: number;
  /** Where it is now, world coordinates */
  x: number;
  y: number;
  z: number;
  vz: number;
  life: number;
  maxLife: number;
}

/** A ring spreading round a ship at a repair step, centred on the ship as it sails */
interface Ring {
  shipId: number;
  x: number;
  y: number;
  radius: number;
  life: number;
}

/**
 * A ship under repair: green crosses rise off its deck while the crew works, and every repair step sends a green ring
 * over the water round it (its number floats up over it, DamageNumbers). Both go with the ship: it may sail on while
 * it is repaired. Fixed pools reused round-robin
 */
export class RepairEffect {
  private readonly crosses: Cross[] = Array.from({ length: POOL }, () => ({
    shipId: -1,
    along: 0,
    across: 0,
    x: 0,
    y: 0,
    z: 0,
    vz: 0,
    life: 1,
    maxLife: 1,
  }));
  private readonly rings: Ring[] = Array.from({ length: RINGS }, () => ({
    shipId: -1,
    x: 0,
    y: 0,
    radius: 0,
    life: RING_LIFE,
  }));
  private next = 0;
  private nextRing = 0;
  private debt = 0;

  update(dt: number, state: GameState) {
    // Only what the player can see: their own ship, for now the only one that repairs
    const repairing = state.ships.filter((s) => s.repairing && state.ship.canSee(s.x, s.y));
    this.debt += RATE * dt * repairing.length;
    while (this.debt >= 1 && repairing.length > 0) {
      this.debt--;
      // Cosmetic, so Math.random is fine here
      const ship = repairing[Math.floor(Math.random() * repairing.length)];
      const c = this.crosses[this.next];
      this.next = (this.next + 1) % POOL;
      c.shipId = ship.id;
      c.along = (Math.random() * 2 - 1) * ship.hull.bow * 0.8;
      c.across = (Math.random() * 2 - 1) * ship.hull.halfBeam;
      c.z = DECK + Math.random() * 2;
      c.vz = RISE[0] + Math.random() * (RISE[1] - RISE[0]);
      c.life = 0;
      c.maxLife = LIFE[0] + Math.random() * (LIFE[1] - LIFE[0]);
    }
    if (repairing.length === 0) this.debt = 0;

    for (const event of state.events) {
      if (event.type !== 'repair') continue;
      const ship = state.ships.find((s) => s.id === event.shipId);
      if (!ship || !state.ship.canSee(ship.x, ship.y)) continue;
      const r = this.rings[this.nextRing];
      this.nextRing = (this.nextRing + 1) % RINGS;
      r.shipId = ship.id;
      r.radius = ship.radius * RING_REACH;
      r.life = 0;
    }

    for (const c of this.crosses) {
      if (c.life >= c.maxLife) continue;
      c.life += dt;
      c.z += c.vz * dt;
      // Gone (sunk, out of the game): the cross stays where it last was
      const ship = state.ships.find((s) => s.id === c.shipId);
      if (!ship) continue;
      const cos = Math.cos(ship.rotation);
      const sin = Math.sin(ship.rotation);
      c.x = ship.x + cos * c.along - sin * c.across;
      c.y = ship.y + sin * c.along + cos * c.across;
    }
    for (const r of this.rings) {
      if (r.life >= RING_LIFE) continue;
      r.life += dt;
      const ship = state.ships.find((s) => s.id === r.shipId);
      if (!ship) continue;
      r.x = ship.x;
      r.y = ship.y;
    }
  }

  /** The rings on the water. Drawn with the sea */
  drawWater(p: Painter3D) {
    for (const r of this.rings) {
      if (r.life >= RING_LIFE) continue;
      const t = r.life / RING_LIFE;
      p.ring(r.x, r.y, 0, r.radius * (0.4 + 0.6 * (1 - (1 - t) ** 2)), 1.2 * (1 - t) + 0.3, COLORS.ring, 0.8 * (1 - t));
    }
  }

  /** The crosses: an upright "+" each, facing the camera, over a soft glow */
  draw(p: Painter3D) {
    const { rightX, rightY } = p.camera;
    for (const c of this.crosses) {
      if (c.life >= c.maxLife) continue;
      const t = c.life / c.maxLife;
      const alpha = Math.min(1, t * 6) * (1 - t);
      const s = SIZE * (1 - 0.3 * t);
      p.ball([c.x, c.y, c.z], s * 1.6, COLORS.glow, alpha * 0.25);
      p.line(
        [c.x - rightX * s, c.y - rightY * s, c.z],
        [c.x + rightX * s, c.y + rightY * s, c.z],
        WIDTH,
        COLORS.cross,
        alpha,
      );
      p.line([c.x, c.y, c.z - s], [c.x, c.y, c.z + s], WIDTH, COLORS.cross, alpha);
    }
  }
}
