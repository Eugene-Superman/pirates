import type { Player } from '../economy/player';
import type { ItemId } from './items';

/**
 * The skill bar's quick slots, keys 1…0: the items a player keeps at hand, put there from their hold. Using one is to
 * come (docs/items.md): for now a slot only shows its item
 */
export const QUICK_SLOTS = 10;

/** No item in any slot: a new player's bar */
export function emptyQuickSlots(): (ItemId | null)[] {
  return Array.from({ length: QUICK_SLOTS }, () => null);
}

function isSlot(slot: number) {
  return Number.isInteger(slot) && slot >= 0 && slot < QUICK_SLOTS;
}

/**
 * Puts an item of the player's hold in a quick slot, or empties the slot (null), anywhere. An item is in one slot at
 * most: one on the bar already moves there, its slot left empty. The item put out of the slot stays in the hold, as
 * every item does. False if the slot isn't one or the player has none of the item
 */
export function setQuickSlot(player: Player, slot: number, item: ItemId | null) {
  if (!isSlot(slot)) return false;
  if (item !== null && (player.items[item] ?? 0) <= 0) return false;
  const was = item === null ? -1 : player.quickSlots.indexOf(item);
  if (was >= 0) player.quickSlots[was] = null;
  player.quickSlots[slot] = item;
  return true;
}

/** Moves an item from one quick slot to another, the two swapping. False if either isn't a slot or both are the same */
export function swapQuickSlots(player: Player, from: number, to: number) {
  if (!isSlot(from) || !isSlot(to) || from === to) return false;
  const slots = player.quickSlots;
  [slots[from], slots[to]] = [slots[to], slots[from]];
  return true;
}
