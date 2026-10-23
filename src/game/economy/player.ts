import type { GunId } from '../combat/arsenal';
import type { WeaponId } from '../combat/weapons';
import type { GameState } from '../GameState';
import type { Ship } from '../ships/Ship';
import type { ActiveQuest } from './quests';

/** Gold a new player starts with: a few packs of ammo, or most of a gun of the first tier */
export const STARTING_GOLD = 100;

/** What belongs to a player rather than to their ship: their gold, the guns in their hold, their quests */
export interface Player {
  /** Their ship: one of state.ships */
  readonly shipId: number;
  gold: number;
  /** Guns bought or taken off and not fitted, by kind */
  readonly hold: Partial<Record<GunId, number>>;
  /** The tavern's bounties taken and not yet turned in */
  quests: ActiveQuest[];
}

export function newPlayer(shipId: number): Player {
  return { shipId, gold: STARTING_GOLD, hold: {}, quests: [] };
}

/** The player whose ship this is; undefined for a bot's. Online there will be a list of them */
export function playerOf(state: GameState, shipId: number): Player | undefined {
  return state.player.shipId === shipId ? state.player : undefined;
}

/** Puts gold in a player's purse, and tells the client (a `gold` event) */
export function earn(state: GameState, player: Player, event: Omit<GoldEvent, 'type' | 'shipId'>) {
  player.gold += event.amount;
  state.events.push({ type: 'gold', shipId: player.shipId, ...event });
}

type GoldEvent = Extract<GameState['events'][number], { type: 'gold' }>;

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
