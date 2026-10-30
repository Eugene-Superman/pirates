import { Container, Graphics, Rectangle, Sprite, Text, type FillGradient, type TextStyleOptions } from 'pixi.js';
import { SYMBOL_ICONS, type SymbolId } from './iconAtlas';
import { ScrollBar } from './ScrollPane';

/** The HUD's colors, shared by its panels and bars */
export const UI = {
  panel: 0x0b2433,
  panelAlpha: 0.88,
  idle: 0x0b3a52,
  hover: 0x15557a,
  active: 0xf2b33d,
  border: 0xffffff,
  text: 0xffffff,
  darkText: 0x1b1b1b,
  dim: 0xb8cdd8,
  good: 0x5ad15a,
  warn: 0xf2c84b,
  bad: 0xe5533d,
  heal: 0x7dff8a,
  hostile: 0xff5a4a,
} as const;

/** Ammo and guns by tier, as in many games: white, green, blue, purple, orange, gold */
export const TIER_COLORS: readonly number[] = [0xd8d8d8, 0x6fd06f, 0x5aa9ff, 0xb57cff, 0xffa64d, 0xffd34d];

export function tierColor(tier: number) {
  return TIER_COLORS[Math.min(Math.max(tier, 1), TIER_COLORS.length) - 1];
}

/** A number in whole units, its thousands apart: 1 234 567 */
export function whole(n: number) {
  return Math.round(n).toLocaleString('en-US').replaceAll(',', ' ');
}

/**
 * A count in four characters at most: 1.2K under ten thousand, 12K, 1.2M…; never rounded up, so it never shows more
 * than there is
 */
export function compact(n: number) {
  for (const [size, unit] of [
    [1e6, 'M'],
    [1e3, 'K'],
  ] as const) {
    if (n >= size) {
      const units = n / size;
      return `${units < 10 ? Math.floor(units * 10) / 10 : Math.floor(units)}${unit}`;
    }
  }
  return `${n}`;
}

export function text(value: string, size: number, fill: number = UI.text, extra: TextStyleOptions = {}) {
  return new Text({ text: value, style: { fontFamily: 'Arial', fontSize: size, fill, ...extra } });
}

/** Assigning Text.text re-renders its texture, so only on change */
export function show(label: Text, value: string) {
  if (label.text !== value) label.text = value;
}

/** So does assigning its color: only on change too */
export function tint(label: Text, color: number) {
  if (label.style.fill !== color) label.style.fill = color;
}

/** Cuts a text of one line short with an ellipsis to fit `width` pixels (a card's: its info window has all of it) */
export function clip(line: Text, width: number) {
  let shown = line.text;
  while (line.width > width && shown.length > 1) {
    shown = shown.slice(0, -1).trimEnd();
    line.text = `${shown}…`;
  }
}

/**
 * Cuts a wrapped text short with an ellipsis, a word at a time, to fit `lines` lines of `lineHeight` pixels (a card's
 * two lines: its info window has all of it)
 */
export function clipLines(label: Text, lines: number, lineHeight: number) {
  let shown = label.text;
  while (label.height > (lines + 0.5) * lineHeight && shown.includes(' ')) {
    shown = shown.slice(0, shown.lastIndexOf(' ')).replace(/[\s,.:;]+$/, '');
    label.text = `${shown}…`;
  }
}

/** How a tile looks: pressed (lit), disabled (dimmed, not clickable), and its border color */
export interface TileLook {
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly border?: number;
}

/**
 * How a tile is painted: its fill as it rests, under the pointer and pressed (a colour, or a gradient over the tile),
 * how solid it is, its border, and a light line along its top edge (bevel) or not
 */
export interface TileStyle {
  readonly idle: number;
  readonly hover: number;
  readonly pressed: number | FillGradient;
  readonly alpha: number;
  readonly border: number;
  readonly borderAlpha: number;
  readonly pressedBorder: number;
  readonly bevel: boolean;
}

/** What a tile is doing, for a skin to draw it by; border: a colour its owner has lit its edge in */
export interface TileState {
  readonly hovered: boolean;
  readonly pressed: boolean;
  readonly disabled: boolean;
  readonly border?: number;
}

