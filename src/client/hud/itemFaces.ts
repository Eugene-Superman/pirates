import type { Texture } from 'pixi.js';
import {
  AMMO,
  AMMO_PACK,
  CURRENCIES,
  GUNS,
  ITEMS,
  ITEM_CATEGORIES,
  OUTFITS,
  OUTFIT_STATS,
  SHIP_LINES,
  SHIP_SOURCES,
  STARTER_SHIP,
  WEAPON_IDS,
  ZONES,
  ammoPackPrice,
  ammoPrice,
  ammoSalePrice,
  averageDamage,
  captainsPath,
  classFigures,
  fitsSea,
  gunPrice,
  gunSalePrice,
  isGoalShip,
  isLadderShip,
  itemPrice,
  laidUpLevel,
  lineShip,
  outfitPrice,
  termsMet,
  tierMastered,
  tierTerms,
  type AmmoId,
  type GameState,
  type GunId,
  type ItemId,
  type LineShipId,
  type OutfitBonus,
  type OutfitId,
  type OutfitSlot,
  type OutfitStat,
  type Ship,
  type ShipClassId,
  type ShipFigures,
  type ShipStats,
  type WeaponId,
} from '../../game';
import type { Question } from './ConfirmDialog';
import { AMMO_LORE, GUN_LORE } from './arsenalLore';
import { AMMO_ICONS, GUN_ICONS, ITEM_ICONS, OUTFIT_ICONS, SHIP_ICONS } from './iconAtlas';
import { itemGrade, itemText, quickSlotName } from './itemLook';
import { OUTFIT_LORE } from './outfitLore';
import { SHIP_LORE } from './shipLore';
import { whole, type CoinId } from './ui';
import { t } from '../i18n/i18n';

export const KNOT = 10; // world units per second: the HUD shows speed in knots, a tenth of the game's units

/**
 * Something the port sells: a gun, a pack of ammo, a piece of outfit, a ship (built, or planned for later), or an item
 * of the galleon's, for doubloons
 */
export type ShopItem =
  | { readonly gun: GunId }
  | { readonly ammo: AmmoId }
  | { readonly outfit: OutfitId }
  | { readonly ship: LineShipId }
  | { readonly item: ItemId };

/** What buying and fitting do: game methods for the player of this client, each saying whether it worked */
export interface ShopActions {
  buyGun: (gun: GunId) => boolean;
  /** Buys `count` of an item on the Golden Galleon in port, for doubloons */
  buyItem: (id: ItemId, count?: number) => boolean;
  /** Buys shots of an ammo: a pack's, or `count` */
  buyAmmo: (ammo: AmmoId, count?: number) => boolean;
  /** Sells a gun from the hold, or a pack of an ammo, back to the arsenal */
  sellGun: (gun: GunId) => boolean;
  sellAmmo: (ammo: AmmoId, count?: number) => boolean;
  buyOutfit: (id: OutfitId) => boolean;
  /** Fits a piece of outfit from the hold into its slot, or takes the slot's piece off (null) */
  fitOutfit: (slot: OutfitSlot, id: OutfitId | null) => boolean;
  /**
   * Buys a ship the shipyard offers and takes its helm; `unload`: the guns and outfit of the ship sailed now go into the
   * hold first, for the new one
   */
  buyShip: (id: ShipClassId, unload?: boolean) => boolean;
  /** Takes the helm of a ship laid up in port (its place in the player's fleet) */
  takeHelm: (index: number) => boolean;
}

/** A figure in an item's window: its label (English: the window translates it), and what it says, set once or read
 * from the game every frame */
export interface Figure {
  readonly label: string;
  readonly value: string | ((state: GameState) => string);
  readonly gold?: boolean;
  /** An amount of gold or doubloons: its coin before it stands for the word */
  readonly coin?: CoinId | null;
}

/** How what pressing did reads: done, refused, or neither (a piece taken off) */
export type Tone = 'good' | 'bad' | 'plain';

/**
 * What a card and the info window say of an item, and what their button does, worked out from the game's rules
 * (`averageDamage`, the ship's figures with a piece fitted): one place for both
 */
