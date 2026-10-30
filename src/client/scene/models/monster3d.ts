import type { ShipClassId } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import type { ShipPose } from './botShip3d';

// The monsters not modelled yet, as simple as can be until they are: a body of rings, a few limbs, eyes
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
  ink: 0x3b2f6b,
  inkDark: 0x221a45,
  inkSucker: 0xd9c8f0,
  inkling: 0x584a94,
  glass: 0x9fe8ff,
  eye: 0x101010,
  eyeGlow: 0xffd447,
  underwater: 0x0a2a35,
  foam: 0xffffff,
};
const SEGMENTS = 14; // sides of a body's rings
const BOB = 0.3; // world units
const SHAKE = 0.25; // radians it rocks when hit
const UNDERWATER_ALPHA = 0.3;
// A monster under water, diving (drawDiveWater): its shape this much bigger than its body and darker than a monster's
// water, and bubbles breaking over it and behind it, this many, world units apart, each living this many seconds
const DIVE_SHAPE = { scale: 1.4, alpha: 0.5 } as const;
const BUBBLES = { count: 10, apart: 9, life: 0.45 } as const;

type MonsterId = Extract<ShipClassId, 'giantCrab' | 'shark' | 'kraken' | 'inkmother' | 'inkling'>;

/** How high each stands out of the water, world units: its hit point bar goes over it */
const TOPS: Readonly<Record<MonsterId, number>> = { giantCrab: 6, shark: 7, kraken: 12, inkmother: 9, inkling: 5 };
// The body's footprint on the water: half its length and half its width, world units
const BODIES: Readonly<Record<MonsterId, { readonly length: number; readonly width: number }>> = {
  giantCrab: { length: 7, width: 9 },
  shark: { length: 12, width: 3.6 },
  kraken: { length: 14, width: 14 },
  // Its mantle, behind its head (INK_HEAD)
  inkmother: { length: 11, width: 7 },
  inkling: { length: 4.5, width: 3 },
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
  inkmother: [
    [0, 1],
    [2.5, 0.95],
    [5, 0.75],
    [7, 0.45],
    [8, 0.2],
  ],
  inkling: [
    [0, 1],
    [1.5, 0.9],
    [3, 0.6],
    [3.8, 0.25],
  ],
};
// The Inkmother's mantle lies this far behind its middle, world units, its head before it: the middle of its head,
// half its length and width, and its rings as a dome's
const INK_MANTLE = -5;
const INK_HEAD = {
  x: 8,
  length: 4.5,
  width: 5.5,
  rings: [
    [0, 1],
    [2.5, 0.9],
    [4, 0.6],
    [4.8, 0.3],
  ],
} as const;

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
 * A monster under water (combat/monsterSkills.ts): its dark shape gliding `k` of the way (0..1) from where it went down
 * to where it will come up, bubbles breaking over it and in its wake. Drawn with the sea
 */
export function drawDiveWater(
  p: Painter3D,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  k: number,
  classId: MonsterId,
  time: number,
) {
  const { length, width } = BODIES[classId];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const way = Math.hypot(dx, dy) || 1;
  const heading = Math.atan2(dy, dx);
  const x = from.x + dx * k;
  const y = from.y + dy * k;
  const at = frame({ id: 0, x, y, heading, speed: 0 }, time, 0, 0);
  p.polygon(ring(at, 0, length * DIVE_SHAPE.scale, width * DIVE_SHAPE.scale, 0), COLORS.underwater, DIVE_SHAPE.alpha);
  for (let i = 0; i < BUBBLES.count; i++) {
    const back = i * BUBBLES.apart;
    if (back > way * k) break;
    const t = (time / BUBBLES.life + i * 0.37) % 1;
    const side = Math.sin(i * 12.9 + Math.floor(time / BUBBLES.life + i * 0.37)) * width;
    const bx = x - (dx / way) * back - (dy / way) * side;
    const by = y - (dy / way) * back + (dx / way) * side;
    p.ring(bx, by, 0, 0.6 + 2.6 * t, 0.5, COLORS.foam, 0.7 * (1 - t));
  }
}

