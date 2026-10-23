import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import type { AmmoId } from '../../game';

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

/** A few letters for each ammo, for the chips of the skill bar */
export const AMMO_LABELS: Readonly<Record<AmmoId, string>> = {
  ball1: 'I',
  chainShot: 'Chain',
  ball2: 'II',
  ball3: 'III',
  heatedShot: 'Heat',
  explosiveShell: 'Shell',
  royalShot: 'Royal',
  harpoon1: 'I',
  barbedHarpoon: 'Barb',
  harpoon2: 'II',
  harpoon3: 'III',
  poisonHarpoon: 'Venom',
  explosiveHarpoon: 'Blast',
  leviathanHarpoon: 'Lev.',
};

export function text(value: string, size: number, fill: number = UI.text, extra: TextStyleOptions = {}) {
  return new Text({ text: value, style: { fontFamily: 'Arial', fontSize: size, fill, ...extra } });
}

/** Assigning Text.text re-renders its texture, so only on change */
export function show(t: Text, value: string) {
  if (t.text !== value) t.text = value;
}

/** So does assigning its color: only on change too */
export function tint(t: Text, color: number) {
  if (t.style.fill !== color) t.style.fill = color;
}

/** How a tile looks: pressed (lit), disabled (dimmed, not clickable), and its border color */
export interface TileLook {
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly border?: number;
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

  constructor(width: number, height: number, onTap: (() => void) | null, radius = 6) {
    this.width = width;
    this.height = height;
    this.radius = radius;
    this.container.addChild(this.background, this.content);
    this.container.eventMode = 'static';
    this.container.on('pointerdown', (e) => e.stopPropagation());
    if (onTap) {
      this.container.cursor = 'pointer';
      this.container.on('pointertap', () => {
        if (!this.look.disabled) onTap();
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
    const { pressed = false, disabled = false, border = UI.border } = this.look;
    const key = `${pressed}${disabled}${border}${this.hovered}${this.width}x${this.height}`;
    if (key === this.painted) return;
    this.painted = key;
    const fill = pressed ? UI.active : this.hovered && !disabled ? UI.hover : UI.idle;
    this.background
      .clear()
      .roundRect(0, 0, this.width, this.height, this.radius)
      .fill({ color: fill, alpha: disabled ? 0.5 : 0.92 })
      .stroke({ width: pressed ? 2 : 1, color: border, alpha: pressed ? 0.9 : 0.45 });
    this.content.alpha = disabled ? 0.45 : 1;
  }
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

/** An anchor: the loadout, the shipyard's work */
export function drawAnchor(g: Graphics, size: number, color: number) {
  const k = size / 32;
  g.circle(0, -11 * k, 3 * k).stroke({ width: 2.5 * k, color });
  g.moveTo(0, -8 * k)
    .lineTo(0, 12 * k)
    .stroke({ width: 3 * k, color });
  g.moveTo(-7 * k, -3 * k)
    .lineTo(7 * k, -3 * k)
    .stroke({ width: 3 * k, color, cap: 'round' });
  g.arc(0, 4 * k, 10 * k, 0.15, Math.PI - 0.15).stroke({ width: 3 * k, color, cap: 'round' });
}

/** A gold coin round (0, 0): the player's gold */
export function drawCoin(g: Graphics, radius: number) {
  g.circle(0, 0, radius).fill({ color: 0xe8b52e }).stroke({ width: 1, color: 0x7a5410 });
  g.circle(0, 0, radius * 0.62).stroke({ width: 1, color: 0xfff0a8, alpha: 0.8 });
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
