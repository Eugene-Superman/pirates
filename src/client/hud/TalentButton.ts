import { Container, Graphics } from 'pixi.js';
import { talentsToPick, type Ship } from '../../game';
import { Tile, UI, drawStar, show, text } from './ui';
import { t } from '../i18n/i18n';

const MIN_WIDTH = 158; // pixels: as wide as its label needs, at least this
const LABEL_X = 32; // pixels: where the label starts, after the star
const HEIGHT = 34;
const RADIUS = 8;
const PULSE = 1.4; // seconds one pulse of its glow takes
// The glow round it: rings a few pixels apart, fainter outwards, their alpha pulsing together
const GLOW = { rings: 4, step: 2.5, alpha: 0.22, color: 0xffc94a } as const;
const POP = { time: 0.4, scale: 1.3 } as const; // it pops in this much bigger when a level is reached, for these seconds
const KEY = { size: 18, gap: 8 } as const; // pixels: the K chip at its right end

function talentsLabel(n: number) {
  return t('{n} talent to pick|{n} talents to pick', { n });
}

/**
 * Beside the player's frame while a talent waits to be picked: a golden button with a pulsing glow that opens the
 * talent tree, as K does. It pops in when the ship reaches a level, and is gone once every talent is picked
 */
export class TalentButton {
  static readonly HEIGHT = HEIGHT;
  /** Pixels: wide enough for its longest label in the language picked */
  readonly width: number;
  readonly container = new Container();
  private readonly glow = new Graphics();
  private readonly tile: Tile;
  private readonly label = text('', 14, UI.darkText, { fontWeight: 'bold' });
  /** Talents to pick when last updated, to pop the button when there are more */
  private count = 0;
  /** Seconds since it last popped */
  private popAge: number = POP.time;
  private clock = 0;

  constructor(open: () => void) {
    // Two-digit counts in every plural form, and the label for one
    const labels = [t('Pick a talent'), ...[21, 22, 25].map((n) => talentsLabel(n))];
    const widest = Math.max(
      ...labels.map((label) => {
        const probe = text(label, 14, UI.darkText, { fontWeight: 'bold' });
        const { width } = probe;
        probe.destroy();
        return width;
      }),
    );
    const width = Math.max(MIN_WIDTH, Math.ceil(LABEL_X + widest + KEY.gap * 2 + KEY.size));
    this.width = width;
    for (let i = GLOW.rings; i >= 1; i--) {
      const out = i * GLOW.step;
      this.glow
        .roundRect(-out, -out, width + out * 2, HEIGHT + out * 2, RADIUS + out)
        .fill({ color: GLOW.color, alpha: GLOW.alpha / i });
    }
    this.tile = new Tile(width, HEIGHT, open, RADIUS);
    this.tile.setLook({ pressed: true, border: 0xfff1c2 });
    const star = new Graphics();
    drawStar(star, 9, UI.darkText);
    star.position.set(17, HEIGHT / 2);
    this.label.anchor.set(0, 0.5);
    this.label.position.set(LABEL_X, HEIGHT / 2);
    const chip = new Graphics()
      .roundRect(width - KEY.gap - KEY.size, (HEIGHT - KEY.size) / 2, KEY.size, KEY.size, 4)
      .fill({ color: UI.darkText, alpha: 0.85 });
    const key = text('K', 12, UI.active, { fontWeight: 'bold' });
    key.anchor.set(0.5);
    key.position.set(width - KEY.gap - KEY.size / 2, HEIGHT / 2);
    this.tile.content.addChild(star, this.label, chip, key);
    // Scaled round its middle when it pops
    this.container.pivot.set(width / 2, HEIGHT / 2);
    this.container.addChild(this.glow, this.tile.container);
    this.container.visible = false;
  }

  /** x, y: its top left corner. dt: seconds since the last frame, for the glow */
  update(ship: Ship, x: number, y: number, dt: number) {
    const count = Math.max(0, talentsToPick(ship));
    if (count > this.count) this.popAge = 0;
    this.count = count;
    this.container.visible = count > 0 && !ship.isSinking;
    if (!this.container.visible) return;
    this.container.position.set(x + this.width / 2, y + HEIGHT / 2);
    show(this.label, count > 1 ? talentsLabel(count) : t('Pick a talent'));
    this.clock = (this.clock + dt) % PULSE;
    this.glow.alpha = 0.45 + 0.55 * Math.sin((this.clock / PULSE) * Math.PI) ** 2;
    this.popAge = Math.min(POP.time, this.popAge + dt);
    const k = this.popAge / POP.time;
    this.container.scale.set(1 + (POP.scale - 1) * (1 - k) ** 2);
  }
}
