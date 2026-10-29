import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, type TilingSprite } from 'pixi.js';
import { PROLOGUE } from '../../game';
import { NIGHT, moonButton, nightDivider } from './nightTheme';
import { nightSky } from './ornaments';
import { THEME, TITLE_STYLE } from './theme';
import { show } from './ui';
import { t } from '../i18n/i18n';

// Pixels: the picture of a card (16 × 9), how far down the screen its middle is (a share), and the gap to its words
const PICTURE = { width: 560, height: 315, middle: 0.4, gap: 34 } as const;
const WORDS = { size: 22, width: 680, line: 32 } as const; // pixels: a card's words, centred under its picture
const BUTTON = { width: 150, skip: 120, height: 34, gap: 14, bottom: 48 } as const; // pixels: Next, Skip
const DOTS = { radius: 4, gap: 16, above: 26 } as const; // pixels: a dot a card, over the buttons, the card's lit
const MARGIN = 24; // pixels it keeps from the screen's sides, where the screen is small
const FADE = 0.7; // seconds a card's picture and words take to come in
const SKY_ALPHA = 0.85;
// The cards' painted pictures, prologue_1.webp and on, a card each, made by blender-assets/story/build_story_art.py
const ART = `${import.meta.env.BASE_URL}sprites/story`;
const pictureUrl = (card: number) => `${ART}/prologue_${card + 1}.webp`;

/**
 * The prologue a new player sees before anything else, over the whole screen: the night sky, and card by card a
 * painted picture and a sentence or two of what happened, coming in slowly; Next (or Enter, or Space) goes on, the
 * last one starts the game, Skip (or Escape) starts it at once. The harbour waits under it
 */
export class Prologue {
  readonly container = new Container();
  private readonly back = new Graphics();
  private sky: TilingSprite | null = null;
  private readonly body = new Container();
  /** The picture's well, seen while it loads */
  private readonly picture = new Graphics();
  private readonly art = new Sprite();
  /** The picture's gold frame, over it */
  private readonly frame = new Graphics();
  /** The cards' pictures, each once it has loaded */
  private readonly pictures: (Texture | null)[] = PROLOGUE.map(() => null);
  private loading = false;
  /** Seconds into the card its picture came, for a fade of its own; null: there as the card came in, fading with it */
  private pictureCame: number | null = null;
  private readonly words: Text;
  private readonly dots = new Graphics();
  private readonly next: ReturnType<typeof moonButton>;
  private readonly skip: ReturnType<typeof moonButton>;
  private readonly screen: Rectangle;
  private readonly onDone: () => void;
  private card = 0;
  /** Seconds the card has been shown, for its fade */
  private shown = 0;
  /** The screen's size it was laid out for */
  private laidOut = '';

