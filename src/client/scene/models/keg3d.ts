import { PERKS, type PowderKeg } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = {
  stave: 0x6e4220,
  staveTop: 0x8a5a2e,
  band: 0x2f3033,
  fuse: 0xd8c08a,
  spark: 0xffc04a,
  glow: 0xff6a2a,
  ring: 0xff5a3a,
  foam: 0xffffff,
} as const;
// World units: a keg's radius at its belly and at its ends, its height out of the water, and where its bands are
const KEG = { belly: 2.4, ends: 2, height: 4.4, bands: [0.18, 0.82] } as const;
const SIDES = 10; // faces round a keg
const BOB = { height: 0.45, speed: 2.6 }; // world units, radians per second
const SPLASH = { time: 1, from: 3, to: 13, width: 1.2 }; // seconds, world units: the ring where it fell in
const BLINK = 4; // seconds before it sinks unexploded, when it blinks
const ZONE = { width: 1.1, alpha: 0.4, beat: 6 } as const; // the ring a foe sets it off within: world units, alpha, rad/s

/** A ring of `SIDES` points round (x, y) at height z */
function round(x: number, y: number, z: number, radius: number): Vec3[] {
  return Array.from({ length: SIDES }, (_, i) => {
    const a = (i / SIDES) * Math.PI * 2;
    return [x + Math.cos(a) * radius, y + Math.sin(a) * radius, z];
  });
}

/**
 * Round a powder keg on the water: foam, the splash where it fell in, and a red ring, beating, as far as its blast
 * reaches: a foe's hull within it sets it off. Drawn with the sea
 */
export function drawKegWater(p: Painter3D, keg: PowderKeg, time: number) {
  const r = KEG.belly + 1.4 + Math.sin(time * BOB.speed + keg.id) * 0.4;
  p.ring(keg.x, keg.y, 0, r, 0.7, COLORS.foam, 0.5);
  const t = (time - keg.droppedAt) / SPLASH.time;
  if (t < 1) {
    const eased = 1 - (1 - t) * (1 - t);
    const radius = SPLASH.from + (SPLASH.to - SPLASH.from) * eased;
    p.ring(keg.x, keg.y, 0, radius, SPLASH.width, COLORS.foam, 0.7 * (1 - t));
  }
  const beat = 0.6 + 0.4 * Math.sin(time * ZONE.beat + keg.id);
  p.ring(keg.x, keg.y, 0, PERKS.powderKeg.blast, ZONE.width, COLORS.ring, ZONE.alpha * beat);
}

/**
 * A powder keg bobbing upright: oak staves bellied out between iron bands, its fuse sparking. It blinks in its last
 * seconds before it sinks unexploded
 */
export function drawKeg(p: Painter3D, keg: PowderKeg, time: number) {
  if (keg.sinksAt - time < BLINK && Math.sin(time * 10) < 0) return;
  const { x, y } = keg;
  const z = Math.sin(time * BOB.speed + keg.id) * BOB.height - 0.6;
  const bottom = round(x, y, z, KEG.ends);
  const belly = round(x, y, z + KEG.height / 2, KEG.belly);
  const top = round(x, y, z + KEG.height, KEG.ends);
  p.sides(bottom, belly, COLORS.stave);
  p.sides(belly, top, COLORS.stave);
  p.top(top, COLORS.staveTop);
  for (const share of KEG.bands) {
    const at = z + KEG.height * share;
    const radius = KEG.ends + (KEG.belly - KEG.ends) * (1 - Math.abs(share - 0.5) * 2) + 0.15;
    p.sides(round(x, y, at - 0.25, radius), round(x, y, at + 0.25, radius), COLORS.band);
  }
  const fuse: Vec3 = [x + 0.6, y, z + KEG.height + 1.6];
  p.line([x + 0.4, y, z + KEG.height], fuse, 0.5, COLORS.fuse);
  const flicker = 0.6 + 0.4 * Math.sin(time * 23 + keg.id * 7);
  p.ball(fuse, 1.4 * flicker, COLORS.glow, 0.35);
  p.ball(fuse, 0.6, COLORS.spark, 0.9);
}
