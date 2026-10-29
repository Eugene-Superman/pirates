import { BOT_KINDS } from '../bots/botKinds';
import { SHIP_CLASSES, type ShipClassId } from '../ships/shipClasses';
import { totalGold, type Stats } from '../records/stats';

/**
 * Feats: what a captain has done over all their ships (the player's stats), in ladders of rungs. Every rung reached
 * gives captain's points for the mastery (account/mastery.ts), more the higher it is: the first rungs come in the
 * first hours, the last after hundreds, so a long-time captain always has a feat ahead
 */
export type FeatId =
  'monsters' | 'ships' | 'bosses' | 'duels' | 'quests' | 'chests' | 'gold' | 'voyage' | 'damage' | 'repairs';

export interface Feat {
  readonly id: FeatId;
  readonly name: string;
  /** What a rung asks, for the player: `{n}` is its goal */
  readonly text: string;
  /** Each rung's goal, in the units of `count` */
  readonly goals: readonly number[];
  /** How far the captain has got */
  readonly count: (stats: Stats) => number;
  /** Counted only once the online game brings it: none of its rungs can be reached yet */
  readonly planned?: boolean;
}

/** Captain's points each rung of a ladder gives, the first rung first */
export const RUNG_POINTS: readonly number[] = [1, 1, 2, 3];

// World units in a kilometre: a unit is about a metre (game-logic.md)
const KILOMETRE = 1000;

/** The classes bosses sail (bots/botKinds.ts): their kills are the boss hunter's */
const BOSS_CLASSES: ReadonlySet<ShipClassId> = new Set(
  Object.values(BOT_KINDS)
    .filter((kind) => kind.boss)
    .map((kind) => kind.shipClass),
);

/** Kills of the classes that pass `which` */
function killsOf(stats: Stats, which: (id: ShipClassId) => boolean) {
  let sum = 0;
  for (const { id } of Object.values(SHIP_CLASSES)) {
    if (which(id)) sum += stats.kills[id] ?? 0;
  }
  return sum;
}

export const FEAT_IDS: readonly FeatId[] = [
  'monsters',
  'ships',
  'bosses',
  'duels',
  'quests',
  'chests',
  'gold',
  'voyage',
  'damage',
  'repairs',
];

// prettier-ignore
export const FEATS: Readonly<Record<FeatId, Feat>> = {
  monsters: { id: 'monsters', name: 'Monster Slayer', text: 'Sink {n} sea monsters', goals: [100, 1000, 10000, 100000],
    count: (s) => killsOf(s, (id) => SHIP_CLASSES[id].nature === 'creature') },
  ships: { id: 'ships', name: 'Ship Breaker', text: 'Sink {n} ships', goals: [100, 1000, 10000, 100000],
    count: (s) => killsOf(s, (id) => SHIP_CLASSES[id].nature === 'object') },
  bosses: { id: 'bosses', name: 'Boss Hunter', text: 'Sink {n} bosses', goals: [5, 50, 500, 5000],
    count: (s) => killsOf(s, (id) => BOSS_CLASSES.has(id)) },
  duels: { id: 'duels', name: 'Duelist', text: 'Win {n} fights against other captains', goals: [10, 100, 1000, 10000],
    count: () => 0, planned: true },
  quests: { id: 'quests', name: 'Tavern Regular', text: 'Turn in {n} quests', goals: [10, 100, 1000, 10000],
    count: (s) => s.questsDone },
  chests: { id: 'chests', name: 'Plunderer', text: 'Haul {n} chests aboard', goals: [100, 1000, 10000, 100000],
    count: (s) => s.chests },
  gold: { id: 'gold', name: 'Tycoon', text: 'Earn {n} gold', goals: [100000, 1000000, 10000000, 100000000],
    count: totalGold },
  voyage: { id: 'voyage', name: 'Circumnavigator', text: 'Sail {n} km', goals: [1000, 10000, 100000, 1000000],
    count: (s) => Math.floor(s.distance / KILOMETRE) },
  damage: { id: 'damage', name: 'Destroyer', text: 'Deal {n} damage', goals: [100000, 1000000, 10000000, 100000000],
    count: (s) => s.damageDealt },
  repairs: { id: 'repairs', name: 'Master Carpenter', text: 'Mend {n} hull at sea', goals: [50000, 500000, 5000000, 50000000],
    count: (s) => s.repaired },
};

/** How many rungs of a ladder the captain has reached */
export function rungsReached(feat: Feat, stats: Stats) {
  const count = feat.count(stats);
  return feat.goals.filter((goal) => count >= goal).length;
}

/** Points the first `rungs` rungs of a ladder give */
function rungPoints(rungs: number) {
  return RUNG_POINTS.slice(0, rungs).reduce((sum, n) => sum + n, 0);
}

/** Captain's points from every feat reached */
export function featPoints(stats: Stats) {
  return FEAT_IDS.reduce((sum, id) => sum + rungPoints(rungsReached(FEATS[id], stats)), 0);
}