/**
 * A tile drawn its own way, in place of a style's fill and border: a theme's button. It draws into `g`, cleared, for a
 * tile `width` × `height` pixels in its state, and may reach out past it (a glow), where the pointer doesn't find it
 */
export type TileSkin = (g: Graphics, width: number, height: number, state: TileState) => void;

/** The HUD's own tiles: blue, lit gold when pressed */
export const PLAIN: TileStyle = {
  idle: UI.idle,
  hover: UI.hover,
  pressed: UI.active,
  alpha: 0.92,
  border: UI.border,
  borderAlpha: 0.45,
  pressedBorder: UI.border,
  bevel: false,
};

let tapSound = () => {};

/** Sets what a tap on any of the HUD's tiles sounds like: the client's sounds, once they are made */
export function setTapSound(play: () => void) {
  tapSound = play;
}

/** A tap's sound, for what the HUD makes clickable without a Tile (the harbour's medallions) */
export function playTap() {
  tapSound();
}

/**
 * A clickable rectangle for the HUD: a background that lights up under the pointer and when pressed, and whatever
 * the owner puts on it (`content`). Clicks never reach the stage, which would steer the ship
 */
export class Tile {
  readonly container = new Container();
  readonly content = new Container();
  private readonly background = new Graphics();
  private hovered = false;
  private look: TileLook = {};
  /** As last painted, to repaint only on change */
  private painted = '';
  width: number;
  height: number;
  private readonly radius: number;
  private readonly style: TileStyle | TileSkin;

  constructor(
    width: number,
    height: number,
    onTap: (() => void) | null,
    radius = 6,
    style: TileStyle | TileSkin = PLAIN,
  ) {
    this.width = width;
    this.height = height;
    this.radius = radius;
    this.style = style;
    this.container.addChild(this.background, this.content);
    this.container.eventMode = 'static';
    this.container.on('pointerdown', (e) => e.stopPropagation());
    if (onTap) {
      this.container.cursor = 'pointer';
      this.container.on('pointertap', () => {
        if (this.look.disabled) return;
        tapSound();
        onTap();
      });
      this.container.on('pointerover', () => {
        this.hovered = true;
        this.paint();
      });
      this.container.on('pointerout', () => {
        this.hovered = false;
        this.paint();
      });
    }
    this.paint();
  }

  setLook(look: TileLook) {
    this.look = look;
    this.paint();
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.paint();
  }

  private paint() {
    const { style } = this;
    const { pressed = false, disabled = false } = this.look;
    const skinned = typeof style === 'function';
    const border = this.look.border ?? (skinned ? undefined : pressed ? style.pressedBorder : style.border);
    const key = `${pressed}${disabled}${border}${this.hovered}${this.width}x${this.height}`;
    if (key === this.painted) return;
    this.painted = key;
    this.content.alpha = disabled ? 0.45 : 1;
    if (skinned) {
      // A skin's glow reaches past the tile: only the tile itself is under the pointer
      this.container.hitArea = new Rectangle(0, 0, this.width, this.height);
      style(this.background.clear(), this.width, this.height, {
        hovered: this.hovered && !disabled,
        pressed,
        disabled,
        border,
      });
      return;
    }
    const fill = pressed ? style.pressed : this.hovered && !disabled ? style.hover : style.idle;
    const alpha = disabled ? style.alpha * 0.55 : style.alpha;
    const { width, height, radius } = this;
    this.background
      .clear()
      .roundRect(0, 0, width, height, radius)
      .fill(typeof fill === 'number' ? { color: fill, alpha } : { fill, alpha })
      .stroke({ width: pressed ? 2 : 1, color: border, alpha: pressed ? 0.9 : style.borderAlpha });
    if (style.bevel)
      this.background
        .moveTo(radius, 1.5)
        .lineTo(width - radius, 1.5)
        .stroke({ width: 1, color: 0xffffff, alpha: pressed ? 0.35 : 0.1 });
  }
}

const WINDOW_MARGIN = 20; // pixels between a window and the screen's edge, at least
// A window's band that scrolls: pixels per unit of the mouse wheel; the least of it shown before the window is scaled
// down after all (a screen too low for its fixed parts and this much); its bar, pixels: its right edge in from the
// window's, and its thumb's least length
const SCROLL = { speed: 0.6, least: 240, inset: 9, thumb: 40 } as const;
const XP_STAR = 0xffcf3f; // the drawn experience star, until its painting loads
const XP_STAR_SCALE = 1.3; // the painted star's size over a coin's of the same radius

