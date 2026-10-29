import { applyMastery, captainBonus } from '../account/mastery';
import type { GameState } from '../GameState';
import { SAVE_VERSION, loadShip, saveShip, type SavedShip } from '../save';
import { Ship } from '../ships/Ship';
import { SHIP_CLASSES, type ShipClassId } from '../ships/shipClasses';
import { levelOf } from '../ships/talents';
import { seaOpenTo } from '../world/gates';
import type { Player } from './player';
import { spend } from '../records/stats';
import { isGoalShip, termsMet, tierTerms } from './shipyard';

/**
 * A player's ships. They sail one; the others are laid up in port as they were left (guns, ammo, outfit, experience
 * and talents, cargo, hull), kept as plain data in `player.fleet`. Ships are bought and changed in port, at the
 * shipyard. The ship sailed keeps the player's ship id whichever it is, so what the game ties to that id (the player,
 * their lost cargo) stays theirs
 */

/** The level of a ship laid up in port, for the shipyard's list */
export function laidUpLevel(ship: SavedShip) {
  return levelOf(ship.xp, SHIP_CLASSES[ship.shipClass].maxLevel);
}

/**
 * Whether a ship of this class may take to the sea the player is in: not one of a lower tier than the sea's, which its
 * gates keep out too (world/gates.ts), or a weak ship laid up in a strong sea's port would earn its bots' XP there
 */
export function fitsSea(state: GameState, id: ShipClassId) {
  return seaOpenTo(state.world.zone, SHIP_CLASSES[id].tier);
}

/** Puts `next` at the helm in port in place of the player's ship, which is laid up with everything on it */
function changeShip(state: GameState, player: Player, next: Ship) {
  const old = state.ship;
  player.fleet.push(saveShip(old));
  const { mooring } = state.world.port;
  next.x = mooring.x;
  next.y = mooring.y;
  next.rotation = old.rotation;
  next.dock(mooring);
  state.ships[state.ships.indexOf(old)] = next;
  state.ship = next;
  applyMastery(state, player);
}

/**
 * Buys a ship the player works towards (`isGoalShip`: of the next tier, of their line or of any, the first time) at the
 * shipyard and takes its helm: in port, of a tier that fits the sea, with every term of the Captain's path met, for
 * its tier's price. It comes new, at level 1, with no guns (the player fits theirs from the hold) and its class's
 * starting ammo. False if it can't
 */
export function buyShip(state: GameState, player: Player, id: ShipClassId) {
  // The goal's first: online the id comes from a player, and may be anything
  if (!isGoalShip(state, player, id) || !state.ship.docked || !fitsSea(state, id)) return false;
  const terms = tierTerms(SHIP_CLASSES[id].tier);
  if (!terms) return false;
  if (!termsMet(state, player) || player.gold < terms.price) return false;
  spend(player, terms.price);
  changeShip(state, player, new Ship(SHIP_CLASSES[id], player.shipId));
  return true;
}

/**
 * Takes the helm of a ship laid up in port (its place in `player.fleet`); the one sailed now is laid up. In port only,
 * and only of a ship that fits the sea
 */
export function takeHelm(state: GameState, player: Player, index: number) {
  const laidUp = player.fleet[index];
  if (!laidUp || !state.ship.docked || !fitsSea(state, laidUp.shipClass)) return false;
  const next = new Ship(SHIP_CLASSES[laidUp.shipClass], player.shipId);
  // Before its talents: the captain's mastery may give it a point for one
  next.setCaptain(captainBonus(player.mastery));
  loadShip(next, laidUp, SAVE_VERSION);
  player.fleet.splice(index, 1);
  changeShip(state, player, next);
  return true;
}
