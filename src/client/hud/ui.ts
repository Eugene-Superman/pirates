import { Container, Graphics, Text, type FillGradient, type Rectangle, type TextStyleOptions } from 'pixi.js';
import { t } from '../i18n/i18n';

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
  private readonly style: TileStyle;

  constructor(width: number, height: number, onTap: (() => void) | null, radius = 6, style: TileStyle = PLAIN) {
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
    const border = this.look.border ?? (pressed ? style.pressedBorder : style.border);
    const key = `${pressed}${disabled}${border}${this.hovered}${this.width}x${this.height}`;
    if (key === this.painted) return;
    this.painted = key;
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
    this.content.alpha = disabled ? 0.45 : 1;
  }
}

const WINDOW_MARGIN = 20; // pixels between a window and the screen's edge, at least
const GEAR_TEETH = 8;

/** How a window looks: the panel under what it shows, its Close button, and how dark the game gets behind it */
export interface WindowLook {
  readonly panel: (width: number, height: number) => Container;
  readonly close: (label: string, onTap: () => void) => { readonly tile: Tile };
  readonly dim: number;
}

/**
 * A window over the game (the loadout, the talents, the statistics, an item up close in port): its `panel` centred on
 * the screen and scaled down to fit, the game dimmed behind it, in the `look` it is given (the windows' theme is
 * theme.ts's THEMED_WINDOW). Clicks on it and round it never reach the stage, which would steer the ship. Close, a click
 * beside it and Escape call `onClose`. An Escape another window has taken is left alone: the windows listen in the
 * order the HUD makes them, the one on top first, so one press closes one window
 */
export class HudWindow {
  readonly container = new Container();
  /** What the window shows, in pixels before scaling: the owner adds to it */
  readonly panel = new Container();
  private readonly dim = new Graphics();
  private readonly dimAlpha: number;
  private readonly screen: Rectangle;
  private readonly look: WindowLook;
  private background: Container;
  private readonly width: number;
  private height: number;
  /** Pixels at the bottom of the screen it leaves clear: what must show under it (the skill bar under the loadout) */
  private readonly bottom: number;
  /** The screen size it was fitted to */
  private fittedTo = '';

  /**
   * width, height: the panel's, in pixels; pad: from its top right corner to the Close button; bottom: pixels at the
   * bottom of the screen it leaves clear (none by default)
   */
  constructor(
    screen: Rectangle,
    size: { width: number; height: number; pad: number; bottom?: number },
    onClose: () => void,
    look: WindowLook,
  ) {
    this.screen = screen;
    this.width = size.width;
    this.height = size.height;
    this.bottom = size.bottom ?? 0;
    this.dimAlpha = look.dim;
    this.look = look;
    this.container.visible = false;
    this.background = blocker(look.panel(size.width, size.height));
    blocker(this.dim).on('pointertap', onClose);
    const close = look.close(t('Close'), onClose);
    close.tile.container.position.set(size.width - size.pad - close.tile.width, size.pad);
    this.panel.addChild(this.background, close.tile.container);
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

  /** A window whose contents grow or shrink with what it shows: its panel made again at the new height */
  resize(height: number) {
    if (height === this.height) return;
    this.height = height;
    const background = blocker(this.look.panel(this.width, height));
    this.panel.addChildAt(background, 0);
    this.background.destroy({ children: true });
    this.background = background;
    this.fittedTo = '';
  }

  /** Every frame while open: the dim and the panel's place follow the screen's size */
  fit() {
    const { width, height } = this.screen;
    const size = `${width}x${height}`;
    if (size === this.fittedTo) return;
    this.fittedTo = size;
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: this.dimAlpha });
    const free = height - this.bottom;
    const scale = Math.min(1, (width - WINDOW_MARGIN * 2) / this.width, (free - WINDOW_MARGIN * 2) / this.height);
    this.panel.scale.set(scale);
    this.panel.position.set(Math.round((width - this.width * scale) / 2), Math.round((free - this.height * scale) / 2));
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

/** A gold coin round (0, 0): the player's gold */
export function drawCoin(g: Graphics, radius: number) {
  g.circle(0, 0, radius).fill({ color: 0xe8b52e }).stroke({ width: 1, color: 0x7a5410 });
  g.circle(0, 0, radius * 0.62).stroke({ width: 1, color: 0xfff0a8, alpha: 0.8 });
}

/** A doubloon round (0, 0): a redder gold than the gold coin, with a cross struck on it */
export function drawDoubloon(g: Graphics, radius: number) {
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

/** A gear wheel round (0, 0), `size` pixels across, a hole through its middle: the settings */
export function drawGear(g: Graphics, size: number, color: number) {
  const outer = size / 2;
  const inner = outer * 0.72;
  const half = Math.PI / GEAR_TEETH;
  const points: number[] = [];
  for (let i = 0; i < GEAR_TEETH; i++) {
    const at = i * half * 2;
    // A tooth: up from the rim at one side, across its top, down at the other
    for (const [r, da] of [
      [inner, -half * 0.95],
      [outer, -half * 0.5],
      [outer, half * 0.5],
      [inner, half * 0.95],
    ] as const) {
      points.push(Math.cos(at + da) * r, Math.sin(at + da) * r);
    }
  }
  g.poly(points)
    .fill({ color })
    .circle(0, 0, outer * 0.34)
    .cut();
}

/**
 * Four corners of a square round (0, 0), `size` pixels across: pointing out to fill the screen, or in (`exit`) to
 * leave it
 */
export function drawFullscreen(g: Graphics, size: number, color: number, exit: boolean) {
  const h = size / 2;
  const arm = size * 0.36;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    // The corner's point: on the square's corner going out, a little inside it coming back
    const cx = exit ? sx * (h - arm) : sx * h;
    const cy = exit ? sy * (h - arm) : sy * h;
    const dx = exit ? sx * arm : -sx * arm;
    const dy = exit ? sy * arm : -sy * arm;
    g.moveTo(cx + dx, cy)
      .lineTo(cx, cy)
      .lineTo(cx, cy + dy)
      .stroke({ width: 2.5, color, cap: 'round', join: 'round' });
  }
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
