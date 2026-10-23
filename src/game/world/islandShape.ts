import type { Point } from '../lib/geometry';

/** Points of an island's coastline: its radius at as many angles, from east, clockwise on the map */
export const COAST_SEGMENTS = 48;
const FINE = 360; // samples round the coast its area and its roughness are measured with

// Every island is made up here from the seeded generator, so no two are alike. The ranges are those of the ten shapes
// first made in Blender (blender-assets/islands/build_islands.py), whose way of drawing a coast this follows
const RADIUS = [60, 175] as const; // world units: a circle of the island's area
const ELONGATION = [1, 2.6] as const; // length / width
const MAX_LOBES = 3; // bulges and bays along the coast
const LOBE_SIZE = [-0.42, 0.32] as const; // shares of the radius: a bay (−) or a cape (+)
const LOBE_WIDTH = [12, 40] as const; // degrees
const ROUGH = [0.05, 0.2] as const; // how jagged the coast is
const HARMONICS = [2, 8] as const; // the jags' frequencies round the coast
export const BEACH = 1.6; // world units the beach rises above the water
const PLATEAU = [4, 18] as const; // world units the land rises above the beach
const CAY = { radius: 85, plateau: [1.5, 4] } as const; // smaller islands are low sandy cays with no hill
const HILL_CHANCE = 0.75;
const HILL = [8, 40] as const; // world units above the land

export interface IslandShape {
  /** World units: a circle of the island's area; the coast is shares of it */
  readonly radius: number;
  /** The coast's radius at COAST_SEGMENTS angles, as shares of `radius` */
  readonly shape: readonly number[];
  /** World units: the land's height above the water, and its hill's above the land (0: none) */
  readonly height: number;
  readonly hillHeight: number;
}

function between(range: readonly [number, number], random: () => number) {
  return range[0] + random() * (range[1] - range[0]);
}

/** A normally distributed number (Box–Muller), from two of the generator's */
function normal(random: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(random(), 1e-9))) * Math.cos(2 * Math.PI * random());
}

/** How a coastline is drawn: an ellipse turned to `heading`, bays (−) and capes (+) pushed into it, how jagged */
export interface CoastPlan {
  /** Length / width */
  readonly elongation: number;
  /** Radians the long axis is turned by (0 = east, clockwise on the map) */
  readonly heading: number;
  /** Where each bay or cape is (radians), its size (a share of the radius) and its width (radians) */
  readonly lobes: readonly { readonly angle: number; readonly size: number; readonly width: number }[];
  readonly rough: number;
}

/**
 * The coast's radius at COAST_SEGMENTS angles, as shares of a circle of the same area: the plan's ellipse with its
 * bays and capes, made jagged by a few waves of random size round it (from `random`)
 */
export function coastShape(plan: CoastPlan, random: () => number): number[] {
  const long = Math.sqrt(plan.elongation);
  const waves: { k: number; amplitude: number; phase: number }[] = [];
  for (let k = HARMONICS[0]; k <= HARMONICS[1]; k++) {
    waves.push({ k, amplitude: normal(random) / k, phase: random() * Math.PI * 2 });
  }
  const jag = (angle: number) => waves.reduce((sum, w) => sum + w.amplitude * Math.cos(w.k * angle + w.phase), 0);
  let jagMax = 1e-6;
  for (let i = 0; i < FINE; i++) jagMax = Math.max(jagMax, Math.abs(jag((i / FINE) * Math.PI * 2)));
  const coast = (angle: number) => {
    const c = Math.cos(angle - plan.heading) / long;
    const s = Math.sin(angle - plan.heading) * long;
    let r = 1 / Math.sqrt(c * c + s * s);
    for (const lobe of plan.lobes) {
      // The angle to the lobe, wrapped to −π…π
      const diff = Math.atan2(Math.sin(angle - lobe.angle), Math.cos(angle - lobe.angle));
      r *= 1 + lobe.size * Math.exp(-((diff / lobe.width) ** 2));
    }
    return r * (1 + (plan.rough * jag(angle)) / jagMax);
  };
  // Scaled so the island has the area of its circle, whatever its shape
  let squares = 0;
  for (let i = 0; i < FINE; i++) squares += coast((i / FINE) * Math.PI * 2) ** 2;
  const rms = Math.sqrt(squares / FINE);
  return Array.from({ length: COAST_SEGMENTS }, (_, i) => coast((i / COAST_SEGMENTS) * Math.PI * 2) / rms);
}

/** The coast's radius at an angle (radians), as a share: the nearest of the shape's points */
export function coastAt(shape: readonly number[], angle: number) {
  const turn = (((angle / (Math.PI * 2)) % 1) + 1) % 1;
  return shape[Math.round(turn * shape.length) % shape.length];
}

/**
 * A new island: a coast of random length, heading, bays, capes and roughness, then its land and maybe a hill. Drawn
 * from the seeded generator only, so the map is the same on every run
 */
export function randomIslandShape(random: () => number): IslandShape {
  const radius = between(RADIUS, random);
  // Most islands roundish, a few long ones
  const elongation = ELONGATION[0] + random() ** 1.5 * (ELONGATION[1] - ELONGATION[0]);
  const heading = random() * Math.PI * 2;
  const lobes = Array.from({ length: Math.floor(random() * (MAX_LOBES + 1)) }, () => ({
    angle: random() * Math.PI * 2,
    size: between(LOBE_SIZE, random),
    width: (between(LOBE_WIDTH, random) * Math.PI) / 180,
  }));
  const rough = between(ROUGH, random);
  const shape = coastShape({ elongation, heading, lobes, rough }, random);

  const cay = radius < CAY.radius;
  const plateau = between(cay ? CAY.plateau : PLATEAU, random);
  const hill = !cay && random() < HILL_CHANCE;
  return { radius, shape, height: BEACH + plateau, hillHeight: hill ? between(HILL, random) : 0 };
}

/** The coast's points round (x, y): the shape's shares of `radius`, times `scale` */
export function coastline(x: number, y: number, radius: number, shape: readonly number[], scale: number): Point[] {
  return shape.map((k, i) => {
    const angle = (i / shape.length) * Math.PI * 2;
    const r = radius * scale * k;
    return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
  });
}
