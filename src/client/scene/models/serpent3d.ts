import type { Vec3 } from '../../render/Camera3D';
import { LIGHT, type Painter3D } from '../../render/Painter3D';

const COLORS = {
  body: 0x2f7a62,
  shade: 0x1c4d3f,
  shine: 0x8fd4b0,
  fin: 0xd9603b,
  eye: 0xffd84a,
  pupil: 0x101010,
  underwater: 0x0a2a35,
  foam: 0xffffff,
};
const SEGMENTS = 19; // balls of the body, head to tail
const SPACING = 2.35; // world units between two of them along the body: about 42 long
/** World units, at the thickest: the Blender parts of the body are this thick (SerpentSprite) */
export const BODY_RADIUS = 3.1;
const HUMPS = 2; // waves along the body
const HUMP_HEIGHT = 3.8; // world units the humps rise and the troughs dip
const SWIM_DEPTH = 1.3; // world units the body's middle line lies under the water
const WAVE_SPEED = 3.2; // radians per second: the humps run back along the body
const HEAD_HEIGHT = 7; // world units above the water
const HEAD_SCALE = 1.35; // the head's parts, against the sizes they were drawn at
const NECK = 0.22; // share of the body the neck rises over
const SHAKE = 0.9; // world units it jerks aside when hit
const LUNGE = 4; // world units the head darts forward (and up) when it bites
const UNDERWATER_ALPHA = 0.3;

/** A point of the body: where it is (z up from the water: under it in the troughs) and how thick it is there */
export interface Segment {
  x: number;
  y: number;
  z: number;
  /** Radius, world units */
  r: number;
  /** Direction along the body, towards the head */
  ax: number;
  ay: number;
}

/** Thickness along the body: a slim neck, full in front of the middle, thinning to the tail. u: 0 head, 1 tail */
function thickness(u: number) {
  if (u < 0.1) return 0.75;
  if (u < 0.35) return 0.75 + ((u - 0.1) / 0.25) * 0.25;
  return 1 - ((u - 0.35) / 0.65) * 0.78;
}

/** A point of the serpent's spine on the water, from its head back to its tail */
export interface SpinePoint {
  readonly x: number;
  readonly y: number;
}

/** How many points the spine needs and how far apart, world units: the body is laid along them */
export const SPINE = { points: SEGMENTS, spacing: SPACING } as const;

/**
 * The body from head to tail, laid along the spine: where the head has just swum (effects/Trails.ts). shake: 1 right
 * after a hit, then 0; lunge: 1 right after it bit, then 0; sink: world units it has gone down when killed. Its first
 * point is where the neck ends and the head begins
 */
export function serpentBody(
  spine: readonly SpinePoint[],
  time: number,
  shake: number,
  lunge: number,
  sink: number,
): Segment[] {
  const jerk = SHAKE * shake * Math.sin(shake * 18);
  return spine.map((p, i) => {
    const u = i / (spine.length - 1);
    // Towards the head: from this point to the one before it, or for the head from the one behind it
    const ahead = i > 0 ? spine[i - 1] : p;
    const behind = i > 0 ? p : spine[1];
    const dx = ahead.x - behind.x;
    const dy = ahead.y - behind.y;
    const d = Math.hypot(dx, dy) || 1;
    const ax = dx / d;
    const ay = dy / d;
    const wave = Math.sin(2 * Math.PI * u * HUMPS - time * WAVE_SPEED) * HUMP_HEIGHT - SWIM_DEPTH;
    // The neck rises out of the water to the head, higher still as it strikes
    const lift = u < NECK ? 1 - u / NECK : 0;
    const strike = lunge * lift * LUNGE;
    const z = wave * (1 - lift) + (HEAD_HEIGHT + strike) * lift * lift * (3 - 2 * lift) - sink;
    return {
      x: p.x - ay * jerk + ax * strike,
      y: p.y + ax * jerk + ay * strike,
      z,
      r: BODY_RADIUS * thickness(u),
      ax,
      ay,
    };
  });
}

