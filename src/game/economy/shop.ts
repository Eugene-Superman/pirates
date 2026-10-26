import { AMMO, GUNS, type AmmoId, type GunId } from '../combat/arsenal';
import type { GameState } from '../GameState';
import { OUTFITS, type OutfitId, type OutfitSlot } from '../ships/outfit';
import type { Ship } from '../ships/Ship';
import { GOOD_IDS, cargoValue, type GoodId } from './cargo';
import { earn, markStep, shipOf, type Player } from './player';
import { spend } from '../records/stats';

// The port's shop and shipwright. Prices by tier: a gun of the next tier costs a few times the last, as its damage
// grows; ammo is cheap next to what a kill pays (bots/botKinds.ts), so a player never gets stuck without shot
const GUN_PRICES = [0, 80, 250, 600, 1400, 3000, 6000]; // gold, by the gun's tier
const AMMO_PACK_PRICES = [0, 10, 30, 70, 150, 300, 600]; // gold for AMMO_PACK shots, by the ammo's tier
/** Shots in one pack of ammo: what the arsenal's cards buy and sell at a click; any count from 1 is bought too */
export const AMMO_PACK = 20;
/** The most shots of an ammo bought or sold at once */
export const MAX_AMMO_DEAL = 1000;
// The shipwright's rate: hull points mended for one gold, all at once. Four times the crew's at sea (ships/repair.ts)
const SHIPWRIGHT_HP_PER_GOLD = 2.5;
// Gold, by the piece of outfit's tier: a little dearer than a gun of the tier, as it serves every fight
const OUTFIT_PRICES = [0, 120, 400, 1000];
const RESPEC_PRICE = 20; // gold for every talent point and signature forgotten: cheap, so a player tries other builds
// Share of its price the arsenal pays for a gun or ammo sold back: a quarter, so a gun bought and sold again is a loss,
// and selling what the player has outgrown helps a little towards the next, never more than the hunting does
const SELL_BACK = 0.25;

export function gunPrice(gun: GunId) {
  return GUN_PRICES[GUNS[gun].tier] ?? GUN_PRICES[GUN_PRICES.length - 1];
}

export function outfitPrice(id: OutfitId) {
  return OUTFIT_PRICES[OUTFITS[id].tier] ?? OUTFIT_PRICES[OUTFIT_PRICES.length - 1];
}

export function ammoPackPrice(ammo: AmmoId) {
  return AMMO_PACK_PRICES[AMMO[ammo].tier] ?? AMMO_PACK_PRICES[AMMO_PACK_PRICES.length - 1];
}

/** What the arsenal pays for a gun sold back */
export function gunSalePrice(gun: GunId) {
  return Math.floor(gunPrice(gun) * SELL_BACK);
}

/** What `count` shots of an ammo cost: its pack's price by the shot, a part of a gold coin rounded up */
export function ammoPrice(ammo: AmmoId, count: number) {
  return Math.ceil((ammoPackPrice(ammo) * count) / AMMO_PACK);
}

/** What the arsenal pays for `count` shots of an ammo sold back (a pack's by default), a part of a coin rounded down */
export function ammoSalePrice(ammo: AmmoId, count: number = AMMO_PACK) {
  return Math.floor((ammoPackPrice(ammo) * SELL_BACK * count) / AMMO_PACK);
}

/** Whether a count of shots can be dealt in at once: a whole number from 1 to MAX_AMMO_DEAL */
function dealable(count: number) {
  return Number.isInteger(count) && count >= 1 && count <= MAX_AMMO_DEAL;
}

/** What mending the whole hull costs at the shipwright's; 0 when it is whole */
export function repairPrice(ship: Ship) {
  return Math.ceil((ship.maxHp - ship.hp) / SHIPWRIGHT_HP_PER_GOLD);
}

/** The player's ship, if it is in port: everything in the shop is bought there */
function dockedShip(state: GameState, player: Player) {
  const ship = shipOf(state, player);
  return ship?.docked ? ship : undefined;
}

function pay(player: Player, price: number) {
  if (player.gold < price) return false;
  spend(player, price);
  return true;
}

/** Buys a gun into the hold; it is fitted from there (economy/player.ts). False if not in port or short of gold */
export function buyGun(state: GameState, player: Player, gun: GunId) {
  if (!dockedShip(state, player) || !pay(player, gunPrice(gun))) return false;
  player.hold[gun] = (player.hold[gun] ?? 0) + 1;
  return true;
}

