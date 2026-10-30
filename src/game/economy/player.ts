import type { FeatId } from '../account/feats';
import type { GunId } from '../combat/arsenal';
import { findUnit } from '../combat/units';
import type { ItemId } from '../items/items';
import { emptyQuickSlots } from '../items/quickSlots';
import type { OutfitId } from '../ships/outfit';
import type { WeaponId } from '../combat/weapons';
import type { GameState } from '../GameState';
import type { Ship } from '../ships/Ship';
import type { ActiveQuest, QuestId } from './quests';
import type { SavedShip } from '../save';
import { newStats, type Stats } from '../records/stats';
import type { StoryProgress } from '../story/story';
import { START_ZONE, type ZoneId } from '../world/zones';

/** Gold a new player starts with: a few packs of ammo, or most of a gun of the first tier */
export const STARTING_GOLD = 100;
/**
 * The guns in a new player's hold, the starter sloop's: one for each of its slots, for the player to fit before they
 * sail (the story's first step, story/story.ts)
 */
export const STARTING_HOLD: Readonly<Partial<Record<GunId, number>>> = { cannon1: 4, harpoonGun1: 4 };

/**
 * What belongs to a player rather than to their ship: their gold and doubloons, the guns, outfit and items in their
 * hold, the items at hand on the skill bar, their quests
 */
export interface Player {
  /** The ship they sail: one of state.ships. The id stays when they change ships (economy/fleet.ts) */
  readonly shipId: number;
  gold: number;
  /**
   * Doubloons (economy/currencies.ts): bought, in the online game; only a few quests' prizes (economy/prizes.ts), the
   * feats' rewards (account/feats.ts) and the debug buttons give them until then
   */
  doubloons: number;
  /** Guns bought or taken off and not fitted, by kind */
  readonly hold: Partial<Record<GunId, number>>;
  /** Pieces of outfit bought or taken off and not fitted, by kind (ships/outfit.ts) */
  readonly outfits: Partial<Record<OutfitId, number>>;
  /**
   * The items bought for doubloons (items/items.ts), by kind: in the hold, for every ship they sail, as many as they
   * like, taking no room
   */
  readonly items: Partial<Record<ItemId, number>>;
  /** What is in each of the skill bar's quick slots, keys 1…0 (items/quickSlots.ts): an item of the hold, or null */
  readonly quickSlots: (ItemId | null)[];
  /** The tavern's bounties taken and not yet turned in, by all their ships: each its own ship's (economy/quests.ts) */
  quests: ActiveQuest[];
  /** What the Captain's path counts (economy/shipyard.ts) */
  readonly progress: Progress;
  /** How far along the story they are (story/story.ts) */
  story: StoryProgress;
  /** Their other ships, laid up in port with everything on them (economy/fleet.ts): one of each class at most */
  readonly fleet: SavedShip[];
  /** What they have done, all their ships together (records/stats.ts) */
  readonly stats: Stats;
  /** The passives of the captain's mastery taken (account/mastery.ts), in the order taken: for every ship they sail */
  readonly mastery: string[];
  /** How many rungs of each feat's ladder they have claimed the rewards of (account/feats.ts) */
  readonly feats: Partial<Record<FeatId, number>>;
  /**
   * The rungs of each ladder reached, as last counted (stepFeats): one more is told of. Not saved: none until the game's
   * first update counts them
   */
  readonly featsReached: Partial<Record<FeatId, number>>;
  /** The captain's portrait, by its number (account/portrait.ts) */
  portrait: number;
  /**
   * The seas they have sailed (chartSea), the starting waters first: only these does the client tell what sails (the
   * bestiary, the world chart)
   */
  readonly charted: ZoneId[];
  /**
   * The sea their ship has sailed off to through a gate (world/gates.ts), their last in this game: the client takes
   * them there (Game.travel); null while they sail this one. Not saved
   */
  departure: ZoneId | null;
}

/** What the Captain's path and the tavern count that a player's gold, ship and story don't show by themselves */
export interface Progress {
  /** Tavern quests turned in, all together */
  questsDone: number;
  /** How many times each quest was turned in, by any of their ships: its first time pays prizes, its third less (quests.ts) */
  readonly turnedIn: Partial<Record<QuestId, number>>;
}

export function newPlayer(shipId: number): Player {
  return {
    shipId,
    gold: STARTING_GOLD,
    doubloons: 0,
    hold: {},
    outfits: {},
    items: {},
    quickSlots: emptyQuickSlots(),
    quests: [],
    progress: { questsDone: 0, turnedIn: {} },
    // The prologue first, then the story's first step (story/story.ts, newStory)
    story: { prologue: false, step: 0, told: false, counts: [], closing: null, watchUntil: 0 },
    fleet: [],
    stats: newStats(),
    mastery: [],
    feats: {},
    featsReached: {},
    portrait: 0,
    // Every captain starts in the starting waters
    charted: [START_ZONE],
    departure: null,
  };
}

/** A sea the player has sailed: from now on the client tells them what sails it */
export function chartSea(player: Player, zone: ZoneId) {
  if (!player.charted.includes(zone)) player.charted.push(zone);
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

/** Gold out of thin air, for the debug buttons: testing the shop without earning it */
export function giveGold(player: Player, amount: number) {
  player.gold = Math.max(0, player.gold + amount);
}

/** Doubloons out of thin air, for the debug buttons: they are bought, and there is nowhere to buy them yet */
export function giveDoubloons(player: Player, amount: number) {
  player.doubloons = Math.max(0, player.doubloons + amount);
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
