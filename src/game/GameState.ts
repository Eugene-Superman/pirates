import type { Respawn } from './bots/spawner';
import type { GameEvent, Projectile } from './combat/combat';
import type { Target } from './combat/targets';
import type { Ship } from './ships/Ship';
import type { WorldData } from './world/World';

// Game state that the view reads and draws
export interface GameState {
  world: WorldData;
  /** The player's ship */
  ship: Ship;
  /** Every ship at sea: the player's first, then the bots (sea monsters among them). Other players will join it */
  ships: Ship[];
  targets: Target[];
  projectiles: Projectile[];
  /** What happened during the last update (shots, hits, wrecks, repairs); replaced by every update */
  events: GameEvent[];
  /** Bots waiting to replace ones that were sunk */
  respawns: Respawn[];
  /** The id the next new ship or target gets: every one has its own */
  nextId: number;
  time: number;
}
