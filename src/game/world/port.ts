import type { GameState } from '../GameState';
import { insidePolygon, signedDistanceToPolygon, type Point } from '../lib/geometry';
import { createRandom, streamSeed } from '../lib/random';
import type { Ship } from '../ships/Ship';
import { BEACH, COAST_SEGMENTS, coastAt, coastShape, coastline } from './islandShape';
import { WORLD_HEIGHT, WORLD_WIDTH } from './map';
import type { Island } from './World';

// The port's island in the middle of the world, its harbour facing the camera (south-west on the map is the bottom of
// the screen): two stone walls run out from a straight stretch of its coast, their heads turned in towards each other,
// and a ship that sails in between them is in port
const HARBOUR_ANGLE = (3 * Math.PI) / 4; // radians from the island's centre to its harbour
const RADIUS = 260; // world units: a circle of the island's area
const LAND = 5; // world units the town's land rises above the beach
const HILL = 30; // world units: the hill behind the town
const PORT_STREAM = 101; // of the map's seed (42): the port island's coast
// The harbour, world units: the basin between the walls (how wide, and how far the walls run out from the quay), how
// far each wall's head turns in (the entrance is BASIN_WIDTH − 2 × HEAD_TURN wide), and how far back on the beach the
// walls start (behind the coast is land anyway: that part is only drawn)
const BASIN_WIDTH = 180;
const WALL_LENGTH = 200;
const HEAD_TURN = 45;
const WALL_ROOT = 24;
/** World units across a harbour wall */
export const WALL_THICKNESS = 16;
const STRAIGHT_MARGIN = 30; // world units of straight coast beyond each wall
const BLEND = 0.35; // radians beyond the straight coast over which it bends back into the island's own
const MOORING = 45; // world units out from the quay: where a ship in port lies, in the middle of the basin
const ROADSTEAD = 110; // world units out from the walls' heads: where ships come out of the port (and in, after a wreck)
// World units a ship must sail out beyond the basin after leaving port before it docks again: Leave doesn't dock it at once
const UNDOCK_MARGIN = 40;
// World units round the basin where no bot comes into the game or wanders to: the way into port stays clear
const HARBOUR_CLEAR = 80;

/** A stretch of a harbour wall: its middle line, WALL_THICKNESS across */
export interface WallPiece {
  readonly from: Point;
  readonly to: Point;
}

/** One of the two harbour walls: from the beach out to its end (`body`), and its head turned in towards the other */
export interface HarbourWall {
  readonly body: WallPiece;
  readonly head: WallPiece;
}

/** The port: an island with a walled harbour, the only place to buy, take quests and turn them in */
export interface Port {
  readonly name: string;
  /** The island. Its coast runs round the walls too: they are what ships bump into and sail round */
  readonly island: Island;
  /** Radians from the island's centre out to the harbour */
  readonly harbour: number;
  readonly walls: readonly [HarbourWall, HarbourWall];
  /** The quay at the back of the basin, from one wall to the other: the coast there */
  readonly quay: WallPiece;
  /** The water between the walls, out to their heads: a player's ship that sails in is in port */
  readonly basin: readonly Point[];
  /** Where a ship in port lies: in the basin, off the quay */
  readonly mooring: Point;
  /** Open water off the entrance: ships leaving port sail there, and wrecked ones come back there */
  readonly roadstead: Point;
}

/**
 * The island's own coast (`shape`, radii by angle) made straight where the harbour is: on the line `quay` (a share of
 * the radius) out from the centre, up to `straight` radians either side of the harbour, then bending back
 */
function straightened(shape: readonly number[], straight: number, quay: number) {
  return shape.map((r, i) => {
    const angle = (i / COAST_SEGMENTS) * Math.PI * 2;
    const off = Math.abs(Math.atan2(Math.sin(angle - HARBOUR_ANGLE), Math.cos(angle - HARBOUR_ANGLE)));
    // On the straight line `quay` out from the centre
    const flat = quay / Math.cos(Math.min(off, straight));
    if (off <= straight) return flat;
    if (off >= straight + BLEND) return r;
    const t = (off - straight) / BLEND;
    return flat + (r - flat) * t * t * (3 - 2 * t);
  });
}

