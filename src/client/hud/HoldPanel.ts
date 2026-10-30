import { Container, Graphics, Sprite, Text, type Point, type Rectangle, type Texture } from 'pixi.js';
import {
  GOOD_IDS,
  ITEM_IDS,
  cargoCount,
  marketShare,
  marketValue,
  type GameState,
  type GoodId,
  type ItemId,
  type Player,
  type Ship,
} from '../../game';
import {
  NIGHT,
  NIGHT_HEADER,
  NIGHT_WINDOW,
  drawNightCard,
  emblemMiddle,
  layBoardHead,
  moonButton,
  nightBoard,
  nightCorners,
  nightDivider,
  nightEmblem,
  nightHeader,
  type NightBoardLayout,
} from './nightTheme';
import { GOOD_ICONS, ITEM_ICONS } from './iconAtlas';
import { QUICK_KEYS, itemColor, itemHint } from './itemLook';
import { ScrollPane } from './ScrollPane';
import { THEME, drawMeter, iconSlot, subheading } from './theme';
import { Tooltip } from './Tooltip';
import { GOODS_LIST, drawGood, goodRow } from './goodIcons';
import {
  HudWindow,
  UI,
  compact,
  drawCrate,
  goldCoin,
  show,
  text,
  tint,
  whole,
  type ScreenEdges,
  type Tile,
} from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 680; // pixels, before scaling down to fit the screen
const PAD = 24;
const DIVIDER = PAD + NIGHT_HEADER.rule; // the gold line under the header
const HEADER_MIDDLE = PAD + NIGHT_HEADER.middle; // pixels: the header's middle, down the window
const TAB = { width: 150, height: 34, gap: 12, label: 14 } as const; // the tabs, in the header's middle
const TOP = DIVIDER + 18; // pixels: the first board's top
const GAP = 14; // pixels between the two boards
const INNER = WIDTH - PAD * 2; // pixels: the boards' width
const BOTTOM = PAD + 14; // pixels under the last board, clear of the window's bottom corner pieces
// A board, pixels: inside it, its corner pieces (high), its emblem's radius, its heading
const BOARD: NightBoardLayout = { pad: 20, corner: 26, emblem: 16, heading: { y: 12, size: 18 } };
const GLYPH = 20; // pixels: the sign drawn on a board's emblem, across
const EMBLEM_Y = emblemMiddle(BOARD);
const BOARD_STAR = 140; // pixels: the goods' board's divider's painted star, across
const ROWS_WIDTH = INNER - BOARD.pad * 2; // pixels: a good's row, inside its board
/** Pixels down the places' board: its meter, the line under it, and the room under that, clear of its corner pieces */
const PLACES = { meter: 48, note: 74, bottom: 22 } as const;
/** Pixels down the goods' board: the divider under its heading, the first row, and the room under the last */
const GOODS = { divider: 50, rows: 62, bottom: 22 } as const;
const { meter: METER, row: ROW, gap: ROW_GAP, empty: EMPTY } = GOODS_LIST;
const GOLD = 0xffcf3f; // what the goods fetch
const COIN = 7; // pixels: the radius of the coin before it
/** Pixels: the window with the items shown, as tall whatever is in the hold; down their board, the line on how to put
 * them on the bar (three lines in Ukrainian and Russian), the divider under it, and the items' pane */
const WARES = { height: 640, how: 44, divider: 100, pane: 112 } as const;
// An item's cell, pixels: its slot's side, the gap between two, the key of its quick slot in its corner
const CELL = { size: 74, gap: 10, key: 18 } as const;
const DRAG = { threshold: 5, size: 50, alpha: 0.85 } as const; // pixels moved before a press is a drag; the picture
const LIT = 0xffd447; // the hold lit while an item dragged off the skill bar can go back into it

/** What the hold window shows: the goods aboard, or the items bought for doubloons */
type HoldTab = 'cargo' | 'items';

