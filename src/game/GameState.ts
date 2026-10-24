import type { Respawn } from './bots/spawner';
import type { Shell } from './combat/barrage';
import type { GameEvent, Projectile } from './combat/combat';
import type { Chest } from './economy/loot';
import type { Player } from './economy/player';
import type { Ship } from './ships/Ship';
import type { WorldData } from './world/World';

// Game state that the view reads and draws
export interface GameState {
  world: WorldData;
  /** The player's ship */
  ship: Ship;
  /** Every ship at sea: the player's first, then the bots (sea monsters among them). Other players will join it */
  ships: Ship[];
  /** The player: their gold, the guns in their hold, their quests. Online, one of a list */
  player: Player;
  /** Loot floating where ships sank: a bot's gold and goods, a player's lost cargo */
  chests: Chest[];
  projectiles: Projectile[];
  /** A boss's barrage: shells on their way to the spots marked on the water */
  shells: Shell[];
  /** What happened during the last update (shots, hits, wrecks, repairs); replaced by every update */
  events: GameEvent[];
  /** Bots waiting to replace ones that were sunk */
  respawns: Respawn[];
  /** The id the next new ship or chest gets: every one has its own */
  nextId: number;
  time: number;
}
