import { Container, Graphics, Text, type Rectangle } from 'pixi.js';
import { FEATS, FEAT_IDS, RUNG_POINTS, captainPoints, rungsReached, type FeatId, type GameState } from '../../game';
import { NIGHT, NIGHT_HEADER, NIGHT_WINDOW, drawNightCard, nightHeader } from './nightTheme';
import { THEME, TITLE_STYLE, drawMeter } from './theme';
import { HudWindow, UI, show, text, tint, whole } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1040; // pixels, before scaling down to fit the screen
const PAD = 24;
const DIVIDER = PAD + NIGHT_HEADER.rule; // the gold line under the header
// Pixels in from the padding: the star before the title, and the title, nearer the window's corner than most
const HEADER_FIT = { pieceX: 20, titleX: 50 } as const;
const TOP = DIVIDER + 30; // pixels: the first row's top, clear of the divider's star
/** A feat's row: its height and the gap under it; where its meter, its count and its rungs are, pixels from its left */
const ROW = { height: 50, gap: 6, meter: 330, meterWidth: 260, rungs: 640, rungGap: 44 } as const;
const RUNG = 8; // pixels: a rung's diamond's half-width
const BOTTOM = PAD + 14; // pixels under the last row, clear of the window's bottom corner pieces
const HEIGHT = TOP + FEAT_IDS.length * (ROW.height + ROW.gap) - ROW.gap + BOTTOM;

/** A feat's row */
interface FeatRow {
  readonly id: FeatId;
  readonly goal: Text;
  readonly count: Text;
  readonly meter: Graphics;
  readonly rungs: Graphics;
  readonly earned: Text;
  /** The count it was drawn for */
  drawn: number;
}

/**
 * The captain's feats (the cup on the minimap's frame), in the night look: a row a ladder,
 * its next goal, how far along it is, its rungs with the points each gives and the captain's points they gave, and
 * those points together in the header. Closed by its gold cross, Escape or a click beside it
 */
export class FeatsPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly earned = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 18 } });
  private readonly rows: FeatRow[] = [];

  constructor(screen: Rectangle) {
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), NIGHT_WINDOW);
    this.container = this.window.container;
    const header = nightHeader(WIDTH, PAD, t('Feats'), HEADER_FIT);
    this.earned.position.set(header.title.x + header.title.width + 22, PAD + 4);
    this.window.panel.addChild(header.container, this.earned);
    FEAT_IDS.forEach((id, i) => this.window.panel.addChild(this.row(id, TOP + i * (ROW.height + ROW.gap))));
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    this.container.visible = !this.container.visible;
  }

  hide() {
    this.container.visible = false;
  }

  update(state: GameState) {
    if (!this.isOpen) return;
    this.window.fit();
    const points = captainPoints(state, state.player).feats;
    show(this.earned, t('+{n} point|+{n} points', { n: points }));
    tint(this.earned, points > 0 ? THEME.title : NIGHT.dim);
    const { stats } = state.player;
    for (const row of this.rows) {
      const feat = FEATS[row.id];
      const count = feat.count(stats);
      if (count === row.drawn) continue;
      row.drawn = count;
      const reached = rungsReached(feat, stats);
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
      RUNG_POINTS.forEach((_, k) => {
        const x = k * ROW.rungGap;
        row.rungs
          .poly([x, -RUNG - 6, x + RUNG, -6, x, RUNG - 6, x - RUNG, -6])
          .fill({ color: k < reached ? THEME.title : NIGHT.well })
          .stroke({ width: 1.5, color: k < reached ? THEME.brassLight : THEME.brassDark });
      });
      const earned = RUNG_POINTS.slice(0, reached).reduce((sum, n) => sum + n, 0);
      show(row.earned, t('+{n} point|+{n} points', { n: earned }));
      tint(row.earned, earned > 0 ? THEME.title : NIGHT.dim);
    }
  }

  /** A ladder's row at `top`: its name, its next goal, a meter of how far along, its rungs and the points they gave */
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
    const rungs = new Graphics();
    rungs.position.set(ROW.rungs, ROW.height / 2);
    const earned = text('', 15, THEME.title, { fontWeight: 'bold' });
    earned.anchor.set(1, 0.5);
    earned.position.set(width - 16, ROW.height / 2);
    row.addChild(drawNightCard(new Graphics(), width, ROW.height), name, goal, meter, count, rungs, earned);
    RUNG_POINTS.forEach((n, k) => {
      const label = text(`+${n}`, 10, NIGHT.dim, { fontWeight: 'bold' });
      label.anchor.set(0.5, 0);
      label.position.set(ROW.rungs + k * ROW.rungGap, ROW.height / 2 + RUNG + 2);
      row.addChild(label);
    });
    if (feat.planned) row.alpha = 0.55;
    this.rows.push({ id, goal, count, meter, rungs, earned, drawn: -1 });
    return row;
  }
}
