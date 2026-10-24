import { BOT_KINDS } from '../bots/botKinds';
import { findUnit } from '../combat/units';
import type { GameState } from '../GameState';
import { hullReach } from '../physics/hull';
import { PERKS, gainXp, xpForKill } from '../ships/talents';
import { haulAboard, isEmpty, rollCargo, takeCargo, type Cargo } from './cargo';
import { earn, markStep, playerOf } from './player';
import { countKill } from './quests';

/** Seconds a chest floats before it sinks: a fight's loot is picked up right after it, or lost */
export const CHEST_TIME = 15;
/** Seconds a player's lost cargo floats where their ship went down: time to sail back for it */
export const LOST_CARGO_TIME = 300;
/** World units beyond a ship's hull from which a chest is hauled aboard as it sails by */
const CHEST_PICKUP = 12;

/**
 * Loot floating where a ship sank: a bot's chest of gold and the goods its wreck left, or a player's own cargo lost
 * when their ship went down. The first player's ship to sail over it takes the gold and what fits of the goods into
 * its hold; goods that don't fit stay floating
 */
export interface Chest {
  /** Unique in the game, like the ships' */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  gold: number;
  readonly goods: Cargo;
  /** The ship whose cargo this was, when it went down; null for a bot's loot */
  readonly lostBy: number | null;
  /** Game time it sinks, unclaimed */
  readonly expiresAt: number;
  /** The ship last told its hold was full here, so it is told once, not every update */
  fullFor: number | null;
}

/**
 * The spoils of this update's kills: the player who sank a bot is paid its bounty (more for a Bounty hunter), counts
 * it for their quests and their ship earns its experience; the bot may leave a chest floating where it went down, with
 * gold (more often for a Treasure hunter) and its goods. A player's ship that went down leaves its cargo floating
 * (half of it stays aboard with a Hidden hold). `random` is the game's loot generator, seeded like the dice.
 * Stepped from Game.update right after combat, which made the `destroyed` events
 */
export function stepLoot(state: GameState, random: () => number) {
  // Only the events there were: paying a bounty adds a `gold` event to the list
  const count = state.events.length;
  for (let i = 0; i < count; i++) {
    const event = state.events[i];
    if (event.type !== 'destroyed') continue;
    // The wreck is still in state.ships: the spawner takes sunk bots out later in this update
    const wreck = findUnit(state, event.targetId);
    const mind = wreck?.bot;
    if (wreck && !mind) {
      spillCargo(state, wreck);
      continue;
    }
    if (!mind) continue;
    const kind = BOT_KINDS[mind.kind];
    const player = playerOf(state, event.attackerId);
    const killer = player ? findUnit(state, event.attackerId) : undefined;
    if (player && killer) {
      const bounty = Math.round(kind.bounty * (1 + PERKS.bounty * killer.rank('bountyHunter')));
      earn(state, player, { amount: bounty, reason: 'bounty', kind: event.kind, quest: null, at: event.at });
      countKill(player, event.kind);
      gainXp(state, killer, xpForKill(kind.xp, kind.level, killer.level), 'kill', event.at);
      markStep(state, player, 'sink');
      if (kind.boss) markStep(state, player, 'baron');
    }
    const chance = kind.chest.chance * (1 + PERKS.chest * (killer?.rank('treasureHunter') ?? 0));
    const [least, most] = kind.chest.gold;
    const gold = random() < chance ? least + Math.floor(random() * (most - least + 1)) : 0;
    const goods = rollCargo(kind.cargo, random);
    if (gold === 0 && isEmpty(goods)) continue;
    state.chests.push({
      id: state.nextId++,
      x: event.at.x,
      y: event.at.y,
      gold,
      goods,
      lostBy: null,
      expiresAt: state.time + CHEST_TIME,
      fullFor: null,
    });
  }
}

/** A player's ship went down: its cargo floats where it sank, but for what a Hidden hold keeps aboard */
function spillCargo(state: GameState, ship: GameState['ships'][number]) {
  const goods = takeCargo(ship, ship.hasTalent('hiddenHold') ? 1 - PERKS.hiddenHold : 1);
  if (isEmpty(goods)) return;
  const at = { x: ship.x, y: ship.y, z: 0 };
  state.chests.push({
    id: state.nextId++,
    x: ship.x,
    y: ship.y,
    gold: 0,
    goods,
    lostBy: ship.id,
    expiresAt: state.time + LOST_CARGO_TIME,
    fullFor: null,
  });
  state.events.push({ type: 'cargoLost', shipId: ship.id, goods, at });
}

/**
 * Chests sink when their time is up; a player's ship sailing over one takes its gold and what fits of its goods, and
 * it is gone once nothing is left in it. Stepped after the ships moved
 */
export function stepChests(state: GameState) {
  state.chests = state.chests.filter((chest) => {
    if (state.time >= chest.expiresAt) return false;
    for (const ship of state.ships) {
      if (ship.bot || ship.isSinking) continue;
      if (Math.hypot(ship.x - chest.x, ship.y - chest.y) > hullReach(ship.hull) + CHEST_PICKUP) continue;
      const player = playerOf(state, ship.id);
      if (!player) continue;
      const at = { x: chest.x, y: chest.y, z: ship.height };
      if (chest.gold > 0) {
        earn(state, player, { amount: chest.gold, reason: 'chest', kind: null, quest: null, at });
        chest.gold = 0;
      }
      const taken = haulAboard(ship, chest.goods);
      if (!isEmpty(taken)) {
        const reason = chest.lostBy === null ? 'loot' : 'salvage';
        state.events.push({ type: 'cargo', shipId: ship.id, goods: taken, reason, at });
      }
      if (isEmpty(chest.goods)) return false;
      if (chest.fullFor !== ship.id) {
        chest.fullFor = ship.id;
        state.events.push({ type: 'holdFull', shipId: ship.id, at });
      }
    }
    return true;
  });
}