/** Buys `count` shots of an ammo into the ship's hold (a pack's by default), up to MAX_AMMO_DEAL at once */
export function buyAmmo(state: GameState, player: Player, ammo: AmmoId, count: number = AMMO_PACK) {
  const ship = dockedShip(state, player);
  if (!ship || !dealable(count) || !pay(player, ammoPrice(ammo, count))) return false;
  ship.addAmmo(ammo, count);
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

/** Buys a piece of outfit into the hold; the shipwright fits it from there (fitOutfit). False if not in port or short */
export function buyOutfit(state: GameState, player: Player, id: OutfitId) {
  if (!dockedShip(state, player) || !pay(player, outfitPrice(id))) return false;
  player.outfits[id] = (player.outfits[id] ?? 0) + 1;
  return true;
}

/**
 * The shipwright fits a piece of outfit from the hold into its slot, the piece that was there going to the hold; or
 * takes the slot's piece off (null). Only in port: sails, planking and rudders aren't changed at sea. False if the
 * piece isn't in the hold or doesn't go in that slot
 */
export function fitOutfit(state: GameState, player: Player, slot: OutfitSlot, id: OutfitId | null) {
  const ship = dockedShip(state, player);
  if (!ship) return false;
  const current = ship.outfit[slot];
  if (current === id) return true;
  if (id !== null) {
    const stock = player.outfits[id] ?? 0;
    if (OUTFITS[id].slot !== slot || stock <= 0) return false;
    player.outfits[id] = stock - 1;
  }
  ship.fitOutfit(slot, id);
  if (current !== null) player.outfits[current] = (player.outfits[current] ?? 0) + 1;
  return true;
}

/**
 * Sells a gun from the hold back to the arsenal for a quarter of its price (a `gold` event). Only a gun in the hold: a
 * fitted one is taken off in the loadout first. False if not in port or there is none in the hold
 */
export function sellGun(state: GameState, player: Player, gun: GunId) {
  const ship = dockedShip(state, player);
  const stock = player.hold[gun] ?? 0;
  if (!ship || stock <= 0) return false;
  player.hold[gun] = stock - 1;
  earn(state, player, { amount: gunSalePrice(gun), reason: 'arsenal', kind: null, quest: null, at: shipTop(ship) });
  return true;
}

/**
 * Sells `count` shots of an ammo (a pack's by default) back to the arsenal for a quarter of their price (a `gold`
 * event); the one loaded too, if the player wants. False if not in port, short of them, or if they'd fetch nothing
 */
export function sellAmmo(state: GameState, player: Player, ammo: AmmoId, count: number = AMMO_PACK) {
  const ship = dockedShip(state, player);
  const amount = ammoSalePrice(ammo, count);
  if (!ship || !dealable(count) || ship.ammo[ammo] < count || amount < 1) return false;
  ship.addAmmo(ammo, -count);
  earn(state, player, { amount, reason: 'arsenal', kind: null, quest: null, at: shipTop(ship) });
  return true;
}

/** Where the gold paid to a ship floats up from */
function shipTop(ship: Ship) {
  return { x: ship.x, y: ship.y, z: ship.height };
}

/**
 * Sells goods from the ship's hold at the port's market: every piece of one kind, or everything (no kind given). A
 * `gold` event; false if not in port or there is nothing to sell
 */
export function sellCargo(state: GameState, player: Player, good?: GoodId) {
  const ship = dockedShip(state, player);
  if (!ship) return false;
  const kinds = good ? [good] : GOOD_IDS;
  const amount = cargoValue(ship.cargo, kinds);
  if (amount === 0) return false;
  for (const id of kinds) delete ship.cargo[id];
  earn(state, player, { amount, reason: 'market', kind: null, quest: null, at: shipTop(ship) });
  markStep(state, player, 'sell');
  return true;
}

/** What forgetting the ship's talents costs at the shipwright's; 0 with none picked */
export function respecPrice(ship: Ship) {
  let picks = 0;
  for (const rank of ship.talentRanks().values()) picks += rank;
  return picks * RESPEC_PRICE;
}

/** The shipwright retrains the crew: every talent forgotten, to pick again. Only in port; false with none or short */
export function resetTalents(state: GameState, player: Player) {
  const ship = dockedShip(state, player);
  const price = ship ? respecPrice(ship) : 0;
  if (!ship || price === 0 || !pay(player, price)) return false;
  ship.forgetTalents();
  return true;
}