/** The body under the water, seen through it, and foam where it breaks the surface. Drawn with the sea */
export function drawSerpentWater(p: Painter3D, spine: readonly SpinePoint[], time: number) {
  const segments = serpentBody(spine, time, 0, 0, 0);
  // One shape, so its overlapping parts don't darken each other
  const left: Vec3[] = [];
  const right: Vec3[] = [];
  for (const s of segments) {
    const w = s.r * 1.3;
    left.push([s.x - s.ay * w, s.y + s.ax * w, 0]);
    right.push([s.x + s.ay * w, s.y - s.ax * w, 0]);
  }
  for (let i = right.length - 1; i >= 0; i--) left.push(right[i]);
  p.polygon(left, COLORS.underwater, UNDERWATER_ALPHA);
  // A ring of foam wherever the body goes in or out of the water
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1];
    const b = segments[i];
    if (a.z - a.r * 0.4 < 0 === b.z - b.r * 0.4 < 0) continue;
    p.ring((a.x + b.x) / 2, (a.y + b.y) / 2, 0, (a.r + b.r) * 0.7, 0.7, COLORS.foam, 0.4);
  }
}

/** The parts above the water: humps, neck and head, sorted far to near. Until its atlases load (SerpentSprite) */
export function drawSerpent(
  p: Painter3D,
  spine: readonly SpinePoint[],
  time: number,
  shake: number,
  lunge: number,
  sink = 0,
) {
  const segments = serpentBody(spine, time, shake, lunge, sink);
  const parts: { depth: number; draw: () => void }[] = [];
  segments.forEach((s, i) => {
    // Only what shows above the water: a ball sunk deeper than half its size is under the surface
    if (s.z < -s.r * 0.4) return;
    const center: Vec3 = [s.x, s.y, Math.max(s.z, 0)];
    parts.push({
      depth: p.depth(center),
      draw: () => {
        const r = s.z >= 0 ? s.r : s.r * (1 + s.z / s.r);
        // A darker rim keeps the balls of the body apart
        p.ball(center, r * 1.1, COLORS.shade);
        p.ball(center, r, COLORS.body);
        // Light from the sun's side, as on a scaly back
        const shine: Vec3 = [center[0] + LIGHT[0] * r * 0.35, center[1] + LIGHT[1] * r * 0.35, center[2] + r * 0.35];
        p.ball(shine, r * 0.55, COLORS.shine, 0.45);
        if (i % 2 === 0 && i > 2) {
          // A spine on the ridge of the back
          const top: Vec3 = [center[0], center[1], center[2] + r * 0.8];
          p.polygon(
            [
              [top[0] - s.ax * r * 0.7, top[1] - s.ay * r * 0.7, top[2]],
              [top[0] - s.ax * r * 0.4, top[1] - s.ay * r * 0.4, top[2] + r * 0.9],
              [top[0] + s.ax * r * 0.5, top[1] + s.ay * r * 0.5, top[2]],
            ],
            COLORS.fin,
          );
        }
      },
    });
  });
  addHead(p, segments[0], parts);
  parts.sort((a, b) => b.depth - a.depth);
  for (const part of parts) part.draw();
}

/** Skull, snout, eyes and a crest, at the front of the neck */
function addHead(p: Painter3D, neck: Segment, parts: { depth: number; draw: () => void }[]) {
  // Gone under with the rest of it
  if (neck.z < -neck.r) return;
  const { ax, ay } = neck;
  const k = HEAD_SCALE;
  const at = (forward: number, side: number, z: number): Vec3 => [
    neck.x + (ax * forward - ay * side) * k,
    neck.y + (ay * forward + ax * side) * k,
    neck.z + z * k,
  ];
  const skull = at(1.4, 0, 0.4);
  const snout = at(3.6, 0, -0.2);
  parts.push({
    depth: p.depth(skull),
    draw: () => {
      p.line(at(-0.4, 0, 1.4), at(-2.6, 0, 3), 0.7 * k, COLORS.fin);
      p.ball(skull, 2.5 * k, COLORS.shade);
      p.ball(skull, 2.3 * k, COLORS.body);
      p.ball(snout, 1.5 * k, COLORS.shade);
      p.ball(at(3.4, 0, 0.3), 1.2 * k, COLORS.body);
      // The eye on the camera's side; the skull hides the other
      const side = p.depth(at(2.2, 1.2, 1.2)) < p.depth(at(2.2, -1.2, 1.2)) ? 1 : -1;
      p.ball(at(2.2, side * 1.2, 1.2), 0.55 * k, COLORS.eye);
      p.ball(at(2.45, side * 1.3, 1.25), 0.25 * k, COLORS.pupil);
    },
  });
}
