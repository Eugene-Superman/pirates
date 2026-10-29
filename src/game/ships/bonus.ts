/**
 * What a ship is given beyond its class and its outfit: the captain's mastery (account/mastery.ts, on every ship the
 * player sails) and the ship's own talents (ships/talents.ts), in the same effects. Each adds them up into a ShipBonus;
 * the ship carries both and the game reads them together (`ship.bonus`). Shares unless said otherwise; 0 for none
 */
export interface ShipBonus {
  // The ship's figures, grown like the outfit's (ships/outfit.ts)
  readonly speed: number;
  /** The top speed with the hull nearly gone: damage slows the ship less */
  readonly holedSpeed: number;
  readonly acceleration: number;
  readonly turn: number;
  readonly hull: number;
  readonly sight: number;
  /** Top speed added out of combat */
  readonly cruiseSpeed: number;
  // Damage dealt: more of a weapon's, of everything, against monsters
  readonly cannonDamage: number;
  readonly harpoonDamage: number;
  readonly damage: number;
  readonly monsterDamage: number;
  /** More damage to a target whose hull is under BONUS_PERKS.finisherBelow percent */
  readonly finisher: number;
  /** Reload taken off a weapon's guns */
  readonly cannonReload: number;
  readonly harpoonReload: number;
  readonly cannonRange: number;
  readonly harpoonRange: number;
  /** Added to every die that hits, whole points */
  readonly dieBonus: number;
  /** Faces sooner every die crits, cannons' and harpoon guns' */
  readonly critSooner: number;
  /** Faces sooner the cannons' dice crit */
  readonly cannonCrit: number;
  /** More damage within BONUS_PERKS.pointBlankWithin of the weapon's reach */
  readonly pointBlank: number;
  /** More damage on every BONUS_PERKS.thunderEvery-th cannon volley in a row at one target */
  readonly rollingThunder: number;
  /** More cannon damage beyond BONUS_PERKS.marksmanBeyond of the cannons' reach */
  readonly marksman: number;
  /** More damage for a volley of every cannon fitted */
  readonly fullBroadside: number;
  /** Over 0: a cannon hit slows its target to BONUS_PERKS.chainSpeed of its speed for BONUS_PERKS.chainTime */
  readonly chainShot: number;
  /** Over 0: sinking a ship reloads every cannon */
  readonly hotBarrels: number;
  /** Over 0: sinking a monster reloads every harpoon gun */
  readonly feedingFrenzy: number;
  /** Seconds a harpoon hit slows a monster */
  readonly barbedHeads: number;
  /** More damage for BONUS_PERKS.battleCry seconds after an ability is used */
  readonly battleCry: number;
  /** Chance a volley takes no ammo out of the hold */
  readonly freeShot: number;
  // Damage taken off: from cannons and shells, from bites, from everything
  readonly cannonGuard: number;
  readonly biteGuard: number;
  readonly guard: number;
  /** Damage taken off while the hull is under BONUS_PERKS.lowHull percent */
  readonly lowHullGuard: number;
  /** Damage taken off while the hull is under BONUS_PERKS.lastBastion percent */
  readonly lastBastion: number;
  /** Share of the hull a blow that would sink the ship leaves it, once a fight */
  readonly ironKeel: number;
  /** Share of the hull mended at once, once a fight, when a blow leaves it at BONUS_PERKS.secondWindBelow or under */
  readonly secondWind: number;
  /** Share of the hull mended when the ship sinks a monster */
  readonly apexPredator: number;
  /** Share of the hull mended when the ship sinks anything */
  readonly prizeCrew: number;
  /** Share of the damage the ship does that mends its hull */
  readonly lifesteal: number;
  // Repairs: mended a step, their gold taken off, seconds sooner after a fight, a share of the hull a second in one
  readonly repairRate: number;
  readonly repairCost: number;
  readonly combatTime: number;
  readonly patchRate: number;
  /** Share of their aggro range taken off within which hostile bots notice the ship */
  readonly stealth: number;
  // Gold: from bounties, a boss's on top, from monsters (their experience too), from everything, the market
  readonly bounty: number;
  readonly bossBounty: number;
  readonly monsterLoot: number;
  readonly gold: number;
  readonly market: number;
  /** Room in the hold */
  readonly hold: number;
  /** Share of the cargo that stays aboard when the ship goes down; over 0 `insured`: all of it */
  readonly hiddenHold: number;
  readonly insured: number;
  // Loot: chests more often, more gold in them, a second chest, goods more often, chests floating longer and hauled
  // aboard from further (multiples of the pickup distance)
  readonly chestChance: number;
  readonly chestGold: number;
  readonly secondChest: number;
  readonly wreckGoods: number;
  readonly chestTime: number;
  readonly chestReach: number;
  // Experience, quests and abilities: the ship's experience, a quest's on top and its gold, the abilities' cooldown
  // taken off; the account's own, the mastery's only: quests taken at a time and talent points on every ship (whole
  // numbers)
  readonly xp: number;
  readonly questXp: number;
  readonly questGold: number;
  readonly cooldown: number;
  readonly quests: number;
  readonly talentPoints: number;
}