/**
 * How a window looks: the panel under what it shows, its close button (`width` pixels wide, its top left corner at its
 * place), and how dark the game gets behind it
 */
export interface WindowLook {
  readonly panel: (width: number, height: number) => Container;
  readonly close: (onTap: () => void) => { readonly container: Container; readonly width: number };
  readonly dim: number;
}

/**
 * The part of a window that scrolls when the window is taller than the screen, in its pixels: from `top` down to
 * `bottom` above its foot. What is above it stays (its title, Close), what is below moves up with its foot
 */
export interface ScrollBand {
  readonly top: number;
  readonly bottom: number;
}

/** Pixels at the screen's top and bottom a window leaves clear */
export interface ScreenEdges {
  readonly top: number;
  readonly bottom: number;
}

const NO_EDGES: ScreenEdges = { top: 0, bottom: 0 };

/**
 * A window over the game (the loadout, the talents, the statistics, an item up close in port): its `panel` centred on
 * the screen and scaled down to fit, the game dimmed behind it, in the `look` it is given (the windows' theme is
 * theme.ts's THEMED_WINDOW). A window with a `scroll` band isn't scaled down for the screen's height: it is cut to the
 * screen and the band scrolls, with the mouse wheel or its bar. Clicks on it and round it never reach the stage, which
 * would steer the ship. Its close button (the gold cross), a click beside it and Escape call `onClose`. An Escape
 * another window has taken is left alone: the windows listen in the order the HUD makes them, the one on top first, so
 * one press closes one window
 */
export class HudWindow {
  readonly container = new Container();
  /** What the window shows, in pixels before scaling: the owner adds to it */
  readonly panel = new Container();
  /**
   * A window with a scroll band: the owner's parts in the band, laid out in the panel's pixels as if all of the window
   * showed; moved up as the band scrolls, and cut to it
   */
  readonly body = new Container();
  /** And its parts under the band: moved up with the window's foot when the window is cut short */
  readonly foot = new Container();
  private readonly dim = new Graphics();
  private readonly dimAlpha: number;
  private readonly screen: Rectangle;
  private readonly look: WindowLook;
  private background: Container;
  /** Its close button, `pad` pixels from the panel's top right corner */
  private readonly close: { readonly container: Container; readonly width: number };
  private readonly pad: number;
  private width: number;
  /** Pixels down all of the window, before it is cut short to scroll */
  private height: number;
  /** Pixels down the panel as drawn: all of the window, or as much of it as the screen has room for */
  private drawnHeight: number;
  /** What it leaves clear at the screen's edges, asked as it is fitted: what must show by it (the skill bar by the loadout) */
  private readonly clear: () => ScreenEdges;
  private readonly band: ScrollBand | null;
  private readonly clip = new Graphics();
  private readonly bar = new ScrollBar(SCROLL.thumb, (y) => this.scrollTo(y));
  /** Pixels of the band scrolled past, and the most it scrolls: as much of it as the screen has no room for */
  private scroll = 0;
  private hidden = 0;
  /** The screen size it was fitted to */
  private fittedTo = '';

