import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import type { ShipPose } from './botShip3d';

const COLORS = {
  shell: 0x5f7a3a,
  scute: 0x4a6130,
  rim: 0xa58c55,
  skin: 0x7d8f4e,
  eye: 0x101010,
  underwater: 0x0a2a35,
  foam: 0xffffff,
};
const SEGMENTS = 16; // sides of the shell's outline
// The shell's outline: an ellipse this long (along the heading) and wide, its middle this far behind the position
const SHELL = { length: 14, width: 11, back: 1 };
// Rings of the dome from the water up: height and share of the outline
const DOME: readonly (readonly [number, number])[] = [
  [0, 1],
  [1.6, 0.92],
  [3, 0.7],
  [3.9, 0.38],
];
const HEAD = { x: 9.6, z: 1.6, radius: 1.9, lunge: 3 };
const FLIPPERS = [
  { x: 3.5, y: 5.2, length: 5.5, width: 2.2 },
  { x: -4.5, y: 4.4, length: 3.5, width: 1.6 },
];
const PADDLE = 0.6; // radians the flippers sweep
const PADDLE_SPEED = 3; // radians per second, faster when it swims fast
const BOB = 0.3; // world units
const SHAKE = 0.25; // radians it rocks when hit
const UNDERWATER_ALPHA = 0.3;

type At = (lx: number, ly: number, lz: number) => Vec3;

function frame(t: ShipPose, time: number, shake: number, sink: number): At {
  const cos = Math.cos(t.heading);
  const sin = Math.sin(t.heading);
  const roll = SHAKE * shake * Math.sin(shake * 16);
  const lift = BOB * Math.sin(time * 1.3 + t.id) - sink;
  return (lx, ly, lz) => {
    const ry = ly - lz * roll;
    return [t.x + lx * cos - ry * sin, t.y + lx * sin + ry * cos, Math.max(0, lz + ly * roll + lift)];
  };
}

function shellRing(at: At, z: number, share: number) {
  return Array.from({ length: SEGMENTS }, (_, i) => {
    const a = (i / SEGMENTS) * Math.PI * 2;
    return at(-SHELL.back + (Math.cos(a) * SHELL.length * share) / 2, (Math.sin(a) * SHELL.width * share) / 2, z);
  });
}

/** The body under the water, seen through it, and a ring of foam round the shell. Drawn with the sea */
export function drawTurtleWater(p: Painter3D, t: ShipPose, time: number) {
  const at = frame(t, time, 0, 0);
  p.polygon(shellRing(at, 0, 1.25), COLORS.underwater, UNDERWATER_ALPHA);
  const [x, y] = at(-SHELL.back, 0, 0);
  p.ring(x, y, 0, SHELL.width * 0.62, 0.6, COLORS.foam, 0.35 + 0.1 * Math.sin(time * 2 + t.id));
}

/**
 * A giant sea turtle: a domed shell with darker plates, paddling flippers and its head out in front, which darts
 * forward when it bites (lunge: 1 right after a bite, then 0). shake: 1 right after a hit; sink: world units it has
 * gone down when killed
 */
export function drawTurtle(p: Painter3D, t: ShipPose, time: number, shake: number, lunge: number, sink = 0) {
  const at = frame(t, time, shake, sink);
  const paddle = Math.sin(time * (PADDLE_SPEED + t.speed / 20) + t.id) * PADDLE;

  // Flippers and head first where they are behind the shell, the rest after it
  const limbs: { depth: number; draw: () => void }[] = [];
  for (const f of FLIPPERS) {
    for (const side of [1, -1]) {
      const sweep = side * paddle * (f.x > 0 ? 1 : -1);
      const dx = Math.cos(sweep) * f.length;
      const dy = Math.sin(Math.abs(sweep)) * f.length * 0.3 + f.length * 0.7;
      const root = at(f.x, side * f.y * 0.8, 0.6);
      const tip = at(f.x - dx * 0.4, side * (f.y * 0.8 + dy), 0.2);
      const fore = at(f.x + f.width / 2, side * f.y * 0.8, 0.6);
      limbs.push({
        depth: p.depth(tip),
        draw: () => p.surface([root, fore, tip], COLORS.skin),
      });
    }
  }
  const reach = HEAD.x + HEAD.lunge * lunge;
  const head = at(reach, 0, HEAD.z);
  limbs.push({
    depth: p.depth(head),
    draw: () => {
      p.line(at(SHELL.length / 2 - SHELL.back - 1, 0, 1), head, HEAD.radius * 1.3, COLORS.skin);
      p.ball(head, HEAD.radius, COLORS.skin);
      for (const side of [1, -1]) p.ball(at(reach + 0.8, side * 1.1, HEAD.z + 0.6), 0.35, COLORS.eye);
    },
  });
  const shellDepth = p.depth(at(-SHELL.back, 0, DOME[1][0]));
  limbs.sort((a, b) => b.depth - a.depth);
  for (const limb of limbs) if (limb.depth > shellDepth) limb.draw();

  const rings = DOME.map(([z, share]) => shellRing(at, z, share));
  p.sides(rings[0], rings[1], COLORS.rim);
  for (let i = 1; i < rings.length - 1; i++) p.sides(rings[i], rings[i + 1], COLORS.shell);
  p.top(rings[rings.length - 1], COLORS.shell);
  // Darker plates on the dome: one on top, a ring of them round it
  p.polygon(shellRing(at, DOME[3][0] + 0.05, 0.22), COLORS.scute, 0.8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cx = -SHELL.back + Math.cos(a) * SHELL.length * 0.27;
    const cy = Math.sin(a) * SHELL.width * 0.27;
    const plate = Array.from({ length: 6 }, (_, k) => {
      const b = (k / 6) * Math.PI * 2;
      return at(cx + Math.cos(b) * 1.5, cy + Math.sin(b) * 1.3, DOME[2][0] + 0.3);
    });
    p.polygon(plate, COLORS.scute, 0.7);
  }
  for (const limb of limbs) if (limb.depth <= shellDepth) limb.draw();
}
