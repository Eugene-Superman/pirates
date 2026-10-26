import { Container, Graphics, Sprite, Text, type Point, type Rectangle, type Texture } from 'pixi.js';
import {
  AMMO,
  AMMO_IDS,
  GUNS,
  GUN_IDS,
  WEAPON_IDS,
  averageDamage,
  type AmmoId,
  type GunId,
  type Player,
  type Ship,
  type WeaponId,
} from '../../game';
import { AMMO_ICONS, GUN_ICONS } from './iconAtlas';
import { SkillBar } from './SkillBar';
import { THEME, THEMED_WINDOW, TITLE_STYLE, drawDivider, iconSlot, subheading } from './theme';
import { HudWindow, clip, show, text, tierColor } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1040; // pixels, before scaling down to fit the screen
const PAD = 24;
const DIVIDER = PAD + 50; // the gold line under the title
const TOP = DIVIDER + 16; // where the columns start
const COLUMN = 480; // pixels: each column's width, the ship's on the left, the hold's on the right
const RIGHT = PAD + COLUMN + 32; // where the hold's column starts
const CELL = 54; // an item's picture
const CELL_GAP = 6;
const PER_ROW = 8;
const NAME_HEIGHT = 15; // an item's name under its picture
const ROW = CELL + NAME_HEIGHT + 6;
const HEADING = 26; // a section's heading
const SUMMARY = 18; // a weapon's figures under its heading
const SECTION_GAP = 12;
const HINT = 36; // the line at the bottom: what is under the pointer, or what can be done
const DRAG = { threshold: 5, size: 50, alpha: 0.85 } as const; // pixels moved before a press is a drag; the picture
const TAKE_OFF = 18; // pixels: the × on a fitted gun or an ammo at hand
const EMPTY_GLOW = 0x6b5a45; // an empty place's
const LIT = 0xffd447; // the slot picked, the ammo loaded, and the places that take what is dragged
const SLOT_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannons', harpoon: 'Harpoon guns' };
const AMMO_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannonballs', harpoon: 'Harpoons' };

export interface LoadoutActions {
  /** Fits a gun from the hold into one of its weapon's slots, or empties the slot (null): the old gun goes to the hold */
  fitGun: (weapon: WeaponId, slot: number, gun: GunId | null) => void;
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

/** A picture in the window: its place, name under it, the count over it, and the frame that lights it */
interface Cell {
  readonly item: Item;
  readonly container: Container;
  readonly frame: Graphics;
  readonly count: Text | null;
}

/** A press on a picture: where it started, and the picture following the pointer once it is a drag */
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

/** Rows a section of `count` pictures takes */
function rows(count: number) {
  return Math.max(1, Math.ceil(count / PER_ROW));
}

/**
 * The loadout window (L, or its button on the minimap's frame), in the port's look: on the left the ship, its gun slots of
 * each weapon with their figures, and its ammo at hand, two kinds a weapon, as on the skill bar under the window; on
 * the right what is in the hold, guns and ammo, each with its picture as in the arsenal. A click on a slot picks it, a
 * click on a gun in the hold fits it there, the × takes one off; ammo from the hold is put at hand with a click or
 * dragged onto a place here or on the bar below, and an ammo at hand is loaded with a click or dragged back to the
 * hold. Closed by Close, Escape, L or a click beside it
 */
export class LoadoutPanel {
  readonly container: Container;
  /** Over everything, the skill bar too: the picture dragged */
  readonly dragLayer = new Container();
  private readonly window: HudWindow;
  private readonly body = new Container();
  private readonly hint = text('', 12, THEME.dim, { wordWrap: true, wordWrapWidth: WIDTH - PAD * 2 });
  /** Each weapon's figures under its heading: made again with the pictures, as they live in the same container */
  private summaries: Record<WeaponId, Text> = { cannon: text('', 12, THEME.dim), harpoon: text('', 12, THEME.dim) };
  /** Where things dragged out of the ship go back to the hold */
  private readonly holdArea = new Graphics();
  private readonly actions: LoadoutActions;
  /** Where on the skill bar ammo dragged out of the window would go, if anywhere; and the bar told what is dragged */
  private readonly bar: {
    readonly placeAt: (x: number, y: number) => { readonly weapon: WeaponId; readonly index: number } | null;
    readonly showDrop: (weapon: WeaponId | null) => void;
  };
  /** As tall as the taller column: the window grows and shrinks with what the ship and the hold have */
  private height = TOP + HINT + PAD;
  private readonly line = new Graphics();
  private cells: Cell[] = [];
  /** The slot of each weapon a gun from the hold goes into */
  private readonly picked: Record<WeaponId, number> = { cannon: 0, harpoon: 0 };
  private press: Press | null = null;
  private hovered: Cell | null = null;
  /** The ship as of the last frame: what a click acts on */
  private ship: Ship | null = null;
  /** What the pictures were made for, to make them again only when it changes */
  private builtFor = '';