export interface ItemFace {
  readonly name: string;
  /** Its tier, or for an item of the galleon's its grade: the colour of its slot's glow and its card's edge */
  readonly tier: number;
  /** What the chip in its slot's corner says: its tier (`T2`) unless given; '' for no chip (an item's) */
  readonly chip?: string;
  /** null until the icons have loaded */
  readonly icon: Texture | null;
  /** Whether its slot shows its tier in big letters without a picture (its icon on its way); a ship's slot stays empty
   * until it has one */
  readonly letters: boolean;
  /** What it is, under the info window's title */
  readonly kind: string;
  /** What it is for, under the card's name */
  readonly about: string;
  /** Whether `about` takes two lines on the card, in place of the figures' line (an item's: what it does is all) */
  readonly wrap?: boolean;
  /** Its figures in a line, on the card */
  readonly stats: string;
  readonly price: string;
  /** The currency `price` is in, when it is gold or doubloons: its coin before it stands for the word */
  readonly coin: CoinId | null;
  readonly figures: readonly Figure[];
  readonly lore: string;
  /** The heading over `lore` in the info window (English: the window translates it); its legend unless given */
  readonly loreTitle?: string;
  /** How many the player has, or that it is fitted; empty if none */
  owned(state: GameState): string;
  /** What the info window says beside its button, at more length than the card; `owned` when there is no more to say */
  note?(state: GameState): string;
  /** Whether the ship has it fitted or loaded: its card is outlined */
  inUse(state: GameState): boolean;
  /** Its button: what it says on a card and in the info window, and whether it can be pressed */
  button(state: GameState): { readonly short: string; readonly long: string; readonly enabled: boolean };
  /** Presses it: what happened, or null if nothing did. `yes`: the answer picked, when `confirm` offers a choice */
  press(state: GameState, yes?: boolean): { readonly message: string; readonly tone: Tone } | null;
  /** What to ask before pressing it: the first ship bought after the starter sloop asks about the sloop's gear */
  confirm?(state: GameState): Question | null;
  /** Selling it back, for what the arsenal buys back (guns, ammo): a second button, as `button` and `press` */
  readonly sell?: ItemButton;
  /** What the arsenal pays for it, in gold: on its card under the price, the coin before it */
  readonly resale?: string;
  /** How many its buttons buy and sell, for what is dealt in by count (ammo): the info window picks it */
  readonly amount?: Amount;
}

/** A count picked for an item's buttons */
export interface Amount {
  get(): number;
  /** Kept within what can be dealt in at once */
  set(count: number): void;
  /** The most the player can buy now: as many as their gold pays for, at least one */
  most(state: GameState): number;
}

/** A button of an item's: what it says on a card and in the info window, whether it can be pressed, and pressing it */
export interface ItemButton {
  button(state: GameState): { readonly short: string; readonly long: string; readonly enabled: boolean };
  /** `yes`: the answer picked, when `confirm` offers a choice of two (`Question.no`) */
  press(state: GameState, yes?: boolean): { readonly message: string; readonly tone: Tone } | null;
  /** What to ask before pressing it does anything that can't be undone; null when it would only say why it can't */
  confirm?(state: GameState): Question | null;
}

const WEAPON_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannons', harpoon: 'Harpoon guns' };
/** A piece of outfit's kind, by its slot */
const SLOT_KINDS: Readonly<Record<OutfitSlot, string>> = {
  sails: 'Tier {tier} sails',
  hull: 'Tier {tier} hull',
  rudder: 'Tier {tier} rudder',
  lookout: 'Tier {tier} lookout',
};
/** A figure's name in an info window */
const STAT_LABELS: Readonly<Record<OutfitStat, string>> = {
  speed: 'Top speed',
  holedSpeed: 'Speed when holed',
  acceleration: 'Acceleration',
  braking: 'Braking',
  turn: 'Turning',
  hull: 'Hull',
  sight: 'Sight',
};
/** A figure's short name, on a card and in a line of them */
const STAT_SHORT: Readonly<Record<OutfitStat, string>> = {
  speed: 'speed',
  holedSpeed: 'holed',
  acceleration: 'acceleration',
  braking: 'braking',
  turn: 'turning',
  hull: 'hull',
  sight: 'sight',
};
// What a share of each figure is worth beside one of speed (as outfit.ts balances them): a piece's figures are listed
// by it, what it gives most first and what it costs last
const WORTH: Readonly<Record<OutfitStat, number>> = {
  speed: 1,
  holedSpeed: 0.15,
  acceleration: 0.3,
  braking: 0.15,
  turn: 0.6,
  hull: 0.7,
  sight: 0.6,
};
const NOT_ENOUGH = (): { message: string; tone: Tone } => ({ message: t('Not enough gold'), tone: 'bad' });

