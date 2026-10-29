import { Container, Graphics, Sprite, Text, type Rectangle } from 'pixi.js';
import { SPEAKERS, type SpeakerId } from '../../game';
import { SPEAKER_ICONS } from './iconAtlas';
import { NIGHT, moonButton, nightPlate } from './nightTheme';
import { THEME, TITLE_STYLE } from './theme';
import { show, text } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 640; // pixels, before scaling down to a narrow screen
const HEIGHT = 168;
const MARGIN = 16; // pixels it keeps from the screen's sides
const PORTRAIT = { radius: 52, x: 22, ring: 3 } as const; // pixels: the speaker's portrait, its left edge, its gold ring
const TEXT_X = PORTRAIT.x + PORTRAIT.radius * 2 + 22; // pixels: where the name and the words start
const TEXT_WIDTH = WIDTH - TEXT_X - 20;
const NAME = { y: 14, size: 19, roleGap: 10 } as const; // pixels: the speaker's name, and their role after it
const WORDS = { y: 44, size: 15, line: 20 } as const; // pixels: what they say, three lines at most
const BUTTON = { width: 112, skip: 96, height: 28, gap: 8, bottom: 12 } as const; // pixels: Next and Skip
const LETTERS_PER_SECOND = 55; // how fast a line is written out; a click shows the rest at once
// Seconds of one frame counted at most: a long one (the tab hidden a while) neither writes a line out nor ends a tip
const MAX_FRAME = 0.25;
const FADE = 0.6; // seconds a conversation that goes by itself (a tip) takes to fade out at the end of its time
// The placeholders' colours, a speaker's each, until their portraits have loaded (or for one not painted)
const COLORS: Readonly<Record<SpeakerId, number>> = {
  keeper: 0xf0c66a, // the lighthouse's lamp
  bosun: 0xc99a45, // brass and tar
  harbourMaster: 0x7fb0d8, // the harbour's flags
  shard: 0x9fe8ff, // moonlight
};

/** A line of a conversation: who says it, in English (shown through t(), filled from `params`) */
export interface TalkLine {
  readonly speaker: SpeakerId;
  readonly text: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * A conversation to play: the story's (its StoryTalk), or a tip of the bosun's (Tips.ts). `key` names it: a new key
 * starts it from its first line
 */
export interface Talk {
  readonly key: string;
  readonly lines: readonly TalkLine[];
  /** Seconds it stays before it goes by itself, as if heard out (a tip's); none for one that waits for Next */
  readonly lasts?: number;
}

/**
 * A conversation of the story at the bottom of the screen, over the sea or the harbour, in the night look: the
 * speaker's painted portrait in a gold ring on the left (their initial, until it is painted or loaded), their name and
 * role, and their line written out letter by letter; Next (a click on it, or Enter) shows the rest of the line, then
 * the next one, and after the last tells the game it was heard; Skip tells it at once. The game goes on under it: a
 * conversation never stops the sea (online it couldn't). The bosun's tips are shown in it too, each going by itself
 * after a while
 */
export class DialogueBox {
  static readonly HEIGHT = HEIGHT;
  readonly container = new Container();
  /** The portrait's well, and the placeholder's ring in it */
  private readonly portrait = new Graphics();
  private readonly face = new Sprite();
  private readonly initial: Text;
  private readonly name: Text;
  private readonly role = text('', 12, NIGHT.dim, { fontStyle: 'italic' });
  private readonly words = text('', WORDS.size, THEME.text, {
    wordWrap: true,
    wordWrapWidth: TEXT_WIDTH,
    lineHeight: WORDS.line,
  });
  /** Which line of how many */
  private readonly count = text('', 11, NIGHT.dim);
  private readonly next: ReturnType<typeof moonButton>;
  private readonly screen: Rectangle;
  private readonly onHeard: (key: string) => void;
  /** The conversation playing, its line and how much of it is written out */
  private talk: Talk | null = null;
  private line = 0;
  private written = 0;
  /** Seconds it has been shown: one that goes by itself (`lasts`) goes when they are up */
  private age = 0;
  /** The conversation last heard out: not played again while the game still offers it (it refused it) */
  private heard = '';
  private painted: SpeakerId | null = null;

