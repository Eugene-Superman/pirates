import type { GameState } from '../GameState';
import type { Ship } from '../ships/Ship';
import type { ShipClassId } from '../ships/shipClasses';

/**
 * Anything that can be fired at: a ship (a player's, a bot's, or a sea monster). Only ships for now; something that
 * doesn't sail (a fort, say) would join them here
 */
export type Unit = Ship;

/** What a unit is, for the client to pick its look and name: a ship's class */
export type UnitKind = ShipClassId;

/** The unit with this id, if it is still in the game */
export function findUnit(state: GameState, id: number): Unit | undefined {
  return state.ships.find((ship) => ship.id === id);
}

/** Afloat: it can be seen, fired at and bumped into. Not a wreck going down */
export function isAfloat(unit: Unit) {
  return !unit.isSinking;
}

export function unitKind(unit: Unit): UnitKind {
  return unit.shipClass.id;
}
