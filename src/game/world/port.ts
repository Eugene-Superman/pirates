import type { GameState } from '../GameState';
import { insidePolygon, type Point } from '../lib/geometry';
import { createRandom, streamSeed } from '../lib/random';
import type { Ship } from '../ships/Ship';
import { BEACH, coastAt, coastShape, coastline } from './islandShape';
import { WORLD_HEIGHT, WORLD_WIDTH } from './map';
import type { Island } from './World';

// The port's island in the middle of the world, its harbour facing the camera (south-west on the map is the bottom of
// the screen), so the pier and the town are in sight as a ship comes in
const HARBOUR_ANGLE = (3 * Math.PI) / 4; // radians from the island's centre to its harbour
const RADIUS = 160; // world units
const LAND = 5; // world units the town's land rises above the beach
const HILL = 24; // world units: the hill behind the town
const PIER_LENGTH = 48; // world units from the beach out into the bay
const MOORING_SIDE = 13; // world units beside the pier's end, where a ship lies alongside
const ROADSTEAD = 120; // world units out from the pier's end: where ships come out of the port (and in, after a wreck)
const PORT_STREAM = 101; // of the map's seed (42): the port island's coast
/** World units from its mooring a ship comes into port */
export const DOCK_RADIUS = 24; // a little more than the pilot's ARRIVE_DISTANCE: a ship sent to the mooring stops within it
// World units it must sail out beyond DOCK_RADIUS after leaving before it docks again: Leave doesn't dock it at once
const UNDOCK_MARGIN = 40;

/** The port: an island with a pier, the only place to buy, take quests and turn them in */
export interface Port {
  readonly name: string;
  readonly island: Island;
  /** Radians from the island's centre out to the harbour */
  readonly harbour: number;
  /** Where the pier leaves the beach, and its end in the bay */
  readonly pierRoot: Point;
  readonly pierEnd: Point;
  /** Where a ship lies alongside the pier: within DOCK_RADIUS of it, a player's ship is in port */
  readonly mooring: Point;
  /** Open water off the harbour: ships leaving port sail there, and wrecked ones come back there */
  readonly roadstead: Point;
}

function createPort(): Port {
  const x = WORLD_WIDTH / 2;
  const y = WORLD_HEIGHT / 2;
  // A wide island lying across the harbour's direction, with a bay for the harbour
  const shape = coastShape(
    {
      elongation: 1.4,
      heading: HARBOUR_ANGLE + Math.PI / 2,
      lobes: [{ angle: HARBOUR_ANGLE, size: -0.3, width: (34 * Math.PI) / 180 }],
      rough: 0.05,
    },
    createRandom(streamSeed(42, PORT_STREAM)),
  );
  const coast = coastline(x, y, RADIUS, shape, 1);
  const out = { x: Math.cos(HARBOUR_ANGLE), y: Math.sin(HARBOUR_ANGLE) };
  const side = { x: -out.y, y: out.x };
  const beach = RADIUS * coastAt(shape, HARBOUR_ANGLE);
  const along = (from: Point, distance: number, dir = out) => ({
    x: from.x + dir.x * distance,
    y: from.y + dir.y * distance,
  });
  const pierRoot = along({ x, y }, beach * 0.95);
  const pierEnd = along(pierRoot, PIER_LENGTH);
  // Palms on the hill behind the town, away from the harbour
  const palms = [0.6, 1.4, 2.6, 3.4, 4.4].map((turn, i) => {
    const angle = HARBOUR_ANGLE + Math.PI + (turn - 2.5) * 0.45;
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
      reach: RADIUS * Math.max(...shape),
      height: BEACH + LAND,
      hillHeight: HILL,
      palms,
    },
    harbour: HARBOUR_ANGLE,
    pierRoot,
    pierEnd,
    mooring: along(pierEnd, MOORING_SIDE, side),
    roadstead: along(pierEnd, ROADSTEAD),
  };
}

/** The one port, made once: the same on every run */
export const PORT = createPort();

/** Whether a point is on the port's island or by its pier: a click there means "go into port" */
export function onPort(port: Port, x: number, y: number) {
  const { mooring } = port;
  return insidePolygon(x, y, port.island.coast) || Math.hypot(x - mooring.x, y - mooring.y) < PIER_LENGTH + DOCK_RADIUS;
}

/**
 * Players' ships that sailed up to the mooring come into port: stopped, out of the fight (bots leave them be), until
 * they leave. A ship that has just left must first sail out beyond UNDOCK_MARGIN. Stepped from Game.update
 */
export function stepDocking(state: GameState) {
  const { mooring } = state.world.port;
  for (const ship of state.ships) {
    if (ship.bot || ship.isSinking || ship.docked) continue;
    const distance = Math.hypot(ship.x - mooring.x, ship.y - mooring.y);
    if (distance > DOCK_RADIUS + UNDOCK_MARGIN) ship.mayDock = true;
    if (ship.mayDock && distance < DOCK_RADIUS) ship.dock();
  }
}

/** A player's ship leaves port: it sails out to the roadstead */
export function leavePort(state: GameState, ship: Ship) {
  if (!ship.docked) return;
  ship.undock();
  const { roadstead } = state.world.port;
  ship.setTarget(roadstead.x, roadstead.y);
}
