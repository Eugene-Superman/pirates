import type { Bite, GunId } from '../combat/arsenal';
import type { TargetNature, WeaponId } from '../combat/weapons';
import type { Hull } from '../physics/hull';

/**
 * Ship lines: families of ships with their own style and role (docs/ships.md lists the planned ones).
 * Every player starts in `starter`. `bots` and `monsters` are the hulls of the bots (bots/botKinds.ts), not for players
 */
export type ShipLineId = 'starter' | 'bots' | 'monsters';

/** Kinds of ships, unique across all lines. The client finds a class's art by `line` and `id` */
export type ShipClassId = 'sloop' | 'fishingBoat' | 'merchantSloop' | 'smugglerSloop' | 'seaTurtle' | 'seaSerpent';

/** A place for a gun on the ship, in ship coordinates: x to the bow, y to starboard, z up from the waterline */
export interface Mount {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ShipClass {
  readonly id: ShipClassId;
  readonly line: ShipLineId;
  /** Rank within the line: 1 is the first ship a player gets in it */
  readonly tier: number;
  /** Shown to players */
  readonly name: string;
  /** Hull points of the ship when new: what damage takes away */
  readonly hp: number;
  /** Ships are objects; a sea monster is a creature, and harpoons are what hurt it */
  readonly nature: TargetNature;
  /** How far it sticks out of the water, world units: shots at it fly at half of it */
  readonly height: number;
  /** Rough size, world units: about half the hull's length. Effects and the view scale with it */
  readonly radius: number;
  /** The hull seen from above, what the ship collides with: world units from the ship's position, x to the bow */
  readonly hull: Hull;
  /** How far the crew sees, world units: beyond it is the fog of war. A stat meant to be upgraded */
  readonly viewRange: number;
  /** Top speed of an intact ship, world units per second (the HUD shows knots: a tenth of it) */
  readonly maxSpeed: number;
  /** Top speed with the hull nearly gone; damage lowers it from maxSpeed towards this. World units per second */
  readonly minSpeed: number;
  /** World units per second² */
  readonly acceleration: number;
  readonly deceleration: number;
  /** Radians per second */
  readonly turnSpeed: number;
  /**
   * Places for guns, by weapon: how many of its guns the ship can carry, and where each one's shots leave the ship.
   * Cannons fire from the side facing the target: a cannon slot's y is mirrored to that side
   */
  readonly slots: Readonly<Record<WeaponId, readonly Mount[]>>;
  /** Guns fitted when the ship is new, slot by slot (null: an empty slot) */
  readonly startingGuns: Readonly<Record<WeaponId, readonly (GunId | null)[]>>;
  /** A sea monster's jaws; null for a ship */
  readonly bite: Bite | null;
}

const NO_GUNS = { slots: { cannon: [], harpoon: [] }, startingGuns: { cannon: [], harpoon: [] } } as const;

export const SHIP_CLASSES: Readonly<Record<ShipClassId, ShipClass>> = {
  sloop: {
    id: 'sloop',
    line: 'starter',
    tier: 1,
    name: 'Starter Sloop',
    hp: 400,
    nature: 'object',
    height: 8,
    radius: 9,
    // Measured on the model: stem to transom at deck level, widest beam
    hull: { bow: 15, stern: -14.5, halfBeam: 5.6 },
    viewRange: 520, // twice the cannons' range
    maxSpeed: 120, // 12 knots
    minSpeed: 60, // 6 knots
    acceleration: 50,
    deceleration: 80,
    turnSpeed: 1.8,
    // Cannons are run out on the side facing the target, so a cannon slot is a place along the side; the model's
    // pair amidships (blender-assets/ships/starter/sloop/build.py) is the first. Its harpoon launcher on the foredeck
    // is the first harpoon slot
    slots: {
      cannon: [
        { x: -2.2, y: 6, z: 5 },
        { x: 4.5, y: 5.6, z: 5 },
        { x: -8.5, y: 5.4, z: 5.2 },
        { x: 10, y: 4.4, z: 5.2 },
      ],
      harpoon: [
        { x: 12.5, y: 0, z: 5.8 },
        { x: 9.5, y: 2.4, z: 5.6 },
        { x: 9.5, y: -2.4, z: 5.6 },
        { x: -11, y: 0, z: 6.4 },
      ],
    },
    startingGuns: {
      cannon: ['cannon1', 'cannon1', null, null],
      harpoon: ['harpoonGun1', 'harpoonGun1', null, null],
    },
    bite: null,
  },

  // The bots' hulls (bots/botKinds.ts says how each bot behaves). Sea monsters sail as ships do, under a pilot, so
  // they are ships to the game too: creatures, with jaws instead of guns. Their numbers are balanced against the
  // starter sloop with its starting guns (pirate-balance.xlsx, Plan bots)
  fishingBoat: {
    id: 'fishingBoat',
    line: 'bots',
    tier: 1,
    name: 'Fishing boat',
    hp: 120,
    nature: 'object',
    height: 4,
    radius: 6,
    // The deck outline of its model (client/scene/models/botShip3d.ts)
    hull: { bow: 10, stern: -8.8, halfBeam: 4.1 },
    viewRange: 400,
    maxSpeed: 75,
    minSpeed: 40,
    acceleration: 40,
    deceleration: 70,
    turnSpeed: 1.6,
    ...NO_GUNS,
    bite: null,
  },
  merchantSloop: {
    id: 'merchantSloop',
    line: 'bots',
    tier: 1,
    name: 'Merchant sloop',
    hp: 240,
    nature: 'object',
    height: 6,
    radius: 9,
    // The deck outline of its model, like the fishing boat's
    hull: { bow: 14.5, stern: -13.8, halfBeam: 5.6 },
    viewRange: 450,
    maxSpeed: 85,
    minSpeed: 45,
    acceleration: 40,
    deceleration: 70,
    turnSpeed: 1.4,
    // One swivel gun on the rail: dangerous only up close
    slots: { cannon: [{ x: 1, y: 5.4, z: 4.2 }], harpoon: [] },
    startingGuns: { cannon: ['swivelGun'], harpoon: [] },
    bite: null,
  },
  smugglerSloop: {
    id: 'smugglerSloop',
    line: 'bots',
    tier: 1,
    name: 'Smuggler sloop',
    hp: 300,
    nature: 'object',
    height: 7,
    radius: 9.5,
    hull: { bow: 15.5, stern: -14.5, halfBeam: 5.8 },
    viewRange: 480,
    maxSpeed: 100,
    minSpeed: 55,
    acceleration: 50,
    deceleration: 80,
    turnSpeed: 1.7,
    slots: { cannon: [{ x: -1, y: 5.6, z: 4.6 }], harpoon: [] },
    startingGuns: { cannon: ['cannon1'], harpoon: [] },
    bite: null,
  },
  seaTurtle: {
    id: 'seaTurtle',
    line: 'monsters',
    tier: 1,
    name: 'Giant turtle',
    hp: 180,
    nature: 'creature',
    height: 4,
    radius: 8,
    // The shell, nearly round, and the head in front of it
    hull: { bow: 9, stern: -7, halfBeam: 6 },
    viewRange: 350,
    maxSpeed: 55,
    minSpeed: 35,
    acceleration: 30,
    deceleration: 60,
    turnSpeed: 1.5,
    ...NO_GUNS,
    bite: { die: 6, missOn: 1, critFrom: 6, critMultiplier: 2, bonus: 1, reach: 18, reload: 3 },
  },
  seaSerpent: {
    id: 'seaSerpent',
    line: 'monsters',
    tier: 1,
    name: 'Sea serpent',
    hp: 150,
    nature: 'creature',
    height: 8,
    radius: 12,
    // Its body, about 42 long (client/scene/models/serpent3d.ts): its position is the middle of it, the head ahead.
    // A straight capsule, though the body bends along where it swam
    hull: { bow: 21, stern: -21, halfBeam: 4 },
    viewRange: 450,
    // A little slower than an intact sloop: a player can get away from it, unless badly damaged
    maxSpeed: 105,
    minSpeed: 70,
    acceleration: 60,
    deceleration: 90,
    turnSpeed: 2.2,
    ...NO_GUNS,
    bite: { die: 12, missOn: 1, critFrom: 12, critMultiplier: 2, bonus: 2, reach: 20, reload: 2.5 },
  },
};

/** The ship every new player gets */
export const STARTER_SHIP: ShipClassId = 'sloop';
