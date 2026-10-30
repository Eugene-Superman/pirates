// Public API of the game logic. The client imports game/ only through this file,
// so the logic can later move into a package shared with the server without touching the client
export {
  BOT_KINDS,
  botsInSea,
  zoneBosses,
  zoneKinds,
  type BossKind,
  type BotKind,
  type BotKindId,
} from './bots/botKinds';
export { isHostile, noticeRange, type BotMind } from './bots/brain';
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
export type { Brood, Dive, Diving, Ink, InkCloud, MonsterSkills } from './combat/monsterSkills';
export { abilityTarget, type PowderKeg } from './combat/ordnance';
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
export { killReward, mayHaul, type Chest, type KillReward, type RewardBoost } from './economy/loot';
export {
  ITEMS,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_IDS,
  ITEM_IDS,
  type Item,
  type ItemCategory,
  type ItemFigures,
  type ItemGroup,
  type ItemId,
} from './items/items';
export { QUICK_SLOTS, setQuickSlot, swapQuickSlots } from './items/quickSlots';
export { STARTING_GOLD, fitFromHold, giveDoubloons, giveGold, type Player } from './economy/player';
export {
  MAX_QUESTS,
  QUESTS,
  QUEST_IDS,
  REPEAT_SHARES,
  bonusesFor,
  dropQuest,
  questDone,
  questsToTurnIn,
  questLimit,
  questOffered,
  questReward,
  shipQuests,
  takenQuest,
  timesTurnedIn,
  turnInQuest,
  zoneQuests,
  type ActiveQuest,
  type Quest,
  type QuestGrade,
  type QuestId,
  type QuestReward,
  type RewardBonus,
} from './economy/quests';
export type { Prize } from './economy/prizes';
export {
  AMMO_PACK,
  ammoPackPrice,
  ammoPrice,
  ammoSalePrice,
  buyAmmo,
  buyGun,
  buyItem,
  buyOutfit,
  fitOutfit,
  gunPrice,
  gunSalePrice,
  itemPrice,
  marketShare,
  marketValue,
  outfitPrice,
  repairInPort,
  repairPrice,
  resetTalents,
  respecPrice,
  sellAmmo,
  sellCargo,
  sellGun,
} from './economy/shop';
export { buyShip, fitsSea, laidUpLevel, takeHelm } from './economy/fleet';
export {
  captainsPath,
  goalShips,
  isGoalShip,
  isLadderShip,
  LADDER_LINES,
  shipGoal,
  termsMet,
  tierMastered,
  tierTerms,
  type PathStep,
  type PathStepId,
  type ShipGoal,
  type TierTerms,
} from './economy/shipyard';
export {
  objectiveNeed,
  objectivesMet,
  PROLOGUE,
  seePrologue,
  setSail,
  skipStoryStep,
  SPEAKERS,
  STORY,
  STORY_CHAPTERS,
  storyFitting,
  storyGoal,
  storyMark,
  storyStep,
  storyTalk,
  storyTargets,
  storyWatch,
  takeBounty,
  tavernOpen,
  tellStory,
  type Line,
  type Objective,
  type SpeakerId,
  type StoryGoal,
  type StoryMark,
  type StoryStep,
  type StoryStepId,
  type StoryTalk,
} from './story/story';
export { Game, WRECK_TIME } from './Game';
export { SAVE_VERSION, savedZone, type SaveData, type SavedShip } from './save';
export { GOLD_REASONS, totalGold, totalKills, type GoldReason, type Stats } from './records/stats';
export type { GameState } from './GameState';
export { signedDistanceToPolygon } from './lib/geometry';
export { createRandom } from './lib/random';
export { hullReach, type Body, type Hull } from './physics/hull';
export { REPAIR_HP_PER_GOLD, REPAIR_TICK, canPayRepair, repairStep, toggleRepair } from './ships/repair';
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
  ABILITY_LEVELS,
  MAX_LEVEL,
  MILESTONES,
  PERKS,
  SIGNATURES,
  XP_BY_LEVELS,
  abilityCooldown,
  milestonesToPick,
  pointsSpent,
  pointsToSpend,
  reloadShare,
  shipTalentPoints,
  signatureChoices,
  takeTalent,
  talentBlock,
  talentFigures,
  talentOf,
  talentPoints,
  talentTree,
  talentsToPick,
  xpForLevel,
  type BranchLook,
  type BranchTalent,
  type BranchTalentId,
  type KillXpShare,
  type SignatureId,
  type SignatureTalent,
  type Talent,
  type TalentBlock,
  type TalentBranch,
  type TalentId,
  type TalentTree,
} from './ships/talents';
export { useAbility } from './ships/abilities';
export {
  CROWN_STEP,
  LEGENDARY_GATE,
  MASTERY_PASSIVES,
  MASTERY_SPECS,
  MASTERY_SPEC_IDS,
  SPECIAL_STEP,
  captainPoints,
  forgetMastery,
  giveLevels,
  masteryBlock,
  masteryPassive,
  masteryRespecPrice,
  masterySpent,
  takePassive,
  type CaptainPoints,
  type MasteryBlock,
  type MasteryPassive,
  type MasterySpecId,
  type PassiveTier,
} from './account/mastery';
export {
  FEATS,
  FEAT_IDS,
  RUNG_POINTS,
  claimFeat,
  rewardsToClaim,
  rungReward,
  rungsClaimed,
  rungsReached,
  type Feat,
  type FeatId,
  type RungReward,
} from './account/feats';
export { PORTRAITS, choosePortrait } from './account/portrait';
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
  type GatePlace,
  type Island,
  type Palm,
} from './world/World';
export { GATE_RADIUS, seaOpenTo } from './world/gates';
export { START_ZONE, ZONES, ZONE_IDS, isZone, tierZones, type Zone, type ZoneId } from './world/zones';
export { coastAt } from './world/islandShape';
export { WALL_THICKNESS, onPort, type HarbourWall, type Port } from './world/port';
