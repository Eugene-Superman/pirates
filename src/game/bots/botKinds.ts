import type { AmmoId } from '../combat/arsenal';
import type { ShipClassId } from '../ships/shipClasses';

export type BotKindId = 'fisher' | 'merchant' | 'smuggler' | 'turtle' | 'serpent';

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
  /** The chance it leaves a chest floating where it sank, and the gold in one (at least, at most) */
  readonly chest: { readonly chance: number; readonly gold: readonly [number, number] };
}

// Balanced against the starter sloop with its starting guns (two cannons I, two harpoon guns I): each fight costs it
// a share of its hull that the repair skill brings back in half a minute or so. pirate-balance.xlsx, Plan bots, has
// the numbers. The loot: about 8 gold a fishing boat, 20 a turtle, 30–37 the rest (bounty + chests on average), so a
// minute's fighting pays for the ammo it took several times over (economy/shop.ts)
export const BOT_KINDS: Readonly<Record<BotKindId, BotKind>> = {
  // Nets and fish, no guns: it runs from whoever attacks it
  fisher: {
    id: 'fisher',
    shipClass: 'fishingBoat',
    behaviour: 'neutral',
    ammo: null,
    aggroRange: 0,
    cruise: 0.5,
    perSquare: 0.5,
    respawnTime: 20,
    bounty: 6,
    chest: { chance: 0.3, gold: [4, 10] },
  },
  // A swivel gun that reaches less far than the player's cannons: keep your distance and it can't answer
  merchant: {
    id: 'merchant',
    shipClass: 'merchantSloop',
    behaviour: 'neutral',
    ammo: 'ball1',
    aggroRange: 0,
    cruise: 0.55,
    perSquare: 0.375,
    respawnTime: 25,
    bounty: 18,
    chest: { chance: 0.7, gold: [15, 40] },
  },
  smuggler: {
    id: 'smuggler',
    shipClass: 'smugglerSloop',
    behaviour: 'aggressive',
    ammo: 'ball1',
    aggroRange: 300,
    cruise: 0.5,
    perSquare: 0.5,
    respawnTime: 25,
    bounty: 25,
    chest: { chance: 0.5, gold: [12, 35] },
  },
  // Slow: a ship that keeps away from its jaws harpoons it without a scratch
  turtle: {
    id: 'turtle',
    shipClass: 'seaTurtle',
    behaviour: 'neutral',
    ammo: null,
    aggroRange: 0,
    cruise: 0.6,
    perSquare: 0.375,
    respawnTime: 25,
    bounty: 15,
    chest: { chance: 0.35, gold: [8, 20] },
  },
  serpent: {
    id: 'serpent',
    shipClass: 'seaSerpent',
    behaviour: 'aggressive',
    ammo: null,
    aggroRange: 240,
    cruise: 0.45,
    perSquare: 0.5,
    respawnTime: 25,
    bounty: 22,
    chest: { chance: 0.45, gold: [10, 30] },
  },
};

export const BOT_KIND_IDS: readonly BotKindId[] = ['fisher', 'merchant', 'smuggler', 'turtle', 'serpent'];
