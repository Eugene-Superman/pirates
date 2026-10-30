import { Container, Graphics, Rectangle, type Point } from 'pixi.js';

const WHEEL = 0.6; // pixels per unit of the mouse wheel
// A bar, pixels: wide, and the room left of it a press still takes it in
const BAR = { width: 6, grip: 6 } as const;
const BAR_COLORS = { track: 0x000000, thumb: 0xd9b45a, edge: 0x5a4320 } as const;
// A pane's bar, pixels: its thumb's least length, and the room it takes along the pane's right edge
const PANE_BAR = { thumb: 32, room: BAR.width + BAR.grip } as const;
/** Pixels a pane's bar takes along its right edge: its content is that much narrower (ScrollPane.inner) */
export const PANE_BAR_ROOM = PANE_BAR.room;
const REVEAL_MARGIN = 8; // pixels left above or below what is scrolled into sight

/**
 * The bar down a part that scrolls, laid from its place down `length` pixels of its parent's: a track, and a thumb as
 * long as the part shows of all of it and as far down as it is scrolled. Dragged, the thumb follows the pointer; a
 * press beside it brings the thumb's middle there first. It shows only while there is something to scroll to
 */
export class ScrollBar {
  static readonly WIDTH = BAR.width;
  readonly container = new Graphics();
  /** Pixels: the thumb's least length */
  private readonly least: number;
  private readonly onScroll: (y: number) => void;
  private readonly area = new Rectangle();
  /** Pixels: the bar's length (as much of the content as shows), the content with no room, and how far it is scrolled */
  private length = 0;
  private hidden = 0;
  private scroll = 0;
  /** Where the bar was grabbed: the pointer's y along it and the scroll then; null while it isn't dragged */
  private dragging: { readonly y: number; readonly scroll: number } | null = null;

  /** least: pixels, the thumb's least length; onScroll: what the bar asks the part to scroll to, pixels past its top */
  constructor(least: number, onScroll: (y: number) => void) {
    this.least = least;
    this.onScroll = onScroll;
    const bar = this.container;
    bar.eventMode = 'static';
    bar.cursor = 'pointer';
    bar.hitArea = this.area;
    bar.visible = false;
    // The pointer read in the bar's own pixels: the window it is in may be scaled to the screen
    bar.on('pointerdown', (e) => {
      // Not to the stage, which would steer the ship
      e.stopPropagation();
      this.grab(bar.toLocal(e.global).y);
    });
    bar.on('globalpointermove', (e) => {
      if (!this.dragging) return;
      // The thumb runs down the bar as the content runs under its view: scaled by how much longer the content is
      const moved = bar.toLocal(e.global).y - this.dragging.y;
      this.onScroll(this.dragging.scroll + (moved * this.hidden) / Math.max(1, this.length - this.thumb().length));
    });
    bar.on('pointerup', () => (this.dragging = null));
    bar.on('pointerupoutside', () => (this.dragging = null));
  }

  /** Drawn `length` pixels long for content `hidden` pixels longer than that, scrolled `scroll` pixels past its top */
  draw(length: number, hidden: number, scroll: number) {
    this.length = length;
    this.hidden = hidden;
    this.scroll = scroll;
    const bar = this.container.clear();
    bar.visible = hidden > 0;
    if (!bar.visible) {
      this.dragging = null;
      return;
    }
    this.area.x = -BAR.grip;
    this.area.width = BAR.width + BAR.grip;
    this.area.height = length;
    const thumb = this.thumb();
    bar
      .roundRect(0, 0, BAR.width, length, BAR.width / 2)
      .fill({ color: BAR_COLORS.track, alpha: 0.35 })
      .roundRect(0, thumb.top, BAR.width, thumb.length, BAR.width / 2)
      .fill({ color: BAR_COLORS.thumb })
      .stroke({ width: 1, color: BAR_COLORS.edge });
  }

  /** The thumb: its length, as the view is of the content, and its top, as far down as the content is scrolled */
  private thumb() {
    const length = Math.max(this.least, (this.length * this.length) / (this.length + this.hidden));
    return { length, top: ((this.length - length) * this.scroll) / Math.max(1, this.hidden) };
  }

  /** The bar grabbed `y` pixels down it: beside the thumb, scrolled first to bring the thumb's middle there */
  private grab(y: number) {
    const { length, top } = this.thumb();
    if (y < top || y > top + length) {
      this.onScroll(((y - length / 2) * this.hidden) / Math.max(1, this.length - length));
    }
    this.dragging = { y, scroll: this.scroll };
  }
}

/**
 * A part of a window that scrolls up and down on its own, `width` × `height` pixels in its window's: what it holds
 * (`content`, laid out from its top left corner, `inner` pixels wide to leave the bar room) cut to it, scrolled with
 * the mouse wheel over it or the bar down its right edge while it is taller. What is scrolled out of sight takes no
 * clicks, and a press on it never reaches the stage, which would steer the ship
 */
export class ScrollPane {
  readonly container = new Container();
  readonly content = new Container();
  readonly width: number;
  readonly height: number;
  /** Pixels across the content may take, the bar's room left free */
  readonly inner: number;
  private readonly clip = new Graphics();
  private readonly bar = new ScrollBar(PANE_BAR.thumb, (y) => this.scrollTo(y));
  /** Pixels down all of the content, as its owner laid it out */
  private contentHeight = 0;
  private scroll = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.inner = width - PANE_BAR.room;
    this.clip.rect(0, 0, width, height).fill({ color: 0xffffff });
    this.content.mask = this.clip;
    this.container.eventMode = 'static';
    // The wheel anywhere over it, empty places too; and nothing beyond it is found under the pointer
    this.container.hitArea = new Rectangle(0, 0, width, height);
    this.container.on('pointerdown', (e) => e.stopPropagation());
    this.container.on('wheel', (e) => this.scrollTo(this.scroll + e.deltaY * WHEEL));
    this.bar.container.x = width - BAR.width;
    this.container.addChild(this.content, this.clip, this.bar.container);
  }

  /** Pixels of the content scrolled past */
  get scrolled() {
    return this.scroll;
  }

  /** The content laid out again, `height` pixels down: scrolled no further than it now goes */
  setContentHeight(height: number) {
    this.contentHeight = height;
    this.scrollTo(this.scroll);
  }

  /** Scrolled to `y` pixels past the content's top, as far as it goes; the bar drawn for it */
  scrollTo(y: number) {
    const hidden = Math.max(0, this.contentHeight - this.height);
    this.scroll = Math.max(0, Math.min(hidden, y));
    this.content.y = -this.scroll;
    this.bar.draw(this.height, hidden, this.scroll);
  }

  /** Scrolled just far enough for the content from `top` down `height` pixels to show */
  reveal(top: number, height: number) {
    if (top < this.scroll) this.scrollTo(top - REVEAL_MARGIN);
    else if (top + height > this.scroll + this.height) this.scrollTo(top + height - this.height + REVEAL_MARGIN);
  }

  /** Whether a point on the screen is over the pane: what is under it there shows */
  shows(point: Point) {
    const { x, y } = this.container.toLocal(point);
    return x >= 0 && y >= 0 && x <= this.width && y <= this.height;
  }
}
