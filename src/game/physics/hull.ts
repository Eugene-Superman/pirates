import type { Segment } from '../lib/geometry';

/**
 * A body's outline on the water: a capsule along its heading, like a hull seen from above. `bow` and `stern` are how
 * far it reaches forward and back from the body's position (stern negative), `halfBeam` how far to each side.
 * The capsule is the segment between the bow and stern circles, widened by halfBeam; bow = −stern = halfBeam is a circle
 */
export interface Hull {
  readonly bow: number;
  readonly stern: number;
  readonly halfBeam: number;
}

/** Anything that takes up room on the water and that ships must not sail through */
export interface Body {
  readonly x: number;
  readonly y: number;
  /** Radians, 0 = east */
  readonly heading: number;
  readonly hull: Hull;
  /** Velocity, world units per second */
  readonly vx: number;
  readonly vy: number;
}

/** The capsule's middle line in world coordinates: every point of the hull is within halfBeam of it */
export function hullAxis(x: number, y: number, heading: number, hull: Hull): Segment {
  let front = hull.bow - hull.halfBeam;
  let back = hull.stern + hull.halfBeam;
  if (front < back) front = back = (front + back) / 2;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return { ax: x + cos * back, ay: y + sin * back, bx: x + cos * front, by: y + sin * front };
}

export function bodyAxis(body: Body): Segment {
  return hullAxis(body.x, body.y, body.heading, body.hull);
}

/** How far the hull reaches from the body's position at most: a circle this big holds it whatever the heading */
export function hullReach(hull: Hull) {
  return Math.max(hull.bow, -hull.stern, hull.halfBeam);
}

/** How heavy the body is when two of them push each other apart: its area, roughly */
export function hullMass(hull: Hull) {
  return Math.max(hull.bow - hull.stern, 2 * hull.halfBeam) * hull.halfBeam;
}
