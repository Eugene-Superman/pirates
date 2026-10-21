import { Container, Text } from 'pixi.js';
import type { Ship } from '../../game';
import { FpsMeter } from './FpsMeter';

const TEXT_STYLE = {
  fontFamily: 'Arial',
  fontSize: 16,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
};

// Screen-space overlay: stays fixed on top of the scene
export class Hud {
  readonly container = new Container();
  private readonly speedText = new Text({ text: '', style: TEXT_STYLE });
  private readonly fps: FpsMeter;
  private shownKnots = -1;

  constructor() {
    const help = new Text({ text: 'Click on the sea to sail', style: { ...TEXT_STYLE, fontSize: 13 } });
    const fpsText = new Text({ text: '', style: TEXT_STYLE });
    help.position.set(16, 16);
    this.speedText.position.set(16, help.y + help.height + 8);
    fpsText.position.set(16, this.speedText.y + 24);
    this.container.addChild(help, this.speedText, fpsText);
    this.fps = new FpsMeter(fpsText);
  }

  update(ship: Ship, frameMs: number) {
    // Assigning Text.text re-renders its texture, so only on change
    const knots = Math.round(ship.speed / 10);
    if (knots !== this.shownKnots) {
      this.shownKnots = knots;
      this.speedText.text = `Speed: ${knots} knots`;
    }
    this.fps.update(frameMs);
  }
}
