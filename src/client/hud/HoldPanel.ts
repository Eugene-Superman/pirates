import { Container, Graphics, type Rectangle } from 'pixi.js';
import { GOODS, GOOD_IDS, cargoCount, cargoValue, type GoodId, type Ship } from '../../game';
import { HudWindow, UI, labelButton, show, text } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 580; // pixels, before scaling down to fit the screen
const HEIGHT = 510;
const PAD = 18;
const TOP = 92; // where the rows start
const ROW = 42; // pixels a good's row
const ROW_GAP = 6;
const BUTTON = { width: 108, height: 28 } as const;
const GOLD = 0xffcf3f;

/** What the hold window does: a game method, for the player of this client */
export interface HoldActions {
  /** Throws `count` of a good overboard, out of the ship's hold; whether any went */
  throwCargo: (good: GoodId, count: number) => boolean;
}

/**
 * The hold (H, or a click on the hold in the top right corner): the goods aboard, what they fetch at the market, and
 * buttons to throw them overboard (one, or all of a good), to make room for better ones floating nearby. Closed by
 * Close, Escape, H or a click beside it
 */
export class HoldPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly actions: HoldActions;
  private readonly summary = text('', 14, UI.text, { fontWeight: 'bold' });
  private readonly worth = text('', 13, GOLD, { fontWeight: 'bold' });
  private readonly rows = new Container();
  /** The cargo the rows were built for: they are built again only when it changes */
  private builtFor = '';

  constructor(actions: HoldActions, screen: Rectangle) {
    this.actions = actions;
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide());
    this.container = this.window.container;
    const title = text(t('Hold'), 20, UI.active, { fontWeight: 'bold' });
    title.position.set(PAD, PAD);
    const note = text(
      t('Throw goods overboard to make room for better ones: what goes over the side sinks'),
      12,
      UI.dim,
    );
    note.position.set(PAD, PAD + 30);
    this.summary.position.set(PAD, PAD + 50);
    this.worth.anchor.set(1, 0);
    this.worth.position.set(WIDTH - PAD, PAD + 51);
    this.rows.position.set(PAD, TOP);
    this.window.panel.addChild(title, note, this.summary, this.worth, this.rows);
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
    this.window.fit();
    show(this.summary, t('{cargo} of {size} places taken', { cargo: cargoCount(ship.cargo), size: ship.holdSize }));
    show(this.worth, t('Worth {n} gold at the market', { n: cargoValue(ship.cargo) }));
    const key = GOOD_IDS.map((id) => ship.cargo[id] ?? 0).join();
    if (key === this.builtFor) return;
    this.builtFor = key;
    this.build(ship);
  }

  /** A row for every good aboard: its name and count, what it fetches, and its two buttons */
  private build(ship: Ship) {
    for (const child of this.rows.removeChildren()) child.destroy({ children: true });
    const aboard = GOOD_IDS.filter((id) => (ship.cargo[id] ?? 0) > 0);
    if (aboard.length === 0) {
      const empty = text(
        t('The hold is empty: sunk ships leave goods floating, sail over them to haul them aboard'),
        13,
        UI.dim,
        { wordWrap: true, wordWrapWidth: WIDTH - PAD * 2 },
      );
      this.rows.addChild(empty);
      return;
    }
    const rowWidth = WIDTH - PAD * 2;
    aboard.forEach((id, i) => {
      const count = ship.cargo[id] ?? 0;
      const row = new Container();
      row.position.set(0, i * (ROW + ROW_GAP));
      const background = new Graphics()
        .roundRect(0, 0, rowWidth, ROW, 6)
        .fill({ color: UI.idle, alpha: 0.5 })
        .stroke({ width: 1, color: UI.border, alpha: 0.25 });
      const name = text(`${t(GOODS[id].name)}  ×${count}`, 13, UI.text, { fontWeight: 'bold' });
      name.position.set(12, (ROW - name.height) / 2);
      const price = text(t('{n} gold each', { n: GOODS[id].price }), 12, GOLD);
      price.anchor.set(1, 0.5);
      price.position.set(rowWidth - BUTTON.width * 2 - 22, ROW / 2);
      const one = labelButton(BUTTON.width, BUTTON.height, t('Throw 1'), () => this.actions.throwCargo(id, 1));
      one.tile.container.position.set(rowWidth - BUTTON.width * 2 - 12, (ROW - BUTTON.height) / 2);
      const all = labelButton(BUTTON.width, BUTTON.height, t('Throw all'), () => this.actions.throwCargo(id, count));
      all.tile.container.position.set(rowWidth - BUTTON.width - 6, (ROW - BUTTON.height) / 2);
      row.addChild(background, name, price, one.tile.container, all.tile.container);
      this.rows.addChild(row);
    });
  }
}
