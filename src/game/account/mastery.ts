import type { GameState } from '../GameState';
import { playerOf, shipOf, type Player } from '../economy/player';
import { clamp } from '../lib/math';
import type { Ship } from '../ships/Ship';
import { SHIP_CLASSES } from '../ships/shipClasses';
import { levelOf, pointsSpent, relearnTalents, shipTalentPoints, xpForLevel } from '../ships/talents';
import { BONUS_PERKS, addEffects, type BonusEffect, type Effects, type ShipBonus } from '../ships/bonus';
import { featPoints } from './feats';

/**
 * The captain's mastery: the account's own passives, for every ship the player sails, as a ship's talents are for that
 * ship. Its points come from the ships levelled, a point every POINT_LEVELS levels of each (a line of six tiers pays 21,
 * the starter sloop one more), and from feats (account/feats.ts); every passive costs some, by its tier.
 *
 * Seven specializations grow from the captain, each on its own: a trunk, three twigs out of it of five steps each that
 * give the same a step (the steps dearer further out), each twig ending in a special passive that does something of its
 * own, and at the crown two legendaries, open once LEGENDARY_GATE points are in the specialization. A passive opens when
 * one it grows from is taken. The whole tree costs far more than the ships of now pay, so there is always something to
 * take: new lines bring their points. What is taken works on every ship the player sails (`ship.captain`)
 */
export type MasterySpecId = 'economy' | 'exploration' | 'navigation' | 'artillery' | 'survival' | 'hunting' | 'command';
/** Left to right across the crown: the fighting ones in the middle */
export const MASTERY_SPEC_IDS: readonly MasterySpecId[] = [
  'economy',
  'exploration',
  'navigation',
  'artillery',
  'survival',
  'hunting',
  'command',
];

export type PassiveTier = 'common' | 'improved' | 'rare' | 'special' | 'legendary';
/** Captain's points each tier of passive costs */
const PASSIVE_COSTS: Readonly<Record<PassiveTier, number>> = {
  common: 1,
  improved: 2,
  rare: 3,
  special: 5,
  legendary: 10,
};
/** A twig's five steps from the trunk out, dearer further out: 10 points the twig */
const STEP_TIERS: readonly PassiveTier[] = ['common', 'common', 'improved', 'rare', 'rare'];
/** Points spent in a specialization that open its legendaries: the trunk and two whole twigs */
export const LEGENDARY_GATE = 30;
/** Levels of a ship that give the captain a point: every tenth */
const POINT_LEVELS = 10;
/**
 * Doubloons for every captain's point given back when the mastery is forgotten in port: not gold, which a player
 * farms, or they would take whatever the fight ahead wants and forget it after
 */
const MASTERY_RESPEC_PRICE = 1;

/** The numbers a passive's text shows, by their names in it (`{n}`) */
type Figures = Readonly<Record<string, number>>;

/** A passive as planned: its key in its id, name, text and what it gives */
interface Plan {
  readonly key: string;
  readonly name: string;
  /** What it gives, for the player: English, its figures by name */
  readonly text: string;
  readonly figures: Figures;
  readonly effects: Effects;
}

/** A twig: what each of its five steps adds (`percent` % of `effect`, shown as {n}), and the special at its end */
interface TwigPlan {
  readonly key: string;
  readonly name: string;
  readonly text: string;
  readonly effect: BonusEffect;
  readonly percent: number;
  readonly special: Plan;
}

interface SpecPlan {
  readonly name: string;
  readonly text: string;
  readonly trunk: Plan;
  readonly twigs: readonly [TwigPlan, TwigPlan, TwigPlan];
  readonly crown: readonly [Plan, Plan];
}

/** A plan that adds `percent` % of one effect, shown as {n} */
function share(key: string, name: string, text: string, effect: BonusEffect, percent: number): Plan {
  return { key, name, text, figures: { n: percent }, effects: { [effect]: percent / 100 } };
}

function twig(key: string, name: string, text: string, effect: BonusEffect, percent: number, special: Plan): TwigPlan {
  return { key, name, text, effect, percent, special };
}

