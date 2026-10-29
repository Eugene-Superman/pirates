import type { Bite, GunId } from '../combat/arsenal';
import type { Barrage } from '../combat/barrage';
import type { TargetNature, WeaponId } from '../combat/weapons';
import type { Hull } from '../physics/hull';

/**
 * The lines players sail: the starter, then families of ships with their own style and role, six tiers each
 * (ships/shipLines.ts has them all, built and planned), and the masterworks (`premium`), bought. Every player starts in
 * `starter`, then goes on in a line of their choice from its tier 1 (`european` first)
 */
export type PlayerLineId = 'starter' | 'european' | 'eastern' | 'pirate' | 'northern' | 'legendary' | 'premium';

/** Ship lines: the players', and `bots` and `monsters`, the hulls of the bots (bots/botKinds.ts), not for players */
export type ShipLineId = PlayerLineId | 'bots' | 'monsters';

/** Kinds of ships, unique across all lines. The client finds a class's art by `line` and `id` */
export type ShipClassId =
  | 'sloop'
  | 'coastalBark'
  | 'corsair'
  | 'frigate'
  | 'royalGalleon'
  | 'admiral'
  | 'shipOfTheLine'
  | 'fishingBoat'
  | 'merchantSloop'
  | 'smugglerSloop'
  | 'baronBrig'
  | 'seaTurtle'
  | 'seaSerpent'
  | 'pirateBrig'
  | 'warship'
  | 'flagship'
  | 'giantCrab'
  | 'shark'
  | 'kraken';

