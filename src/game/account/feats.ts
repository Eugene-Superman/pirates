import { BOT_KINDS } from '../bots/botKinds';
import type { GameState } from '../GameState';
import type { ItemId } from '../items/items';
import { shipOf, type Player } from '../economy/player';
import { givePrizes, type Prize } from '../economy/prizes';
import { SHIP_CLASSES, type ShipClassId } from '../ships/shipClasses';
import { totalGold, type Stats } from '../records/stats';

/**
 * Feats: what a captain has done over all their ships (the player's stats), in ladders of rungs. Every rung reached
 * has its reward, claimed by the player (claimFeat), never given unasked: captain's points for the mastery
 * (account/mastery.ts), doubloons and items of the Golden Galleon's, more the higher it is. The first rungs come in the
 * first hours, the last after hundreds, so a long-time captain always has a feat ahead; the last rungs are to give
 * ships one day
 */
export type FeatId =
  'monsters' | 'ships' | 'bosses' | 'duels' | 'quests' | 'chests' | 'gold' | 'voyage' | 'damage' | 'repairs';

/** A rung's items, each with how many */
type RungItems = readonly (readonly [ItemId, number])[];

export interface Feat {
  readonly id: FeatId;
  readonly name: string;
  /** What a rung asks, for the player: `{n}` is its goal */
  readonly text: string;
  /** Each rung's goal, in the units of `count` */
  readonly goals: readonly number[];
  /** Each rung's items besides its points and doubloons, fitting what the ladder counts: provisional */
  readonly items: readonly RungItems[];
  /** How far the captain has got */
  readonly count: (stats: Stats) => number;
  /** Counted only once the online game brings it: none of its rungs can be reached yet */
  readonly planned?: boolean;
}

/** Captain's points each rung of a ladder gives, the first rung first */
export const RUNG_POINTS: readonly number[] = [1, 1, 2, 3];
/**
 * Doubloons each rung of a ladder gives, the first rung first: a few items' worth at the first, a masterwork's share at
 * the last
 */
export const RUNG_DOUBLOONS: readonly number[] = [5, 15, 40, 100];

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

export function isFeat(value: unknown): value is FeatId {
  return typeof value === 'string' && Object.hasOwn(FEATS, value);
}

// prettier-ignore
export const FEATS: Readonly<Record<FeatId, Feat>> = {
  monsters: { id: 'monsters', name: 'Monster Slayer', text: 'Sink {n} sea monsters', goals: [100, 1000, 10000, 100000],
    count: (s) => killsOf(s, (id) => SHIP_CLASSES[id].nature === 'creature'),
    items: [[['jellyfishVenom', 2]], [['whaleboneNet', 3], ['goldenHook', 1]], [['tamersWhistle', 2]], [['stormOrb', 1]]] },
  ships: { id: 'ships', name: 'Ship Breaker', text: 'Sink {n} ships', goals: [100, 1000, 10000, 100000],
    count: (s) => killsOf(s, (id) => SHIP_CLASSES[id].nature === 'object'),
    items: [[['greekFire', 2]], [['soakedPowder', 3], ['blackSpot', 1]], [['hiredSloop', 2]], [['drownedKingsCrown', 1]]] },
  bosses: { id: 'bosses', name: 'Boss Hunter', text: 'Sink {n} bosses', goals: [5, 50, 500, 5000],
    count: (s) => killsOf(s, (id) => BOSS_CLASSES.has(id)),
    items: [[['shipsBell', 3]], [['barometer', 2], ['bribePurse', 1]], [['challengeHorn', 2]], [['phoenixFeather', 1]]] },
  duels: { id: 'duels', name: 'Duelist', text: 'Win {n} fights against other captains', goals: [10, 100, 1000, 10000],
    count: () => 0, planned: true,
    items: [[['flashPowder', 2]], [['whiteFlag', 2], ['stElmosCharm', 1]], [['phantomFrigate', 1]], [['portraitFrame', 1]]] },
  quests: { id: 'quests', name: 'Tavern Regular', text: 'Turn in {n} quests', goals: [10, 100, 1000, 10000],
    count: (s) => s.questsDone,
    items: [[['letterOfRecommendation', 2]], [['couriersSeal', 3], ['trophyPennant', 1]], [['watchLog', 2]], [['captainsBanner', 1]]] },
  chests: { id: 'chests', name: 'Plunderer', text: 'Haul {n} chests aboard', goals: [100, 1000, 10000, 100000],
    count: (s) => s.chests,
    items: [[['mapScrap', 2]], [['mysteryStrongbox', 2]], [['treasureMap', 2]], [['treasureMap', 4]]] },
  gold: { id: 'gold', name: 'Tycoon', text: 'Earn {n} gold', goals: [100000, 1000000, 10000000, 100000000],
    count: totalGold,
    items: [[['luckyCoin', 1]], [['billOfExchange', 3], ['fishingNets', 2]], [['wantedPoster', 2]], [['captainsScroll', 2]]] },
  voyage: { id: 'voyage', name: 'Circumnavigator', text: 'Sail {n} km', goals: [1000, 10000, 100000, 1000000],
    count: (s) => Math.floor(s.distance / KILOMETRE),
    items: [[['bottledGale', 2]], [['galleySweeps', 2], ['lighthouseInABottle', 1]], [['enchantedWheel', 1]], [['sailDye', 1]]] },
  damage: { id: 'damage', name: 'Destroyer', text: 'Deal {n} damage', goals: [100000, 1000000, 10000000, 100000000],
    count: (s) => s.damageDealt,
    items: [[['blessedShot', 2]], [['thunderbolt', 2], ['skippingShot', 2]], [['fireship', 2]], [['hourglassOfTides', 3]]] },
  repairs: { id: 'repairs', name: 'Master Carpenter', text: 'Mend {n} hull at sea', goals: [50000, 500000, 5000000, 50000000],
    count: (s) => s.repaired,
    items: [[['canvasPatch', 3]], [['spareTimbers', 2], ['shipyardWarrant', 1]], [['poseidonsAegis', 3]], [['sailorsCharm', 1]]] },
};

