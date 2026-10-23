import type { WeaponId } from './weapons';

export type GunId = 'cannon1' | 'cannon2' | 'cannon3' | 'harpoonGun1' | 'harpoonGun2' | 'harpoonGun3';

/**
 * A gun of one level: a cannon or a harpoon launcher, fitted into one of a ship's slots for its weapon. Each shot it
 * rolls 1…die, like a die in D&D, and adds its ammo's bonus (see rollVolley)
 */
export interface Gun {
  readonly id: GunId;
  readonly weapon: WeaponId;
  readonly level: number;
  /** Shown to players */
  readonly name: string;
  /** Sides of its damage die: a roll of 1…die */
  readonly die: number;
}

export const GUNS: Readonly<Record<GunId, Gun>> = {
  cannon1: { id: 'cannon1', weapon: 'cannon', level: 1, name: 'Cannon I', die: 10 },
  cannon2: { id: 'cannon2', weapon: 'cannon', level: 2, name: 'Cannon II', die: 14 },
  cannon3: { id: 'cannon3', weapon: 'cannon', level: 3, name: 'Cannon III', die: 18 },
  harpoonGun1: { id: 'harpoonGun1', weapon: 'harpoon', level: 1, name: 'Harpoon gun I', die: 10 },
  harpoonGun2: { id: 'harpoonGun2', weapon: 'harpoon', level: 2, name: 'Harpoon gun II', die: 14 },
  harpoonGun3: { id: 'harpoonGun3', weapon: 'harpoon', level: 3, name: 'Harpoon gun III', die: 18 },
};

export type AmmoId = 'ball1' | 'ball2' | 'ball3' | 'harpoon1' | 'harpoon2' | 'harpoon3';

/** Cannonballs and harpoons, by level: each gun that fires uses one, and adds its bonus to its roll */
export interface Ammo {
  readonly id: AmmoId;
  readonly weapon: WeaponId;
  readonly level: number;
  /** Shown to players */
  readonly name: string;
  /** Added to every gun's roll, except a miss */
  readonly bonus: number;
}

export const AMMO: Readonly<Record<AmmoId, Ammo>> = {
  ball1: { id: 'ball1', weapon: 'cannon', level: 1, name: 'Cannonball I', bonus: 1 },
  ball2: { id: 'ball2', weapon: 'cannon', level: 2, name: 'Cannonball II', bonus: 3 },
  ball3: { id: 'ball3', weapon: 'cannon', level: 3, name: 'Cannonball III', bonus: 6 },
  harpoon1: { id: 'harpoon1', weapon: 'harpoon', level: 1, name: 'Harpoon I', bonus: 1 },
  harpoon2: { id: 'harpoon2', weapon: 'harpoon', level: 2, name: 'Harpoon II', bonus: 3 },
  harpoon3: { id: 'harpoon3', weapon: 'harpoon', level: 3, name: 'Harpoon III', bonus: 6 },
};

/** Each weapon's guns and ammo, by level */
export const GUN_IDS: Readonly<Record<WeaponId, readonly GunId[]>> = {
  cannon: ['cannon1', 'cannon2', 'cannon3'],
  harpoon: ['harpoonGun1', 'harpoonGun2', 'harpoonGun3'],
};
export const AMMO_IDS: Readonly<Record<WeaponId, readonly AmmoId[]>> = {
  cannon: ['ball1', 'ball2', 'ball3'],
  harpoon: ['harpoon1', 'harpoon2', 'harpoon3'],
};

/** What a new ship carries. Later bought; for now the loadout menu adds more */
export const STARTING_AMMO: Readonly<Record<AmmoId, number>> = {
  ball1: 60,
  ball2: 20,
  ball3: 10,
  harpoon1: 40,
  harpoon2: 15,
  harpoon3: 6,
};

/** What one gun's roll does, before the weapon's share for the target: a miss, a hit, or a critical hit */
export function gunDamage(roll: number, die: number, bonus: number) {
  if (roll <= 1) return 0;
  if (roll >= die) return die * 2 + bonus;
  return roll + bonus;
}

/** A volley's damage, decided when it is fired and done when it lands */
export interface VolleyRoll {
  /** Hit points it takes away: every gun's damage, times the weapon's share for the target, rounded */
  readonly damage: number;
  /** How many guns rolled their die's top (twice the top plus the bonus) and how many rolled a 1 (nothing) */
  readonly crits: number;
  readonly misses: number;
}

/**
 * Rolls every gun that fires, each 1…die (see gunDamage), adds them up and scales the sum by `share`: what this weapon
 * does to this kind of target. One random number per gun and no allocation but the result, so a broadside of fifty
 * guns of mixed levels costs next to nothing
 */
export function rollVolley(
  guns: readonly Gun[],
  count: number,
  bonus: number,
  share: number,
  random: () => number,
): VolleyRoll {
  let sum = 0;
  let crits = 0;
  let misses = 0;
  for (let i = 0; i < count; i++) {
    const { die } = guns[i];
    const roll = 1 + Math.floor(random() * die);
    if (roll === 1) misses++;
    else if (roll === die) crits++;
    sum += gunDamage(roll, die, bonus);
  }
  return { damage: Math.round(sum * share), crits, misses };
}
