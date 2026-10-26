/** Where a piece of outfit goes on a ship: one piece to a slot */
export const OUTFIT_SLOTS = ['sails', 'hull', 'rudder', 'lookout'] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

export type OutfitId =
  | 'canvasSails'
  | 'patchedJib'
  | 'cottonSails'
  | 'stormSails'
  | 'silkSails'
  | 'lateenRig'
  | 'admiraltySails'
  | 'dragonSails'
  | 'krakenSails'
  | 'oakPlanking'
  | 'pinePlanking'
  | 'doublePlanking'
  | 'copperSheathing'
  | 'tarredPlanking'
  | 'teakHull'
  | 'ironPlates'
  | 'steelPlates'
  | 'brassPlating'
  | 'krakenPlating'
  | 'tiller'
  | 'seaAnchor'
  | 'shipsWheel'
  | 'dragAnchor'
  | 'ironRudder'
  | 'balancedRudder'
  | 'captainsWheel'
  | 'krakenWheel'
  | 'leviathanRudder'
  | 'spyglass'
  | 'brassSpyglass'
  | 'crowsNest'
  | 'coveredNest'
  | 'officersGlass'
  | 'telescope'
  | 'admiralsGlass'
  | 'starTelescope'
  | 'krakenEye';

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
// than every bot, a player could pick every fight and leave any; hull and sight grow more. A tier's sidegrades spend
// about what its first piece gives (+0.01 speed ≈ +0.014 hull ≈ +0.017 turn ≈ +0.017 sight ≈ +0.033 acceleration ≈
// +0.067 braking or speed when holed) on other figures. No mix of pieces is faster or sees farther than the best
// pieces of a slot alone; one built for another figure gets a little more of it, paid for in the rest (iron plates
// and a leviathan rudder: +41 % hull, not +35 %, but slower and turning worse; turning +45 % at most, not +39 %;
// acceleration +45 %, not +35 %; braking +75 %, not +60 %; speed when holed +45 %, not +30 %)
// prettier-ignore
export const OUTFITS: Readonly<Record<OutfitId, Outfit>> = {
  canvasSails: { id: 'canvasSails', slot: 'sails', tier: 1, name: 'Canvas sails', role: 'A little faster', bonus: { speed: 0.06 } },
  patchedJib: { id: 'patchedJib', slot: 'sails', tier: 1, name: 'Patched jib', role: 'Slower, but quick into a turn and off the mark', bonus: { speed: 0.03, acceleration: 0.08, turn: 0.04 } },
  cottonSails: { id: 'cottonSails', slot: 'sails', tier: 2, name: 'Cotton sails', role: 'Faster all round', bonus: { speed: 0.11, acceleration: 0.1 } },
  stormSails: { id: 'stormSails', slot: 'sails', tier: 2, name: 'Storm sails', role: 'Keep their way when the hull is holed', bonus: { speed: 0.06, holedSpeed: 0.3 } },
  silkSails: { id: 'silkSails', slot: 'sails', tier: 3, name: 'Silk sails', role: 'The fastest', bonus: { speed: 0.17, acceleration: 0.15 } },
  lateenRig: { id: 'lateenRig', slot: 'sails', tier: 3, name: 'Lateen rig', role: 'Quick off the mark and into a turn', bonus: { speed: 0.09, acceleration: 0.35, turn: 0.15 } },
  admiraltySails: { id: 'admiraltySails', slot: 'sails', tier: 3, name: 'Admiralty sails', role: 'Fast, and keep their way when the hull is holed', bonus: { speed: 0.12, acceleration: 0.1, holedSpeed: 0.3 } },
  dragonSails: { id: 'dragonSails', slot: 'sails', tier: 3, name: 'Dragon sails', role: 'Fast and quick off the mark', bonus: { speed: 0.13, acceleration: 0.25 } },
  krakenSails: { id: 'krakenSails', slot: 'sails', tier: 3, name: 'Kraken sails', role: 'Turn well, and keep their way when holed', bonus: { speed: 0.1, turn: 0.1, holedSpeed: 0.2 } },
  oakPlanking: { id: 'oakPlanking', slot: 'hull', tier: 1, name: 'Oak planking', role: 'A stouter hull', bonus: { hull: 0.08 } },
  pinePlanking: { id: 'pinePlanking', slot: 'hull', tier: 1, name: 'Pine planking', role: 'Light: a little stouter, a little faster', bonus: { hull: 0.04, speed: 0.02 } },
  doublePlanking: { id: 'doublePlanking', slot: 'hull', tier: 2, name: 'Double planking', role: 'A stout hull', bonus: { hull: 0.15 } },
  copperSheathing: { id: 'copperSheathing', slot: 'hull', tier: 2, name: 'Copper sheathing', role: 'A clean bottom: a little faster', bonus: { hull: 0.08, speed: 0.04 } },
  tarredPlanking: { id: 'tarredPlanking', slot: 'hull', tier: 2, name: 'Tarred planking', role: 'Leaks little: keeps its way when holed', bonus: { hull: 0.11, holedSpeed: 0.15 } },
  teakHull: { id: 'teakHull', slot: 'hull', tier: 3, name: 'Teak hull', role: 'The stoutest wood', bonus: { hull: 0.24 } },
  ironPlates: { id: 'ironPlates', slot: 'hull', tier: 3, name: 'Iron plates', role: 'Armour: heavy, slower, turns worse', bonus: { hull: 0.35, speed: -0.06, turn: -0.08 } },
  steelPlates: { id: 'steelPlates', slot: 'hull', tier: 3, name: 'Steel plates', role: 'Lighter armour: a little slower', bonus: { hull: 0.28, speed: -0.02, turn: -0.03 } },
  brassPlating: { id: 'brassPlating', slot: 'hull', tier: 3, name: 'Brass plating', role: 'Stout, and keeps its way when holed', bonus: { hull: 0.2, holedSpeed: 0.15 } },
  krakenPlating: { id: 'krakenPlating', slot: 'hull', tier: 3, name: 'Kraken plating', role: 'Stout, and slips through the water', bonus: { hull: 0.2, speed: 0.03 } },
  tiller: { id: 'tiller', slot: 'rudder', tier: 1, name: 'Tiller', role: 'Turns a little quicker', bonus: { turn: 0.08 } },
  seaAnchor: { id: 'seaAnchor', slot: 'rudder', tier: 1, name: 'Sea anchor', role: 'A canvas drogue: stops shorter', bonus: { turn: 0.03, braking: 0.3 } },
  shipsWheel: { id: 'shipsWheel', slot: 'rudder', tier: 2, name: "Ship's wheel", role: 'Turns quicker', bonus: { turn: 0.15 } },
  dragAnchor: { id: 'dragAnchor', slot: 'rudder', tier: 2, name: 'Drag anchor', role: 'Stops short: holds a broadside where it is', bonus: { turn: 0.06, braking: 0.6 } },
  ironRudder: { id: 'ironRudder', slot: 'rudder', tier: 2, name: 'Iron rudder', role: 'Turns quicker and guards the stern', bonus: { turn: 0.1, hull: 0.04 } },
  balancedRudder: { id: 'balancedRudder', slot: 'rudder', tier: 3, name: 'Balanced rudder', role: 'Turns quickest', bonus: { turn: 0.24 } },
  captainsWheel: { id: 'captainsWheel', slot: 'rudder', tier: 3, name: "Captain's wheel", role: 'Turns quick and stops short', bonus: { turn: 0.18, braking: 0.3 } },
  krakenWheel: { id: 'krakenWheel', slot: 'rudder', tier: 3, name: 'Kraken wheel', role: 'Grips the sea: stops shortest, turns well', bonus: { turn: 0.1, braking: 0.6 } },
  leviathanRudder: { id: 'leviathanRudder', slot: 'rudder', tier: 3, name: 'Leviathan rudder', role: 'Turns quick and guards the stern', bonus: { turn: 0.18, hull: 0.06 } },
  spyglass: { id: 'spyglass', slot: 'lookout', tier: 1, name: 'Spyglass', role: 'Sees a little farther', bonus: { sight: 0.08 } },
  brassSpyglass: { id: 'brassSpyglass', slot: 'lookout', tier: 1, name: 'Brass spyglass', role: 'Sees a little farther, and the helm answers sooner', bonus: { sight: 0.05, turn: 0.03 } },
  crowsNest: { id: 'crowsNest', slot: 'lookout', tier: 2, name: "Crow's nest", role: 'Sees farther', bonus: { sight: 0.15 } },
  coveredNest: { id: 'coveredNest', slot: 'lookout', tier: 2, name: 'Sheltered crow\'s nest', role: 'A lookout who reads the wind: quick off the mark', bonus: { sight: 0.1, acceleration: 0.08 } },
  officersGlass: { id: 'officersGlass', slot: 'lookout', tier: 2, name: "Officer's glass", role: 'Sees farther, and the helm answers sooner', bonus: { sight: 0.1, turn: 0.05 } },
  telescope: { id: 'telescope', slot: 'lookout', tier: 3, name: 'Brass telescope', role: 'Sees farthest: long guns hit what it shows', bonus: { sight: 0.25 } },
  admiralsGlass: { id: 'admiralsGlass', slot: 'lookout', tier: 3, name: "Admiral's glass", role: 'Sees far, and the shoals ahead: stops shorter', bonus: { sight: 0.2, braking: 0.15 } },
  starTelescope: { id: 'starTelescope', slot: 'lookout', tier: 3, name: 'Star telescope', role: 'Reads the wind by day and by night: sees far, quick off the mark', bonus: { sight: 0.18, acceleration: 0.1 } },
  krakenEye: { id: 'krakenEye', slot: 'lookout', tier: 3, name: 'Kraken eye', role: 'Sees far, and the helm answers sooner', bonus: { sight: 0.18, turn: 0.06 } },
};

/** Every piece of each slot, by tier */
export const OUTFIT_IDS: Readonly<Record<OutfitSlot, readonly OutfitId[]>> = {
  sails: [
    'canvasSails',
    'patchedJib',
    'cottonSails',
    'stormSails',
    'silkSails',
    'lateenRig',
    'admiraltySails',
    'dragonSails',
    'krakenSails',
  ],
  hull: [
    'oakPlanking',
    'pinePlanking',
    'doublePlanking',
    'copperSheathing',
    'tarredPlanking',
    'teakHull',
    'ironPlates',
    'steelPlates',
    'brassPlating',
    'krakenPlating',
  ],
  rudder: [
    'tiller',
    'seaAnchor',
    'shipsWheel',
    'dragAnchor',
    'ironRudder',
    'balancedRudder',
    'captainsWheel',
    'krakenWheel',
    'leviathanRudder',
  ],
  lookout: [
    'spyglass',
    'brassSpyglass',
    'crowsNest',
    'coveredNest',
    'officersGlass',
    'telescope',
    'admiralsGlass',
    'starTelescope',
    'krakenEye',
  ],
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
