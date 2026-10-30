import type { Container, Texture } from 'pixi.js';
import { AMMO, GUNS, ITEMS, OUTFITS, type Feat, type Prize, type RewardBonus } from '../../game';
import { AMMO_ICONS, GUN_ICONS, ITEM_ICONS, OUTFIT_ICONS } from './iconAtlas';
import { itemColor } from './itemLook';
import { THEME, iconSlot } from './theme';
import { doubloon, text, tierColor, whole } from './ui';
import { t } from '../i18n/i18n';

const DOUBLOON_GLOW = 0xffcf3f; // a doubloons prize's slot, the doubloon's gold
/** A feat's rungs by number, the first first */
const RUNG_NUMERALS: readonly string[] = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** A share more, as a reward's tooltip shows it: +12.5% */
function signedPercent(share: number) {
  return `+${Math.round(share * 1000) / 10}%`;
}

/**
 * What adds to a reward, as the tooltips over one list it (the tavern's quests, the bestiary's spoils): the passives of
 * the captain's mastery and the talents of the ship, each under its heading, then all of them together (`share`)
 */
export function bonusLines(bonuses: readonly RewardBonus[], share: number): string[] {
  const lines: string[] = [];
  for (const source of ['captain', 'talent'] as const) {
    const given = bonuses.filter((bonus) => bonus.source === source);
    if (given.length === 0) continue;
    lines.push(source === 'captain' ? t("Captain's mastery") : t("Ship's talents"));
    for (const { name, share: part } of given) lines.push(`   ${t(name)}  ${signedPercent(part)}`);
  }
  lines.push(
    bonuses.length > 0
      ? t('In all: {share}', { share: signedPercent(share) })
      : t("No bonuses yet: the captain's mastery and the ship's talents add to it"),
  );
  return lines;
}

/** A rung of a feat's ladder, as the player reads it: Monster Slayer II. `rung` 0 for the first */
export function featRung(feat: Feat, rung: number) {
  return `${t(feat.name)} ${RUNG_NUMERALS[rung] ?? rung + 1}`;
}

/** A prize's name, as the player reads it */
function prizeName(prize: Exclude<Prize, { kind: 'doubloons' }>) {
  if (prize.kind === 'gun') return t(GUNS[prize.id].name);
  if (prize.kind === 'outfit') return t(OUTFITS[prize.id].name);
  if (prize.kind === 'ammo') return t(AMMO[prize.id].name);
  return t(ITEMS[prize.id].name);
}

/** A prize with how many: Spyglass, 2 × Fishing nets, 5 doubloons */
export function prizeLine(prize: Prize) {
  if (prize.kind === 'doubloons') return t('{n} doubloon|{n} doubloons', { n: prize.count });
  const name = prizeName(prize);
  return prize.count === 1 ? name : `${prize.count} × ${name}`;
}

/**
 * A prize's glow in its slot (a quest's card, a feat's reward): a gun's, an ammo's or a piece of outfit's tier, an
 * item's grade, the doubloon's gold
 */
export function prizeColor(prize: Prize) {
  if (prize.kind === 'gun') return tierColor(GUNS[prize.id].tier);
  if (prize.kind === 'outfit') return tierColor(OUTFITS[prize.id].tier);
  if (prize.kind === 'ammo') return tierColor(AMMO[prize.id].tier);
  if (prize.kind === 'item') return itemColor(prize.id);
  return DOUBLOON_GLOW;
}

/** A prize's icon, null while its atlas loads, and for doubloons, whose coin is drawn */
export function prizeIcon(prize: Prize) {
  if (prize.kind === 'gun') return GUN_ICONS.get(prize.id);
  if (prize.kind === 'outfit') return OUTFIT_ICONS.get(prize.id);
  if (prize.kind === 'ammo') return AMMO_ICONS.get(prize.id);
  if (prize.kind === 'item') return ITEM_ICONS.get(prize.id);
  return null;
}

/** A prize's slot, its icon put in once its atlas has loaded (fillPrizeSlots) */
export interface PrizeSlot {
  readonly prize: Prize;
  readonly show: (texture: Texture | null) => void;
  shown: boolean;
}

/** Puts in the icons of the slots whose atlases have loaded: every frame while they show */
export function fillPrizeSlots(slots: readonly PrizeSlot[]) {
  for (const slot of slots) {
    if (slot.shown) continue;
    const icon = prizeIcon(slot.prize);
    if (!icon) continue;
    slot.show(icon);
    slot.shown = true;
  }
}

/**
 * How a row of prizes is laid, in pixels: a slot's size, the gap after a prize and before its count, the count's font
 * size, and the doubloon's coin, its radius and whether it sits in a slot as the rest do
 */
export interface PrizeRowLook {
  readonly size: number;
  readonly gap: number;
  readonly count: number;
  readonly font: number;
  readonly coin: number;
  readonly coinInSlot: boolean;
}

/**
 * Lays a reward's prizes in a row into `into`, from `x`, round the height `middle` (a quest's card, a feat's row): each
 * in a slot glowing in its colour with how many after it, the doubloons by their coin. Returns the slots to fill and
 * where the row ends
 */
export function layPrizes(into: Container, prizes: readonly Prize[], x: number, middle: number, look: PrizeRowLook) {
  const slots: PrizeSlot[] = [];
  let end = x;
  for (const prize of prizes) {
    const doubloons = prize.kind === 'doubloons';
    if (!doubloons || look.coinInSlot) {
      const slot = iconSlot(look.size, prizeColor(prize), '', false);
      slot.container.position.set(x, middle - look.size / 2);
      into.addChild(slot.container);
      if (!doubloons) slots.push({ prize, show: slot.show, shown: false });
    }
    if (doubloons) {
      const coin = doubloon(look.coin);
      coin.position.set(x + (look.coinInSlot ? look.size / 2 : look.coin), middle);
      into.addChild(coin);
    }
    x += doubloons && !look.coinInSlot ? look.coin * 2 : look.size;
    if (doubloons || prize.count > 1) {
      const many = doubloons ? whole(prize.count) : `×${prize.count}`;
      const label = text(many, look.font, THEME.text, { fontWeight: 'bold' });
      label.anchor.set(0, 0.5);
      label.position.set(x + look.count, middle);
      into.addChild(label);
      x += look.count + label.width;
    }
    end = x;
    x += look.gap;
  }
  return { slots, end };
}
