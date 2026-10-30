import { AMMO, GUNS, averageDamage, type AmmoId } from '../combat/arsenal';
import type { CargoDrop } from '../economy/cargo';
import type { Point } from '../lib/geometry';
import { SHIP_CLASSES, lineTier, type ShipClass, type ShipClassId } from '../ships/shipClasses';
import { MAP_SQUARES } from '../world/map';
import { START_ZONE, ZONES, ZONE_IDS, type OuterZoneId, type ZoneId } from '../world/zones';

/** The starting waters' own kinds of bots */
type StarterKindId =
  'fisher' | 'merchant' | 'smuggler' | 'turtle' | 'serpent' | 'jackals' | 'inkmother' | 'inkling' | 'baron';
/** What every other sea's bots are made from (ARCHETYPES) */
export type ArchetypeKey = 'trader' | 'raider' | 'grazer' | 'pirate' | 'hunter' | 'pack' | 'elite' | 'boss';
/**
 * A kind of bot, by id: the starting waters' own (`fisher`, `baron`…) and every other sea's, made from the sea and an
 * archetype (`coralCoast.pirate`: zoneKinds)
 */
export type BotKindId = StarterKindId | `${OuterZoneId}.${ArchetypeKey}`;

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
  /** The tier of the sea it sails (world/zones.ts): a ship of a higher tier earns little for it (xpForKill) */
  readonly tier: number;
  /** Its hull points, if not its class's: a sea's bots are as tough as the sea asks */
  readonly hp: number | null;
  /** What its guns' or jaws' damage is multiplied by (Ship.power): 1 for the starting waters' */
  readonly power: number;
  readonly behaviour: Behaviour;
  /** The ammo its guns fire, if it has guns: it never runs out */
  readonly ammo: AmmoId | null;
  /** How close a player's ship must come for an aggressive bot to attack it, world units; 0 for a neutral one */
  readonly aggroRange: number;
  /** Share of its top speed it sails at while nobody bothers it */
  readonly cruise: number;
  /** How many of it sail each square of the map (MAP_SQUARE across) on average: the bigger the world, the more */
  readonly perSquare: number;
  /**
   * How many sail together, a pack (bots/brain.ts: they follow the first of them and fight as one), far from the port
   * (bots/spawner.ts, PACK_SAFE); 1 for one that sails alone
   */
  readonly pack: number;
  /** Seconds before a sunk one is replaced */
  readonly respawnTime: number;
  /** Gold the player who sinks it is paid */
  readonly bounty: number;
  /** How tough it is among its tier's levels, 1 up: a ship far above it earns less for it (ships/talents.ts, xpForKill) */
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
  /** A boss or a mini-boss: one of it, at its lair, with its escort if it has one; null for the rest */
  readonly boss: Boss | null;
}

/**
 * A boss sails alone in the world, round its `lair` (open water near it), with `escorts` of another kind that follow
 * it and join its fights; none of them comes back on its own, all come back together `respawnTime` after the boss sank.
 * A sea has one boss, and may have mini-bosses: lesser ones, alone at lairs of their own
 */
export interface Boss {
  readonly lair: Point;
  /** Its escort; null for one that keeps its lair alone */
  readonly escorts: { readonly kind: BotKindId; readonly count: number } | null;
  /** A mini-boss: the players are told it is one, not the sea's boss */
  readonly mini: boolean;
}

