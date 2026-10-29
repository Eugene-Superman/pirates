import { BOT_KINDS } from '../bots/botKinds';
import { findUnit } from '../combat/units';
import type { GameState } from '../GameState';
import { hullReach } from '../physics/hull';
import { NO_BONUS } from '../ships/bonus';
import { gainXp, xpForKill } from '../ships/talents';
import { haulAboard, isEmpty, rollCargo, takeCargo, type Cargo } from './cargo';
import { earn, playerOf } from './player';
import { countKill } from './quests';

/** Seconds a chest floats before it sinks: a fight's loot is picked up right after it, or lost */
export const CHEST_TIME = 15;
/** Seconds a player's lost cargo floats where their ship went down: time to sail back for it */
export const LOST_CARGO_TIME = 300;
/** World units beyond a ship's hull from which a chest is hauled aboard as it sails by */
const CHEST_PICKUP = 12;
/** World units a second chest floats from the first (the captain's Lucky find), so both are seen */
const SECOND_CHEST_GAP = 14;
/** Pieces of moon glass the story's prey always leaves (bots/spawner.ts, stepPrey): what the story is about */
const PREY_GLASS = 1;

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
 * The spoils of this update's kills: the player who sank a bot is paid its bounty (more for a Bounty hunter and with
 * the captain's mastery), counts it for their quests and their ship earns its experience; the bot may leave a chest
 * floating where it went down, with gold (a ship's only; more often for a Treasure hunter) and its goods, and with the
 * captain's Lucky find a second one. A player's ship that went down leaves its cargo floating (all of it stays aboard
 * with a Hidden hold or Insured cargo). `random` is the game's loot generator, seeded like the dice.
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
    const bonus = killer?.bonus ?? NO_BONUS;
    // A monster pays more to a captain who hunts them (Leviathan hunter), a boss to one after prize money
    const monster = wreck?.nature === 'creature' ? bonus.monsterLoot : 0;
    if (player && killer) {
      const share = 1 + bonus.bounty + bonus.gold + monster;
      const bounty = Math.round(kind.bounty * share * (kind.boss ? 1 + bonus.bossBounty : 1));
      earn(state, player, { amount: bounty, reason: 'bounty', kind: event.kind, quest: null, at: event.at });
      countKill(player, killer.shipClass.id, event.kind, state.world.zone);
      const ship = { tier: killer.shipClass.tier, level: killer.level };
      gainXp(state, killer, Math.round(xpForKill(kind.xp, kind, ship) * (1 + monster)), 'kill', event.at);
    }
    let gold = 0;
    const { chest } = kind;
    const chestGold = () => {
      if (!chest) return 0;
      const [least, most] = chest.gold;
      return Math.round((least + Math.floor(random() * (most - least + 1))) * (1 + bonus.chestGold + bonus.gold));
    };
    if (chest) {
      const chance = chest.chance * (1 + bonus.chestChance);
      if (random() < chance) gold = chestGold();
    }
    const goods = rollCargo(kind.cargo, random, 1 + bonus.wreckGoods);
    if (mind.prey !== null) goods.moonGlass = (goods.moonGlass ?? 0) + PREY_GLASS;
    const expiresAt = state.time + CHEST_TIME * (1 + bonus.chestTime);
    if (gold > 0 || !isEmpty(goods)) dropChest(state, event.at.x, event.at.y, gold, goods, expiresAt);
    // A second chest by the first, never one in its place: not a better chance of a chest
    if (gold > 0 && bonus.secondChest > 0 && random() < bonus.secondChest) {
      dropChest(state, event.at.x + SECOND_CHEST_GAP, event.at.y, chestGold(), {}, expiresAt);
    }
  }
}

/** A bot's loot floating where it went down */
function dropChest(state: GameState, x: number, y: number, gold: number, goods: Cargo, expiresAt: number) {
  state.chests.push({ id: state.nextId++, x, y, gold, goods, lostBy: null, expiresAt, fullFor: null });
}

/**
 * A player's ship went down: its cargo floats where it sank, but for what a Hidden hold keeps aboard; all of it stays
 * with the captain's Insured cargo
 */
function spillCargo(state: GameState, ship: GameState['ships'][number]) {
  if (ship.bonus.insured > 0) return;
  const goods = takeCargo(ship, 1 - Math.min(1, ship.bonus.hiddenHold));
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
      const reach = hullReach(ship.hull) + CHEST_PICKUP * (1 + ship.bonus.chestReach);
      if (Math.hypot(ship.x - chest.x, ship.y - chest.y) > reach) continue;
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
