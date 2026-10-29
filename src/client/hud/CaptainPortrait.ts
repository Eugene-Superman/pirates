import { Container, Graphics, Sprite } from 'pixi.js';
import { PORTRAIT_ICONS } from './iconAtlas';

/** Where the face is on a portrait's tile, in the tile's size: a round portrait is cut round it, this wide */
const FACE = { x: 0.52, y: 0.42, radius: 0.42 } as const;
const CORNER = 0.08; // a square portrait's rounded corners, in its size

/**
 * A captain's painted portrait, `size` pixels across, its top left corner at (0, 0): round, cut round the face (the
 * player's plate), or the whole bust with rounded corners (the picker). Empty until the portraits have loaded
 */
export class CaptainPortrait {
  readonly container = new Container();
  private readonly picture = new Sprite();
  private readonly size: number;
  private readonly round: boolean;
  private portrait = -1;

  constructor(size: number, round: boolean) {
    this.size = size;
    this.round = round;
    const cut = new Graphics();
    if (round) cut.circle(size / 2, size / 2, size / 2).fill(0xffffff);
    else cut.roundRect(0, 0, size, size, size * CORNER).fill(0xffffff);
    this.picture.mask = cut;
    this.container.addChild(this.picture, cut);
    PORTRAIT_ICONS.load(() => this.dress());
  }

  /** Shows the portrait of that number */
  set(portrait: number) {
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    this.dress();
  }

  private dress() {
    const texture = PORTRAIT_ICONS.get(`${this.portrait}`);
    if (!texture) return;
    this.picture.texture = texture;
    const { size } = this;
    if (this.round) {
      this.picture.anchor.set(FACE.x, FACE.y);
      this.picture.scale.set(size / 2 / (FACE.radius * texture.width));
      this.picture.position.set(size / 2, size / 2);
    } else {
      this.picture.setSize(size, size);
    }
  }
}
