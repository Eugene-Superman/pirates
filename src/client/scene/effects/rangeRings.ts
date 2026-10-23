import type { Ship } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

const DASHES = 36; // around the whole ring
const DASH_WIDTH = 1.3; // world units
const DRIFT = 0.04; // radians per second: the dashes creep round so the ring reads as a live indicator
const ALPHA = 0.8;

/** How far a weapon reaches: a dashed ring on the water around the ship. Drawn with the sea */
export function drawRangeRing(p: Painter3D, ship: Ship, range: number, color: number, time: number) {
  p.dashedRing(ship.x, ship.y, 0, range, DASHES, time * DRIFT, DASH_WIDTH, color, ALPHA);
}
