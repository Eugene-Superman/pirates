import { Container, Graphics, Sprite, Text, type Point, type Rectangle, type Texture } from 'pixi.js';
import {
  AMMO,
  AMMO_IDS,
  GUNS,
  GUN_IDS,
  OFF_TARGET_SHARE,
  WEAPONS,
  WEAPON_IDS,
  averageDamage,
  type AmmoId,
  type GunId,
  type Player,
  type Ship,
  type WeaponId,
} from '../../game';
import { StoryGuide, type Guide } from './StoryGuide';
import { AMMO_ICONS, GUN_ICONS, MINIMAP_BUTTONS } from './iconAtlas';
import {
  NIGHT,
  NIGHT_CORNER_REACH,
  NIGHT_HEADER,
  NIGHT_WINDOW,
  drawNightCard,
  moonButton,
  nightBoard,
  nightDivider,
  nightEmblem,
  nightHeader,
  type NightBoardLayout,
} from './nightTheme';
import { ScrollPane } from './ScrollPane';
import { THEME, crossButton, iconSlot, subheading } from './theme';
import { HudWindow, clip, show, text, tierColor, tint, whole, type ScreenEdges, type Tile } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1100; // pixels, before scaling down to fit the screen
const HEIGHT = 720; // pixels: the window keeps its size, and what doesn't fit a board scrolls in it
const PAD = 24;
const DIVIDER = PAD + NIGHT_HEADER.rule; // the gold line under the header
const HEADER_MIDDLE = PAD + NIGHT_HEADER.middle; // pixels: the header's middle, down the window
const TAB = { width: 210, height: 34, gap: 12, label: 14 } as const; // the weapons' tabs, in the header's middle
const TOP = DIVIDER + 18; // pixels: the boards' top
const BOTTOM = HEIGHT - PAD - 44; // pixels: the boards' bottom; under them the line about what is under the pointer
const GAP = 14; // pixels between two boards
const SLOTS = { x: PAD, width: 520 } as const; // the gun slots' board, on the left
// The right column: the ammo at hand's board over the hold's
const RIGHT = { x: PAD + SLOTS.width + GAP, width: WIDTH - PAD * 2 - SLOTS.width - GAP } as const;
const AT_HAND_HEIGHT = 164;
const HOLD_TOP = TOP + AT_HAND_HEIGHT + GAP;
// A board, pixels: inside it, its corner pieces (high), its emblem's radius, and its heading
const BOARD: NightBoardLayout = { pad: 14, corner: 26, emblem: 17, heading: { y: 12, size: 18 } };
const BOARD_STAR = 140; // pixels: a board's divider's painted star, across
// Pixels down each board from its top: the lines of its head, the divider under them, and what is under that
const SLOTS_HEAD = { summary: 42, purpose: 62, how: 80, divider: 118, pane: 126 } as const;
const AT_HAND_HEAD = { how: 40, places: 80 } as const;
const HOLD_HEAD = { how: 40, divider: 80, pane: 88 } as const;
// A gun slot's picture; `edge`: room round the rows in their pane, for the gold frame of the slot picked, which the
// pane would cut off
const SLOT = { size: 60, gap: 10, edge: 6 } as const;
const PLACE = { height: 72, icon: 52, gap: 12 } as const; // an ammo at hand's card, its picture, and between the two
const CARD = { height: 64, gap: 10, icon: 48, text: 66 } as const; // an item's card in the hold; its text's left
const SECTION = { heading: 26, none: 22, gap: 14 } as const; // a section of the hold: its heading, "none", room under it
const DRAG = { threshold: 5, size: 50, alpha: 0.85 } as const; // pixels moved before a press is a drag; the picture
const TAKE_OFF = 13; // pixels: the gold cross on a fitted gun or an ammo at hand that takes it off
const CROSS_IN = 7; // pixels the cross stands in from a gun slot's top right corner
const EMPTY_GLOW = 0x56688a; // an empty slot's or place's, in the night's cold light
const LIT = 0xffd447; // the slot picked, and the places that take what is dragged
const SLOT_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannons', harpoon: 'Harpoon guns' };
const AMMO_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannonballs', harpoon: 'Harpoons' };
// The keys that load the weapon's first and second ammo at hand (keyboardInput.ts), on their places
const AMMO_KEYS = ['Z', 'X'] as const;
// What the guide says while the story asks for a weapon's guns: dragged into its slots, or its tab opened first
const GUIDE_DRAG: Readonly<Record<WeaponId, string>> = {
  cannon: 'Drag a cannon from the hold onto an empty slot, or just click it',
  harpoon: 'Drag a harpoon gun from the hold onto an empty slot, or just click it',
};
const GUIDE_TAB: Readonly<Record<WeaponId, string>> = {
  cannon: 'Now the cannons: open their tab',
  harpoon: 'Now the harpoon guns: open their tab',
};
/** What a weapon is for, by what it does full damage to */
const PURPOSE = {
  object: 'Full damage to ships, {share}% to sea monsters',
  creature: 'Full damage to sea monsters, {share}% to ships',
} as const;

/** The painted gun on a weapon's slots' emblem, and the painted ammo on its ammo at hand's */
const EMBLEM_GUNS: Readonly<Record<WeaponId, GunId>> = { cannon: 'cannon1', harpoon: 'harpoonGun1' };
const EMBLEM_AMMO: Readonly<Record<WeaponId, AmmoId>> = { cannon: 'ball1', harpoon: 'harpoon1' };

