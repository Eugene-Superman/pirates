import { AMMO, GUNS, type AmmoId, type GunId } from '../combat/arsenal';
import type { GameState } from '../GameState';
import type { Ship } from '../ships/Ship';
import type { Player } from './player';

// The port's shop. Prices by tier: a gun of the next tier costs a few times the last, as its damage grows; ammo is
// cheap next to what a kill pays (bots/botKinds.ts), so a player never gets stuck without shot
const GUN_PRICES = [0, 80, 250, 600, 1400, 3000, 6000]; // gold, by the gun's tier
const AMMO_PACK_PRICES = [0, 10, 30, 70, 150, 300, 600]; // gold for AMMO_PACK shots, by the ammo's tier
/** Shots in one pack of ammo */
export const AMMO_PACK = 20;
const REPAIR_HP_PER_GOLD = 5; // the shipwright's rate: hull points mended for one gold

export function gunPrice(gun: GunId) {
  return GUN_PRICES[GUNS[gun].tier] ?? GUN_PRICES[GUN_PRICES.length - 1];
}

export function ammoPackPrice(ammo: AmmoId) {
  return AMMO_PACK_PRICES[AMMO[ammo].tier] ?? AMMO_PACK_PRICES[AMMO_PACK_PRICES.length - 1];
}

/** What mending the whole hull costs at the shipwright's; 0 when it is whole */
export function repairPrice(ship: Ship) {
  return Math.ceil((ship.maxHp - ship.hp) / REPAIR_HP_PER_GOLD);
}

/** The player's ship, if it is in port: everything in the shop is bought there */
function dockedShip(state: GameState, player: Player) {
  const ship = state.ships.find((s) => s.id === player.shipId);
  return ship?.docked ? ship : undefined;
}

function pay(player: Player, price: number) {
  if (player.gold < price) return false;
  player.gold -= price;
  return true;
}

/** Buys a gun into the hold; it is fitted from there (economy/player.ts). False if not in port or short of gold */
export function buyGun(state: GameState, player: Player, gun: GunId) {
  if (!dockedShip(state, player) || !pay(player, gunPrice(gun))) return false;
  player.hold[gun] = (player.hold[gun] ?? 0) + 1;
  return true;
}

/** Buys a pack of AMMO_PACK shots into the ship's hold */
export function buyAmmo(state: GameState, player: Player, ammo: AmmoId) {
  const ship = dockedShip(state, player);
  if (!ship || !pay(player, ammoPackPrice(ammo))) return false;
  ship.addAmmo(ammo, AMMO_PACK);
  return true;
}

/** The shipwright mends the whole hull at once */
export function repairInPort(state: GameState, player: Player) {
  const ship = dockedShip(state, player);
  const price = ship ? repairPrice(ship) : 0;
  if (!ship || price === 0 || !pay(player, price)) return false;
  ship.heal(ship.maxHp);
  return true;
}
