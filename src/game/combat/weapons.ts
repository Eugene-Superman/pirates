export type WeaponId = 'cannon' | 'harpoon';

/** What a target is: a creature (sea monsters, fish) or an object (ships, forts). Each weapon is made for one */
export type TargetNature = 'creature' | 'object';

/**
 * A kind of gun: cannons or harpoon launchers. How far each gun reaches and how fast it reloads is its own (`GUNS` in
 * arsenal.ts); what they share is how their shots fly and what they are made for
 */
export interface Weapon {
  readonly id: WeaponId;
  /** Shown to players */
  readonly name: string;
  /** Flight speed over the water, world units per second */
  readonly speed: number;
  /** Top of the flight arc above the straight line, as a share of the flight's length */
  readonly arc: number;
  /** What it is made for: it does full damage to these, OFF_TARGET_SHARE of it to the rest */
  readonly against: TargetNature;
}

/** Share of the damage a weapon does to what it isn't made for: a cannonball to a sea monster, a harpoon to a hull */
export const OFF_TARGET_SHARE = 0.3;

export const WEAPONS: Readonly<Record<WeaponId, Weapon>> = {
  // Cannonballs fly in a high arc, and smash hulls
  cannon: { id: 'cannon', name: 'Cannons', speed: 240, arc: 0.2, against: 'object' },
  // Harpoons (for sea monsters) fly flat and fast
  harpoon: { id: 'harpoon', name: 'Harpoons', speed: 320, arc: 0.05, against: 'creature' },
};

export const WEAPON_IDS: readonly WeaponId[] = ['cannon', 'harpoon'];

/** What share of its damage a weapon does to a target of this nature */
export function damageShare(weapon: WeaponId, nature: TargetNature) {
  return WEAPONS[weapon].against === nature ? 1 : OFF_TARGET_SHARE;
}

/**
 * Why a ship told to attack isn't firing: no guns of the selected weapon fitted, none of its ammo left, the ammo
 * loaded not at hand (a player's ship fires only what is on its bar, not straight from the hold), the target hidden in
 * the fog of war, or beyond every fitted gun's range. The client tells the player
 */
export type HoldReason = 'noGuns' | 'noAmmo' | 'notAtHand' | 'sight' | 'range';
