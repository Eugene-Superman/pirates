import type { Ship } from '../ships/Ship';

/** Goods a bot's wreck leaves floating, hauled aboard into the hold and sold at the port's market */
export type GoodId =
  'fish' | 'cloth' | 'spices' | 'rum' | 'contraband' | 'turtleShell' | 'serpentScale' | 'baronsStrongbox';

export interface Good {
  readonly id: GoodId;
  readonly name: string;
  /** Gold the market pays for one */
  readonly price: number;
}

// Every piece takes one place in the hold. Goods are a small extra next to a bounty: what a wreck drops is worth
// about a tenth of it on average (botKinds.ts drops a piece or two now and then), so carrying it home is worth the
// trip but never the point of a fight. Holds are roomy, so a full one is a long voyage's haul
// prettier-ignore
export const GOODS: Readonly<Record<GoodId, Good>> = {
  fish: { id: 'fish', name: 'Fish', price: 1 },
  cloth: { id: 'cloth', name: 'Cloth', price: 2 },
  spices: { id: 'spices', name: 'Spices', price: 4 },
  rum: { id: 'rum', name: 'Rum', price: 3 },
  contraband: { id: 'contraband', name: 'Contraband', price: 5 },
  turtleShell: { id: 'turtleShell', name: 'Turtle shell', price: 3 },
  serpentScale: { id: 'serpentScale', name: 'Serpent scales', price: 4 },
  baronsStrongbox: { id: 'baronsStrongbox', name: "Baron's strongbox", price: 50 },
};

export const GOOD_IDS: readonly GoodId[] = [
  'fish',
  'cloth',
  'spices',
  'rum',
  'contraband',
  'turtleShell',
  'serpentScale',
  'baronsStrongbox',
];

/** Goods by kind, how many of each: a hold's, a chest's */
export type Cargo = Partial<Record<GoodId, number>>;

/** What a bot's wreck may leave: `count` (at least, at most) of a good, with `chance` of any */
export interface CargoDrop {
  readonly good: GoodId;
  readonly count: readonly [number, number];
  readonly chance: number;
}

/** How many pieces of goods, all kinds together: the places they take in a hold */
export function cargoCount(cargo: Cargo) {
  let count = 0;
  for (const id of GOOD_IDS) count += cargo[id] ?? 0;
  return count;
}

/** What goods (of `kinds`, or every kind) sell for at the market, all together */
export function cargoValue(cargo: Cargo, kinds: readonly GoodId[] = GOOD_IDS) {
  let value = 0;
  for (const id of kinds) value += (cargo[id] ?? 0) * GOODS[id].price;
  return value;
}

export function isEmpty(cargo: Cargo) {
  return cargoCount(cargo) === 0;
}

/** Places left in a ship's hold */
export function freeHold(ship: Ship) {
  return Math.max(0, ship.holdSize - cargoCount(ship.cargo));
}

/**
 * Hauls what fits of `goods` into the ship's hold, dearest first; what didn't fit stays in `goods`. Returns what was
 * taken aboard
 */
export function haulAboard(ship: Ship, goods: Cargo): Cargo {
  const taken: Cargo = {};
  let room = freeHold(ship);
  const dearest = [...GOOD_IDS];
  dearest.sort((a, b) => GOODS[b].price - GOODS[a].price);
  for (const id of dearest) {
    const n = Math.min(goods[id] ?? 0, room);
    if (n <= 0) continue;
    ship.cargo[id] = (ship.cargo[id] ?? 0) + n;
    goods[id] = (goods[id] ?? 0) - n;
    taken[id] = n;
    room -= n;
  }
  return taken;
}

/**
 * Throws up to `count` pieces of a good out of the ship's hold, to make room for better: they sink. Anywhere, at sea
 * or in port. Returns whether anything went
 */
export function throwOverboard(ship: Ship, good: GoodId, count: number) {
  const n = Math.min(Math.floor(count), ship.cargo[good] ?? 0);
  if (n <= 0) return false;
  ship.cargo[good] = (ship.cargo[good] ?? 0) - n;
  if (ship.cargo[good] === 0) delete ship.cargo[good];
  return true;
}

/** The goods a wreck leaves, rolled with the loot generator */
export function rollCargo(drops: readonly CargoDrop[], random: () => number): Cargo {
  const cargo: Cargo = {};
  for (const { good, count, chance } of drops) {
    if (random() >= chance) continue;
    const n = count[0] + Math.floor(random() * (count[1] - count[0] + 1));
    if (n > 0) cargo[good] = (cargo[good] ?? 0) + n;
  }
  return cargo;
}

/**
 * Takes a share of a ship's cargo out of its hold, every kind rounded down (what spills when it goes down); the rest
 * stays aboard. Returns what was taken
 */
export function takeCargo(ship: Ship, share: number): Cargo {
  const taken: Cargo = {};
  for (const id of GOOD_IDS) {
    const n = Math.floor((ship.cargo[id] ?? 0) * share);
    if (n <= 0) continue;
    taken[id] = n;
    ship.cargo[id] = (ship.cargo[id] ?? 0) - n;
  }
  return taken;
}
