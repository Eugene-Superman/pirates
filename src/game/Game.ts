import { thinkBots } from './bots/brain';
import { populate, stepSpawns } from './bots/spawner';
import { stepCombat } from './combat/combat';
import { createTargets, isAlive, reviveTargets } from './combat/targets';
import type { GameState } from './GameState';
import { createRandom } from './lib/random';
import { NavGrid } from './navigation/NavGrid';
import { pilot, type Helm } from './navigation/pilot';
import { collideShip, type Obstacles } from './physics/collisions';
import type { Body } from './physics/hull';
import { stepRepairs } from './ships/repair';
import { Ship } from './ships/Ship';
import { SHIP_CLASSES, STARTER_SHIP } from './ships/shipClasses';
import { START, createWorld } from './world/World';

// World units a ship moves at most between two collision checks: less than the thinnest pair of hulls can overlap by
// (the barrel and a sloop: 2.6 + 5.6), so nothing is skipped over at any speed or frame rate
const MAX_STEP = 4;
// Seeds of the game's own random generators: the dice of combat, and the bots (where they come into the game, where
// they wander). Each its own, so neither changes the map's random numbers or the other's
const COMBAT_SEED = 7;
const BOT_SEED = 11;
/**
 * Seconds after a player's ship is wrecked that it comes back whole at the start: the client's sinking animation (7 s)
 * has played by then
 */
export const WRECK_TIME = 9;

// The simulation: owns the state and advances it. The update order lives here, not in the client,
// because the future server has to run exactly the same steps
export class Game {
  readonly state: GameState;
  /** Open water and routes round the islands; built once, the world's islands don't move */
  readonly nav: NavGrid;
  /** The dice of combat, seeded: the server and every client roll the same */
  private readonly random = createRandom(COMBAT_SEED);
  private readonly botRandom = createRandom(BOT_SEED);

  constructor() {
    const world = createWorld();
    this.nav = new NavGrid(world);
    let nextId = 1;
    const ship = new Ship(SHIP_CLASSES[STARTER_SHIP], nextId++);
    ship.x = START.x;
    ship.y = START.y;
    const targets = createTargets(START.x, START.y, () => nextId++);
    this.state = {
      world,
      ship,
      ships: [ship],
      targets,
      projectiles: [],
      events: [],
      respawns: [],
      nextId,
      time: 0,
    };
    populate(this.state, this.nav, this.botRandom);
  }

  /** dt in seconds */
  update(dt: number) {
    const { state } = this;
    state.time += dt;
    state.events.length = 0;
    // Destroyed practice targets come back when their time is up; then the bots decide where to go and whom to fight
    reviveTargets(state.targets, state.time);
    thinkBots(state, this.nav, this.botRandom);
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
    stepRepairs(state, dt);
    stepSpawns(state, this.nav, this.botRandom);
    this.bringBackWrecks();
  }

  /** A player's wrecked ship comes back whole at the start, WRECK_TIME after it went down. Its guns and ammo stay */
  private bringBackWrecks() {
    const { state } = this;
    for (const ship of state.ships) {
      if (ship.bot || !ship.isSinking) continue;
      ship.wreckedAt ??= state.time;
      if (state.time - ship.wreckedAt >= WRECK_TIME) ship.respawn(START.x, START.y);
    }
  }
}