// Provisional figures. A twig's five steps add up to what a ship's talents give at most (+10% damage, +5% speed), the
// specials and the legendaries change how a ship fights, sails or earns. A captain with the fighting specializations
// whole is about a tier stronger than a new one on the same ship
const PLANS: Readonly<Record<MasterySpecId, SpecPlan>> = {
  economy: {
    name: 'Economy',
    text: 'Gold from bounties and the market, cheaper repairs',
    trunk: share('trunk', 'Ledger', '+{n}% gold from bounties', 'bounty', 3),
    twigs: [
      twig(
        'bounty',
        'Bounty Broker',
        '+{n}% gold from bounties',
        'bounty',
        3,
        share('prizeMoney', 'Prize Money', 'Bosses pay {n}% more bounty', 'bossBounty', 200),
      ),
      twig(
        'trader',
        'Trader',
        'Goods fetch {n}% more at the market',
        'market',
        3,
        share('smugglersHold', "Smuggler's Hold", '+{n}% room in the hold', 'hold', 20),
      ),
      twig('thrift', 'Thrifty Crew', 'Repairs cost {n}% less', 'repairCost', 4, {
        key: 'insuredCargo',
        name: 'Insured Cargo',
        text: 'Nothing of the cargo is lost when the ship goes down',
        figures: {},
        effects: { insured: 1 },
      }),
    ],
    crown: [
      share('merchantPrince', 'Merchant Prince', '+{n}% gold from bounties, chests, quests and the market', 'gold', 25),
      share('quartermasterGeneral', 'Quartermaster General', '{n}% of volleys cost no ammo', 'freeShot', 20),
    ],
  },
  exploration: {
    name: 'Exploration',
    text: 'A keen lookout, chests and goods from the wrecks',
    trunk: share('trunk', 'Spyglass', '+{n}% view range', 'sight', 2),
    twigs: [
      twig('lookout', 'Lookout', '+{n}% view range', 'sight', 2, {
        key: 'hawkeye',
        name: 'Hawkeye',
        text: 'Chests float {n}% longer and are hauled aboard from {m} times as far',
        figures: { n: 50, m: BONUS_PERKS.hawkeyeReach },
        effects: { chestTime: 0.5, chestReach: BONUS_PERKS.hawkeyeReach - 1 },
      }),
      twig(
        'treasure',
        'Treasure Seeker',
        'Sunk ships leave chests {n}% more often',
        'chestChance',
        4,
        share('luckyFind', 'Lucky Find', '{n}% chance that a sunk ship leaves a second chest', 'secondChest', 15),
      ),
      twig(
        'salvage',
        'Salvager',
        '+{n}% gold in chests',
        'chestGold',
        4,
        share('wreckDiver', 'Wreck Diver', 'Wrecks leave goods {n}% more often', 'wreckGoods', 30),
      ),
    ],
    crown: [
      {
        key: 'seaOracle',
        name: 'Sea Oracle',
        text: '+{n}% view range and +{m}% reach for every gun',
        figures: { n: 15, m: 5 },
        effects: { sight: 0.15, cannonRange: 0.05, harpoonRange: 0.05 },
      },
      {
        key: 'fortunesFavourite',
        name: "Fortune's Favourite",
        text: 'Sunk ships leave chests {n}% more often, with {m}% more gold',
        figures: { n: 30, m: 100 },
        effects: { chestChance: 0.3, chestGold: 1 },
      },
    ],
  },
  navigation: {
    name: 'Navigation',
    text: 'Speed, turning and the art of getting away',
    trunk: share('trunk', 'Sea Legs', '+{n}% speed', 'speed', 1),
    twigs: [
      twig(
        'winds',
        'Fair Winds',
        '+{n}% speed',
        'speed',
        1,
        share('runningFree', 'Running Free', '+{n}% speed out of combat', 'cruiseSpeed', 10),
      ),
      twig(
        'helm',
        'Helmsman',
        '+{n}% turning',
        'turn',
        2,
        share('quickHelm', 'Quick Helm', 'The ship gathers speed {n}% quicker', 'acceleration', 25),
      ),
      twig('storm', 'Storm Sailor', 'Damage slows the ship {n}% less', 'holedSpeed', 4, {
        key: 'slipAway',
        name: 'Slip Away',
        text: 'A fight is over {n} s sooner: repairs and the gates open sooner',
        figures: { n: 2 },
        effects: { combatTime: 2 },
      }),
    ],
    crown: [
      {
        key: 'windrunner',
        name: 'Windrunner',
        text: '+{n}% speed and +{m}% turning',
        figures: { n: 8, m: 10 },
        effects: { speed: 0.08, turn: 0.1 },
      },
      share(
        'ghostOfTheSea',
        'Ghost of the Sea',
        'Hostile ships and monsters spot the ship from {n}% closer',
        'stealth',
        50,
      ),
    ],
  },
  artillery: {
    name: 'Artillery',
    text: 'Cannons: harder hits, quicker reloads, a longer reach',
    trunk: share('trunk', 'Gun Drill', '+{n}% cannon damage', 'cannonDamage', 2),
    twigs: [
      twig('gunner', 'Master Gunner', '+{n}% cannon damage', 'cannonDamage', 2, {
        key: 'rollingThunder',
        name: 'Rolling Thunder',
        // Third: BONUS_PERKS.thunderEvery
        text: 'Every third cannon volley in a row at one target does +{n}% damage',
        figures: { n: 50 },
        effects: { rollingThunder: 0.5 },
      }),
      twig('crews', 'Gun Crews', 'Cannons reload {n}% faster', 'cannonReload', 2, {
        key: 'hotBarrels',
        name: 'Hot Barrels',
        text: 'Sinking a ship reloads every cannon at once',
        figures: {},
        effects: { hotBarrels: 1 },
      }),
      twig('reach', 'Far Reach', '+{n}% cannon reach', 'cannonRange', 2, {
        key: 'marksman',
        name: 'Marksman',
        text: '+{n}% cannon damage beyond half their reach',
        figures: { n: 20 },
        effects: { marksman: 0.2 },
      }),
    ],
    crown: [
      {
        key: 'ironRain',
        name: 'Iron Rain',
        text: 'Cannon dice crit {n} faces sooner',
        figures: { n: 2 },
        effects: { cannonCrit: 2 },
      },
      share(
        'thunderOfTheLine',
        'Thunder of the Line',
        'A volley of every cannon fitted does +{n}% damage',
        'fullBroadside',
        25,
      ),
    ],
  },
  survival: {
    name: 'Survival',
    text: 'A stouter hull, lighter blows and quicker repairs',
    trunk: share('trunk', 'Tarred Planks', '+{n}% hull', 'hull', 2),
    twigs: [
      twig('hull', 'Stout Hull', '+{n}% hull', 'hull', 2, {
        key: 'oakAndIron',
        name: 'Oak and Iron',
        text: '{n}% less damage while the hull is under {m}%',
        figures: { n: 10, m: BONUS_PERKS.lowHull },
        effects: { lowHullGuard: 0.1 },
      }),
      twig('carpenters', "Ship's Carpenters", 'Repairs at sea mend {n}% more', 'repairRate', 5, {
        key: 'patchUnderFire',
        name: 'Patch Under Fire',
        text: 'Mends {n}% of the hull every second, even in a fight',
        figures: { n: 0.3 },
        effects: { patchRate: 0.003 },
      }),
      twig(
        'armour',
        'Armoured Sides',
        '{n}% less damage from cannons and shells',
        'cannonGuard',
        2,
        share(
          'ironKeel',
          'Iron Keel',
          'Once a fight, a blow that would sink the ship leaves it {n}% of its hull',
          'ironKeel',
          10,
        ),
      ),
    ],
    crown: [
      {
        key: 'unbreakable',
        name: 'Unbreakable',
        text: '+{n}% hull and {m}% less damage from everything',
        figures: { n: 10, m: 5 },
        effects: { hull: 0.1, guard: 0.05 },
      },
      {
        key: 'lastBastion',
        name: 'Last Bastion',
        text: '{n}% less damage while the hull is under {m}%',
        figures: { n: 25, m: BONUS_PERKS.lastBastion },
        effects: { lastBastion: 0.25 },
      },
    ],
  },
  hunting: {
    name: 'Hunting',
    text: 'Harpoons, and the sea monsters they bring down',
    trunk: share('trunk', "Whaler's Eye", '+{n}% harpoon damage', 'harpoonDamage', 2),
    twigs: [
      twig('harpooner', 'Master Harpooner', '+{n}% harpoon damage', 'harpoonDamage', 2, {
        key: 'barbedHeads',
        name: 'Barbed Heads',
        text: 'Harpoon hits slow a monster by {n}% for {s} s',
        figures: { n: Math.round((1 - BONUS_PERKS.barbedSpeed) * 100), s: 3 },
        effects: { barbedHeads: 3 },
      }),
      twig('winch', 'Winch Crews', 'Harpoon guns reload {n}% faster', 'harpoonReload', 2, {
        key: 'feedingFrenzy',
        name: 'Feeding Frenzy',
        text: 'Sinking a monster reloads every harpoon gun at once',
        figures: {},
        effects: { feedingFrenzy: 1 },
      }),
      twig(
        'lore',
        'Monster Lore',
        '{n}% less damage from bites',
        'biteGuard',
        2,
        share(
          'leviathanHunter',
          'Leviathan Hunter',
          'Sea monsters pay {n}% more gold and experience',
          'monsterLoot',
          25,
        ),
      ),
    ],
    crown: [
      share('krakensBane', "Kraken's Bane", '+{n}% damage against sea monsters', 'monsterDamage', 25),
      share('apexPredator', 'Apex Predator', 'Every monster sunk mends {n}% of the hull', 'apexPredator', 10),
    ],
  },
  command: {
    name: 'Command',
    text: "Experience, quests and the ship's abilities",
    trunk: share('trunk', "Officers' Mess", '+{n}% experience for the ship', 'xp', 2),
    twigs: [
      twig(
        'veterans',
        'Veteran Officers',
        '+{n}% experience for the ship',
        'xp',
        3,
        share('fieldPromotions', 'Field Promotions', '+{n}% experience from quests', 'questXp', 30),
      ),
      twig('drill', 'Drill Master', 'Abilities are ready {n}% sooner', 'cooldown', 3, {
        key: 'battleCry',
        name: 'Battle Cry',
        text: 'Using an ability gives +{n}% damage for {s} s',
        figures: { n: 15, s: BONUS_PERKS.battleCry },
        effects: { battleCry: 0.15 },
      }),
      twig('patrons', 'Patrons', '+{n}% gold from quests', 'questGold', 4, {
        key: 'busyCaptain',
        name: 'Busy Captain',
        text: '+{n} quest taken at a time|+{n} quests taken at a time',
        figures: { n: 1 },
        effects: { quests: 1 },
      }),
    ],
    crown: [
      {
        key: 'legendOfTheSeas',
        name: 'Legend of the Seas',
        text: '+{n} talent point on every ship|+{n} talent points on every ship',
        figures: { n: 5 },
        effects: { talentPoints: 5 },
      },
      {
        key: 'fleetAdmiral',
        name: 'Fleet Admiral',
        text: '+{n}% damage, +{m}% hull and +{s}% speed',
        figures: { n: 5, m: 5, s: 3 },
        effects: { damage: 0.05, hull: 0.05, speed: 0.03 },
      },
    ],
  },
};

