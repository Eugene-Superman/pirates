import type { Graphics } from 'pixi.js';
import {
  BOT_KINDS,
  MAP_SQUARE,
  MAP_SQUARES,
  QUESTS,
  isHostile,
  islandOutline,
  questDone,
  seaOpenTo,
  shipQuests,
  storyMark,
  zoneBoss,
  type GameState,
  type GatePlace,
  type Island,
  type Ship,
  type ShipClass,
  type ShipClassId,
  type StoryGoal,
  type UnitKind,
  type ZoneId,
} from '../../game';
import type { IconSprites, MarkerId } from './iconAtlas';

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
  shallow: 0x6fd0e0,
  waterline: 0xd2f0f8, // the lines round a coast, as on an old chart
  sand: 0xe8d18f,
  coast: 0x6b5a2e,
  land: 0x5c9440,
  hill: 0x467d31,
  hillTop: 0x6aa84c,
  palm: 0x24561d,
  me: 0xf2b33d,
  route: 0xffffff,
  lost: 0xff8a2a, // the player's cargo floating where their ship went down
  boss: 0xff4a3a,
  gate: 0x7fe3ff, // a gate to another sea
  story: 0xffd36b, // where the story sends the player: the lighthouse's gold
} as const;

/** The bosses' crowned markers, by their hulls: the Baron under his black flag. One not here, by its nature */
const BOSS_MARKERS: Partial<Readonly<Record<ShipClassId, MarkerId>>> = {
  baronBrig: 'bossBlackFlag',
  flagship: 'bossFlagship',
  kraken: 'bossKraken',
};

/** A boss's crowned marker, by its hull */
export function bossMarker(shipClass: ShipClass): MarkerId {
  return BOSS_MARKERS[shipClass.id] ?? (shipClass.nature === 'creature' ? 'bossKraken' : 'bossGalleon');
}

/**
 * What a unit is marked with on a map: what the story asks the player to sink (`story`) in gold, a boss under its
 * crown, what a bounty of the tavern's asks for (`bounties`) in silver, the rest red if it would attack the player
 * and green if it leaves them be, a ship or a beast
 */
export function unitMarker(
  unit: Ship,
  playerShipId: number,
  story: readonly UnitKind[],
  bounties: readonly UnitKind[],
): MarkerId {
  const kind = unit.shipClass.id;
  if (story.includes(kind)) return 'storyPrey';
  if (unit.bot && BOT_KINDS[unit.bot.kind]?.boss) return bossMarker(unit.shipClass);
  if (bounties.includes(kind)) return 'questPrey';
  const beast = unit.shipClass.nature === 'creature';
  if (isHostile(unit, playerShipId)) return beast ? 'hostileBeast' : 'hostileShip';
  return beast ? 'neutral' : 'neutralShip';
}

/** What the tavern's bounties the ship sailed has taken still ask it to sink in this sea */
export function bountyTargets(state: GameState): UnitKind[] {
  return shipQuests(state, state.player).flatMap((quest) => {
    const { target, zone } = QUESTS[quest.id];
    return zone === state.world.zone && !questDone(quest) ? [target] : [];
  });
}

/** Whether a bounty of the ship sailed's is done, its reward waiting in port */
export function bountyWaiting(state: GameState) {
  return shipQuests(state, state.player).some(questDone);
}

/** Where the story sends the player, marked in gold: its prey's crescent, the harbour's lighthouse, else its star */
export function goalMarker(goal: StoryGoal): MarkerId {
  return goal.kind === 'prey' ? 'storyPrey' : goal.kind === 'port' ? 'storyHome' : 'storyGoal';
}

/** Pixels a painted arrow over a chart's mark bobs, and how fast (radians a second) */
const ARROW_BOB = { reach: 4, speed: 4 } as const;

/**
 * How far up a painted arrow over a mark bobs now, pixels (0 at its lowest): the sea chart's over the story's goal, the
 * world chart's over a sea. `time`: seconds
 */
export function arrowBob(time: number) {
  return ARROW_BOB.reach * (0.5 + 0.5 * Math.sin(time * ARROW_BOB.speed));
}

/**
 * The breathing light round the marker of where the story sends the player, so the eye finds it at once: a gold halo
 * and a ring spreading from it. `size`: the marker's, pixels; `time`: seconds
 */
export function drawGoalGlow(g: Graphics, x: number, y: number, size: number, time: number) {
  const breath = 0.5 + 0.5 * Math.sin(time * GOAL_GLOW.speed);
  g.circle(x, y, size * 0.62).fill({ color: CHART.story, alpha: 0.16 + 0.16 * breath });
  const k = (time / GOAL_GLOW.period) % 1;
  g.circle(x, y, size * (0.45 + 0.55 * k)).stroke({ width: 1.5, color: CHART.story, alpha: 0.8 * (1 - k) });
}

/** Where a sea's boss has its lair, if it has a boss */
export function bossLair(zone: ZoneId) {
  return zoneBoss(zone)?.boss?.lair ?? null;
}

