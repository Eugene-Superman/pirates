// Public API of the game logic. The client imports game/ only through this file,
// so the logic can later move into a package shared with the server without touching the client
export type { BotKindId } from './bots/botKinds';
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
export { CHEST_TIME, type Chest } from './economy/loot';
export { STARTING_GOLD, fitFromHold, giveGold, type Player } from './economy/player';
export {
  MAX_QUESTS,
  QUESTS,
  QUEST_IDS,
  dropQuest,
  questDone,
  takeQuest,
  turnInQuest,
  type ActiveQuest,
  type Quest,
  type QuestId,
} from './economy/quests';
export { AMMO_PACK, ammoPackPrice, buyAmmo, buyGun, gunPrice, repairInPort, repairPrice } from './economy/shop';
export { Game, WRECK_TIME } from './Game';
export { SAVE_VERSION, type SaveData } from './save';
export type { GameState } from './GameState';
export { signedDistanceToPolygon } from './lib/geometry';
export { createRandom } from './lib/random';
export type { Body, Hull } from './physics/hull';
export { REPAIR_RATE, REPAIR_TICK } from './ships/repair';
export type { Ship } from './ships/Ship';
export { DAMAGE_STAGES, MAX_HEALTH, damageStage, type DamageStage } from './ships/damage';
export {
  SHIP_CLASSES,
  STARTER_SHIP,
  type ShipClass,
  type ShipClassId,
  type Mount,
  type ShipLineId,
} from './ships/shipClasses';
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
export { DOCK_RADIUS, leavePort, onPort, type Port } from './world/port';
