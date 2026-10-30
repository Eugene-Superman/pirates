import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { NIGHT, drawNightCard } from './nightTheme';
import { THEME } from './theme';
import { Tile, tint, type TileSkin } from './ui';

const FIELD_HEIGHT = 28; // pixels
const ROW = 28; // pixels: an option's row in the list
const LIST = { pad: 5, gap: 4 } as const; // pixels: round the options inside their board; between the field and it
const TEXT_X = 12; // pixels: a label in from the field's left edge, and an option's from the list's
const LABEL_SIZE = 13; // pixels
const CHEVRON = { width: 10, height: 6, right: 16 } as const; // pixels; its middle in from the field's right edge
const CATCH = 10000; // pixels round the open list that take a click to fold it: the whole screen, whatever the scale
const COLORS = {
  lit: 0x0c1d40, // the field under the pointer or open, a deeper blue than its well
  option: 0x2a5191, // the option under the pointer: the night buttons' blue under it
} as const;

/** The field: a well of dark glass under a gold edge; brighter under the pointer and while its list is open */
const FIELD_SKIN: TileSkin = (g, width, height, { hovered, pressed }) => {
  const lit = hovered || pressed;
  g.roundRect(0, 0, width, height, 6)
    .fill({ color: lit ? COLORS.lit : NIGHT.well, alpha: 0.92 })
    .stroke({ width: lit ? 1.5 : 1, color: lit ? THEME.brassLight : THEME.brass, alpha: lit ? 1 : 0.75 });
};

/** An option: nothing at rest; blue glass under a faint gold edge under the pointer */
const OPTION_SKIN: TileSkin = (g, width, height, { hovered }) => {
  if (!hovered) return;
  g.roundRect(0, 0, width, height, 4)
    .fill({ color: COLORS.option, alpha: 0.6 })
    .stroke({ width: 1, color: THEME.brassLight, alpha: 0.6 });
};

export interface SelectOption<K> {
  readonly key: K;
  /** As the player reads it */
  readonly label: string;
}

interface Option<K> {
  readonly key: K;
  readonly label: string;
  readonly text: Text;
}

/**
 * A choice of one of a few options in the night look (the language): a field of dark glass under a gold edge showing
 * the one picked and a chevron; a click unfolds the options on a board under it, the one picked in gold, the one under
 * the pointer lit; a click on one picks it, a click anywhere else folds them. Like ButtonRow, it shows the option the
 * owner tells it is picked, not one it keeps. Its owner keeps it over what lies under its list
 */
export class Select<K> {
  static readonly HEIGHT = FIELD_HEIGHT;
  readonly container = new Container();
  private readonly field: Tile;
  private readonly picked = new Text({
    text: '',
    style: { fontFamily: 'Arial', fontSize: LABEL_SIZE, fill: THEME.text },
  });
  private readonly chevron = new Graphics();
  /** Takes the clicks round the open list: they fold it */
  private readonly catcher = new Container();
  private readonly list = new Container();
  private readonly options: Option<K>[] = [];
  /** As last told; undefined until the first time */
  private shown: K | undefined;

  /** width: the field's and the list's, pixels; onPick: an option picked other than the one shown */
  constructor(options: readonly SelectOption<K>[], width: number, onPick: (key: K) => void) {
    this.field = new Tile(width, FIELD_HEIGHT, () => (this.isOpen ? this.fold() : this.unfold()), 6, FIELD_SKIN);
    this.picked.anchor.set(0, 0.5);
    this.picked.position.set(TEXT_X, FIELD_HEIGHT / 2);
    this.chevron.position.set(width - CHEVRON.right, FIELD_HEIGHT / 2);
    this.field.content.addChild(this.picked, this.chevron);

    this.catcher.eventMode = 'static';
    this.catcher.hitArea = new Rectangle(-CATCH, -CATCH, CATCH * 2, CATCH * 2);
    // Nor must a click round the list reach the stage, which would steer the ship
    this.catcher.on('pointerdown', (e) => e.stopPropagation());
    this.catcher.on('pointertap', () => this.fold());

    const height = options.length * ROW + LIST.pad * 2;
    this.list.position.set(0, FIELD_HEIGHT + LIST.gap);
    // Solid under the glass: the rows under the list mustn't show through it
    this.list.addChild(
      new Graphics().roundRect(0, 0, width, height, 6).fill({ color: NIGHT.glassDark }),
      drawNightCard(new Graphics(), width, height),
    );
    options.forEach(({ key, label }, i) => {
      const tile = new Tile(
        width - LIST.pad * 2,
        ROW,
        () => {
          this.fold();
          if (key !== this.shown) onPick(key);
        },
        4,
        OPTION_SKIN,
      );
      tile.container.position.set(LIST.pad, LIST.pad + i * ROW);
      const text = new Text({ text: label, style: { fontFamily: 'Arial', fontSize: LABEL_SIZE, fill: THEME.text } });
      text.anchor.set(0, 0.5);
      text.position.set(TEXT_X - LIST.pad, ROW / 2);
      tile.content.addChild(text);
      this.list.addChild(tile.container);
      this.options.push({ key, label, text });
    });
    this.container.addChild(this.field.container, this.catcher, this.list);
    this.fold();
  }

  get isOpen() {
    return this.list.visible;
  }

  /** Shows `key` as the one picked */
  show(key: K) {
    if (key === this.shown) return;
    this.shown = key;
    for (const option of this.options) {
      if (option.key === key) this.picked.text = option.label;
      tint(option.text, option.key === key ? THEME.title : THEME.text);
    }
  }

  /** Folds the list; returns whether it was open */
  fold() {
    const was = this.list.visible;
    this.list.visible = this.catcher.visible = false;
    this.field.setLook({ pressed: false });
    this.drawChevron(false);
    return was;
  }

  private unfold() {
    this.list.visible = this.catcher.visible = true;
    this.field.setLook({ pressed: true });
    this.drawChevron(true);
  }

  /** Pointing down, or up while the list is open */
  private drawChevron(open: boolean) {
    const w = CHEVRON.width / 2;
    const h = (CHEVRON.height / 2) * (open ? -1 : 1);
    this.chevron
      .clear()
      .moveTo(-w, -h)
      .lineTo(0, h)
      .lineTo(w, -h)
      .stroke({ width: 2, color: THEME.title, cap: 'round', join: 'round' });
  }
}