function percent(share: number) {
  return `${share > 0 ? '+' : '−'}${Math.round(Math.abs(share) * 100)}%`;
}

/** The figures a piece changes, what it gives most first and what it costs last */
function changed(bonus: OutfitBonus) {
  const worth = (stat: OutfitStat) => (bonus[stat] ?? 0) * WORTH[stat];
  const stats = OUTFIT_STATS.filter((stat) => bonus[stat]);
  stats.sort((a, b) => worth(b) - worth(a));
  return stats;
}

/** What a piece of outfit gives, in a few words: "+17% speed · +15% acceleration" */
function bonusText(bonus: OutfitBonus) {
  return changed(bonus)
    .map((stat) => `${percent(bonus[stat] ?? 0)} ${t(STAT_SHORT[stat])}`)
    .join(' · ');
}

/** Each of a ship's figures as the HUD shows it, in its units */
const FIGURES: Readonly<Record<OutfitStat, (stats: ShipStats) => string>> = {
  speed: (stats) => t('{speed} kn', { speed: (stats.maxSpeed / KNOT).toFixed(1) }),
  holedSpeed: (stats) => t('{speed} kn', { speed: (stats.minSpeed / KNOT).toFixed(1) }),
  acceleration: (stats) => t('{n} kn/s', { n: (stats.acceleration / KNOT).toFixed(1) }),
  braking: (stats) => t('{n} kn/s', { n: (stats.deceleration / KNOT).toFixed(1) }),
  turn: (stats) => t('{n}°/s', { n: Math.round((stats.turnSpeed * 180) / Math.PI) }),
  hull: (stats) => String(stats.maxHp),
  sight: (stats) => String(stats.viewRange),
};

/** What the guns of a weapon fitted to the ship hit for on average with an ammo's bonus, all together */
function volley(ship: Ship, weapon: WeaponId, bonus: number) {
  return ship.guns[weapon].reduce((sum, gun) => (gun ? sum + averageDamage(GUNS[gun], bonus) : sum), 0);
}

