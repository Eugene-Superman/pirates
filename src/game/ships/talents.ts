import type { Point3 } from '../combat/combat';
import type { WeaponId } from '../combat/weapons';
import type { GameState } from '../GameState';
import { clamp } from '../lib/math';
import { BONUS_PERKS, type BonusEffect, type Effects } from './bonus';
import type { Ship } from './Ship';
import type { ShipClassId } from './shipClasses';
import {
  NO_TREE,
  TALENT_TREES,
  type BranchTalent,
  type BranchTalentId,
  type Figures,
  type TalentTree,
} from './talentTrees';

export {
  NO_TREE,
  type BranchLook,
  type BranchTalent,
  type BranchTalentId,
  type Figures,
  type TalentBranch,
  type TalentTree,
} from './talentTrees';

/**
 * The highest level any ship reaches: a class's own is its `maxLevel`, ten a tier (ships/shipClasses.ts, lineTier: the
 * starter sloop's and a tier 1 ship's 10, a tier 6 ship's 60). Every ship levels on its own: a new one starts at 1
 */
export const MAX_LEVEL = 60;
// XP from each level to the next, 1→2 first, to level 20: minutes for the first ones, the starting waters' bots take a
// sloop to about level 8 (kills are worth less once the ship has outgrown the bots, xpForKill), the rest is for
// stronger seas. Beyond it, the higher tiers' levels, each step LATE_STEP more than the one before
const FIRST_STEPS = [
  200, 350, 550, 800, 1100, 1450, 1850, 2300, 2800, 3400, 4000, 4700, 5400, 6200, 7000, 7900, 8800, 9800, 10800,
];
const LATE_STEP = 1100;
const XP_STEPS = [
  ...FIRST_STEPS,
  ...Array.from(
    { length: MAX_LEVEL - 1 - FIRST_STEPS.length },
    (_, i) => FIRST_STEPS[FIRST_STEPS.length - 1] + LATE_STEP * (i + 1),
  ),
];

/** Total XP a ship has at the start of `level` */
export function xpForLevel(level: number) {
  return XP_STEPS.slice(0, clamp(level, 1, MAX_LEVEL) - 1).reduce((sum, step) => sum + step, 0);
}

/** The level a ship with this much XP is at, up to `maxLevel` (its class's last) */
export function levelOf(xp: number, maxLevel: number) {
  let level = 1;
  let need = 0;
  for (const step of XP_STEPS) {
    need += step;
    if (xp < need) break;
    level++;
  }
  return Math.min(level, maxLevel);
}

// Share of a bot's XP a ship of the next tier up earns for it: one bought sails on to the next sea. Two tiers or more
// up, a single point
const TIER_ABOVE_SHARE = 0.25;

/**
 * XP for sinking a bot whose kind is worth `xp` (bots/botKinds.ts). Every ship counts its levels from 1 again, so a
 * bot is weighed by the tier of its sea first: one of a lower tier pays a ship a quarter (a tier below) or a point
 * (further down), one of a higher tier all of it. Of the ship's own tier, by the levels: all of it to a ship up to
 * three levels above the bot, half up to five, a quarter beyond. A strong ship gets little for the weak ones
 */
export function xpForKill(xp: number, bot: { tier: number; level: number }, ship: { tier: number; level: number }) {
  if (bot.tier > ship.tier) return xp;
  if (bot.tier < ship.tier - 1) return 1;
  const over = ship.level - bot.level;
  const share = over <= 3 ? 1 : over <= 5 ? 0.5 : 0.25;
  const below = bot.tier < ship.tier ? TIER_ABOVE_SHARE : 1;
  return Math.max(1, Math.round(xp * share * below));
}

/** The levels that offer a choice of two signature talents instead of a talent point: every fifth, to the last */
export const MILESTONES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;
/**
 * The level each of a ship's abilities opens at, for a ship that has it (its class's `abilities`): the level 5
 * signature talent picked (F), the level 25 one (G, tier 3 ships and up), the level 50 one (T, tier 5 and 6)
 */
