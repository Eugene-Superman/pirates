import { ITEMS, QUICK_SLOTS, type ItemId, type Player } from '../../game';
import type { TooltipText } from './Tooltip';
import { tierColor, whole } from './ui';
import { t } from '../i18n/i18n';

/**
 * Doubloons up to which an item is of each grade, the cheapest first; the dearest beyond them all are the last grade.
 * A grade is shown in a tier's colour (its slot's glow, its card's edge): white, green, blue, purple, orange, gold
 */
const GRADES = [2, 5, 10, 20, 30] as const;

/** The keys of the skill bar's quick slots, 1…0, as painted on their frame */
export const QUICK_KEYS: readonly string[] = Array.from({ length: QUICK_SLOTS }, (_, i) => `${(i + 1) % 10}`);

/** An item's grade, 1 the cheapest to 6 the dearest, by its price */
export function itemGrade(id: ItemId) {
  const price = ITEMS[id].price;
  const grade = GRADES.findIndex((top) => price <= top);
  return (grade < 0 ? GRADES.length : grade) + 1;
}

/** An item's grade's colour */
export function itemColor(id: ItemId) {
  return tierColor(itemGrade(id));
}

/** What an item is to do, its figures in it */
export function itemText(id: ItemId) {
  const { text, figures } = ITEMS[id];
  return t(text, figures);
}

/** The quick slot an item is in, by its key, or that it isn't on the bar */
export function quickSlotName(player: Player, id: ItemId) {
  const slot = player.quickSlots.indexOf(id);
  return slot < 0 ? t('Not on the bar') : t('Quick slot {key}', { key: QUICK_KEYS[slot] });
}

/**
 * The tooltip over an item, in the hold or on the skill bar: its name in its grade's colour, what it is to do, how many
 * are in the hold, that it does nothing yet, and `how` (what dragging or clicking it does where it is)
 */
export function itemHint(player: Player, id: ItemId, how: readonly string[]): TooltipText {
  return {
    title: t(ITEMS[id].name),
    color: itemColor(id),
    lines: [
      itemText(id),
      t('{n} in the hold', { n: whole(player.items[id] ?? 0) }),
      t('Not in the game yet: it will work with an update'),
      ...how,
    ],
  };
}
