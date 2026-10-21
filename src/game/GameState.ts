import type { Ship } from './Ship';
import type { Wake } from './Wake';
import type { WorldData } from './World';

// Game state that the view reads and draws
export interface GameState {
  world: WorldData;
  ship: Ship;
  wake: Wake;
  time: number;
}
