import type { WeaponId } from './weapons';

export type GunId =
  | 'cannon1'
  | 'swivelGun'
  | 'cannon2'
  | 'carronade'
  | 'longNine'
  | 'cannon3'
  | 'pounder24'
  | 'culverin'
  | 'pounder32'
  | 'pounder42'
  | 'harpoonGun1'
  | 'deckCrossbow'
  | 'harpoonGun2'
  | 'whalingGun'
  | 'harpoonGun3'
  | 'ballista'
  | 'barbedLauncher'
  | 'twinLauncher'
  | 'leviathanLance'
  | 'krakenBane';

/**
 * How a die of damage is rolled, as in D&D: 1…die, where the lowest faces miss and the highest are critical hits.
 * Guns have one, and so do sea monsters' jaws (`Bite`)
 */
export interface DamageDie {
  /** Sides of the die: a roll of 1…die */
  readonly die: number;
  /** Rolls of this or lower do nothing */
  readonly missOn: number;
  /** Rolls of this or higher are critical hits: critMultiplier × die + bonus */
  readonly critFrom: number;
  readonly critMultiplier: number;
}

/**
 * A gun: a cannon or a harpoon launcher, fitted into one of a ship's slots for its weapon. Each shot it rolls its die
 * and adds its ammo's bonus (rollDamage). Every gun reloads and reaches on its own: in a volley, only the guns that are
 * loaded and within range of the target fire
 */
export interface Gun extends DamageDie {
  readonly id: GunId;
  readonly weapon: WeaponId;
  /** The ship tier it is made for, which sets its price (economy/shop.ts). Any ship can fit any gun */
  readonly tier: number;
  /** Shown to players */
  readonly name: string;
  /** What it is good at, in a few words: shown in the loadout */
  readonly role: string;
  /** Farthest a shot reaches, world units from the ship's centre */
  readonly range: number;
  /** Seconds before it can fire again */
  readonly reload: number;
}

// The balance table's proposal (pirate-balance.xlsx, Plan arsenal). The I–III guns of each weapon are the all-rounders;
// the rest trade reach, reload, misses and crits against each other, so steady guns and swingy ones feel different
// prettier-ignore
export const GUNS: Readonly<Record<GunId, Gun>> = {
  cannon1: { id: 'cannon1', weapon: 'cannon', tier: 1, name: 'Cannon I', die: 10, missOn: 1, critFrom: 10, critMultiplier: 2, range: 260, reload: 2, role: 'All-round' },
  swivelGun: { id: 'swivelGun', weapon: 'cannon', tier: 1, name: 'Swivel gun', die: 6, missOn: 1, critFrom: 6, critMultiplier: 1.5, range: 180, reload: 1, role: 'Fast and steady, short reach' },
  cannon2: { id: 'cannon2', weapon: 'cannon', tier: 2, name: 'Cannon II', die: 14, missOn: 1, critFrom: 14, critMultiplier: 2, range: 260, reload: 2, role: 'All-round' },
  carronade: { id: 'carronade', weapon: 'cannon', tier: 2, name: 'Carronade', die: 20, missOn: 4, critFrom: 20, critMultiplier: 3, range: 170, reload: 2.6, role: 'Brawler: misses on 1–4, crits ×3' },
  longNine: { id: 'longNine', weapon: 'cannon', tier: 3, name: 'Long nine', die: 12, missOn: 1, critFrom: 10, critMultiplier: 2, range: 340, reload: 2.2, role: 'Sniper: crits on 10–12' },
  cannon3: { id: 'cannon3', weapon: 'cannon', tier: 3, name: 'Cannon III', die: 18, missOn: 1, critFrom: 18, critMultiplier: 2, range: 260, reload: 2, role: 'All-round' },
  pounder24: { id: 'pounder24', weapon: 'cannon', tier: 4, name: '24-pounder', die: 24, missOn: 1, critFrom: 24, critMultiplier: 2, range: 270, reload: 2.2, role: 'Heavy all-round' },
  culverin: { id: 'culverin', weapon: 'cannon', tier: 4, name: 'Culverin', die: 16, missOn: 1, critFrom: 14, critMultiplier: 2, range: 360, reload: 2.2, role: 'Long reach, crits on 14–16' },
  pounder32: { id: 'pounder32', weapon: 'cannon', tier: 5, name: '32-pounder', die: 30, missOn: 2, critFrom: 30, critMultiplier: 2, range: 270, reload: 2.4, role: 'Heavy, misses on 1–2' },
  pounder42: { id: 'pounder42', weapon: 'cannon', tier: 6, name: '42-pounder', die: 36, missOn: 2, critFrom: 35, critMultiplier: 2, range: 280, reload: 2.6, role: 'Heaviest, crits on 35–36' },
  harpoonGun1: { id: 'harpoonGun1', weapon: 'harpoon', tier: 1, name: 'Harpoon gun I', die: 10, missOn: 1, critFrom: 10, critMultiplier: 2, range: 150, reload: 3, role: 'All-round' },
  deckCrossbow: { id: 'deckCrossbow', weapon: 'harpoon', tier: 1, name: 'Deck crossbow', die: 6, missOn: 1, critFrom: 6, critMultiplier: 1.5, range: 120, reload: 1.5, role: 'Fast and steady, short reach' },
  harpoonGun2: { id: 'harpoonGun2', weapon: 'harpoon', tier: 2, name: 'Harpoon gun II', die: 14, missOn: 1, critFrom: 14, critMultiplier: 2, range: 150, reload: 3, role: 'All-round' },
  whalingGun: { id: 'whalingGun', weapon: 'harpoon', tier: 2, name: 'Whaling gun', die: 20, missOn: 4, critFrom: 20, critMultiplier: 3, range: 140, reload: 3.6, role: 'Brawler: misses on 1–4, crits ×3' },
  harpoonGun3: { id: 'harpoonGun3', weapon: 'harpoon', tier: 3, name: 'Harpoon gun III', die: 18, missOn: 1, critFrom: 18, critMultiplier: 2, range: 150, reload: 3, role: 'All-round' },
  ballista: { id: 'ballista', weapon: 'harpoon', tier: 3, name: 'Ballista', die: 12, missOn: 1, critFrom: 10, critMultiplier: 2, range: 220, reload: 3, role: 'Long reach, crits on 10–12' },
  barbedLauncher: { id: 'barbedLauncher', weapon: 'harpoon', tier: 4, name: 'Barbed launcher', die: 24, missOn: 1, critFrom: 24, critMultiplier: 2, range: 160, reload: 3.2, role: 'Heavy all-round' },
  twinLauncher: { id: 'twinLauncher', weapon: 'harpoon', tier: 4, name: 'Twin launcher', die: 12, missOn: 1, critFrom: 12, critMultiplier: 2, range: 150, reload: 1.8, role: 'Fast, light hits' },
  leviathanLance: { id: 'leviathanLance', weapon: 'harpoon', tier: 5, name: 'Leviathan lance', die: 30, missOn: 2, critFrom: 30, critMultiplier: 2, range: 160, reload: 3.4, role: 'Heavy, misses on 1–2' },
  krakenBane: { id: 'krakenBane', weapon: 'harpoon', tier: 6, name: 'Kraken bane', die: 36, missOn: 2, critFrom: 35, critMultiplier: 2, range: 180, reload: 3.6, role: 'Heaviest, crits on 35–36' },
};

