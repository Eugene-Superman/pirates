import type { ShipClassId } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import type { ShipPose } from './botShip3d';

// The seas' new monsters, as simple as can be until they are modelled: a body of rings, a few limbs, eyes
const COLORS = {
  crab: 0xc0502e,
  crabDark: 0x8a3218,
  claw: 0xd8693e,
  shark: 0x6f7f8c,
  sharkBelly: 0xdfe6ea,
  fin: 0x56646f,
  kraken: 0x7a2f5c,
  krakenDark: 0x4e1a3a,
  sucker: 0xe9b8cf,
  eye: 0x101010,
  eyeGlow: 0xffd447,
  underwater: 0x0a2a35,
  foam: 0xffffff,
};
const SEGMENTS = 14; // sides of a body's rings
const BOB = 0.3; // world units
const SHAKE = 0.25; // radians it rocks when hit
const UNDERWATER_ALPHA = 0.3;

type MonsterId = Extract<ShipClassId, 'giantCrab' | 'shark' | 'kraken'>;

/** How high each stands out of the water, world units: its hit point bar goes over it */
const TOPS: Readonly<Record<MonsterId, number>> = { giantCrab: 6, shark: 7, kraken: 12 };
// The body's footprint on the water: half its length and half its width, world units
const BODIES: Readonly<Record<MonsterId, { readonly length: number; readonly width: number }>> = {
  giantCrab: { length: 7, width: 9 },
  shark: { length: 12, width: 3.6 },
  kraken: { length: 14, width: 14 },
};
// Each body's rings from the water up: its height (world units) and its share of the body's footprint
const DOMES: Readonly<Record<MonsterId, readonly (readonly [number, number])[]>> = {
  giantCrab: [
    [0, 1],
    [1.8, 0.95],
    [3, 0.7],
    [3.6, 0.35],
  ],
  shark: [
    [0, 1],
    [1, 0.95],
    [2, 0.7],
    [2.5, 0.35],
  ],
  kraken: [
    [0, 1],
    [3, 0.95],
    [6, 0.8],
    [9, 0.55],
    [11, 0.25],
  ],
};

type At = (lx: number, ly: number, lz: number) => Vec3;

function frame(m: ShipPose, time: number, shake: number, sink: number): At {
  const cos = Math.cos(m.heading);
  const sin = Math.sin(m.heading);
  const roll = SHAKE * shake * Math.sin(shake * 16);
  const lift = BOB * Math.sin(time * 1.3 + m.id) - sink;
  return (lx, ly, lz) => {
    const ry = ly - lz * roll;
    return [m.x + lx * cos - ry * sin, m.y + lx * sin + ry * cos, Math.max(0, lz + ly * roll + lift)];
  };
}

/** An ellipse round (cx, 0) at height z: half `length` along the heading, half `width` across */
function ring(at: At, cx: number, length: number, width: number, z: number) {
  return Array.from({ length: SEGMENTS }, (_, i) => {
    const a = (i / SEGMENTS) * Math.PI * 2;
    return at(cx + Math.cos(a) * length, Math.sin(a) * width, z);
  });
}

/** A dome of rings from the water up: (height, share of the outline) each, its top filled */
function dome(
  p: Painter3D,
  at: At,
  cx: number,
  length: number,
  width: number,
  levels: readonly (readonly [number, number])[],
  color: number,
  dark: number,
) {
  const rings = levels.map(([z, share]) => ring(at, cx, length * share, width * share, z));
  p.sides(rings[0], rings[1], dark);
  for (let i = 1; i < rings.length - 1; i++) p.sides(rings[i], rings[i + 1], color);
  p.top(rings[rings.length - 1], color);
}

export function isMonsterModel(classId: ShipClassId): classId is MonsterId {
  return classId in TOPS;
}

/** How high a new monster stands, world units; undefined for any other class */
export function monsterTop(classId: ShipClassId) {
  return isMonsterModel(classId) ? TOPS[classId] : undefined;
}

/** The body under the water, seen through it, and a ring of foam round it. Drawn with the sea */
export function drawMonsterWater(p: Painter3D, m: ShipPose, classId: MonsterId, time: number) {
  const { length, width } = BODIES[classId];
  const at = frame(m, time, 0, 0);
  p.polygon(ring(at, 0, length * 1.2, width * 1.2, 0), COLORS.underwater, UNDERWATER_ALPHA);
  const [x, y] = at(0, 0, 0);
  p.ring(x, y, 0, Math.max(length, width) * 0.9, 0.6, COLORS.foam, 0.3 + 0.1 * Math.sin(time * 2 + m.id));
}

