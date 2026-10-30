import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import {
  FEATS,
  FEAT_IDS,
  RUNG_POINTS,
  captainPoints,
  rewardsToClaim,
  rungReward,
  rungsClaimed,
  rungsReached,
  type FeatId,
  type GameState,
  type Player,
} from '../../game';
import { NIGHT, NIGHT_HEADER, NIGHT_WINDOW, drawNightCard, moonButton, nightHeader } from './nightTheme';
import { ITEM_ICONS } from './iconAtlas';
import { featRung, fillPrizeSlots, layPrizes, prizeLine, type PrizeRowLook, type PrizeSlot } from './rewardText';
import { THEME, TITLE_STYLE, drawMeter } from './theme';
import { Tooltip, type TooltipText } from './Tooltip';
import { HudWindow, UI, show, text, tint, whole, type Tile } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1180; // pixels, before scaling down to fit the screen
const PAD = 24;
const DIVIDER = PAD + NIGHT_HEADER.rule; // the gold line under the header
// Pixels in from the padding: the star before the title, and the title, nearer the window's corner than most
const HEADER_FIT = { pieceX: 20, titleX: 50 } as const;
const TOP = DIVIDER + 30; // pixels: the first row's top, clear of the divider's star
/**
 * A feat's row: its height and the gap under it; where its meter, its count, its rungs and the next rung's reward are,
 * pixels from its left
 */
const ROW = { height: 50, gap: 6, meter: 300, meterWidth: 230, rungs: 580, rungGap: 42, reward: 740 } as const;
const RUNG = 8; // pixels: a rung's diamond's half-width
const RUNG_HALO = 13; // pixels: the light round a rung whose reward waits
/**
 * A rung's reward in its row: an item's slot, pixels square, the gap after a prize and before its count, the count's
 * font size, the doubloon's coin, by itself
 */
const PRIZE: PrizeRowLook = { size: 32, gap: 12, count: 4, font: 13, coin: 9, coinInSlot: false };
const CLAIM = { width: 124, height: 32 } as const; // pixels: the Claim button, at the row's right end
const BREATH = 1.4; // seconds one breath of the light round a rung whose reward waits takes
const BOTTOM = PAD + 14; // pixels under the last row, clear of the window's bottom corner pieces
const HEIGHT = TOP + FEAT_IDS.length * (ROW.height + ROW.gap) - ROW.gap + BOTTOM;

/** What the window does: game methods, as any player action */
export interface FeatsActions {
  /** Claims the reward of a ladder's next rung reached: false if none waits */
  claimFeat: (id: FeatId) => boolean;
}

/** A feat's row */
interface FeatRow {
  readonly id: FeatId;
  /** Its top in the panel */
  readonly top: number;
  readonly goal: Text;
  readonly count: Text;
  readonly meter: Graphics;
  readonly rungs: Graphics;
  /** The light round the rungs whose rewards wait, breathing */
  readonly halo: Graphics;
  /** The reward of its next rung, to claim or to reach: laid out anew when that rung changes */
  readonly reward: Container;
  slots: PrizeSlot[];
  /** The rung whose reward it shows */
  rewardRung: number;
  readonly earned: Text;
  readonly claim: Tile;
  /** The count and the rungs claimed it was drawn for */
  drawn: string;
}

/**
 * The captain's feats (the cup on the minimap's frame), in the night look: a row a ladder, its next goal, how far along
 * it is, its rungs with the captain's points each gives (gold once claimed, a breathing light round one whose reward
 * waits), the next rung's reward (doubloons and items: all of it under the pointer) and Claim while it waits, else
 * the points the ladder gave; the points together and the rewards waiting in the header. A reward claimed is shown in a
 * window of its own (FeatReward). Closed by its gold cross, Escape or a click beside it
 */
