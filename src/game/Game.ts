import type { GameState } from './GameState';
import { Ship } from './ships/Ship';
import { WORLD_HEIGHT, WORLD_WIDTH, createWorld } from './world/World';

// The simulation: owns the state and advances it. The update order lives here, not in the client,
// because the future server has to run exactly the same steps
export class Game {
  readonly state: GameState;

  constructor() {
    const ship = new Ship();
    ship.x = WORLD_WIDTH / 2;
    ship.y = WORLD_HEIGHT / 2;
    this.state = { world: createWorld(), ship, time: 0 };
  }

  /** dt in seconds */
  update(dt: number) {
    const { state } = this;
    state.time += dt;
    state.ship.update(dt, state.world.islands);
  }
}
