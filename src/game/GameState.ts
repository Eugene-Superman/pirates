import type { Ship } from './ships/Ship';
import type { WorldData } from './world/World';

// Game state that the view reads and draws
export interface GameState {
  world: WorldData;
  ship: Ship;
  time: number;
}
