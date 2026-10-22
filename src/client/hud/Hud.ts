import { Container, Text } from 'pixi.js';
import type { Ship } from '../../game';
import { ButtonRow } from './ButtonRow';
import { DamagePanel, type DamageActions } from './DamagePanel';
import { FpsMeter } from './FpsMeter';

const TEXT_STYLE = {
  fontFamily: 'Arial',
  fontSize: 16,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
};
// Camera zoom levels, as multiples of the default zoom
const ZOOM_LEVELS: readonly number[] = [1, 1.5, 2, 3];
const ROW_GAP = 8; // pixels between the button rows

export interface HudActions extends DamageActions {
  /** Camera zoom as a multiple of the default one */
  setZoom: (level: number) => void;
}

// Screen-space overlay: stays fixed on top of the scene
export class Hud {
  readonly container = new Container();
  private readonly speedText = new Text({ text: '', style: TEXT_STYLE });
  private readonly healthText = new Text({ text: '', style: TEXT_STYLE });
  private readonly fps: FpsMeter;
  private readonly damagePanel: DamagePanel;
  private readonly zoomRow: ButtonRow<number>;
  private shownKnots = -1;
  private shownHealth = -1;

  constructor(actions: HudActions) {
    const help = new Text({ text: 'Click on the sea to sail', style: { ...TEXT_STYLE, fontSize: 13 } });
    const fpsText = new Text({ text: '', style: TEXT_STYLE });
    this.damagePanel = new DamagePanel(actions);
    this.zoomRow = new ButtonRow(
      ZOOM_LEVELS.map((level) => ({ label: `×${level}`, key: level, onTap: () => actions.setZoom(level) })),
    );
    const zoomLabel = new Text({ text: 'Zoom', style: { ...TEXT_STYLE, fontSize: 14 } });
    help.position.set(16, 16);
    this.speedText.position.set(16, help.y + help.height + 8);
    this.healthText.position.set(16, this.speedText.y + 24);
    fpsText.position.set(16, this.healthText.y + 24);
    this.damagePanel.container.position.set(16, fpsText.y + 30);
    const zoomY = this.damagePanel.container.y + ButtonRow.HEIGHT + ROW_GAP;
    zoomLabel.position.set(16, zoomY + (ButtonRow.HEIGHT - zoomLabel.height) / 2);
    this.zoomRow.container.position.set(zoomLabel.x + zoomLabel.width + 8, zoomY);
    this.container.addChild(
      help,
      this.speedText,
      this.healthText,
      fpsText,
      this.damagePanel.container,
      zoomLabel,
      this.zoomRow.container,
    );
    this.fps = new FpsMeter(fpsText);
  }

  /** zoom: the camera's current zoom level, as passed to setZoom */
  update(ship: Ship, frameMs: number, zoom: number) {
    // Assigning Text.text re-renders its texture, so only on change
    const knots = Math.round(ship.speed / 10);
    if (knots !== this.shownKnots) {
      this.shownKnots = knots;
      this.speedText.text = `Speed: ${knots} knots`;
    }
    const health = Math.round(ship.health);
    if (health !== this.shownHealth) {
      this.shownHealth = health;
      this.healthText.text = `Hull: ${health}% (${ship.damageStage})`;
    }
    this.damagePanel.update(ship.damageStage);
    this.zoomRow.setActive(zoom);
    this.fps.update(frameMs);
  }
}