export interface LoadoutActions {
  /** Fits a gun from the hold into one of its weapon's slots, or empties the slot (null): the old gun goes to the hold */
  fitGun: (weapon: WeaponId, slot: number, gun: GunId | null) => void;
  /** Moves a fitted gun into another slot of its weapon, the two swapping */
  swapGuns: (weapon: WeaponId, from: number, to: number) => void;
  /** Picks the ammo its weapon fires */
  loadAmmo: (ammo: AmmoId) => void;
  /** Puts an ammo in one of its weapon's two places at hand (the skill bar's), or empties it (null) */
  setAmmoSlot: (weapon: WeaponId, index: number, ammo: AmmoId | null) => void;
}

/** What a picture in the window stands for: what a click or a drag of it does */
type Item =
  | { readonly kind: 'slot'; readonly weapon: WeaponId; readonly slot: number; readonly gun: GunId | null }
  | { readonly kind: 'place'; readonly weapon: WeaponId; readonly index: number; readonly ammo: AmmoId | null }
  | { readonly kind: 'gun'; readonly gun: GunId }
  | { readonly kind: 'ammo'; readonly ammo: AmmoId };

/** A slot, a place or a card in the window: what it stands for, the frame that lights it, and its count */
interface Cell {
  readonly item: Item;
  readonly container: Container;
  readonly frame: Graphics;
  readonly count: Text | null;
  /** The pane it scrolls in, if any: it takes a drop only where it shows */
  readonly pane: ScrollPane | null;
}

/** A press on a cell: where it started, and the picture following the pointer once it is a drag */
interface Press {
  readonly cell: Cell;
  readonly from: { readonly x: number; readonly y: number };
  ghost: Sprite | Graphics | null;
}

/** A gun in a few words: its die, reach and reload */
function gunStats(gun: GunId) {
  const { die, range, reload } = GUNS[gun];
  return t('d{die} · reach {range} · {reload} s', { die, range, reload });
}

function weaponOf(item: Item): WeaponId {
  if (item.kind === 'slot' || item.kind === 'place') return item.weapon;
  return item.kind === 'gun' ? GUNS[item.gun].weapon : AMMO[item.ammo].weapon;
}

/** The ammo or gun a picture shows, if any */
function picture(item: Item): Texture | null {
  if (item.kind === 'slot') return item.gun ? GUN_ICONS.get(item.gun) : null;
  if (item.kind === 'gun') return GUN_ICONS.get(item.gun);
  const ammo = ammoOf(item);
  return ammo ? AMMO_ICONS.get(ammo) : null;
}

/** The first slot of a weapon with no gun, or the first slot when every one has one */
function firstEmpty(ship: Ship, weapon: WeaponId) {
  return Math.max(0, ship.guns[weapon].indexOf(null));
}

/** A board's emblem round (0, 0): a painted picture (`paint`) in a dark well under a brass ring, empty till it loads */
function boardEmblem() {
  const painted = new Sprite();
  painted.anchor.set(0.5);
  painted.visible = false;
  const container = nightEmblem(BOARD.emblem, painted);
  const paint = (texture: Texture | null) => {
    painted.visible = texture !== null;
    if (!texture) return;
    painted.texture = texture;
    painted.setSize(BOARD.emblem * 2 - 2);
  };
  return { container, paint };
}

/** A line of a board's head, wrapped inside a board `width` pixels across */
function headLine(value: string, width: number, size = 12, color: number = NIGHT.dim) {
  return text(value, size, color, { wordWrap: true, wordWrapWidth: width - BOARD.pad * 2, lineHeight: size + 3 });
}

/**
 * The loadout window (L, or its button on the minimap's frame), in the night look like the talents, and of one size
 * whatever the ship carries. A tab a weapon in the header's middle, cannons or harpoon guns, lit for the one shown,
 * with how many of its slots have a gun; under it three boards of that weapon's, each under a painted emblem: on the
 * left its gun slots (a picture a slot, numbered, with what a volley of them does and what the weapon is for), on the
 * right its two ammo at hand (as on the skill bar under the window, Z and X) over what waits in the hold, its guns and
 * its ammo, a card each with its figures and how many. The slots and the hold scroll on their own (the wheel, a bar),
 * so a ship of sixty guns fits as the starter sloop does. A click on a slot picks it, a click on a gun in the hold fits
 * it there and picks the next empty slot, a fitted gun dragged onto another slot swaps with what is there, the small
 * gold cross takes one off; ammo from the hold is put at hand with a click or dragged onto a place here or on the bar below, and an
 * ammo at hand is loaded with a click or dragged back to the hold. The line at the bottom tells all about what is
 * under the pointer. Closed by its gold cross, Escape, L or a click beside it. While the story asks for guns that wait
 * in the hold, a guide shows a new player how they are fitted (StoryGuide)
 */