export const MASTERY_SPECS: Readonly<Record<MasterySpecId, { readonly name: string; readonly text: string }>> = PLANS;

/** Where a passive grows in its specialization */
export type PassivePlace = 'trunk' | 'twig' | 'special' | 'crown';

export interface MasteryPassive {
  /** Its specialization and place: `artillery.trunk`, `artillery.gunner.3`, `artillery.rollingThunder` */
  readonly id: string;
  readonly spec: MasterySpecId;
  readonly place: PassivePlace;
  readonly tier: PassiveTier;
  readonly cost: number;
  /** Its twig (0–2, left to right), or its place in the crown (0–1); 0 for the trunk */
  readonly branch: number;
  /** How far out: 0 the trunk, 1–5 a twig's steps, 6 its special, 7 the crown */
  readonly step: number;
  /** A twig's steps share its name, told apart by their step */
  readonly name: string;
  readonly text: string;
  readonly figures: Figures;
  readonly effects: Effects;
  /** The passives it grows from, nearer the captain: one of them taken opens it. None for the trunk */
  readonly links: readonly string[];
}

/** How far out a twig's special and the crown are */
export const SPECIAL_STEP = STEP_TIERS.length + 1;
export const CROWN_STEP = SPECIAL_STEP + 1;

function specPassives(spec: MasterySpecId): MasteryPassive[] {
  const { trunk, twigs, crown } = PLANS[spec];
  const at = (plan: Plan, place: PassivePlace, tier: PassiveTier, branch: number, step: number, links: string[]) => ({
    id: `${spec}.${plan.key}`,
    spec,
    place,
    tier,
    cost: PASSIVE_COSTS[tier],
    branch,
    step,
    name: plan.name,
    text: plan.text,
    figures: plan.figures,
    effects: plan.effects,
    links,
  });
  const root = at(trunk, 'trunk', 'common', 0, 0, []);
  const passives: MasteryPassive[] = [root];
  const specials = twigs.map((t, branch) => {
    let last = root.id;
    STEP_TIERS.forEach((tier, i) => {
      const step = at(share(`${t.key}.${i + 1}`, t.name, t.text, t.effect, t.percent), 'twig', tier, branch, i + 1, [
        last,
      ]);
      passives.push(step);
      last = step.id;
    });
    const special = at(t.special, 'special', 'special', branch, SPECIAL_STEP, [last]);
    passives.push(special);
    return special.id;
  });
  // Each legendary grows out of the specials of the two twigs beside it
  crown.forEach((plan, i) => {
    passives.push(at(plan, 'crown', 'legendary', i, CROWN_STEP, [specials[i], specials[i + 1]]));
  });
  return passives;
}

