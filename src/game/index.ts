// Public API of the game logic. The client imports game/ only through this file,
// so the logic can later move into a package shared with the server without touching the client
export { projectilePosition, type CombatEvent, type Point3, type Projectile } from './combat/combat';
export type { Target, TargetKind } from './combat/targets';
export { WEAPONS, WEAPON_IDS, type Weapon, type WeaponId } from './combat/weapons';
export { Game } from './Game';
export type { GameState } from './GameState';
export { createRandom } from './lib/random';
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