export class LoadoutPanel {
  readonly container: Container;
  /** Over everything, the skill bar too: the picture dragged */
  readonly dragLayer = new Container();
  private readonly window: HudWindow;
  private readonly actions: LoadoutActions;
  /**
   * Where on the skill bar ammo dragged out of the window would go, if anywhere; the bar told what is dragged; and what
   * the bar takes at the screen's top or bottom, which the window leaves clear
   */
  private readonly bar: {
    readonly placeAt: (x: number, y: number) => { readonly weapon: WeaponId; readonly index: number } | null;
    readonly showDrop: (weapon: WeaponId | null) => void;
    readonly edges: () => ScreenEdges;
  };
  /** The weapon whose slots, ammo and hold the boards show */
  private tab: WeaponId = 'cannon';
  private readonly tabs: Readonly<Record<WeaponId, { readonly tile: Tile; readonly text: Text }>>;
  // The gun slots' board: its emblem, how many are fitted, what a volley does, what the weapon is for, its slots
  private readonly slotsEmblem = boardEmblem();
  private readonly fitted = text('', 15, THEME.title, { fontWeight: 'bold' });
  private readonly summary = text('', 13, THEME.text);
  private readonly purpose = text('', 12, NIGHT.dim);
  private readonly slots = new ScrollPane(
    SLOTS.width - BOARD.pad * 2 + SLOT.edge,
    BOTTOM - TOP - SLOTS_HEAD.pane - BOARD.pad,
  );
  // The ammo at hand's board
  private readonly ammoEmblem = boardEmblem();
  private readonly places = new Container();
  // The hold's board, lit while what is dragged out of the ship can go back into it
  private readonly holdEmblem = boardEmblem();
  private readonly hold = new ScrollPane(RIGHT.width - BOARD.pad * 2, BOTTOM - HOLD_TOP - HOLD_HEAD.pane - BOARD.pad);
  private readonly holdGlow = new Graphics();
  /** Showing a new player how the story's guns are fitted */
  private readonly guide = new StoryGuide({ width: WIDTH });
  private readonly hint = text('', 13, THEME.text, {
    wordWrap: true,
    wordWrapWidth: WIDTH - NIGHT_CORNER_REACH * 2,
    lineHeight: 17,
  });
  private cells: Cell[] = [];
  /** The slot of each weapon a gun from the hold goes into */
  private readonly picked: Record<WeaponId, number> = { cannon: 0, harpoon: 0 };
  private press: Press | null = null;
  private hovered: Cell | null = null;
  /** The ship as of the last frame: what a click acts on */
  private ship: Ship | null = null;
  /** What the cells were made for, to make them again only when it changes */
  private builtFor = '';
  /** Whether it was open the last frame: opened, it shows the weapon asked for, or else the one the ship fires */
  private wasOpen = false;
  private asked: WeaponId | null = null;

  /** bar: the skill bar's places, to drop ammo on */
  constructor(actions: LoadoutActions, screen: Rectangle, bar: LoadoutPanel['bar']) {
    this.actions = actions;
    this.bar = bar;
    this.window = new HudWindow(
      screen,
      { width: WIDTH, height: HEIGHT, pad: PAD, clear: bar.edges },
      () => this.hide(),
      NIGHT_WINDOW,
    );
    this.container = this.window.container;

    // The header: the title, the weapons' tabs and Close
    const header = nightHeader(WIDTH, PAD, t('Loadout'));
    const tabsLeft = (WIDTH - TAB.width * 2 - TAB.gap) / 2;
    const tab = (weapon: WeaponId, i: number) => {
      const button = moonButton(TAB.width, TAB.height, '', () => this.showWeapon(weapon), TAB.label);
      button.tile.container.position.set(tabsLeft + i * (TAB.width + TAB.gap), HEADER_MIDDLE - TAB.height / 2);
      return button;
    };
    this.tabs = { cannon: tab('cannon', 0), harpoon: tab('harpoon', 1) };

    // The gun slots
    const slotsBoard = board(SLOTS.x, TOP, SLOTS.width, BOTTOM - TOP, t('Gun slots'), this.slotsEmblem.container);
    this.fitted.anchor.set(1, 0);
    this.fitted.position.set(SLOTS.width - BOARD.pad, BOARD.heading.y + 2);
    this.summary.position.set(BOARD.pad, SLOTS_HEAD.summary);
    this.purpose.position.set(BOARD.pad, SLOTS_HEAD.purpose);
    const slotsHow = headLine(
      t(
        'Pick a slot, then a gun in the hold to fit it there; drag a fitted gun onto another slot to swap them; × takes a gun off',
      ),
      SLOTS.width,
    );
    slotsHow.position.set(BOARD.pad, SLOTS_HEAD.how);
    // Its rows as far in as the lines over them, the pane wider by their edge
    this.slots.container.position.set(BOARD.pad - SLOT.edge, SLOTS_HEAD.pane);
    slotsBoard.addChild(
      this.fitted,
      this.summary,
      this.purpose,
      slotsHow,
      boardDivider(SLOTS.width, SLOTS_HEAD.divider),
      this.slots.container,
    );

    // The ammo at hand
    const atHand = board(RIGHT.x, TOP, RIGHT.width, AT_HAND_HEIGHT, t('Ammo at hand'), this.ammoEmblem.container);
    const atHandHow = headLine(
      t('Click one to load it; drag ammo from the hold here or onto the skill bar; × puts it back'),
      RIGHT.width,
    );
    atHandHow.position.set(BOARD.pad, AT_HAND_HEAD.how);
    this.places.position.set(BOARD.pad, AT_HAND_HEAD.places);
    atHand.addChild(atHandHow, this.places);

    // The hold
    const holdBoard = board(
      RIGHT.x,
      HOLD_TOP,
      RIGHT.width,
      BOTTOM - HOLD_TOP,
      t('In the hold'),
      this.holdEmblem.container,
    );
    const holdHow = headLine(
      t('Click a gun to fit it in the slot picked, or drag it onto a slot; click ammo to put it at hand'),
      RIGHT.width,
    );
    holdHow.position.set(BOARD.pad, HOLD_HEAD.how);
    this.hold.container.position.set(BOARD.pad, HOLD_HEAD.pane);
    holdBoard.addChild(holdHow, boardDivider(RIGHT.width, HOLD_HEAD.divider), this.hold.container);
    this.holdGlow
      .roundRect(RIGHT.x - 3, HOLD_TOP - 3, RIGHT.width + 6, BOTTOM - HOLD_TOP + 6, 9)
      .fill({ color: LIT, alpha: 0.06 })
      .stroke({ width: 2, color: LIT, alpha: 0.7 });
    this.holdGlow.eventMode = 'none';
    this.holdGlow.visible = false;

    this.hint.position.set(NIGHT_CORNER_REACH, BOTTOM + 12);
    // The tabs under the header: its divider's star over their lower edges
    this.window.panel.addChild(
      this.tabs.cannon.tile.container,
      this.tabs.harpoon.tile.container,
      header.container,
      slotsBoard,
      atHand,
      holdBoard,
      this.holdGlow,
      this.hint,
      this.guide.container,
    );
    this.dragLayer.eventMode = 'none';
    GUN_ICONS.load(() => (this.builtFor = ''));
    AMMO_ICONS.load(() => (this.builtFor = ''));
    MINIMAP_BUTTONS.load(() => (this.builtFor = ''));
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.open();
  }

