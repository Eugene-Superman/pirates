export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;

export interface Palm {
  x: number;
  y: number;
  leanX: number;
  leanY: number;
}

export interface Island {
  x: number;
  y: number;
  radius: number;
  shape: number[]; // множники радіуса для нерівного берега, по одному на сегмент
  height: number; // висота плато над водою
  hillHeight: number; // висота пагорба на плато (0 = без пагорба)
  palms: Palm[];
}

export interface Wave {
  x: number;
  y: number;
  width: number;
  phase: number;
}

export interface WorldData {
  islands: Island[];
  waves: Wave[];
}

// Детермінований рандом, щоб карта була однаковою при кожному запуску
function createRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(): WorldData {
  return {
    islands: createIslands(25, createRandom(42)),
    waves: createWaves(1200, createRandom(1)),
  };
}

/** Точки берега острова, масштабовані відносно його радіуса */
export function islandOutline(island: Island, scale: number) {
  const segments = island.shape.length;
  return island.shape.map((k, i) => {
    const angle = (i / segments) * Math.PI * 2;
    const r = island.radius * scale * k;
    return { x: island.x + Math.cos(angle) * r, y: island.y + Math.sin(angle) * r };
  });
}

function createWaves(count: number, random: () => number): Wave[] {
  return Array.from({ length: count }, () => ({
    x: random() * WORLD_WIDTH,
    y: random() * WORLD_HEIGHT,
    width: 10 + random() * 18,
    phase: random() * Math.PI * 2,
  }));
}

function createIslands(count: number, random: () => number): Island[] {
  const islands: Island[] = [];
  const spawnX = WORLD_WIDTH / 2;
  const spawnY = WORLD_HEIGHT / 2;

  for (let attempt = 0; attempt < 1000 && islands.length < count; attempt++) {
    const radius = 60 + random() * 120;
    const x = radius + 100 + random() * (WORLD_WIDTH - 2 * (radius + 100));
    const y = radius + 100 + random() * (WORLD_HEIGHT - 2 * (radius + 100));

    if (Math.hypot(x - spawnX, y - spawnY) < radius + 400) continue;
    const overlaps = islands.some((o) => Math.hypot(x - o.x, y - o.y) < radius + o.radius + 150);
    if (overlaps) continue;

    // Нерівний берег: випадкові радіуси, згладжені з сусідами
    const segments = 18;
    const raw = Array.from({ length: segments }, () => 0.8 + random() * 0.4);
    const shape = raw.map((v, i) => (raw[(i - 1 + segments) % segments] + v + raw[(i + 1) % segments]) / 3);

    const hillHeight = radius > 120 ? 16 + random() * 16 : 0;
    const palms = Array.from({ length: 2 + Math.floor(random() * 4) }, () => {
      const angle = random() * Math.PI * 2;
      // На великих островах пальми ростуть навколо пагорба, а не на ньому
      const dist = radius * (hillHeight > 0 ? 0.5 + random() * 0.08 : random() * 0.45);
      const leanAngle = random() * Math.PI * 2;
      const lean = 3 + random() * 5;
      return {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        leanX: Math.cos(leanAngle) * lean,
        leanY: Math.sin(leanAngle) * lean,
      };
    });

    islands.push({ x, y, radius, shape, height: 12 + radius * 0.1, hillHeight, palms });
  }

  return islands;
}
