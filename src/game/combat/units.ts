import type { GameState } from '../GameState';
import { Ship } from '../ships/Ship';
import type { ShipClassId } from '../ships/shipClasses';
import { isAlive, type Target, type TargetKind } from './targets';

/** Anything that can be fired at: a ship (a bot's, or a sea monster) or a practice target */
export type Unit = Ship | Target;

/** What a unit is, for the client to pick its look: a target's kind or a ship's class */
export type UnitKind = TargetKind | ShipClassId;

/** The ship or target with this id, if it is still in the game */
export function findUnit(state: GameState, id: number): Unit | undefined {
  return state.ships.find((ship) => ship.id === id) ?? state.targets.find((target) => target.id === id);
}

/** Afloat: it can be seen, fired at and bumped into. Not a wreck going down, nor a target waiting to respawn */
export function isAfloat(unit: Unit) {
  return unit instanceof Ship ? !unit.isSinking : isAlive(unit);
}

export function isShip(unit: Unit): unit is Ship {
  return unit instanceof Ship;
}

export function unitKind(unit: Unit): UnitKind {
  return unit instanceof Ship ? unit.shipClass.id : unit.kind;
}