// The starting waters' bots, balanced against the starter sloop with the guns a new player has (four cannons I, four
// harpoon guns I): each fight costs it a share of its hull that the repair skill brings back in half a minute or so.
// pirate-balance.xlsx, Plan bots, has the first numbers; their experience is two and a half times the table's, so the
// sloop reaches its last level in about two hours. The loot is kept lean: about 7 gold a fishing boat, 15 a turtle,
// 22–29 the rest (bounty + chests on average); chests of gold only from ships, a monster leaves only what its body is
// worth. Goods drop now and then, a piece or two, and sell for about a tenth as much again at the market
// (economy/cargo.ts), once carried home. Moon glass now and then from each (the story: they all deal in it, or ate it),
// every time from the story's own prey (economy/loot.ts), crates of it from the Baron
const STARTER_KINDS: Readonly<Record<StarterKindId, BotKind>> = {
  // Nets and fish, no guns: it runs from whoever attacks it
  fisher: {
    id: 'fisher',
    shipClass: 'fishingBoat',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'neutral',
    ammo: null,
    aggroRange: 0,
    cruise: 0.5,
    perSquare: 1,
    pack: 1,
    respawnTime: 20,
    bounty: 6,
    level: 1,
    xp: 25,
    chest: { chance: 0.15, gold: [3, 6] },
    cargo: [
      { good: 'fish', count: [1, 2], chance: 0.35 },
      { good: 'moonGlass', count: [1, 1], chance: 0.08 },
    ],
    boss: null,
  },
  // A swivel gun that reaches less far than the player's cannons: keep your distance and it can't answer
  merchant: {
    id: 'merchant',
    shipClass: 'merchantSloop',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'neutral',
    ammo: 'ball1',
    aggroRange: 0,
    cruise: 0.55,
    perSquare: 0.75,
    pack: 1,
    respawnTime: 25,
    bounty: 18,
    level: 3,
    xp: 75,
    chest: { chance: 0.4, gold: [10, 25] },
    cargo: [
      { good: 'cloth', count: [1, 2], chance: 0.4 },
      { good: 'spices', count: [1, 1], chance: 0.15 },
      { good: 'moonGlass', count: [1, 1], chance: 0.1 },
    ],
    boss: null,
  },
  smuggler: {
    id: 'smuggler',
    shipClass: 'smugglerSloop',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'aggressive',
    ammo: 'ball1',
    aggroRange: 210,
    cruise: 0.5,
    perSquare: 1,
    pack: 1,
    respawnTime: 25,
    bounty: 25,
    level: 5,
    xp: 100,
    chest: { chance: 0.3, gold: [8, 20] },
    cargo: [
      { good: 'rum', count: [1, 1], chance: 0.35 },
      { good: 'contraband', count: [1, 1], chance: 0.15 },
      { good: 'moonGlass', count: [1, 1], chance: 0.12 },
    ],
    boss: null,
  },
  // Slow: a ship that keeps away from its jaws harpoons it without a scratch
  turtle: {
    id: 'turtle',
    shipClass: 'seaTurtle',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'neutral',
    ammo: null,
    aggroRange: 0,
    cruise: 0.6,
    perSquare: 0.75,
    pack: 1,
    respawnTime: 25,
    bounty: 15,
    level: 2,
    xp: 50,
    chest: null,
    cargo: [
      { good: 'turtleShell', count: [1, 1], chance: 0.3 },
      { good: 'moonGlass', count: [1, 1], chance: 0.1 },
    ],
    boss: null,
  },
  serpent: {
    id: 'serpent',
    shipClass: 'seaSerpent',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'aggressive',
    ammo: null,
    aggroRange: 170,
    cruise: 0.45,
    perSquare: 1,
    pack: 1,
    respawnTime: 25,
    bounty: 22,
    level: 4,
    xp: 90,
    chest: null,
    cargo: [
      { good: 'serpentScale', count: [1, 1], chance: 0.3 },
      { good: 'moonGlass', count: [1, 1], chance: 0.1 },
    ],
    boss: null,
  },
  // Four cutters (ships/shipClasses.ts, jackalCutter) that hunt the far waters together, six packs of them: each sunk
  // in three or four volleys, but at the start of a fight they hit harder than the Baron. A sloop with its four Cannons
  // I that only trades broadsides with a pack, still, half a minute's fight, comes out of it with a fifth of its hull at
  // about level 7, and sinks one time in five at level 5; one that opens fire from beyond their swivel guns' reach and
  // sinks them one by one as it runs (faster than them till its hull is a quarter gone) keeps most of it
  jackals: {
    id: 'jackals',
    shipClass: 'jackalCutter',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'aggressive',
    ammo: 'ball1',
    aggroRange: 220,
    cruise: 0.5,
    perSquare: 0.375,
    pack: 4,
    respawnTime: 90,
    bounty: 20,
    level: 7,
    xp: 100,
    chest: { chance: 0.25, gold: [6, 16] },
    cargo: [
      { good: 'rum', count: [1, 1], chance: 0.25 },
      { good: 'moonGlass', count: [1, 1], chance: 0.12 },
    ],
    boss: null,
  },
  // The starting waters' mini-boss (ships/shipClasses.ts, inkmother): alone in the south-west, as far from the port as
  // the Baron, between the serpents and him: the harpoons' first hard fight, diving, ink and a brood
  // (combat/monsterSkills.ts). A monster, so no chest of gold: its moon pearl is the prize (docs/story.md: pearls grow
  // round the shards a beast swallowed)
  inkmother: {
    id: 'inkmother',
    shipClass: 'inkmother',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'aggressive',
    ammo: null,
    aggroRange: 230,
    cruise: 0.4,
    perSquare: 0,
    pack: 1,
    respawnTime: 180,
    bounty: 120,
    level: 6,
    xp: 500,
    chest: null,
    cargo: [
      { good: 'moonPearl', count: [1, 1], chance: 1 },
      { good: 'moonGlass', count: [1, 2], chance: 1 },
    ],
    boss: { lair: { x: 1500, y: 6500 }, escorts: null, mini: true },
  },
  // The Inkmother's brood (ships/shipClasses.ts, inkling): none sails the sea on its own (perSquare 0), three come up
  // round her at half her hull, once a fight, and go back to the deep with her. Next to nothing for them: they are
  // there to be got out of the way
  inkling: {
    id: 'inkling',
    shipClass: 'inkling',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'aggressive',
    ammo: null,
    aggroRange: 230,
    cruise: 0.6,
    perSquare: 0,
    pack: 1,
    respawnTime: 180,
    bounty: 3,
    level: 4,
    xp: 15,
    chest: null,
    cargo: [],
    boss: null,
  },
  // The boss of the starting waters (ships/shipClasses.ts, baronBrig): its lair is far from the port, and it sails
  // there with two smugglers and nothing else (nearLair). Its loot is worth a long hunt, and the shipyard asks for it
  // (economy/shipyard.ts)
  baron: {
    id: 'baron',
    shipClass: 'baronBrig',
    tier: 0,
    hp: null,
    power: 1,
    behaviour: 'aggressive',
    ammo: 'ball1',
    aggroRange: 270,
    cruise: 0.4,
    perSquare: 0,
    pack: 1,
    respawnTime: 240,
    bounty: 300,
    level: 8,
    xp: 1100,
    chest: { chance: 1, gold: [60, 120] },
    cargo: [
      { good: 'contraband', count: [2, 3], chance: 1 },
      { good: 'moonGlass', count: [2, 3], chance: 1 },
      { good: 'baronsStrongbox', count: [1, 1], chance: 1 },
    ],
    boss: { lair: { x: 6500, y: 1500 }, escorts: { kind: 'smuggler', count: 2 }, mini: false },
  },
};