function gunFace(gun: GunId, actions: ShopActions): ItemFace {
  const g = GUNS[gun];
  const price = gunPrice(gun);
  const sale = gunSalePrice(gun);
  const name = t(g.name);
  const average = averageDamage(g, 0);
  const crits = g.critFrom < g.die ? `${g.critFrom}–${g.die}` : `${g.die}`;
  const kind = g.weapon === 'cannon' ? 'Tier {tier} cannon' : 'Tier {tier} harpoon gun';
  return {
    name,
    tier: g.tier,
    icon: GUN_ICONS.get(gun),
    letters: true,
    kind: `${t(kind, { tier: g.tier })}  ·  ${t(g.role)}`,
    about: t(g.role),
    stats: t('d{die} · reach {range} · {reload} s', { die: g.die, range: g.range, reload: g.reload }),
    price: whole(price),
    coin: 'gold',
    figures: [
      { label: 'Damage', value: `d${g.die}  (1–${g.die})` },
      { label: 'Misses on', value: g.missOn > 1 ? `1–${g.missOn}` : '1' },
      { label: 'Critical hit', value: t('on {faces}: {n}', { faces: crits, n: g.critMultiplier * g.die }) },
      { label: 'Average hit', value: average.toFixed(1) },
      { label: 'Damage a second', value: (average / g.reload).toFixed(1) },
      { label: 'Reach', value: String(g.range) },
      { label: 'Reload', value: t('{n} s', { n: g.reload }) },
      { label: 'Price', value: whole(price), gold: true, coin: 'gold' },
    ],
    lore: t(GUN_LORE[gun]),
    owned: ({ ship, player }) => {
      const fitted = WEAPON_IDS.reduce((n, w) => n + ship.guns[w].filter((one) => one === gun).length, 0);
      const hold = player.hold[gun] ?? 0;
      return fitted + hold > 0 ? t('fitted {fitted} · hold {hold}', { fitted, hold }) : '';
    },
    inUse: () => false,
    button: ({ player }) => ({
      short: t('Buy'),
      long: t('Buy: {n} gold', { n: price }),
      enabled: player.gold >= price,
    }),
    press: () =>
      actions.buyGun(gun)
        ? { message: t('{name} is in the hold: fit it in the loadout (L)', { name }), tone: 'good' }
        : NOT_ENOUGH(),
    // Only a gun in the hold: one fitted is taken off in the loadout first, so a player never sells their guns by a slip
    resale: t('Sells for {n}', { n: whole(sale) }),
    sell: {
      button: ({ player }) => ({
        short: t('Sell'),
        long: t('Sell: {n} gold', { n: sale }),
        enabled: (player.hold[gun] ?? 0) > 0,
      }),
      confirm: ({ player }) =>
        (player.hold[gun] ?? 0) > 0
          ? {
              title: t('Sell {name}?', { name }),
              text: t('The arsenal pays {n} gold for it.', { n: sale }),
              yes: t('Sell: {n} gold', { n: sale }),
            }
          : null,
      press: () =>
        actions.sellGun(gun)
          ? { message: t('{name} sold: +{n} gold', { name, n: sale }), tone: 'good' }
          : { message: t('Only guns in the hold are sold: take it off in the loadout (L)'), tone: 'bad' },
    },
  };
}