  /**
   * Opens it on a weapon's tab (the skill bar's plus on an empty place of that weapon's), or on the weapon the ship
   * fires; open already, it turns to that weapon's tab
   */
  open(weapon: WeaponId | null = null) {
    if (this.isOpen) {
      if (weapon) this.showWeapon(weapon);
      return;
    }
    this.asked = weapon;
    this.container.visible = true;
  }

  hide() {
    this.endDrag();
    this.container.visible = false;
  }

  /**
   * fitting: the weapon whose guns the story asks for, waiting in the hold (storyFitting), for the guide; dt: seconds
   * since the last frame
   */
  update(ship: Ship, player: Player, fitting: WeaponId | null, dt: number) {
    this.ship = ship;
    if (!this.isOpen) {
      this.wasOpen = false;
      return;
    }
    if (!this.wasOpen) {
      // Opened on the weapon asked for or the one the ship fires, each weapon's first empty slot picked
      this.wasOpen = true;
      this.showWeapon(this.asked ?? ship.weapon);
      this.asked = null;
      for (const weapon of WEAPON_IDS) this.picked[weapon] = firstEmpty(ship, weapon);
    }
    const key = this.layoutKey(ship, player);
    // Not while a picture is dragged: it would be pulled from under the pointer
    if (key !== this.builtFor && !this.press) {
      this.builtFor = key;
      this.build(ship, player);
    }
    this.window.fit();
    for (const weapon of WEAPON_IDS) {
      const guns = ship.guns[weapon];
      const fitted = guns.filter((gun) => gun !== null).length;
      show(this.tabs[weapon].text, `${t(SLOT_NAMES[weapon])} · ${fitted}/${guns.length}`);
      this.tabs[weapon].tile.setLook({ pressed: weapon === this.tab });
    }
    const guns = ship.guns[this.tab];
    show(this.fitted, t('{n} of {slots} fitted', { n: guns.filter((gun) => gun !== null).length, slots: guns.length }));
    show(this.summary, summary(ship, this.tab));
    const dragged = this.press?.ghost ? this.press.cell.item : null;
    for (const cell of this.cells) {
      const { item } = cell;
      if (cell.count) show(cell.count, countOf(item, ship, player));
      cell.frame.visible = dragged
        ? takes(item, dragged)
        : item.kind === 'slot' && this.picked[item.weapon] === item.slot;
    }
    this.holdGlow.visible = dragged !== null && (dragged.kind === 'slot' || dragged.kind === 'place');
    show(
      this.hint,
      this.hovered ? describe(this.hovered.item, ship) : t('Point at a gun or ammo to read all about it'),
    );
    tint(this.hint, this.hovered ? THEME.text : NIGHT.dim);
    const guide = this.guideFor(fitting);
    this.guide.update(guide, fitting ? t((guide?.kind === 'click' ? GUIDE_TAB : GUIDE_DRAG)[fitting]) : '', dt);
  }

  /**
   * What the guide shows for the weapon the story asks guns of: its tab, if another is shown, else its first gun in the
   * hold dragged onto its first empty slot. Nothing while the player drags something themselves
   */
  private guideFor(fitting: WeaponId | null): Guide | null {
    if (!fitting || this.press?.ghost) return null;
    if (fitting !== this.tab) return { kind: 'click', target: { container: this.tabs[fitting].tile.container } };
    const from = this.cells.find(({ item }) => item.kind === 'gun');
    const to = this.cells.find(({ item }) => item.kind === 'slot' && item.gun === null);
    if (!from || !to) return null;
    return { kind: 'drag', from: from.container, to: to.container, texture: picture(from.item) };
  }

  /** The boards on a weapon's slots, ammo and hold, scrolled to their tops */
  private showWeapon(weapon: WeaponId) {
    if (weapon === this.tab && this.builtFor !== '') return;
    this.tab = weapon;
    this.builtFor = '';
    this.slots.scrollTo(0);
    this.hold.scrollTo(0);
  }

