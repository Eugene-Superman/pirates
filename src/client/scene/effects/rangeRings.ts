import type { Painter3D } from '../../render/Painter3D';

// A soft, wide band of colour under a thin line: it reads on the sea without hiding it
const BAND = { width: 6, alpha: 0.08 }; // world units
const LINE = { width: 1.1, alpha: 0.3 }; // world units
const INNER_LINE = { width: 0.9, alpha: 0.22 }; // world units: the edge of the full volley
// The water barely tinted: where every gun reaches (a full volley) a little more than where only the longer ones do
const FILL = { full: 0.065, part: 0.03 };
// World units: guns whose reaches differ by less than this make one ring
const SAME_REACH = 1;

/**
 * How far a weapon's guns reach, on the water round the ship: within `full` every gun fires (the most damage), out to
 * `longest` only the guns that reach that far. A ring at each, the water inside them faintly tinted. Drawn with the sea
 */
export function drawRangeRings(
  p: Painter3D,
  at: { x: number; y: number },
  full: number,
  longest: number,
  color: number,
) {
  p.disc(at.x, at.y, 0, full, color, FILL.full);
  if (longest - full >= SAME_REACH) {
    p.ring(at.x, at.y, 0, (full + longest) / 2, longest - full, color, FILL.part);
    p.ring(at.x, at.y, 0, full, INNER_LINE.width, color, INNER_LINE.alpha);
  }
  p.ring(at.x, at.y, 0, longest, BAND.width, color, BAND.alpha);
  p.ring(at.x, at.y, 0, longest, LINE.width, color, LINE.alpha);
}
