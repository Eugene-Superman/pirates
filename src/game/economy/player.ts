import type { GunId } from '../combat/arsenal';
import { findUnit } from '../combat/units';
import type { OutfitId } from '../ships/outfit';
import type { WeaponId } from '../combat/weapons';
import type { GameState } from '../GameState';
import type { Ship } from '../ships/Ship';
import type { ActiveQuest } from './quests';
import type { SavedShip } from '../save';
import type { PathStepId } from './shipyard';
import { newStats, type Stats } from '../records/stats';
import type { ZoneId } from '../world/zones';

/** Gold a new player starts with: a few packs of ammo, or most of a gun of the first tier */
export const STARTING_GOLD = 100;

/** What belongs to a player rather than to their ship: their gold, the guns and outfit in their hold, their quests */
export interface Player {
  /** The ship they sail: one of state.ships. The id stays when they change ships (economy/fleet.ts) */
  readonly shipId: number;
  gold: number;
  /** Guns bought or taken off and not fitted, by kind */
  readonly hold: Partial<Record<GunId, number>>;
  /** Pieces of outfit bought or taken off and not fitted, by kind (ships/outfit.ts) */
  readonly outfits: Partial<Record<OutfitId, number>>;
  /** The tavern's bounties taken and not yet turned in */
  quests: ActiveQuest[];
  /** How far along the Captain's path they are (economy/shipyard.ts) */
  readonly progress: Progress;
  /** Their other ships, laid up in port with everything on them (economy/fleet.ts): one of each class at most */
  readonly fleet: SavedShip[];
  /** What they have done, all their ships together (records/stats.ts) */
  readonly stats: Stats;
  /**
   * The sea their ship has sailed off to through a gate (world/gates.ts), their last in this game: the client takes
   * them there (Game.travel); null while they sail this one. Not saved
   */
  departure: ZoneId | null;
}

/** What the Captain's path counts that a player's gold and ship don't show by themselves */
export interface Progress {
  /** The steps done once and for all: a first kill, a talent, a repair at sea, a sale, the Baron sunk */
  readonly steps: PathStepId[];
  /** Tavern quests turned in, all together */
  questsDone: number;
}

export function newPlayer(shipId: number): Player {
  return {
    shipId,
    gold: STARTING_GOLD,
    hold: {},
    outfits: {},
    quests: [],
    progress: { steps: [], questsDone: 0 },
    fleet: [],
    stats: newStats(),
    departure: null,
  };
}

/** The player whose ship this is; undefined for a bot's. Online there will be a list of them */
export function playerOf(state: GameState, shipId: number): Player | undefined {
  return state.player.shipId === shipId ? state.player : undefined;
}

/** The ship a player sails, if it is in the game */
export function shipOf(state: GameState, player: Player): Ship | undefined {
  return findUnit(state, player.shipId);
}

/** Puts gold in a player's purse, and tells the client (a `gold` event) */
export function earn(state: GameState, player: Player, event: Omit<GoldEvent, 'type' | 'shipId'>) {
  player.gold += event.amount;
  state.events.push({ type: 'gold', shipId: player.shipId, ...event });
}

type GoldEvent = Extract<GameState['events'][number], { type: 'gold' }>;

/** A step of the Captain's path is done, the first time: a `pathStep` event for the client */
export function markStep(state: GameState, player: Player, step: PathStepId) {
  if (player.progress.steps.includes(step)) return;
  player.progress.steps.push(step);
  state.events.push({ type: 'pathStep', shipId: player.shipId, step });
}

/** Gold out of thin air, for the debug buttons: testing the shop without earning it */
export function giveGold(player: Player, amount: number) {
  player.gold = Math.max(0, player.gold + amount);
}

/**
 * Fits a gun from the hold into a slot of its weapon, or empties the slot (null); the gun that was there goes into
 * the hold. Anywhere at sea, as the crew can. False if there is none of it in the hold or it doesn't fit the slot
 */
export function fitFromHold(player: Player, ship: Ship, weapon: WeaponId, slot: number, gun: GunId | null) {
  const current = ship.guns[weapon][slot];
  if (current === undefined) return false;
  if (current === gun) return true;
  const stock = gun === null ? 0 : (player.hold[gun] ?? 0);
  if (gun !== null && stock <= 0) return false;
  ship.fitGun(weapon, slot, gun);
  if (ship.guns[weapon][slot] !== gun) return false;
  if (gun !== null) player.hold[gun] = stock - 1;
  if (current !== null) player.hold[current] = (player.hold[current] ?? 0) + 1;
  return true;
}
