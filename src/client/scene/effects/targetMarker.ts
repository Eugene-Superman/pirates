import type { Painter3D } from '../../render/Painter3D';

/** Pulsing ring with a cross on the water where the ship is heading */
export function drawTargetMarker(p: Painter3D, target: { x: number; y: number }, time: number) {
  const { x, y } = target;
  p.ring(x, y, 0, 14 * (1 + Math.sin(time * 6) * 0.15), 2, 0xffffff, 0.8);
  p.line([x - 6, y, 0], [x + 6, y, 0], 2, 0xffffff, 0.8);
  p.line([x, y - 6, 0], [x, y + 6, 0], 2, 0xffffff, 0.8);
}
