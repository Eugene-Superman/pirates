import type { Target } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = { firing: 0xff4d3d, holding: 0xffb347 };
const DASHES = 8;
const TURN = 1.2; // radians per second: the ring turns, so a locked target stands out from the rest
const WIDTH = 1.2; // world units
const MARGIN = 6; // world units between the target's hit circle and the ring

/**
 * The target the ship fires at: a turning dashed ring on the water round it, red while the ship fires, amber while it
 * holds fire (out of range, out of ammo…). Drawn with the sea
 */
export function drawTargetLock(p: Painter3D, target: Target, time: number, holding: boolean) {
  const radius = target.radius + MARGIN;
  const color = holding ? COLORS.holding : COLORS.firing;
  p.dashedRing(target.x, target.y, 0, radius, DASHES, time * TURN, WIDTH, color, 0.9);
  p.dashedRing(target.x, target.y, 0, radius + 2.5, DASHES, -time * TURN, WIDTH * 0.6, color, 0.5);
}
