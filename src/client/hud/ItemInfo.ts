import { Container, Graphics, Text, type Rectangle } from 'pixi.js';
import type { GameState } from '../../game';
import type { ConfirmDialog } from './ConfirmDialog';
import type { Figure, ItemButton, ItemFace, Tone } from './itemFaces';
import { THEME, THEMED_WINDOW, TITLE_STYLE, brassButton, drawCard, drawDivider, iconSlot, subheading } from './theme';
import { HudWindow, UI, show, text, tierColor, tint, type Tile } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 680; // pixels, before scaling down to fit the screen
const HEIGHT = 610;
const PAD = 24;
const DIVIDER = PAD + 62; // the gold line under the header
const TOP = DIVIDER + 18; // the icon and the figures, under it
const ICON = 236; // pixels: the picture
const STATS_X = PAD + ICON + 28;
const STATS_WIDTH = WIDTH - PAD - STATS_X;
const STAT_ROW = 29; // pixels a figure
const LORE = { top: TOP + 8 * STAT_ROW + 22, height: 158, pad: 16 } as const; // the legend's board
const BUY = { width: 270, height: 36 } as const;
const SELL = { width: 170, gap: 10 } as const; // what the arsenal buys back: its Sell button, left of the main one
const TEXT_GAP = 16; // pixels between the text beside the buttons and them
// What is dealt in by count (ammo): a row to pick how many, over the buttons, where the legend's board gives it room
const AMOUNT = { room: 42, height: 28, step: 34, value: 64, preset: 54, most: 76, gap: 6 } as const;
const PRESETS = [1, 20, 100, 1000] as const;
const MESSAGE_TIME = 3.5; // seconds a message stays
const GOLD = 0xffcf3f;
const TONES: Readonly<Record<Tone, number>> = { good: UI.good, bad: UI.bad, plain: THEME.dim };

/**
 * Something the port sells up close, over its building's window (its card's info button, or a click on its icon): a
 * gun, an ammo, a piece of outfit or a ship (`itemFaces.ts` says what of it): its picture, what it is, every figure the
 * game works it out by, its price, its legend, and its button (Buy, Fit, Take off, Take the helm), and Sell beside it
 * for what the arsenal buys back. Close, Escape or a click beside it closes it
 */