/**
 * What a regular bot of a tier's seas is, in the middle of the tier's levels: its hull, the damage it does a second,
 * the experience and the gold it is worth. Its hull lasts about 8 s against a ship of the tier with that tier's guns in
 * every cannon slot, and a fight with it costs that ship about a sixth of its hull; its experience is about 1.6 times
 * the last tier's, so a ship reaches its last level in about 1.5 hours (tier 1) to 15 (tiers 5 and 6), some 65 hours
 * from the starter sloop to a tier 6 ship at level 60 (the tavern's quests bring about a quarter of it). The gold is a
 * draft, to be balanced with the economy. Tier 0 is the starting waters', which keep their own kinds
 */
// prettier-ignore
const TIER_BOTS: readonly { readonly hp: number; readonly dps: number; readonly xp: number; readonly gold: number }[] = [
  { hp: 250,  dps: 6,   xp: 70,   gold: 22 },
  { hp: 230,  dps: 15,  xp: 110,  gold: 40 },
  { hp: 580,  dps: 32,  xp: 180,  gold: 75 },
  { hp: 1290, dps: 62,  xp: 290,  gold: 135 },
  { hp: 2490, dps: 116, xp: 460,  gold: 245 },
  { hp: 3860, dps: 234, xp: 740,  gold: 440 },
  { hp: 6800, dps: 450, xp: 1180, gold: 800 },
];
// From the first of a tier's levels to its last, a bot's hull, damage and gold grow from LOW to HIGH times the
// middle's, its experience from XP_LOW to XP_HIGH (the later levels ask for more of it)
const LOW = 0.75;
const HIGH = 1.25;
const XP_LOW = 0.6;
const XP_HIGH = 1.4;
const CHEST_GOLD = [0.3, 0.7] as const; // a chest's gold, at least and at most, as shares of the bounty

