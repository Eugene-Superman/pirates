import { Container, type Rectangle } from 'pixi.js';
import { PORTRAITS, type GameState } from '../../game';
import { CaptainPortrait } from './CaptainPortrait';
import { NIGHT, NIGHT_HEADER, NIGHT_WINDOW, nightHeader } from './nightTheme';
import { ornament } from './ornaments';
import { THEME } from './theme';
import { HudWindow, Tile, type TileSkin } from './ui';
import { t } from '../i18n/i18n';

const COLUMNS = 5;
const PAD = 24;
const SIDE = 44; // pixels from the window's sides to the portraits, clear of its corner pieces
const CARD = 128; // pixels: a portrait, square
const GAP = 16; // pixels between two
const EDGE = 3; // pixels: the gold edge round a portrait
const RADIUS = 10; // pixels: its rounded corners
const DIVIDER = PAD + NIGHT_HEADER.rule; // the gold line under the header
// Pixels in from the padding: the star before the title and the title, nearer the window's corner than most; and the
// divider's painted star, across, narrower in the narrow window
const HEADER_FIT = { pieceX: 20, titleX: 50, star: 200 } as const;
const PICKED_STAR = 26; // pixels: the star on the portrait put up, high
const TOP = DIVIDER + 32; // pixels: the portraits' top, clear of the divider's star
const ROWS = Math.ceil(PORTRAITS / COLUMNS);
const WIDTH = SIDE * 2 + COLUMNS * CARD + (COLUMNS - 1) * GAP;
const HEIGHT = TOP + ROWS * CARD + (ROWS - 1) * GAP + SIDE;
/** The moonlight round a portrait under the pointer or put up: rings out from its edge, pixels wide and how solid */
const HALO: readonly (readonly [number, number])[] = [
  [14, 0.06],
  [8, 0.12],
  [4, 0.2],
];
const HALO_COLOR = 0xa9c8ff;

/** A portrait's edge, drawn for its Tile under the picture: gold, brighter under the pointer, brightest put up */
const CARD_SKIN: TileSkin = (g, width, height, { hovered, pressed }) => {
  if (hovered || pressed) {
    for (const [ring, alpha] of HALO) {
      const out = EDGE + ring / 2;
      g.roundRect(-out, -out, width + out * 2, height + out * 2, RADIUS + out).stroke({
        width: ring,
        color: HALO_COLOR,
        alpha,
      });
    }
  }
  const color = pressed ? THEME.title : hovered ? THEME.brassLight : THEME.brass;
  g.roundRect(-EDGE, -EDGE, width + EDGE * 2, height + EDGE * 2, RADIUS + EDGE).fill({ color });
  g.roundRect(-1, -1, width + 2, height + 2, RADIUS + 1).fill({ color: NIGHT.rim });
};

/** A portrait's card: the picture on its edge, and the star on the one put up */
interface Card {
  readonly tile: Tile;
  readonly star: Container;
}

/**
 * The captain's portraits to pick from (a click on the portrait on the player's plate), in the night look: each
 * painted bust on a gold edge, the one put up lit, a star on it; a click on another puts it up and closes the
 * window. Closed too by its gold cross, Escape or a click beside it
 */
export class PortraitPicker {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly cards: Card[] = [];

  /** choose: puts up the portrait of that number */
  constructor(screen: Rectangle, choose: (portrait: number) => void) {
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), NIGHT_WINDOW);
    this.container = this.window.container;
    this.window.panel.addChild(nightHeader(WIDTH, PAD, t("Captain's portrait"), HEADER_FIT).container);
    for (let portrait = 0; portrait < PORTRAITS; portrait++) {
      const tile = new Tile(
        CARD,
        CARD,
        () => {
          choose(portrait);
          this.hide();
        },
        RADIUS,
        CARD_SKIN,
      );
      const column = portrait % COLUMNS;
      const row = Math.floor(portrait / COLUMNS);
      tile.container.position.set(SIDE + column * (CARD + GAP), TOP + row * (CARD + GAP));
      const picture = new CaptainPortrait(CARD, false);
      picture.set(portrait);
      const mark = ornament('star4', { height: PICKED_STAR });
      mark.position.set(CARD - 4, 4);
      tile.content.addChild(picture.container, mark);
      this.window.panel.addChild(tile.container);
      this.cards.push({ tile, star: mark });
    }
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    this.container.visible = !this.container.visible;
  }

  hide() {
    this.container.visible = false;
  }

  update(state: GameState) {
    if (!this.isOpen) return;
    this.window.fit();
    this.cards.forEach(({ tile, star }, portrait) => {
      const picked = portrait === state.player.portrait;
      star.visible = picked;
      tile.setLook({ pressed: picked });
    });
  }
}