  /** bar: the skill bar's places, to drop ammo on */
  constructor(actions: LoadoutActions, screen: Rectangle, bar: LoadoutPanel['bar']) {
    this.actions = actions;
    this.bar = bar;
    this.window = new HudWindow(
      screen,
      { width: WIDTH, height: this.height, pad: PAD, bottom: SkillBar.ROOM },
      () => this.hide(),
      THEMED_WINDOW,
    );
    this.container = this.window.container;
    const title = new Text({ text: t('Loadout'), style: { ...TITLE_STYLE, fontSize: 28 } });
    title.position.set(PAD, PAD - 6);
    const note = text(t('Guns and ammo aboard: what is fitted and at hand, and what waits in the hold'), 13, THEME.dim);
    note.position.set(PAD, PAD + 30);
    this.holdArea.eventMode = 'none';
    this.window.panel.addChild(
      title,
      note,
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      this.holdArea,
      this.body,
      this.line,
      this.hint,
    );
    this.dragLayer.eventMode = 'none';
    GUN_ICONS.load(() => (this.builtFor = ''));
    AMMO_ICONS.load(() => (this.builtFor = ''));
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.container.visible = true;
  }

  hide() {
    this.endDrag();
    this.container.visible = false;
  }

  update(ship: Ship, player: Player) {
    this.ship = ship;
    if (!this.isOpen) return;
    const key = this.layoutKey(ship, player);
    // Not while a picture is dragged: it would be pulled from under the pointer
    if (key !== this.builtFor && !this.press) {
      this.builtFor = key;
      this.build(ship, player);
    }
    this.window.fit();
    for (const weapon of WEAPON_IDS) show(this.summaries[weapon], summary(ship, weapon));
    const dragged = this.press?.ghost ? this.press.cell.item : null;
    for (const cell of this.cells) {
      const { item } = cell;
      if (cell.count) {
        // How many in the hold; for ammo at hand, how many shots of it there are (one run out has left its place)
        const n = item.kind === 'gun' ? (player.hold[item.gun] ?? 0) : item.kind === 'ammo' ? ship.ammo[item.ammo] : 0;
        const shots = item.kind === 'place' && item.ammo ? ship.ammo[item.ammo] : null;
        show(cell.count, shots !== null ? `${shots}` : n > 0 ? `${n}` : '');
      }
      const lit = dragged
        ? takes(cell.item, dragged)
        : (item.kind === 'slot' && this.picked[item.weapon] === item.slot) ||
          (item.kind === 'place' && item.ammo !== null && ship.loaded[item.weapon] === item.ammo);
      cell.frame.visible = lit;
    }
    this.holdArea.alpha = dragged && (dragged.kind === 'slot' || dragged.kind === 'place') ? 1 : 0;
    show(this.hint, this.hovered ? describe(this.hovered.item, ship) : t(DEFAULT_HINT));
  }

  /** What the pictures show: the slots' guns, the ammo at hand, the kinds in the hold */
  private layoutKey(ship: Ship, player: Player) {
    const guns = GUN_IDS.cannon.concat(GUN_IDS.harpoon).filter((gun) => (player.hold[gun] ?? 0) > 0);
    const ammo = AMMO_IDS.cannon.concat(AMMO_IDS.harpoon).filter((id) => ship.ammo[id] > 0);
    return JSON.stringify([ship.guns, ship.ammoBar, guns, ammo, this.picked]);
  }