  /** What the cells show: the weapon's slots' guns, its ammo at hand and loaded, its kinds in the hold */
  private layoutKey(ship: Ship, player: Player) {
    const weapon = this.tab;
    const guns = GUN_IDS[weapon].filter((gun) => (player.hold[gun] ?? 0) > 0);
    const ammo = AMMO_IDS[weapon].filter((id) => ship.ammo[id] > 0);
    return JSON.stringify([weapon, ship.guns[weapon], ship.ammoBar[weapon], ship.loaded[weapon], guns, ammo]);
  }

  private build(ship: Ship, player: Player) {
    for (const parent of [this.slots.content, this.places, this.hold.content]) {
      for (const child of parent.removeChildren()) child.destroy({ children: true });
    }
    this.cells = [];
    this.hovered = null;
    const weapon = this.tab;
    this.slotsEmblem.paint(GUN_ICONS.get(EMBLEM_GUNS[weapon]));
    this.ammoEmblem.paint(AMMO_ICONS.get(EMBLEM_AMMO[weapon]));
    this.holdEmblem.paint(MINIMAP_BUTTONS.get('hold'));
    show(this.purpose, t(PURPOSE[WEAPONS[weapon].against], { share: OFF_TARGET_SHARE * 100 }));

    // The weapon's slots, a picture each in rows
    const guns = ship.guns[weapon];
    if (this.picked[weapon] >= guns.length) this.picked[weapon] = 0;
    guns.forEach((gun, slot) => this.slotCell({ kind: 'slot', weapon, slot, gun }));
    this.slots.setContentHeight(this.slotTop(Math.max(0, guns.length - 1)) + SLOT.size + SLOT.edge);

    // Its two ammo at hand, side by side
    const placeWidth = (RIGHT.width - BOARD.pad * 2 - PLACE.gap) / 2;
    ship.ammoBar[weapon].forEach((ammo, index) =>
      this.placeCard({ kind: 'place', weapon, index, ammo }, index * (placeWidth + PLACE.gap), placeWidth, ship),
    );

    // The hold: the weapon's guns, then its ammo not at hand
    const held = GUN_IDS[weapon].filter((gun) => (player.hold[gun] ?? 0) > 0);
    const spare = AMMO_IDS[weapon].filter((id) => ship.ammo[id] > 0 && !ship.ammoBar[weapon].includes(id));
    let y = this.holdSection(
      t(SLOT_NAMES[weapon]),
      0,
      held.map((gun) => ({ kind: 'gun', gun }) as const),
    );
    y = this.holdSection(
      t(AMMO_NAMES[weapon]),
      y,
      spare.map((ammo) => ({ kind: 'ammo', ammo }) as const),
    );
    this.hold.setContentHeight(y - SECTION.gap);
  }

  /** A section of the hold from `y`: its heading, its cards two to a row or a word that there are none; returns its end */
  private holdSection(title: string, y: number, items: readonly Extract<Item, { kind: 'gun' | 'ammo' }>[]) {
    const pane = this.hold;
    pane.content.addChild(at(subheading(title, 15), 0, y));
    y += SECTION.heading;
    if (items.length === 0) {
      pane.content.addChild(at(text(t('None in the hold: the arsenal in port sells them'), 12, NIGHT.dim), 2, y));
      return y + SECTION.none + SECTION.gap;
    }
    const width = (pane.inner - CARD.gap) / 2;
    items.forEach((item, i) =>
      this.holdCard(item, (i % 2) * (width + CARD.gap), y + Math.floor(i / 2) * (CARD.height + CARD.gap), width),
    );
    return y + Math.ceil(items.length / 2) * (CARD.height + CARD.gap) - CARD.gap + SECTION.gap;
  }

  /** Slots a row: as many as the slots' pane has room for */
  private slotsPerRow() {
    return Math.max(1, Math.floor((this.slots.inner - SLOT.edge + SLOT.gap) / (SLOT.size + SLOT.gap)));
  }

  /** Pixels down the slots' pane to the top of the `slot`th slot's row */
  private slotTop(slot: number) {
    return SLOT.edge + Math.floor(slot / this.slotsPerRow()) * (SLOT.size + SLOT.gap);
  }

  /** A gun slot's picture in its place in the rows: its gun on its tier's light and its number, or a plus when empty */
  private slotCell(item: Extract<Item, { kind: 'slot' }>) {
    const perRow = this.slotsPerRow();
    const rowWidth = perRow * (SLOT.size + SLOT.gap) - SLOT.gap;
    const container = new Container();
    container.position.set(
      SLOT.edge + (this.slots.inner - SLOT.edge - rowWidth) / 2 + (item.slot % perRow) * (SLOT.size + SLOT.gap),
      this.slotTop(item.slot),
    );
    const tier = item.gun ? GUNS[item.gun].tier : null;
    const slot = iconSlot(SLOT.size, tier === null ? EMPTY_GLOW : tierColor(tier), `${item.slot + 1}`, tier !== null);
    slot.show(picture(item));
    container.addChild(slot.container);
    // Inside the slot's brass frame, not over it
    if (item.gun) container.addChild(this.takeOff(item, SLOT.size - TAKE_OFF - CROSS_IN, CROSS_IN));
    else container.addChild(plus(SLOT.size / 2, SLOT.size / 2));
    this.cell(item, container, SLOT.size, SLOT.size, this.slots.content, this.slots);
  }

