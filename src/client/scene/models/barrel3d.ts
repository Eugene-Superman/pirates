import type { Target } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = {
  wood: 0x9a6a3c,
  lid: 0xb98a55,
  hoop: 0x3b3430,
  pole: 0x6b4a2a,
  flag: 0xd63a2f,
  foam: 0xffffff,
};
const SEGMENTS = 14; // sides of the barrel's outline
const BULGE = 1.15; // the middle is this much wider than the ends
const HOOPS = [0.2, 0.8]; // heights of the iron hoops, as a share of the barrel's height
const HOOP_WIDTH = 0.3; // world units
const POLE_HEIGHT = 7; // the flag pole above the lid, world units
const FLAG_SIZE = 3;
const BOB_HEIGHT = 0.5; // world units
const BOB_SPEED = 1.7; // radians per second
const ROCK = 0.06; // radians the barrel rocks on the waves
const SHAKE = 0.35; // radians it tips when hit, dying out over SHAKE_TIME
export const SHAKE_TIME = 0.8; // seconds

/** Lean of a floating barrel: rocks on the waves, and tips over for a moment when hit (shake 1 → 0) */
function lean(target: Target, time: number, shake: number) {
  const phase = time * BOB_SPEED + target.id;
  const kick = SHAKE * shake * Math.sin(shake * 18);
  return {
    x: ROCK * Math.sin(phase * 0.8) + kick,
    y: ROCK * Math.cos(phase * 0.6),
    z: Math.sin(phase) * BOB_HEIGHT - BOB_HEIGHT,
  };
}

/** Flat parts: the foam ring where the barrel meets the water. Drawn with the sea */
export function drawBarrelWater(p: Painter3D, target: Target, time: number) {
  const pulse = 1 + 0.08 * Math.sin(time * BOB_SPEED * 2 + target.id);
  p.ring(target.x, target.y, 0, target.radius * 1.25 * pulse, 0.5, COLORS.foam, 0.55);
}

/** The barrel itself with a little flag on top, so it can be spotted from far away. shake: 1 right after a hit, then 0 */
export function drawBarrel(p: Painter3D, target: Target, time: number, shake: number) {
  const { x: tiltX, y: tiltY, z: lift } = lean(target, time, shake);
  // Barrel coordinates → world: tilt around its waterline centre, then bob
  const at = (lx: number, ly: number, lz: number): Vec3 => [
    target.x + lx + lz * tiltX,
    target.y + ly + lz * tiltY,
    lz + lift,
  ];
  const ring = (z: number, r: number) =>
    Array.from({ length: SEGMENTS }, (_, i) => {
      const a = (i / SEGMENTS) * Math.PI * 2;
      return at(Math.cos(a) * r, Math.sin(a) * r, z);
    });

  const h = target.height;
  const r = target.radius / BULGE;
  const bottom = ring(0, r);
  const middle = ring(h / 2, target.radius);
  const top = ring(h, r);
  p.sides(bottom, middle, COLORS.wood);
  p.sides(middle, top, COLORS.wood);
  for (const k of HOOPS) {
    const z = h * k;
    // The hoops follow the bulge: at the ends they are as narrow as the barrel
    const hr = r + (target.radius - r) * Math.sin(Math.PI * k) + 0.05;
    p.sides(ring(z - HOOP_WIDTH / 2, hr), ring(z + HOOP_WIDTH / 2, hr), COLORS.hoop);
  }
  p.top(top, COLORS.lid);

  const base = at(0, 0, h);
  const tip = at(0, 0, h + POLE_HEIGHT);
  p.line(base, tip, 0.35, COLORS.pole);
  const wave = Math.sin(time * 6 + target.id) * 0.6;
  p.surface(
    [tip, at(FLAG_SIZE * 1.4, wave, h + POLE_HEIGHT - FLAG_SIZE / 2), at(0, 0, h + POLE_HEIGHT - FLAG_SIZE)],
    COLORS.flag,
  );
}