function ammoFace(ammo: AmmoId, actions: ShopActions): ItemFace {
  const { bonus, tier, weapon } = AMMO[ammo];
  const price = ammoPackPrice(ammo);
  const name = t(AMMO[ammo].name);
  const kind = t(weapon === 'cannon' ? 'Tier {tier} cannon ammo' : 'Tier {tier} harpoon ammo', { tier });
  const loaded = (ship: Ship) => ship.loaded[weapon] === ammo;
  // How many shots the buttons buy and sell: a pack on a card, any count picked in the info window
  let count = AMMO_PACK;
  return {
    name,
    tier,
    icon: AMMO_ICONS.get(ammo),
    letters: true,
    kind,
    about: kind,
    stats: t('+{n} to every hit', { n: bonus }),
    price: t('{n} for {pack}', { pack: AMMO_PACK, n: whole(price) }),
    coin: 'gold',
    figures: [
      { label: 'Bonus to every hit', value: `+${bonus}` },
      { label: 'Fired by', value: t(WEAPON_NAMES[weapon]) },
      {
        // The guns fitted, as they hit with it, and as they hit now
        label: 'Your volley',
        value: ({ ship }) => {
          if (!ship.guns[weapon].some((gun) => gun)) return t('No guns fitted');
          const next = volley(ship, weapon, bonus).toFixed(1);
          if (loaded(ship)) return next;
          return t('{next} (now {now})', {
            next,
            now: volley(ship, weapon, AMMO[ship.loaded[weapon]].bonus).toFixed(1),
          });
        },
      },
      { label: 'Loaded now', value: ({ ship }) => t(AMMO[ship.loaded[weapon]].name) },
      { label: 'Pack', value: t('{n} shot|{n} shots', { n: AMMO_PACK }) },
      { label: 'Price', value: whole(price), gold: true, coin: 'gold' },
    ],
    lore: t(AMMO_LORE[ammo]),
    owned: ({ ship }) => {
      const n = ship.ammo[ammo];
      return loaded(ship) ? t('{n} aboard · loaded', { n }) : t('{n} aboard', { n });
    },
    inUse: ({ ship }) => loaded(ship),
    amount: {
      get: () => count,
      set: (n) => (count = Math.max(Math.round(n), 1)),
      // As many as the gold pays for, a part of a coin rounded up on each
      most: ({ player }) => Math.max(Math.floor((player.gold * AMMO_PACK) / price), 1),
    },
    button: ({ player }) => ({
      short: t('Buy'),
      long: t('Buy {pack}: {n} gold', { pack: count, n: ammoPrice(ammo, count) }),
      enabled: player.gold >= ammoPrice(ammo, count),
    }),
    press: ({ ship }) => {
      if (!actions.buyAmmo(ammo, count)) return NOT_ENOUGH();
      const message = loaded(ship)
        ? `+${count} ${name}`
        : t('+{n} {name}: load it in the loadout (L)', { n: count, name });
      return { message, tone: 'good' };
    },
    resale: t('Sells {pack} for {n}', { pack: AMMO_PACK, n: whole(ammoSalePrice(ammo)) }),
    sell: {
      button: ({ ship }) => ({
        short: t('Sell'),
        // How many is on the row above, and in the question
        long: t('Sell: {n} gold', { n: ammoSalePrice(ammo, count) }),
        enabled: ship.ammo[ammo] >= count && ammoSalePrice(ammo, count) >= 1,
      }),
      confirm: ({ ship }) =>
        ship.ammo[ammo] >= count && ammoSalePrice(ammo, count) >= 1
          ? {
              title: t('Sell {name}?', { name: `${name} ×${count}` }),
              text: t('The arsenal pays {n} gold for {pack} shots. {left} left aboard.', {
                n: ammoSalePrice(ammo, count),
                pack: count,
                left: ship.ammo[ammo] - count,
              }),
              yes: t('Sell {pack}: {n} gold', { pack: count, n: ammoSalePrice(ammo, count) }),
            }
          : null,
      press: ({ ship }) => {
        const sale = ammoSalePrice(ammo, count);
        if (actions.sellAmmo(ammo, count)) {
          return { message: t('{name} sold: +{n} gold', { name: `${name} ×${count}`, n: sale }), tone: 'good' };
        }
        const why =
          ship.ammo[ammo] < count ? t('Fewer than {n} aboard', { n: count }) : t('Too few to fetch a gold coin');
        return { message: why, tone: 'bad' };
      },
    },
  };
}

function outfitFace(id: OutfitId, actions: ShopActions): ItemFace {
  const piece = OUTFITS[id];
  const { slot, tier, bonus } = piece;
  const price = outfitPrice(id);
  const name = t(piece.name);
  /** A figure the piece changes: by how much, and what the ship's becomes with it (and is now, if it isn't fitted) */
  const change = (stat: OutfitStat): Figure => ({
    label: STAT_LABELS[stat],
    value: ({ ship }) => {
      const share = percent(bonus[stat] ?? 0);
      const next = FIGURES[stat](ship.figuresWith(slot, id));
      if (ship.outfit[slot] === id) return `${share}  ·  ${next}`;
      const now = FIGURES[stat](ship.figuresWith(slot, ship.outfit[slot]));
      return `${share}  ·  ${t('{next} (now {now})', { next, now })}`;
    },
  });
  return {
    name,
    tier,
    icon: OUTFIT_ICONS.get(id),
    letters: true,
    kind: `${t(SLOT_KINDS[slot], { tier })}  ·  ${t(piece.role)}`,
    about: t(piece.role),
    stats: bonusText(bonus),
    price: whole(price),
    coin: 'gold',
    figures: [
      {
        label: 'Fitted now',
        value: ({ ship }) => {
          const fitted = ship.outfit[slot];
          return fitted ? t(OUTFITS[fitted].name) : t('Nothing');
        },
      },
      ...changed(bonus).map(change),
      { label: 'Price', value: whole(price), gold: true, coin: 'gold' },
    ],
    lore: t(OUTFIT_LORE[id]),
    owned: ({ ship, player }) => {
      const spares = player.outfits[id] ?? 0;
      return ship.outfit[slot] === id ? t('fitted') : spares > 0 ? t('{n} in the hold', { n: spares }) : '';
    },
    inUse: ({ ship }) => ship.outfit[slot] === id,
    button: ({ ship, player }) => {
      if (ship.outfit[slot] === id) return { short: t('Take off'), long: t('Take off'), enabled: true };
      if ((player.outfits[id] ?? 0) > 0) return { short: t('Fit'), long: t('Fit'), enabled: true };
      return { short: t('Buy'), long: t('Buy and fit: {n} gold', { n: price }), enabled: player.gold >= price };
    },
    // Takes it off if it is fitted, fits it from the hold, or buys it and fits it
    press: ({ ship, player }) => {
      if (ship.outfit[slot] === id) {
        return actions.fitOutfit(slot, null)
          ? { message: t('{name} taken off: it is in the hold', { name }), tone: 'plain' }
          : null;
      }
      if ((player.outfits[id] ?? 0) > 0) {
        return actions.fitOutfit(slot, id) ? { message: t('{name} fitted', { name }), tone: 'good' } : null;
      }
      if (actions.buyOutfit(id) && actions.fitOutfit(slot, id))
        return { message: t('{name} bought and fitted', { name }), tone: 'good' };
      return NOT_ENOUGH();
    },
  };
}

