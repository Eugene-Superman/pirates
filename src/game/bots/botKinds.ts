import type { AmmoId } from '../combat/arsenal';
import type { ShipClassId } from '../ships/shipClasses';

export type BotKindId = 'fisher' | 'merchant' | 'smuggler' | 'turtle' | 'serpent';

/** Neutral bots go about their business until someone hits them; aggressive ones attack a player who comes near */
export type Behaviour = 'neutral' | 'aggressive';

/**
 * A kind of bot: which hull it sails (its class: size, speed, hit points, guns or jaws) and how it behaves. The bots of
 * a kind sail the sea `count` at a time; one that is sunk is replaced `respawnTime` later, somewhere no player sees
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
  /** How many of it sail the sea at once */
  readonly count: number;
  /** Seconds before a sunk one is replaced */
  readonly respawnTime: number;
}

// Balanced against the starter sloop with its starting guns (two cannons I, two harpoon guns I): each fight costs it
// a share of its hull that the repair skill brings back in half a minute or so. pirate-balance.xlsx, Plan bots, has
// the numbers
export const BOT_KINDS: Readonly<Record<BotKindId, BotKind>> = {
  // Nets and fish, no guns: it runs from whoever attacks it
  fisher: {
    id: 'fisher',
    shipClass: 'fishingBoat',
    behaviour: 'neutral',
    ammo: null,
    aggroRange: 0,
    cruise: 0.5,
    count: 8,
    respawnTime: 20,
  },
  // A swivel gun that reaches less far than the player's cannons: keep your distance and it can't answer
  merchant: {
    id: 'merchant',
    shipClass: 'merchantSloop',
    behaviour: 'neutral',
    ammo: 'ball1',
    aggroRange: 0,
    cruise: 0.55,
    count: 6,
    respawnTime: 25,
  },
  smuggler: {
    id: 'smuggler',
    shipClass: 'smugglerSloop',
    behaviour: 'aggressive',
    ammo: 'ball1',
    aggroRange: 300,
    cruise: 0.5,
    count: 8,
    respawnTime: 25,
  },
  // Slow: a ship that keeps away from its jaws harpoons it without a scratch
  turtle: {
    id: 'turtle',
    shipClass: 'seaTurtle',
    behaviour: 'neutral',
    ammo: null,
    aggroRange: 0,
    cruise: 0.6,
    count: 6,
    respawnTime: 25,
  },
  serpent: {
    id: 'serpent',
    shipClass: 'seaSerpent',
    behaviour: 'aggressive',
    ammo: null,
    aggroRange: 240,
    cruise: 0.45,
    count: 8,
    respawnTime: 25,
  },
};

export const BOT_KIND_IDS: readonly BotKindId[] = ['fisher', 'merchant', 'smuggler', 'turtle', 'serpent'];
