import { Container, Graphics, Text } from 'pixi.js';
import { NIGHT } from './nightTheme';
import { THEME } from './theme';
import { playTap } from './ui';

const BOX = 20; // pixels, square
const LABEL_GAP = 8; // pixels between the box and its label
const LABEL_SIZE = 13; // pixels

// An on/off switch with a label, in the night look: a small well of dark glass under a gold edge, a gold tick in it
// while on, the edge lit under the pointer. Like ButtonRow, it shows the state the owner tells it, not one it keeps
export class Checkbox {
  static readonly SIZE = BOX;
  readonly container = new Container();
  private readonly box = new Graphics();
  /** As last told; undefined until the first time */
  private checked: boolean | undefined;
  private hovered = false;

  constructor(label: string, onToggle: () => void) {
    const text = new Text({ text: label, style: { fontFamily: 'Arial', fontSize: LABEL_SIZE, fill: THEME.text } });
    text.position.set(BOX + LABEL_GAP, (BOX - text.height) / 2);
    this.container.addChild(this.box, text);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    // The stage listens for pointerdown to steer the ship; a click here must not reach it
    this.container.on('pointerdown', (e) => e.stopPropagation());
    this.container.on('pointertap', () => {
      playTap();
      onToggle();
    });
    this.container.on('pointerover', () => this.hover(true));
    this.container.on('pointerout', () => this.hover(false));
    this.setChecked(false);
  }

  setChecked(checked: boolean) {
    if (checked === this.checked) return;
    this.checked = checked;
    this.paint();
  }

  private hover(on: boolean) {
    this.hovered = on;
    this.paint();
  }

  private paint() {
    const lit = this.hovered || this.checked === true;
    this.box
      .clear()
      .roundRect(0, 0, BOX, BOX, 4)
      .fill({ color: NIGHT.well, alpha: 0.9 })
      .stroke({ width: lit ? 1.5 : 1, color: this.hovered ? THEME.brassLight : THEME.brass, alpha: lit ? 1 : 0.7 });
    if (this.checked) {
      this.box
        .moveTo(5, BOX / 2)
        .lineTo(BOX / 2 - 1, BOX - 6)
        .lineTo(BOX - 5, 5)
        .stroke({ width: 2.5, color: THEME.title, cap: 'round', join: 'round' });
    }
  }
}