export class FeatsPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly actions: FeatsActions;
  private readonly onClaimed: (id: FeatId, rung: number) => void;
  private readonly earned = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 18 } });
  private readonly waiting = text('', 15, THEME.title, { fontWeight: 'bold' });
  private readonly rows: FeatRow[] = [];
  private readonly tooltip = new Tooltip();
  /** The row whose reward is under the pointer */
  private hovered: FeatRow | null = null;
  /** The player as last drawn: whose rewards Claim takes */
  private player: Player | null = null;
  /** Seconds into the lights' breath */
  private clock = 0;

  /** onClaimed: a rung's reward claimed (`rung` 0 for the first), to show what it gave */
  constructor(actions: FeatsActions, screen: Rectangle, onClaimed: (id: FeatId, rung: number) => void) {
    this.actions = actions;
    this.onClaimed = onClaimed;
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), NIGHT_WINDOW);
    this.container = this.window.container;
    const header = nightHeader(WIDTH, PAD, t('Feats'), HEADER_FIT);
    this.earned.position.set(header.title.x + header.title.width + 22, PAD + 4);
    this.waiting.position.set(0, PAD + 7);
    this.window.panel.addChild(header.container, this.earned, this.waiting);
    FEAT_IDS.forEach((id, i) => this.window.panel.addChild(this.row(id, TOP + i * (ROW.height + ROW.gap))));
    this.window.panel.addChild(this.tooltip.container);
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) {
      this.hide();
      return;
    }
    this.container.visible = true;
    ITEM_ICONS.load(() => {});
  }

  hide() {
    this.container.visible = false;
    this.hovered = null;
  }

  /** dt: seconds since the last frame */
  update(state: GameState, dt: number) {
    if (!this.isOpen) return;
    this.window.fit();
    const { player } = state;
    this.player = player;
    const points = captainPoints(state, player).feats;
    show(this.earned, t('+{n} point|+{n} points', { n: points }));
    tint(this.earned, points > 0 ? THEME.title : NIGHT.dim);
    const waiting = rewardsToClaim(player);
    show(this.waiting, waiting > 0 ? t('{n} reward to claim|{n} rewards to claim', { n: waiting }) : '');
    this.waiting.x = this.earned.x + this.earned.width + 22;
    this.clock = (this.clock + dt) % BREATH;
    const breath = Math.sin((this.clock / BREATH) * Math.PI) ** 2;
    for (const row of this.rows) {
      this.draw(row, player);
      row.halo.alpha = 0.3 + 0.7 * breath;
      fillPrizeSlots(row.slots);
    }
    const row = this.hovered;
    const hint = row ? this.rewardHint(row, player) : null;
    const box = row?.reward.hitArea;
    const x = PAD + ROW.reward + (box instanceof Rectangle ? box.width / 2 : 0);
    this.tooltip.point(hint, x, row?.top ?? 0, { width: WIDTH, under: (row?.top ?? 0) + ROW.height });
  }

  /** A ladder's row as the player has it now: drawn again only when its count or its rungs claimed change */
  private draw(row: FeatRow, player: Player) {
    const feat = FEATS[row.id];
    const count = feat.count(player.stats);
    const claimed = rungsClaimed(player, row.id);
    const key = `${count}/${claimed}`;
    if (key === row.drawn) return;
    row.drawn = key;
    const reached = rungsReached(feat, player.stats);
    const next = feat.goals[reached];
    const from = reached > 0 ? feat.goals[reached - 1] : 0;
    show(
      row.goal,
      feat.planned
        ? t('Comes with the online game')
        : next === undefined
          ? t('Every rung reached')
          : t(feat.text, { n: whole(next) }),
    );
    show(row.count, next === undefined ? whole(count) : `${whole(count)} / ${whole(next)}`);
    const share = next === undefined ? 1 : (count - from) / (next - from);
    drawMeter(row.meter.clear(), ROW.meterWidth, 14, share, next === undefined ? UI.good : THEME.brass);
    row.rungs.clear();
    row.halo.clear();
    RUNG_POINTS.forEach((_, k) => {
      const x = k * ROW.rungGap;
      const diamond = [x, -RUNG - 6, x + RUNG, -6, x, RUNG - 6, x - RUNG, -6];
      if (k < claimed) {
        row.rungs.poly(diamond).fill({ color: THEME.title }).stroke({ width: 1.5, color: THEME.brassLight });
      } else if (k < reached) {
        // Reached, its reward waiting: hollow and bright, in a breathing light
        row.halo.circle(x, -6, RUNG_HALO).fill({ color: THEME.title, alpha: 0.35 });
        row.rungs.poly(diamond).fill({ color: NIGHT.well }).stroke({ width: 2.5, color: THEME.title });
      } else {
        row.rungs.poly(diamond).fill({ color: NIGHT.well }).stroke({ width: 1.5, color: THEME.brassDark });
      }
    });
    if (row.rewardRung !== claimed) this.layReward(row, claimed);
    const waits = claimed < reached;
    row.claim.container.visible = waits;
    const earned = RUNG_POINTS.slice(0, claimed).reduce((sum, n) => sum + n, 0);
    show(row.earned, t('+{n} point|+{n} points', { n: earned }));
    tint(row.earned, earned > 0 ? THEME.title : NIGHT.dim);
    row.earned.visible = !waits;
  }

  /**
   * The reward of a ladder's rung in its row, from its left: its doubloons by the coin, then each item in a slot
   * glowing in its grade's colour (its icon once loaded) with how many after it. None once every rung's is claimed
   */
  private layReward(row: FeatRow, rung: number) {
    for (const child of row.reward.removeChildren()) child.destroy({ children: true });
    row.slots = [];
    row.rewardRung = rung;
    const feat = FEATS[row.id];
    row.reward.visible = rung < feat.goals.length;
    if (!row.reward.visible) return;
    const { slots, end } = layPrizes(row.reward, rungReward(feat, rung).prizes, 0, ROW.height / 2, PRIZE);
    row.slots = slots;
    row.reward.hitArea = new Rectangle(0, 0, end, ROW.height);
  }

  /** The tooltip over a row's reward: which rung's, all it gives and where it goes */
  private rewardHint(row: FeatRow, player: Player): TooltipText | null {
    const feat = FEATS[row.id];
    const rung = rungsClaimed(player, row.id);
    const goal = feat.goals[rung];
    if (goal === undefined) return null;
    const { points, prizes } = rungReward(feat, rung);
    const waits = rung < rungsReached(feat, player.stats);
    return {
      title: waits ? t('{rung}: its reward waits', { rung: featRung(feat, rung) }) : featRung(feat, rung),
      lines: [
        t(feat.text, { n: whole(goal) }),
        `   ${t("+{n} captain's point|+{n} captain's points", { n: points })}`,
        ...prizes.map((prize) => `   ${prizeLine(prize)}`),
        t('Doubloons go into the purse, items into the hold'),
      ],
    };
  }

  /** Claims a ladder's next rung's reward, then shows what it gave */
  private claim(id: FeatId) {
    const player = this.player;
    if (!player) return;
    const rung = rungsClaimed(player, id);
    if (this.actions.claimFeat(id)) this.onClaimed(id, rung);
  }

  /**
   * A ladder's row at `top`: its name, its next goal, a meter of how far along, its rungs, the next rung's reward, and
   * Claim or the points the ladder gave
   */
  private row(id: FeatId, top: number) {
    const feat = FEATS[id];
    const width = WIDTH - PAD * 2;
    const row = new Container();
    row.position.set(PAD, top);
    const name = new Text({ text: t(feat.name), style: { ...TITLE_STYLE, fontSize: 16 } });
    name.position.set(14, 6);
    const goal = text('', 12, THEME.text);
    goal.position.set(14, 28);
    const meter = new Graphics();
    meter.position.set(ROW.meter, 12);
    const count = text('', 11, NIGHT.dim, { fontWeight: 'bold' });
    count.anchor.set(0.5, 0);
    count.position.set(ROW.meter + ROW.meterWidth / 2, 30);
    const halo = new Graphics();
    const rungs = new Graphics();
    for (const g of [halo, rungs]) g.position.set(ROW.rungs, ROW.height / 2);
    const reward = new Container();
    reward.x = ROW.reward;
    const earned = text('', 15, THEME.title, { fontWeight: 'bold' });
    earned.anchor.set(1, 0.5);
    earned.position.set(width - 16, ROW.height / 2);
    const claim = moonButton(CLAIM.width, CLAIM.height, t('Claim'), () => this.claim(id), 14, true).tile;
    claim.container.position.set(width - 12 - CLAIM.width, (ROW.height - CLAIM.height) / 2);
    claim.container.visible = false;
    row.addChild(drawNightCard(new Graphics(), width, ROW.height), name, goal, meter, count, halo, rungs, reward);
    RUNG_POINTS.forEach((n, k) => {
      const label = text(`+${n}`, 10, NIGHT.dim, { fontWeight: 'bold' });
      label.anchor.set(0.5, 0);
      label.position.set(ROW.rungs + k * ROW.rungGap, ROW.height / 2 + RUNG + 2);
      row.addChild(label);
    });
    row.addChild(earned, claim.container);
    if (feat.planned) row.alpha = 0.55;
    const view: FeatRow = {
      id,
      top,
      goal,
      count,
      meter,
      rungs,
      halo,
      reward,
      slots: [],
      rewardRung: -1,
      earned,
      claim,
      drawn: '',
    };
    reward.eventMode = 'static';
    reward.on('pointerover', () => (this.hovered = view));
    reward.on('pointerout', () => {
      if (this.hovered === view) this.hovered = null;
    });
    this.rows.push(view);
    return row;
  }
}