const LETTER_A = 65;
const SHALLOWS = 5; // pixels of shallow water round a coast
// The lines round a coast: pixels out from it, how bright
const WATERLINES = [
  { offset: 3.5, alpha: 0.42 },
  { offset: 7.5, alpha: 0.24 },
  { offset: 12, alpha: 0.12 },
] as const;
const ISLAND_SHADOW = { x: 1.5, y: 2, alpha: 0.35 } as const; // pixels down and right of an island, as carved
// An island's land inside its beach, its hill's foot and its top, as shares of its coast's radius (the 3D island's)
const LAND = 0.72;
const HILL = [0.42, 0.22] as const;
const HILL_MIN = 7; // pixels: a smaller island shows no hill
const PALM_RADIUS = 1.3; // pixels
// The light round the story's marker: how fast it breathes (radians a second) and the seconds a ring takes to spread
const GOAL_GLOW = { speed: 3.2, period: 1.6 } as const;

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

/**
 * The islands as in the game, seen from above: shallows and lines round the coast, beach, land, hill and palms. The
 * same on both maps; each pass over all of them, so no island's shallows lie over another's land
 */
export function drawIslands(g: Graphics, islands: readonly Island[], map: MapProjection) {
  const screen = (points: readonly { x: number; y: number }[], dx = 0, dy = 0) =>
    points.flatMap((p) => [map.x(p.x, p.y) + dx, map.y(p.x, p.y) + dy]);
  for (const island of islands) {
    const size = island.radius * map.scale;
    g.poly(screen(islandOutline(island, 1 + SHALLOWS / size))).fill({ color: CHART.shallow, alpha: 0.2 });
    for (const { offset, alpha } of WATERLINES) {
      g.poly(screen(islandOutline(island, 1 + offset / size))).stroke({ width: 1, color: CHART.waterline, alpha });
    }
  }
  for (const island of islands) {
    g.poly(screen(island.coast, ISLAND_SHADOW.x, ISLAND_SHADOW.y)).fill({
      color: 0x000000,
      alpha: ISLAND_SHADOW.alpha,
    });
  }
  for (const island of islands) {
    // Every point: the port's walls are a few points of its coast
    g.poly(screen(island.coast)).fill({ color: CHART.sand }).stroke({ width: 1, color: CHART.coast, alpha: 0.9 });
    g.poly(screen(islandOutline(island, LAND))).fill({ color: CHART.land });
    if (island.hillHeight > 0 && island.radius * map.scale >= HILL_MIN) {
      g.poly(screen(islandOutline(island, HILL[0]))).fill({ color: CHART.hill });
      g.poly(screen(islandOutline(island, HILL[1]))).fill({ color: CHART.hillTop });
    }
    for (const palm of island.palms) {
      g.circle(map.x(palm.x, palm.y), map.y(palm.x, palm.y), PALM_RADIUS).fill({ color: CHART.palm });
    }
  }
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

// A gate's painted marker, the vortex the pointer wears over one: across, in the size a chart draws its gates at; and
// its opacity when the gate is shut to the ship's tier
const GATE_MARKER = 4;
const GATE_SHUT = 0.6;

/**
 * The sea's gates to other seas: each its painted vortex (`markers`), faint while it is shut to a ship of `tier`; till
 * they load, a pale blue ring round an arrow out. `size` scales them, pixels
 */
export function drawGates(
  g: Graphics,
  markers: IconSprites<MarkerId>,
  map: MapProjection,
  gates: readonly GatePlace[],
  size: number,
  tier: number,
) {
  for (const gate of gates) {
    const x = map.x(gate.x, gate.y);
    const y = map.y(gate.x, gate.y);
    if (markers.put('gate', x, y, size * GATE_MARKER, seaOpenTo(gate.to, tier) ? 1 : GATE_SHUT)) continue;
    g.circle(x, y, size * 1.9).stroke({ width: 2, color: CHART.gate, alpha: 0.9 });
    g.poly([x - size, y - size * 0.8, x + size, y, x - size, y + size * 0.8]).fill({ color: CHART.gate });
  }
}

/**
 * Where the story sends the player now (story/story.ts), if anywhere: a gold four-pointed star in a ring. `size` scales
 * it, pixels; `rim` moves a point of the map beyond the edge onto it (the minimap's: the mark far off is still shown
 * that way)
 */
export function drawStoryMark(
  g: Graphics,
  map: MapProjection,
  state: GameState,
  size: number,
  rim: (x: number, y: number) => { readonly x: number; readonly y: number } = (x, y) => ({ x, y }),
) {
  const mark = storyMark(state, state.player);
  if (!mark) return;
  const { x, y } = rim(map.x(mark.x, mark.y), map.y(mark.x, mark.y));
  const s = size * 1.4;
  const w = s * 0.35;
  g.circle(x, y, size * 2).stroke({ width: 2, color: CHART.story, alpha: 0.9 });
  g.poly([x, y - s, x + w, y - w, x + s, y, x + w, y + w, x, y + s, x - w, y + w, x - s, y, x - w, y - w])
    .fill({ color: CHART.story })
    .stroke({ width: 1, color: 0x3a2400 });
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
