import { Container, Graphics, type Text } from 'pixi.js';
import { captainsPath, goalOffer, offerName, type GameState, type PathStepId } from '../../game';
import { UI, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 230; // pixels: as wide as the gold panel over it
const PAD = 10;
const HEADER = 22; // pixels: the goal's line
const LINE = 17; // pixels per step
const GAP = 8; // pixels under the gold panel
const LIT_TIME = 4; // seconds a step just done stays lit
const GOLD = 0xffcf3f;

/**
 * The Captain's path in the top right corner, under the gold: the ship the starting waters lead to, and every step
 * towards it, done or how far. A step just done is lit for a moment. A click on it folds it to its first line
 */
export class PathPanel {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly title = text('', 14, GOLD, { fontWeight: 'bold' });
  private readonly count = text('', 12, UI.dim, { fontWeight: 'bold' });
  private readonly lines: Text[] = [];
  private folded = false;
  /** Game time each step was done, while it is lit */
  private readonly lit = new Map<PathStepId, number>();
  private drawnFor = '';

  constructor() {
    this.title.position.set(PAD, PAD - 2);
    this.count.anchor.set(1, 0);
    this.count.position.set(WIDTH - PAD, PAD);
    this.container.addChild(this.background, this.title, this.count);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    // A click on it folds it, and must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
    this.container.on('pointertap', () => (this.folded = !this.folded));
  }

  /** right, top: where its top right corner goes */
  update(state: GameState, right: number, top: number) {
    this.container.position.set(right - WIDTH, top + GAP);
    for (const event of state.events) {
      if (event.type === 'pathStep' && event.shipId === state.ship.id) this.lit.set(event.step, state.time);
    }
    // Once the player owns every ship the shipyard sells there is no goal: the panel is gone
    const offer = goalOffer(state, state.player);
    this.container.visible = offer !== null;
    if (!offer) return;
    const path = captainsPath(state, state.player);
    const done = path.filter((step) => step.done).length;
    show(this.title, t('Goal: the {ship}', { ship: t(offerName(offer)) }));
    show(this.count, `${done}/${path.length}${this.folded ? '  ▸' : '  ▾'}`);
    while (this.lines.length < path.length) {
      const line = text('', 12, UI.text);
      line.position.set(PAD, PAD + HEADER + this.lines.length * LINE);
      this.lines.push(line);
      this.container.addChild(line);
    }
    path.forEach((step, i) => {
      const line = this.lines[i];
      line.visible = !this.folded;
      if (this.folded) return;
      const count = step.need === null ? '' : ` ${step.have}/${step.need}`;
      show(line, `${step.done ? '✓' : '○'} ${t(step.text)}${count}`);
      const litAt = this.lit.get(step.id);
      const lit = litAt !== undefined && state.time - litAt < LIT_TIME;
      tint(line, lit ? GOLD : step.done ? UI.good : UI.text);
    });
    const height = PAD * 2 + HEADER - 4 + (this.folded ? 0 : path.length * LINE);
    const anyLit = [...this.lit.values()].some((at) => state.time - at < LIT_TIME);
    const key = `${height}${anyLit}`;
    if (key === this.drawnFor) return;
    this.drawnFor = key;
    this.background
      .clear()
      .roundRect(0, 0, WIDTH, height, 8)
      .fill({ color: UI.panel, alpha: UI.panelAlpha })
      .stroke({ width: anyLit ? 2 : 1, color: anyLit ? GOLD : UI.border, alpha: anyLit ? 0.9 : 0.3 });
  }
}
