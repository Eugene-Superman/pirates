import type { Point3 } from '../combat/combat';
import type { WeaponId } from '../combat/weapons';
import { markStep, playerOf } from '../economy/player';
import type { GameState } from '../GameState';
import { clamp } from '../lib/math';
import type { OutfitBonus } from './outfit';
import type { Ship } from './Ship';

/**
 * The highest level any ship reaches: a class's own is its `maxLevel` (the starter sloop's 10, a line's ships' 20).
 * Every ship levels on its own: a new one starts at 1
 */
export const MAX_LEVEL = 20;
// XP from each level to the next, 1→2 first: minutes for the first ones, the starting waters' bots take a sloop to
// about level 8 (kills are worth less once the ship has outgrown the bots, xpForKill), the rest is for stronger seas
const XP_STEPS = [
  200, 350, 550, 800, 1100, 1450, 1850, 2300, 2800, 3400, 4000, 4700, 5400, 6200, 7000, 7900, 8800, 9800, 10800,
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

/**
 * XP for sinking a bot whose kind is worth `xp` at `botLevel` (bots/botKinds.ts): all of it to a ship up to three
 * levels above the bot, half up to five, a quarter beyond. A strong ship gets little for the weak ones round the port
 */
export function xpForKill(xp: number, botLevel: number, shipLevel: number) {
  const over = shipLevel - botLevel;
  const share = over <= 3 ? 1 : over <= 5 ? 0.5 : 0.25;
  return Math.max(1, Math.round(xp * share));
}

/** The levels that offer a choice of two signature talents instead of a talent point */
export const MILESTONES = [5, 10, 15, 20] as const;
/** Points spent in a branch that open its next row */
export const ROW_POINTS = 3;

export type BranchId = 'gunnery' | 'seamanship' | 'hull';
export const BRANCH_IDS: readonly BranchId[] = ['gunnery', 'seamanship', 'hull'];
export const BRANCHES: Readonly<Record<BranchId, { readonly name: string; readonly text: string }>> = {
  gunnery: { name: 'Gunnery', text: 'Reload, reach and harder hits' },
  seamanship: { name: 'Seamanship', text: 'Speed, sight, the hold and the loot' },
  hull: { name: 'Hull and crew', text: 'A stouter hull and quicker repairs' },
};

export type TalentId =
  // Gunnery
  | 'quickLoaders'
  | 'harpooners'
  | 'longGuns'
  | 'steadyHands'
  | 'keenEye'
  | 'pointBlank'
  | 'chainShot'
  // Seamanship
  | 'swift'
  | 'nimble'
  | 'lookout'
  | 'quartermaster'
  | 'bountyHunter'
  | 'treasureHunter'
  | 'hiddenHold'
  // Hull and crew
  | 'thickHull'
  | 'carpenters'
  | 'reinforcedSides'
  | 'ironBow'
  | 'bilgePumps'
  | 'damageControl'
  | 'secondWind'
  // Signatures, at the milestones
  | 'broadside'
  | 'fullSail'
  | 'ambush'
  | 'relentless'
  | 'seasonedCrew'
  | 'grogRations'
  | 'lastStand'
  | 'unsinkable';

/** The talents' numbers, used by combat, loot, repairs and the ship. "A rank": for every rank of the talent */
export const PERKS = {
  /** Share of a gun's reload taken off a rank: Quick loaders (cannons), Harpooners (harpoon guns) */
  reload: 0.05,
  /** Every gun's reach, a rank: Long guns */
  range: 0.03,
  /** Added to every die that hits, a rank: Steady hands */
  dieBonus: 1,
  /** Faces sooner every die crits, a rank: Keen eye */
  critSooner: 1,
  /** Within this share of its reach, a volley does `boost` more damage a rank: Point blank */
  pointBlank: { within: 0.5, boost: 0.06 },
  /** A cannon hit leaves the target this share of its speed for `time` seconds: Chain shot */
  chainShot: { speed: 0.7, time: 4 },
  /** Places in the hold, a rank: Quartermaster */
  hold: 10,
  /** A kill's bounty, a rank: Bounty hunter */
  bounty: 0.07,
  /** A kill's chance to leave a chest, a rank: Treasure hunter */
  chest: 0.1,
  /** Share of the cargo kept aboard when the ship goes down: Hidden hold */
  hiddenHold: 0.5,
  /** Hull a repair step mends, a rank: Carpenters (its gold is for the hull mended, so it costs more a step) */
  repair: 0.15,
  /** Damage taken off a rank, from cannons: Reinforced sides; from bites: Iron bow */
  cannonGuard: 0.04,
  biteGuard: 0.05,
  /** Seconds sooner after a fight a repair can start, a rank: Bilge pumps */
  combatTime: 1,
  /** Share of the hull mended every second, even in combat, a rank: Damage control */
  damageControl: 0.002,
  /** At or under this health (percent), once a fight, the hull gets `heal` of its points back: Second wind */
  secondWind: { below: 25, heal: 0.2 },
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
} as const;

interface TalentBase {
  readonly id: TalentId;
  readonly name: string;
  /** What it does, for the player; a rank of it, for a branch talent */
  readonly text: string;
  /** What it adds to the ship's figures, like a piece of outfit: a rank of it, for a branch talent */
  readonly bonus?: OutfitBonus;
}

/** A branch talent: bought with a talent point a rank at a time, once the row before it has its points */
export interface BranchTalent extends TalentBase {
  readonly kind: 'branch';
  readonly branch: BranchId;
  /** Its row in the branch, 0 first: open with ROW_POINTS × row points spent in the branch */
  readonly row: number;
  readonly maxRank: number;
}

/** A signature talent: one of the two a milestone level offers, instead of its point */
export interface SignatureTalent extends TalentBase {
  readonly kind: 'signature';
  readonly level: (typeof MILESTONES)[number];
  /** Used with a key, then it cools down: the level 5 talents */
  readonly active?: boolean;
}

export type Talent = BranchTalent | SignatureTalent;

function percent(share: number) {
  return `${Math.round(Math.abs(share) * 1000) / 10}%`;
}

function branch(
  id: TalentId,
  b: BranchId,
  row: number,
  maxRank: number,
  name: string,
  text: string,
  bonus?: OutfitBonus,
): BranchTalent {
  return { id, kind: 'branch', branch: b, row, maxRank, name, text, bonus };
}

function signature(
  id: TalentId,
  level: SignatureTalent['level'],
  name: string,
  text: string,
  active = false,
): SignatureTalent {
  return { id, kind: 'signature', level, name, text, active };
}

// prettier-ignore
export const TALENTS: Readonly<Record<TalentId, Talent>> = {
  quickLoaders: branch('quickLoaders', 'gunnery', 0, 3, 'Quick loaders', `Cannons reload ${percent(PERKS.reload)} faster a rank`),
  harpooners: branch('harpooners', 'gunnery', 0, 3, 'Harpooners', `Harpoon guns reload ${percent(PERKS.reload)} faster a rank`),
  longGuns: branch('longGuns', 'gunnery', 1, 3, 'Long guns', `+${percent(PERKS.range)} reach for every gun a rank`),
  steadyHands: branch('steadyHands', 'gunnery', 1, 2, 'Steady hands', `+${PERKS.dieBonus} to every die that hits a rank`),
  keenEye: branch('keenEye', 'gunnery', 2, 2, 'Keen eye', `Every die crits ${PERKS.critSooner} face sooner a rank`),
  pointBlank: branch('pointBlank', 'gunnery', 2, 3, 'Point blank', `+${percent(PERKS.pointBlank.boost)} damage within half your reach a rank`),
  chainShot: branch('chainShot', 'gunnery', 3, 1, 'Chain shot', `Cannon hits slow the target by ${percent(1 - PERKS.chainShot.speed)} for ${PERKS.chainShot.time} s`),
  swift: branch('swift', 'seamanship', 0, 3, 'Swift', '+2% speed a rank', { speed: 0.02 }),
  nimble: branch('nimble', 'seamanship', 0, 3, 'Nimble', '+5% turning a rank', { turn: 0.05 }),
  lookout: branch('lookout', 'seamanship', 1, 3, 'Lookout', '+5% sight a rank', { sight: 0.05 }),
  quartermaster: branch('quartermaster', 'seamanship', 1, 3, 'Quartermaster', `+${PERKS.hold} places in the hold a rank`),
  bountyHunter: branch('bountyHunter', 'seamanship', 2, 3, 'Bounty hunter', `+${percent(PERKS.bounty)} gold for every kill a rank`),
  treasureHunter: branch('treasureHunter', 'seamanship', 2, 3, 'Treasure hunter', `Kills leave chests ${percent(PERKS.chest)} more often a rank`),
  hiddenHold: branch('hiddenHold', 'seamanship', 3, 1, 'Hidden hold', `Half your cargo stays aboard when your ship goes down`),
  thickHull: branch('thickHull', 'hull', 0, 3, 'Thick hull', '+4% hull a rank', { hull: 0.04 }),
  carpenters: branch('carpenters', 'hull', 0, 3, 'Carpenters', `Repairs at sea mend ${percent(PERKS.repair)} more a step a rank`),
  reinforcedSides: branch('reinforcedSides', 'hull', 1, 3, 'Reinforced sides', `−${percent(PERKS.cannonGuard)} damage from cannons a rank`),
  ironBow: branch('ironBow', 'hull', 1, 3, 'Iron bow', `−${percent(PERKS.biteGuard)} damage from bites a rank`),
  bilgePumps: branch('bilgePumps', 'hull', 2, 2, 'Bilge pumps', `Repairs can start ${PERKS.combatTime} s sooner after a fight a rank`),
  damageControl: branch('damageControl', 'hull', 2, 2, 'Damage control', `Mend ${percent(PERKS.damageControl)} of the hull every second, even in a fight, a rank`),
  secondWind: branch('secondWind', 'hull', 3, 1, 'Second wind', `Once a fight, at ${PERKS.secondWind.below}% hull: +${percent(PERKS.secondWind.heal)} of it at once`),
  broadside: signature('broadside', 5, 'Broadside', `Ability (F): the next volley does ×${PERKS.broadside} damage. Every ${PERKS.cooldown} s`, true),
  fullSail: signature('fullSail', 5, 'Full sail', `Ability (F): +${percent(PERKS.fullSail.speed - 1)} speed for ${PERKS.fullSail.time} s. Every ${PERKS.cooldown} s`, true),
  ambush: signature('ambush', 10, 'Ambush', `+${percent(PERKS.ambush - 1)} damage to a target that isn't in a fight: the first volley`),
  relentless: signature('relentless', 10, 'Relentless', `+${percent(PERKS.relentless.boost)} damage for every volley in a row at one target, up to +${percent(PERKS.relentless.boost * PERKS.relentless.most)}`),
  seasonedCrew: signature('seasonedCrew', 15, 'Seasoned crew', `Your ability is ready every ${PERKS.seasoned} s, not ${PERKS.cooldown}`),
  grogRations: signature('grogRations', 15, 'Grog rations', `Using your ability mends ${percent(PERKS.grog)} of the hull`),
  lastStand: signature('lastStand', 20, 'Last stand', `+${percent(PERKS.lastStand.boost - 1)} damage while your hull is under ${PERKS.lastStand.below}%`),
  unsinkable: signature('unsinkable', 20, 'Unsinkable', `A blow that would sink you leaves 1 hull point. Every ${PERKS.unsinkable / 60} minutes`),
};

const TALENT_IDS = Object.keys(TALENTS).filter(isTalent);

/** The branch talents of a branch, row by row */
export function branchTalents(id: BranchId): readonly BranchTalent[] {
  return TALENT_IDS.map((t) => TALENTS[t]).filter((t): t is BranchTalent => t.kind === 'branch' && t.branch === id);
}

/** The two signature talents a milestone level offers */
export function signatureChoices(level: number): readonly SignatureTalent[] {
  return TALENT_IDS.map((t) => TALENTS[t]).filter(
    (t): t is SignatureTalent => t.kind === 'signature' && t.level === level,
  );
}

export function isTalent(value: unknown): value is TalentId {
  return typeof value === 'string' && value in TALENTS;
}

/** Talent points a ship has earned at `level`: one at every level from 2 that isn't a milestone */
export function talentPoints(level: number) {
  return Math.max(0, level - 1) - MILESTONES.filter((m) => m <= level).length;
}

/** Points spent in a branch, or in all of them */
export function pointsSpent(ship: Ship, branchId?: BranchId) {
  let spent = 0;
  for (const [id, rank] of ship.talentRanks()) {
    const talent = TALENTS[id];
    if (talent.kind === 'branch' && (branchId === undefined || talent.branch === branchId)) spent += rank;
  }
  return spent;
}

/** Talent points earned and not spent, and milestones reached without their signature talent picked */
export function talentsToPick(ship: Ship) {
  const points = talentPoints(ship.level) - pointsSpent(ship);
  const signatures = MILESTONES.filter(
    (m) => m <= ship.level && !signatureChoices(m).some((t) => ship.hasTalent(t.id)),
  );
  return Math.max(0, points) + signatures.length;
}

/** Why a talent can't be taken now (another rank of it, for a branch talent); null if it can */
export function talentBlock(ship: Ship, id: TalentId): string | null {
  const talent = TALENTS[id];
  if (talent.kind === 'signature') {
    if (ship.level < talent.level) return `Level ${talent.level}`;
    if (signatureChoices(talent.level).some((t) => ship.hasTalent(t.id))) return 'Picked';
    return null;
  }
  if (ship.rank(id) >= talent.maxRank) return 'Full';
  const need = talent.row * ROW_POINTS;
  if (pointsSpent(ship, talent.branch) < need) return `${need} points in ${BRANCHES[talent.branch].name}`;
  if (pointsSpent(ship) >= talentPoints(ship.level)) return 'No points';
  return null;
}

/** A player takes a talent for their ship (K): `ship.learnTalent`, and a step of the Captain's path. False if it can't */
export function takeTalent(state: GameState, ship: Ship, id: TalentId) {
  if (!ship.learnTalent(id)) return false;
  const player = playerOf(state, ship.id);
  if (player) markStep(state, player, 'talent');
  return true;
}

/** Share of a gun's reload for this ship's weapon: less with Quick loaders or Harpooners */
export function reloadShare(ship: Ship, weapon: WeaponId) {
  return 1 - PERKS.reload * ship.rank(weapon === 'cannon' ? 'quickLoaders' : 'harpooners');
}

/** Seconds between two uses of the ship's ability */
export function abilityCooldown(ship: Ship) {
  return ship.hasTalent('seasonedCrew') ? PERKS.seasoned : PERKS.cooldown;
}

/** A ship earns XP (a kill, a quest): its level may go up. Both are events, for the client */
export function gainXp(state: GameState, ship: Ship, amount: number, reason: 'kill' | 'quest', at: Point3) {
  const before = ship.level;
  ship.xp = Math.min(ship.xp + amount, xpForLevel(ship.shipClass.maxLevel));
  state.events.push({ type: 'xp', shipId: ship.id, amount, reason, at });
  if (ship.level > before) state.events.push({ type: 'level', shipId: ship.id, level: ship.level, at });
}

/**
 * Uses the ship's ability (its level 5 talent) if it has one and it has cooled down, not in port or going down: a
 * `talent` event for the client, and one more for Grog rations' hull. False if it can't
 */
export function useAbility(state: GameState, ship: Ship) {
  const { ability } = ship;
  if (!ability || ship.isSinking || ship.docked || state.time < ship.abilityReadyAt) return false;
  ship.abilityReadyAt = state.time + abilityCooldown(ship);
  if (ability === 'broadside') ship.broadsideArmed = true;
  else ship.fullSailUntil = state.time + PERKS.fullSail.time;
  const at = { x: ship.x, y: ship.y, z: ship.height };
  state.events.push({ type: 'talent', shipId: ship.id, talent: ability, amount: 0, at });
  if (ship.hasTalent('grogRations') && ship.hp < ship.maxHp) {
    const before = ship.hp;
    ship.heal(Math.round(ship.maxHp * PERKS.grog));
    state.events.push({ type: 'talent', shipId: ship.id, talent: 'grogRations', amount: ship.hp - before, at });
  }
  return true;
}

/**
 * What talents do over time: every ship's top speed for this update (Full sail, slowed by a chain shot), Second wind
 * ready again once a fight is over, and Damage control mending the hull. Stepped from Game.update first, before
 * anything sails
 */
export function stepTalents(state: GameState, dt: number) {
  for (const ship of state.ships) {
    const sail = state.time < ship.fullSailUntil ? PERKS.fullSail.speed : 1;
    const chained = state.time < ship.slowedUntil ? PERKS.chainShot.speed : 1;
    ship.speedFactor = sail * chained;
    if (ship.secondWindUsed && !ship.inCombat(state.time)) ship.secondWindUsed = false;
    const control = ship.rank('damageControl');
    if (control > 0 && !ship.isSinking && ship.hp < ship.maxHp) {
      ship.patchDue += ship.maxHp * PERKS.damageControl * control * dt;
      const whole = Math.floor(ship.patchDue);
      if (whole > 0) {
        ship.patchDue -= whole;
        ship.heal(whole);
      }
    }
  }
}