/** A ship's figure in its info window, with the ship sailed now's beside it: both its class's, before outfit and
 * talents */
function shipFigure(label: string, id: LineShipId, figures: ShipFigures, shown: (of: ShipFigures) => string): Figure {
  const theirs = shown(figures);
  return {
    label,
    value: ({ ship }) => {
      if (ship.shipClass.id === id) return theirs;
      return t('{next} (yours {now})', { next: theirs, now: shown(classFigures(ship.shipClass)) });
    },
  };
}

/** A ship's figures in a line, on its card */
function shipStats({ hp, maxSpeed, cannons, harpoons, hold }: ShipFigures) {
  return t('Hull {hp} · {speed} kn · guns {cannons} + {harpoons} · hold {hold}', {
    hp,
    speed: (maxSpeed / KNOT).toFixed(1),
    cannons,
    harpoons,
    hold,
  });
}

/** Whether a ship has any guns or outfit on it */
function hasGear(ship: Ship) {
  return (
    WEAPON_IDS.some((weapon) => ship.fittedGuns(weapon).length > 0) ||
    Object.values(ship.outfit).some((piece) => piece !== null)
  );
}

/**
 * What the shipyard asks as the first ship after the starter sloop is bought, while the sloop has guns or outfit on it:
 * whether they go into the hold for the new one. A new hull comes bare, and here a new captain learns that guns and
 * outfit are a ship's own, moved between ships through the hold
 */
function gearQuestion(): Question {
  return {
    title: t("Take the sloop's gear off?"),
    text: t(
      "A new ship comes bare: no guns, no outfit. The sloop's can go into the hold, to be fitted on the new one: the guns in the loadout (L), the outfit at the workshop. Left aboard, they stay on the sloop, laid up in port. Either answer buys the ship.",
    ),
    yes: t('Take it off'),
    no: t('Leave it aboard'),
  };
}

/** How far the player has got along the Captain's path to the ship the shipyard sells them */
function pathDone(state: GameState) {
  const steps = captainsPath(state, state.player);
  const done = steps.filter((step) => step.done).length;
  return done === steps.length ? t('Every term met') : t("Captain's path: {done} / {all}", { done, all: steps.length });
}

