import { mixColor, type Painter3D } from '../../render/Painter3D';

/** Where a unit is on the water and how big: what a ring round it needs */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

const COLORS = { firing: 0xff4d3d, holding: 0xffb347, selected: 0xfff1c9 };
const MARGIN = 6; // world units between the unit's hit circle and the ring
const WIDTH = 2.4; // world units: the ring round the target fired at
const SELECTED_WIDTH = 1.7; // world units: the ring round the unit picked out
const RIM = { width: 1.6, alpha: 0.22 }; // a dark rim under the band, as a share of its width: it stands off the sea
const SHINE = { width: 0.35, inset: 0.2, mix: 0.6 }; // a light edge along the band's top: shares of its width, of white
const GLOW = { width: 2.2, gap: 1.3, alpha: 0.3, pulse: 3.2 }; // round the target fired at: shares of the width, rad/s

/** A solid ring on the water that looks raised: a soft dark rim, the coloured band, a light edge along its top */
function raisedRing(p: Painter3D, spot: Spot, radius: number, width: number, color: number, alpha: number) {
  p.ring(spot.x, spot.y, 0, radius, width * RIM.width, 0x000000, RIM.alpha * alpha);
  p.ring(spot.x, spot.y, 0, radius, width, color, alpha);
  p.ring(
    spot.x,
    spot.y,
    0,
    radius - width * SHINE.inset,
    width * SHINE.width,
    mixColor(color, 0xffffff, SHINE.mix),
    alpha,
  );
}

/**
 * The target the ship fires at: a raised ring on the water round it with a glow that breathes, red while the ship
 * fires, amber (and still) while it holds fire (out of range, out of ammo…). Drawn with the sea
 */
export function drawTargetLock(p: Painter3D, target: Spot, time: number, holding: boolean) {
  const radius = target.radius + MARGIN;
  const color = holding ? COLORS.holding : COLORS.firing;
  const breath = holding ? 0.5 : 0.5 + 0.5 * Math.sin(time * GLOW.pulse);
  p.ring(target.x, target.y, 0, radius + WIDTH * GLOW.gap, WIDTH * GLOW.width, color, GLOW.alpha * breath);
  raisedRing(p, target, radius, WIDTH, color, 0.95);
}

/** The unit the player picked out (and isn't firing at yet): a thinner, pale raised ring. Drawn with the sea */
export function drawSelection(p: Painter3D, unit: Spot) {
  raisedRing(p, unit, unit.radius + MARGIN, SELECTED_WIDTH, COLORS.selected, 0.85);
}
