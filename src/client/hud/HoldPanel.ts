import { Container, Graphics, Text, type Rectangle } from 'pixi.js';
import { GOOD_IDS, cargoCount, cargoValue, type GoodId, type Ship } from '../../game';
import { THEME, THEMED_WINDOW, TITLE_STYLE, drawCard, drawDivider, drawMeter, subheading } from './theme';
import { GOODS_LIST, goodRow } from './goodIcons';
import { HudWindow, UI, drawCoin, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 640; // pixels, before scaling down to fit the screen
const PAD = 24;
const DIVIDER = PAD + 50; // the gold line under the title
const TOP = DIVIDER + 16; // where the hold's board starts
const INNER = WIDTH - PAD * 2; // pixels: the boards' width
const { board: BOARD, meter: METER, heading: HEADING, row: ROW, gap: ROW_GAP, empty: EMPTY } = GOODS_LIST;
const ROWS = TOP + BOARD + 18; // where the heading over the goods is
const GOLD = 0xffcf3f;

/** What the hold window does: a game method, for the player of this client */
export interface HoldActions {
  /** Throws `count` of a good overboard, out of the ship's hold; whether any went */
  throwCargo: (good: GoodId, count: number) => boolean;
}

/**
 * The hold (H, or a click on the hold in the top right corner), in the port's look like the loadout: how full it is,
 * and on a board a good the goods aboard with what they fetch at the market, and buttons to throw them overboard (one,
 * or all of a good), to make room for better ones floating nearby. Closed by Close, Escape, H or a click beside it
 */
export class HoldPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly actions: HoldActions;
  private readonly summary = text('', 15, THEME.text, { fontWeight: 'bold' });
  private readonly worth = text('', 14, GOLD, { fontWeight: 'bold' });
  private readonly coin = new Graphics();
  private readonly meter = new Graphics();
  private readonly rows = new Container();
  /** The cargo and the hold's size the window was built for: it is built again only when they change */
  private builtFor = '';

  constructor(actions: HoldActions, screen: Rectangle) {
    this.actions = actions;
    this.window = new HudWindow(screen, { width: WIDTH, height: ROWS, pad: PAD }, () => this.hide(), THEMED_WINDOW);
    this.container = this.window.container;
    const title = new Text({ text: t('Hold'), style: { ...TITLE_STYLE, fontSize: 28 } });
    title.position.set(PAD, PAD - 6);
    const note = text(
      t('Throw goods overboard to make room for better ones: what goes over the side sinks'),
      13,
      THEME.dim,
    );
    note.position.set(PAD, PAD + 30);
    const board = new Container();
    board.position.set(PAD, TOP);
    this.summary.position.set(16, 12);
    this.worth.anchor.set(1, 0);
    this.worth.position.set(INNER - 16, 13);
    drawCoin(this.coin, 7);
    this.meter.position.set(16, 40);
    board.addChild(drawCard(new Graphics(), INNER, BOARD), this.summary, this.coin, this.worth, this.meter);
    const heading = subheading(t('Goods aboard'), 18);
    heading.position.set(PAD, ROWS);
    this.rows.position.set(PAD, ROWS + HEADING);
    this.window.panel.addChild(
      title,
      note,
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      board,
      heading,
      this.rows,
    );
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    this.container.visible = !this.container.visible;
    this.builtFor = '';
  }

  hide() {
    this.container.visible = false;
  }

  update(ship: Ship) {
    if (!this.isOpen) return;
    const key = `${ship.holdSize}:${GOOD_IDS.map((id) => ship.cargo[id] ?? 0).join()}`;
    if (key !== this.builtFor) {
      this.builtFor = key;
      this.build(ship);
    }
    this.window.fit();
  }

  /** The board's figures and meter, then a row for every good aboard, the window as tall as they are */
  private build(ship: Ship) {
    const cargo = cargoCount(ship.cargo);
    const full = cargo >= ship.holdSize;
    show(this.summary, t('{cargo} of {size} places taken', { cargo, size: ship.holdSize }));
    tint(this.summary, full ? UI.bad : THEME.text);
    show(this.worth, t('Worth {n} gold at the market', { n: cargoValue(ship.cargo) }));
    this.coin.position.set(this.worth.x - this.worth.width - 12, this.worth.y + this.worth.height / 2);
    const share = ship.holdSize > 0 ? cargo / ship.holdSize : 0;
    drawMeter(this.meter.clear(), INNER - 32, METER, share, full ? UI.bad : THEME.brass, ship.holdSize);

    for (const child of this.rows.removeChildren()) child.destroy({ children: true });
    const aboard = GOOD_IDS.filter((id) => (ship.cargo[id] ?? 0) > 0);
    if (aboard.length === 0) {
      const empty = text(
        t('The hold is empty: sunk ships leave goods floating, sail over them to haul them aboard'),
        13,
        THEME.dim,
        { wordWrap: true, wordWrapWidth: INNER - 32, align: 'center' },
      );
      empty.anchor.set(0.5);
      empty.position.set(INNER / 2, EMPTY / 2);
      this.rows.addChild(drawCard(new Graphics(), INNER, EMPTY), empty);
      this.window.resize(ROWS + HEADING + EMPTY + PAD);
      return;
    }
    aboard.forEach((id, i) => {
      const row = this.row(id, ship.cargo[id] ?? 0);
      row.position.set(0, i * (ROW + ROW_GAP));
      this.rows.addChild(row);
    });
    this.window.resize(ROWS + HEADING + aboard.length * (ROW + ROW_GAP) - ROW_GAP + PAD);
  }

  /** A good's row, with its two buttons */
  private row(id: GoodId, count: number) {
    return goodRow(id, count, INNER, [
      { label: t('Throw 1'), onTap: () => this.actions.throwCargo(id, 1) },
      { label: t('Throw all'), onTap: () => this.actions.throwCargo(id, count) },
    ]);
  }
}
