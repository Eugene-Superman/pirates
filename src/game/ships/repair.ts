import type { GameState } from '../GameState';

/** Share of the hull's points the crew mends per second: 2 %, a sloop's whole hull in under a minute */
export const REPAIR_RATE = 0.02;
/** Seconds between two repair steps: each one shows as a number over the ship */
export const REPAIR_TICK = 1;
/** Seconds a ship stays in combat after it last fired or was fired at: no repairs till then */
export const COMBAT_TIME = 5;

/**
 * The repair skill: a ship whose crew is repairing gets REPAIR_RATE of its hull back every second, a step at a time,
 * sailing or not. It stops when the hull is whole, when the ship fires or is fired at (Ship.enterCombat), and isn't
 * started while the ship is in combat: the player has to get away first, or fight on. Stepped from Game.update after
 * combat, so a shot this update has already stopped it
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
    const before = ship.hp;
    ship.heal(Math.max(1, Math.round(ship.maxHp * REPAIR_RATE * REPAIR_TICK)));
    state.events.push({
      type: 'repair',
      shipId: ship.id,
      amount: ship.hp - before,
      at: { x: ship.x, y: ship.y, z: ship.height },
    });
    if (ship.hp >= ship.maxHp) ship.stopRepair();
  }
}
