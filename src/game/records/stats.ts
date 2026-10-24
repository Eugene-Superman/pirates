import type { Player } from '../economy/player';
import type { ShipClassId } from '../ships/shipClasses';
import type { WeaponId } from '../combat/weapons';

/** How gold is earned: a bounty for a kill, a chest hauled aboard, a quest turned in, goods sold at the market */
export const GOLD_REASONS = ['bounty', 'chest', 'quest', 'market'] as const;
export type GoldReason = (typeof GOLD_REASONS)[number];

/**
 * What a player has done, and each of their ships: counted as it happens and kept with the progress. The medals to
 * come are earned by these. A ship's are its own, whoever sails it; a player's are all their ships' together, and the
 * gold they paid out (their purse's, not a ship's)
 */
export interface Stats {
  /** Bots' ships and sea monsters sunk, by class */
  readonly kills: Partial<Record<ShipClassId, number>>;
  /** Tavern quests turned in */
  questsDone: number;
  /** Gold earned, by how */
  readonly goldEarned: Record<GoldReason, number>;
  /** Gold paid out: at the shop, the shipwright's, for repairs at sea, for ships. Only a player's */
  goldSpent: number;
  /** Chests hauled aboard, and the pieces of goods brought in (a player's lost cargo too) */
  chests: number;
  goods: number;
  /** Volleys fired, by weapon */
  readonly volleys: Record<WeaponId, number>;
  /** Hull points of damage done to others, and taken; critical hits rolled */
  damageDealt: number;
  damageTaken: number;
  crits: number;
  /** Monsters' bites taken */
  bitesTaken: number;
  /** Times the ship went down */
  sunk: number;
  /** Hull points the crew mended at sea */
  repaired: number;
  /** The ship's ability used (F) */
  abilities: number;
  /** World units sailed (1 is about a metre), and seconds at sea and in port */
  distance: number;
  timeAtSea: number;
  timeInPort: number;
}

/** The numbers of Stats that are plain counts, for adding up and checking a save */
export const STAT_COUNTS = [
  'questsDone',
  'goldSpent',
  'chests',
  'goods',
  'damageDealt',
  'damageTaken',
  'crits',
  'bitesTaken',
  'sunk',
  'repaired',
  'abilities',
  'distance',
  'timeAtSea',
  'timeInPort',
] as const satisfies readonly (keyof Stats)[];

export function newStats(): Stats {
  return {
    kills: {},
    questsDone: 0,
    goldEarned: { bounty: 0, chest: 0, quest: 0, market: 0 },
    goldSpent: 0,
    chests: 0,
    goods: 0,
    volleys: { cannon: 0, harpoon: 0 },
    damageDealt: 0,
    damageTaken: 0,
    crits: 0,
    bitesTaken: 0,
    sunk: 0,
    repaired: 0,
    abilities: 0,
    distance: 0,
    timeAtSea: 0,
    timeInPort: 0,
  };
}

/** A copy, to keep: nothing of it is shared with the original */
export function copyStats(stats: Stats): Stats {
  return { ...stats, kills: { ...stats.kills }, goldEarned: { ...stats.goldEarned }, volleys: { ...stats.volleys } };
}

/** Units sunk, all together */
export function totalKills(stats: Stats) {
  return Object.values(stats.kills).reduce((sum, n) => sum + n, 0);
}

/** Gold earned, all together */
export function totalGold(stats: Stats) {
  return GOLD_REASONS.reduce((sum, reason) => sum + stats.goldEarned[reason], 0);
}

/** Gold paid out of a player's purse: the shop, the shipwright, a crew at sea, a ship. Every payment goes through here */
export function spend(player: Player, amount: number) {
  player.gold -= amount;
  player.stats.goldSpent += amount;
}
