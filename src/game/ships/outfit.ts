/** Where a piece of outfit goes on a ship: one piece to a slot */
export const OUTFIT_SLOTS = ['sails', 'hull', 'rudder', 'lookout'] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

export type OutfitId =
  | 'canvasSails'
  | 'cottonSails'
  | 'stormSails'
  | 'silkSails'
  | 'lateenRig'
  | 'oakPlanking'
  | 'doublePlanking'
  | 'copperSheathing'
  | 'teakHull'
  | 'ironPlates'
  | 'tiller'
  | 'shipsWheel'
  | 'dragAnchor'
  | 'balancedRudder'
  | 'spyglass'
  | 'crowsNest'
  | 'telescope';

/**
 * What a ship's figures grow by, as shares of the class's own (0.1 = +10 %): what a piece of outfit gives, or a talent
 * (ships/talents.ts)
 */
export interface OutfitBonus {
  /** Top speed, intact and holed alike */
  readonly speed?: number;
  /** Top speed with the hull nearly gone, on top of `speed`: a holed ship keeps more of its way */
  readonly holedSpeed?: number;
  readonly acceleration?: number;
  readonly braking?: number;
  readonly turn?: number;
  /** Hull points */
  readonly hull?: number;
  /** How far the crew sees */
  readonly sight?: number;
}
/** Every figure a piece of outfit can change, in the order the shop lists them */
export const OUTFIT_STATS = ['speed', 'holedSpeed', 'acceleration', 'braking', 'turn', 'hull', 'sight'] as const;
export type OutfitStat = (typeof OUTFIT_STATS)[number];

/**
 * A piece of outfit: sails, hull planking or plating, a rudder, a lookout's gear. Each tier is better than the one
 * before, all round; the pieces of a tier besides its first are sidegrades, better at one thing and worse at another,
 * like the guns of a tier (combat/arsenal.ts)
 */
export interface Outfit {
  readonly id: OutfitId;
  readonly slot: OutfitSlot;
  readonly tier: number;
  readonly name: string;
  /** What it is for, in a few words */
  readonly role: string;
  readonly bonus: OutfitBonus;
}

// Shares of the class's figures. Speed is held back (+17 % at most from sails, +21 % with copper sheathing): faster
// than every bot, a player could pick every fight and leave any; hull and sight grow more
// prettier-ignore
export const OUTFITS: Readonly<Record<OutfitId, Outfit>> = {
  canvasSails: { id: 'canvasSails', slot: 'sails', tier: 1, name: 'Canvas sails', role: 'A little faster', bonus: { speed: 0.06 } },
  cottonSails: { id: 'cottonSails', slot: 'sails', tier: 2, name: 'Cotton sails', role: 'Faster all round', bonus: { speed: 0.11, acceleration: 0.1 } },
  stormSails: { id: 'stormSails', slot: 'sails', tier: 2, name: 'Storm sails', role: 'Keep their way when the hull is holed', bonus: { speed: 0.06, holedSpeed: 0.3 } },
  silkSails: { id: 'silkSails', slot: 'sails', tier: 3, name: 'Silk sails', role: 'The fastest', bonus: { speed: 0.17, acceleration: 0.15 } },
  lateenRig: { id: 'lateenRig', slot: 'sails', tier: 3, name: 'Lateen rig', role: 'Quick off the mark and into a turn', bonus: { speed: 0.09, acceleration: 0.35, turn: 0.15 } },
  oakPlanking: { id: 'oakPlanking', slot: 'hull', tier: 1, name: 'Oak planking', role: 'A stouter hull', bonus: { hull: 0.08 } },
  doublePlanking: { id: 'doublePlanking', slot: 'hull', tier: 2, name: 'Double planking', role: 'A stout hull', bonus: { hull: 0.15 } },
  copperSheathing: { id: 'copperSheathing', slot: 'hull', tier: 2, name: 'Copper sheathing', role: 'A clean bottom: a little faster', bonus: { hull: 0.08, speed: 0.04 } },
  teakHull: { id: 'teakHull', slot: 'hull', tier: 3, name: 'Teak hull', role: 'The stoutest wood', bonus: { hull: 0.24 } },
  ironPlates: { id: 'ironPlates', slot: 'hull', tier: 3, name: 'Iron plates', role: 'Armour: heavy, slower, turns worse', bonus: { hull: 0.35, speed: -0.06, turn: -0.08 } },
  tiller: { id: 'tiller', slot: 'rudder', tier: 1, name: 'Tiller', role: 'Turns a little quicker', bonus: { turn: 0.08 } },
  shipsWheel: { id: 'shipsWheel', slot: 'rudder', tier: 2, name: "Ship's wheel", role: 'Turns quicker', bonus: { turn: 0.15 } },
  dragAnchor: { id: 'dragAnchor', slot: 'rudder', tier: 2, name: 'Drag anchor', role: 'Stops short: holds a broadside where it is', bonus: { turn: 0.06, braking: 0.6 } },
  balancedRudder: { id: 'balancedRudder', slot: 'rudder', tier: 3, name: 'Balanced rudder', role: 'Turns quickest', bonus: { turn: 0.24 } },
  spyglass: { id: 'spyglass', slot: 'lookout', tier: 1, name: 'Spyglass', role: 'Sees a little farther', bonus: { sight: 0.08 } },
  crowsNest: { id: 'crowsNest', slot: 'lookout', tier: 2, name: "Crow's nest", role: 'Sees farther', bonus: { sight: 0.15 } },
  telescope: { id: 'telescope', slot: 'lookout', tier: 3, name: 'Brass telescope', role: 'Sees farthest: long guns hit what it shows', bonus: { sight: 0.25 } },
};

