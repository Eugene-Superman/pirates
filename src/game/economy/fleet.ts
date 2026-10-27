import type { GameState } from '../GameState';
import { SAVE_VERSION, loadShip, saveShip, type SavedShip } from '../save';
import { Ship } from '../ships/Ship';
import { SHIP_CLASSES } from '../ships/shipClasses';
import { levelOf } from '../ships/talents';
import type { Player } from './player';
import { spend } from '../records/stats';
import { goalOffer, termsMet } from './shipyard';

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
}

/**
 * Buys the ship the player works towards (`goalOffer`) at the shipyard and takes its helm: in port, with every term of
 * the Captain's path met, for its price. It comes new, at level 1, with no guns (the player fits theirs from the hold)
 * and its class's starting ammo. False if it can't
 */
export function buyShip(state: GameState, player: Player) {
  const offer = goalOffer(state, player);
  if (!offer || !state.ship.docked || !termsMet(state, player) || player.gold < offer.price) return false;
  spend(player, offer.price);
  changeShip(state, player, new Ship(SHIP_CLASSES[offer.shipClass], player.shipId));
  return true;
}

/** Takes the helm of a ship laid up in port (its place in `player.fleet`); the one sailed now is laid up. In port only */
export function takeHelm(state: GameState, player: Player, index: number) {
  const laidUp = player.fleet[index];
  if (!laidUp || !state.ship.docked) return false;
  const next = new Ship(SHIP_CLASSES[laidUp.shipClass], player.shipId);
  loadShip(next, laidUp, SAVE_VERSION);
  player.fleet.splice(index, 1);
  changeShip(state, player, next);
  return true;
}