export class ItemInfo {
  private readonly window: HudWindow;
  /** Asks before what can't be undone */
  private readonly confirm: ConfirmDialog;
  private readonly title = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 30 } });
  private readonly kind = text('', 13, THEME.dim);
  /** The picture in its slot: made again for each item (its glow is its tier) */
  private readonly slot = new Container();
  /** The figures: made again for each item */
  private readonly figures = new Container();
  /** The figures read from the game every frame */
  private live: { readonly text: Text; readonly read: (state: GameState) => string }[] = [];
  private readonly lore = new Text({
    text: '',
    style: {
      fontFamily: TITLE_STYLE.fontFamily,
      fontStyle: 'italic',
      fontSize: 15,
      lineHeight: 22,
      fill: THEME.text,
      wordWrap: true,
      wordWrapWidth: WIDTH - PAD * 2 - LORE.pad * 2,
    },
  });
  /** How many the player has, or the item's terms: two lines at most beside the buttons */
  private readonly owned = text('', 12, THEME.dim, { wordWrap: true });
  private readonly message = text('', 13, THEME.text, { fontWeight: 'bold', wordWrap: true });
  private readonly button: { readonly tile: Tile; readonly text: Text };
  /** Sell, for what the arsenal buys back; hidden for the rest */
  private readonly sell: { readonly tile: Tile; readonly text: Text };
  /** The legend's board: shorter with the row to pick how many */
  private readonly board = new Graphics();
  /** How many the buttons buy and sell, for what is dealt in by count: −, the count, +, a few counts and the most */
  private readonly picker = new Container();
  private readonly count = text('', 16, THEME.text, { fontWeight: 'bold' });
  private readonly presets: { readonly count: number | null; readonly tile: Tile }[] = [];
  private face: ItemFace | null = null;
  private time = 0;
  private messageUntil = 0;
  /** The game as of the last frame: what the button acts on */
  private state: GameState | null = null;

  /** confirm: asks before what can't be undone (selling the item back) */
  constructor(screen: Rectangle, confirm: ConfirmDialog) {
    this.confirm = confirm;
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), THEMED_WINDOW);
    this.title.position.set(PAD, PAD - 6);
    this.kind.position.set(PAD, PAD + 34);
    this.slot.position.set(PAD, TOP);
    this.figures.position.set(STATS_X, TOP);
    this.board.position.set(PAD, LORE.top);
    this.buildPicker();
    const legend = subheading(t('Legend'));
    legend.position.set(PAD + LORE.pad, LORE.top + 10);
    this.lore.position.set(PAD + LORE.pad, LORE.top + 42);
    this.button = brassButton(BUY.width, BUY.height, '', () => this.press(this.face), 14);
    this.button.tile.container.position.set(WIDTH - PAD - BUY.width, HEIGHT - PAD - BUY.height);
    this.sell = brassButton(SELL.width, BUY.height, '', () => this.press(this.face?.sell ?? null), 14);
    this.sell.tile.container.position.set(
      this.button.tile.container.x - SELL.gap - SELL.width,
      HEIGHT - PAD - BUY.height,
    );
    this.owned.position.set(PAD, HEIGHT - PAD - BUY.height);
    this.message.position.set(PAD, HEIGHT - PAD - BUY.height);
    this.window.panel.addChild(
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      this.title,
      this.kind,
      this.slot,
      this.figures,
      this.board,
      legend,
      this.lore,
      this.picker,
      this.owned,
      this.message,
      this.button.tile.container,
      this.sell.tile.container,
    );
  }

  get container() {
    return this.window.container;
  }

  get isOpen() {
    return this.window.isOpen;
  }

  /** Opens the window on an item */
  open(face: ItemFace) {
    this.face = face;
    show(this.title, face.name);
    show(this.kind, face.kind);
    this.showFigures(face.figures);
    show(this.lore, face.lore);
    for (const child of this.slot.removeChildren()) child.destroy({ children: true });
    const slot = iconSlot(ICON, tierColor(face.tier), `T${face.tier}`, face.letters);
    slot.show(face.icon);
    this.slot.addChild(slot.container);
    // The row to pick how many takes room off the legend's board
    this.picker.visible = face.amount !== undefined;
    drawCard(this.board.clear(), WIDTH - PAD * 2, LORE.height - (face.amount ? AMOUNT.room : 0));
    // The text beside the buttons gets what room they leave
    this.sell.tile.container.visible = face.sell !== undefined;
    const left = face.sell ? this.sell.tile.container.x : this.button.tile.container.x;
    this.owned.style.wordWrapWidth = this.message.style.wordWrapWidth = left - TEXT_GAP - PAD;
    this.messageUntil = 0;
    this.window.container.visible = true;
    if (this.state) this.update(this.state);
  }

  hide() {
    this.window.container.visible = false;
  }

  /** Every frame while open: the figures read from the game, how many the player has, what the button says */
  update(state: GameState) {
    this.state = state;
    this.time = state.time;
    const { face } = this;
    if (!this.isOpen || !face) return;
    this.window.fit();
    for (const { text: value, read } of this.live) show(value, read(state));
    show(this.owned, face.note ? face.note(state) : face.owned(state));
    const { long, enabled } = face.button(state);
    show(this.button.text, long);
    this.button.tile.setLook(enabled ? {} : { disabled: true });
    if (face.sell) {
      const sell = face.sell.button(state);
      show(this.sell.text, sell.long);
      this.sell.tile.setLook(sell.enabled ? {} : { disabled: true });
    }
    if (face.amount) {
      const count = face.amount.get();
      show(this.count, `${count}`);
      const most = face.amount.most(state);
      for (const preset of this.presets) {
        preset.tile.setLook({ pressed: count === (preset.count ?? most) });
      }
    }
    this.message.visible = this.time < this.messageUntil;
    this.owned.visible = !this.message.visible;
  }

  /** The row to pick how many, under the legend: − and + step by more the more there are, a few counts, the most */
  private buildPicker() {
    this.picker.position.set(PAD, LORE.top + LORE.height - AMOUNT.room + 12);
    const label = text(t('How many:'), 13, THEME.dim);
    label.position.set(0, (AMOUNT.height - label.height) / 2);
    this.picker.addChild(label);
    let x = label.width + 12;
    const change = (by: (count: number) => number) => () => {
      const amount = this.face?.amount;
      if (amount) amount.set(by(amount.get()));
    };
    const minus = brassButton(
      AMOUNT.step,
      AMOUNT.height,
      '−',
      change((n) => n - step(n - 1)),
      16,
    );
    minus.tile.container.position.set(x, 0);
    x += AMOUNT.step;
    this.count.anchor.set(0.5);
    this.count.position.set(x + AMOUNT.value / 2, AMOUNT.height / 2);
    x += AMOUNT.value;
    const plus = brassButton(
      AMOUNT.step,
      AMOUNT.height,
      '+',
      change((n) => n + step(n)),
      16,
    );
    plus.tile.container.position.set(x, 0);
    x += AMOUNT.step + AMOUNT.gap * 3;
    this.picker.addChild(minus.tile.container, this.count, plus.tile.container);
    for (const count of [...PRESETS, null]) {
      const width = count === null ? AMOUNT.most : AMOUNT.preset;
      const preset = brassButton(width, AMOUNT.height, count === null ? t('Max') : `${count}`, () => {
        const amount = this.face?.amount;
        if (amount && this.state) amount.set(count ?? amount.most(this.state));
      });
      preset.tile.container.position.set(x, 0);
      x += width + AMOUNT.gap;
      this.picker.addChild(preset.tile.container);
      this.presets.push({ count, tile: preset.tile });
    }
  }

  /** The figures' rows, as in a ledger: the label on the left, what it says on the right, a faint line under each */
  private showFigures(figures: readonly Figure[]) {
    for (const child of this.figures.removeChildren()) child.destroy({ children: true });
    this.live = [];
    const lines = new Graphics();
    this.figures.addChild(lines);
    figures.forEach(({ label, value, gold }, i) => {
      const y = i * STAT_ROW;
      const name = text(t(label), 13, THEME.dim);
      name.position.set(0, y + 5);
      const shown = text(typeof value === 'string' ? value : '', 14, gold ? GOLD : THEME.text, { fontWeight: 'bold' });
      shown.anchor.set(1, 0);
      shown.position.set(STATS_WIDTH, y + 4);
      if (typeof value !== 'string') this.live.push({ text: shown, read: value });
      lines
        .moveTo(0, y + STAT_ROW - 2)
        .lineTo(STATS_WIDTH, y + STAT_ROW - 2)
        .stroke({ width: 1, color: THEME.brass, alpha: 0.18 });
      this.figures.addChild(name, shown);
    });
  }

  /** Presses one of the item's buttons: the main one, or Sell (asked about first) */
  private press(which: ItemButton | null) {
    if (!which || !this.state) return;
    const question = which.confirm?.(this.state);
    if (question) this.confirm.ask(question, () => this.run(which));
    else this.run(which);
  }

  private run(which: ItemButton) {
    if (!this.state) return;
    const done = which.press(this.state);
    if (!done) return;
    show(this.message, done.message);
    tint(this.message, TONES[done.tone]);
    this.messageUntil = this.time + MESSAGE_TIME;
  }
}

/** How far − and + move a count: by one up to 20, by ten up to 200, by a hundred above */
function step(count: number) {
  if (count >= 200) return 100;
  return count >= 20 ? 10 : 1;
}
