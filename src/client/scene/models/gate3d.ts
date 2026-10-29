import type { GatePlace } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = {
  glow: 0x7fe3ff,
  buoy: 0xe8dcc0,
  band: 0x2e7bd6,
  post: 0x3a2a1c,
};
const BUOYS = 8; // round the gate's circle
const BUOY = { radius: 1.6, post: 4.5 }; // world units
const RINGS = 3; // spreading in from the edge, one after another
const RING_PERIOD = 2.2; // seconds a ring takes from the edge to the middle

/**
 * A gate to another sea (world/gates.ts), on the water: its circle in pale light, rings drawing in to its middle one
 * after another, and buoys round it, each with a band. Drawn with the sea till its maps have loaded: then the gate is
 * a whirlpool in the sea's shader (seaSurface.ts)
 */
export function drawGate(p: Painter3D, gate: GatePlace, time: number) {
  const { x, y, radius } = gate;
  p.ring(x, y, 0, radius, 2.4, COLORS.glow, 0.7);
  p.disc(x, y, 0, radius, COLORS.glow, 0.08);
  for (let i = 0; i < RINGS; i++) {
    const k = (time / RING_PERIOD + i / RINGS) % 1;
    p.ring(x, y, 0, radius * (1 - k), 1.2, COLORS.glow, 0.5 * k);
  }
  for (let i = 0; i < BUOYS; i++) {
    const a = (i / BUOYS) * Math.PI * 2;
    const bx = x + Math.cos(a) * radius;
    const by = y + Math.sin(a) * radius;
    const bob = 0.3 * Math.sin(time * 2 + i);
    p.line([bx, by, 0], [bx, by, BUOY.post + bob], 0.5, COLORS.post);
    p.ball([bx, by, BUOY.radius + bob], BUOY.radius, COLORS.buoy);
    p.ball([bx, by, BUOY.radius * 1.6 + bob], BUOY.radius * 0.7, COLORS.band);
  }
}
