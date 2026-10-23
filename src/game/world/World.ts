import type { Point } from '../lib/geometry';
import { createRandom } from '../lib/random';
import ISLAND_SHAPES from './islandShapes.json';

export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;
/** Where a player's ship comes into the game, and comes back after it was sunk: the middle of the world */
export const START: Point = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

export interface Palm {
  x: number;
  y: number;
  leanX: number;
  leanY: number;
}

/**
 * The island shapes the whole map is made of, written by blender-assets/islands/build_islands.py together with their
 * pictures: the coastline as radius multipliers by angle (from east, clockwise on the map), the reference radius,
 * heights of the land and of the highest hill. Islands are these shapes, scaled a little
 */
export interface IslandShape {
  readonly id: string;
  readonly radius: number;
  readonly shape: readonly number[];
  readonly height: number;
  readonly hillHeight: number;
}
export const ISLAND_SHAPE_LIST: readonly IslandShape[] = ISLAND_SHAPES;

const ISLAND_COUNT = 25;
const ISLAND_SCALE = [0.85, 1.15] as const; // how much an island may differ in size from its shape
const START_CLEARANCE = 400; // world units of open water round the start beyond an island's reach
const ISLAND_GAP = 150; // world units between two islands' reach at least

export interface Island {
  x: number;
  y: number;
  /** Which of ISLAND_SHAPE_LIST it is, and how much bigger than it (1 = as drawn) */
  shapeId: string;
  scale: number;
  radius: number;
  shape: readonly number[]; // radius multipliers of the coastline, one per segment
  /** The coastline (the edge of the beach): what ships collide with and sail around */
  coast: Point[];
  /** Distance from the centre to the farthest point of the coast */
  reach: number;
  height: number; // plateau height above the water
  hillHeight: number; // height of the hill on the plateau (0 = no hill)
  palms: Palm[];
}

// Only what affects gameplay. Decorations like waves live on the client
export interface WorldData {
  islands: Island[];
}

// A fixed seed keeps the map the same on every run
export function createWorld(): WorldData {
  return {
    islands: createIslands(ISLAND_COUNT, createRandom(42)),
  };
}

/** Island coastline points, scaled relative to the island's radius */
export function islandOutline(island: Island, scale: number) {
  return coastline(island.x, island.y, island.radius, island.shape, scale);
}

function coastline(x: number, y: number, radius: number, shape: readonly number[], scale: number): Point[] {
  return shape.map((k, i) => {
    const angle = (i / shape.length) * Math.PI * 2;
    const r = radius * scale * k;
    return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
  });
}

function createIslands(count: number, random: () => number): Island[] {
  const islands: Island[] = [];
  // The shapes take turns in a shuffled order, so each of them is on the map two or three times
  const order = ISLAND_SHAPE_LIST.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (let attempt = 0; attempt < 2000 && islands.length < count; attempt++) {
    const template = ISLAND_SHAPE_LIST[order[islands.length % order.length]];
    const scale = ISLAND_SCALE[0] + random() * (ISLAND_SCALE[1] - ISLAND_SCALE[0]);
    const radius = template.radius * scale;
    const reach = radius * Math.max(...template.shape);
    const x = reach + 100 + random() * (WORLD_WIDTH - 2 * (reach + 100));
    const y = reach + 100 + random() * (WORLD_HEIGHT - 2 * (reach + 100));

    if (Math.hypot(x - START.x, y - START.y) < reach + START_CLEARANCE) continue;
    if (islands.some((o) => Math.hypot(x - o.x, y - o.y) < reach + o.reach + ISLAND_GAP)) continue;

    const height = template.height * scale;
    const hillHeight = template.hillHeight * scale;
    // Palms for the simple low-poly look; the textured looks have their plants in the pictures
    const palms = Array.from({ length: 2 + Math.floor(random() * 4) }, () => {
      const angle = random() * Math.PI * 2;
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
    const shape = template.shape;
    const coast = coastline(x, y, radius, shape, 1);
    islands.push({ x, y, shapeId: template.id, scale, radius, shape, coast, reach, height, hillHeight, palms });
  }

  return islands;
}
