import { Text, type Rectangle } from 'pixi.js';
import { t } from '../i18n/i18n';
import { THEME, TITLE_STYLE } from './theme';
import { NIGHT_CORNER_REACH, NIGHT_WINDOW, moonButton } from './nightTheme';
import { StoryGuide } from './StoryGuide';
import { HudWindow, show, text, type Tile } from './ui';

const TEXT_WIDTH = 452; // pixels its text takes across, before scaling down to fit the screen
const PAD = 24;
const SIDE = NIGHT_CORNER_REACH + 12; // pixels its text and buttons keep from its sides, clear of its corner pieces
const CLOSE_ROOM = 64; // pixels the gold cross takes in the top right corner, and a gap
const BODY = { top: PAD + 48, gap: 16 } as const; // pixels: the text's top at the least, and under a longer title
const BUTTON = { yes: 240, no: 150, height: 34, gap: 16, top: 142, over: 22 } as const;

/**
 * What a dialog asks: its title, a line or two under it, and what its Yes button says; `guided` when the story asks
 * for it, so Yes is lit for a new player
 */
export interface Question {
  readonly title: string;
  readonly text: string;
  readonly yes: string;
  readonly guided?: boolean;
}

/**
 * A question over everything else, in the night look, before something that can't be undone (selling an item, a
 * quest given up, a passive or a talent taken): Yes does it, Cancel, the cross, Escape or a click beside it doesn't.
 * Enter says yes. One at a time: a new question replaces an open one. As high as its title and text need. When the
 * story asks for what it asks about, the gold pointer clicks Yes (StoryGuide)
 */
export class ConfirmDialog {
  private readonly window: HudWindow;
  private readonly title: Text;
  private readonly body = text('', 14, THEME.text, { wordWrap: true, wordWrapWidth: TEXT_WIDTH, lineHeight: 20 });
  private readonly yes: { readonly tile: Tile; readonly text: Text };
  private readonly no: Tile;
  private readonly guide: StoryGuide;
  private guided = false;
  /** What Yes does, while it is open */
  private onYes: (() => void) | null = null;

  /** Make it before the windows under it listen for Escape, so it closes first */
  constructor(screen: Rectangle) {
    const width = TEXT_WIDTH + SIDE * 2;
    this.window = new HudWindow(
      screen,
      { width, height: BUTTON.top + BUTTON.height + PAD, pad: PAD },
      () => this.hide(),
      NIGHT_WINDOW,
    );
    this.title = new Text({
      text: '',
      style: { ...TITLE_STYLE, fontSize: 24, wordWrap: true, wordWrapWidth: width - PAD - CLOSE_ROOM - SIDE },
    });
    this.title.position.set(SIDE, PAD - 4);
    this.body.position.set(SIDE, BODY.top);
    this.yes = moonButton(BUTTON.yes, BUTTON.height, '', () => this.confirm(), 14, true);
    this.yes.tile.container.x = width - SIDE - BUTTON.yes;
    this.no = moonButton(BUTTON.no, BUTTON.height, t('Cancel'), () => this.hide(), 14).tile;
    this.no.container.x = this.yes.tile.container.x - BUTTON.gap - BUTTON.no;
    this.guide = new StoryGuide({ width });
    this.window.panel.addChild(this.title, this.body, this.no.container, this.yes.tile.container, this.guide.container);
    window.addEventListener('keydown', (e) => {
      if ((e.code !== 'Enter' && e.code !== 'NumpadEnter') || !this.isOpen || e.defaultPrevented) return;
      this.confirm();
      e.preventDefault();
    });
  }

  get container() {
    return this.window.container;
  }

  get isOpen() {
    return this.window.isOpen;
  }

  /** Asks; `onYes` runs only if the player agrees */
  ask(question: Question, onYes: () => void) {
    show(this.title, question.title);
    show(this.body, question.text);
    show(this.yes.text, question.yes);
    this.guided = question.guided === true;
    this.layout();
    this.onYes = onYes;
    this.window.container.visible = true;
    this.window.fit();
  }

  /** Every frame while open: it follows the screen's size. dt: seconds since the last frame */
  update(dt: number) {
    if (!this.isOpen) return;
    this.window.fit();
    this.guide.update(this.guided ? { kind: 'click', target: { container: this.yes.tile.container } } : null, '', dt);
  }

  hide() {
    this.onYes = null;
    this.window.container.visible = false;
  }

  /** The text under the title and the buttons under the text, the window as high as they need */
  private layout() {
    this.body.y = Math.max(BODY.top, this.title.y + this.title.height + BODY.gap);
    const buttons = Math.max(BUTTON.top, this.body.y + this.body.height + BUTTON.over);
    this.yes.tile.container.y = buttons;
    this.no.container.y = buttons;
    this.window.resize(buttons + BUTTON.height + PAD);
  }

  private confirm() {
    const onYes = this.onYes;
    this.hide();
    onYes?.();
  }
}