export const ABILITY_LEVELS = [MILESTONES[0], MILESTONES[4], MILESTONES[9]] as const;

export type SignatureId =
  | 'broadside'
  | 'fullSail'
  | 'ambush'
  | 'relentless'
  | 'seasonedCrew'
  | 'grogRations'
  | 'lastStand'
  | 'unsinkable'
  | 'rocket'
  | 'powderKeg'
  | 'masterGunner'
  | 'ironDiscipline'
  | 'coupDeGrace'
  | 'spoilsOfBattle'
  | 'terrorOfTheSeas'
  | 'heartOfOak'
  | 'gunDeckDrill'
  | 'carpentersWatch'
  | 'bombardment'
  | 'royalStandard'
  | 'thunderOfTheFleet'
  | 'neverStrike'
  | 'rulerOfTheWaves'
  | 'floatingFortress';

/** A signature talent's id, or a branch talent's (its ship's class and its key) */
export type TalentId = SignatureId | BranchTalentId;

/** The signature talents' numbers, used by combat and the ship */
export const PERKS = {
  /** Seconds between two uses of a ship's ability; `seasoned` with Seasoned crew */
  cooldown: 30,
  seasoned: 20,
  /** Damage of the next volley: Broadside */
  broadside: 2,
  /** Top speed, and seconds it lasts: Full sail */
  fullSail: { speed: 1.4, time: 5 },
  /** Damage to a target that isn't in combat: Ambush */
  ambush: 1.4,
  /** More damage for every volley in a row at the same target, up to `most` volleys: Relentless */
  relentless: { boost: 0.05, most: 5 },
  /** Share of the hull the ability mends when used: Grog rations */
  grog: 0.08,
  /** Under this health (percent), damage is `boost` times: Last stand */
  lastStand: { below: 35, boost: 1.25 },
  /** Seconds between two blows the ship lives through at 1 hull point: Unsinkable */
  unsinkable: 180,
  /**
   * The level 25 abilities, a choice of a sure blow or a big one, each with its own cooldown (seconds) and as hard as
   * the ship's cannons (a volley of every one fitted, its loaded ammo's bonus on each die), so they grow with its guns.
   * Rocket: at the target (`range` world units at most, in sight), flying `speed` units a second, a volley's damage
   * whatever the target, and its speed down to `slow` of it for `slowTime` seconds: always lands, worth a volley more
   * every `cooldown` and a foe that can't get away. Powder keg: dropped `astern` units behind the stern, live at once:
   * a hostile ship or monster within `blast` of it sets it off (one there already as it falls, at the next update),
   * `volleys` times a volley to every bot within `blast`; sinks unexploded after `life`. Two and a half times the rocket and to all near, but only
   * when a foe comes to it: a monster going for the hull, a ship giving chase, an escort round its boss
   */
  rocket: { volley: 1, range: 450, speed: 300, slow: 0.6, slowTime: 5, cooldown: 20 },
  powderKeg: { volleys: 2.5, astern: 8, blast: 80, life: 45, cooldown: 25 },
  /** Level 30: Master gunner's faces sooner every die crits; Iron discipline's share of all damage taken off */
  masterGunner: 1,
  ironDiscipline: 0.1,
  /**
   * Level 35, a quicker kill or a longer fight, each about a tenth: Coup de grace's damage on a target nearly sunk
   * (BONUS_PERKS.finisherBelow), a tenth sooner sunk; the share of the damage done that Spoils of battle mends, a
   * tenth more hull in a fight with a foe as stout
   */
  coupDeGrace: 0.4,
  spoilsOfBattle: 0.12,
  /**
   * Level 40, the strongest: Terror of the seas' damage, and every gun reloaded by a kill (the second foe of two met
   * with a full broadside); Heart of oak's hull, and the damage taken off it under BONUS_PERKS.lastBastion percent
   */
  terrorOfTheSeas: 0.15,
  heartOfOak: { hull: 0.15, guard: 0.2 },
  /**
   * Level 45, about an eighth: Gun deck drill's reload taken off every gun; the share of the hull Carpenters' watch
   * mends a second, even in a fight (an eighth more in one of 30 s, and the hull whole again soon after)
   */
  gunDeckDrill: 0.12,
  carpentersWatch: 0.005,
  /**
   * The level 50 abilities, the strongest, each about half again a fight of 30 s. Bombardment: the mortars at the
   * target (`range` world units at most, in sight) drop `shells` shells along its course, each landing where it will
   * be, `delay` seconds and `stagger` more after the one before, a little to either side (`spread`): every bot
   * within `radius` takes `volleys` times a volley of all the ship's cannons (as a rocket's, their loaded ammo's bonus
   * on each die). Seven and a half volleys if all land on one foe, more on a crowd; one that turns hard dodges some.
   * Royal standard: for `time` seconds, `damage` more of it done by every volley and `guard` of all damage taken off
   */
  bombardment: { shells: 5, volleys: 1.5, range: 500, radius: 45, delay: 1.2, stagger: 0.3, spread: 18, cooldown: 45 },
  royalStandard: { damage: 0.6, guard: 0.6, time: 10, cooldown: 45 },
  /**
   * Level 55: Thunder of the fleet's every third volley in a row at one target (a sixth more), or Never strike the
   * colours: once a fight, a blow that would sink the ship leaves it this share of its hull
   */
  thunderOfTheFleet: 0.5,
  neverStrike: 0.25,
  /** Level 60, the last and strongest: Ruler of the waves' damage and reach, or Floating fortress's guard and hull */
  rulerOfTheWaves: { damage: 0.2, reach: 0.1 },
  floatingFortress: { guard: 0.15, hull: 0.1 },
} as const;

