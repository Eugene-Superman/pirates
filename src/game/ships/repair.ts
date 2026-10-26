import { markStep, playerOf } from '../economy/player';
import { spend } from '../records/stats';
import type { GameState } from '../GameState';
import type { Ship } from './Ship';
import { PERKS } from './talents';

/** Share of the hull's points the crew mends per second: 2 %, a sloop's whole hull in under a minute */
const REPAIR_RATE = 0.02;
/** Seconds between two repair steps: each one shows as a number over the ship */
export const REPAIR_TICK = 1;
/** Seconds a ship stays in combat after it last fired or was fired at: no repairs till then */
export const COMBAT_TIME = 5;
/**
 * Hull points the crew mends at sea for one gold of timber and pitch: a quarter of the shipwright's price (economy/
 * shop.ts), who does it all at once. A fight with a smuggler costs a sloop about half its hull, some 20 gold at sea,
 * two thirds of what the fight pays; a turtle kept off with harpoons, 5 or 6. A fight is won by taking little damage,
 * not only by sinking the foe
 */
export const REPAIR_HP_PER_GOLD = 10;

/** Hull points one repair step mends on this ship: more with Carpenters */
export function repairStep(ship: Ship) {
  const carpenters = 1 + PERKS.repair * ship.rank('carpenters');
  return Math.max(1, Math.round(ship.maxHp * REPAIR_RATE * REPAIR_TICK * carpenters));
}

/** The gold owed after the next step, coins and the fraction of one carried over (Ship.repairDue) */
function dueAfterStep(ship: Ship) {
  return ship.repairDue + Math.min(repairStep(ship), ship.maxHp - ship.hp) / REPAIR_HP_PER_GOLD;
}

/**
 * Whether the ship's player has the gold for the next repair step: the whole coins it makes due, and a coin at least,
 * so an empty purse doesn't mend a fraction at a time. Always, for a bot's crew, who works for nothing
 */
export function canPayRepair(state: GameState, ship: Ship) {
  const player = playerOf(state, ship.id);
  return !player || player.gold >= Math.max(1, Math.floor(dueAfterStep(ship)));
}

/**
 * The player orders the crew to repair (R): not while in combat (the player has to get away first, or fight on), nor
 * with the hull whole, nor without the gold for the first step. False if it didn't start
 */
export function orderRepair(state: GameState, ship: Ship) {
  if (ship.repairing) return true;
  if (ship.inCombat(state.time) || !canPayRepair(state, ship)) return false;
  ship.startRepair();
  return ship.repairing;
}

/**
 * The repair skill: a ship whose crew is repairing gets REPAIR_RATE of its hull back every second, a step at a time,
 * sailing or not. A player pays for every step as it is done, REPAIR_HP_PER_GOLD hull for a gold, whole coins as the
 * fractions add up. It stops when the hull is whole, when the ship fires or is fired at (Ship.enterCombat), and when
 * the gold for the next step runs out. Stepped from Game.update after combat, so a shot this update has already
 * stopped it
 */
export function stepRepairs(state: GameState, dt: number) {
  for (const ship of state.ships) {
    if (!ship.repairing) continue;
    if (ship.isSinking || ship.hp >= ship.maxHp || ship.inCombat(state.time)) {
      ship.stopRepair();
      continue;
    }
    ship.repairClock += dt;
    if (ship.repairClock < REPAIR_TICK) continue;
    ship.repairClock -= REPAIR_TICK;
    const player = playerOf(state, ship.id);
    let paid = 0;
    if (player) {
      if (!canPayRepair(state, ship)) {
        ship.stopRepair();
        state.events.push({ type: 'repairStopped', shipId: ship.id, reason: 'gold' });
        continue;
      }
      const due = dueAfterStep(ship);
      paid = Math.floor(due);
      spend(player, paid);
      ship.repairDue = due - paid;
      markStep(state, player, 'repair');
    }
    const before = ship.hp;
    ship.heal(repairStep(ship));
    state.events.push({
      type: 'repair',
      shipId: ship.id,
      amount: ship.hp - before,
      paid,
      at: { x: ship.x, y: ship.y, z: ship.height },
    });
    if (ship.hp >= ship.maxHp) ship.stopRepair();
  }
}
