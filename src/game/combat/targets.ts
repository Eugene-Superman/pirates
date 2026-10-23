import { normalizeAngle } from '../lib/math';
import type { Hull } from '../physics/hull';

export type TargetKind = 'barrel' | 'boat';

/** A circle a moving target sails round, forever and always the same, so the server and clients agree on it */
export interface Orbit {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  /** Radians per second; the sign picks the direction */
  readonly speed: number;
  /** Where on the circle it is at time 0, radians */
  readonly phase: number;
}

/** Something to shoot at. For now practice targets near the start: a floating barrel and a boat sailing in circles */
export interface Target {
  readonly id: number;
  readonly kind: TargetKind;
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
  readonly orbit: Orbit | null;
  hits: number;
}

// Relative to the ship's start. The barrel is inside cannon range and outside harpoon range; the boat's circle
// passes in and out of both, and stays on screen at the default zoom
const BARREL = { x: 150, y: 110, radius: 2.6, height: 5 };
const BOAT = { centerX: -60, centerY: 160, orbitRadius: 90, speed: 0.35, radius: 9, height: 4 };
const BARREL_HULL: Hull = { bow: BARREL.radius, stern: -BARREL.radius, halfBeam: BARREL.radius };
// The boat's deck outline (models/targetBoat3d.ts in the client): 18.8 long, 8.2 wide
const BOAT_HULL: Hull = { bow: 10, stern: -8.8, halfBeam: 4.1 };

export function createTargets(startX: number, startY: number): Target[] {
  const targets: Target[] = [
    {
      id: 1,
      kind: 'barrel',
      x: startX + BARREL.x,
      y: startY + BARREL.y,
      heading: 0,
      radius: BARREL.radius,
      hull: BARREL_HULL,
      vx: 0,
      vy: 0,
      height: BARREL.height,
      orbit: null,
      hits: 0,
    },
    {
      id: 2,
      kind: 'boat',
      x: 0,
      y: 0,
      heading: 0,
      radius: BOAT.radius,
      hull: BOAT_HULL,
      vx: 0,
      vy: 0,
      height: BOAT.height,
      orbit: {
        centerX: startX + BOAT.centerX,
        centerY: startY + BOAT.centerY,
        radius: BOAT.orbitRadius,
        speed: BOAT.speed,
        phase: 0,
      },
      hits: 0,
    },
  ];
  moveTargets(targets, 0);
  return targets;
}

/** Puts moving targets where they are at `time`, seconds since the start */
export function moveTargets(targets: readonly Target[], time: number) {
  for (const t of targets) {
    if (!t.orbit) continue;
    const { centerX, centerY, radius, speed, phase } = t.orbit;
    const angle = phase + speed * time;
    t.x = centerX + Math.cos(angle) * radius;
    t.y = centerY + Math.sin(angle) * radius;
    t.vx = -Math.sin(angle) * radius * speed;
    t.vy = Math.cos(angle) * radius * speed;
    // Along the circle, in the direction it goes round
    t.heading = normalizeAngle(angle + (speed >= 0 ? Math.PI / 2 : -Math.PI / 2));
  }
}