/** A place for a gun on the ship, in ship coordinates: x to the bow, y to starboard, z up from the waterline */
export interface Mount {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ShipClass {
  readonly id: ShipClassId;
  readonly line: ShipLineId;
  /** Rank within the line: 1 is the first ship a player gets in it; the starter sloop, before every line, is 0 */
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
  /**
   * Guns fitted when the ship is new, slot by slot from the first (null, or a slot past the list: empty). Only the bots'
   * hulls have any: a player's ship comes with none (UNARMED), the starter sloop's guns in a new player's hold for them
   * to fit (economy/player.ts, STARTING_HOLD)
   */
  readonly startingGuns: Readonly<Record<WeaponId, readonly (GunId | null)[]>>;
  /** A sea monster's jaws; null for a ship */
  readonly bite: Bite | null;
  /** A boss's barrage: shells on marked spots round its foe (combat/barrage.ts); null for the rest */
  readonly barrage: Barrage | null;
  /** Places in the hold for goods (economy/cargo.ts); 0 for a bot's */
  readonly hold: number;
  /** The highest level a ship of the class reaches (ships/talents.ts); 1 for a bot's, which don't level */
  readonly maxLevel: number;
  /**
   * How many abilities it has, each used with a key once its level opens it (ships/talents.ts, ABILITY_LEVELS); 0 for
   * a bot's. The third is still to be made
   */
  readonly abilities: number;
}

// Levels a line's ship has for each tier: a ship of tier n goes up to level 10 × n
const LEVELS_A_TIER = 10;

/**
 * What a ship of the lines players sail has by its tier, whatever its line: the last level it reaches (ten a tier,
 * the starter sloop's as tier 1's) and its abilities (one up to tier 2, two at tiers 3 and 4, three from tier 5: the
 * levels they open at, ships/talents.ts ABILITY_LEVELS, are within its last)
 */
export function lineTier(tier: number) {
  return { tier, maxLevel: Math.max(1, tier) * LEVELS_A_TIER, abilities: tier >= 5 ? 3 : tier >= 3 ? 2 : 1 };
}

// A player's ship comes with every slot empty: the player fits guns from the hold (economy/player.ts)
const UNARMED = { cannon: [], harpoon: [] } as const;
const NO_GUNS = { slots: { cannon: [], harpoon: [] }, startingGuns: UNARMED } as const;
// A bot's hull: it doesn't level and has no abilities
const BOT_HULL = { maxLevel: 1, abilities: 0 } as const;

export const SHIP_CLASSES: Readonly<Record<ShipClassId, ShipClass>> = {
  sloop: {
    id: 'sloop',
    line: 'starter',
    ...lineTier(0),
    name: 'Starter Sloop',
    hp: 400,
    nature: 'object',
    height: 8,
    radius: 9,
    // Measured on the model: stem to transom at deck level, widest beam
    hull: { bow: 15, stern: -14.5, halfBeam: 5.6 },
    viewRange: 360, // twice its swivel guns' reach
    maxSpeed: 90, // 9 knots
    minSpeed: 45, // 4.5 knots
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
    // A new player's are in the hold, the story's first step to fit them (story/story.ts)
    startingGuns: UNARMED,
    bite: null,
    barrage: null,
    hold: 10,
  },

  // The European line, the first the game has and the yardstick the others are balanced against, all six tiers built:
  // guns first, harpoons second. Its hull is set for a fight of 20–30 s between two ships of a tier with their tier's
  // guns in every cannon slot (about twice the hull a tier, as their damage grows), and a ship is meant to beat two of
  // the tier below; the arsenal is still to be balanced for both. Its speed grows a knot a tier up to tier 4, a little
  // after; its hold grows too. A new one comes with no guns (UNARMED)

  // Tier 1: what a player works towards in the starting waters (economy/shipyard.ts). Twice the sloop's hull and twice
  // its guns (8 cannons and 8 harpoon guns to its 4 and 4), a bigger hold, a knot quicker and a little slower to turn.
  // Its model is blender-assets/ships/european/coastalBark/build.py: the hull and the slots' places are measured on it.
  // How many guns a ship carries is the game's number, not the model's: the model shows six ports a side, a tier 5
  // ship may carry forty guns
  coastalBark: {
    id: 'coastalBark',
    line: 'european',
    ...lineTier(1),
    name: 'Royal Herald',
    hp: 800,
    nature: 'object',
    height: 10,
    radius: 12.5,
    // Measured on the model: stem to transom at the gun deck, widest beam
    hull: { bow: 21.5, stern: -19.7, halfBeam: 7.3 },
    viewRange: 420,
    maxSpeed: 100,
    minSpeed: 52,
    acceleration: 48,
    deceleration: 75,
    turnSpeed: 1.55,
    slots: {
      // The gun deck's ports from amidships out (the model's CANNONS_X), at the muzzles; then a gun at the rail of the
      // forecastle and of the quarterdeck
      cannon: [
        { x: -0.8, y: 7.5, z: 6.5 },
        { x: 2.6, y: 7.5, z: 6.5 },
        { x: -4.2, y: 7.5, z: 6.5 },
        { x: 6, y: 7.4, z: 6.5 },
        { x: -7.6, y: 7.5, z: 6.5 },
        { x: 9.2, y: 7.1, z: 6.5 },
        { x: 12.5, y: 6, z: 8.7 },
        { x: -12.5, y: 6.6, z: 9.5 },
      ],
      // The bow, the forecastle's corners and the stern; then the quarterdeck's corners (its deck, QUARTER_Z) and the
      // waist's bulwarks between the masts (the model has no harpoon guns of its own: these are where shots leave)
      harpoon: [
        { x: 17, y: 0, z: 8.9 },
        { x: 13.5, y: 3, z: 8.4 },
        { x: 13.5, y: -3, z: 8.4 },
        { x: -16.5, y: 0, z: 9.9 },
        { x: -13, y: 4.2, z: 9.2 },
        { x: -13, y: -4.2, z: 9.2 },
        { x: 4.5, y: 6.4, z: 7 },
        { x: 4.5, y: -6.4, z: 7 },
      ],
    },
    startingGuns: UNARMED,
    bite: null,
    barrage: null,
    hold: 15,
  },

  // Tier 2: a three-master with three tiers of guns, 13 cannons and 10 harpoon guns, about twice the Royal Herald's hull,
  // a bigger hold, a knot quicker and slower to turn. Its model is blender-assets/ships/european/corsair/build.py: the
  // hull and the slots' places are measured on it. It shows some fifty ports; the game's thirteen cannons are the main
  // battery's eight a side and the lower battery's five amidships
  corsair: {
    id: 'corsair',
    line: 'european',
    ...lineTier(2),
    name: 'Salamander',
    hp: 1700,
    nature: 'object',
    height: 13,
    radius: 16,
    // Measured on the model: stem to transom at the upper deck, widest beam (the knee of the head and its ram reach
    // further, but narrow)
    hull: { bow: 28, stern: -25.5, halfBeam: 8.8 },
    viewRange: 450,
    maxSpeed: 110,
    minSpeed: 57,
    acceleration: 46,
    deceleration: 72,
    turnSpeed: 1.45,
    slots: {
      // The main battery in the waist from amidships out (the model's GUN_ROWS "main"), at the muzzles; then the
      // lower battery's middle ports
      cannon: [
        { x: -0.8, y: 9, z: 8.3 },
        { x: 2.4, y: 9, z: 8.3 },
        { x: -4, y: 9, z: 8.3 },
        { x: 5.6, y: 9, z: 8.3 },
        { x: -7.2, y: 9, z: 8.3 },
        { x: 8.8, y: 8.9, z: 8.3 },
        { x: -10.4, y: 9, z: 8.3 },
        { x: 12, y: 8.5, z: 8.3 },
        { x: 0.4, y: 9.4, z: 4.5 },
        { x: -3, y: 9.4, z: 4.5 },
        { x: 3.8, y: 9.4, z: 4.5 },
        { x: -6.4, y: 9.4, z: 4.5 },
        { x: 7.2, y: 9.3, z: 4.5 },
      ],
      // The model's three launchers (the forecastle's, the quarterdeck's pair), then the forecastle's corners, the
      // stern, the quarterdeck's corners and the waist's bulwarks
      harpoon: [
        { x: 22.6, y: 0, z: 11 },
        { x: -14, y: -2.6, z: 11.7 },
        { x: -14, y: 2.6, z: 11.7 },
        { x: 19, y: 3.6, z: 10.4 },
        { x: 19, y: -3.6, z: 10.4 },
        { x: -25, y: 0, z: 12.6 },
        { x: -22, y: 4.8, z: 11.4 },
        { x: -22, y: -4.8, z: 11.4 },
        { x: 4, y: 8, z: 9.2 },
        { x: 4, y: -8, z: 9.2 },
      ],
    },
    startingGuns: UNARMED,
    bite: null,
    barrage: null,
    hold: 20,
  },

  // Tier 3: the Salamander drawn out for speed, a few percent bigger, three raked masts under sharp orange and lilac
  // sails, two batteries. 20 cannons and 14 harpoon guns, about twice the Salamander's hull, a bigger hold, a knot quicker
  // and a little slower to turn. Its model is blender-assets/ships/european/frigate/build.py, made SCALE (1.04) times
  // bigger once built: the hull and the slots' places are measured on it, scaled
  frigate: {
    id: 'frigate',
    line: 'european',
    ...lineTier(3),
    name: 'Peregrine',
    hp: 3300,
    nature: 'object',
    height: 13.5,
    radius: 17,
    // Measured on the model: stem to transom at the upper deck, widest beam (the cutwater, its beak and the lance reach
    // further, but narrow)
    hull: { bow: 30.5, stern: -27, halfBeam: 8.9 },
    viewRange: 490,
    maxSpeed: 120,
    minSpeed: 62,
    acceleration: 45,
    deceleration: 70,
    turnSpeed: 1.35,
    slots: {
      // The main battery in the waist from amidships out (the model's GUN_ROWS "main"), at the muzzles; then the
      // lower battery from amidships out, and a light gun on the quarterdeck
      cannon: [
        { x: -0.8, y: 9.1, z: 8.6 },
        { x: 2.5, y: 9.1, z: 8.6 },
        { x: -4.2, y: 9.1, z: 8.6 },
        { x: 5.8, y: 9.1, z: 8.6 },
        { x: -7.5, y: 9.1, z: 8.6 },
        { x: 9.2, y: 8.9, z: 8.6 },
        { x: -10.8, y: 9.1, z: 8.6 },
        { x: 12.5, y: 8.5, z: 8.6 },
        { x: 0.8, y: 9.6, z: 4.7 },
        { x: -2.9, y: 9.6, z: 4.7 },
        { x: 4.5, y: 9.6, z: 4.7 },
        { x: -6.6, y: 9.6, z: 4.7 },
        { x: 8.2, y: 9.4, z: 4.7 },
        { x: -10.3, y: 9.6, z: 4.7 },
        { x: 11.9, y: 8.9, z: 4.7 },
        { x: -13.9, y: 9.3, z: 4.7 },
        { x: 15.6, y: 7.9, z: 4.7 },
        { x: -17.7, y: 8.8, z: 4.7 },
        { x: -21.3, y: 8.1, z: 4.7 },
        { x: -21.2, y: 6.9, z: 11.9 },
      ],
      // The model's three launchers (the forecastle's, the quarterdeck's pair), then the forecastle's corners, the
      // stern, the quarterdeck's corners and the waist's bulwarks
      harpoon: [
        { x: 23.5, y: 0, z: 11.4 },
        { x: -14.6, y: -2.7, z: 12.1 },
        { x: -14.6, y: 2.7, z: 12.1 },
        { x: 19.8, y: 3.7, z: 10.8 },
        { x: 19.8, y: -3.7, z: 10.8 },
        { x: -26.5, y: 0, z: 13.1 },
        { x: -22.9, y: 5, z: 11.9 },
        { x: -22.9, y: -5, z: 11.9 },
        { x: 4.2, y: 8.3, z: 9.6 },
        { x: 4.2, y: -8.3, z: 9.6 },
        { x: -6.2, y: 8.3, z: 9.6 },
        { x: -6.2, y: -8.3, z: 9.6 },
        { x: 9.4, y: 8.1, z: 9.6 },
        { x: 9.4, y: -8.1, z: 9.6 },
      ],
    },
    startingGuns: UNARMED,
    bite: null,
    barrage: null,
    hold: 32,
  },

  // Tier 4: the king's treasure ship, a galleon about a tenth longer than the Peregrine and much wider, with a high
  // stepped stern, four masts under silver sails and gilt crowns. 31 cannons and 19 harpoon guns, about twice the
  // Peregrine's hull, a bigger hold, a knot quicker under its four masts and heavier on the helm. Its model is
  // blender-assets/ships/european/royalGalleon/build.py
  royalGalleon: {
    id: 'royalGalleon',
    line: 'european',
    ...lineTier(4),
    name: 'Crowned Lion',
    hp: 6200,
    nature: 'object',
    height: 15,
    radius: 19,
    // Measured on the model: stem to transom at the upper deck, widest beam (the beak, its lion and the stern gallery
    // reach further, but narrow)
    hull: { bow: 31.3, stern: -31.7, halfBeam: 11 },
    viewRange: 490,
    maxSpeed: 130,
    minSpeed: 67,
    acceleration: 40,
    deceleration: 64,
    turnSpeed: 1.2,
    slots: {
      // The main battery in the waist from amidships out (the model's GUN_ROWS "main"), at the muzzles; the lower
      // battery from amidships out; the castle's ports under the quarterdeck, the light guns on the forecastle and
      // the quarterdeck, a stern chaser in the gallery and a bow chaser under the forecastle
      cannon: [
        { x: 2.4, y: 11.1, z: 8.9 },
        { x: -1, y: 11.1, z: 8.9 },
        { x: 5.8, y: 11.1, z: 8.9 },
        { x: 9.2, y: 11.1, z: 8.9 },
        { x: -4.4, y: 11.1, z: 8.9 },
        { x: -7.8, y: 11.1, z: 8.9 },
        { x: 12.6, y: 10.8, z: 8.9 },
        { x: -1.8, y: 11.6, z: 4.8 },
        { x: -5.6, y: 11.6, z: 4.8 },
        { x: 2, y: 11.6, z: 4.8 },
        { x: 5.8, y: 11.6, z: 4.8 },
        { x: -9.4, y: 11.6, z: 4.8 },
        { x: -13.2, y: 11.5, z: 4.8 },
        { x: 9.6, y: 11.6, z: 4.8 },
        { x: -17, y: 11.1, z: 4.8 },
        { x: 13.4, y: 11.2, z: 4.8 },
        { x: -20.8, y: 10.3, z: 4.8 },
        { x: 17.2, y: 10.4, z: 4.8 },
        { x: -24.6, y: 9.4, z: 4.8 },
        { x: 21, y: 9.1, z: 4.8 },
        { x: -14, y: 10.9, z: 9.3 },
        { x: -17.4, y: 10.5, z: 9.3 },
        { x: -20.8, y: 9.9, z: 9.3 },
        { x: -24.2, y: 9.2, z: 9.3 },
        { x: 20.2, y: 8.3, z: 12 },
        { x: 23.2, y: 7.4, z: 12 },
        { x: -13.6, y: 9.5, z: 12.6 },
        { x: -16.6, y: 9.2, z: 12.6 },
        { x: -19.4, y: 8.9, z: 12.6 },
        { x: -33, y: 2.4, z: 9.4 },
        { x: 26.5, y: 3.5, z: 10 },
      ],
      // The model's five launchers (the forecastle's, the quarterdeck's pair, the poop's pair), then the corners of
      // the forecastle, the quarterdeck and the poop, the stern, and the waist's bulwarks
      harpoon: [
        { x: 25.6, y: 0, z: 12.2 },
        { x: -12.7, y: -2.8, z: 12.9 },
        { x: -12.7, y: 2.8, z: 12.9 },
        { x: -27.4, y: -2.3, z: 15.9 },
        { x: -27.4, y: 2.3, z: 15.9 },
        { x: 20, y: 7, z: 13.1 },
        { x: 20, y: -7, z: 13.1 },
        { x: -16, y: 7.8, z: 13.7 },
        { x: -16, y: -7.8, z: 13.7 },
        { x: -24.5, y: 5.1, z: 16.7 },
        { x: -24.5, y: -5.1, z: 16.7 },
        { x: -30.5, y: 3.2, z: 16.8 },
        { x: -30.5, y: -3.2, z: 16.8 },
        { x: 4.2, y: 9.7, z: 9.9 },
        { x: 4.2, y: -9.7, z: 9.9 },
        { x: -6.2, y: 9.7, z: 9.9 },
        { x: -6.2, y: -9.7, z: 9.9 },
        { x: 9.4, y: 9.6, z: 9.9 },
        { x: 9.4, y: -9.6, z: 9.9 },
      ],
    },
    startingGuns: UNARMED,
    bite: null,
    barrage: null,
    hold: 40,
  },

  // The European line's tier 5: a black and gold first-rate flagship, three gun decks, towering black sails and a gilt
  // eagle at the head. The Crowned Lion's size on the water, but far more hull and guns, a little faster under that
  // rig, slower to turn and with the widest sight. Its model is blender-assets/ships/european/admiral/build.py
  admiral: {
    id: 'admiral',
    line: 'european',
    ...lineTier(5),
    name: 'Black Eagle',
    hp: 12500,
    nature: 'object',
    height: 17,
    radius: 19,
    // Measured on the model: stem to transom at the upper deck, widest beam (the beak, its eagle and the stern
    // galleries reach further, but narrow)
    hull: { bow: 32.7, stern: -30.6, halfBeam: 10.4 },
    viewRange: 520,
    maxSpeed: 132,
    minSpeed: 68,
    acceleration: 40,
    deceleration: 64,
    turnSpeed: 1.1,
    slots: {
      // The upper gun deck's ports from amidships out (the model's GUN_ROWS "upper"), at the muzzles; the middle gun
      // deck's; the light guns on the quarterdeck and the forecastle; and the lower gun deck's middle ports
      cannon: [
        { x: 1.2, y: 10.2, z: 10.3 },
        { x: -2.2, y: 10.2, z: 10.3 },
        { x: 4.7, y: 10.2, z: 10.3 },
        { x: -5.7, y: 10.2, z: 10.3 },
        { x: 8.1, y: 10.2, z: 10.3 },
        { x: -9.2, y: 10.2, z: 10.3 },
        { x: 11.6, y: 9.9, z: 10.3 },
        { x: -12.6, y: 10.2, z: 10.3 },
        { x: 15.1, y: 9.4, z: 10.3 },
        { x: -16.1, y: 9.9, z: 10.3 },
        { x: 18.5, y: 8.7, z: 10.3 },
        { x: -19.5, y: 9.5, z: 10.3 },
        { x: 22, y: 7.6, z: 10.3 },
        { x: -23, y: 8.9, z: 10.3 },
        { x: 0, y: 10.9, z: 7.1 },
        { x: -3.4, y: 10.9, z: 7.1 },
        { x: 3.4, y: 10.9, z: 7.1 },
        { x: -6.8, y: 10.9, z: 7.1 },
        { x: 6.9, y: 10.8, z: 7.1 },
        { x: -10.3, y: 10.9, z: 7.1 },
        { x: 10.3, y: 10.7, z: 7.1 },
        { x: -13.7, y: 10.8, z: 7.1 },
        { x: 13.7, y: 10.2, z: 7.1 },
        { x: -17.1, y: 10.4, z: 7.1 },
        { x: 17.2, y: 9.5, z: 7.1 },
        { x: -20.6, y: 9.8, z: 7.1 },
        { x: 20.6, y: 8.4, z: 7.1 },
        { x: -24, y: 9.1, z: 7.1 },
        { x: 24, y: 7, z: 7.1 },
        { x: -11.8, y: 8.4, z: 15 },
        { x: -14.9, y: 8.3, z: 15 },
        { x: -18, y: 8, z: 15 },
        { x: 19.6, y: 7.1, z: 14.6 },
        { x: 22.6, y: 6.3, z: 14.6 },
        { x: -0.2, y: 11, z: 3.9 },
        { x: 3.2, y: 11, z: 3.9 },
        { x: -3.7, y: 11, z: 3.9 },
        { x: 6.7, y: 11, z: 3.9 },
        { x: -7.2, y: 11, z: 3.9 },
        { x: 10.2, y: 10.8, z: 3.9 },
        { x: -10.7, y: 11, z: 3.9 },
        { x: 13.7, y: 10.3, z: 3.9 },
      ],
      // The model's five launchers (the forecastle's, the quarterdeck's pair, the poop's pair), then the bulwarks
      // round the forecastle, the quarterdeck and the poop, and the waist's
      harpoon: [
        { x: 25.2, y: 0, z: 14.9 },
        { x: -11, y: -2.8, z: 15.2 },
        { x: -11, y: 2.8, z: 15.2 },
        { x: -26.4, y: -2.2, z: 17.4 },
        { x: -26.4, y: 2.2, z: 17.4 },
        { x: 21, y: 5, z: 15.9 },
        { x: 21, y: -5, z: 15.9 },
        { x: 24, y: 4, z: 16.5 },
        { x: 24, y: -4, z: 16.5 },
        { x: -13.5, y: 6.5, z: 16.2 },
        { x: -13.5, y: -6.5, z: 16.2 },
        { x: -17, y: 6.2, z: 16.2 },
        { x: -17, y: -6.2, z: 16.2 },
        { x: -23, y: 4.5, z: 18.4 },
        { x: -23, y: -4.5, z: 18.4 },
        { x: -28, y: 3.6, z: 18.9 },
        { x: -28, y: -3.6, z: 18.9 },
        { x: 13.5, y: 7.2, z: 13.6 },
        { x: 13.5, y: -7.2, z: 13.6 },
        { x: 6.5, y: 7.7, z: 13.6 },
        { x: 6.5, y: -7.7, z: 13.6 },
        { x: -0.5, y: 7.7, z: 13.6 },
        { x: -0.5, y: -7.7, z: 13.6 },
        { x: -7.5, y: 7.7, z: 13.6 },
        { x: -7.5, y: -7.7, z: 13.6 },
      ],
    },
    startingGuns: UNARMED,
    bite: null,
    barrage: null,
    hold: 54,
  },

  // The European line's tier 6, its last: a golden three-decker with emerald strakes, the tallest rig afloat in cloth
  // of gold and a gilt shark's tail at the stern. 15% over the Black Eagle every way, with twice its hull and half as many
  // guns again, a little faster under that rig, the slowest to turn and with the widest sight. Its model is
  // blender-assets/ships/european/shipOfTheLine/build.py
  shipOfTheLine: {
    id: 'shipOfTheLine',
    line: 'european',
    ...lineTier(6),
    name: 'Sovereign of the Seas',
    hp: 24000,
    nature: 'object',
    height: 20,
    radius: 22,
    // Measured on the model: stem to transom at the upper deck, widest beam (the stern galleries and the shark's tail
    // reach further, but narrow)
    hull: { bow: 37.8, stern: -35.3, halfBeam: 12 },
    viewRange: 550,
    maxSpeed: 135,
    minSpeed: 70,
    acceleration: 38,
    deceleration: 62,
    turnSpeed: 1,
    slots: {
      // The upper gun deck's ports from amidships out (the model's GUN_ROWS "upper"), at the muzzles; the middle gun
      // deck's; the light guns on the quarterdeck and the forecastle; the lower gun deck's. The model has 49 ports a
      // side, so the last 13 guns fire out of the middle and lower decks' midship ports again
      cannon: [
        { x: 1.4, y: 11.5, z: 12.6 },
        { x: -2.6, y: 11.5, z: 12.6 },
        { x: 5.4, y: 11.5, z: 12.6 },
        { x: -6.6, y: 11.5, z: 12.6 },
        { x: 9.4, y: 11.5, z: 12.6 },
        { x: -10.5, y: 11.5, z: 12.6 },
        { x: 13.3, y: 11.2, z: 12.6 },
        { x: -14.5, y: 11.5, z: 12.6 },
        { x: 17.3, y: 10.6, z: 12.6 },
        { x: -18.5, y: 11.2, z: 12.6 },
        { x: 21.3, y: 9.8, z: 12.6 },
        { x: -22.5, y: 10.7, z: 12.6 },
        { x: 25.3, y: 8.6, z: 12.6 },
        { x: -26.4, y: 10, z: 12.6 },
        { x: 0, y: 12.4, z: 8.7 },
        { x: -3.9, y: 12.4, z: 8.7 },
        { x: 4, y: 12.4, z: 8.7 },
        { x: -7.9, y: 12.4, z: 8.7 },
        { x: 7.9, y: 12.4, z: 8.7 },
        { x: -11.8, y: 12.4, z: 8.7 },
        { x: 11.8, y: 12.2, z: 8.7 },
        { x: -15.8, y: 12.3, z: 8.7 },
        { x: 15.8, y: 11.7, z: 8.7 },
        { x: -19.7, y: 11.9, z: 8.7 },
        { x: 19.7, y: 10.8, z: 8.7 },
        { x: -23.7, y: 11.3, z: 8.7 },
        { x: 23.7, y: 9.7, z: 8.7 },
        { x: -27.6, y: 10.4, z: 8.7 },
        { x: 27.6, y: 8.1, z: 8.7 },
        { x: -13.6, y: 9.1, z: 18.4 },
        { x: -17.1, y: 9, z: 18.4 },
        { x: -20.7, y: 8.7, z: 18.4 },
        { x: 22.5, y: 7.7, z: 17.9 },
        { x: 26, y: 6.9, z: 17.9 },
        { x: -0.3, y: 12.7, z: 4.8 },
        { x: 3.7, y: 12.7, z: 4.8 },
        { x: -4.3, y: 12.7, z: 4.8 },
        { x: 7.7, y: 12.7, z: 4.8 },
        { x: -8.3, y: 12.7, z: 4.8 },
        { x: 11.7, y: 12.5, z: 4.8 },
        { x: -12.3, y: 12.7, z: 4.8 },
        { x: 15.7, y: 11.9, z: 4.8 },
        { x: -16.3, y: 12.6, z: 4.8 },
        { x: 19.7, y: 11, z: 4.8 },
        { x: -20.3, y: 12.1, z: 4.8 },
        { x: 23.7, y: 9.6, z: 4.8 },
        { x: -24.3, y: 11.3, z: 4.8 },
        { x: 27.7, y: 7.8, z: 4.8 },
        { x: -28.3, y: 10.4, z: 4.8 },
        { x: 0, y: 12.4, z: 8.7 },
        { x: -3.9, y: 12.4, z: 8.7 },
        { x: 4, y: 12.4, z: 8.7 },
        { x: -7.9, y: 12.4, z: 8.7 },
        { x: 7.9, y: 12.4, z: 8.7 },
        { x: -11.8, y: 12.4, z: 8.7 },
        { x: 11.8, y: 12.2, z: 8.7 },
        { x: -0.3, y: 12.7, z: 4.8 },
        { x: 3.7, y: 12.7, z: 4.8 },
        { x: -4.3, y: 12.7, z: 4.8 },
        { x: 7.7, y: 12.7, z: 4.8 },
        { x: -8.3, y: 12.7, z: 4.8 },
        { x: 11.7, y: 12.5, z: 4.8 },
      ],
      // The model's five launchers (the forecastle's, the quarterdeck's pair, the poop's pair), then the bulwarks
      // round the forecastle, the quarterdeck and the poop, the waist's, and the taffrail over the stern
      harpoon: [
        { x: 29, y: 0, z: 18.2 },
        { x: -12.6, y: -3.2, z: 18.7 },
        { x: -12.6, y: 3.2, z: 18.7 },
        { x: -30.4, y: -2.5, z: 21.7 },
        { x: -30.4, y: 2.5, z: 21.7 },
        { x: 24.1, y: 5.2, z: 19.5 },
        { x: 24.1, y: -5.2, z: 19.5 },
        { x: 27.6, y: 4.1, z: 20.2 },
        { x: 27.6, y: -4.1, z: 20.2 },
        { x: 20.7, y: 6, z: 19.3 },
        { x: 20.7, y: -6, z: 19.3 },
        { x: -15.5, y: 6.8, z: 19.8 },
        { x: -15.5, y: -6.8, z: 19.8 },
        { x: -19.5, y: 6.6, z: 19.8 },
        { x: -19.5, y: -6.6, z: 19.8 },
        { x: -23, y: 6, z: 20.2 },
        { x: -23, y: -6, z: 20.2 },
        { x: -26.4, y: 4.2, z: 22.8 },
        { x: -26.4, y: -4.2, z: 22.8 },
        { x: -32.2, y: 3.3, z: 23.4 },
        { x: -32.2, y: -3.3, z: 23.4 },
        { x: 15.5, y: 8, z: 16.6 },
        { x: 15.5, y: -8, z: 16.6 },
        { x: 11.5, y: 8.3, z: 16.6 },
        { x: 11.5, y: -8.3, z: 16.6 },
        { x: 7.5, y: 8.5, z: 16.6 },
        { x: 7.5, y: -8.5, z: 16.6 },
        { x: 3.4, y: 8.5, z: 16.6 },
        { x: 3.4, y: -8.5, z: 16.6 },
        { x: -0.6, y: 8.5, z: 16.6 },
        { x: -0.6, y: -8.5, z: 16.6 },
        { x: -4.6, y: 8.5, z: 16.6 },
        { x: -4.6, y: -8.5, z: 16.6 },
        { x: -8.6, y: 8.5, z: 16.6 },
        { x: -8.6, y: -8.5, z: 16.6 },
        { x: -35.3, y: 0, z: 23.7 },
      ],
    },
    startingGuns: UNARMED,
    bite: null,
    barrage: null,
    hold: 100,
  },

  // The bots' hulls (bots/botKinds.ts says how each bot behaves). Sea monsters sail as ships do, under a pilot, so
  // they are ships to the game too: creatures, with jaws instead of guns. Their numbers are balanced against the
  // starter sloop with its starting guns (pirate-balance.xlsx, Plan bots); their speeds against its 9 knots, three
  // quarters of the table's, as the sloop's is of its 12
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
    viewRange: 280,
    maxSpeed: 56,
    minSpeed: 30,
    acceleration: 40,
    deceleration: 70,
    turnSpeed: 1.6,
    ...NO_GUNS,
    bite: null,
    barrage: null,
    hold: 0,
    ...BOT_HULL,
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
    viewRange: 320,
    maxSpeed: 64,
    minSpeed: 34,
    acceleration: 40,
    deceleration: 70,
    turnSpeed: 1.4,
    // One swivel gun on the rail: dangerous only up close
    slots: { cannon: [{ x: 1, y: 5.4, z: 4.2 }], harpoon: [] },
    startingGuns: { cannon: ['swivelGun'], harpoon: [] },
    bite: null,
    barrage: null,
    hold: 0,
    ...BOT_HULL,
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
    viewRange: 340,
    maxSpeed: 75,
    minSpeed: 41,
    acceleration: 50,
    deceleration: 80,
    turnSpeed: 1.7,
    slots: { cannon: [{ x: -1, y: 5.6, z: 4.6 }], harpoon: [] },
    startingGuns: { cannon: ['cannon1'], harpoon: [] },
    bite: null,
    barrage: null,
    hold: 0,
    ...BOT_HULL,
  },
  // The starting waters' boss (bots/botKinds.ts, `baron`): a slow brig with four cannons and a mortar that marks
  // where its shells will fall; it sails with two smugglers. Balanced against a sloop of about level 7 with guns of
  // tier 2: a fight of a minute or two, won by keeping out of the marked circles
  baronBrig: {
    id: 'baronBrig',
    line: 'bots',
    tier: 2,
    name: 'Smuggler Baron',
    hp: 900,
    nature: 'object',
    height: 10,
    radius: 15,
    hull: { bow: 22, stern: -20.5, halfBeam: 7.6 },
    viewRange: 390,
    maxSpeed: 49,
    minSpeed: 34,
    acceleration: 32,
    deceleration: 60,
    turnSpeed: 1,
    slots: {
      cannon: [
        { x: -3, y: 7.6, z: 5.6 },
        { x: 6, y: 7.2, z: 5.6 },
      ],
      harpoon: [],
    },
    startingGuns: { cannon: ['swivelGun', 'swivelGun'], harpoon: [] },
    bite: null,
    barrage: {
      range: 300,
      cooldown: 8,
      shells: 4,
      radius: 24,
      delay: 1.8,
      spread: 55,
      die: 16,
      missOn: 1,
      critFrom: 16,
      critMultiplier: 2,
      bonus: 5,
    },
    hold: 0,
    ...BOT_HULL,
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
    viewRange: 250,
    maxSpeed: 41,
    minSpeed: 26,
    acceleration: 30,
    deceleration: 60,
    turnSpeed: 1.5,
    ...NO_GUNS,
    bite: { die: 6, missOn: 1, critFrom: 6, critMultiplier: 2, bonus: 1, reach: 18, reload: 3 },
    barrage: null,
    hold: 0,
    ...BOT_HULL,
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
    viewRange: 320,
    // A little slower than an intact sloop: a player can get away from it, unless badly damaged
    maxSpeed: 79,
    minSpeed: 53,
    acceleration: 60,
    deceleration: 90,
    turnSpeed: 2.2,
    ...NO_GUNS,
    bite: { die: 12, missOn: 1, critFrom: 12, critMultiplier: 2, bonus: 2, reach: 20, reload: 2.5 },
    barrage: null,
    hold: 0,
    ...BOT_HULL,
  },