/** What the hold window does: a game method, for the player of this client */
export interface HoldActions {
  /** Throws `count` of a good overboard, out of the ship's hold; whether any went */
  throwCargo: (good: GoodId, count: number) => boolean;
  /** Puts an item of the hold in a quick slot of the skill bar (one already on the bar moves), or empties it (null) */
  setQuickSlot: (slot: number, item: ItemId | null) => void;
  /** Moves the item in one quick slot to another, the two swapping */
  swapQuickSlots: (from: number, to: number) => void;
}

/** An item's cell in the hold: the item, and its picture with its count, dragged onto the skill bar */
interface Cell {
  readonly id: ItemId;
  readonly container: Container;
  readonly count: Text;
}

/** A press on an item's cell: where it started, and the picture following the pointer once it is a drag */
interface Press {
  readonly cell: Cell;
  readonly from: { readonly x: number; readonly y: number };
  ghost: Sprite | Graphics | null;
}

/**
 * The hold (H, or a click on the hold in the top right corner), in the night look like the loadout, a tab each for
 * what it holds. The cargo: on a board how full it is and what the goods aboard fetch at the market, and on another a
 * row a good, with buttons to throw them overboard (one, or all of a good), to make room for better ones floating
 * nearby. The items, bought for doubloons on the Golden Galleon, as many as the player likes, taking no room: a cell each with
 * how many, and the key of its quick slot if it is on the skill bar; dragged onto a quick slot it goes there (a click
 * puts it in the first empty one), and an item dragged off the bar into the window leaves the bar. Closed by its gold
 * cross, Escape, H or a click beside it
 */
export class HoldPanel {
  readonly container: Container;
  /** Over everything, the skill bar too: the picture of an item dragged */
  readonly dragLayer = new Container();
  private readonly window: HudWindow;
  private readonly actions: HoldActions;
  /** The skill bar's quick slots, to drop an item on; the bar told an item is dragged; what the bar takes at the
   * screen's top or bottom, which the window leaves clear */
  private readonly bar: {
    readonly quickSlotAt: (x: number, y: number) => number | null;
    readonly showDrop: (on: boolean) => void;
    readonly edges: () => ScreenEdges;
  };
  private tab: HoldTab = 'cargo';
  private readonly tabs: Readonly<Record<HoldTab, { readonly tile: Tile; readonly text: Text }>>;
  /** The cargo's boards */
  private readonly cargo = new Container();
  // The places' board: how many are taken, a meter of them, what the goods fetch
  private readonly summary: Text;
  private readonly worth = text('', 15, GOLD, { fontWeight: 'bold' });
  private readonly coin = goldCoin(COIN);
  private readonly meter = new Graphics();
  // The goods' board, as tall as its rows: its glass and corner pieces are drawn again with them
  private readonly goodsBoard = new Container();
  private readonly goodsFrame = new Graphics();
  private readonly goodsCorners = new Container();
  private readonly rows = new Container();
  /** The items' board */
  private readonly wares = new Container();
  private readonly waresCount = text('', 14, THEME.title, { fontWeight: 'bold' });
  private readonly waresEmblem = new Sprite();
  private readonly pane = new ScrollPane(ROWS_WIDTH, WARES.height - BOTTOM - TOP - WARES.pane - BOARD.pad);
  private cells: Cell[] = [];
  private hovered: Cell | null = null;
  private press: Press | null = null;
  private readonly tooltip = new Tooltip();
  /** The window's outline lit while an item dragged off the skill bar can go back into it */
  private readonly takeBack = new Graphics();
  /** How tall the window is now: the cargo's as tall as its rows, the items' as WARES */
  private height = TOP;
  /** The player as of the last frame: what a click acts on */
  private player: Player | null = null;
  /** What the open tab was built for: it is built again only when that changes */
  private builtFor = '';