export type BonusEffect = keyof ShipBonus;

/** Nothing given: a bot's ship, a captain who has taken nothing yet, a ship with no talents */
export const NO_BONUS: ShipBonus = {
  speed: 0,
  holedSpeed: 0,
  acceleration: 0,
  turn: 0,
  hull: 0,
  sight: 0,
  cruiseSpeed: 0,
  cannonDamage: 0,
  harpoonDamage: 0,
  damage: 0,
  monsterDamage: 0,
  finisher: 0,
  cannonReload: 0,
  harpoonReload: 0,
  cannonRange: 0,
  harpoonRange: 0,
  dieBonus: 0,
  critSooner: 0,
  cannonCrit: 0,
  pointBlank: 0,
  rollingThunder: 0,
  marksman: 0,
  fullBroadside: 0,
  chainShot: 0,
  hotBarrels: 0,
  feedingFrenzy: 0,
  barbedHeads: 0,
  battleCry: 0,
  freeShot: 0,
  cannonGuard: 0,
  biteGuard: 0,
  guard: 0,
  lowHullGuard: 0,
  lastBastion: 0,
  ironKeel: 0,
  secondWind: 0,
  apexPredator: 0,
  prizeCrew: 0,
  lifesteal: 0,
  repairRate: 0,
  repairCost: 0,
  combatTime: 0,
  patchRate: 0,
  stealth: 0,
  bounty: 0,
  bossBounty: 0,
  monsterLoot: 0,
  gold: 0,
  market: 0,
  hold: 0,
  hiddenHold: 0,
  insured: 0,
  chestChance: 0,
  chestGold: 0,
  secondChest: 0,
  wreckGoods: 0,
  chestTime: 0,
  chestReach: 0,
  xp: 0,
  questXp: 0,
  questGold: 0,
  cooldown: 0,
  quests: 0,
  talentPoints: 0,
};

function isEffect(key: string): key is BonusEffect {
  return key in NO_BONUS;
}

const BONUS_EFFECTS: readonly BonusEffect[] = Object.keys(NO_BONUS).filter(isEffect);

/** Some of the effects, as a passive or a talent's rank gives them */
export type Effects = Partial<Record<BonusEffect, number>>;

/** Effects added up, `times` over each: a talent's ranks */
export function addEffects(parts: Iterable<readonly [Effects, number]>): ShipBonus {
  const bonus = { ...NO_BONUS };
  for (const [effects, times] of parts) {
    for (const effect of BONUS_EFFECTS) bonus[effect] += (effects[effect] ?? 0) * times;
  }
  return bonus;
}

/** Two bonuses together: what the ship has from its captain and its talents */
export function addBonuses(a: ShipBonus, b: ShipBonus): ShipBonus {
  return addEffects([
    [a, 1],
    [b, 1],
  ]);
}

/** The conditions of the effects that work only sometimes, used by combat and the ship */
export const BONUS_PERKS = {
  /** Rolling thunder: every this many cannon volleys in a row at one target */
  thunderEvery: 3,
  /** Marksman: beyond this share of the cannons' reach */
  marksmanBeyond: 0.5,
  /** Point blank: within this share of the weapon's reach */
  pointBlankWithin: 0.5,
  /** Coup de grace: a target under this health, percent */
  finisherBelow: 35,
  /** Oak and iron: under this health, percent */
  lowHull: 50,
  /** Last bastion: under this health, percent */
  lastBastion: 30,
  /** Second wind: at or under this health, percent */
  secondWindBelow: 25,
  /** Battle cry: seconds it lasts */
  battleCry: 5,
  /** Chain shot: share of its speed the target is left, and for how many seconds */
  chainSpeed: 0.7,
  chainTime: 4,
  /** Barbed heads: share of its speed a monster is left */
  barbedSpeed: 0.7,
  /** Hawkeye: times as far as anyone a chest is hauled aboard from */
  hawkeyeReach: 3,
} as const;
