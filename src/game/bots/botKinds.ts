import type { AmmoId } from '../combat/arsenal';
import type { CargoDrop } from '../economy/cargo';
import type { Point } from '../lib/geometry';
import type { ShipClassId } from '../ships/shipClasses';

export type BotKindId = 'fisher' | 'merchant' | 'smuggler' | 'turtle' | 'serpent' | 'baron';

/** Neutral bots go about their business until someone hits them; aggressive ones attack a player who comes near */
export type Behaviour = 'neutral' | 'aggressive';

/**
 * A kind of bot: which hull it sails (its class: size, speed, hit points, guns or jaws) and how it behaves. The bots of
 * a kind sail the sea `perSquare` to a square of the map on average; one that is sunk is replaced `respawnTime` later,
 * near where it was, somewhere no player sees
 */
export interface BotKind {
  readonly id: BotKindId;
  readonly shipClass: ShipClassId;
  readonly behaviour: Behaviour;
  /** The ammo its guns fire, if it has guns: it never runs out */
  readonly ammo: AmmoId | null;
  /** How close a player's ship must come for an aggressive bot to attack it, world units; 0 for a neutral one */
  readonly aggroRange: number;
  /** Share of its top speed it sails at while nobody bothers it */
  readonly cruise: number;
  /** How many of it sail each square of the map (MAP_SQUARE across) on average: the bigger the world, the more */
  readonly perSquare: number;
  /** Seconds before a sunk one is replaced */
  readonly respawnTime: number;
  /** Gold the player who sinks it is paid */
  readonly bounty: number;
  /** How tough it is, 1 up: a ship far above it earns less for it (ships/talents.ts, xpForKill) */
  readonly level: number;
  /** Experience the ship that sinks it earns */
  readonly xp: number;
  /**
   * The chance it leaves a chest of gold floating where it sank, and the gold in one (at least, at most); null for a
   * sea monster, which carries no gold: only what its body is worth (`cargo`)
   */
  readonly chest: { readonly chance: number; readonly gold: readonly [number, number] } | null;
  /** The goods its wreck may leave floating (with the chest's gold, if any) */
  readonly cargo: readonly CargoDrop[];
  /** A boss: one of it, at its lair, with its escort; null for the rest */
  readonly boss: Boss | null;
}

/**
 * A boss sails alone in the world, round its `lair` (open water near it), with `escorts` of another kind that follow
 * it and join its fights; none of them comes back on its own, all come back together `respawnTime` after the boss sank
 */
export interface Boss {
  readonly lair: Point;
  readonly escorts: { readonly kind: BotKindId; readonly count: number };
}

// Balanced against the starter sloop with its starting guns (two cannons I, two harpoon guns I): each fight costs it
// a share of its hull that the repair skill brings back in half a minute or so. pirate-balance.xlsx, Plan bots, has
// the first numbers. The loot is kept lean: about 7 gold a fishing boat, 15 a turtle, 22–29 the rest (bounty + chests
// on average); chests of gold only from ships, a monster leaves only what its body is worth. Their goods sell for
// about a third as much again at the market (economy/cargo.ts), once carried home
export const BOT_KINDS: Readonly<Record<BotKindId, BotKind>> = {
  // Nets and fish, no guns: it runs from whoever attacks it
  fisher: {
    id: 'fisher',
    shipClass: 'fishingBoat',
    behaviour: 'neutral',
    ammo: null,
    aggroRange: 0,
    cruise: 0.5,
    perSquare: 1,
    respawnTime: 20,
    bounty: 6,
    level: 1,
    xp: 10,
    chest: { chance: 0.15, gold: [3, 6] },
    cargo: [{ good: 'fish', count: [1, 3], chance: 0.6 }],
    boss: null,
  },
  // A swivel gun that reaches less far than the player's cannons: keep your distance and it can't answer
  merchant: {
    id: 'merchant',
    shipClass: 'merchantSloop',
    behaviour: 'neutral',
    ammo: 'ball1',
    aggroRange: 0,
    cruise: 0.55,
    perSquare: 0.75,
    respawnTime: 25,
    bounty: 18,
    level: 3,
    xp: 30,
    chest: { chance: 0.4, gold: [10, 25] },
    cargo: [
      { good: 'cloth', count: [1, 3], chance: 0.7 },
      { good: 'spices', count: [1, 1], chance: 0.3 },
    ],
    boss: null,
  },
  smuggler: {
    id: 'smuggler',
    shipClass: 'smugglerSloop',
    behaviour: 'aggressive',
    ammo: 'ball1',
    aggroRange: 300,
    cruise: 0.5,
    perSquare: 1,
    respawnTime: 25,
    bounty: 25,
    level: 5,
    xp: 40,
    chest: { chance: 0.3, gold: [8, 20] },
    cargo: [
      { good: 'rum', count: [1, 2], chance: 0.6 },
      { good: 'contraband', count: [1, 1], chance: 0.3 },
    ],
    boss: null,
  },
  // Slow: a ship that keeps away from its jaws harpoons it without a scratch
  turtle: {
    id: 'turtle',
    shipClass: 'seaTurtle',
    behaviour: 'neutral',
    ammo: null,
    aggroRange: 0,
    cruise: 0.6,
    perSquare: 0.75,
    respawnTime: 25,
    bounty: 15,
    level: 2,
    xp: 20,
    chest: null,
    cargo: [{ good: 'turtleShell', count: [1, 1], chance: 0.5 }],
    boss: null,
  },
  serpent: {
    id: 'serpent',
    shipClass: 'seaSerpent',
    behaviour: 'aggressive',
    ammo: null,
    aggroRange: 240,
    cruise: 0.45,
    perSquare: 1,
    respawnTime: 25,
    bounty: 22,
    level: 4,
    xp: 35,
    chest: null,
    cargo: [{ good: 'serpentScale', count: [1, 1], chance: 0.5 }],
    boss: null,
  },
  // The boss of the starting waters (ships/shipClasses.ts, baronBrig): its lair is far from the port, and it sails
  // with two smugglers. Its loot is worth a long hunt, and the shipyard asks for it (economy/shipyard.ts)
  baron: {
    id: 'baron',
    shipClass: 'baronBrig',
    behaviour: 'aggressive',
    ammo: 'ball1',
    aggroRange: 380,
    cruise: 0.4,
    perSquare: 0,
    respawnTime: 240,
    bounty: 300,
    level: 8,
    xp: 450,
    chest: { chance: 1, gold: [60, 120] },
    cargo: [
      { good: 'contraband', count: [4, 6], chance: 1 },
      { good: 'baronsStrongbox', count: [1, 1], chance: 1 },
    ],
    boss: { lair: { x: 6500, y: 1500 }, escorts: { kind: 'smuggler', count: 2 } },
  },
};

export const BOT_KIND_IDS: readonly BotKindId[] = ['fisher', 'merchant', 'smuggler', 'turtle', 'serpent', 'baron'];