/** Every piece of each slot, by tier */
export const OUTFIT_IDS: Readonly<Record<OutfitSlot, readonly OutfitId[]>> = {
  sails: ['canvasSails', 'cottonSails', 'stormSails', 'silkSails', 'lateenRig'],
  hull: ['oakPlanking', 'doublePlanking', 'copperSheathing', 'teakHull', 'ironPlates'],
  rudder: ['tiller', 'shipsWheel', 'dragAnchor', 'balancedRudder'],
  lookout: ['spyglass', 'crowsNest', 'telescope'],
};

export function isOutfit(value: unknown): value is OutfitId {
  return typeof value === 'string' && value in OUTFITS;
}

/** The pieces fitted to a ship, by slot; null for an empty slot */
type Fitted = Readonly<Record<OutfitSlot, OutfitId | null>>;

/** A ship's figures that its class sets and its outfit changes */
export interface ShipStats {
  /** World units per second: intact, and with the hull nearly gone */
  readonly maxSpeed: number;
  readonly minSpeed: number;
  /** World units per second, each second */
  readonly acceleration: number;
  readonly deceleration: number;
  /** Radians per second */
  readonly turnSpeed: number;
  /** World units */
  readonly viewRange: number;
  readonly maxHp: number;
}

/** The pieces fitted, slot by slot */
export function fittedPieces(fitted: Fitted): Outfit[] {
  return OUTFIT_SLOTS.flatMap((slot) => {
    const id = fitted[slot];
    return id === null ? [] : [OUTFITS[id]];
  });
}

/** What some bonuses (pieces of outfit, talents) give together, as shares, by figure */
export function addShares(bonuses: readonly OutfitBonus[]): Readonly<Record<OutfitStat, number>> {
  const shares = { speed: 0, holedSpeed: 0, acceleration: 0, braking: 0, turn: 0, hull: 0, sight: 0 };
  for (const bonus of bonuses) {
    for (const key of OUTFIT_STATS) shares[key] += bonus[key] ?? 0;
  }
  return shares;
}

/** A ship's figures grown by shares of them: the class's (`base`) with its outfit and talents */
export function grownStats(base: ShipStats, share: Readonly<Record<OutfitStat, number>>): ShipStats {
  const maxSpeed = base.maxSpeed * (1 + share.speed);
  return {
    maxSpeed,
    minSpeed: Math.min(maxSpeed, base.minSpeed * (1 + share.speed + share.holedSpeed)),
    acceleration: base.acceleration * (1 + share.acceleration),
    deceleration: base.deceleration * (1 + share.braking),
    turnSpeed: base.turnSpeed * (1 + share.turn),
    viewRange: Math.round(base.viewRange * (1 + share.sight)),
    maxHp: Math.round(base.maxHp * (1 + share.hull)),
  };
}

/** A bonus `times` over: a talent's, for its rank */
export function scaledBonus(bonus: OutfitBonus, times: number): OutfitBonus {
  const scaled: Partial<Record<OutfitStat, number>> = {};
  for (const key of OUTFIT_STATS) {
    const value = bonus[key];
    if (value !== undefined) scaled[key] = value * times;
  }
  return scaled;
}