/** What a sea's bots are made from: one kind of each in every sea past the starting waters */
interface Archetype {
  /** Its part of the kind's id: `${zone}.${key}` */
  readonly key: ArchetypeKey;
  /** The hulls it sails, by turns from one sea to the next */
  readonly hulls: readonly ShipClassId[];
  readonly behaviour: Behaviour;
  readonly aggroRange: number;
  readonly cruise: number;
  readonly perSquare: number;
  /** How many sail together (BotKind.pack): 1 if left out */
  readonly pack?: number;
  readonly respawnTime: number;
  /** Where its level lies among the sea's: 0 the first, 1 the last */
  readonly level: number;
  /** Its hull, damage, experience and bounty, as shares of the sea's regular bot's at its level */
  readonly hp: number;
  readonly damage: number;
  readonly xp: number;
  readonly gold: number;
  /** The chance it leaves a chest of gold; null for a monster */
  readonly chest: number | null;
  readonly cargo: readonly CargoDrop[];
  /** A boss's escort: that many of the archetype with this key (a monster boss's: MONSTER_ESCORT) */
  readonly escort?: { readonly key: ArchetypeKey; readonly count: number };
}

// prettier-ignore
const ARCHETYPES: readonly Archetype[] = [
  // Easy pickings: traders that run at the first shot, with gold and goods aboard
  { key: 'trader', hulls: ['merchantSloop'], behaviour: 'neutral', aggroRange: 0, cruise: 0.55, perSquare: 0.7, respawnTime: 25,
    level: 0.1, hp: 0.7, damage: 0.4, xp: 0.7, gold: 1.1, chest: 0.4,
    cargo: [{ good: 'cloth', count: [1, 2], chance: 0.4 }, { good: 'spices', count: [1, 1], chance: 0.2 }] },
  // Small fast raiders, in numbers
  { key: 'raider', hulls: ['smugglerSloop'], behaviour: 'aggressive', aggroRange: 210, cruise: 0.5, perSquare: 0.9, respawnTime: 25,
    level: 0.35, hp: 0.6, damage: 0.7, xp: 0.7, gold: 0.9, chest: 0.3, cargo: [{ good: 'rum', count: [1, 1], chance: 0.35 }] },
  // A slow monster that leaves alone whoever leaves it alone
  { key: 'grazer', hulls: ['giantCrab', 'seaTurtle'], behaviour: 'neutral', aggroRange: 0, cruise: 0.6, perSquare: 0.7, respawnTime: 25,
    level: 0.25, hp: 1, damage: 0.6, xp: 0.9, gold: 0.8, chest: null, cargo: [{ good: 'turtleShell', count: [1, 1], chance: 0.3 }] },
  // The sea's pirates: the main fight
  { key: 'pirate', hulls: ['pirateBrig'], behaviour: 'aggressive', aggroRange: 240, cruise: 0.5, perSquare: 0.8, respawnTime: 30,
    level: 0.6, hp: 1.1, damage: 1, xp: 1.15, gold: 1.2, chest: 0.35,
    cargo: [{ good: 'contraband', count: [1, 1], chance: 0.2 }, { good: 'rum', count: [1, 2], chance: 0.3 }] },
  // A monster that hunts
  { key: 'hunter', hulls: ['shark', 'seaSerpent'], behaviour: 'aggressive', aggroRange: 190, cruise: 0.45, perSquare: 0.8, respawnTime: 25,
    level: 0.8, hp: 1, damage: 1.15, xp: 1.25, gold: 1, chest: null, cargo: [{ good: 'serpentScale', count: [1, 1], chance: 0.3 }] },
  // Four cutters that hunt together, as the starting waters' jackals: each sunk in about 4 s by a ship of the tier with
  // its guns, but a fight with the four of them, traded broadside for broadside, costs it four fifths of its hull; sunk
  // one by one from beyond their reach, much less
  { key: 'pack', hulls: ['jackalCutter'], behaviour: 'aggressive', aggroRange: 220, cruise: 0.5, perSquare: 0.375, pack: 4, respawnTime: 90,
    level: 0.7, hp: 0.5, damage: 0.7, xp: 0.8, gold: 0.8, chest: 0.25, cargo: [{ good: 'rum', count: [1, 1], chance: 0.25 }] },
  // Seldom met: half a minute's fight for a ship of the tier with its guns, half its hull
  { key: 'elite', hulls: ['warship'], behaviour: 'aggressive', aggroRange: 260, cruise: 0.4, perSquare: 0.08, respawnTime: 120,
    level: 0.95, hp: 3, damage: 1.2, xp: 4, gold: 5, chest: 1, cargo: [{ good: 'contraband', count: [2, 3], chance: 1 }] },
  // The sea's boss, at its lair, with two raiders: a minute's fight and most of the hull of a ship of the tier with its
  // guns, alone, won by sinking the escort first and keeping out of the mortar's circles. Its experience, every
  // respawnTime, pays a little better than the open sea, not so much that a player only farms it
  { key: 'boss', hulls: ['flagship', 'kraken'], behaviour: 'aggressive', aggroRange: 280, cruise: 0.4, perSquare: 0, respawnTime: 240,
    level: 1, hp: 5, damage: 0.6, xp: 8, gold: 15, chest: 1,
    cargo: [{ good: 'baronsStrongbox', count: [1, 1], chance: 1 }], escort: { key: 'raider', count: 2 } },
];
// A monster boss's escort: the sea's grazers, a kraken's crabs or turtles
const MONSTER_ESCORT: ArchetypeKey = 'grazer';