/**
 * A signature talent: one of the two a milestone level offers, instead of its point. Every ship has the same ones; its
 * branches are its own (ships/talentTrees.ts)
 */
export interface SignatureTalent {
  readonly id: SignatureId;
  readonly kind: 'signature';
  readonly level: (typeof MILESTONES)[number];
  readonly name: string;
  /** What it does, for the player */
  readonly text: string;
  readonly figures: Figures;
  /** Used with a key, then it cools down: the level 5 and level 25 talents */
  readonly active: boolean;
  /** What it gives the ship, as a branch talent's rank does (ships/bonus.ts): the passives' that are only that */
  readonly effects: Effects;
}

export type Talent = BranchTalent | SignatureTalent;

function percent(share: number) {
  return `${Math.round(Math.abs(share) * 1000) / 10}%`;
}

function signature(
  id: SignatureId,
  level: SignatureTalent['level'],
  name: string,
  text: string,
  active = false,
  given: { readonly figures: Figures; readonly effects: Effects } = { figures: {}, effects: {} },
): SignatureTalent {
  return { id, kind: 'signature', level, name, text, active, ...given };
}

const { rocket, powderKeg, bombardment, royalStandard, rulerOfTheWaves, floatingFortress } = PERKS;
const hundred = (share: number) => Math.round(share * 1000) / 10;

