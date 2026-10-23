import { Graphics } from 'pixi.js';
import { Tile, UI, drawFullscreen } from './ui';

const SIZE = 36; // pixels: the button's square
const ICON = 18; // pixels across its icon

/** Fills the screen with the game or gives the window back. From a click: a browser lets a page do it only then */
function toggleFullscreen() {
  const done = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  // Refused (a frame the page is shown in may not allow it): the page stays as it was
  done.catch(() => undefined);
}

/** A button in the top right corner that fills the screen with the game, and back: the page's own F11 */
export class FullscreenButton {
  static readonly SIZE = SIZE;
  /** Whether the browser lets the page fill the screen: not on an iPhone, nor in a frame that doesn't allow it */
  readonly shown = 'requestFullscreen' in document.documentElement && document.fullscreenEnabled;
  private readonly tile = new Tile(SIZE, SIZE, toggleFullscreen, 6);
  private readonly icon = new Graphics();
  /** Whether the icon was drawn for the full screen; null before the first frame */
  private drawnFull: boolean | null = null;

  constructor() {
    this.icon.position.set(SIZE / 2, SIZE / 2);
    this.tile.content.addChild(this.icon);
    this.tile.container.visible = this.shown;
  }

  get container() {
    return this.tile.container;
  }

  /** right, top: where its corner goes. Its icon follows the page's state, however it changed (Escape leaves too) */
  update(right: number, top: number) {
    this.tile.container.position.set(right - SIZE, top);
    const full = document.fullscreenElement !== null;
    if (full === this.drawnFull) return;
    this.drawnFull = full;
    drawFullscreen(this.icon.clear(), ICON, UI.text, full);
  }
}
