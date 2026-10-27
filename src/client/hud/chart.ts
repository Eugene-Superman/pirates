import type { Graphics } from 'pixi.js';
import {
  MAP_SQUARE,
  MAP_SQUARES,
  zoneBoss,
  type GameState,
  type GatePlace,
  type Island,
  type Ship,
  type ZoneId,
} from '../../game';

/**
 * Which way the screen's right and up point on the water (unit vectors in world coordinates). The maps turn the world
 * the same way as the camera, so up on a map is up on the screen; only the camera's tilt is left out
 */
export interface MapAxes {
  readonly rightX: number;
  readonly rightY: number;
  readonly upX: number;
  readonly upY: number;
}

/** The map's colors, shared by the minimap and the sea chart */
export const CHART = {
  sea: 0x123f5c,
  seen: 0x1d6283, // the water the ship can see
  grid: 0xffffff,
  island: 0xd9c48a,
  coast: 0x6b5a2e,
  me: 0xf2b33d,
  route: 0xffffff,
  lost: 0xff8a2a, // the player's cargo floating where their ship went down
  boss: 0xff4a3a,
  gate: 0x7fe3ff, // a gate to another sea
} as const;

/** Where a sea's boss has its lair, if it has a boss */
export function bossLair(zone: ZoneId) {
  return zoneBoss(zone)?.boss?.lair ?? null;
}

const LETTER_A = 65;

/** The name of the square of the map a point is in: the column's letter (west to east), the row's number (north to south) */
export function squareName(x: number, y: number) {
  const col = Math.min(Math.max(Math.floor(x / MAP_SQUARE), 0), MAP_SQUARES - 1);
  const row = Math.min(Math.max(Math.floor(y / MAP_SQUARE), 0), MAP_SQUARES - 1);
  return `${columnName(col)}${row + 1}`;
}

export function columnName(col: number) {
  return String.fromCharCode(LETTER_A + col);
}

/** World → map pixels: `center` (a world point) lands on `screen`, `scale` pixels per world unit, turned by the axes */
export class MapProjection {
  readonly axes: MapAxes;
  scale = 1;
  centerX = 0;
  centerY = 0;
  screenX = 0;
  screenY = 0;

  constructor(axes: MapAxes) {
    this.axes = axes;
  }

  x(wx: number, wy: number) {
    const { rightX, rightY } = this.axes;
    return this.screenX + ((wx - this.centerX) * rightX + (wy - this.centerY) * rightY) * this.scale;
  }

  y(wx: number, wy: number) {
    const { upX, upY } = this.axes;
    return this.screenY - ((wx - this.centerX) * upX + (wy - this.centerY) * upY) * this.scale;
  }

  /** The world point under a map pixel */
  toWorld(sx: number, sy: number) {
    const { rightX, rightY, upX, upY } = this.axes;
    const u = (sx - this.screenX) / this.scale;
    const v = (this.screenY - sy) / this.scale;
    return { x: this.centerX + u * rightX + v * upX, y: this.centerY + u * rightY + v * upY };
  }

  /** A world direction (radians) as a unit vector on the map */
  direction(angle: number) {
    const { rightX, rightY, upX, upY } = this.axes;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: cos * rightX + sin * rightY, y: -(cos * upX + sin * upY) };
  }
}

export function drawIsland(g: Graphics, island: Island, map: MapProjection, coastWidth: number) {
  const points: number[] = [];
  // Every point: the port's walls are a few points of its coast
  for (const p of island.coast) points.push(map.x(p.x, p.y), map.y(p.x, p.y));
  g.poly(points).fill({ color: CHART.island });
  if (coastWidth > 0) g.poly(points).stroke({ width: coastWidth, color: CHART.coast, alpha: 0.8 });
}

/** The ship as an arrow along its heading, `size` pixels long */
export function drawShipArrow(g: Graphics, ship: Ship, map: MapProjection, size: number) {
  const x = map.x(ship.x, ship.y);
  const y = map.y(ship.x, ship.y);
  const d = map.direction(ship.rotation);
  const nx = -d.y;
  const ny = d.x;
  const back = size * 0.45;
  const half = size * 0.38;
  g.poly([
    x + d.x * size * 0.55,
    y + d.y * size * 0.55,
    x - d.x * back + nx * half,
    y - d.y * back + ny * half,
    x - d.x * back * 0.4,
    y - d.y * back * 0.4,
    x - d.x * back - nx * half,
    y - d.y * back - ny * half,
  ])
    .fill({ color: CHART.me })
    .stroke({ width: 1.2, color: 0x1b1b1b, alpha: 0.9 });
}

/** The ship's way on: from it along the route left to sail */
export function drawRoute(g: Graphics, ship: Ship, map: MapProjection, width: number) {
  if (!ship.target || ship.route.length === 0) return;
  g.moveTo(map.x(ship.x, ship.y), map.y(ship.x, ship.y));
  for (const p of ship.route) g.lineTo(map.x(p.x, p.y), map.y(p.x, p.y));
  g.stroke({ width, color: CHART.route, alpha: 0.55 });
  const end = ship.route[ship.route.length - 1];
  g.circle(map.x(end.x, end.y), map.y(end.x, end.y), width * 2).fill({ color: CHART.route, alpha: 0.8 });
}

/**
 * What a captain keeps on their chart whether they see it or not: their own cargo floating where their ship went down,
 * an orange diamond in a ring. `size` scales it, pixels
 */
export function drawLostCargo(g: Graphics, state: GameState, map: MapProjection, size: number) {
  for (const chest of state.chests) {
    if (chest.lostBy !== state.ship.id) continue;
    const x = map.x(chest.x, chest.y);
    const y = map.y(chest.x, chest.y);
    g.circle(x, y, size * 1.6).stroke({ width: 1.5, color: CHART.lost, alpha: 0.9 });
    g.poly([x, y - size, x + size, y, x, y + size, x - size, y])
      .fill({ color: CHART.lost })
      .stroke({ width: 1, color: 0x3a1800 });
  }
}

/** The sea's gates to other seas: a pale blue ring round an arrow out. `size` scales them, pixels */
export function drawGates(g: Graphics, map: MapProjection, gates: readonly GatePlace[], size: number) {
  for (const gate of gates) {
    const x = map.x(gate.x, gate.y);
    const y = map.y(gate.x, gate.y);
    g.circle(x, y, size * 1.9).stroke({ width: 2, color: CHART.gate, alpha: 0.9 });
    g.poly([x - size, y - size * 0.8, x + size, y, x - size, y + size * 0.8]).fill({ color: CHART.gate });
  }
}

/** A sea's boss's lair, seen or not: a red ring round a dot. `size` scales it, pixels */
export function drawBossLair(g: Graphics, map: MapProjection, size: number, zone: ZoneId) {
  const lair = bossLair(zone);
  if (!lair) return;
  const x = map.x(lair.x, lair.y);
  const y = map.y(lair.x, lair.y);
  g.circle(x, y, size * 1.8).stroke({ width: 2, color: CHART.boss, alpha: 0.85 });
  g.circle(x, y, size * 0.6).fill({ color: CHART.boss });
}