// prettier-ignore
export const SIGNATURES: Readonly<Record<SignatureId, SignatureTalent>> = {
  broadside: signature('broadside', 5, 'Broadside', `Ability (F): the next volley does ×${PERKS.broadside} damage. Every ${PERKS.cooldown} s`, true),
  fullSail: signature('fullSail', 5, 'Full sail', `Ability (F): +${percent(PERKS.fullSail.speed - 1)} speed for ${PERKS.fullSail.time} s. Every ${PERKS.cooldown} s`, true),
  ambush: signature('ambush', 10, 'Ambush', `+${percent(PERKS.ambush - 1)} damage to a target that isn't in a fight: the first volley`),
  relentless: signature('relentless', 10, 'Relentless', `+${percent(PERKS.relentless.boost)} damage for every volley in a row at one target, up to +${percent(PERKS.relentless.boost * PERKS.relentless.most)}`),
  seasonedCrew: signature('seasonedCrew', 15, 'Seasoned crew', `Broadside and Full sail are ready every ${PERKS.seasoned} s, not ${PERKS.cooldown}`),
  grogRations: signature('grogRations', 15, 'Grog rations', `Using an ability mends ${percent(PERKS.grog)} of the hull`),
  lastStand: signature('lastStand', 20, 'Last stand', `+${percent(PERKS.lastStand.boost - 1)} damage while your hull is under ${PERKS.lastStand.below}%`),
  unsinkable: signature('unsinkable', 20, 'Unsinkable', `A blow that would sink you leaves 1 hull point. Every ${PERKS.unsinkable / 60} minutes`),
  rocket: signature('rocket', 25, 'Congreve rocket', `Ability (G): a rocket at the target up to ${rocket.range} away, as hard as a volley of all your cannons, and the target ${percent(1 - rocket.slow)} slower for ${rocket.slowTime} s. Every ${rocket.cooldown} s`, true),
  powderKeg: signature('powderKeg', 25, 'Powder keg', `Ability (G): a powder keg dropped astern blows up when a foe comes near: ${powderKeg.volleys} times a volley of all your cannons to all within ${powderKeg.blast}. Every ${powderKeg.cooldown} s`, true),
  masterGunner: signature('masterGunner', 30, 'Master gunner', 'Every die crits {n} face sooner|Every die crits {n} faces sooner', false, { figures: { n: PERKS.masterGunner }, effects: { critSooner: PERKS.masterGunner } }),
  ironDiscipline: signature('ironDiscipline', 30, 'Iron discipline', '{n}% less damage from everything', false, { figures: { n: PERKS.ironDiscipline * 100 }, effects: { guard: PERKS.ironDiscipline } }),
  coupDeGrace: signature('coupDeGrace', 35, 'Coup de grace', '+{n}% damage to a target under {m}% of its hull', false, { figures: { n: Math.round(PERKS.coupDeGrace * 100), m: BONUS_PERKS.finisherBelow }, effects: { finisher: PERKS.coupDeGrace } }),
  spoilsOfBattle: signature('spoilsOfBattle', 35, 'Spoils of battle', '{n}% of the damage you deal mends your hull', false, { figures: { n: Math.round(PERKS.spoilsOfBattle * 100) }, effects: { lifesteal: PERKS.spoilsOfBattle } }),
  terrorOfTheSeas: signature('terrorOfTheSeas', 40, 'Terror of the seas', '+{n}% damage; sinking a ship reloads every cannon, a monster every harpoon gun', false, { figures: { n: Math.round(PERKS.terrorOfTheSeas * 100) }, effects: { damage: PERKS.terrorOfTheSeas, hotBarrels: 1, feedingFrenzy: 1 } }),
  gunDeckDrill: signature('gunDeckDrill', 45, 'Gun deck drill', 'Cannons and harpoon guns reload {n}% faster', false, { figures: { n: hundred(PERKS.gunDeckDrill) }, effects: { cannonReload: PERKS.gunDeckDrill, harpoonReload: PERKS.gunDeckDrill } }),
  carpentersWatch: signature('carpentersWatch', 45, "Carpenters' watch", 'Mends {n}% of the hull every second, even in a fight', false, { figures: { n: hundred(PERKS.carpentersWatch) }, effects: { patchRate: PERKS.carpentersWatch } }),
  bombardment: signature('bombardment', 50, 'Bombardment', `Ability (T): ${bombardment.shells} mortar shells along the course of the target up to ${bombardment.range} away, each ${bombardment.volleys} times a volley of all your cannons to all within ${bombardment.radius} of it. Every ${bombardment.cooldown} s`, true),
  royalStandard: signature('royalStandard', 50, 'Royal standard', `Ability (T): for ${royalStandard.time} s, +${hundred(royalStandard.damage)}% damage and ${hundred(royalStandard.guard)}% less damage taken. Every ${royalStandard.cooldown} s`, true),
  thunderOfTheFleet: signature('thunderOfTheFleet', 55, 'Thunder of the fleet', 'Every third cannon volley in a row at one target does +{n}% damage', false, { figures: { n: hundred(PERKS.thunderOfTheFleet) }, effects: { rollingThunder: PERKS.thunderOfTheFleet } }),
  neverStrike: signature('neverStrike', 55, 'Never strike the colours', 'Once a fight, a blow that would sink the ship leaves it {n}% of its hull', false, { figures: { n: hundred(PERKS.neverStrike) }, effects: { ironKeel: PERKS.neverStrike } }),
  rulerOfTheWaves: signature('rulerOfTheWaves', 60, 'Ruler of the waves', '+{n}% damage and +{m}% reach for every gun', false, { figures: { n: hundred(rulerOfTheWaves.damage), m: hundred(rulerOfTheWaves.reach) }, effects: { damage: rulerOfTheWaves.damage, cannonRange: rulerOfTheWaves.reach, harpoonRange: rulerOfTheWaves.reach } }),
  floatingFortress: signature('floatingFortress', 60, 'Floating fortress', '{n}% less damage from everything and +{m}% hull', false, { figures: { n: hundred(floatingFortress.guard), m: hundred(floatingFortress.hull) }, effects: { guard: floatingFortress.guard, hull: floatingFortress.hull } }),
  heartOfOak: signature('heartOfOak', 40, 'Heart of oak', '+{n}% hull, and {m}% less damage while it is under {k}%', false, { figures: { n: Math.round(PERKS.heartOfOak.hull * 100), m: Math.round(PERKS.heartOfOak.guard * 100), k: BONUS_PERKS.lastBastion }, effects: { hull: PERKS.heartOfOak.hull, lastBastion: PERKS.heartOfOak.guard } }),
};

