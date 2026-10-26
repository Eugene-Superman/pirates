import { Container, Graphics } from 'pixi.js';
import { MAX_QUESTS, QUESTS, cargoCount, questDone, type Player, type Ship } from '../../game';
import { UI, drawCoin, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const MARGIN = 16; // pixels from the screen's top
const WIDTH = 230;
const PAD = 10;
const LINE = 17; // pixels per quest line

/**
 * The player's purse and quests in the top right corner, beside the fullscreen button: their gold and how full the
 * hold is (a click on it opens the hold), and every quest taken with how far it has got (a done one in green, to turn
 * in at the tavern)
 */
export class GoldPanel {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly gold = text('', 16, 0xffcf3f, { fontWeight: 'bold' });
  private readonly hold = text('', 13, UI.text, { fontWeight: 'bold' });
  private readonly quests = Array.from({ length: MAX_QUESTS }, () => text('', 12, UI.text));
  /** What the background was drawn for */
  private drawnFor = '';

  /** onHold: what a click on the hold does */
  constructor(onHold: () => void) {
    const coin = new Graphics();
    drawCoin(coin, 8);
    coin.position.set(PAD + 8, PAD + 10);
    this.gold.position.set(PAD + 22, PAD);
    this.hold.anchor.set(1, 0);
    this.hold.position.set(WIDTH - PAD, PAD + 2);
    this.hold.eventMode = 'static';
    this.hold.cursor = 'pointer';
    this.hold.on('pointertap', onHold);
    this.quests.forEach((line, i) => line.position.set(PAD, PAD + 26 + i * LINE));
    this.container.addChild(this.background, coin, this.gold, this.hold, ...this.quests);
    this.container.eventMode = 'static';
    // A click on it must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
  }

  /** Where its bottom edge is now, pixels */
  get bottom() {
    return MARGIN + this.height;
  }

  private height = 0;

  /** right: where its right edge goes, pixels */
  update(player: Player, ship: Ship, right: number) {
    this.container.position.set(right - WIDTH, MARGIN);
    show(this.gold, t('{n} gold', { n: player.gold }));
    const cargo = cargoCount(ship.cargo);
    show(this.hold, t('Hold {cargo}/{size}', { cargo, size: ship.holdSize }));
    tint(this.hold, cargo >= ship.holdSize ? UI.warn : UI.dim);
    this.quests.forEach((line, i) => {
      const quest = player.quests[i];
      line.visible = quest !== undefined;
      if (!quest) return;
      const { title, count } = QUESTS[quest.id];
      const done = questDone(quest);
      show(
        line,
        done ? t('{title}: done, back to the tavern', { title: t(title) }) : `${t(title)}: ${quest.kills}/${count}`,
      );
      tint(line, done ? UI.good : UI.text);
    });
    const height = PAD * 2 + 22 + player.quests.length * LINE;
    this.height = height;
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
