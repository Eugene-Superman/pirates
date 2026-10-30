import { Container, Graphics, Sprite, Text, type Rectangle } from 'pixi.js';
import { FEATS, rungReward, type FeatId, type Prize } from '../../game';
import { ITEM_ICONS, MINIMAP_BUTTONS } from './iconAtlas';
import { NIGHT, NIGHT_CORNER_REACH, NIGHT_HEADER, NIGHT_WINDOW, moonButton, nightHeader } from './nightTheme';
import { featRung, fillPrizeSlots, prizeColor, prizeLine, type PrizeSlot } from './rewardText';
import { THEME, TITLE_STYLE, iconSlot } from './theme';
import { HudWindow, UI, doubloon, show, text, whole } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 580; // pixels, before scaling down to fit the screen
const PAD = 24;
const SIDE = NIGHT_CORNER_REACH + 12; // pixels its buttons keep from its sides, clear of its corner pieces
const INSET = PAD + 16; // pixels from its sides to the feat and the reward's lines, between the corner pieces
// Pixels in from the padding: the star before the title, and the title, nearer the window's corner than most
const HEADER_FIT = { pieceX: 20, titleX: 50 } as const;
/** The feat's line under the header: the cup's size, its top, the name's and the goal's tops, the cup's gap to them */
const FEAT = { cup: 52, top: PAD + NIGHT_HEADER.rule + 24, name: 2, goal: 32, gap: 16 } as const;
const TICK = 12; // pixels across: the tick before the goal met
const REWARD_TOP = FEAT.top + FEAT.cup + 22; // pixels: "Your reward"
/** A line of the reward: its height, its first's top, its icon's size, the coin's radius in it, the gap to its text */
const LINE = { height: 46, top: REWARD_TOP + 30, icon: 38, coin: 12, gap: 16 } as const;
const BUTTON = { aye: 150, mastery: 230, height: 34, gap: 16, over: 20 } as const;

/** A tick round (0, 0), `size` pixels across: the goal met */
function drawTick(g: Graphics, size: number, color: number) {
  const h = size / 2;
  return g
    .moveTo(-h, 0)
    .lineTo(-h * 0.2, h * 0.75)
    .lineTo(h, -h * 0.7)
    .stroke({ width: 3, color, cap: 'round', join: 'round' });
}

/**
 * A feat's rung's reward just claimed, over the feats, in the night look: the rung (Monster Slayer II under the cup)
 * and what it asked, met, then a line for each part of the reward with its picture and where it went: the captain's
 * points (the mastery's medallion), the doubloons, each item. "Captain's mastery" takes the player there to spend the
 * points; Aye, the cross, Escape or a click beside it close it
 */