  private build(ship: Ship, player: Player) {
    for (const child of this.body.removeChildren()) child.destroy({ children: true });
    this.cells = [];
    this.hovered = null;
    this.summaries = { cannon: text('', 12, THEME.dim), harpoon: text('', 12, THEME.dim) };

    // The ship: each weapon's slots, then the ammo at hand
    let y = TOP;
    this.body.addChild(at(subheading(t('Your ship'), 18), PAD, y));
    y += HEADING;
    for (const weapon of WEAPON_IDS) {
      if (this.picked[weapon] >= ship.guns[weapon].length) this.picked[weapon] = 0;
      this.body.addChild(at(subheading(t(SLOT_NAMES[weapon]), 15), PAD, y), at(this.summaries[weapon], PAD, y + 20));
      y += HEADING + SUMMARY;
      ship.guns[weapon].forEach((gun, slot) => this.cell({ kind: 'slot', weapon, slot, gun }, PAD, y, slot));
      y += rows(ship.guns[weapon].length) * ROW + SECTION_GAP;
    }
    this.body.addChild(at(subheading(t('Ammo at hand: on the bar below (Z, X)'), 15), PAD, y));
    y += HEADING;
    WEAPON_IDS.forEach((weapon, w) => {
      const x = PAD + w * (2 * (CELL + CELL_GAP) + 48);
      this.body.addChild(at(text(t(AMMO_NAMES[weapon]), 11, THEME.dim, { fontWeight: 'bold' }), x, y));
      ship.ammoBar[weapon].forEach((ammo, index) =>
        this.cell({ kind: 'place', weapon, index, ammo }, x, y + NAME_HEIGHT, index),
      );
    });
    const shipBottom = y + NAME_HEIGHT + ROW;

    // The hold: guns of each weapon, then the ammo not at hand of each
    y = TOP;
    this.body.addChild(at(subheading(t('In the hold'), 18), RIGHT, y));
    y += HEADING;
    const top = y;
    for (const weapon of WEAPON_IDS) {
      const guns = GUN_IDS[weapon].filter((gun) => (player.hold[gun] ?? 0) > 0);
      y = this.holdSection(
        t(SLOT_NAMES[weapon]),
        y,
        guns.map((gun) => ({ kind: 'gun', gun }) as const),
        t('None'),
      );
    }
    for (const weapon of WEAPON_IDS) {
      const ammo = AMMO_IDS[weapon].filter((id) => ship.ammo[id] > 0 && !ship.ammoBar[weapon].includes(id));
      y = this.holdSection(
        t(AMMO_NAMES[weapon]),
        y,
        ammo.map((id) => ({ kind: 'ammo', ammo: id }) as const),
        t('None'),
      );
    }
    this.fitHeight(Math.max(shipBottom, y - SECTION_GAP) + SECTION_GAP + HINT + PAD);
    // Where guns taken off and ammo put away are dropped: the hold's column, lit while one is dragged
    this.holdArea
      .clear()
      .roundRect(RIGHT - 10, top - 6, COLUMN + 20, this.height - PAD - HINT - top, 8)
      .fill({ color: LIT, alpha: 0.06 })
      .stroke({ width: 2, color: LIT, alpha: 0.7 });
  }

  /** The window made as tall as what it shows, the line at the bottom under it */
  private fitHeight(height: number) {
    if (height === this.height) return;
    this.height = height;
    this.window.resize(height);
    drawDivider(this.line.clear(), PAD, height - PAD - HINT, WIDTH - PAD * 2);
    this.hint.position.set(PAD, height - PAD - HINT + 8);
  }

  /** A heading and the pictures under it, or a word that there are none; returns where the next one starts */
  private holdSection(title: string, y: number, items: readonly Item[], none: string) {
    this.body.addChild(at(subheading(title, 15), RIGHT, y));
    y += HEADING;
    if (items.length === 0) this.body.addChild(at(text(none, 12, THEME.dim), RIGHT, y + 4));
    items.forEach((item, i) => this.cell(item, RIGHT, y, i));
    return y + (items.length === 0 ? 24 : rows(items.length) * ROW) + SECTION_GAP;
  }

  /** A picture at the `i`th place of a grid from (x, y): its slot, name under it, count over it, and what it does */
  private cell(item: Item, x: number, y: number, i: number) {
    const container = new Container();
    container.position.set(x + (i % PER_ROW) * (CELL + CELL_GAP), y + Math.floor(i / PER_ROW) * ROW);
    const tier = tierOf(item);
    const chip =
      item.kind === 'slot' ? `${item.slot + 1}` : item.kind === 'place' ? `${item.index + 1}` : `T${tier ?? 1}`;
    const slot = iconSlot(CELL, tier === null ? EMPTY_GLOW : tierColor(tier), chip, false);
    slot.show(picture(item));
    const frame = new Graphics().roundRect(-3, -3, CELL + 6, CELL + 6, 9).stroke({ width: 2.5, color: LIT });
    frame.visible = false;
    const name = text(nameOf(item), 10, tier === null ? THEME.dim : THEME.text);
    name.anchor.set(0.5, 0);
    name.position.set(CELL / 2, CELL + 2);
    clip(name, CELL + CELL_GAP);
    container.addChild(slot.container, frame, name);
    // Counts over the picture: how many in the hold, or how many shots of an ammo at hand
    let count: Text | null = null;
    if (item.kind === 'gun' || item.kind === 'ammo' || item.kind === 'place') {
      count = text('', 12, THEME.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } });
      count.position.set(5, 3);
      container.addChild(count);
    }
    if ((item.kind === 'slot' && item.gun) || (item.kind === 'place' && item.ammo))
      container.addChild(this.takeOff(item));
    container.eventMode = 'static';
    container.cursor = 'pointer';
    const cell: Cell = { item, container, frame, count };
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
    this.body.addChild(container);
    this.cells.push(cell);
  }

  /** The × in a picture's corner: takes a gun off into the hold, or puts an ammo at hand back */
  private takeOff(item: Item) {
    const button = new Container();
    const r = TAKE_OFF / 2;
    const look = new Graphics()
      .circle(r, r, r)
      .fill({ color: 0x2b1a10 })
      .stroke({ width: 1.5, color: THEME.brass })
      .moveTo(r - 4, r - 4)
      .lineTo(r + 4, r + 4)
      .moveTo(r + 4, r - 4)
      .lineTo(r - 4, r + 4)
      .stroke({ width: 2, color: THEME.text, cap: 'round' });
    button.addChild(look);
    button.position.set(CELL - TAKE_OFF + 4, -4);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.on('pointerdown', (e) => e.stopPropagation());
    button.on('pointertap', (e) => {
      e.stopPropagation();
      this.remove(item);
    });
    return button;
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

  /** What a click on a picture does */
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
        break;
      }
      case 'ammo':
        this.putAtHand(item.ammo);
        break;
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
      (cell) => takes(cell.item, item) && cell.container.getBounds().containsPoint(point.x, point.y),
    );
    if (target) {
      const into = target.item;
      if (into.kind === 'slot' && item.kind === 'gun') this.actions.fitGun(into.weapon, into.slot, item.gun);
      if (into.kind === 'place') this.actions.setAmmoSlot(into.weapon, into.index, ammoOf(item));
      return;
    }
    if ((item.kind === 'slot' || item.kind === 'place') && this.holdArea.getBounds().containsPoint(point.x, point.y)) {
      this.remove(item);
      return;
    }
    const place = this.bar.placeAt(point.x, point.y);
    const ammo = ammoOf(item);
    if (place && ammo && AMMO[ammo].weapon === place.weapon) this.actions.setAmmoSlot(place.weapon, place.index, ammo);
  }

  /** A gun taken off into the hold, or an ammo at hand put back */
  private remove(item: Item) {
    if (item.kind === 'slot') this.actions.fitGun(item.weapon, item.slot, null);
    else if (item.kind === 'place') this.actions.setAmmoSlot(item.weapon, item.index, null);
  }
}

