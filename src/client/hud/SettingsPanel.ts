import { Container, Graphics, Sprite, type Rectangle } from 'pixi.js';
import { Checkbox } from './Checkbox';
import { CONTROL_WIDTH, DEV_GROUPS, type HudControl, type HudFrame, type HudMetric, type HudWidget } from './hudItems';
import { MINIMAP_BUTTONS } from './iconAtlas';
import {
  NIGHT_HEADER,
  NIGHT_WINDOW,
  nightBoard,
  nightDivider,
  nightEmblem,
  nightHeader,
  type NightBoardLayout,
} from './nightTheme';
import { THEME, subheading } from './theme';
import { HudWindow, drawWrench, text } from './ui';
import { t } from '../i18n/i18n';

const PAD = 24; // pixels: the window's padding
const DIVIDER = PAD + NIGHT_HEADER.rule; // the gold line under the header
const TOP = DIVIDER + 18; // pixels: the first board's top, where the band that scrolls starts
const BOTTOM = PAD + 14; // pixels under the last board, clear of the window's bottom corner pieces
const GAP = 16; // pixels between the two boards
// A board, pixels: inside it, its corner pieces (high), its emblem's radius, its heading
const BOARD: NightBoardLayout = { pad: 20, corner: 26, emblem: 16, heading: { y: 12, size: 18 } };
const BOARD_STAR = 140; // pixels: the painted star of the divider under a board's heading, across
const LABEL_WIDTH = 170; // pixels: a row's name, then its control
const BOARD_WIDTH = BOARD.pad * 2 + LABEL_WIDTH + CONTROL_WIDTH;
const WIDTH = PAD * 2 + BOARD_WIDTH; // pixels, before scaling down to fit the screen
/**
 * Pixels down a board: the divider under its heading and its first row; a row's height at least, and the room over and
 * under a taller control; a group's heading's top and the first row under it; the room under the last row
 */
const ROWS = { divider: 48, top: 58, height: 38, pad: 5, group: 8, groupRows: 36, bottom: 16 } as const;
const LABEL_SIZE = 14; // pixels
const GROUP_SIZE = 15; // pixels: a group's heading on the developer's board
const CHECK_GAP = 28; // pixels between two checkboxes in a row
const WRENCH = 22; // pixels: the wrench on the developer's board's emblem, across

interface ShownCheck {
  readonly id: string;
  readonly check: Checkbox;
}

/** The settings' board's emblem: the gear of the minimap's button, painted (empty till it loads) */
function gearEmblem() {
  const inside = new Container();
  const dress = () => {
    const texture = MINIMAP_BUTTONS.get('settings');
    if (!texture || inside.destroyed) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.setSize(BOARD.emblem * 2 - 2);
    inside.addChild(sprite);
  };
  if (MINIMAP_BUTTONS.get('settings')) dress();
  else MINIMAP_BUTTONS.load(dress);
  return nightEmblem(BOARD.emblem, inside);
}

/**
 * The settings (the gear on the minimap's frame), in the night look: on one board of blue glass the player's (the
 * language, picked from a list, the layout of the screen, the sound, the zoom, the range rings, and what is shown on
 * the screen: the speed and the frame rate), and under it on a board of its own the developer's tools (tuning the ship,
 * the debug buttons). The boards scroll under the header when they are taller than the screen. Closed by its gold
 * cross, Escape (which first folds an open list) or a click beside it
 */