  /**
   * An ammo at hand's card, `width` pixels across at `x`: its picture with its key, its name, what it adds, how many
   * are aboard and whether it is loaded (its card edged in gold); or an empty place, and what to do with it
   */
  private placeCard(item: Extract<Item, { kind: 'place' }>, x: number, width: number, ship: Ship) {
    const container = new Container();
    container.position.set(x, 0);
    const { ammo } = item;
    const loaded = ammo !== null && ship.loaded[item.weapon] === ammo;
    const glow = ammo ? tierColor(AMMO[ammo].tier) : EMPTY_GLOW;
    const slot = iconSlot(PLACE.icon, glow, AMMO_KEYS[item.index], ammo !== null);
    slot.show(picture(item));
    slot.container.position.set(10, (PLACE.height - PLACE.icon) / 2);
    container.addChild(drawNightCard(new Graphics(), width, PLACE.height, loaded ? THEME.title : undefined));
    container.addChild(slot.container);
    const left = 10 + PLACE.icon + 12;
    const room = width - left - 8;
    if (!ammo) {
      container.addChild(
        plus(10 + PLACE.icon / 2, PLACE.height / 2),
        at(text(t('Empty'), 14, NIGHT.dim, { fontWeight: 'bold' }), left, 10),
        at(text(t('Drag ammo here from the hold'), 12, NIGHT.dim, { wordWrap: true, wordWrapWidth: room }), left, 32),
      );
      this.cell(item, container, width, PLACE.height, this.places, null);
      return;
    }
    const name = text(t(AMMO[ammo].name), 14, THEME.text, { fontWeight: 'bold' });
    clip(name, room - TAKE_OFF);
    const bonus = text(t('+{n} to every hit', { n: AMMO[ammo].bonus }), 12, THEME.text);
    clip(bonus, room);
    const count = text('', 12, NIGHT.dim);
    container.addChild(at(name, left, 9), at(bonus, left, 31), at(count, left, 50));
    if (loaded) {
      const mark = text(t('Loaded'), 12, THEME.title, { fontWeight: 'bold' });
      mark.anchor.set(1, 0);
      container.addChild(at(mark, width - 10, 50));
    }
    container.addChild(this.takeOff(item, width - TAKE_OFF - 6, 6));
    this.cell(item, container, width, PLACE.height, this.places, null, count);
  }

  /** A gun's or an ammo's card in the hold, `width` pixels across: its picture, name, figures and how many */
  private holdCard(item: Extract<Item, { kind: 'gun' | 'ammo' }>, x: number, y: number, width: number) {
    const container = new Container();
    container.position.set(x, y);
    const tier = tierOf(item) ?? 1;
    const slot = iconSlot(CARD.icon, tierColor(tier), `T${tier}`);
    slot.show(picture(item));
    slot.container.position.set(8, (CARD.height - CARD.icon) / 2);
    const room = width - CARD.text - 8;
    const name = text(nameOf(item), 13, THEME.text, { fontWeight: 'bold' });
    clip(name, room - 44);
    const count = text('', 14, THEME.title, { fontWeight: 'bold' });
    count.anchor.set(1, 0);
    const [first, second] =
      item.kind === 'gun'
        ? [gunStats(item.gun), t(GUNS[item.gun].role)]
        : [
            t('+{n} to every hit', { n: AMMO[item.ammo].bonus }),
            t(AMMO[item.ammo].weapon === 'cannon' ? 'Tier {tier} cannon ammo' : 'Tier {tier} harpoon ammo', { tier }),
          ];
    const figures = text(first, 11, THEME.text);
    clip(figures, room);
    const about = text(second, 11, NIGHT.dim);
    clip(about, room);
    container.addChild(
      drawNightCard(new Graphics(), width, CARD.height),
      slot.container,
      at(name, CARD.text, 8),
      at(count, width - 10, 7),
      at(figures, CARD.text, 28),
      at(about, CARD.text, 44),
    );
    this.cell(item, container, width, CARD.height, this.hold.content, this.hold, count);
  }

  /** A cell's frame that lights it, and what a press, a drag and the pointer over it do */
  private cell(
    item: Item,
    container: Container,
    width: number,
    height: number,
    parent: Container,
    pane: ScrollPane | null,
    count: Text | null = null,
  ) {
    const frame = new Graphics().roundRect(-3, -3, width + 6, height + 6, 9).stroke({ width: 2.5, color: LIT });
    frame.visible = false;
    container.addChildAt(frame, 0);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    const cell: Cell = { item, container, frame, count, pane };
    container.on('pointerdown', (e) => {
      // Not the stage's: it would steer the ship
      e.stopPropagation();
      this.press = { cell, from: { x: e.global.x, y: e.global.y }, ghost: null };
    });
    container.on('globalpointermove', (e) => this.move(cell, e.global));
    container.on('pointerup', (e) => this.release(cell, e.global));
    container.on('pointerupoutside', (e) => this.release(cell, e.global));
    container.on('pointerover', () => (this.hovered = cell));
    container.on('pointerout', () => {
      if (this.hovered === cell) this.hovered = null;
    });
    parent.addChild(container);
    this.cells.push(cell);
  }

  /**
   * The gold cross at (x, y) in a cell, every window's close painted small: takes a gun off into the hold, or puts an
   * ammo at hand back. It takes the press, so the cell under it is neither clicked nor dragged
   */
  private takeOff(item: Item, x: number, y: number) {
    const cross = crossButton(TAKE_OFF, () => this.remove(item)).container;
    cross.position.set(x, y);
    return cross;
  }