  /** onHeard: the conversation of this key was heard out, or skipped */
  constructor(screen: Rectangle, onHeard: (key: string) => void) {
    this.screen = screen;
    this.onHeard = onHeard;
    this.container.visible = false;
    const plate = nightPlate(WIDTH, HEIGHT);
    const { radius, x, ring } = PORTRAIT;
    const cut = new Graphics().circle(x + radius, HEIGHT / 2, radius).fill(0xffffff);
    this.face.mask = cut;
    this.face.anchor.set(0.5);
    this.face.position.set(x + radius, HEIGHT / 2);
    // The gold ring over the portrait's edge
    const rim = new Graphics().circle(x + radius, HEIGHT / 2, radius).stroke({ width: ring, color: THEME.brass });
    // Dressed again once the portraits are there
    SPEAKER_ICONS.load(() => (this.painted = null));
    this.initial = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 44 } });
    this.initial.anchor.set(0.5);
    this.initial.position.set(x + radius, HEIGHT / 2);
    this.name = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: NAME.size } });
    this.name.position.set(TEXT_X, NAME.y);
    this.role.anchor.set(0, 1);
    this.words.position.set(TEXT_X, WORDS.y);
    this.count.anchor.set(0, 0.5);
    this.count.position.set(TEXT_X, HEIGHT - BUTTON.bottom - BUTTON.height / 2);
    this.next = moonButton(BUTTON.width, BUTTON.height, t('Next'), () => this.advance(), 13, true);
    this.next.tile.container.position.set(WIDTH - 20 - BUTTON.width, HEIGHT - BUTTON.bottom - BUTTON.height);
    const skip = moonButton(BUTTON.skip, BUTTON.height, t('Skip'), () => this.finish(), 12);
    skip.tile.container.position.set(this.next.tile.container.x - BUTTON.gap - BUTTON.skip, this.next.tile.container.y);
    this.container.addChild(
      plate,
      this.portrait,
      this.face,
      cut,
      rim,
      this.initial,
      this.name,
      this.role,
      this.words,
      this.count,
      skip.tile.container,
      this.next.tile.container,
    );
    this.container.eventMode = 'static';
    // A click on it must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (!this.container.visible || e.defaultPrevented) return;
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      // A key held down would race through the whole conversation and tell the game it was heard
      if (!e.repeat) this.advance();
      e.preventDefault();
    });
  }

  /**
   * Plays what the story has to tell now (`talk`), from its first line when it is a new one; null, or `hidden` (a
   * window over it, the prologue), hides it. dt: seconds since the last frame, for the writing out
   */
  update(talk: Talk | null, hidden: boolean, dt: number) {
    if (talk?.key !== this.talk?.key) {
      this.talk = talk;
      this.line = 0;
      this.written = 0;
      this.age = 0;
    }
    if (talk?.key !== this.heard) this.heard = '';
    const shown = talk !== null && !hidden && this.heard === '';
    this.container.visible = shown;
    if (!shown) return;
    const step = Math.min(dt, MAX_FRAME);
    if (talk.lasts !== undefined) {
      this.age += step;
      if (this.age >= talk.lasts) {
        this.finish();
        return;
      }
    }
    this.container.alpha = talk.lasts === undefined ? 1 : Math.min(1, (talk.lasts - this.age) / FADE);
    const scale = Math.min(1, (this.screen.width - MARGIN * 2) / WIDTH);
    this.container.scale.set(scale);
    const line = talk.lines[this.line];
    if (!line) return;
    this.written = Math.min(line.text.length, this.written + step * LETTERS_PER_SECOND);
    this.dress(line.speaker);
    const words = t(line.text, line.params);
    // Written out as far as the English has got, by share: the translation is as long as it is
    show(this.words, words.slice(0, Math.ceil((words.length * this.written) / line.text.length)));
    show(this.count, `${this.line + 1} / ${talk.lines.length}`);
    show(this.next.text, this.line + 1 < talk.lines.length ? t('Next') : t('Done'));
  }

  /** Where it goes: its top left corner, its width as it is scaled */
  place(x: number, y: number) {
    this.container.position.set(x, y);
  }

  /** Pixels: its width as shown, scaled to the screen */
  get width() {
    return WIDTH * this.container.scale.x;
  }

  /** The speaker's portrait, name and role, when the speaker changes */
  private dress(speaker: SpeakerId) {
    if (speaker === this.painted) return;
    this.painted = speaker;
    const { name, role } = SPEAKERS[speaker];
    show(this.name, t(name));
    show(this.role, t(role));
    this.role.position.set(this.name.x + this.name.width + NAME.roleGap, this.name.y + this.name.height - 3);
    // The painted portrait in the night's well; till it is painted or loaded, the speaker's initial in a ring of theirs
    const { radius, x, ring } = PORTRAIT;
    const texture = SPEAKER_ICONS.get(speaker);
    this.portrait
      .clear()
      .circle(x + radius, HEIGHT / 2, radius)
      .fill({ color: NIGHT.well });
    this.face.visible = texture !== null;
    this.initial.visible = texture === null;
    if (texture) {
      this.face.texture = texture;
      this.face.setSize(radius * 2, radius * 2);
      return;
    }
    const color = COLORS[speaker];
    this.portrait.circle(x + radius, HEIGHT / 2, radius - ring * 2).stroke({ width: 1, color, alpha: 0.6 });
    show(this.initial, t(name).charAt(0));
    this.initial.style.fill = color;
  }

  /** Shows the rest of the line being written; or the next line; or, after the last, tells the game it was heard */
  private advance() {
    const line = this.talk?.lines[this.line];
    if (!this.talk || !line) return;
    if (this.written < line.text.length) {
      this.written = line.text.length;
      return;
    }
    if (this.line + 1 < this.talk.lines.length) {
      this.line++;
      this.written = 0;
      return;
    }
    this.finish();
  }

  /** The conversation heard out, or skipped */
  private finish() {
    if (!this.talk) return;
    this.heard = this.talk.key;
    this.container.visible = false;
    this.onHeard(this.talk.key);
  }
}
