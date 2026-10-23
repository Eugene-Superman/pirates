export type WeaponId = 'cannon' | 'harpoon';

export interface Weapon {
  readonly id: WeaponId;
  /** Shown to players */
  readonly name: string;
  /** Farthest a shot lands from the ship's centre, world units */
  readonly range: number;
  /** Flight speed over the water, world units per second */
  readonly speed: number;
  /** Top of the flight arc above the straight line, as a share of the flight's length */
  readonly arc: number;
  /** Seconds before the weapon can fire again */
  readonly reload: number;
}

export const WEAPONS: Readonly<Record<WeaponId, Weapon>> = {
  // Cannonballs fly far in a high arc
  cannon: { id: 'cannon', name: 'Cannons', range: 260, speed: 240, arc: 0.2, reload: 2 },
  // A harpoon (for sea monsters) flies flat and fast but reaches less far
  harpoon: { id: 'harpoon', name: 'Harpoon', range: 150, speed: 320, arc: 0.05, reload: 3 },
};

export const WEAPON_IDS: readonly WeaponId[] = ['cannon', 'harpoon'];
