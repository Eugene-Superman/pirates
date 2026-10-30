import type { AmmoId, GunId } from '../combat/arsenal';
import type { ItemId } from '../items/items';
import type { OutfitId } from '../ships/outfit';
import type { Ship } from '../ships/Ship';
import type { Player } from './player';

/**
 * Something given as a reward besides gold and experience: a quest's the first time it is turned in (economy/quests.ts),
 * a feat's rung's once claimed (account/feats.ts).
 * Guns, outfit and items go into the player's hold, ammo into the ship's, doubloons into the purse
 */
export type Prize =
  | { readonly kind: 'gun'; readonly id: GunId; readonly count: number }
  | { readonly kind: 'outfit'; readonly id: OutfitId; readonly count: number }
  | { readonly kind: 'ammo'; readonly id: AmmoId; readonly count: number }
  | { readonly kind: 'item'; readonly id: ItemId; readonly count: number }
  | { readonly kind: 'doubloons'; readonly count: number };

/** Gives a player their prizes: ammo to the ship they sail, as ammo bought goes, the rest theirs */
export function givePrizes(player: Player, ship: Ship | undefined, prizes: readonly Prize[]) {
  for (const prize of prizes) {
    switch (prize.kind) {
      case 'gun':
        player.hold[prize.id] = (player.hold[prize.id] ?? 0) + prize.count;
        break;
      case 'outfit':
        player.outfits[prize.id] = (player.outfits[prize.id] ?? 0) + prize.count;
        break;
      case 'ammo':
        ship?.addAmmo(prize.id, prize.count);
        break;
      case 'item':
        player.items[prize.id] = (player.items[prize.id] ?? 0) + prize.count;
        break;
      case 'doubloons':
        player.doubloons += prize.count;
        break;
    }
  }
}