  /**
   * width, height: the panel's, in pixels; pad: from its top right corner to the Close button; clear: what it leaves
   * clear at the screen's top and bottom, asked every frame (none by default); scroll: the band that scrolls when the
   * window is taller than the screen (none: it is scaled down to fit)
   */
  constructor(
    screen: Rectangle,
    size: { width: number; height: number; pad: number; clear?: () => ScreenEdges; scroll?: ScrollBand },
    onClose: () => void,
    look: WindowLook,
  ) {
    this.screen = screen;
    this.width = size.width;
    this.height = size.height;
    this.drawnHeight = size.height;
    this.clear = size.clear ?? (() => NO_EDGES);
    this.band = size.scroll ?? null;
    this.dimAlpha = look.dim;
    this.look = look;
    this.container.visible = false;
    this.background = blocker(look.panel(size.width, size.height));
    blocker(this.dim).on('pointertap', onClose);
    this.pad = size.pad;
    this.close = look.close(onClose);
    this.close.container.position.set(size.width - size.pad - this.close.width, size.pad);
    this.panel.addChild(this.background, this.close.container);
    // The stage takes the clicks on whatever in it takes none (a board, a line of text) as its own: the panel takes
    // them first, or a click there would steer the ship
    blocker(this.panel);
    if (this.band) {
      this.body.mask = this.clip;
      this.panel.on('wheel', (e) => this.scrollTo(this.scroll + e.deltaY * SCROLL.speed));
      this.bar.container.position.set(size.width - SCROLL.inset - ScrollBar.WIDTH, this.band.top);
      this.panel.addChild(this.body, this.clip, this.foot, this.bar.container);
    }
    this.container.addChild(this.dim, this.panel);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.isOpen || e.defaultPrevented) return;
      onClose();
      // Escape closed the window; it shouldn't also close the one under it or stop the ship firing (keyboardInput)
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  /** Pixels of the scroll band scrolled past: the body's parts are that much higher in the panel */
  get scrolled() {
    return this.scroll;
  }

  /** Pixels down the panel as drawn: all of the window, or as much of it as the screen has room for */
  get shownHeight() {
    return this.drawnHeight;
  }

  /**
   * A window whose contents grow or shrink with what it shows: its panel made again at the new height, and width (the
   * talent tree of another ship, with more branches or fewer)
   */
  resize(height: number, width = this.width) {
    if (height === this.height && width === this.width) return;
    const wider = width !== this.width;
    if (wider) {
      this.width = width;
      this.close.container.x = width - this.pad - this.close.width;
      this.bar.container.x = width - SCROLL.inset - ScrollBar.WIDTH;
    }
    this.height = height;
    this.paint(height, wider);
    this.fittedTo = '';
  }

  /**
   * Every frame while open: the dim and the panel's place follow the screen's size. A window with a scroll band is
   * scaled down only to the screen's width (and so far as its fixed parts and some of the band fit a low screen), and
   * cut to the screen's height
   */
  fit() {
    const { width, height } = this.screen;
    const edges = this.clear();
    const size = `${width}x${height}/${edges.top}/${edges.bottom}`;
    if (size === this.fittedTo) return;
    this.fittedTo = size;
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: this.dimAlpha });
    const free = height - edges.top - edges.bottom;
    const room = free - WINDOW_MARGIN * 2;
    const band = this.band;
    const fixed = band ? band.top + band.bottom : 0;
    const least = band ? fixed + Math.min(SCROLL.least, this.height - fixed) : this.height;
    const scale = Math.min(1, (width - WINDOW_MARGIN * 2) / this.width, room / least);
    const drawn = band ? Math.min(this.height, Math.floor(room / scale)) : this.height;
    this.panel.scale.set(scale);
    const top = edges.top + (free - drawn * scale) / 2;
    this.panel.position.set(Math.round((width - this.width * scale) / 2), Math.round(top));
    if (!band) return;
    this.paint(drawn);
    this.hidden = this.height - drawn;
    this.foot.y = -this.hidden;
    this.clip.clear().rect(0, band.top, this.width, this.view()).fill({ color: 0xffffff });
    this.scrollTo(this.scroll);
  }

  /** The panel drawn `height` pixels down, under the rest; `again` at the same height, for a new width */
  private paint(height: number, again = false) {
    if (height === this.drawnHeight && !again) return;
    this.drawnHeight = height;
    const background = blocker(this.look.panel(this.width, height));
    this.panel.addChildAt(background, 0);
    this.background.destroy({ children: true });
    this.background = background;
  }

  /** Pixels of the scroll band that show */
  private view() {
    return this.band ? this.drawnHeight - this.band.top - this.band.bottom : 0;
  }

  /** The band scrolled to `y` pixels past its top, as far as it goes; its bar drawn for it */
  private scrollTo(y: number) {
    this.scroll = Math.max(0, Math.min(this.hidden, y));
    this.body.y = -this.scroll;
    this.bar.draw(this.view(), this.hidden, this.scroll);
  }
}

