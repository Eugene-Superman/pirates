import type { Point } from '../lib/geometry';
import { WORLD_HEIGHT, WORLD_WIDTH } from './map';

/**
 * The seas, one after another as a player goes on: the starting waters for the starter sloop, then a sea or a few for
 * each tier of ship, each sea for some of the levels of its tier's ships. Each is a map of its own, with its own
 * islands, bots and boss, and the port in its middle; gates at its edges lead to the sea before it and the next
 */
export type ZoneId =
  | 'startingWaters'
  | 'coralCoast'
  | 'smugglersStraits'
  | 'windwardIsles'
  | 'fogBanks'
  | 'shipwreckShoals'
  | 'stormReach'
  | 'krakenDeep'
  | 'blackReefs'
  | 'ironSea'
  | 'emberIsles'
  | 'serpentsMaw'
  | 'frozenExpanse'
  | 'abyssalTrench'
  | 'crownWaters';

/** A way from one sea to another: where it is on the map (the game moves it to the nearest open water) */
export interface Gate {
  readonly to: ZoneId;
  readonly at: Point;
}

export interface Zone {
  readonly id: ZoneId;
  /** Shown to players */
  readonly name: string;
  /** What it is, in a sentence or two, for the world chart */
  readonly about: string;
  /** The tier of ship it is for: a ship of a lower tier can't sail into it */
  readonly tier: number;
  /** The levels of that tier's ships it is for, first and last: its bots' levels lie between */
  readonly levels: readonly [number, number];
  /** The islands' seed: the same sea on every run */
  readonly seed: number;
  /** Islands to a square of the map, on average */
  readonly islands: number;
  /** Whether its islands are painted (world/paintedCoasts.json): the starting waters' only, for now */
  readonly painted: boolean;
  /** Where its boss keeps (open water near it): a corner far from the port */
  readonly lair: Point;
  /**
   * Its place down its tier's column on the world chart, 0…1 from the top: the seas of a tier in the order they are
   * sailed
   */
  readonly chartY: number;
  readonly gates: readonly Gate[];
}

export const START_ZONE = 'startingWaters' satisfies ZoneId;
/** A sea past the starting waters: its bots and quests are made from its tier and levels */
export type OuterZoneId = Exclude<ZoneId, typeof START_ZONE>;

// The seas in the order a player sails them: a gate at each one's west edge leads back, one at its east edge on. What
// each is, in a few words, for the world chart
const LADDER: readonly {
  readonly id: ZoneId;
  readonly name: string;
  readonly tier: number;
  readonly levels: readonly [number, number];
  readonly about: string;
}[] = [
  {
    id: 'startingWaters',
    name: 'Starting Waters',
    tier: 0,
    levels: [1, 10],
    about:
      'Calm waters round the port where every captain begins: fishing boats, merchants, smugglers and the odd sea monster. The Smuggler Baron holds the north-east.',
  },
  {
    id: 'coralCoast',
    name: 'Coral Coast',
    tier: 1,
    levels: [1, 10],
    about:
      'Shallow reefs and lagoons, the first sea of a ship of the line: traders and pirate brigs, turtles on the reefs, serpents in the channels.',
  },
  {
    id: 'smugglersStraits',
    name: "Smugglers' Straits",
    tier: 2,
    levels: [1, 10],
    about: 'Narrow straits between rocky isles where contraband changes hands. The pirates here sail in numbers.',
  },
  {
    id: 'windwardIsles',
    name: 'Windward Isles',
    tier: 2,
    levels: [11, 20],
    about:
      'Isles battered by the trade winds, where the pirates of the straits winter and the sharks follow the fleets.',
  },
  {
    id: 'fogBanks',
    name: 'Fog Banks',
    tier: 3,
    levels: [1, 15],
    about: 'A sea under a grey blanket of fog: ships come out of it at close range, and so do the beasts.',
  },
  {
    id: 'shipwreckShoals',
    name: 'Shipwreck Shoals',
    tier: 3,
    levels: [16, 30],
    about:
      'Shoals strewn with the wrecks of the fleets that tried to cross them: rich salvage, and those who guard it.',
  },
  {
    id: 'stormReach',
    name: 'Storm Reach',
    tier: 4,
    levels: [1, 13],
    about: 'Open ocean where the storms never quite die down. Warships of the old navies patrol it.',
  },
  {
    id: 'krakenDeep',
    name: 'Kraken Deep',
    tier: 4,
    levels: [14, 27],
    about: "Waters over a chasm with no bottom: the kraken's own, and the beasts that feed on what it leaves.",
  },
  {
    id: 'blackReefs',
    name: 'Black Reefs',
    tier: 4,
    levels: [28, 40],
    about: 'Black coral reefs that tear a careless hull open. The strongest pirate fleets hide among them.',
  },
  {
    id: 'ironSea',
    name: 'Iron Sea',
    tier: 5,
    levels: [1, 17],
    about: 'Grey waters round the old naval fortresses, where warships still fight a war that ended long ago.',
  },
  {
    id: 'emberIsles',
    name: 'Ember Isles',
    tier: 5,
    levels: [18, 34],
    about: "Volcanic isles under clouds of ash, the sea warm and steaming, the pirates' forges smoking on the shores.",
  },
  {
    id: 'serpentsMaw',
    name: "Serpent's Maw",
    tier: 5,
    levels: [35, 50],
    about: 'A ring of jagged isles round a whirlpool, where the great serpents and the boldest crews meet.',
  },
  {
    id: 'frozenExpanse',
    name: 'Frozen Expanse',
    tier: 6,
    levels: [1, 20],
    about: 'Ice floes and frozen isles at the top of the world: only the toughest ships of the line sail them.',
  },
  {
    id: 'abyssalTrench',
    name: 'Abyssal Trench',
    tier: 6,
    levels: [21, 40],
    about: 'Over the deepest trench of the sea, where the oldest monsters rise to the surface.',
  },
  {
    id: 'crownWaters',
    name: 'Crown Waters',
    tier: 6,
    levels: [41, 60],
    about: 'The last sea: the treasure fleets of the crowns, and the admirals who guard them.',
  },
];