function shipFace(id: LineShipId, actions: ShopActions): ItemFace {
  const ship = lineShip(id);
  const { figures, built, obtain, tier } = ship;
  // A ladder's ship is the shipyard's, for gold at its tier's price, built or planned; the rest, their source's
  const ladder = isLadderShip(id) ? tierTerms(tier) : null;
  const source = SHIP_SOURCES[obtain.source];
  const price = ladder?.price ?? obtain.price;
  const currency = ladder ? 'gold' : source.currency;
  // Gold and doubloons are their coin and the number; the currencies to come, still in words
  const coin = price !== null && (currency === 'gold' || currency === 'doubloons') ? currency : null;
  const cost = price === null || !currency ? '' : coin ? whole(price) : t(CURRENCIES[currency].count, { n: price });
  const name = t(ship.name);
  const premium = obtain.source === 'premium';
  const laidUp = ({ player }: GameState) => player.fleet.findIndex((kept) => kept.shipClass === id);
  const sailed = (state: GameState) => state.ship.shipClass.id === id;
  /** Whether it is a ship the player works towards now: one the shipyard sells them */
  const goal = (state: GameState) => built !== null && isGoalShip(state, state.player, id);
  /** Its level and hull, if the player has it: the one sailed, or laid up in port; null if not */
  const yours = (state: GameState) => {
    if (sailed(state)) return t('Lv {level} · hull {hp}', { level: state.ship.level, hp: state.ship.hp });
    const kept = state.player.fleet[laidUp(state)];
    return kept ? t('Lv {level} · hull {hp}', { level: laidUpLevel(kept), hp: kept.hp }) : null;
  };
  const kind = `${t('Tier {tier}', { tier })}  ·  ${t(SHIP_LINES[ship.line].name)}`;
  return {
    name,
    tier,
    icon: SHIP_ICONS.get(id),
    letters: false,
    kind: built ? kind : `${kind}  ·  ${t('provisional figures')}`,
    about: t(ship.role),
    stats: shipStats(figures),
    price: cost,
    coin,
    figures: [
      shipFigure('Hull', id, figures, (of) => String(of.hp)),
      shipFigure('Top speed', id, figures, (of) => t('{speed} kn', { speed: (of.maxSpeed / KNOT).toFixed(1) })),
      shipFigure('Turning', id, figures, (of) => t('{n}°/s', { n: Math.round((of.turnSpeed * 180) / Math.PI) })),
      shipFigure('Cannons + harpoon guns', id, figures, (of) => `${of.cannons} + ${of.harpoons}`),
      shipFigure('Hold', id, figures, (of) => String(of.hold)),
      shipFigure('Sight', id, figures, (of) => String(of.viewRange)),
      shipFigure('Levels', id, figures, (of) => t('up to {level}', { level: of.maxLevel })),
      shipFigure('Abilities', id, figures, (of) => String(of.abilities)),
      { label: 'Obtained', value: t(source.name) },
      {
        label: 'Price',
        value: cost || (obtain.source === 'starter' ? t('Free') : t('to be set')),
        gold: cost !== '',
        coin,
      },
    ],
    lore: t(SHIP_LORE[id]),
    // On its card: how far the player has got with it, or where it is won
    owned: (state) => {
      const have = yours(state);
      if (have) return have;
      if (goal(state)) return pathDone(state);
      if (premium) {
        return tierMastered(state, state.player, tier)
          ? t('✓ Tier {tier} mastered', { tier })
          : t('Needs tier {tier} mastered', { tier });
      }
      if (built) return '';
      return obtain.source === 'shipyard' ? t('Coming later') : t(source.name);
    },
    // In its info window: the terms in full
    note: (state) => {
      const have = yours(state);
      if (have) return have;
      if (goal(state)) return pathDone(state);
      if (premium) {
        return tierMastered(state, state.player, tier)
          ? t('You have a tier {tier} ship of another line at its last level', { tier })
          : t('Needs a tier {tier} ship of another line at its last level', { tier });
      }
      if (built) return '';
      return obtain.terms ? `${t(obtain.terms)}  ·  ${t('Coming later')}` : t('Coming later');
    },
    inUse: sailed,
    button: (state) => {
      if (sailed(state)) return { short: t('At the helm'), long: t('At the helm'), enabled: false };
      // A ship of a lower tier than the sea's doesn't take to it here, as its gates keep it out
      const notHere = {
        short: t('Not in this sea'),
        long: t('Needs a ship of tier {tier}', { tier: ZONES[state.world.zone].tier }),
        enabled: false,
      };
      const index = laidUp(state);
      if (index >= 0) {
        if (!fitsSea(state, state.player.fleet[index].shipClass)) return notHere;
        return { short: t('Take the helm'), long: t('Take the helm'), enabled: true };
      }
      if (built && ladder && goal(state)) {
        if (!fitsSea(state, built.id)) return notHere;
        return {
          short: t('Buy'),
          long: t('Buy: {n} gold', { n: ladder.price }),
          enabled: termsMet(state, state.player) && state.player.gold >= ladder.price,
        };
      }
      return { short: t('Later'), long: t('Coming later'), enabled: false };
    },
    // The first ship after the starter sloop: whether the sloop's gear goes into the hold for it
    confirm: (state) => {
      const { ship: now, player } = state;
      if (!built || !ladder || laidUp(state) >= 0 || !goal(state) || !fitsSea(state, built.id)) return null;
      if (!termsMet(state, player) || player.gold < ladder.price) return null;
      return now.shipClass.id === STARTER_SHIP && hasGear(now) ? gearQuestion() : null;
    },
    // unload: the answer to that question, Take it off
    press: (state, unload = false) => {
      const index = laidUp(state);
      if (index >= 0) {
        return actions.takeHelm(index)
          ? { message: t('You take the helm of the {name}', { name }), tone: 'good' }
          : null;
      }
      if (!built || !goal(state)) return null;
      if (!termsMet(state, state.player)) return { message: t('Meet every term to buy it'), tone: 'bad' };
      return actions.buyShip(built.id, unload)
        ? { message: t('The {name} is yours: you take its helm', { name }), tone: 'good' }
        : NOT_ENOUGH();
    },
  };
}