export type AmmoId =
  | 'ball1'
  | 'chainShot'
  | 'ball2'
  | 'ball3'
  | 'heatedShot'
  | 'explosiveShell'
  | 'royalShot'
  | 'harpoon1'
  | 'barbedHarpoon'
  | 'harpoon2'
  | 'harpoon3'
  | 'poisonHarpoon'
  | 'explosiveHarpoon'
  | 'leviathanHarpoon';

/** Cannonballs and harpoons: each gun that fires uses one, and adds its bonus to its roll */
export interface Ammo {
  readonly id: AmmoId;
  readonly weapon: WeaponId;
  /** The ship tier it is made for, like a gun's */
  readonly tier: number;
  /** Shown to players */
  readonly name: string;
  /** Added to every gun's roll, except a miss */
  readonly bonus: number;
}

// From the balance table too. The special shots' effects (chain shot slowing a ship, heated shot setting it on fire…)
// are ideas for later: for now only their bonus counts
// prettier-ignore
export const AMMO: Readonly<Record<AmmoId, Ammo>> = {
  ball1: { id: 'ball1', weapon: 'cannon', tier: 1, name: 'Cannonball I', bonus: 1 },
  chainShot: { id: 'chainShot', weapon: 'cannon', tier: 2, name: 'Chain shot', bonus: 2 },
  ball2: { id: 'ball2', weapon: 'cannon', tier: 2, name: 'Cannonball II', bonus: 3 },
  ball3: { id: 'ball3', weapon: 'cannon', tier: 3, name: 'Cannonball III', bonus: 6 },
  heatedShot: { id: 'heatedShot', weapon: 'cannon', tier: 4, name: 'Heated shot', bonus: 9 },
  explosiveShell: { id: 'explosiveShell', weapon: 'cannon', tier: 5, name: 'Explosive shell', bonus: 12 },
  royalShot: { id: 'royalShot', weapon: 'cannon', tier: 6, name: 'Royal shot', bonus: 16 },
  harpoon1: { id: 'harpoon1', weapon: 'harpoon', tier: 1, name: 'Harpoon I', bonus: 1 },
  barbedHarpoon: { id: 'barbedHarpoon', weapon: 'harpoon', tier: 2, name: 'Barbed harpoon', bonus: 2 },
  harpoon2: { id: 'harpoon2', weapon: 'harpoon', tier: 2, name: 'Harpoon II', bonus: 3 },
  harpoon3: { id: 'harpoon3', weapon: 'harpoon', tier: 3, name: 'Harpoon III', bonus: 6 },
  poisonHarpoon: { id: 'poisonHarpoon', weapon: 'harpoon', tier: 4, name: 'Poisoned harpoon', bonus: 9 },
  explosiveHarpoon: { id: 'explosiveHarpoon', weapon: 'harpoon', tier: 5, name: 'Explosive harpoon', bonus: 12 },
  leviathanHarpoon: { id: 'leviathanHarpoon', weapon: 'harpoon', tier: 6, name: 'Leviathan harpoon', bonus: 16 },
};