/** How many rungs of a ladder the captain has reached */
export function rungsReached(feat: Feat, stats: Stats) {
  const count = feat.count(stats);
  return feat.goals.filter((goal) => count >= goal).length;
}

/** How many rungs of a ladder the player has claimed the rewards of: the first ones */
export function rungsClaimed(player: Player, id: FeatId) {
  return player.feats[id] ?? 0;
}

/** Rewards reached and waiting to be claimed, every ladder's together */
export function rewardsToClaim(player: Player) {
  let sum = 0;
  for (const id of FEAT_IDS) sum += Math.max(0, rungsReached(FEATS[id], player.stats) - rungsClaimed(player, id));
  return sum;
}

/** What a rung gives once claimed: captain's points, and its prizes, the doubloons first */
export interface RungReward {
  readonly points: number;
  readonly prizes: readonly Prize[];
}

/** A ladder's rung's reward; `rung` 0 for the first */
export function rungReward(feat: Feat, rung: number): RungReward {
  const items = (feat.items[rung] ?? []).map(([id, count]): Prize => ({ kind: 'item', id, count }));
  return {
    points: RUNG_POINTS[rung] ?? 0,
    prizes: [{ kind: 'doubloons', count: RUNG_DOUBLOONS[rung] ?? 0 }, ...items],
  };
}

/** Captain's points from every rung whose reward the player has claimed */
export function featPoints(player: Player) {
  let sum = 0;
  for (const id of FEAT_IDS) {
    for (const points of RUNG_POINTS.slice(0, rungsClaimed(player, id))) sum += points;
  }
  return sum;
}

/**
 * A player claims the reward of a ladder's next rung reached, anywhere: its points theirs to spend, its doubloons in the
 * purse and its items in the hold (a `featClaimed` event). False if no rung's reward waits
 */
export function claimFeat(state: GameState, player: Player, id: FeatId) {
  // Checked first: online the id is a player's
  if (!isFeat(id)) return false;
  const feat = FEATS[id];
  const rung = rungsClaimed(player, id);
  const ship = shipOf(state, player);
  if (!ship || rung >= rungsReached(feat, player.stats)) return false;
  player.feats[id] = rung + 1;
  const { points, prizes } = rungReward(feat, rung);
  givePrizes(player, ship, prizes);
  const at = { x: ship.x, y: ship.y, z: ship.height };
  state.events.push({ type: 'featClaimed', shipId: player.shipId, feat: id, rung, points, prizes, at });
  return true;
}

/**
 * The rungs reached this update, each a `feat` event, so the player hears a reward waits for them. Stepped after the
 * stats. A game just made counts them the first time without a word: a save's were told of before
 */
export function stepFeats(state: GameState) {
  const { player } = state;
  const ship = shipOf(state, player);
  for (const id of FEAT_IDS) {
    const reached = rungsReached(FEATS[id], player.stats);
    const before = player.featsReached[id];
    player.featsReached[id] = reached;
    if (before === undefined || !ship) continue;
    const at = { x: ship.x, y: ship.y, z: ship.height };
    for (let rung = before; rung < reached; rung++) {
      state.events.push({ type: 'feat', shipId: player.shipId, feat: id, rung, at });
    }
  }
}