  constructor(actions: HoldActions, screen: Rectangle, bar: HoldPanel['bar']) {
    this.actions = actions;
    this.bar = bar;
    this.window = new HudWindow(
      screen,
      { width: WIDTH, height: TOP, pad: PAD, clear: bar.edges },
      () => this.hide(),
      NIGHT_WINDOW,
    );
    this.container = this.window.container;

    // The header: a star, the title, the tabs and Close
    const header = nightHeader(WIDTH, PAD, t('Hold'));
    const tabsLeft = (WIDTH - TAB.width * 2 - TAB.gap) / 2;
    const tab = (id: HoldTab, label: string, i: number) => {
      const button = moonButton(TAB.width, TAB.height, t(label), () => this.showTab(id), TAB.label);
      button.tile.container.position.set(tabsLeft + i * (TAB.width + TAB.gap), HEADER_MIDDLE - TAB.height / 2);
      return button;
    };
    this.tabs = { cargo: tab('cargo', 'Cargo', 0), items: tab('items', 'Items', 1) };

    // The places taken, as tall as the line under its meter
    const note = text(
      t('Throw goods overboard to make room for better ones: what goes over the side sinks'),
      12,
      NIGHT.dim,
      { wordWrap: true, wordWrapWidth: ROWS_WIDTH, lineHeight: 15 },
    );
    note.position.set(BOARD.pad, PLACES.note);
    const placesHeight = PLACES.note + note.height + PLACES.bottom;
    // Its heading the places taken, told as they change
    const crate = new Graphics();
    drawCrate(crate, GLYPH * 0.8);
    const places = board(PAD, TOP, INNER, placesHeight, emblem(crate));
    this.summary = places.title;
    this.worth.anchor.set(1, 0.5);
    this.worth.position.set(INNER - BOARD.pad, EMBLEM_Y);
    this.meter.position.set(BOARD.pad, PLACES.meter);
    places.container.addChild(this.coin, this.worth, this.meter, note);

    // The goods aboard: a board as tall as its rows, drawn again as they change
    this.goodsBoard.position.set(PAD, TOP + placesHeight + GAP);
    const sack = emblem(drawGood(new Graphics(), 'spices', GLYPH));
    const heading = subheading(t('Goods aboard'), BOARD.heading.size);
    layBoardHead(BOARD, sack, heading);
    const goodsDivider = nightDivider(ROWS_WIDTH, BOARD_STAR);
    goodsDivider.position.set(BOARD.pad, GOODS.divider);
    this.rows.position.set(BOARD.pad, GOODS.rows);
    this.goodsBoard.addChild(this.goodsFrame, this.goodsCorners, sack, heading, goodsDivider, this.rows);
    this.cargo.addChild(places.container, this.goodsBoard);

    // The items: a painted one for the board's emblem
    this.waresEmblem.anchor.set(0.5);
    this.waresEmblem.visible = false;
    const waresBoard = board(PAD, TOP, INNER, WARES.height - BOTTOM - TOP, emblem(this.waresEmblem), t('Items'));
    this.waresCount.anchor.set(1, 0.5);
    this.waresCount.position.set(INNER - BOARD.pad, EMBLEM_Y);
    const how = text(
      t(
        'Drag an item onto a quick slot of the skill bar, or click it to put it in the first empty one. Bought on the Golden Galleon in port for doubloons, as many as you like: they take no room. Dragged off the bar back here, an item leaves it',
      ),
      12,
      NIGHT.dim,
      { wordWrap: true, wordWrapWidth: ROWS_WIDTH, lineHeight: 15 },
    );
    how.position.set(BOARD.pad, WARES.how);
    const waresDivider = nightDivider(ROWS_WIDTH, BOARD_STAR);
    waresDivider.position.set(BOARD.pad, WARES.divider);
    this.pane.container.position.set(BOARD.pad, WARES.pane);
    waresBoard.container.addChild(this.waresCount, how, waresDivider, this.pane.container);
    this.wares.addChild(waresBoard.container);

    this.takeBack.eventMode = 'none';
    this.takeBack.visible = false;
    // The tabs under the header: its divider's star over their lower edges
    this.window.panel.addChild(
      this.tabs.cargo.tile.container,
      this.tabs.items.tile.container,
      header.container,
      this.cargo,
      this.wares,
      this.takeBack,
      this.tooltip.container,
    );
    this.dragLayer.eventMode = 'none';
    ITEM_ICONS.load(() => (this.builtFor = ''));
    GOOD_ICONS.load(() => (this.builtFor = ''));
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.container.visible = true;
    this.builtFor = '';
  }

  hide() {
    this.endDrag();
    this.container.visible = false;
  }