  private move(cell: Cell, point: Point) {
    const press = this.press;
    if (press?.cell !== cell) return;
    if (!press.ghost) {
      if (Math.hypot(point.x - press.from.x, point.y - press.from.y) < DRAG.threshold) return;
      // Only what goes somewhere is dragged: a gun or an ammo, not an empty place
      const { item } = cell;
      if ((item.kind === 'slot' && !item.gun) || (item.kind === 'place' && !item.ammo)) return;
      press.ghost = ghostOf(item);
      this.dragLayer.addChild(press.ghost);
      if (item.kind === 'ammo' || item.kind === 'place') this.bar.showDrop(weaponOf(item));
    }
    press.ghost.position.set(point.x, point.y);
  }

  private release(cell: Cell, point: Point) {
    const press = this.press;
    if (press?.cell !== cell) return;
    const dragged = press.ghost !== null;
    this.endDrag();
    if (dragged) this.drop(cell.item, point);
    else this.click(cell.item);
  }

  private endDrag() {
    if (this.press?.ghost) this.press.ghost.destroy();
    this.press = null;
    this.bar.showDrop(null);
  }

  /** What a click on a cell does */
  private click(item: Item) {
    switch (item.kind) {
      case 'slot':
        this.picked[item.weapon] = item.slot;
        break;
      case 'place':
        if (item.ammo) this.actions.loadAmmo(item.ammo);
        break;
      case 'gun': {
        const { weapon } = GUNS[item.gun];
        this.actions.fitGun(weapon, this.picked[weapon], item.gun);
        if (this.ship?.guns[weapon][this.picked[weapon]] === item.gun) this.pickNextEmpty(weapon);
        break;
      }
      case 'ammo':
        this.putAtHand(item.ammo);
        break;
    }
  }

  /**
   * After a gun fitted with a click, the next empty slot after it is picked and scrolled into sight: a click on a gun
   * after another fills a big ship's slots one by one. With none empty, the slot stays picked
   */
  private pickNextEmpty(weapon: WeaponId) {
    const guns = this.ship?.guns[weapon];
    if (!guns) return;
    const from = this.picked[weapon];
    for (let k = 1; k < guns.length; k++) {
      const slot = (from + k) % guns.length;
      if (guns[slot] !== null) continue;
      this.picked[weapon] = slot;
      if (weapon === this.tab) this.slots.reveal(this.slotTop(slot), SLOT.size);
      return;
    }
  }

  /** An ammo from the hold put at hand: in an empty place, or else in the place of the one that isn't loaded */
  private putAtHand(ammo: AmmoId) {
    const weapon = AMMO[ammo].weapon;
    const places = this.cells.flatMap(({ item }) => (item.kind === 'place' && item.weapon === weapon ? [item] : []));
    const empty = places.find((place) => place.ammo === null);
    const loaded = this.ship?.loaded[weapon];
    const spare = places.find((place) => place.ammo !== null && place.ammo !== ammo && place.ammo !== loaded);
    const place = empty ?? spare;
    if (place && !places.some((p) => p.ammo === ammo)) this.actions.setAmmoSlot(weapon, place.index, ammo);
  }

  /** Where a dragged picture lands: a slot or a place of its weapon here, the hold, or a place on the skill bar */
  private drop(item: Item, point: Point) {
    const target = this.cells.find(
      (cell) =>
        takes(cell.item, item) &&
        (cell.pane?.shows(point) ?? true) &&
        cell.container.getBounds().containsPoint(point.x, point.y),
    );
    if (target) {
      const into = target.item;
      if (into.kind === 'slot' && item.kind === 'gun') this.actions.fitGun(into.weapon, into.slot, item.gun);
      if (into.kind === 'slot' && item.kind === 'slot') this.actions.swapGuns(into.weapon, item.slot, into.slot);
      if (into.kind === 'place') this.actions.setAmmoSlot(into.weapon, into.index, ammoOf(item));
      return;
    }
    if ((item.kind === 'slot' || item.kind === 'place') && this.overHold(point)) {
      this.remove(item);
      return;
    }
    const place = this.bar.placeAt(point.x, point.y);
    const ammo = ammoOf(item);
    if (place && ammo && AMMO[ammo].weapon === place.weapon) this.actions.setAmmoSlot(place.weapon, place.index, ammo);
  }

  /** Whether a point on the screen is over the hold's board: what is dragged out of the ship goes back there */
  private overHold(point: Point) {
    const { x, y } = this.window.panel.toLocal(point);
    return x >= RIGHT.x && x <= RIGHT.x + RIGHT.width && y >= HOLD_TOP && y <= BOTTOM;
  }

  /** A gun taken off into the hold, or an ammo at hand put back */
  private remove(item: Item) {
    if (item.kind === 'slot') this.actions.fitGun(item.weapon, item.slot, null);
    else if (item.kind === 'place') this.actions.setAmmoSlot(item.weapon, item.index, null);
  }
}

/**
 * A board of blue glass at (x, y) in the window, `width` × `height` pixels: corner pieces, its emblem and its heading.
 * What it holds is added to it
 */
function board(x: number, y: number, width: number, height: number, heading: string, emblem: Container) {
  return at(nightBoard(width, height, BOARD, emblem, heading).container, x, y);
}

