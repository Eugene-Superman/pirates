import type { Target } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = {
  hull: 0x8f5d35,
  deck: 0xb0814f,
  stripe: 0xe8dcc0,
  mast: 0x5e4126,
  boardWhite: 0xf4efe3,
  boardRed: 0xd23a2c,
  foam: 0xffffff,
};
// prettier-ignore
// Deck outline seen from above, boat coordinates (x to the bow, y to starboard), world units: about 19 long
const OUTLINE: readonly [number, number][] = [
  [10, 0], [7, 3.2], [1.5, 4.1], [-5.5, 3.8], [-8.8, 2.7], [-8.8, -2.7], [-5.5, -3.8], [1.5, -4.1], [7, -3.2],
];
const KEEL_SHARE = 0.75; // the hull narrows to this share of the deck at the waterline
const DECK_Z = 2.2; // world units above the water
const STRIPE_Z = 1.5;
const MAST_X = 0.8;
const MAST_HEIGHT = 13;
const BOARD_Z = 9; // height of the target board's centre
const BOARD_RINGS = [3.4, 2.55, 1.7, 0.85]; // radii, alternating white and red from the outside
const ROCK = 0.05; // radians it rolls on the waves
const SHAKE = 0.3; // radians it rolls when hit, dying out over the shake
const BOB = 0.35; // world units

/** Bow wave and a short wake on the water. Drawn with the sea */
export function drawTargetBoatWater(p: Painter3D, target: Target) {
  const { x, y, heading } = target;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const at = (lx: number, ly: number): Vec3 => [x + lx * cos - ly * sin, y + lx * sin + ly * cos, 0];
  // Two foam lines spreading back from the stern corners, and a bow wave
  p.line(at(-8, 2.8), at(-18, 6.5), 0.9, COLORS.foam, 0.25);
  p.line(at(-8, -2.8), at(-18, -6.5), 0.9, COLORS.foam, 0.25);
  p.line(at(10, 0), at(6.5, 4), 0.8, COLORS.foam, 0.45);
  p.line(at(10, 0), at(6.5, -4), 0.8, COLORS.foam, 0.45);
}

/** A small boat with a round target board on its mast. shake: 1 right after a hit, then 0 */
export function drawTargetBoat(p: Painter3D, target: Target, time: number, shake: number) {
  const { x, y, heading } = target;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const roll = ROCK * Math.sin(time * 1.4 + target.id) + SHAKE * shake * Math.sin(shake * 16);
  const lift = BOB * Math.sin(time * 1.9 + target.id);
  // Boat coordinates → world: roll around the keel line, turn by heading, bob
  const at = (lx: number, ly: number, lz: number): Vec3 => {
    const ry = ly - lz * roll;
    return [x + lx * cos - ry * sin, y + lx * sin + ry * cos, lz + ly * roll + lift];
  };
  const outline = (scale: number, z: number) => OUTLINE.map(([lx, ly]) => at(lx * scale, ly * scale, z));

  const deck = outline(1, DECK_Z);
  p.top(deck, COLORS.deck);
  p.sides(outline(KEEL_SHARE, -0.2), outline(0.93, STRIPE_Z), COLORS.hull);
  p.sides(outline(0.93, STRIPE_Z), outline(0.97, STRIPE_Z + 0.25), COLORS.stripe);
  p.sides(outline(0.97, STRIPE_Z + 0.25), deck, COLORS.hull);

  p.line(at(MAST_X, 0, DECK_Z), at(MAST_X, 0, DECK_Z + MAST_HEIGHT), 0.6, COLORS.mast);
  // The board always faces the camera, like a sign: a board fixed across the boat would turn edge-on
  const board = at(MAST_X, 0, BOARD_Z);
  BOARD_RINGS.forEach((r, i) => p.ball(board, r, i % 2 === 0 ? COLORS.boardWhite : COLORS.boardRed));
}