/**
 * One of the seas' new monsters, vector-drawn: a crab with its claws, a shark with its fin and tail, a kraken with its
 * arms. shake: 1 right after a hit, then 0; lunge: 1 right after a bite; sink: world units it has gone down
 */
export function drawMonster(
  p: Painter3D,
  m: ShipPose,
  classId: MonsterId,
  time: number,
  shake: number,
  lunge: number,
  sink = 0,
) {
  const at = frame(m, time, shake, sink);
  if (classId === 'giantCrab') drawCrab(p, at, time + m.id, lunge);
  else if (classId === 'shark') drawShark(p, at, time + m.id, lunge);
  else drawKraken(p, at, time + m.id, lunge);
}

function drawCrab(p: Painter3D, at: At, phase: number, lunge: number) {
  const { length, width } = BODIES.giantCrab;
  // Legs out to the sides, stepping by turns
  for (const side of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const lx = -3 + i * 2.6;
      const step = Math.sin(phase * 4 + i * 2 + (side > 0 ? 0 : Math.PI)) * 1.2;
      p.line(at(lx, side * width * 0.8, 1.4), at(lx + step, side * (width + 4), 0.2), 0.9, COLORS.crabDark);
    }
  }
  dome(p, at, 0, length, width, DOMES.giantCrab, COLORS.crab, COLORS.crabDark);
  // Claws ahead, snapping forward with a bite
  const reach = 8 + 3 * lunge;
  for (const side of [1, -1]) {
    const elbow = at(length - 1, side * 5, 2);
    const claw = at(reach, side * 3.4, 2.2);
    p.line(at(length - 2, side * 4, 1.8), elbow, 1.4, COLORS.claw);
    p.line(elbow, claw, 1.6, COLORS.claw);
    p.ball(claw, 2, COLORS.claw);
  }
  for (const side of [1, -1]) p.ball(at(length - 0.5, side * 1.6, 4.2), 0.5, COLORS.eye);
}

function drawShark(p: Painter3D, at: At, phase: number, lunge: number) {
  const { length, width } = BODIES.shark;
  const sway = Math.sin(phase * 5) * 1.6;
  // Tail fin, swaying
  p.surface([at(-length + 1, 0, 1.4), at(-length - 4, sway + 2.2, 4.2), at(-length - 3, sway - 1.6, 0.4)], COLORS.fin);
  const nose = 1.5 * lunge;
  dome(p, at, nose / 2, length + nose / 2, width, DOMES.shark, COLORS.shark, COLORS.sharkBelly);
  // The dorsal fin, high out of the water
  p.surface([at(2, 0, 2.2), at(-3.5, 0, 6.8), at(-4.5, 0, 2)], COLORS.fin);
  for (const side of [1, -1]) {
    p.surface([at(3, side * 2.4, 1), at(-1, side * 6.5, 0.4), at(-2, side * 2.6, 0.8)], COLORS.fin);
    p.ball(at(length - 2 + nose, side * 1.4, 1.8), 0.35, COLORS.eye);
  }
}

function drawKraken(p: Painter3D, at: At, phase: number, lunge: number) {
  const { length, width } = BODIES.kraken;
  // Eight arms round the body, writhing, reaching out further with a bite
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const wave = Math.sin(phase * 2 + i * 1.3);
    const reach = 26 + 6 * lunge + 3 * wave;
    const root = at(Math.cos(a) * length * 0.8, Math.sin(a) * width * 0.8, 1.5);
    const bend = a + 0.35 * wave;
    const mid = at(Math.cos(bend) * reach * 0.6, Math.sin(bend) * reach * 0.6, 2.5 + wave);
    const tip = at(Math.cos(a + 0.6 * wave) * reach, Math.sin(a + 0.6 * wave) * reach, 0.6);
    p.curve(root, mid, tip, 2.2, COLORS.krakenDark);
    p.ball(mid, 0.6, COLORS.sucker);
  }
  dome(p, at, 0, length, width, DOMES.kraken, COLORS.kraken, COLORS.krakenDark);
  for (const side of [1, -1]) {
    p.ball(at(length * 0.75, side * 4.5, 5), 1.5, COLORS.eyeGlow);
    p.ball(at(length * 0.8, side * 4.5, 5), 0.7, COLORS.eye);
  }
}
