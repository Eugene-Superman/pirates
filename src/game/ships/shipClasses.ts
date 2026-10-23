import type { GunId } from '../combat/arsenal';
import type { WeaponId } from '../combat/weapons';
import type { Hull } from '../physics/hull';

/**
 * Ship lines: families of ships with their own style and role (docs/ships.md lists the planned ones).
 * Every player starts in `starter`
 */
export type ShipLineId = 'starter';

/** Kinds of ships, unique across all lines. The client finds a class's art by `line` and `id` */
export type ShipClassId = 'sloop';

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
}

export const SHIP_CLASSES: Readonly<Record<ShipClassId, ShipClass>> = {
  sloop: {
    id: 'sloop',
    line: 'starter',
    tier: 1,
    name: 'Starter Sloop',
    hp: 400,
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
  },
};

/** The ship every new player gets */
export const STARTER_SHIP: ShipClassId = 'sloop';