const SIGNATURE_LIST = Object.values(SIGNATURES);

/** Every branch talent of every tree, by its id */
const BRANCH_TALENTS: ReadonlyMap<string, BranchTalent> = new Map(
  Object.values(TALENT_TREES)
    .flatMap((tree) => tree.branches.flatMap((b) => b.talents))
    .map((talent) => [talent.id, talent]),
);

/** A class's talent tree: NO_TREE for a bot's hull */
export function talentTree(shipClass: ShipClassId): TalentTree {
  return TALENT_TREES[shipClass] ?? NO_TREE;
}

/** A talent by its id: a signature or a branch talent of any ship's tree */
export function talentOf(id: TalentId): Talent;
export function talentOf(id: string): Talent | undefined;
export function talentOf(id: string): Talent | undefined {
  return isSignature(id) ? SIGNATURES[id] : BRANCH_TALENTS.get(id);
}

function isSignature(id: string): id is SignatureId {
  return Object.hasOwn(SIGNATURES, id);
}

export function isTalent(value: unknown): value is TalentId {
  return typeof value === 'string' && talentOf(value) !== undefined;
}

/** The two signature talents a milestone level offers */
export function signatureChoices(level: number): readonly SignatureTalent[] {
  return SIGNATURE_LIST.filter((t) => t.level === level);
}

/** Talent points a ship has earned at `level`: one at every level from 2 that isn't a milestone */
export function talentPoints(level: number) {
  return Math.max(0, level - 1) - MILESTONES.filter((m) => m <= level).length;
}

/** Talent points a ship has now: its level's, and the captain's mastery's on every ship (Legend of the Seas) */
export function shipTalentPoints(ship: Ship) {
  return talentPoints(ship.level) + ship.captain.talentPoints;
}

/** Points spent in a branch of the ship's tree (by its key), or in all of them */
export function pointsSpent(ship: Ship, branchKey?: string) {
  let spent = 0;
  for (const [id, rank] of ship.talentRanks()) {
    const talent = talentOf(id);
    if (talent.kind === 'branch' && (branchKey === undefined || talent.branch === branchKey)) spent += rank;
  }
  return spent;
}

/** Talent points earned and not spent */
export function pointsToSpend(ship: Ship) {
  return Math.max(0, shipTalentPoints(ship) - pointsSpent(ship));
}

/** Milestones reached without their signature talent picked */
export function milestonesToPick(ship: Ship) {
  return MILESTONES.filter((m) => m <= ship.level && !signatureChoices(m).some((t) => ship.hasTalent(t.id))).length;
}

