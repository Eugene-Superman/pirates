import type { Hull } from '../physics/hull';
import type { TargetNature } from './weapons';

export type TargetKind = 'barrel';

/** Seconds a destroyed practice target stays gone before it comes back whole */
export const RESPAWN_TIME = 8;

/**
 * Something to practise shooting at that stays where it is and never fires back: a barrel near the start. Ships and
 * sea monsters, the bots among them, are `Ship`s
 */
export interface Target {
  /** Unique among the ships and targets of the game */
  readonly id: number;
  readonly kind: TargetKind;
  /** Creatures take full damage from harpoons, objects from cannons (`damageShare`) */
  readonly nature: TargetNature;
  readonly x: number;
  readonly y: number;
  /** Direction it faces, radians (0 = east, like ship rotation) */
  readonly heading: number;
  /** Hit circle, world units */
  readonly radius: number;
  /** What ships collide with and steer around, world units from its position, x along its heading */
  readonly hull: Hull;
  /** It floats where it is: no velocity, but every Body has one */
  readonly vx: number;
  readonly vy: number;
  /** How far it sticks out of the water, world units; shots fly at half of it */
  readonly height: number;
  readonly maxHp: number;
  /** Hit points left; at 0 it is destroyed */
  hp: number;
  /** Game time a destroyed target comes back with full hp; null while it is afloat */
  respawnAt: number | null;
}

/** Afloat: it can be seen, shot at and bumped into. A destroyed target is gone until it respawns */
export function isAlive(target: Target) {
  return target.respawnAt === null;
}

// Relative to the ship's start: inside cannon range and outside harpoon range, within the open water kept round it
const BARREL = { x: 150, y: 110, radius: 2.6, height: 5, hp: 50 };
const BARREL_HULL: Hull = { bow: BARREL.radius, stern: -BARREL.radius, halfBeam: BARREL.radius };

/** The practice targets near the start; `id` gives each its own */
export function createTargets(startX: number, startY: number, id: () => number): Target[] {
  return [
    {
      id: id(),
      kind: 'barrel',
      nature: 'object',
      x: startX + BARREL.x,
      y: startY + BARREL.y,
      heading: 0,
      radius: BARREL.radius,
      hull: BARREL_HULL,
      vx: 0,
      vy: 0,
      height: BARREL.height,
      maxHp: BARREL.hp,
      hp: BARREL.hp,
      respawnAt: null,
    },
  ];
}

/** Brings destroyed targets back, whole, once their time is up */
export function reviveTargets(targets: readonly Target[], time: number) {
  for (const t of targets) {
    if (t.respawnAt === null || time < t.respawnAt) continue;
    t.respawnAt = null;
    t.hp = t.maxHp;
  }
}