/**
 * A monster not modelled yet, vector-drawn: a crab with its claws, a shark with its fin and tail, a kraken with its
 * arms, the Inkmother with its arms and tentacles. shake: 1 right after a hit, then 0; lunge: 1 right after a bite;
 * sink: world units it has gone down
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
  else if (classId === 'inkmother') drawInkmother(p, at, time + m.id, lunge);
  else if (classId === 'inkling') drawInkling(p, at, time + m.id, lunge);
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

/** A squid grown huge on the glass it swallowed, its shard glowing through its back: a stand-in till it is modelled */
function drawInkmother(p: Painter3D, at: At, phase: number, lunge: number) {
  const { length, width } = BODIES.inkmother;
  const front = INK_HEAD.x + INK_HEAD.length * 0.6;
  // Eight arms fanned out before its head, writhing
  for (let i = 0; i < 8; i++) {
    const a = ((i - 3.5) / 3.5) * 0.7;
    const wave = Math.sin(phase * 2.4 + i * 1.7);
    const reach = 12 + 2 * wave + 3 * lunge;
    const side = Math.sin(a) * 3;
    const root = at(front, side, 1.2);
    const mid = at(
      front + Math.cos(a) * reach * 0.55,
      side + Math.sin(a + 0.4 * wave) * reach * 0.55,
      1.8 + wave * 0.6,
    );
    const tip = at(front + Math.cos(a) * reach, side + Math.sin(a + 0.8 * wave) * reach, 0.5);
    p.curve(root, mid, tip, 1.5, COLORS.inkDark);
    p.ball(mid, 0.45, COLORS.inkSucker);
  }
  // Its two long tentacles, shot out with a bite to the far end of its reach
  for (const side of [1, -1]) {
    const wave = Math.sin(phase * 1.6 + side);
    const reach = 26 + 14 * lunge + 2 * wave;
    const root = at(front, side * 1.2, 1.4);
    const mid = at(front + reach * 0.5, side * (3 + 2 * wave), 2.4 - lunge);
    const club = at(front + reach, side * (2 + wave), 0.8);
    p.curve(root, mid, club, 1.1, COLORS.inkDark);
    p.ball(club, 1.4, COLORS.ink);
    p.ball(club, 0.6, COLORS.inkSucker);
  }
  // Fins at the end of its mantle
  for (const side of [1, -1]) {
    p.surface(
      [
        at(INK_MANTLE - length * 0.55, side * width * 0.5, 2),
        at(INK_MANTLE - length - 2, side * (width + 4), 1),
        at(INK_MANTLE - length - 3, side * 1.5, 1.5),
      ],
      COLORS.ink,
    );
  }
  dome(p, at, INK_MANTLE, length, width, DOMES.inkmother, COLORS.ink, COLORS.inkDark);
  dome(p, at, INK_HEAD.x, INK_HEAD.length, INK_HEAD.width, INK_HEAD.rings, COLORS.ink, COLORS.inkDark);
  for (const side of [1, -1]) {
    p.ball(at(INK_HEAD.x + 1, side * INK_HEAD.width * 0.75, 3.2), 1.3, COLORS.glass);
    p.ball(at(INK_HEAD.x + 1.4, side * INK_HEAD.width * 0.75, 3.3), 0.6, COLORS.eye);
  }
  // The shard it swallowed, its light through the mantle, breathing
  const glow = 0.5 + 0.5 * Math.sin(phase * 1.8);
  const top = DOMES.inkmother[DOMES.inkmother.length - 1][0];
  p.ball(at(INK_MANTLE, 0, top), 2.6, COLORS.glass, 0.18 + 0.14 * glow);
  p.ball(at(INK_MANTLE, 0, top), 1.1, COLORS.glass, 0.8);
}

/** One of the Inkmother's brood: a small squid of her colours, its arms writhing ahead of it, snapping out with a bite */
function drawInkling(p: Painter3D, at: At, phase: number, lunge: number) {
  const { length, width } = BODIES.inkling;
  const front = length * 0.8;
  for (let i = 0; i < 6; i++) {
    const a = ((i - 2.5) / 2.5) * 0.6;
    const wave = Math.sin(phase * 4 + i * 1.9);
    const reach = 6 + 1.2 * wave + 3 * lunge;
    const root = at(front, Math.sin(a) * 1.5, 0.8);
    const mid = at(front + Math.cos(a) * reach * 0.5, Math.sin(a + 0.3 * wave) * reach * 0.5, 1.2);
    const tip = at(front + Math.cos(a) * reach, Math.sin(a + 0.5 * wave) * reach, 0.3);
    p.curve(root, mid, tip, 0.7, COLORS.inkDark);
  }
  for (const side of [1, -1]) {
    p.surface(
      [
        at(-length * 0.5, side * width * 0.5, 1.2),
        at(-length - 1.5, side * (width + 2), 0.6),
        at(-length - 2, side * 0.8, 0.9),
      ],
      COLORS.inkling,
    );
  }
  dome(p, at, 0, length, width, DOMES.inkling, COLORS.inkling, COLORS.inkDark);
  for (const side of [1, -1]) p.ball(at(front - 0.6, side * width * 0.7, 2), 0.6, COLORS.glass);
}