  /** onDone: the prologue seen to its end, or skipped */
  constructor(screen: Rectangle, onDone: () => void) {
    this.screen = screen;
    this.onDone = onDone;
    this.container.visible = false;
    this.words = new Text({
      text: '',
      style: {
        ...TITLE_STYLE,
        fontSize: WORDS.size,
        fill: THEME.text,
        wordWrap: true,
        wordWrapWidth: WORDS.width,
        lineHeight: WORDS.line,
        align: 'center',
      },
    });
    this.words.anchor.set(0.5, 0);
    this.art.anchor.set(0.5);
    this.next = moonButton(BUTTON.width, BUTTON.height, t('Next'), () => this.advance(), 15, true);
    this.skip = moonButton(BUTTON.skip, BUTTON.height, t('Skip'), () => this.finish(), 13);
    // A moon's divider between the picture and its words
    const divider = nightDivider(PICTURE.width * 0.6);
    divider.position.set(-PICTURE.width * 0.3, PICTURE.height / 2 + PICTURE.gap / 2 - 2);
    this.body.addChild(this.picture, this.art, this.frame, divider, this.words);
    this.container.addChild(this.back, this.body, this.dots, this.skip.tile.container, this.next.tile.container);
    this.container.eventMode = 'static';
    // Nothing under it is clicked: not the harbour, not the sea
    this.container.on('pointerdown', (e) => e.stopPropagation());
    // Made before the HUD's windows: it hears a key first, and keeps every key from them and the ship while it is shown
    // (stopped, not prevented: the browser's own keys, F5 and the like, still work)
    window.addEventListener('keydown', (e) => {
      if (!this.container.visible || e.defaultPrevented) return;
      e.stopImmediatePropagation();
      if (e.code === 'Escape') this.finish();
      // A key held down would race through every card
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        if (!e.repeat) this.advance();
      } else return;
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  /** Shown while the player hasn't seen it (`due`); dt: seconds since the last frame, for the fade */
  update(due: boolean, dt: number) {
    if (due && !this.container.visible) {
      this.load();
      this.showCard(0);
    }
    this.container.visible = due;
    if (!due) return;
    this.layOut();
    this.shown += dt;
    this.body.alpha = Math.min(1, this.shown / FADE);
    this.art.alpha = this.pictureCame === null ? 1 : Math.min(1, (this.shown - this.pictureCame) / FADE);
  }

  /** The cards' pictures, the first time the prologue is shown: each shown once it is there */
  private load() {
    if (this.loading) return;
    this.loading = true;
    PROLOGUE.forEach((_, card) => {
      Assets.load<Texture>({ src: pictureUrl(card), data: { autoGenerateMipmaps: true } })
        .then((texture) => {
          // Come after the prologue was over and its pictures let go of
          if (!this.loading) return;
          this.pictures[card] = texture;
          if (card === this.card) this.dressPicture(true);
        })
        .catch((error: unknown) => console.warn(`The prologue's picture ${card + 1} failed to load`, error));
    });
  }

  /** The card's picture, if it is there; `late`: it came after the card did */
  private dressPicture(late: boolean) {
    const texture = this.pictures[this.card] ?? null;
    this.art.visible = texture !== null;
    if (!texture) return;
    this.art.texture = texture;
    this.art.setSize(PICTURE.width, PICTURE.height);
    this.pictureCame = late ? this.shown : null;
  }

  private showCard(card: number) {
    this.card = card;
    this.shown = 0;
    show(this.words, t(PROLOGUE[card] ?? ''));
    this.dressPicture(false);
    show(this.next.text, card + 1 < PROLOGUE.length ? t('Next') : t('Begin'));
    this.laidOut = '';
  }

  /** Everything in its place for the screen as it is now: the sky over all of it, the card in the middle */
  private layOut() {
    const { width, height } = this.screen;
    const key = `${width}x${height}:${this.card}`;
    if (key === this.laidOut) return;
    const resized = !this.laidOut.startsWith(`${width}x${height}:`);
    this.laidOut = key;
    if (resized) {
      this.back.clear().rect(0, 0, width, height).fill({ color: NIGHT.bottom });
      this.sky?.destroy();
      this.sky = nightSky(width, height);
      this.sky.alpha = SKY_ALPHA;
      this.container.addChildAt(this.sky, 1);
      this.container.hitArea = new Rectangle(0, 0, width, height);
    }
    // The card shrinks to a small screen, the buttons stay as they are
    const scale = Math.min(1, (width - MARGIN * 2) / WORDS.width, (height * 0.75) / (PICTURE.height + 200));
    this.body.scale.set(scale);
    this.body.position.set(width / 2, height * PICTURE.middle);
    // The picture in the night's well, under a gold edge and a faint line inside it
    const { width: w, height: h } = PICTURE;
    this.picture
      .clear()
      .rect(-w / 2, -h / 2, w, h)
      .fill({ color: NIGHT.well, alpha: 0.85 });
    this.frame
      .clear()
      .rect(-w / 2, -h / 2, w, h)
      .stroke({ width: 2, color: THEME.brass })
      .rect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16)
      .stroke({ width: 1, color: THEME.brass, alpha: 0.35 });
    this.words.position.set(0, h / 2 + PICTURE.gap);
    const bottom = height - BUTTON.bottom;
    const row = BUTTON.skip + BUTTON.gap + BUTTON.width;
    this.skip.tile.container.position.set((width - row) / 2, bottom - BUTTON.height);
    this.next.tile.container.position.set((width - row) / 2 + BUTTON.skip + BUTTON.gap, bottom - BUTTON.height);
    const dotsWidth = (PROLOGUE.length - 1) * DOTS.gap;
    this.dots.clear();
    PROLOGUE.forEach((_, i) => {
      const x = width / 2 - dotsWidth / 2 + i * DOTS.gap;
      const y = bottom - BUTTON.height - DOTS.above;
      if (i === this.card) this.dots.circle(x, y, DOTS.radius).fill({ color: THEME.title });
      else this.dots.circle(x, y, DOTS.radius - 1).stroke({ width: 1, color: THEME.brass });
    });
  }

  /** The next card; after the last, the game */
  private advance() {
    if (this.shown < FADE) {
      this.shown = FADE;
      return;
    }
    if (this.card + 1 < PROLOGUE.length) this.showCard(this.card + 1);
    else this.finish();
  }

  private finish() {
    this.container.visible = false;
    this.unload();
    this.onDone();
  }

  /** The cards' pictures let go of once it is over (megabytes of the GPU's memory): it isn't shown again */
  private unload() {
    if (!this.loading) return;
    this.loading = false;
    this.pictures.fill(null);
    this.art.texture = Texture.EMPTY;
    PROLOGUE.forEach((_, card) => void Assets.unload(pictureUrl(card)).catch(() => undefined));
  }
}
