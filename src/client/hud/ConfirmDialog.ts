import { Text, type Rectangle } from 'pixi.js';
import { t } from '../i18n/i18n';
import { THEME, THEMED_WINDOW, TITLE_STYLE, brassButton } from './theme';
import { HudWindow, show, text, type Tile } from './ui';

const WIDTH = 500; // pixels, before scaling down to fit the screen
const HEIGHT = 200;
const PAD = 24;
const CLOSE_ROOM = 120; // pixels the Close button takes in the top right corner
const BUTTON = { yes: 240, no: 150, height: 34, gap: 12 } as const;

/** What a dialog asks: its title, a line or two under it, and what its Yes button says */
export interface Question {
  readonly title: string;
  readonly text: string;
  readonly yes: string;
}

/**
 * A question over everything else, before something that can't be undone (selling an item): Yes does it, Cancel,
 * Close, Escape or a click beside it doesn't. Enter says yes. One at a time: a new question replaces an open one
 */
export class ConfirmDialog {
  private readonly window: HudWindow;
  private readonly title = new Text({
    text: '',
    style: { ...TITLE_STYLE, fontSize: 24, wordWrap: true, wordWrapWidth: WIDTH - PAD * 2 - CLOSE_ROOM },
  });
  private readonly body = text('', 14, THEME.text, { wordWrap: true, wordWrapWidth: WIDTH - PAD * 2, lineHeight: 20 });
  private readonly yes: { readonly tile: Tile; readonly text: Text };
  /** What Yes does, while it is open */
  private onYes: (() => void) | null = null;

  /** Make it before the windows under it listen for Escape, so it closes first */
  constructor(screen: Rectangle) {
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), THEMED_WINDOW);
    this.title.position.set(PAD, PAD - 4);
    this.body.position.set(PAD, PAD + 48);
    const bottom = HEIGHT - PAD - BUTTON.height;
    this.yes = brassButton(BUTTON.yes, BUTTON.height, '', () => this.confirm(), 14);
    this.yes.tile.container.position.set(WIDTH - PAD - BUTTON.yes, bottom);
    const no = brassButton(BUTTON.no, BUTTON.height, t('Cancel'), () => this.hide(), 14);
    no.tile.container.position.set(this.yes.tile.container.x - BUTTON.gap - BUTTON.no, bottom);
    this.window.panel.addChild(this.title, this.body, no.tile.container, this.yes.tile.container);
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
    this.onYes = onYes;
    this.window.container.visible = true;
    this.window.fit();
  }

  /** Every frame while open: it follows the screen's size */
  update() {
    if (this.isOpen) this.window.fit();
  }

  hide() {
    this.onYes = null;
    this.window.container.visible = false;
  }

  private confirm() {
    const onYes = this.onYes;
    this.hide();
    onYes?.();
  }
}