/** The whole tree, specialization by specialization, each from its trunk out */
export const MASTERY_PASSIVES: readonly MasteryPassive[] = MASTERY_SPEC_IDS.flatMap(specPassives);

const BY_ID: ReadonlyMap<string, MasteryPassive> = new Map(MASTERY_PASSIVES.map((p) => [p.id, p]));

export function isPassive(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

export function masteryPassive(id: string): MasteryPassive | undefined {
  return BY_ID.get(id);
}

/** The captain's points: from the ships levelled, from feats, and how many are spent and left */
export interface CaptainPoints {
  readonly ships: number;
  readonly feats: number;
  readonly total: number;
  readonly spent: number;
  readonly left: number;
}

/** Points a ship at this level has given the captain */
function shipPoints(level: number) {
  return Math.floor(level / POINT_LEVELS);
}

/** Points spent on these passives, in one specialization or in all of them */
export function masterySpent(taken: readonly string[], spec?: MasterySpecId) {
  let spent = 0;
  for (const id of taken) {
    const passive = BY_ID.get(id);
    if (passive && (spec === undefined || passive.spec === spec)) spent += passive.cost;
  }
  return spent;
}

/** A player's points: every ship of theirs, the one sailed and those laid up in port, and their feats */
export function captainPoints(state: GameState, player: Player): CaptainPoints {
  const sailed = shipOf(state, player);
  let ships = sailed ? shipPoints(sailed.level) : 0;
  for (const laidUp of player.fleet) {
    ships += shipPoints(levelOf(laidUp.xp, SHIP_CLASSES[laidUp.shipClass].maxLevel));
  }
  const feats = featPoints(player);
  const spent = masterySpent(player.mastery);
  return { ships, feats, total: ships + feats, spent, left: ships + feats - spent };
}

/**
 * Why a passive can't be taken now: taken already, nothing it grows from taken (`locked`), a legendary with fewer than
 * LEGENDARY_GATE points in its specialization (`gate`), too few points left; null if it can
 */
export type MasteryBlock = 'taken' | 'locked' | 'gate' | 'points';

export function masteryBlock(player: Player, points: CaptainPoints, id: string): MasteryBlock | null {
  const passive = BY_ID.get(id);
  if (!passive) return 'locked';
  if (player.mastery.includes(id)) return 'taken';
  if (passive.links.length > 0 && !passive.links.some((link) => player.mastery.includes(link))) return 'locked';
  if (passive.tier === 'legendary' && masterySpent(player.mastery, passive.spec) < LEGENDARY_GATE) return 'gate';
  if (points.left < passive.cost) return 'points';
  return null;
}

/** What these passives give, added up */
export function captainBonus(taken: readonly string[]): ShipBonus {
  return addEffects(taken.flatMap((id) => BY_ID.get(id) ?? []).map((passive) => [passive.effects, 1] as const));
}

/**
 * The player's ship sails with their mastery as it is now. A ship that has lost a talent point by it (Legend of the
 * Seas forgotten) takes its talents again, as far as its points go
 */
export function applyMastery(state: GameState, player: Player) {
  const ship = shipOf(state, player);
  if (!ship) return;
  ship.setCaptain(captainBonus(player.mastery));
  if (pointsSpent(ship) > shipTalentPoints(ship)) relearnTalents(ship);
}

/** A player takes a passive of the captain's mastery (P), anywhere: it works at once. False if it can't */
export function takePassive(state: GameState, player: Player, id: string) {
  if (masteryBlock(player, captainPoints(state, player), id) !== null) return false;
  player.mastery.push(id);
  applyMastery(state, player);
  return true;
}

/**
 * Takes passives again (a save loaded, points lost), keeping to the rules of takePassive: what the player has no
 * points or way to is left out. Nearer the captain first, so each finds what it grows from taken
 */
export function retakeMastery(state: GameState, player: Player, ids: readonly string[]) {
  const ordered = ids.flatMap((id) => BY_ID.get(id) ?? []);
  ordered.sort((a, b) => a.step - b.step);
  player.mastery.length = 0;
  const points = captainPoints(state, player);
  let left = points.total;
  for (const passive of ordered) {
    if (masteryBlock(player, { ...points, spent: points.total - left, left }, passive.id) !== null) continue;
    player.mastery.push(passive.id);
    left -= passive.cost;
  }
  applyMastery(state, player);
}

/**
 * Levels out of thin air, for the debug buttons: the ship's XP set to the start of the level `delta` away, within 1
 * and its class's last. Going up is a `level` event, as if earned; going down, the talents the lower level has no
 * points or milestone for are forgotten, the deepest rows first, and so are the captain's passives its lost points
 * paid for. False if the level stays. Here, not in ships/talents.ts, which this file reads
 */
export function giveLevels(state: GameState, ship: Ship, delta: number) {
  const before = ship.level;
  const level = clamp(before + delta, 1, ship.shipClass.maxLevel);
  if (level === before) return false;
  ship.xp = xpForLevel(level);
  if (level > before) {
    state.events.push({ type: 'level', shipId: ship.id, level, at: { x: ship.x, y: ship.y, z: ship.height } });
  } else {
    relearnTalents(ship);
    const player = playerOf(state, ship.id);
    if (player) retakeMastery(state, player, [...player.mastery]);
  }
  return true;
}

/** What forgetting the whole mastery costs in port; 0 with nothing taken */
export function masteryRespecPrice(player: Player) {
  return masterySpent(player.mastery) * MASTERY_RESPEC_PRICE;
}

/** Every passive forgotten, its points back to spend again: in port, for doubloons. False if not, with none, or short */
export function forgetMastery(state: GameState, player: Player) {
  const price = masteryRespecPrice(player);
  if (!shipOf(state, player)?.docked || price === 0 || player.doubloons < price) return false;
  player.doubloons -= price;
  player.mastery.length = 0;
  applyMastery(state, player);
  return true;
}
