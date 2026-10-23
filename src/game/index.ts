// Public API of the game logic. The client imports game/ only through this file,
// so the logic can later move into a package shared with the server without touching the client
export {
  AMMO,
  AMMO_IDS,
  GUNS,
  GUN_IDS,
  gunDamage,
  rollVolley,
  type Ammo,
  type AmmoId,
  type Gun,
  type GunId,
} from './combat/arsenal';
export { projectilePosition, type CombatEvent, type Point3, type Projectile, type Volley } from './combat/combat';
export { RESPAWN_TIME, isAlive, pathPoint, type Target, type TargetKind, type TargetPath } from './combat/targets';
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
export { Game } from './Game';
export type { GameState } from './GameState';
export { signedDistanceToPolygon } from './lib/geometry';
export { createRandom } from './lib/random';
export type { Body, Hull } from './physics/hull';
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
export { WORLD_HEIGHT, WORLD_WIDTH, islandOutline, type Island, type Palm } from './world/World';
