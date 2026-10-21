import { WORLD_HEIGHT, WORLD_WIDTH, createRandom } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

const WAVE_COUNT = 1200;
const WAVE_SEED = 1;
const WAVE_COLOR = 0x5fb3d6;

export interface Wave {
  x: number;
  y: number;
  width: number;
  phase: number;
}

// Decoration only, the server doesn't need it. A fixed seed keeps the waves the same on every run
export function createWaves(): Wave[] {
  const random = createRandom(WAVE_SEED);
  return Array.from({ length: WAVE_COUNT }, () => ({
    x: random() * WORLD_WIDTH,
    y: random() * WORLD_HEIGHT,
    width: 10 + random() * 18,
    phase: random() * Math.PI * 2,
  }));
}

export function drawWaves(p: Painter3D, waves: readonly Wave[], time: number) {
  for (const wave of waves) {
    const x = wave.x + Math.sin(time * 0.8 + wave.phase) * 4;
    if (!p.isVisible(x + wave.width / 2, wave.y, 0, wave.width)) continue;
    p.curve([x, wave.y, 0], [x + wave.width / 2, wave.y - 5, 0], [x + wave.width, wave.y, 0], 2, WAVE_COLOR, 0.45);
  }
}