export const ZONE_IDS: readonly ZoneId[] = LADDER.map((z) => z.id);

const STARTER_SEED = 42; // the starting waters' islands, as they have always been: their paintings fit them
const STARTER_ISLANDS = 0.375;
// The other seas: a seed each, and a little more or less land than the starting waters, by turns
const SEED_BASE = 1000;
const ISLAND_SPREAD = [0.3, 0.42, 0.35, 0.45] as const;
const GATE_INSET = 260; // world units in from the map's edge
// The boss's corner, by turns: the starting waters' Baron keeps the north-east
const LAIRS: readonly Point[] = [
  { x: 6500, y: 1500 },
  { x: 1500, y: 6500 },
  { x: 1500, y: 1500 },
  { x: 6500, y: 6500 },
];

const WEST: Point = { x: GATE_INSET, y: WORLD_HEIGHT / 2 };
const EAST: Point = { x: WORLD_WIDTH - GATE_INSET, y: WORLD_HEIGHT / 2 };

function zoneAt(index: number): Zone {
  const { id, name, tier, levels, about } = LADDER[index];
  const starter = index === 0;
  // A tier's seas one over another on the chart, down one column and up the next, so each gate links two seas side by
  // side: the ladder winds across the chart
  const sameTier = LADDER.filter((z) => z.tier === tier);
  const place = sameTier.findIndex((z) => z.id === id);
  const row = tier % 2 === 1 ? sameTier.length - 1 - place : place;
  const gates: Gate[] = [];
  if (index > 0) gates.push({ to: LADDER[index - 1].id, at: WEST });
  if (index < LADDER.length - 1) gates.push({ to: LADDER[index + 1].id, at: EAST });
  return {
    id,
    name,
    about,
    tier,
    levels,
    seed: starter ? STARTER_SEED : SEED_BASE + index * 7919,
    islands: starter ? STARTER_ISLANDS : ISLAND_SPREAD[index % ISLAND_SPREAD.length],
    painted: starter,
    lair: LAIRS[index % LAIRS.length],
    chartY: (row + 1) / (sameTier.length + 1),
    gates,
  };
}

function zoneOf(id: ZoneId) {
  return zoneAt(LADDER.findIndex((z) => z.id === id));
}

export const ZONES: Readonly<Record<ZoneId, Zone>> = {
  startingWaters: zoneOf('startingWaters'),
  coralCoast: zoneOf('coralCoast'),
  smugglersStraits: zoneOf('smugglersStraits'),
  windwardIsles: zoneOf('windwardIsles'),
  fogBanks: zoneOf('fogBanks'),
  shipwreckShoals: zoneOf('shipwreckShoals'),
  stormReach: zoneOf('stormReach'),
  krakenDeep: zoneOf('krakenDeep'),
  blackReefs: zoneOf('blackReefs'),
  ironSea: zoneOf('ironSea'),
  emberIsles: zoneOf('emberIsles'),
  serpentsMaw: zoneOf('serpentsMaw'),
  frozenExpanse: zoneOf('frozenExpanse'),
  abyssalTrench: zoneOf('abyssalTrench'),
  crownWaters: zoneOf('crownWaters'),
};

export function isZone(value: unknown): value is ZoneId {
  return typeof value === 'string' && (ZONE_IDS as readonly string[]).includes(value);
}

/** The seas of a tier, in the order they are sailed */
export function tierZones(tier: number): readonly Zone[] {
  return ZONE_IDS.map((id) => ZONES[id]).filter((zone) => zone.tier === tier);
}
