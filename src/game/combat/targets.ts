import { normalizeAngle } from '../lib/math';
import type { Hull } from '../physics/hull';
import type { TargetNature } from './weapons';

export type TargetKind = 'barrel' | 'boat' | 'serpent';

/** Seconds a destroyed practice target stays gone before it comes back whole */
export const RESPAWN_TIME = 8;

/**
 * A fixed path a moving target follows forever, so the server and every client agree on where it is from the game
 * time alone: round a circle, or a figure of eight (a lemniscate of Gerono, `radius` wide and half as high, crossing
 * itself at the centre)
 */
export interface TargetPath {
  readonly shape: 'circle' | 'eight';
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  /** Radians per second of the path's angle; the sign picks the direction */
  readonly speed: number;
  /** The path's angle at time 0, radians */
  readonly phase: number;
}

/** Something to shoot at. For now practice targets near the start: a barrel, a boat and a sea serpent */
export interface Target {
  readonly id: number;
  readonly kind: TargetKind;
  /** Creatures take full damage from harpoons, objects from cannons (`damageShare`) */
  readonly nature: TargetNature;
  x: number;
  y: number;
  /** Direction it faces, radians (0 = east, like ship rotation) */
  heading: number;
  /** Hit circle, world units */
  readonly radius: number;
  /** What ships collide with and steer around, world units from its position, x along its heading */
  readonly hull: Hull;
  /** Velocity, world units per second */
  vx: number;
  vy: number;
  /** How far it sticks out of the water, world units; shots fly at half of it */
  readonly height: number;
  /** null for a target that stays where it is */
  readonly path: TargetPath | null;
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

// Relative to the ship's start. The barrel is inside cannon range and outside harpoon range; the boat's circle
// passes in and out of both; the serpent swims a figure of eight on the other side. All stay on screen at the default
// zoom, and within the open water kept round the start
const BARREL = { x: 150, y: 110, radius: 2.6, height: 5, hp: 50 };
const BOAT = { centerX: -60, centerY: 160, radius: 9, height: 4, hp: 120, path: 90, speed: 0.35 };
const SERPENT = { centerX: 170, centerY: -190, radius: 12, height: 8, hp: 150, path: 120, speed: 0.3 };
const BARREL_HULL: Hull = { bow: BARREL.radius, stern: -BARREL.radius, halfBeam: BARREL.radius };
// The boat's deck outline (models/targetBoat3d.ts in the client): 18.8 long, 8.2 wide
const BOAT_HULL: Hull = { bow: 10, stern: -8.8, halfBeam: 4.1 };
// The serpent's body, about 42 long (models/serpent3d.ts): its position is the middle of it, the head ahead
const SERPENT_HULL: Hull = { bow: 21, stern: -21, halfBeam: 4 };

export function createTargets(startX: number, startY: number): Target[] {
  const targets: Target[] = [
    {
      id: 1,
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
      path: null,
      maxHp: BARREL.hp,
      hp: BARREL.hp,
      respawnAt: null,
    },
    {
      id: 2,
      kind: 'boat',
      nature: 'object',
      x: 0,
      y: 0,
      heading: 0,
      radius: BOAT.radius,
      hull: BOAT_HULL,
      vx: 0,
      vy: 0,
      height: BOAT.height,
      path: {
        shape: 'circle',
        centerX: startX + BOAT.centerX,
        centerY: startY + BOAT.centerY,
        radius: BOAT.path,
        speed: BOAT.speed,
        phase: 0,
      },
      maxHp: BOAT.hp,
      hp: BOAT.hp,
      respawnAt: null,
    },
    {
      id: 3,
      kind: 'serpent',
      nature: 'creature',
      x: 0,
      y: 0,
      heading: 0,
      radius: SERPENT.radius,
      hull: SERPENT_HULL,
      vx: 0,
      vy: 0,
      height: SERPENT.height,
      path: {
        shape: 'eight',
        centerX: startX + SERPENT.centerX,
        centerY: startY + SERPENT.centerY,
        radius: SERPENT.path,
        speed: SERPENT.speed,
        phase: 0,
      },
      maxHp: SERPENT.hp,
      hp: SERPENT.hp,
      respawnAt: null,
    },
  ];
  moveTargets(targets, 0);
  return targets;
}

/** Where a path is at `time`, seconds since the start, and how fast it goes there */
export function pathPoint(path: TargetPath, time: number) {
  const { centerX, centerY, radius, speed } = path;
  const angle = path.phase + speed * time;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  if (path.shape === 'circle') {
    return {
      x: centerX + cos * radius,
      y: centerY + sin * radius,
      vx: -sin * radius * speed,
      vy: cos * radius * speed,
    };
  }
  return {
    x: centerX + sin * radius,
    y: centerY + sin * cos * radius,
    vx: cos * radius * speed,
    vy: (cos * cos - sin * sin) * radius * speed,
  };
}

/** Puts moving targets where they are at `time`, seconds since the start, facing the way they go */
export function moveTargets(targets: readonly Target[], time: number) {
  for (const t of targets) {
    if (!t.path) continue;
    const p = pathPoint(t.path, time);
    t.x = p.x;
    t.y = p.y;
    t.vx = p.vx;
    t.vy = p.vy;
    t.heading = normalizeAngle(Math.atan2(p.vy, p.vx));
  }
}

/** Brings destroyed targets back, whole, once their time is up */
export function reviveTargets(targets: readonly Target[], time: number) {
  for (const t of targets) {
    if (t.respawnAt === null || time < t.respawnAt) continue;
    t.respawnAt = null;
    t.hp = t.maxHp;
  }
}
