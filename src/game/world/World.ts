import type { Point } from '../lib/geometry';
import { createRandom } from '../lib/random';
import { coastAt, coastline, randomIslandShape } from './islandShape';
import { MAP_SQUARES, WORLD_HEIGHT, WORLD_WIDTH } from './map';
import { PORT, type Port } from './port';

export { MAP_SQUARE, MAP_SQUARES, WORLD_HEIGHT, WORLD_WIDTH } from './map';
/** Where a player's ship comes into the game, and comes back after it was sunk: off the port in the middle */
export const START: Point = PORT.roadstead;

export interface Palm {
  x: number;
  y: number;
  leanX: number;
  leanY: number;
}

const ISLANDS_PER_SQUARE = 0.375; // on average: 24 islands on an 8 × 8 map, open sea between them
const ISLAND_COUNT = Math.round(ISLANDS_PER_SQUARE * MAP_SQUARES * MAP_SQUARES);
const PLACING_TRIES = 60; // per island: a spot that is too near another island or the start is thrown away
const START_CLEARANCE = 400; // world units of open water round the start (off the port) beyond an island's reach
const ISLAND_GAP = 150; // world units between two islands' reach at least

export interface Island {
  x: number;
  y: number;
  /** World units: a circle of the island's area */
  radius: number;
  shape: readonly number[]; // the coastline's radius by angle (from east, clockwise on the map), as shares of radius
  /** The coastline (the edge of the beach): what ships collide with and sail around */
  coast: Point[];
  /** Distance from the centre to the farthest point of the coast */
  reach: number;
  height: number; // plateau height above the water
  hillHeight: number; // height of the hill on the plateau (0 = no hill)
  palms: Palm[];
}

// Only what affects gameplay. Decorations live on the client
export interface WorldData {
  /** The port's island first, then the rest */
  islands: Island[];
  port: Port;
}

// A fixed seed keeps the map the same on every run
export function createWorld(): WorldData {
  return {
    islands: [PORT.island, ...createIslands(ISLAND_COUNT, createRandom(42), [PORT.island])],
    port: PORT,
  };
}

/** Island coastline points, scaled relative to the island's radius */
export function islandOutline(island: Island, scale: number) {
  return coastline(island.x, island.y, island.radius, island.shape, scale);
}

/** `count` islands round the ones already there (`placed`), which they keep clear of */
function createIslands(count: number, random: () => number, placed: readonly Island[]): Island[] {
  const islands: Island[] = [];
  // Every island its own shape: a spot that doesn't fit throws its island away, the next try makes a new one
  for (let attempt = 0; attempt < count * PLACING_TRIES && islands.length < count; attempt++) {
    const { radius, shape, height, hillHeight } = randomIslandShape(random);
    const reach = radius * Math.max(...shape);
    const x = reach + 100 + random() * (WORLD_WIDTH - 2 * (reach + 100));
    const y = reach + 100 + random() * (WORLD_HEIGHT - 2 * (reach + 100));

    if (Math.hypot(x - START.x, y - START.y) < reach + START_CLEARANCE) continue;
    const near = (o: Island) => Math.hypot(x - o.x, y - o.y) < reach + o.reach + ISLAND_GAP;
    if (islands.some(near) || placed.some(near)) continue;

    // Palms round the hill when there is one, anywhere on the land otherwise; by the coast's radius at their angle,
    // so none stands in a bay
    const palms = Array.from({ length: 2 + Math.floor(random() * 4) }, () => {
      const angle = random() * Math.PI * 2;
      const dist = radius * coastAt(shape, angle) * (hillHeight > 0 ? 0.5 + random() * 0.08 : random() * 0.45);
      const leanAngle = random() * Math.PI * 2;
      const lean = 3 + random() * 5;
      return {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        leanX: Math.cos(leanAngle) * lean,
        leanY: Math.sin(leanAngle) * lean,
      };
    });
    const coast = coastline(x, y, radius, shape, 1);
    islands.push({ x, y, radius, shape, coast, reach, height, hillHeight, palms });
  }

  return islands;
}
