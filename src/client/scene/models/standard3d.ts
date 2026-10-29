import type { Ship } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = { glow: 0xffc94a, ring: 0xffd34d, dash: 0xfff0b3 } as const;
// In the ship's radii: the glow on the water round it, its ring, and the dashed ring running round outside that
const REACH = { glow: 1.6, ring: 1.7, dashes: 2.05 } as const;
const DASHES = { dash: 7, gap: 5, width: 1.4, speed: 14 } as const; // world units; the dashes' run, units a second
const BEAT = 4; // radians per second: the glow's breath
const FADE = 1; // seconds before the standard comes down that the light fades out

/**
 * A Royal standard flying (the level 50 ability, ship.standardUntil): the water round the ship glowing gold under a
 * ring, a dashed ring running round outside it, fading out as the time runs out. Drawn with the sea
 */
export function drawStandardWater(p: Painter3D, ship: Ship, time: number) {
  const left = ship.standardUntil - time;
  if (left <= 0) return;
  const fade = Math.min(1, left / FADE);
  const beat = 0.75 + 0.25 * Math.sin(time * BEAT);
  const { x, y, radius } = ship;
  p.disc(x, y, 0, radius * REACH.glow, COLORS.glow, 0.12 * beat * fade);
  p.ring(x, y, 0, radius * REACH.ring, 1.2, COLORS.ring, 0.7 * beat * fade);
  p.dashedRing(x, y, 0, radius * REACH.dashes, {
    dash: DASHES.dash,
    gap: DASHES.gap,
    phase: time * DASHES.speed,
    width: DASHES.width,
    color: COLORS.dash,
    alpha: 0.8 * fade,
  });
}