/** The line at the bottom while the pointer is over no picture */
const DEFAULT_HINT =
  'Click a slot, then a gun in the hold to fit it there; × takes one off. Drag ammo from the hold onto a place at hand or onto the bar below; a click on ammo at hand loads it';

/** Whether a picture takes what is dragged onto it: a slot a gun of its weapon, a place an ammo of its weapon */
function takes(into: Item, dragged: Item) {
  if (into === dragged) return false;
  if (into.kind === 'slot') return dragged.kind === 'gun' && GUNS[dragged.gun].weapon === into.weapon;
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

/** The line at the bottom about the picture under the pointer */
function describe(item: Item, ship: Ship) {
  if (item.kind === 'slot') {
    const where = t('{weapon}, slot {slot}', { weapon: t(SLOT_NAMES[item.weapon]), slot: item.slot + 1 });
    if (!item.gun) return `${where}: ${t('empty: click it, then a gun in the hold')}`;
    return `${where}: ${t(GUNS[item.gun].name)} · ${gunStats(item.gun)} · ${shot(ship, item.gun)}`;
  }
  if (item.kind === 'gun') return `${t(GUNS[item.gun].name)} · ${gunStats(item.gun)} · ${shot(ship, item.gun)}`;
  const ammo = ammoOf(item);
  if (!ammo) return t('An empty place at hand: drag ammo here or onto the bar below');
  const { name, bonus } = AMMO[ammo];
  const loaded = ship.loaded[AMMO[ammo].weapon] === ammo;
  return `${t(name)} · ${t('+{n} to every hit', { n: bonus })} · ${t('{n} aboard', { n: ship.ammo[ammo] })}${
    loaded ? ` · ${t('Loaded')}` : ''
  }`;
}

/** What a gun hits for a shot with its weapon's ammo loaded now */
function shot(ship: Ship, gun: GunId) {
  const bonus = AMMO[ship.loaded[GUNS[gun].weapon]].bonus;
  return t('≈{damage} a shot', { damage: averageDamage(GUNS[gun], bonus).toFixed(1) });
}

/** A weapon's guns fitted, what a volley of them does and how far they reach */
function summary(ship: Ship, weapon: WeaponId) {
  const bonus = AMMO[ship.loaded[weapon]].bonus;
  const fitted = ship.fittedGuns(weapon);
  if (fitted.length === 0) return t('No guns fitted');
  const volley = fitted.reduce((sum, { gun }) => sum + averageDamage(gun, bonus), 0);
  const perSecond = fitted.reduce((sum, { gun }) => sum + averageDamage(gun, bonus) / gun.reload, 0);
  return t(
    '{n} gun · ≈{volley} a volley · {perSecond}/s · reach {range}|{n} guns · ≈{volley} a volley · {perSecond}/s · reach {range}',
    { n: fitted.length, volley: volley.toFixed(1), perSecond: perSecond.toFixed(1), range: ship.range(weapon) },
  );
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