/** A part of a window that takes the clicks on it: they would steer the ship */
function blocker<T extends Container>(part: T) {
  part.eventMode = 'static';
  part.on('pointerdown', (e) => e.stopPropagation());
  return part;
}

/** A wrench, its open jaw at the top right: the repair skill. `size` is the icon's width in pixels */
export function drawWrench(g: Graphics, size: number, color: number) {
  const k = size / 32;
  g.moveTo(-11 * k, 11 * k)
    .lineTo(3 * k, -3 * k)
    .stroke({ width: 5.5 * k, color, cap: 'round' });
  // The head: a ring open towards the top right, away from the handle
  const open = -Math.PI / 4;
  const gap = 0.8;
  g.arc(7 * k, -7 * k, 6 * k, open + gap, open - gap + Math.PI * 2).stroke({ width: 4.5 * k, color });
}

/** A padlock round (0, 0), `size` pixels tall: what isn't open yet (a tavern's quest not offered, a sea forbidden) */
export function drawLock(g: Graphics, size: number, color: number) {
  const h = size / 2;
  const shackle = h * 0.55;
  g.moveTo(-shackle, 0)
    .arc(0, 0, shackle, Math.PI, Math.PI * 2)
    .stroke({ width: 2.5, color });
  g.roundRect(-h * 0.8, 0, h * 1.6, h, 2).fill({ color });
}

/** A cannonball with a ring of its tier's color */
export function drawBall(g: Graphics, radius: number, tier: number) {
  g.circle(0, 0, radius + 1.5).fill({ color: tierColor(tier) });
  g.circle(0, 0, radius).fill({ color: 0x2b2b2b });
  g.circle(-radius * 0.35, -radius * 0.35, radius * 0.3).fill({ color: 0x8a8a8a });
}

/** A harpoon pointing up and right, its head in its tier's color */
export function drawHarpoon(g: Graphics, size: number, tier: number) {
  const h = size / 2;
  g.moveTo(-h, h)
    .lineTo(h * 0.45, -h * 0.45)
    .stroke({ width: 2.5, color: 0xc9a777, cap: 'round' });
  g.poly([h, -h, h * 0.15, -h * 0.55, h * 0.55, -h * 0.15]).fill({ color: tierColor(tier) });
  g.moveTo(h * 0.2, -h * 0.2)
    .lineTo(h * 0.05, h * 0.15)
    .stroke({ width: 1.5, color: tierColor(tier) });
}

/** A harpoon pointing up and right, all in `color`, `size` pixels across: a sign, as on a branch's emblem */
export function drawHarpoonSign(g: Graphics, size: number, color: number) {
  const h = size / 2;
  g.moveTo(-h, h)
    .lineTo(h * 0.45, -h * 0.45)
    .stroke({ width: size * 0.12, color, cap: 'round' });
  g.poly([h, -h, h * 0.1, -h * 0.6, h * 0.6, -h * 0.1]).fill({ color });
}

/** A gold coin drawn round (0, 0): the painted one's stand-in (`goldCoin`), and a coin as an emblem */
export function drawCoin(g: Graphics, radius: number) {
  g.circle(0, 0, radius).fill({ color: 0xe8b52e }).stroke({ width: 1, color: 0x7a5410 });
  g.circle(0, 0, radius * 0.62).stroke({ width: 1, color: 0xfff0a8, alpha: 0.8 });
}

/** The gold coin round (0, 0), `radius` pixels: wherever the HUD shows gold, in place of the word */
export function goldCoin(radius: number) {
  return symbol('gold', radius, (g) => drawCoin(g, radius));
}

/** The doubloon round (0, 0), `radius` pixels: wherever the HUD shows doubloons, in place of the word */
export function doubloon(radius: number) {
  return symbol('doubloon', radius, (g) => drawDoubloon(g, radius));
}

/** The currencies the HUD has a coin for: an amount of one is its coin and the number */
export type CoinId = 'gold' | 'doubloons';

/** The coin of `currency` round (0, 0), `radius` pixels */
export function coinOf(currency: CoinId, radius: number) {
  return currency === 'gold' ? goldCoin(radius) : doubloon(radius);
}