/** The divider under a board's head, `y` pixels down a board `width` pixels across */
function boardDivider(width: number, y: number) {
  return at(nightDivider(width - BOARD.pad * 2, BOARD_STAR), BOARD.pad, y);
}

/** A faint plus round (x, y): an empty slot or place, waiting for what goes there */
function plus(x: number, y: number) {
  const sign = text('+', 26, EMPTY_GLOW, { fontWeight: 'bold' });
  sign.anchor.set(0.5);
  return at(sign, x, y);
}

/** A cell's count: how many of a gun in the hold, of an ammo aboard, or of an ammo at hand aboard */
function countOf(item: Item, ship: Ship, player: Player) {
  if (item.kind === 'gun') return `×${player.hold[item.gun] ?? 0}`;
  if (item.kind === 'ammo') return whole(ship.ammo[item.ammo]);
  if (item.kind === 'place' && item.ammo) return t('{n} aboard', { n: whole(ship.ammo[item.ammo]) });
  return '';
}

/**
 * Whether a cell takes what is dragged onto it: a slot a gun of its weapon, from the hold or another of its slots (the
 * two swapping), a place an ammo of its weapon
 */
function takes(into: Item, dragged: Item) {
  if (into === dragged) return false;
  if (into.kind === 'slot') {
    if (dragged.kind === 'slot') return dragged.weapon === into.weapon && dragged.slot !== into.slot;
    return dragged.kind === 'gun' && GUNS[dragged.gun].weapon === into.weapon;
  }
  if (into.kind === 'place') {
    const ammo = ammoOf(dragged);
    return ammo !== null && AMMO[ammo].weapon === into.weapon;
  }
  return false;
}

function ammoOf(item: Item): AmmoId | null {
  if (item.kind === 'ammo') return item.ammo;
  return item.kind === 'place' ? item.ammo : null;
}

function tierOf(item: Item): number | null {
  if (item.kind === 'slot') return item.gun ? GUNS[item.gun].tier : null;
  if (item.kind === 'gun') return GUNS[item.gun].tier;
  const ammo = ammoOf(item);
  return ammo ? AMMO[ammo].tier : null;
}

function nameOf(item: Item) {
  if (item.kind === 'slot') return item.gun ? t(GUNS[item.gun].name) : t('Empty');
  if (item.kind === 'gun') return t(GUNS[item.gun].name);
  const ammo = ammoOf(item);
  return ammo ? t(AMMO[ammo].name) : t('Empty');
}

/** A gun all told: its name, die, reach and reload, what a shot of it hits for, what it is good at */
function gunLine(gun: GunId, ship: Ship) {
  return `${t(GUNS[gun].name)} · ${gunStats(gun)} · ${shot(ship, gun)} · ${t(GUNS[gun].role)}`;
}

/** The line at the bottom about the cell under the pointer */
function describe(item: Item, ship: Ship) {
  if (item.kind === 'slot') {
    const where = t('{weapon}, slot {slot}', { weapon: t(SLOT_NAMES[item.weapon]), slot: item.slot + 1 });
    if (!item.gun) return `${where}: ${t('empty: click it, then a gun in the hold')}`;
    return `${where}: ${gunLine(item.gun, ship)}`;
  }
  if (item.kind === 'gun') return gunLine(item.gun, ship);
  const ammo = ammoOf(item);
  if (!ammo) return t('An empty place at hand: drag ammo here or onto the skill bar');
  const { name, bonus } = AMMO[ammo];
  const loaded = ship.loaded[AMMO[ammo].weapon] === ammo;
  return `${t(name)} · ${t('+{n} to every hit', { n: bonus })} · ${t('{n} aboard', { n: whole(ship.ammo[ammo]) })}${
    loaded ? ` · ${t('Loaded')}` : ''
  }`;
}

/** What a gun hits for a shot with its weapon's ammo loaded now */
function shot(ship: Ship, gun: GunId) {
  const bonus = AMMO[ship.loaded[GUNS[gun].weapon]].bonus;
  return t('≈{damage} a shot', { damage: averageDamage(GUNS[gun], bonus).toFixed(1) });
}

/** What a volley of a weapon's guns fitted does with its ammo loaded, a second of them, and how far they reach */
function summary(ship: Ship, weapon: WeaponId) {
  const bonus = AMMO[ship.loaded[weapon]].bonus;
  const fitted = ship.fittedGuns(weapon);
  if (fitted.length === 0) return t('No guns fitted');
  const volley = fitted.reduce((sum, { gun }) => sum + averageDamage(gun, bonus), 0);
  const perSecond = fitted.reduce((sum, { gun }) => sum + averageDamage(gun, bonus) / gun.reload, 0);
  return t('≈{volley} a volley · {perSecond}/s · reach {range}', {
    volley: volley.toFixed(1),
    perSecond: perSecond.toFixed(1),
    range: Math.round(ship.range(weapon)),
  });
}

/** The picture that follows the pointer while it is dragged */
function ghostOf(item: Item) {
  const texture = picture(item);
  const ghost = texture ? new Sprite({ texture, anchor: 0.5 }) : new Graphics().circle(0, 0, DRAG.size / 3).fill(LIT);
  ghost.width = ghost.height = DRAG.size;
  ghost.alpha = DRAG.alpha;
  return ghost;
}

function at<T extends Container>(thing: T, x: number, y: number) {
  thing.position.set(x, y);
  return thing;
}
