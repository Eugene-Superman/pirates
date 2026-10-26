import type { GameState } from '../GameState';
import { insidePolygon, signedDistanceToPolygon, type Point } from '../lib/geometry';
import { createRandom, streamSeed } from '../lib/random';
import type { Ship } from '../ships/Ship';
import { BEACH, COAST_SEGMENTS, coastAt, coastShape, coastline } from './islandShape';
import { WORLD_HEIGHT, WORLD_WIDTH } from './map';
import type { Island } from './World';

// The port's island in the middle of the world, its harbour facing the camera (south-west on the map is the bottom of
// the screen): a bay in the island's coast with a stone quay round its back, and two breakwaters curving out from the
// headlands either side of it towards each other. A ship that sails in between them is in port
const HARBOUR_ANGLE = (3 * Math.PI) / 4; // radians from the island's centre to its harbour
const RADIUS = 260; // world units: a circle of the island's area
const LAND = 5; // world units the town's land rises above the beach
const HILL = 30; // world units: the hill behind the town
const PORT_STREAM = 101; // of the map's seed (42): the port island's coast
// Capes and coves along the rest of its coast: radians from the harbour's direction, size (a share of the radius: a
// cape +, a cove −), width (radians)
const LOBES = [
  { at: 1.15, size: 0.14, width: 0.22 },
  { at: -1.3, size: 0.12, width: 0.24 },
  { at: 2.2, size: -0.1, width: 0.28 },
  { at: Math.PI + 0.45, size: 0.09, width: 0.3 },
] as const;
const ROUGH = 0.1; // how jagged the coast is
// The harbour in its own frame, world units: out from where the island's coast would be without the bay (− into the
// island), and across (− on the left of a ship sailing in). The bay's shore runs through these points from headland
// to headland, smoothed, and SPLICE across either side of the harbour into the island's own coast
// prettier-ignore
const BAY: readonly (readonly [number, number])[] = [
  [10, -132], [-2, -108], [-20, -82], [-33, -50], [-40, -14], [-38, 20], [-30, 52], [-16, 80], [2, 104], [12, 126],
];
const SPLICE = 165;
// The breakwaters' middle lines, from the headlands out to their heads, smoothed: a long one sweeping round in front of
// the bay, a short one; the entrance between their heads looks out to one side. Each also runs WALL_ROOT back into the
// land it rises out of
// prettier-ignore
const WALL_LINES: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 112], [46, 126], [104, 120], [158, 90], [194, 48], [212, 4], [214, -22]],
  [[-2, -114], [40, -126], [86, -124], [118, -110], [136, -96]],
];
const WALL_ROOT = 24;
/** World units across a harbour wall */
export const WALL_THICKNESS = 14;
const HEAD_POINTS = 7; // round a wall's rounded head
const STEP = 8; // world units between the points of a smoothed line
const MOORING = [5, 4] as const; // where a ship in port lies: in the bay, off the quay
const ROADSTEAD = [310, 0] as const; // off the entrance: where ships come out of the port (and in, after a wreck)
// World units a ship must sail out beyond the basin after leaving port before it docks again: Leave doesn't dock it at once
const UNDOCK_MARGIN = 40;
// World units round the basin where no bot comes into the game or wanders to: the way into port stays clear
const HARBOUR_CLEAR = 80;

/** A harbour wall: its middle line from the land out to its head, WALL_THICKNESS across */
export type HarbourWall = readonly Point[];

/** The port: an island with a walled harbour, the only place to buy, take quests and turn them in */
export interface Port {
  readonly name: string;
  /** The island. Its coast runs round the walls too: they are what ships bump into and sail round */
  readonly island: Island;
  /** Radians from the island's centre out to the harbour */
  readonly harbour: number;
  /** The island's own coast, the bay's shore in it: the land the walls stand on */
  readonly shore: readonly Point[];
  readonly walls: readonly [HarbourWall, HarbourWall];
  /** The quay round the back of the bay, from one wall to the other: the coast there */
  readonly quay: readonly Point[];
  /** The water inside the walls, out to their heads: a player's ship that sails in is in port */
  readonly basin: readonly Point[];
  /** Where a ship in port lies: in the bay, off the quay */
  readonly mooring: Point;
  /** Open water off the entrance: ships leaving port sail there, and wrecked ones come back there */
  readonly roadstead: Point;
}