/** Talent points earned and not spent, and milestones reached without their signature talent picked */
export function talentsToPick(ship: Ship) {
  return pointsToSpend(ship) + milestonesToPick(ship);
}

/**
 * Why a talent can't be taken now (another rank of it, for a branch talent): its milestone not reached or picked
 * already; for a branch talent, not of this ship's tree, taken in full, the one of two with it taken, its row shut, the
 * talent it needs short of its ranks, or no point to spend
 */
export type TalentBlock = 'level' | 'picked' | 'ship' | 'full' | 'rival' | 'row' | 'needs' | 'points';

/** Why a talent can't be taken now; null if it can */
export function talentBlock(ship: Ship, id: TalentId): TalentBlock | null {
  const talent = talentOf(id);
  if (talent.kind === 'signature') {
    if (ship.level < talent.level) return 'level';
    if (signatureChoices(talent.level).some((t) => ship.hasTalent(t.id))) return 'picked';
    return null;
  }
  if (talent.ship !== ship.shipClass.id) return 'ship';
  if (ship.rank(id) >= talent.maxRank) return 'full';
  if (talent.rival !== null && ship.hasTalent(talent.rival)) return 'rival';
  if (pointsSpent(ship, talent.branch) < talent.opens) return 'row';
  if (talent.needs !== null && ship.rank(talent.needs.id) < talent.needs.rank) return 'needs';
  if (pointsSpent(ship) >= shipTalentPoints(ship)) return 'points';
  return null;
}

/**
 * A branch talent's figures for `ranks` of it, for its text: its `n` is what a rank gives, the rest (a time, a
 * threshold) the talent's own
 */
export function talentFigures(talent: BranchTalent, ranks: number): Figures {
  const { n } = talent.figures;
  if (n === undefined) return talent.figures;
  return { ...talent.figures, n: Math.round(n * ranks * 100) / 100 };
}

/**
 * Talents are taken again rows first (signatures by their level), so each row finds its points spent before it, and a
 * talent the talent it needs, always of an earlier row
 */
function learnOrder(id: TalentId) {
  const talent = talentOf(id);
  return talent.kind === 'branch' ? talent.row : talent.level;
}

/**
 * Takes talents with their ranks again (a save loaded, a level lost), keeping to the rules of learnTalent (points
 * earned, a branch's rows in turn, a signature a milestone): what the ship has no points or milestone for is left out
 */
export function learnTalents(ship: Ship, ranks: Iterable<readonly [TalentId, number]>) {
  const ordered = [...ranks];
  ordered.sort(([a], [b]) => learnOrder(a) - learnOrder(b));
  for (const [id, rank] of ordered) {
    // Stops at the first refusal: a rank past the talent's last would loop on for as long as asked
    for (let i = 0; i < rank && ship.learnTalent(id); i++);
  }
}

/** The ship has fewer points than its talents took (a level lost, the captain's mastery changed): takes them again */
export function relearnTalents(ship: Ship) {
  const taken = [...ship.talentRanks()];
  ship.forgetTalents();
  learnTalents(ship, taken);
}

/**
 * A player takes a talent for their ship (K): `ship.learnTalent`. False if it can't, or if there is no such talent:
 * online the id is a player's
 */
export function takeTalent(ship: Ship, id: TalentId) {
  return isTalent(id) && ship.learnTalent(id);
}

/**
 * The talents the ship has taken that give any of these effects (a branch's, or a signature's like Master gunner):
 * what changed a strike, for the combat log
 */
export function talentsGiving(ship: Ship, effects: readonly BonusEffect[]): TalentId[] {
  const giving: TalentId[] = [];
  if (effects.length === 0) return giving;
  for (const id of ship.talentRanks().keys()) {
    const talent = talentOf(id);
    if (effects.some((e) => (talent.effects[e] ?? 0) !== 0)) giving.push(talent.id);
  }
  return giving;
}

/** Share of a gun's reload for this ship's weapon: less with its talents and the captain's mastery */
export function reloadShare(ship: Ship, weapon: WeaponId) {
  return 1 - (weapon === 'cannon' ? ship.bonus.cannonReload : ship.bonus.harpoonReload);
}