  /**
   * Whether a point on the screen is over the open window, either tab: an item dragged off the skill bar and let go
   * there leaves the bar
   */
  takesBack(x: number, y: number) {
    if (!this.isOpen) return false;
    const local = this.window.panel.toLocal({ x, y });
    return local.x >= 0 && local.y >= 0 && local.x <= WIDTH && local.y <= this.height;
  }

  /** Lights the window while an item dragged off the skill bar can go back into it; false when the drag ends */
  showTakeBack(on: boolean) {
    this.takeBack.visible = on;
  }

  update(state: GameState) {
    const { ship, player } = state;
    this.player = player;
    if (!this.isOpen) return;
    const key =
      this.tab === 'cargo'
        ? `cargo:${ship.holdSize}:${GOOD_IDS.map((id) => ship.cargo[id] ?? 0).join()}`
        : `items:${owned(player).join()}:${player.quickSlots.join()}`;
    // Not while an item is dragged: it would be pulled from under the pointer
    if (key !== this.builtFor && !this.press) {
      this.builtFor = key;
      if (this.tab === 'cargo') this.buildCargo(ship);
      else this.buildItems(player);
    }
    this.cargo.visible = this.tab === 'cargo';
    this.wares.visible = this.tab === 'items';
    for (const id of ['cargo', 'items'] as const) this.tabs[id].tile.setLook({ pressed: id === this.tab });
    this.window.fit();
    if (this.tab === 'items') this.updateItems(player);
    else this.tooltip.point(null, 0, 0);
  }

  /** Turns to a tab, its board built for it */
  private showTab(tab: HoldTab) {
    if (tab === this.tab) return;
    this.endDrag();
    this.tab = tab;
    this.builtFor = '';
    this.hovered = null;
    this.pane.scrollTo(0);
  }

  /** The window as tall as its tab's boards, and its outline for an item dragged back drawn round them */
  private resize(height: number) {
    this.height = height;
    this.window.resize(height);
    this.takeBack
      .clear()
      .roundRect(PAD - 4, TOP - 4, INNER + 8, height - BOTTOM - TOP + 8, 10)
      .fill({ color: LIT, alpha: 0.06 })
      .stroke({ width: 2, color: LIT, alpha: 0.7 });
  }

  /** The places' figures and meter, then a row for every good aboard, the goods' board and the window as tall as them */
  private buildCargo(ship: Ship) {
    const cargo = cargoCount(ship.cargo);
    const full = cargo >= ship.holdSize;
    show(this.summary, t('{cargo} of {size} places taken', { cargo, size: ship.holdSize }));
    tint(this.summary, full ? UI.bad : THEME.title);
    show(this.worth, t('{n} at the market', { n: whole(marketValue(ship)) }));
    this.coin.position.set(this.worth.x - this.worth.width - COIN - 5, this.worth.y);
    const share = ship.holdSize > 0 ? cargo / ship.holdSize : 0;
    drawMeter(this.meter.clear(), ROWS_WIDTH, METER, share, full ? UI.bad : THEME.brass, ship.holdSize);

    for (const child of this.rows.removeChildren()) child.destroy({ children: true });
    const aboard = GOOD_IDS.filter((id) => (ship.cargo[id] ?? 0) > 0);
    if (aboard.length === 0) {
      const empty = text(
        t('The hold is empty: sunk ships leave goods floating, sail over them to haul them aboard'),
        13,
        NIGHT.dim,
        { wordWrap: true, wordWrapWidth: ROWS_WIDTH - 32, align: 'center' },
      );
      empty.anchor.set(0.5);
      empty.position.set(ROWS_WIDTH / 2, EMPTY / 2);
      this.rows.addChild(drawNightCard(new Graphics(), ROWS_WIDTH, EMPTY), empty);
    }
    aboard.forEach((id, i) => {
      const row = this.row(id, ship.cargo[id] ?? 0, marketShare(ship));
      row.position.set(0, i * (ROW + ROW_GAP));
      this.rows.addChild(row);
    });
    const rows = aboard.length === 0 ? EMPTY : aboard.length * (ROW + ROW_GAP) - ROW_GAP;
    const height = GOODS.rows + rows + GOODS.bottom;
    drawNightCard(this.goodsFrame.clear(), INNER, height);
    for (const corners of this.goodsCorners.removeChildren()) corners.destroy({ children: true });
    this.goodsCorners.addChild(nightCorners(INNER, height, BOARD.corner, 'corner1', 2));
    this.resize(this.goodsBoard.y + height + BOTTOM);
  }

