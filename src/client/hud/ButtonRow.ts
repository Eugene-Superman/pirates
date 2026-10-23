import { Container, Graphics, Text } from 'pixi.js';

export interface ButtonSpec<K> {
  label: string;
  /** What the owner calls this button when it says which are pressed; null for plain action buttons */
  key: K | null;
  onTap: () => void;
}

interface Button<K> {
  background: Graphics;
  text: Text;
  width: number;
  key: K | null;
  /** As last painted; undefined until the first paint */
  pressed: boolean | undefined;
}

const BUTTON_HEIGHT = 26; // pixels
const BUTTON_GAP = 6;
const PADDING_X = 10;
const COLORS = {
  idle: 0x0b3a52,
  active: 0xf2b33d,
  text: 0xffffff,
  activeText: 0x1b1b1b,
  border: 0xffffff,
};

// A row of HUD buttons. Some of them can be shown pressed: the row doesn't decide which, the owner tells it
// from the real state (ship health, camera zoom, shown range rings), so the highlight never disagrees with the game
export class ButtonRow<K> {
  static readonly HEIGHT = BUTTON_HEIGHT;
  readonly container = new Container();
  private readonly buttons: Button<K>[] = [];

  constructor(specs: readonly ButtonSpec<K>[]) {
    let x = 0;
    for (const spec of specs) {
      const button = this.makeButton(spec, x);
      x += button.width + BUTTON_GAP;
      this.buttons.push(button);
    }
    this.setActive(null);
  }

  /** One button pressed, the one with this key: a choice of one option */
  setActive(key: K | null) {
    this.setPressed((k) => k === key);
  }

  /** Any number of buttons pressed: on/off switches */
  setPressed(isPressed: (key: K) => boolean) {
    for (const b of this.buttons) {
      const pressed = b.key !== null && isPressed(b.key);
      // Repainting re-renders the text's texture, so only on change
      if (pressed === b.pressed) continue;
      b.pressed = pressed;
      b.background
        .clear()
        .roundRect(0, 0, b.width, BUTTON_HEIGHT, 6)
        .fill({ color: pressed ? COLORS.active : COLORS.idle, alpha: 0.9 })
        .stroke({ width: 1, color: COLORS.border, alpha: 0.5 });
      b.text.style.fill = pressed ? COLORS.activeText : COLORS.text;
    }
  }

  private makeButton(spec: ButtonSpec<K>, x: number): Button<K> {
    const container = new Container();
    const background = new Graphics();
    const text = new Text({ text: spec.label, style: { fontFamily: 'Arial', fontSize: 13, fill: COLORS.text } });
    const width = Math.ceil(text.width) + PADDING_X * 2;
    text.position.set(PADDING_X, (BUTTON_HEIGHT - text.height) / 2);
    container.addChild(background, text);
    container.position.set(x, 0);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    // The stage listens for pointerdown to steer the ship; a click on a button must not reach it
    container.on('pointerdown', (e) => e.stopPropagation());
    container.on('pointertap', spec.onTap);
    this.container.addChild(container);
    return { background, text, width, key: spec.key, pressed: undefined };
  }
}
