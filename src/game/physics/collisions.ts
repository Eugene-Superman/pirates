import { clamp } from '../lib/math';
import { closestBetweenSegments, closestOnPolygon, insidePolygon, type Segment } from '../lib/geometry';
import type { Ship } from '../ships/Ship';
import { WORLD_HEIGHT, WORLD_WIDTH, type Island } from '../world/World';
import { bodyAxis, hullMass, hullReach } from './hull';

const PASSES = 3; // rounds of pushing apart: one push can shove a ship into something else
const SKIN = 0.01; // world units pushed beyond touching, so the next check doesn't find the same contact

/** What a ship can bump into. Islands stay put; ships push each other apart by their mass */
export interface Obstacles {
  readonly islands: readonly Island[];
  readonly ships: readonly Ship[];
}

/**
 * Pushes a ship out of everything its hull overlaps and takes away the part of its speed that went into it, so it
 * slides along a coast or another hull instead of sailing through. Run after every movement step
 */
export function collideShip(ship: Ship, obstacles: Obstacles) {
  for (let pass = 0; pass < PASSES; pass++) {
    let touched = false;
    for (const island of obstacles.islands) touched = pushOutOfIsland(ship, island) || touched;
    for (const other of obstacles.ships) {
      if (other !== ship) touched = pushApart(ship, other) || touched;
    }
    if (!touched) break;
  }
  const reach = hullReach(ship.hull);
  ship.x = clamp(ship.x, reach, WORLD_WIDTH - reach);
  ship.y = clamp(ship.y, reach, WORLD_HEIGHT - reach);
}

function pushOutOfIsland(ship: Ship, island: Island) {
  if (Math.hypot(ship.x - island.x, ship.y - island.y) > island.reach + hullReach(ship.hull)) return false;
  const axis = bodyAxis(ship);
  const { halfBeam } = ship.hull;
  let best: { nx: number; ny: number; depth: number } | null = null;

  // Part of the hull's middle line on land: push that point back to the coast and a half beam beyond
  for (const [px, py] of [
    [axis.ax, axis.ay],
    [axis.bx, axis.by],
    [(axis.ax + axis.bx) / 2, (axis.ay + axis.by) / 2],
  ] as const) {
    if (!insidePolygon(px, py, island.coast)) continue;
    const q = closestOnPolygon(px, py, island.coast);
    const d = Math.hypot(q.x - px, q.y - py);
    // Pointing out of the island: from the point to the coast, or from the centre if it sits right on it
    const [nx, ny] = d > 1e-9 ? [(q.x - px) / d, (q.y - py) / d] : away(px, py, island.x, island.y);
    const depth = d + halfBeam;
    if (!best || depth > best.depth) best = { nx, ny, depth };
  }

  // The hull's side over the beach: the coast is nearer to the middle line than half the beam
  if (!best) {
    const coast = island.coast;
    for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) {
      const edge: Segment = { ax: coast[j].x, ay: coast[j].y, bx: coast[i].x, by: coast[i].y };
      const { p1, p2 } = closestBetweenSegments(axis, edge);
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (d >= halfBeam) continue;
      const [nx, ny] = d > 1e-9 ? [(p1.x - p2.x) / d, (p1.y - p2.y) / d] : away(p1.x, p1.y, island.x, island.y);
      const depth = halfBeam - d;
      if (!best || depth > best.depth) best = { nx, ny, depth };
    }
  }
  if (!best) return false;
  push(ship, best.nx, best.ny, best.depth);
  return true;
}

/** Two ships overlapping are pushed apart, each by the other's share of their mass */
function pushApart(ship: Ship, other: Ship) {
  const reach = hullReach(ship.hull) + hullReach(other.hull);
  if (Math.abs(ship.x - other.x) > reach || Math.abs(ship.y - other.y) > reach) return false;
  const { p1, p2 } = closestBetweenSegments(bodyAxis(ship), bodyAxis(other));
  const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const overlap = ship.hull.halfBeam + other.hull.halfBeam - d;
  if (overlap <= 0) return false;
  // Middle lines crossing: apart along the line between the two positions
  const [nx, ny] = d > 1e-9 ? [(p1.x - p2.x) / d, (p1.y - p2.y) / d] : away(ship.x, ship.y, other.x, other.y);
  const mine = hullMass(ship.hull);
  const theirs = hullMass(other.hull);
  push(ship, nx, ny, (overlap * theirs) / (mine + theirs));
  push(other, -nx, -ny, (overlap * mine) / (mine + theirs));
  return true;
}

/** Moves the ship along the unit vector n and takes away its speed into the obstacle (all of it head-on) */
function push(ship: Ship, nx: number, ny: number, depth: number) {
  ship.x += nx * (depth + SKIN);
  ship.y += ny * (depth + SKIN);
  const into = Math.cos(ship.rotation) * nx + Math.sin(ship.rotation) * ny;
  if (into < 0) ship.speed *= 1 + into;
}

/** Unit vector from (fromX, fromY) to (x, y); east when they coincide */
function away(x: number, y: number, fromX: number, fromY: number): [number, number] {
  const d = Math.hypot(x - fromX, y - fromY);
  return d > 1e-9 ? [(x - fromX) / d, (y - fromY) / d] : [1, 0];
}
