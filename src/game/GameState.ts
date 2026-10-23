import type { CombatEvent, Projectile } from './combat/combat';
import type { Target } from './combat/targets';
import type { Ship } from './ships/Ship';
import type { WorldData } from './world/World';

// Game state that the view reads and draws
export interface GameState {
  world: WorldData;
  /** The player's ship */
  ship: Ship;
  /** Every ship at sea, the player's first. Bots and other players will join it */
  ships: Ship[];
  targets: Target[];
  projectiles: Projectile[];
  /** What happened during the last update (shots, impacts); replaced by every update */
  events: CombatEvent[];
  time: number;
}