  // The hulls of the seas past the starting waters (bots/botKinds.ts, zoneKinds): each sea's bots sail these, made as
  // tough and as hard-hitting as the sea asks (a kind's `hp` and `power`): the figures here are only their size,
  // speed and guns or jaws. Vector-drawn for now (botShip3d.ts, monster3d.ts), until they are modelled
  pirateBrig: {
    id: 'pirateBrig',
    line: 'bots',
    tier: 2,
    name: 'Pirate brig',
    hp: 400,
    nature: 'object',
    height: 9,
    radius: 13,
    hull: { bow: 19, stern: -18, halfBeam: 6.6 },
    viewRange: 380,
    maxSpeed: 72,
    minSpeed: 40,
    acceleration: 42,
    deceleration: 70,
    turnSpeed: 1.4,
    slots: {
      cannon: [
        { x: -3, y: 6.4, z: 5 },
        { x: 4, y: 6.2, z: 5 },
        { x: -9, y: 6, z: 5 },
      ],
      harpoon: [],
    },
    startingGuns: { cannon: ['cannon1', 'cannon1', 'cannon1'], harpoon: [] },
    bite: null,
    barrage: null,
    hold: 0,
    ...BOT_HULL,
  },
  // A sea's elite: a warship as strong as a player's ship of its tier, seldom met
  warship: {
    id: 'warship',
    line: 'bots',
    tier: 3,
    name: 'Warship',
    hp: 1500,
    nature: 'object',
    height: 12,
    radius: 18,
    hull: { bow: 27, stern: -25, halfBeam: 8.6 },
    viewRange: 420,
    maxSpeed: 68,
    minSpeed: 40,
    acceleration: 36,
    deceleration: 60,
    turnSpeed: 1.15,
    slots: {
      cannon: [
        { x: -2, y: 8.4, z: 6 },
        { x: 4, y: 8.2, z: 6 },
        { x: -8, y: 8.2, z: 6 },
        { x: 10, y: 7.6, z: 6 },
        { x: -14, y: 7.6, z: 6 },
        { x: 16, y: 6.4, z: 6 },
      ],
      harpoon: [],
    },
    startingGuns: { cannon: Array<GunId>(6).fill('cannon1'), harpoon: [] },
    bite: null,
    barrage: null,
    hold: 0,
    ...BOT_HULL,
  },
  // A sea's boss when it is a ship: a slow flagship with a mortar like the Baron's, sailing with its escort
  flagship: {
    id: 'flagship',
    line: 'bots',
    tier: 4,
    name: 'Pirate flagship',
    hp: 3000,
    nature: 'object',
    height: 14,
    radius: 21,
    hull: { bow: 31, stern: -29, halfBeam: 10 },
    viewRange: 440,
    maxSpeed: 55,
    minSpeed: 38,
    acceleration: 30,
    deceleration: 55,
    turnSpeed: 0.95,
    slots: {
      cannon: [
        { x: -4, y: 9.8, z: 7 },
        { x: 5, y: 9.6, z: 7 },
        { x: -13, y: 9.4, z: 7 },
        { x: 14, y: 8.8, z: 7 },
      ],
      harpoon: [],
    },
    startingGuns: { cannon: Array<GunId>(4).fill('cannon1'), harpoon: [] },
    bite: null,
    barrage: {
      range: 320,
      cooldown: 8,
      shells: 5,
      radius: 26,
      delay: 1.8,
      spread: 60,
      die: 16,
      missOn: 1,
      critFrom: 16,
      critMultiplier: 2,
      bonus: 5,
    },
    hold: 0,
    ...BOT_HULL,
  },
  // A slow, armoured brawler of the shallows: it leaves alone whoever leaves it alone
  giantCrab: {
    id: 'giantCrab',
    line: 'monsters',
    tier: 2,
    name: 'Giant crab',
    hp: 300,
    nature: 'creature',
    height: 5,
    radius: 10,
    // Its shell, wide across, and its claws ahead of it
    hull: { bow: 9, stern: -8, halfBeam: 8 },
    viewRange: 260,
    maxSpeed: 40,
    minSpeed: 25,
    acceleration: 30,
    deceleration: 60,
    turnSpeed: 1.6,
    ...NO_GUNS,
    bite: { die: 8, missOn: 1, critFrom: 8, critMultiplier: 2, bonus: 2, reach: 16, reload: 2.5 },
    barrage: null,
    hold: 0,
    ...BOT_HULL,
  },
  // Quick and hungry: it hunts in the open sea, faster than the starter sloop, slower than a tier 1 ship
  shark: {
    id: 'shark',
    line: 'monsters',
    tier: 2,
    name: 'Great shark',
    hp: 220,
    nature: 'creature',
    height: 4,
    radius: 9,
    hull: { bow: 12, stern: -11, halfBeam: 3.5 },
    viewRange: 320,
    maxSpeed: 95,
    minSpeed: 65,
    acceleration: 70,
    deceleration: 90,
    turnSpeed: 2.4,
    ...NO_GUNS,
    bite: { die: 10, missOn: 1, critFrom: 10, critMultiplier: 2, bonus: 2, reach: 14, reload: 2 },
    barrage: null,
    hold: 0,
    ...BOT_HULL,
  },
  // A sea's boss when it is a monster: a kraken, its arms reaching far round it, with its sharks
  kraken: {
    id: 'kraken',
    line: 'monsters',
    tier: 4,
    name: 'Kraken',
    hp: 3000,
    nature: 'creature',
    height: 10,
    radius: 22,
    hull: { bow: 18, stern: -18, halfBeam: 16 },
    viewRange: 400,
    maxSpeed: 45,
    minSpeed: 35,
    acceleration: 25,
    deceleration: 50,
    turnSpeed: 0.9,
    ...NO_GUNS,
    bite: { die: 20, missOn: 2, critFrom: 19, critMultiplier: 2, bonus: 6, reach: 30, reload: 3 },
    barrage: null,
    hold: 0,
    ...BOT_HULL,
  },
};

/** The ship every new player gets */
export const STARTER_SHIP: ShipClassId = 'sloop';