/** Each weapon's guns and ammo, by tier */
export const GUN_IDS: Readonly<Record<WeaponId, readonly GunId[]>> = {
  cannon: [
    'cannon1',
    'swivelGun',
    'cannon2',
    'carronade',
    'longNine',
    'cannon3',
    'pounder24',
    'culverin',
    'pounder32',
    'pounder42',
  ],
  harpoon: [
    'harpoonGun1',
    'deckCrossbow',
    'harpoonGun2',
    'whalingGun',
    'harpoonGun3',
    'ballista',
    'barbedLauncher',
    'twinLauncher',
    'leviathanLance',
    'krakenBane',
  ],
};
export const AMMO_IDS: Readonly<Record<WeaponId, readonly AmmoId[]>> = {
  cannon: ['ball1', 'chainShot', 'ball2', 'ball3', 'heatedShot', 'explosiveShell', 'royalShot'],
  harpoon: [
    'harpoon1',
    'barbedHarpoon',
    'harpoon2',
    'harpoon3',
    'poisonHarpoon',
    'explosiveHarpoon',
    'leviathanHarpoon',
  ],
};

/** What a new ship carries. Later bought and looted; for now the loadout window adds more */
export const STARTING_AMMO: Readonly<Record<AmmoId, number>> = {
  ball1: 120,
  chainShot: 0,
  ball2: 30,
  ball3: 10,
  heatedShot: 0,
  explosiveShell: 0,
  royalShot: 0,
  harpoon1: 80,
  barbedHarpoon: 0,
  harpoon2: 20,
  harpoon3: 6,
  poisonHarpoon: 0,
  explosiveHarpoon: 0,
  leviathanHarpoon: 0,
};

/**
 * A sea monster's jaws: a die like a gun's with a bonus of their own, no ammo. They bite whatever comes within reach,
 * doing full damage to ships and creatures alike
 */
export interface Bite extends DamageDie {
  readonly bonus: number;
  /** World units from the monster's head (its hull's bow) to its victim's hull, at most */
  readonly reach: number;
  /** Seconds between two bites */
  readonly reload: number;
}

/** What one roll does, before the weapon's share for the target: a miss, a hit, or a critical hit */
export function rollDamage(roll: number, die: DamageDie, bonus: number) {
  if (roll <= die.missOn) return 0;
  if (roll >= die.critFrom) return die.critMultiplier * die.die + bonus;
  return roll + bonus;
}

/** Average damage of one roll: every face of the die once, divided by their number. For the loadout and the bots */
export function averageDamage(die: DamageDie, bonus: number) {
  let sum = 0;
  for (let roll = 1; roll <= die.die; roll++) sum += rollDamage(roll, die, bonus);
  return sum / die.die;
}

/** One die of a volley: the face it came up on, and what that did before the weapon's share for the target */
export interface DieRoll {
  readonly roll: number;
  /** 0 for a miss */
  readonly damage: number;
}

/** A volley's damage, decided when it is fired and done when it lands */
export interface VolleyRoll {
  /** Hit points it takes away: every die's damage, times the weapon's share for the target, rounded */
  readonly damage: number;
  /** How many dice rolled a critical hit and how many a miss */
  readonly crits: number;
  readonly misses: number;
  /** Every die, in the order given: for the combat log */
  readonly rolls: readonly DieRoll[];
}

/**
 * Rolls every die (a gun that fires, or a monster's jaws), adds them up with the bonus and scales the sum by `share`:
 * what this weapon does to this kind of target. One random number and one small record per die, so a broadside of
 * fifty guns of mixed kinds costs next to nothing
 */
export function rollVolley(dice: readonly DamageDie[], bonus: number, share: number, random: () => number): VolleyRoll {
  let sum = 0;
  let crits = 0;
  let misses = 0;
  const rolls: DieRoll[] = [];
  for (const die of dice) {
    const roll = 1 + Math.floor(random() * die.die);
    if (roll <= die.missOn) misses++;
    else if (roll >= die.critFrom) crits++;
    const damage = rollDamage(roll, die, bonus);
    sum += damage;
    rolls.push({ roll, damage });
  }
  return { damage: Math.round(sum * share), crits, misses, rolls };
}