export class FeatReward {
  private readonly window: HudWindow;
  private readonly cup = new Sprite();
  private readonly name = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 22 } });
  private readonly goal = text('', 14, THEME.text);
  /** The reward's lines, laid out anew for each rung shown */
  private readonly lines = new Container();
  private slots: PrizeSlot[] = [];
  /** The mastery's medallion on the points' line, put in once the minimap's buttons have loaded */
  private medallion: Sprite | null = null;
  private readonly aye: ReturnType<typeof moonButton>;
  private readonly mastery: ReturnType<typeof moonButton>;

  /** Make it before the feats listen for Escape, so it closes first. openMastery: the captain's mastery, opened */
  constructor(screen: Rectangle, openMastery: () => void) {
    this.window = new HudWindow(screen, { width: WIDTH, height: 400, pad: PAD }, () => this.hide(), NIGHT_WINDOW);
    const header = nightHeader(WIDTH, PAD, t('Feat reached!'), HEADER_FIT);
    this.cup.anchor.set(0.5);
    this.cup.position.set(INSET + FEAT.cup / 2, FEAT.top + FEAT.cup / 2);
    const textX = INSET + FEAT.cup + FEAT.gap;
    this.name.position.set(textX, FEAT.top + FEAT.name);
    const tick = drawTick(new Graphics(), TICK, UI.good);
    tick.position.set(textX + TICK / 2, FEAT.top + FEAT.goal + 9);
    this.goal.position.set(textX + TICK + 8, FEAT.top + FEAT.goal);
    const heading = new Text({ text: t('Your reward'), style: { ...TITLE_STYLE, fontSize: 16 } });
    heading.position.set(INSET, REWARD_TOP);
    this.aye = moonButton(BUTTON.aye, BUTTON.height, t('Aye!'), () => this.hide(), 14, true);
    this.aye.tile.container.x = WIDTH - SIDE - BUTTON.aye;
    this.mastery = moonButton(BUTTON.mastery, BUTTON.height, t("Captain's mastery (P)"), () => {
      this.hide();
      openMastery();
    });
    this.mastery.tile.container.x = this.aye.tile.container.x - BUTTON.gap - BUTTON.mastery;
    this.window.panel.addChild(
      header.container,
      this.cup,
      this.name,
      tick,
      this.goal,
      heading,
      this.lines,
      this.mastery.tile.container,
      this.aye.tile.container,
    );
  }

  get container() {
    return this.window.container;
  }

  get isOpen() {
    return this.window.isOpen;
  }

  /** Shows the reward of a ladder's rung (0 for the first), just claimed */
  open(id: FeatId, rung: number) {
    const feat = FEATS[id];
    show(this.name, featRung(feat, rung));
    show(this.goal, t(feat.text, { n: whole(feat.goals[rung] ?? 0) }));
    const { points, prizes } = rungReward(feat, rung);
    for (const child of this.lines.removeChildren()) child.destroy({ children: true });
    this.slots = [];
    this.medallion = new Sprite({ anchor: 0.5 });
    this.medallion.setSize(LINE.icon, LINE.icon);
    this.line(0, this.medallion, t("+{n} captain's point|+{n} captain's points", { n: points }), t('Yours to spend'));
    prizes.forEach((prize, i) => {
      const where = prize.kind === 'doubloons' ? t('In the purse') : t('In the hold');
      this.line(i + 1, this.prizeIcon(prize), prizeLine(prize), where);
    });
    const buttons = LINE.top + (prizes.length + 1) * LINE.height + BUTTON.over;
    this.aye.tile.container.y = buttons;
    this.mastery.tile.container.y = buttons;
    this.window.resize(buttons + BUTTON.height + PAD);
    this.window.container.visible = true;
    MINIMAP_BUTTONS.load(() => {});
    ITEM_ICONS.load(() => {});
    this.update();
  }

  hide() {
    this.window.container.visible = false;
  }

  /** Every frame while open: it follows the screen's size, and the pictures come in as they load */
  update() {
    if (!this.isOpen) return;
    this.window.fit();
    const cup = MINIMAP_BUTTONS.get('feats');
    if (cup && this.cup.texture !== cup) {
      this.cup.texture = cup;
      this.cup.setSize(FEAT.cup, FEAT.cup);
    }
    const medallion = MINIMAP_BUTTONS.get('mastery');
    if (medallion && this.medallion && this.medallion.texture !== medallion) {
      this.medallion.texture = medallion;
      this.medallion.setSize(LINE.icon, LINE.icon);
    }
    fillPrizeSlots(this.slots);
  }

  /** A prize's picture, round its middle: a slot glowing in its grade's colour, the doubloon drawn in its */
  private prizeIcon(prize: Prize) {
    const icon = new Container();
    const slot = iconSlot(LINE.icon, prizeColor(prize), '', false);
    slot.container.position.set(-LINE.icon / 2, -LINE.icon / 2);
    icon.addChild(slot.container);
    if (prize.kind === 'doubloons') icon.addChild(doubloon(LINE.coin));
    else this.slots.push({ prize, show: slot.show, shown: false });
    return icon;
  }

  /** The `index`th line of the reward: its picture, what it is, and where it went, dimmer, at the line's end */
  private line(index: number, icon: Container, what: string, where: string) {
    const middle = LINE.top + index * LINE.height + LINE.icon / 2;
    icon.position.set(INSET + LINE.icon / 2, middle);
    const label = text(what, 16, THEME.title, { fontWeight: 'bold' });
    label.anchor.set(0, 0.5);
    label.position.set(INSET + LINE.icon + LINE.gap, middle);
    const note = text(where, 12, NIGHT.dim);
    note.anchor.set(1, 0.5);
    note.position.set(WIDTH - INSET, middle);
    this.lines.addChild(icon, label, note);
  }
}
