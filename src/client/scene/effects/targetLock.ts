import type { Painter3D } from '../../render/Painter3D';

/** Where a unit is on the water and how big: what a ring round it needs */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

const COLORS = { firing: 0xff4d3d, holding: 0xffb347, selected: 0xffffff };
const DASHES = 8;
const TURN = 1.2; // radians per second: the ring turns, so a locked target stands out from the rest
const WIDTH = 1.2; // world units
const MARGIN = 6; // world units between the target's hit circle and the ring
const SELECTED_DASHES = 12;
const SELECTED_TURN = 0.4;

/**
 * The target the ship fires at: a turning dashed ring on the water round it, red while the ship fires, amber while it
 * holds fire (out of range, out of ammo…). Drawn with the sea
 */
export function drawTargetLock(p: Painter3D, target: Spot, time: number, holding: boolean) {
  const radius = target.radius + MARGIN;
  const color = holding ? COLORS.holding : COLORS.firing;
  p.dashedRing(target.x, target.y, 0, radius, DASHES, time * TURN, WIDTH, color, 0.9);
  p.dashedRing(target.x, target.y, 0, radius + 2.5, DASHES, -time * TURN, WIDTH * 0.6, color, 0.5);
}

/** The unit the player picked out (and isn't firing at yet): a thin, slowly turning white ring. Drawn with the sea */
export function drawSelection(p: Painter3D, unit: Spot, time: number) {
  p.dashedRing(
    unit.x,
    unit.y,
    0,
    unit.radius + MARGIN,
    SELECTED_DASHES,
    time * SELECTED_TURN,
    WIDTH * 0.7,
    COLORS.selected,
    0.75,
  );
}