function createPort(): Port {
  const x = WORLD_WIDTH / 2;
  const y = WORLD_HEIGHT / 2;
  const out = { x: Math.cos(HARBOUR_ANGLE), y: Math.sin(HARBOUR_ANGLE) };
  const side = { x: -out.y, y: out.x };
  // A point of the harbour: u out from the island's centre towards it, v across, along the quay
  const at = (u: number, v: number): Point => ({ x: x + out.x * u + side.x * v, y: y + out.y * u + side.y * v });
  const across = (p: Point) => (p.x - x) * side.x + (p.y - y) * side.y;
  const along = (p: Point) => (p.x - x) * out.x + (p.y - y) * out.y;

  const half = BASIN_WIDTH / 2;
  const outer = half + WALL_THICKNESS; // the walls' outer sides
  // A wide island lying across the harbour's direction; the quay where its coast meets that direction
  const own = coastShape(
    { elongation: 1.4, heading: HARBOUR_ANGLE + Math.PI / 2, lobes: [], rough: 0.05 },
    createRandom(streamSeed(42, PORT_STREAM)),
  );
  const quayShare = coastAt(own, HARBOUR_ANGLE);
  const quay = quayShare * RADIUS;
  const shape = straightened(own, Math.atan((outer + STRAIGHT_MARGIN) / quay), quayShare);
  const head = quay + WALL_LENGTH; // the heads' outer side
  const inner = head - WALL_THICKNESS; // the heads' inner side

  // The coast: the island's, with the walls standing out of it. Its points between the walls' outer sides lie on the
  // quay's line, so the walls and the quay take their place; going round the coast, `across` grows past the harbour
  // prettier-ignore
  const harbourCoast = [
    at(quay, -outer), at(head, -outer), at(head, -half + HEAD_TURN), at(inner, -half + HEAD_TURN), at(inner, -half),
    at(quay, -half), at(quay, half),
    at(inner, half), at(inner, half - HEAD_TURN), at(head, half - HEAD_TURN), at(head, outer), at(quay, outer),
  ];
  const natural = coastline(x, y, RADIUS, shape, 1);
  const behindWalls = (p: Point) => along(p) > 0 && Math.abs(across(p)) < outer;
  const start = natural.findIndex((p) => !behindWalls(p));
  const coast: Point[] = [];
  let walled = false;
  for (let k = 0; k < natural.length; k++) {
    const p = natural[(start + k) % natural.length];
    if (!behindWalls(p)) coast.push(p);
    else if (!walled) {
      coast.push(...harbourCoast);
      walled = true;
    }
  }

  const wall = (s: number): HarbourWall => ({
    body: {
      from: at(quay - WALL_ROOT, s * (outer - WALL_THICKNESS / 2)),
      to: at(head, s * (outer - WALL_THICKNESS / 2)),
    },
    head: {
      from: at(inner + WALL_THICKNESS / 2, s * half),
      to: at(inner + WALL_THICKNESS / 2, s * (half - HEAD_TURN)),
    },
  });
  // Palms on the hill behind the town, away from the harbour
  const palms = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const angle = HARBOUR_ANGLE + Math.PI + (i - 3) * 0.32;
    const dist = RADIUS * coastAt(shape, angle) * 0.55;
    return {
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      leanX: Math.cos(i * 2.1) * 4,
      leanY: Math.sin(i * 2.1) * 4,
    };
  });
  return {
    name: 'Saltwind Harbour',
    island: {
      x,
      y,
      radius: RADIUS,
      shape,
      coast,
      reach: Math.max(...coast.map((p) => Math.hypot(p.x - x, p.y - y))),
      height: BEACH + LAND,
      hillHeight: HILL,
      palms,
    },
    harbour: HARBOUR_ANGLE,
    walls: [wall(-1), wall(1)],
    quay: { from: at(quay, -half), to: at(quay, half) },
    // prettier-ignore
    basin: [
      at(quay, -half), at(inner, -half), at(inner, -half + HEAD_TURN), at(head, -half + HEAD_TURN),
      at(head, half - HEAD_TURN), at(inner, half - HEAD_TURN), at(inner, half), at(quay, half),
    ],
    mooring: at(quay + MOORING, 0),
    roadstead: at(head + ROADSTEAD, 0),
  };
}

/** The one port, made once: the same on every run */
export const PORT = createPort();

/** Whether a point is on the port's island, its walls or in its basin: a click there means "go into port" */
export function onPort(port: Port, x: number, y: number) {
  return insidePolygon(x, y, port.island.coast) || insidePolygon(x, y, port.basin);
}

/** Whether a point is in the harbour or near its entrance: no bot comes into the game or wanders there */
export function nearHarbour(port: Port, x: number, y: number) {
  return signedDistanceToPolygon(x, y, port.basin) < HARBOUR_CLEAR;
}

/**
 * Players' ships that sail in between the walls come into port: out of the fight (bots leave them be), they sail on
 * to the mooring and lie there until they leave. A ship that has just left must first sail out beyond UNDOCK_MARGIN.
 * Stepped from Game.update
 */
export function stepDocking(state: GameState) {
  const { basin, mooring } = state.world.port;
  for (const ship of state.ships) {
    if (ship.bot || ship.isSinking || ship.docked) continue;
    const distance = signedDistanceToPolygon(ship.x, ship.y, basin);
    if (distance > UNDOCK_MARGIN) ship.mayDock = true;
    if (ship.mayDock && distance < 0) ship.dock(mooring);
  }
}

/** A player's ship leaves port: it sails out through the entrance to the roadstead */
export function leavePort(state: GameState, ship: Ship) {
  if (!ship.docked) return;
  ship.undock();
  const { roadstead } = state.world.port;
  ship.setTarget(roadstead.x, roadstead.y);
}
