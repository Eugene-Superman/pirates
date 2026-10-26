// Public API of the game logic. The client imports game/ only through this file,
// so the logic can later move into a package shared with the server without touching the client
export { BOT_KINDS, type BotKindId } from './bots/botKinds';
export { isHostile, type BotMind } from './bots/brain';
export {
  AMMO,
  AMMO_IDS,
  GUNS,
  GUN_IDS,
  averageDamage,
  rollVolley,
  type Ammo,
  type AmmoId,
  type Bite,
  type DamageDie,
  type Gun,
  type GunId,
} from './combat/arsenal';
export type { Shell } from './combat/barrage';
export {
  projectilePosition,
  type DamageSource,
  type DieResult,
  type GameEvent,
  type Point3,
  type Projectile,
  type Strike,
} from './combat/combat';
export { findUnit, isAfloat, type Unit, type UnitKind } from './combat/units';
export {
  OFF_TARGET_SHARE,
  WEAPONS,
  WEAPON_IDS,
  damageShare,
  type HoldReason,
  type TargetNature,
  type Weapon,
  type WeaponId,
} from './combat/weapons';
export {
  GOODS,
  GOOD_IDS,
  cargoCount,
  cargoValue,
  throwOverboard,
  type Cargo,
  type Good,
  type GoodId,
} from './economy/cargo';
export { CHEST_TIME, LOST_CARGO_TIME, type Chest } from './economy/loot';
export { STARTING_GOLD, fitFromHold, giveGold, type Player } from './economy/player';
export {
  MAX_QUESTS,
  QUESTS,
  QUEST_IDS,
  dropQuest,
  questDone,
  questOffered,
  takeQuest,
  turnInQuest,
  type ActiveQuest,
  type Quest,
  type QuestId,
} from './economy/quests';
export {
  AMMO_PACK,
  ammoPackPrice,
  buyAmmo,
  buyGun,
  buyOutfit,
  fitOutfit,
  gunPrice,
  outfitPrice,
  repairInPort,
  repairPrice,
  resetTalents,
  respecPrice,
  sellCargo,
} from './economy/shop';
export { buyShip, laidUpLevel, takeHelm } from './economy/fleet';
export {
  captainsPath,
  goalOffer,
  offerName,
  SHIP_OFFERS,
  termsMet,
  tierMastered,
  type PathStep,
  type PathStepId,
  type ShipOffer,
} from './economy/shipyard';
export { Game, WRECK_TIME } from './Game';
export { SAVE_VERSION, type SaveData, type SavedShip } from './save';
export { GOLD_REASONS, totalGold, totalKills, type GoldReason, type Stats } from './records/stats';
export type { GameState } from './GameState';
export { signedDistanceToPolygon } from './lib/geometry';
export { createRandom } from './lib/random';
export type { Body, Hull } from './physics/hull';
export { REPAIR_HP_PER_GOLD, REPAIR_TICK, canPayRepair, orderRepair, repairStep } from './ships/repair';
export type { Ship } from './ships/Ship';
export {
  OUTFITS,
  OUTFIT_IDS,
  OUTFIT_SLOTS,
  OUTFIT_STATS,
  type Outfit,
  type OutfitBonus,
  type OutfitId,
  type OutfitSlot,
  type OutfitStat,
  type ShipStats,
} from './ships/outfit';
export {
  BRANCHES,
  BRANCH_IDS,
  MAX_LEVEL,
  MILESTONES,
  PERKS,
  ROW_POINTS,
  TALENTS,
  abilityCooldown,
  branchTalents,
  pointsSpent,
  reloadShare,
  signatureChoices,
  takeTalent,
  talentBlock,
  talentPoints,
  talentsToPick,
  useAbility,
  xpForLevel,
  type BranchId,
  type BranchTalent,
  type SignatureTalent,
  type Talent,
  type TalentId,
} from './ships/talents';
export { DAMAGE_STAGES, MAX_HEALTH, damageStage, type DamageStage } from './ships/damage';
export {
  SHIP_CLASSES,
  STARTER_SHIP,
  type ShipClass,
  type ShipClassId,
  type Mount,
  type PlayerLineId,
  type ShipLineId,
} from './ships/shipClasses';
export { CURRENCIES, type Currency, type CurrencyId } from './economy/currencies';
export {
  SHIPYARD_LINES,
  SHIP_LINES,
  SHIP_SOURCES,
  classFigures,
  isLineShip,
  lineShip,
  type LineShip,
  type LineShipId,
  type ShipFigures,
  type ShipLine,
  type ShipSource,
  type ShipSourceId,
  type ShipTerms,
} from './ships/shipLines';
export {
  MAP_SQUARE,
  MAP_SQUARES,
  START,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  islandOutline,
  type Island,
  type Palm,
} from './world/World';
export { coastAt } from './world/islandShape';
export { WALL_THICKNESS, leavePort, onPort, type HarbourWall, type Port } from './world/port';
