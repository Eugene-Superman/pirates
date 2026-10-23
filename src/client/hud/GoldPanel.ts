import { Container, Graphics } from 'pixi.js';
import { MAX_QUESTS, QUESTS, questDone, type Player } from '../../game';
import { UI, drawCoin, show, text, tint } from './ui';

const MARGIN = 16; // pixels from the screen's edges
const WIDTH = 230;
const PAD = 10;
const LINE = 17; // pixels per quest line

/**
 * The player's purse and quests in the top right corner: their gold, and every quest taken with how far it has got
 * (a done one in green, to turn in at the tavern)
 */
export class GoldPanel {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly gold = text('', 16, 0xffcf3f, { fontWeight: 'bold' });
  private readonly quests = Array.from({ length: MAX_QUESTS }, () => text('', 12, UI.text));
  /** What the background was drawn for */
  private drawnFor = '';

  constructor() {
    const coin = new Graphics();
    drawCoin(coin, 8);
    coin.position.set(PAD + 8, PAD + 10);
    this.gold.position.set(PAD + 22, PAD);
    this.quests.forEach((line, i) => line.position.set(PAD, PAD + 26 + i * LINE));
    this.container.addChild(this.background, coin, this.gold, ...this.quests);
    this.container.eventMode = 'static';
    // A click on it must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
  }

  update(player: Player, screenWidth: number) {
    this.container.position.set(screenWidth - MARGIN - WIDTH, MARGIN);
    show(this.gold, `${player.gold} gold`);
    this.quests.forEach((line, i) => {
      const quest = player.quests[i];
      line.visible = quest !== undefined;
      if (!quest) return;
      const { title, count } = QUESTS[quest.id];
      const done = questDone(quest);
      show(line, done ? `${title}: done, back to the tavern` : `${title}: ${quest.kills}/${count}`);
      tint(line, done ? UI.good : UI.text);
    });
    const height = PAD * 2 + 22 + player.quests.length * LINE;
    const key = `${height}`;
    if (key === this.drawnFor) return;
    this.drawnFor = key;
    this.background
      .clear()
      .roundRect(0, 0, WIDTH, height, 8)
      .fill({ color: UI.panel, alpha: UI.panelAlpha })
      .stroke({ width: 1, color: UI.border, alpha: 0.3 });
  }
}
