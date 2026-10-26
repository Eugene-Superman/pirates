import type { WeaponId } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

// Fine, faint and dashed: barely there, they never hide the sea. World units
const LOOK = { dash: 7, gap: 7, width: 0.55, alpha: 0.28 };
// The weapon picked: the cannons' rings warm yellow, the harpoons' light blue (pale enough to read on the sea)
const COLORS: Readonly<Record<WeaponId, number>> = { cannon: 0xffd447, harpoon: 0x7fd4ff };
const SPIN = 6; // world units a second the dashes run round: the longest reach's one way, the shortest's the other
// World units: reaches closer than this make one ring
const SAME_REACH = 1;

/**
 * How far the picked weapon's guns reach, on the water round the ship: a ring at the longest gun's reach and one at
 * the shortest (within it every gun fires), whatever reaches lie between; one ring when they are the same. Drawn with
 * the sea
 */
export function drawRangeRings(
  p: Painter3D,
  at: { x: number; y: number },
  reach: { readonly shortest: number; readonly longest: number; readonly weapon: WeaponId },
  time: number,
) {
  const look = { ...LOOK, color: COLORS[reach.weapon] };
  p.dashedRing(at.x, at.y, 0, reach.longest, { ...look, phase: time * SPIN });
  if (reach.longest - reach.shortest >= SAME_REACH) {
    p.dashedRing(at.x, at.y, 0, reach.shortest, { ...look, phase: -time * SPIN });
  }
}