/** The damage a hull's guns (firing Cannonball I) or jaws do a second, before a kind's power */
function hullDps(shipClass: ShipClass) {
  const { bite, startingGuns } = shipClass;
  if (bite) return averageDamage(bite, bite.bonus) / bite.reload;
  const bonus = AMMO.ball1.bonus;
  return startingGuns.cannon.reduce(
    (sum, id) => (id ? sum + averageDamage(GUNS[id], bonus) / GUNS[id].reload : sum),
    0,
  );
}

/** The id of an archetype's kind in a sea */
export function kindId(zone: OuterZoneId, key: ArchetypeKey): BotKindId {
  return `${zone}.${key}`;
}

/** One archetype's kind in a sea (`index`: the sea's place in the ladder, for the hulls taken by turns) */
function zoneKind(id: OuterZoneId, index: number, archetype: Archetype): BotKind {
  const zone = ZONES[id];
  const hull = archetype.hulls[index % archetype.hulls.length];
  const shipClass = SHIP_CLASSES[hull];
  const [first, last] = zone.levels;
  const level = Math.round(first + (last - first) * archetype.level);
  const top = lineTier(zone.tier).maxLevel;
  const along = top > 1 ? (level - 1) / (top - 1) : 0;
  const grow = LOW + (HIGH - LOW) * along;
  const base = TIER_BOTS[zone.tier];
  const bounty = Math.round(base.gold * grow * archetype.gold);
  const monster = shipClass.nature === 'creature';
  const { escort } = archetype;
  return {
    id: kindId(id, archetype.key),
    shipClass: hull,
    tier: zone.tier,
    hp: Math.round(base.hp * grow * archetype.hp),
    power: (base.dps * grow * archetype.damage) / hullDps(shipClass),
    behaviour: archetype.behaviour,
    ammo: monster ? null : 'ball1',
    aggroRange: archetype.aggroRange,
    cruise: archetype.cruise,
    perSquare: archetype.perSquare,
    pack: archetype.pack ?? 1,
    respawnTime: archetype.respawnTime,
    bounty,
    level,
    xp: Math.round(base.xp * (XP_LOW + (XP_HIGH - XP_LOW) * along) * archetype.xp),
    chest:
      archetype.chest === null || monster
        ? null
        : { chance: archetype.chest, gold: [Math.round(bounty * CHEST_GOLD[0]), Math.round(bounty * CHEST_GOLD[1])] },
    cargo: archetype.cargo,
    boss: escort
      ? {
          lair: zone.lair,
          escorts: { kind: kindId(id, monster ? MONSTER_ESCORT : escort.key), count: escort.count },
          mini: false,
        }
      : null,
  };
}

