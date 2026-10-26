import { Container, Graphics, Text } from 'pixi.js';
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
 * A small panel of dark wood with a brass edge, telling what is under the pointer: put it last in its container, over
 * everything, and `point` it each frame at what it tells of (or at nothing, to hide it). It takes no clicks
 */
export class Tooltip {
  readonly container = new Container();
  private readonly panel = new Graphics();
  private readonly title = new Text({
    text: '',
    style: { ...TITLE_STYLE, fontSize: 13, stroke: { color: 0x120a03, width: 3, join: 'round' } },
  });
  private readonly body = new Text({
    text: '',
    style: { fontFamily: 'Arial', fontSize: 11, fill: THEME.text, lineHeight: 15, wordWrap: true, wordWrapWidth: WRAP },
  });
  /** The panel's size as last drawn, to draw it again only when it changes */
  private drawn = '';

  constructor() {
    this.container.visible = false;
    this.container.eventMode = 'none';
    this.container.addChild(this.panel, this.title, this.body);
  }

  /** Shows `what` over (x, y) in its container, the middle of the top of what it tells of; null hides it */
  point(what: TooltipText | null, x: number, y: number) {
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
        .fill({ color: THEME.woodDark, alpha: 0.95 })
        .stroke({ width: 1, color: THEME.brass, alpha: 0.8 });
      this.title.position.set(PAD.x, PAD.y);
      this.body.position.set(PAD.x, PAD.y + this.title.height + LINE_GAP);
    }
    this.container.position.set(Math.round(x - width / 2), Math.round(y - ABOVE - height));
  }
}
