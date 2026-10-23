import type { Ship } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

// A soft, wide band of colour under a thin line: it reads on the sea without hiding it
const BAND = { width: 6, alpha: 0.08 }; // world units
const LINE = { width: 1.1, alpha: 0.3 }; // world units

/** How far a weapon reaches: a faint solid ring on the water around the ship. Drawn with the sea */
export function drawRangeRing(p: Painter3D, ship: Ship, range: number, color: number) {
  p.ring(ship.x, ship.y, 0, range, BAND.width, color, BAND.alpha);
  p.ring(ship.x, ship.y, 0, range, LINE.width, color, LINE.alpha);
}