export class SettingsPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly widgets: HudWidget[] = [];
  private readonly checks: ShownCheck[] = [];
  private readonly isShown: (id: string) => boolean;

  /** isShown, toggle: whether a metric is on the screen, and putting it there or taking it off */
  constructor(
    controls: readonly HudControl[],
    metrics: readonly HudMetric[],
    isShown: (id: string) => boolean,
    toggle: (id: string) => void,
    screen: Rectangle,
  ) {
    this.isShown = isShown;
    // Heard before the window's own Escape, made below: an open list folds first, the window stays
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.isOpen || e.defaultPrevented || !this.fold()) return;
      e.preventDefault();
    });

    const boards = new Container();
    const game = this.board(TOP, t('Game'), gearEmblem(), (rows, y) => {
      let at = y;
      for (const control of controls) {
        if (!DEV_GROUPS.includes(control.group)) at = this.control(rows, at, control);
      }
      return this.row(rows, at, t('On the screen'), this.shownChecks(metrics, toggle));
    });
    const wrench = new Graphics();
    drawWrench(wrench, WRENCH, THEME.title);
    const dev = this.board(game.bottom + GAP, t('Developer'), nightEmblem(BOARD.emblem, wrench), (rows, y) => {
      let at = y;
      for (const group of DEV_GROUPS) {
        const heading = subheading(t(group), GROUP_SIZE);
        heading.position.set(BOARD.pad, at + ROWS.group);
        rows.addChild(heading);
        at += ROWS.groupRows;
        for (const control of controls) if (control.group === group) at = this.control(rows, at, control);
      }
      return at;
    });
    // The player's board over the developer's: a list unfolded from it lies over the boards under it
    boards.addChild(dev.container, game.container);

    const height = dev.bottom + BOTTOM;
    this.window = new HudWindow(
      screen,
      { width: WIDTH, height, pad: PAD, scroll: { top: TOP, bottom: BOTTOM } },
      () => this.hide(),
      NIGHT_WINDOW,
    );
    this.container = this.window.container;
    this.window.body.addChild(boards);
    this.window.panel.addChild(nightHeader(WIDTH, PAD, t('Settings')).container);
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.container.visible = true;
  }

  hide() {
    this.fold();
    this.container.visible = false;
  }

  update(frame: HudFrame) {
    if (!this.isOpen) return;
    this.window.fit();
    for (const { id, check } of this.checks) check.setChecked(this.isShown(id));
    for (const widget of this.widgets) widget.update(frame);
  }

  /** Folds whatever list is open; returns whether one was */
  private fold() {
    return this.widgets.reduce((folded, widget) => (widget.fold?.() ?? false) || folded, false);
  }

  /**
   * A board of blue glass at `top`, its emblem and heading, a divider under them and the rows `lay` puts on it from
   * its first row's top down, returning where they end
   */
  private board(top: number, heading: string, emblem: Container, lay: (rows: Container, y: number) => number) {
    const rows = new Container();
    const height = lay(rows, ROWS.top) + ROWS.bottom;
    // A list to pick from over the rows under it
    for (const widget of this.widgets)
      if (widget.fold && widget.container.parent === rows) rows.addChild(widget.container);
    const { container } = nightBoard(BOARD_WIDTH, height, BOARD, emblem, heading);
    const divider = nightDivider(BOARD_WIDTH - BOARD.pad * 2, BOARD_STAR);
    divider.position.set(BOARD.pad, ROWS.divider);
    container.addChild(divider, rows);
    container.position.set(PAD, top);
    return { container, bottom: top + height };
  }

  /** A control's row at `y`; returns where the next one starts */
  private control(rows: Container, y: number, control: HudControl) {
    const widget = control.create();
    this.widgets.push(widget);
    return this.row(rows, y, t(control.label), widget.container);
  }

  /** A row at `y`: its name, then `part` after it, both on its middle; returns where the next one starts */
  private row(rows: Container, y: number, name: string, part: Container) {
    const height = Math.max(ROWS.height, part.height + ROWS.pad * 2);
    const label = text(name, LABEL_SIZE, THEME.text);
    label.anchor.set(0, 0.5);
    label.position.set(BOARD.pad, y + height / 2);
    part.position.set(BOARD.pad + LABEL_WIDTH, y + (height - part.height) / 2);
    rows.addChild(label, part);
    return y + height;
  }

  /** A checkbox a metric, side by side: ticked, it is shown on the screen */
  private shownChecks(metrics: readonly HudMetric[], toggle: (id: string) => void) {
    const checks = new Container();
    let x = 0;
    for (const { id, label } of metrics) {
      const check = new Checkbox(t(label), () => toggle(id));
      check.container.x = x;
      x += check.container.width + CHECK_GAP;
      checks.addChild(check.container);
      this.checks.push({ id, check });
    }
    return checks;
  }
}
