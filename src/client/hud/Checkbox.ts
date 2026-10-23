import { Container, Graphics, Text } from 'pixi.js';

const BOX = 18; // pixels
const LABEL_GAP = 6;
const COLORS = {
  idle: 0x0b3a52,
  checked: 0xf2b33d,
  border: 0xffffff,
  mark: 0x1b1b1b,
  text: 0xffffff,
};

// An on/off switch with a label. Like ButtonRow, it shows the state the owner tells it, not one it keeps itself
export class Checkbox {
  readonly container = new Container();
  private readonly box = new Graphics();
  /** As last painted; undefined until the first paint */
  private shown: boolean | undefined;

  constructor(label: string, onToggle: () => void) {
    const text = new Text({ text: label, style: { fontFamily: 'Arial', fontSize: 13, fill: COLORS.text } });
    text.position.set(BOX + LABEL_GAP, (BOX - text.height) / 2);
    this.container.addChild(this.box, text);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    // The stage listens for pointerdown to steer the ship; a click here must not reach it
    this.container.on('pointerdown', (e) => e.stopPropagation());
    this.container.on('pointertap', onToggle);
    this.setChecked(false);
  }

  setChecked(checked: boolean) {
    if (checked === this.shown) return;
    this.shown = checked;
    this.box
      .clear()
      .roundRect(0, 0, BOX, BOX, 4)
      .fill({ color: checked ? COLORS.checked : COLORS.idle, alpha: 0.9 })
      .stroke({ width: 1, color: COLORS.border, alpha: 0.6 });
    if (checked) {
      this.box
        .moveTo(4, BOX / 2)
        .lineTo(BOX / 2 - 1, BOX - 5)
        .lineTo(BOX - 4, 5)
        .stroke({ width: 2.5, color: COLORS.mark, cap: 'round', join: 'round' });
    }
  }
}