/** A smooth line through the points (Catmull-Rom), a point about every STEP world units */
function smooth(points: readonly Point[]): Point[] {
  const line: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [
      points[Math.max(i - 1, 0)],
      points[i],
      points[i + 1],
      points[Math.min(i + 2, points.length - 1)],
    ];
    const n = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      line.push({ x: at(p0.x, p1.x, p2.x, p3.x), y: at(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  line.push(points[points.length - 1]);
  return line;
}

/** The line moved `by` world units to one side (− the other), each point along the mean of its two legs' normals */
function offset(line: readonly Point[], by: number): Point[] {
  return line.map((p, i) => {
    const a = line[Math.max(i - 1, 0)];
    const b = line[Math.min(i + 1, line.length - 1)];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: p.x - ((b.y - a.y) / length) * by, y: p.y + ((b.x - a.x) / length) * by };
  });
}

/** How far along p→q (0…1) it crosses r→s, or null where it doesn't */
function crossing(p: Point, q: Point, r: Point, s: Point) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const ex = s.x - r.x;
  const ey = s.y - r.y;
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((r.x - p.x) * ey - (r.y - p.y) * ex) / denominator;
  const u = ((r.x - p.x) * dy - (r.y - p.y) * dx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Where a path first crosses a line: the path's leg and the line's leg it happens on, and the point */
function firstCrossing(path: readonly Point[], line: readonly Point[]) {
  for (let i = 0; i < path.length - 1; i++) {
    let best: { t: number; leg: number } | null = null;
    for (let j = 0; j < line.length - 1; j++) {
      const t = crossing(path[i], path[i + 1], line[j], line[j + 1]);
      if (t !== null && (!best || t < best.t)) best = { t, leg: j };
    }
    if (best) {
      const p = path[i];
      const q = path[i + 1];
      return { leg: i, at: best.leg, point: { x: p.x + (q.x - p.x) * best.t, y: p.y + (q.y - p.y) * best.t } };
    }
  }
  throw new Error('A harbour wall never meets the shore');
}

/**
 * A wall's outline where it stands out of the shore: from the shore out along one side, round its head, back along the
 * other side to the shore, in the order the shore meets them (`from`, `to`: where on the shore it leaves and comes
 * back); and its side that faces the next wall along the shore (the basin's)
 */
function wallOutline(line: readonly Point[], shore: readonly Point[]) {
  const sides = [offset(line, WALL_THICKNESS / 2), offset(line, -WALL_THICKNESS / 2)];
  const meets = sides.map((side) => firstCrossing(side, shore));
  const first = meets[0].at <= meets[1].at ? 0 : 1;
  const [out, back] = [sides[first], sides[1 - first]];
  const [from, to] = [meets[first], meets[1 - first]];
  // The rounded head, from the first side round to the other
  const end = line[line.length - 1];
  const before = line[line.length - 2];
  const heading = Math.atan2(end.y - before.y, end.x - before.x);
  const turn = first === 0 ? -1 : 1;
  const head = Array.from({ length: HEAD_POINTS }, (_, k) => {
    const angle = heading + turn * (-Math.PI / 2 + (Math.PI * (k + 1)) / (HEAD_POINTS + 1));
    return { x: end.x + (Math.cos(angle) * WALL_THICKNESS) / 2, y: end.y + (Math.sin(angle) * WALL_THICKNESS) / 2 };
  });
  // The other side, from the head back to the shore
  const homeward = back.slice(to.leg + 1);
  homeward.reverse();
  const outline = [from.point, ...out.slice(from.leg + 1), ...head, ...homeward, to.point];
  return { outline, from, to, out: out.slice(from.leg + 1), homeward };
}

/** How far out from the centre a ray at `angle` last leaves a polygon */
function reachAlong(polygon: readonly Point[], cx: number, cy: number, angle: number) {
  const far = { x: cx + Math.cos(angle) * 10_000, y: cy + Math.sin(angle) * 10_000 };
  const centre = { x: cx, y: cy };
  let best = 0;
  polygon.forEach((p, i) => {
    const t = crossing(centre, far, p, polygon[(i + 1) % polygon.length]);
    if (t !== null) best = Math.max(best, t * 10_000);
  });
  return best;
}

function createPort(): Port {
  const x = WORLD_WIDTH / 2;
  const y = WORLD_HEIGHT / 2;
  const out = { x: Math.cos(HARBOUR_ANGLE), y: Math.sin(HARBOUR_ANGLE) };
  const side = { x: -out.y, y: out.x };
  // A point of the harbour: u out from the island's centre towards it, v across
  const at = (u: number, v: number): Point => ({ x: x + out.x * u + side.x * v, y: y + out.y * u + side.y * v });
  const across = (p: Point) => (p.x - x) * side.x + (p.y - y) * side.y;
  const along = (p: Point) => (p.x - x) * out.x + (p.y - y) * out.y;

  // A wide island lying across the harbour's direction, with capes and coves; the bay cut into it where the harbour is
  const own = coastShape(
    {
      elongation: 1.4,
      heading: HARBOUR_ANGLE + Math.PI / 2,
      lobes: LOBES.map((lobe) => ({ angle: HARBOUR_ANGLE + lobe.at, size: lobe.size, width: lobe.width })),
      rough: ROUGH,
    },
    createRandom(streamSeed(42, PORT_STREAM)),
  );
  const coastline0 = RADIUS * coastAt(own, HARBOUR_ANGLE);
  const natural = coastline(x, y, RADIUS, own, 1);
  // Where the island's own coast meets the lines SPLICE across either side of the harbour: its legs there
  const meet = (v: number) => {
    for (let i = 0; i < natural.length; i++) {
      const p = natural[i];
      const q = natural[(i + 1) % natural.length];
      const [a, b] = [across(p) - v, across(q) - v];
      if (a * b <= 0 && a !== b && along(p) > 0) {
        const t = a / (a - b);
        return { leg: i, point: { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t } };
      }
    }
    throw new Error('The port island is too small for its harbour');
  };
  const left = meet(-SPLICE);
  const right = meet(SPLICE);
  const bayShore = smooth([left.point, ...BAY.map(([u, v]) => at(coastline0 + u, v)), right.point]);
  // The island's own coast round the rest, from where the bay ends to where it starts
  const rest: Point[] = [];
  for (let i = (right.leg + 1) % natural.length; ; i = (i + 1) % natural.length) {
    rest.push(natural[i]);
    if (i === left.leg) break;
  }
  const shore = [...bayShore, ...rest];

  // The walls, and the coast round them: along the bay's shore, out round each wall where it stands out of it
  const walls = WALL_LINES.map((points) => {
    const line = points.map(([u, v]) => at(coastline0 + u, v));
    const [a, b] = line;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const root = { x: a.x - ((b.x - a.x) / length) * WALL_ROOT, y: a.y - ((b.y - a.y) / length) * WALL_ROOT };
    return smooth([root, ...line]);
  });
  const outlines = walls.map((line) => wallOutline(line, bayShore));
  // In the order the shore meets them
  outlines.sort((a, b) => a.from.at - b.from.at);
  const [first, second] = outlines;
  const coast = [
    ...bayShore.slice(0, first.from.at + 1),
    ...first.outline,
    ...bayShore.slice(first.to.at + 1, second.from.at + 1),
    ...second.outline,
    ...bayShore.slice(second.to.at + 1),
    ...rest,
  ];
  const quay = [first.to.point, ...bayShore.slice(first.to.at + 1, second.from.at + 1), second.from.point];
  // The basin: the bay inside the walls, closed across the entrance between their heads
  const basin = [...quay, ...second.out, ...first.homeward];
  // The coast's shares of the radius by angle, for drawing the island as an island until its picture has loaded
  const shape = Array.from(
    { length: COAST_SEGMENTS },
    (_, i) => reachAlong(shore, x, y, (i / COAST_SEGMENTS) * Math.PI * 2) / RADIUS,
  );
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
    shore,
    walls: [walls[0], walls[1]],
    quay,
    basin,
    mooring: at(coastline0 + MOORING[0], MOORING[1]),
    roadstead: at(coastline0 + ROADSTEAD[0], ROADSTEAD[1]),
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
