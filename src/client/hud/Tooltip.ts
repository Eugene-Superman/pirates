import { Container, Graphics, Text } from 'pixi.js';
import { NIGHT } from './nightTheme';
import { THEME, TITLE_STYLE } from './theme';
import { show, tint } from './ui';

const PAD = { x: 8, y: 6 } as const; // pixels inside the panel
const LINE_GAP = 2; // pixels between the title and the lines under it
const WRAP = 220; // pixels: a line longer than this wraps
const ABOVE = 6; // pixels between the panel and what it tells of

/** What a tooltip says: a title (in its colour, gold by default) and lines under it */
export interface TooltipText {
  readonly title: string;
  readonly color?: number;
  readonly lines: readonly string[];
}

/**
 * A small panel of the night's deep blue under a gold edge, telling what is under the pointer: put it last in its
 * container, over everything, and `point` it each frame at what it tells of (or at nothing, to hide it). It takes no
 * clicks
 */
export class Tooltip {
  readonly container = new Container();
  private readonly panel = new Graphics();
  private readonly title = new Text({
    text: '',
    style: { ...TITLE_STYLE, fontSize: 13, stroke: { color: NIGHT.rim, width: 3, join: 'round' } },
  });
  private readonly body = new Text({
    text: '',
    style: { fontFamily: 'Arial', fontSize: 11, fill: THEME.text, lineHeight: 15, wordWrap: true, wordWrapWidth: WRAP },
  });
  /** The panel's size as last drawn, to draw it again only when it changes */
  private drawn = '';
  /** On the main screen, the screen it stays inside; none in a window, which gives its own room */
  private readonly screen: { readonly width: number } | null;

  constructor(screen: { readonly width: number } | null = null) {
    this.screen = screen;
    this.container.visible = false;
    this.container.eventMode = 'none';
    this.container.addChild(this.panel, this.title, this.body);
  }

  /**
   * Shows `what` over (x, y) in its container, the middle of the top of what it tells of; null hides it. With `room`
   * (`under`: the bottom of what it tells of) it goes under it when it has no room above: in a window (`width`: its
   * container's width, which it stays inside) over the window's top, on the main screen over the screen's (and it
   * stays inside the screen's sides, a part the player moved to one of them)
   */
  point(what: TooltipText | null, x: number, y: number, room?: { readonly width?: number; readonly under: number }) {
    this.container.visible = what !== null;
    if (!what) return;
    show(this.title, what.title);
    tint(this.title, what.color ?? THEME.title);
    show(this.body, what.lines.join('\n'));
    this.body.visible = what.lines.length > 0;
    const lines = this.body.visible ? LINE_GAP + this.body.height : 0;
    const width = Math.ceil(Math.max(this.title.width, this.body.visible ? this.body.width : 0)) + PAD.x * 2;
    const height = Math.ceil(this.title.height + lines) + PAD.y * 2;
    const size = `${width}x${height}`;
    if (size !== this.drawn) {
      this.drawn = size;
      this.panel
        .clear()
        .roundRect(0, 0, width, height, 5)
        .fill({ color: NIGHT.bottom, alpha: 0.95 })
        .stroke({ width: 1, color: THEME.brass, alpha: 0.8 });
      this.title.position.set(PAD.x, PAD.y);
      this.body.position.set(PAD.x, PAD.y + this.title.height + LINE_GAP);
    }
    let left = x - width / 2;
    let top = y - ABOVE - height;
    if (room?.width !== undefined) {
      left = Math.max(0, Math.min(left, room.width - width));
      if (top < 0) top = room.under + ABOVE;
    } else if (room) {
      // A part of the main screen the player moved to its top or a side
      const parent = this.container.parent;
      if (parent) {
        const from = parent.toGlobal({ x: left, y: top });
        const to = parent.toGlobal({ x: left + width, y: top });
        if (from.y < 0) top = room.under + ABOVE;
        const scale = (to.x - from.x) / width;
        const over = to.x - (this.screen?.width ?? Infinity);
        if (from.x < 0) left -= from.x / scale;
        else if (over > 0) left -= over / scale;
      }
    }
    this.container.position.set(Math.round(left), Math.round(top));
  }
}
