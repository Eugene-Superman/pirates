import { WAKE_RANGE, isAwake, nearPlayers, thinkBots } from './bots/brain';
import { populate, stepSpawns } from './bots/spawner';
import { stepCombat } from './combat/combat';
import { stepChests, stepLoot } from './economy/loot';
import { newPlayer } from './economy/player';
import type { GameState } from './GameState';
import { createRandom, streamSeed } from './lib/random';
import { NavGrid } from './navigation/NavGrid';
import { pilot, type Helm } from './navigation/pilot';
import { collideShip, type Obstacles } from './physics/collisions';
import { loadGame, saveGame, type SaveData } from './save';
import { stepRepairs } from './ships/repair';
import { Ship } from './ships/Ship';
import { SHIP_CLASSES, STARTER_SHIP } from './ships/shipClasses';
import { stepDocking } from './world/port';
import { START, createWorld } from './world/World';

// World units a ship moves at most between two collision checks: less than the thinnest pair of hulls can overlap by
// (two sea serpents: 4 + 4), so nothing is skipped over at any speed or frame rate
const MAX_STEP = 4;
// World units round an awake ship within which it may meet anything this update: a coast it bumps, a ship it swerves
// round (two ships closing at 150 units a second each, seen 3 s ahead, are 900 apart)
const MEET_RANGE = 1000;
// The game's own random generators, each a stream of the match's seed: the dice of combat, and the bots (where they
// come into the game, where they wander). Each its own, so neither changes the map's random numbers or the other's
const COMBAT_STREAM = 1;
const BOT_STREAM = 2;
const LOOT_STREAM = 3; // chests: whether one drops, the gold in it
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
  private readonly random: () => number;
  private readonly botRandom: () => number;
  private readonly lootRandom: () => number;

  /**
   * seed: the match's own, so each match rolls its own dice and places its own bots. Online the server will pick it and
   * send it to the clients; the map stays the same whatever it is (its seed is fixed, World.ts)
   */
  constructor(seed: number) {
    this.random = createRandom(streamSeed(seed, COMBAT_STREAM));
    this.botRandom = createRandom(streamSeed(seed, BOT_STREAM));
    this.lootRandom = createRandom(streamSeed(seed, LOOT_STREAM));
    const world = createWorld();
    this.nav = new NavGrid(world);
    let nextId = 1;
    const ship = new Ship(SHIP_CLASSES[STARTER_SHIP], nextId++);
    ship.x = START.x;
    ship.y = START.y;
    this.state = {
      world,
      ship,
      ships: [ship],
      player: newPlayer(ship.id),
      chests: [],
      projectiles: [],
      events: [],
      respawns: [],
      nextId,
      time: 0,
    };
    populate(this.state, this.nav, this.botRandom);
  }

  /** The player's progress, to keep between games (save.ts) */
  save(): SaveData {
    return saveGame(this.state);
  }

  /** Puts a kept progress back: right after the game is made. Anything not valid in it is left as new */
  load(data: unknown): boolean {
    return loadGame(this.state, this.nav, data);
  }

  /** dt in seconds */
  update(dt: number) {
    const { state } = this;
    state.time += dt;
    state.events.length = 0;
    // Bots far from every player wait where they are, stopped: only those near one think and sail
    const players = state.ships.filter((ship) => !ship.bot);
    const awake: Ship[] = [];
    for (const ship of state.ships) {
      if (isAwake(ship, players)) awake.push(ship);
      else ship.speed = 0;
    }
    thinkBots(state, awake, players, this.nav, this.botRandom);
    // Only what is round the players can meet a ship that sails: the rest of the sea isn't looked at
    const near = WAKE_RANGE + MEET_RANGE;
    const islands = state.world.islands.filter((island) =>
      nearPlayers(island.x, island.y, near + island.reach, players),
    );
    const ships = state.ships.filter((ship) => nearPlayers(ship.x, ship.y, near, players));
    const obstacles: Obstacles = { islands, ships };
    for (const ship of awake) {
      const helm: Helm = ship.isSinking
        ? { heading: ship.rotation, speed: 0 }
        : pilot(ship, this.nav, ships, state.time);
      // In short steps, each followed by the collision check
      const steps = Math.max(1, Math.ceil((Math.max(ship.speed, helm.speed) * dt) / MAX_STEP));
      for (let k = 0; k < steps; k++) {
        ship.steer(dt / steps, helm);
        collideShip(ship, obstacles);
      }
    }
    stepCombat(state, dt, this.random);
    stepLoot(state, this.lootRandom);
    stepRepairs(state, dt);
    stepChests(state);
    stepSpawns(state, this.nav, this.botRandom);
    stepDocking(state);
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