const ZONE_KINDS = new Map<ZoneId, readonly BotKind[]>(
  ZONE_IDS.map((id, index) => [
    id,
    id === START_ZONE ? Object.values(STARTER_KINDS) : ARCHETYPES.map((a) => zoneKind(id, index, a)),
  ]),
);

/**
 * Every kind of bot of every sea, by id: every BotKindId has its kind (the starting waters' own, every archetype's in
 * every other sea), but a table made from a list is keyed by any string
 */
export const BOT_KINDS: Readonly<Record<string, BotKind>> = Object.fromEntries(
  [...ZONE_KINDS.values()].flat().map((kind) => [kind.id, kind]),
);

/** The kinds of bots that sail a sea */
export function zoneKinds(zone: ZoneId): readonly BotKind[] {
  return ZONE_KINDS.get(zone) ?? [];
}

/**
 * How many of a kind sail its sea at once: `perSquare` to every square of the map, in whole packs; a boss, one at its
 * lair
 */
export function botsInSea(kind: BotKind) {
  if (kind.boss) return 1;
  return Math.round((kind.perSquare * MAP_SQUARES * MAP_SQUARES) / kind.pack) * kind.pack;
}

/** A kind of bot that is a boss or a mini-boss */
export type BossKind = BotKind & { readonly boss: Boss };

const ZONE_BOSSES = new Map<ZoneId, readonly BossKind[]>(
  ZONE_IDS.map((id) => {
    const bosses = zoneKinds(id).filter((kind): kind is BossKind => kind.boss !== null);
    return [id, [...bosses.filter((kind) => !kind.boss.mini), ...bosses.filter((kind) => kind.boss.mini)]];
  }),
);

/** A sea's boss and its mini-bosses, each with its lair: the boss first */
export function zoneBosses(zone: ZoneId): readonly BossKind[] {
  return ZONE_BOSSES.get(zone) ?? [];
}

// World units round a boss's lair where no other bot comes into the game or wanders: a captain meets the boss and its
// escort alone, with nothing else drawn into the fight. Beyond the boss's own wandering (LAIR_SPREAD + WANDER_RADIUS)
// and a fight round it, by a hostile bot's aggro range or so
const LAIR_CLEAR = 1100;

/**
 * Whether a point is in the waters of a sea's boss or mini-boss (LAIR_CLEAR round its lair), where only it and its
 * escort sail
 */
export function nearLair(zone: ZoneId, x: number, y: number) {
  return zoneBosses(zone).some(({ boss: { lair } }) => Math.hypot(x - lair.x, y - lair.y) < LAIR_CLEAR);
}