  /** A good's row, with its two buttons; what it fetches at `share` of its price (the captain's mastery) */
  private row(id: GoodId, count: number, share: number) {
    return goodRow(
      id,
      count,
      ROWS_WIDTH,
      [
        { label: t('Throw 1'), onTap: () => this.actions.throwCargo(id, 1) },
        { label: t('Throw all'), onTap: () => this.actions.throwCargo(id, count) },
      ],
      share,
    );
  }

  /** A cell for every item in the hold, in the galleon's order, rows of them in the pane; or a word on where to buy them */
  private buildItems(player: Player) {
    for (const child of this.pane.content.removeChildren()) child.destroy({ children: true });
    this.cells = [];
    this.hovered = null;
    const emblemTexture = ITEM_ICONS.get('captainsScroll');
    this.waresEmblem.visible = emblemTexture !== null;
    if (emblemTexture) {
      this.waresEmblem.texture = emblemTexture;
      this.waresEmblem.setSize(BOARD.emblem * 2 - 4);
    }
    const ids = owned(player);
    const pieces = ids.reduce((sum, id) => sum + (player.items[id] ?? 0), 0);
    show(
      this.waresCount,
      ids.length > 0 ? t('{kinds} kinds · {n} in all', { kinds: ids.length, n: whole(pieces) }) : '',
    );
    if (ids.length === 0) {
      const empty = text(
        t('No items yet: they are bought for doubloons on the Golden Galleon in port'),
        13,
        NIGHT.dim,
        { wordWrap: true, wordWrapWidth: this.pane.inner - 32, align: 'center' },
      );
      empty.anchor.set(0.5);
      empty.position.set(this.pane.inner / 2, EMPTY / 2);
      this.pane.content.addChild(drawNightCard(new Graphics(), this.pane.inner, EMPTY), empty);
      this.pane.setContentHeight(EMPTY);
    } else {
      const columns = Math.max(1, Math.floor((this.pane.inner + CELL.gap) / (CELL.size + CELL.gap)));
      ids.forEach((id, i) => this.cell(id, player, (i % columns) * (CELL.size + CELL.gap), Math.floor(i / columns)));
      this.pane.setContentHeight(Math.ceil(ids.length / columns) * (CELL.size + CELL.gap) - CELL.gap);
    }
    this.resize(WARES.height);
  }

  /**
   * An item's cell at `x` in a row of the pane: its painted picture in a slot lit in its grade's colour, how many,
   * and its quick slot's key in its corner while it is on the bar; what a press, a drag and the pointer over it do
   */
  private cell(id: ItemId, player: Player, x: number, row: number) {
    const container = new Container();
    container.position.set(x, row * (CELL.size + CELL.gap));
    const slot = iconSlot(CELL.size, itemColor(id), '', false);
    slot.show(ITEM_ICONS.get(id));
    const count = text('', 13, THEME.text, { fontWeight: 'bold', stroke: { color: NIGHT.rim, width: 3 } });
    count.anchor.set(1, 1);
    count.position.set(CELL.size - 6, CELL.size - 3);
    container.addChild(slot.container, count);
    const key = player.quickSlots.indexOf(id);
    if (key >= 0) {
      const badge = new Graphics()
        .roundRect(3, 3, CELL.key, CELL.key, 4)
        .fill({ color: THEME.brass })
        .stroke({ width: 1, color: THEME.brassDark });
      const digit = text(QUICK_KEYS[key], 12, THEME.darkText, { fontWeight: 'bold' });
      digit.anchor.set(0.5);
      digit.position.set(3 + CELL.key / 2, 3 + CELL.key / 2);
      container.addChild(badge, digit);
    }
    container.eventMode = 'static';
    container.cursor = 'pointer';
    const cell: Cell = { id, container, count };
    container.on('pointerdown', (e) => {
      // Not the stage's: it would steer the ship
      e.stopPropagation();
      this.press = { cell, from: { x: e.global.x, y: e.global.y }, ghost: null };
    });
    container.on('globalpointermove', (e) => this.drag(cell, e.global));
    container.on('pointerup', (e) => this.release(cell, e.global));
    container.on('pointerupoutside', (e) => this.release(cell, e.global));
    container.on('pointerover', () => (this.hovered = cell));
    container.on('pointerout', () => {
      if (this.hovered === cell) this.hovered = null;
    });
    this.pane.content.addChild(container);
    this.cells.push(cell);
  }