/**
 * An item of the galleon's, for doubloons only: its group, what it is to do (it does nothing yet), how many are in the
 * hold and the quick slot it is in; bought by any count, picked in the info window
 */
function wareFace(id: ItemId, actions: ShopActions): ItemFace {
  const { name: english, category, price } = ITEMS[id];
  const name = t(english);
  const group = t(ITEM_CATEGORIES[category].name);
  const what = itemText(id);
  // How many the buttons buy: one on a card, any count picked in the info window
  let count = 1;
  return {
    name,
    tier: itemGrade(id),
    chip: '',
    icon: ITEM_ICONS.get(id),
    letters: false,
    kind: group,
    about: what,
    wrap: true,
    stats: '',
    price: whole(price),
    coin: 'doubloons',
    figures: [
      { label: 'Group', value: group },
      { label: 'Price', value: whole(price), gold: true, coin: 'doubloons' },
      { label: 'In the hold', value: ({ player }) => whole(player.items[id] ?? 0) },
      { label: 'On the skill bar', value: ({ player }) => quickSlotName(player, id) },
      { label: 'Works', value: t('Not yet: with an update') },
    ],
    lore: what,
    loreTitle: 'What it will do',
    owned: ({ player }) => {
      const n = player.items[id] ?? 0;
      return n > 0 ? t('{n} in the hold', { n: whole(n) }) : '';
    },
    // On the skill bar: its card outlined
    inUse: ({ player }) => player.quickSlots.includes(id),
    amount: {
      get: () => count,
      set: (n) => (count = Math.max(Math.round(n), 1)),
      most: ({ player }) => Math.max(Math.floor(player.doubloons / price), 1),
    },
    button: ({ player }) => ({
      short: t('Buy'),
      long: t('Buy {count} for {n} doubloon|Buy {count} for {n} doubloons', { count, n: itemPrice(id, count) }),
      enabled: player.doubloons >= itemPrice(id, count),
    }),
    press: () =>
      actions.buyItem(id, count)
        ? {
            message: t('{name} ×{n} is in the hold: put it on the skill bar from there (H)', { name, n: count }),
            tone: 'good',
          }
        : { message: t('Not enough doubloons'), tone: 'bad' },
  };
}

/** What a card and the info window say of an item, and what their button does */
export function itemFace(item: ShopItem, actions: ShopActions): ItemFace {
  if ('gun' in item) return gunFace(item.gun, actions);
  if ('ammo' in item) return ammoFace(item.ammo, actions);
  if ('ship' in item) return shipFace(item.ship, actions);
  if ('item' in item) return wareFace(item.item, actions);
  return outfitFace(item.outfit, actions);
}