/**
 * Seconds between two uses of the ship's ability in a slot (0 the first, F; 1 the second, G; 2 the third, T): each its
 * own, the first fewer with Seasoned crew; all fewer with its talents and the captain's mastery
 */
export function abilityCooldown(ship: Ship, slot = 0) {
  const ability = ship.abilityIn(slot);
  const seconds =
    ability === 'rocket' || ability === 'powderKeg' || ability === 'bombardment' || ability === 'royalStandard'
      ? PERKS[ability].cooldown
      : ship.hasTalent('seasonedCrew')
        ? PERKS.seasoned
        : PERKS.cooldown;
  return seconds * (1 - ship.bonus.cooldown);
}

/** XP a ship is given for what it earned (a kill, a quest): more with its talents and the captain's mastery */
export function xpGiven(ship: Ship, earned: number, reason: 'kill' | 'quest') {
  const { bonus } = ship;
  return Math.round(earned * (1 + bonus.xp + (reason === 'quest' ? bonus.questXp : 0)));
}

/** XP a ship can still earn: beyond its class's last level, XP is lost */
export function xpRoom(ship: Ship) {
  return Math.max(0, xpForLevel(ship.shipClass.maxLevel) - ship.xp);
}

/**
 * A ship earns XP (a kill, a quest), more with its talents and the captain's mastery: its level may go up. Both are
 * events, for the client; the XP one is only what the ship took, none at its last level
 */
export function gainXp(state: GameState, ship: Ship, earned: number, reason: 'kill' | 'quest', at: Point3) {
  const amount = Math.min(xpGiven(ship, earned, reason), xpRoom(ship));
  if (amount <= 0) return;
  const before = ship.level;
  ship.xp += amount;
  state.events.push({ type: 'xp', shipId: ship.id, amount, reason, at });
  if (ship.level > before) state.events.push({ type: 'level', shipId: ship.id, level: ship.level, at });
}

/**
 * What any ability used gives the ship: a Battle cry, and Grog rations' hull (a `talent` event with what it mended).
 * A Broadside's, as its volley is fired (combat.ts)
 */
export function abilityUsed(state: GameState, ship: Ship) {
  if (ship.bonus.battleCry > 0) ship.battleCryUntil = state.time + BONUS_PERKS.battleCry;
  if (ship.hasTalent('grogRations') && ship.hp < ship.maxHp) {
    const before = ship.hp;
    ship.heal(Math.round(ship.maxHp * PERKS.grog));
    const at = { x: ship.x, y: ship.y, z: ship.height };
    state.events.push({ type: 'talent', shipId: ship.id, talent: 'grogRations', amount: ship.hp - before, at });
  }
}

/**
 * What talents and the captain's mastery do over time: every ship's top speed for this update (Full sail, more out of
 * combat, slowed by a chain shot or a barbed harpoon), Second wind and Iron keel ready again once a fight is over, and
 * the hull mended a share a second (Damage control, Patch under fire). Stepped from Game.update first, before anything
 * sails
 */
export function stepTalents(state: GameState, dt: number) {
  for (const ship of state.ships) {
    const fighting = ship.inCombat(state.time);
    const sail = state.time < ship.fullSailUntil ? PERKS.fullSail.speed : 1;
    const slowed = state.time < ship.slowedUntil ? ship.slowedTo : 1;
    const cruise = fighting ? 1 : 1 + ship.bonus.cruiseSpeed;
    ship.speedFactor = sail * slowed * cruise;
    if (!fighting) {
      ship.secondWindUsed = false;
      ship.ironKeelUsed = false;
    }
    const patch = ship.bonus.patchRate;
    if (patch > 0 && !ship.isSinking && ship.hp < ship.maxHp) {
      ship.patchDue += ship.maxHp * patch * dt;
      const whole = Math.floor(ship.patchDue);
      if (whole > 0) {
        ship.patchDue -= whole;
        ship.heal(whole);
      }
    }
  }
}
