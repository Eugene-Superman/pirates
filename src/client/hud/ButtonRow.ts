import { Container } from 'pixi.js';
import { moonButton, moonButtonEnd } from './nightTheme';
import type { Tile } from './ui';

export interface ButtonSpec<K> {
  label: string;
  /** What the owner calls this button when it says which are pressed; null for plain action buttons */
  key: K | null;
  onTap: () => void;
}

interface Button<K> {
  readonly tile: Tile;
  readonly key: K | null;
  /** As last shown; undefined until the first time */
  pressed: boolean | undefined;
}

// Pixels: a button's height, the gap between two, its label's size, and the room its label keeps beyond its stars
const BUTTON = { height: 28, gap: 8, font: 12, room: 6 } as const;

// A row of the night look's buttons (moonButton), each as wide as its label. Some of them can be shown pressed (lit):
// the row doesn't decide which, the owner tells it from the real state (ship health, camera zoom), so the light never
// disagrees with the game
export class ButtonRow<K> {
  static readonly HEIGHT = BUTTON.height;
  readonly container = new Container();
  private readonly buttons: Button<K>[] = [];

  /** most: pixels across the row takes at most; a button that would reach past it goes on a line under the others */
  constructor(specs: readonly ButtonSpec<K>[], most = Infinity) {
    const end = moonButtonEnd(BUTTON.height) + BUTTON.room;
    let x = 0;
    let y = 0;
    for (const spec of specs) {
      const { tile, text, resize } = moonButton(0, BUTTON.height, spec.label, spec.onTap, BUTTON.font);
      const width = Math.ceil(text.width) + end * 2;
      resize(width);
      if (x > 0 && x + width > most) {
        x = 0;
        y += BUTTON.height + BUTTON.gap;
      }
      tile.container.position.set(x, y);
      x += width + BUTTON.gap;
      this.container.addChild(tile.container);
      this.buttons.push({ tile, key: spec.key, pressed: undefined });
    }
  }

  /** One button pressed, the one with this key: a choice of one option */
  setActive(key: K | null) {
    this.setPressed((k) => k === key);
  }

  /** Any number of buttons pressed: on/off switches */
  setPressed(isPressed: (key: K) => boolean) {
    for (const b of this.buttons) {
      const pressed = b.key !== null && isPressed(b.key);
      // Repainting re-renders the button, so only on change
      if (pressed === b.pressed) continue;
      b.pressed = pressed;
      b.tile.setLook({ pressed });
    }
  }
}