  /** The counts, and the tooltip over the item under the pointer (none while one is dragged) */
  private updateItems(player: Player) {
    for (const cell of this.cells) show(cell.count, compact(player.items[cell.id] ?? 0));
    const cell = this.press?.ghost ? null : this.hovered;
    if (!cell || !this.pane.shows(cell.container.getGlobalPosition())) {
      this.tooltip.point(null, 0, 0);
      return;
    }
    const at = this.window.panel.toLocal(cell.container.getGlobalPosition());
    const how = [
      player.quickSlots.includes(cell.id)
        ? t('On the skill bar: drag it off the bar back here to take it off')
        : t('Drag it onto a quick slot of the skill bar, or click it'),
    ];
    this.tooltip.point(itemHint(player, cell.id, how), at.x + CELL.size / 2, at.y, {
      width: WIDTH,
      under: at.y + CELL.size,
    });
  }

  private drag(cell: Cell, point: Point) {
    const press = this.press;
    if (press?.cell !== cell) return;
    if (!press.ghost) {
      if (Math.hypot(point.x - press.from.x, point.y - press.from.y) < DRAG.threshold) return;
      press.ghost = ghostOf(cell.id);
      this.dragLayer.addChild(press.ghost);
      this.bar.showDrop(true);
    }
    press.ghost.position.set(point.x, point.y);
  }

  /** A drag let go over a quick slot puts the item there; a click puts it in the first empty one, if it isn't on the bar */
  private release(cell: Cell, point: Point) {
    const press = this.press;
    if (press?.cell !== cell) return;
    const dragged = press.ghost !== null;
    this.endDrag();
    if (dragged) {
      const slot = this.bar.quickSlotAt(point.x, point.y);
      if (slot !== null) this.actions.setQuickSlot(slot, cell.id);
      return;
    }
    const slots = this.player?.quickSlots;
    const empty = slots?.indexOf(null) ?? -1;
    if (slots && !slots.includes(cell.id) && empty >= 0) this.actions.setQuickSlot(empty, cell.id);
  }

  private endDrag() {
    if (this.press?.ghost) this.press.ghost.destroy();
    this.press = null;
    this.bar.showDrop(false);
  }
}

/** The kinds of item the player has, in the galleon's order */
function owned(player: Player) {
  return ITEM_IDS.filter((id) => (player.items[id] ?? 0) > 0);
}

/** The picture of an item that follows the pointer while it is dragged */
function ghostOf(id: ItemId) {
  const texture: Texture | null = ITEM_ICONS.get(id);
  const ghost = texture
    ? new Sprite({ texture, anchor: 0.5 })
    : new Graphics().circle(0, 0, DRAG.size / 3).fill(itemColor(id));
  ghost.width = ghost.height = DRAG.size;
  ghost.alpha = DRAG.alpha;
  return ghost;
}

/** A board's emblem: `sign` (drawn round (0, 0), or painted) in a dark well under a brass ring */
function emblem(sign: Container) {
  return nightEmblem(BOARD.emblem, sign);
}

/** A board of blue glass at (x, y), `width` × `height` pixels, with its corner pieces, `sign` (its emblem) and heading */
function board(x: number, y: number, width: number, height: number, sign: Container, heading?: string) {
  const made = nightBoard(width, height, BOARD, sign, heading);
  made.container.position.set(x, y);
  return made;
}
