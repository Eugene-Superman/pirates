import { stepCombat } from './combat/combat';
import { createTargets, isAlive, moveTargets, reviveTargets } from './combat/targets';
import type { GameState } from './GameState';
import { createRandom } from './lib/random';
import { NavGrid } from './navigation/NavGrid';
import { pilot, type Helm } from './navigation/pilot';
import { collideShip, type Obstacles } from './physics/collisions';
import type { Body } from './physics/hull';
import { Ship } from './ships/Ship';
import { SHIP_CLASSES, STARTER_SHIP } from './ships/shipClasses';
import { WORLD_HEIGHT, WORLD_WIDTH, createWorld } from './world/World';

// World units a ship moves at most between two collision checks: less than the thinnest pair of hulls can overlap by
// (the barrel and a sloop: 2.6 + 5.6), so nothing is skipped over at any speed or frame rate
const MAX_STEP = 4;
// Seed of the dice combat rolls: a generator of its own, so shooting never changes the map's random numbers
const COMBAT_SEED = 7;

// The simulation: owns the state and advances it. The update order lives here, not in the client,
// because the future server has to run exactly the same steps
export class Game {
  readonly state: GameState;
  /** Open water and routes round the islands; built once, the world's islands don't move */
  readonly nav: NavGrid;
  /** The dice of combat, seeded: the server and every client roll the same */
  private readonly random = createRandom(COMBAT_SEED);

  constructor() {
    const ship = new Ship(SHIP_CLASSES[STARTER_SHIP]);
    ship.x = WORLD_WIDTH / 2;
    ship.y = WORLD_HEIGHT / 2;
    const world = createWorld();
    this.nav = new NavGrid(world);
    this.state = {
      world,
      ship,
      ships: [ship],
      targets: createTargets(ship.x, ship.y),
      projectiles: [],
      events: [],
      time: 0,
    };
  }

  /** dt in seconds */
  update(dt: number) {
    const { state } = this;
    state.time += dt;
    state.events.length = 0;
    // Targets move on fixed paths: where they are now, before ships steer round them and bump into them. Destroyed ones
    // are gone until they respawn
    reviveTargets(state.targets, state.time);
    moveTargets(state.targets, state.time);
    const afloat = state.targets.filter(isAlive);
    const obstacles: Obstacles = { islands: state.world.islands, bodies: afloat, ships: state.ships };
    const bodies: Body[] = [...afloat, ...state.ships];
    for (const ship of state.ships) {
      const helm: Helm = ship.isSinking
        ? { heading: ship.rotation, speed: 0 }
        : pilot(ship, this.nav, bodies, state.time);
      // In short steps, each followed by the collision check
      const steps = Math.max(1, Math.ceil((Math.max(ship.speed, helm.speed) * dt) / MAX_STEP));
      for (let k = 0; k < steps; k++) {
        ship.steer(dt / steps, helm);
        collideShip(ship, obstacles);
      }
    }
    stepCombat(state, dt, this.random);
  }
}