/** The experience star round (0, 0), `radius` pixels: wherever the HUD shows experience, in place of "XP" */
export function xpStar(radius: number) {
  // Its painting has sparkles round the star: drawn larger, the star itself is as big as a coin. Inside a container
  // of its own, so whoever scales the star (the floating numbers) keeps this
  const sign = symbol('xp', radius, (g) => drawStar(g, radius, XP_STAR));
  sign.scale.set(XP_STAR_SCALE);
  const star = new Container();
  star.addChild(sign);
  return star;
}

/** A painted sign (SYMBOL_ICONS) once its picture has loaded, drawn by `stand` till then or if it isn't painted */
function symbol(id: SymbolId, radius: number, stand: (g: Graphics) => void) {
  const sign = new Container();
  const drawn = new Graphics();
  stand(drawn);
  sign.addChild(drawn);
  const paint = () => {
    const texture = SYMBOL_ICONS.get(id);
    if (!texture || sign.destroyed) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.setSize(radius * 2);
    drawn.visible = false;
    sign.addChild(sprite);
  };
  if (SYMBOL_ICONS.get(id)) paint();
  else SYMBOL_ICONS.load(paint);
  return sign;
}

/** A doubloon round (0, 0), the painted one's stand-in (`doubloon`): a redder gold than the gold coin, with a cross
 * struck on it */
function drawDoubloon(g: Graphics, radius: number) {
  g.circle(0, 0, radius).fill({ color: 0xd9822b }).stroke({ width: 1, color: 0x6b360b });
  g.circle(0, 0, radius * 0.72).stroke({ width: 1, color: 0xffd39a, alpha: 0.75 });
  const arm = radius * 0.4;
  g.moveTo(-arm, 0).lineTo(arm, 0).moveTo(0, -arm).lineTo(0, arm).stroke({ width: 1.6, color: 0xfff0cc, cap: 'round' });
}

/** A crate round (0, 0), `size` pixels square, its boards and a brace across: the ship's hold */
export function drawCrate(g: Graphics, size: number) {
  const h = size / 2;
  g.roundRect(-h, -h, size, size, 1.5).fill({ color: 0xa8743d }).stroke({ width: 1, color: 0x3b220e });
  g.moveTo(-h, -h / 3)
    .lineTo(h, -h / 3)
    .moveTo(-h, h / 3)
    .lineTo(h, h / 3)
    .stroke({ width: 1, color: 0x5c3816 });
  g.moveTo(-h + 1.5, h - 1.5)
    .lineTo(h - 1.5, -h + 1.5)
    .stroke({ width: 1.6, color: 0x5c3816 });
}

/** A sail on its mast, filled by the wind: the Full sail ability. `size` is the icon's height in pixels */
export function drawSail(g: Graphics, size: number, color: number) {
  const k = size / 32;
  g.moveTo(-9 * k, -14 * k)
    .lineTo(-9 * k, 14 * k)
    .stroke({ width: 2.5 * k, color, cap: 'round' });
  g.moveTo(-7 * k, -13 * k)
    .quadraticCurveTo(14 * k, -2 * k, -7 * k, 10 * k)
    .closePath()
    .fill({ color });
  g.moveTo(-14 * k, 14 * k)
    .lineTo(12 * k, 14 * k)
    .stroke({ width: 2.5 * k, color, cap: 'round' });
}

/** A cannon on its carriage with a blast at the muzzle: the Broadside ability. `size` is the icon's width in pixels */
export function drawBroadside(g: Graphics, size: number, color: number) {
  const k = size / 32;
  g.roundRect(-13 * k, -6 * k, 18 * k, 8 * k, 3 * k).fill({ color });
  g.circle(-8 * k, 6 * k, 4.5 * k).stroke({ width: 2.5 * k, color });
  for (const [dx, dy] of [
    [1, -0.6],
    [1, 0],
    [1, 0.6],
  ] as const) {
    g.moveTo(8 * k, -2 * k)
      .lineTo((8 + 7 * dx) * k, (-2 + 7 * dy) * k)
      .stroke({ width: 2 * k, color: 0xffb347, cap: 'round' });
  }
}

/** A five-pointed star, a point up: a talent to pick. `radius` is its points' in pixels */
export function drawStar(g: Graphics, radius: number, color: number) {
  const points: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  g.poly(points).fill({ color });
}
