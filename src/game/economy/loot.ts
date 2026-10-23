import { BOT_KINDS } from '../bots/botKinds';
import type { GameState } from '../GameState';
import { hullReach } from '../physics/hull';
import { earn, playerOf } from './player';
import { countKill } from './quests';

/** Seconds a chest floats before it sinks */
export const CHEST_TIME = 90;
/** World units beyond a ship's hull from which a chest is hauled aboard as it sails by */
const CHEST_PICKUP = 12;

/** A chest of gold floating where a bot sank: the first player's ship to sail over it takes the gold */
export interface Chest {
  /** Unique in the game, like the ships' */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly gold: number;
  /** Game time it sinks, unclaimed */
  readonly expiresAt: number;
}

/**
 * The spoils of this update's kills: the player who sank a bot is paid its bounty and counts it for their quests, and
 * the bot may leave a chest floating where it went down. `random` is the game's loot generator, seeded like the dice.
 * Stepped from Game.update right after combat, which made the `destroyed` events
 */
export function stepLoot(state: GameState, random: () => number) {
  // Only the events there were: paying a bounty adds a `gold` event to the list
  const count = state.events.length;
  for (let i = 0; i < count; i++) {
    const event = state.events[i];
    if (event.type !== 'destroyed') continue;
    // The wreck is still in state.ships: the spawner takes sunk bots out later in this update
    const mind = state.ships.find((ship) => ship.id === event.targetId)?.bot;
    if (!mind) continue;
    const kind = BOT_KINDS[mind.kind];
    const player = playerOf(state, event.attackerId);
    if (player) {
      earn(state, player, { amount: kind.bounty, reason: 'bounty', kind: event.kind, quest: null, at: event.at });
      countKill(player, event.kind);
    }
    if (random() < kind.chest.chance) {
      const [least, most] = kind.chest.gold;
      state.chests.push({
        id: state.nextId++,
        x: event.at.x,
        y: event.at.y,
        gold: least + Math.floor(random() * (most - least + 1)),
        expiresAt: state.time + CHEST_TIME,
      });
    }
  }
}

/** Chests sink when their time is up; a player's ship sailing over one hauls it aboard. Stepped after the ships moved */
export function stepChests(state: GameState) {
  state.chests = state.chests.filter((chest) => {
    if (state.time >= chest.expiresAt) return false;
    for (const ship of state.ships) {
      if (ship.bot || ship.isSinking) continue;
      if (Math.hypot(ship.x - chest.x, ship.y - chest.y) > hullReach(ship.hull) + CHEST_PICKUP) continue;
      const player = playerOf(state, ship.id);
      if (!player) continue;
      const at = { x: chest.x, y: chest.y, z: ship.height };
      earn(state, player, { amount: chest.gold, reason: 'chest', kind: null, quest: null, at });
      return false;
    }
    return true;
  });
}
