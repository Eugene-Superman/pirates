import { Container, type Rectangle, type Text } from 'pixi.js';
import {
  BOT_KINDS,
  GOLD_REASONS,
  SHIP_CLASSES,
  WEAPON_IDS,
  laidUpLevel,
  totalGold,
  totalKills,
  type GoldReason,
  type GameState,
  type Stats,
  type WeaponId,
} from '../../game';
import { HudWindow, Tile, UI, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 940; // pixels, before scaling down to fit the screen
const HEIGHT = 580;
const PAD = 18;
const TOP = 70; // where the tabs and the columns start
const TAB = { width: 210, height: 40, gap: 6 } as const;
const COLUMNS_X = PAD + TAB.width + 24;
const COLUMN_GAP = 26;
const COLUMN_WIDTH = (WIDTH - COLUMNS_X - PAD - COLUMN_GAP) / 2;
const ROW = 21; // pixels a line
const SECTION_GAP = 14;
const INDENT = 14; // pixels a part of the line above is set in
const REFRESH = 0.5; // seconds between two refreshes while open: the numbers grow as the game goes on

// The classes a player can sink: the bots' ships and the sea monsters; a boss's are listed in gold
const QUARRY = Object.values(SHIP_CLASSES).filter((c) => c.line === 'bots' || c.line === 'monsters');
const BOSSES = new Set(Object.values(BOT_KINDS).flatMap((kind) => (kind.boss ? [kind.shipClass] : [])));

const WEAPON_LABELS: Readonly<Record<WeaponId, string>> = {
  cannon: 'Volleys of the cannons',
  harpoon: 'Volleys of the harpoons',
};
const GOLD_LABELS: Readonly<Record<GoldReason, string>> = {
  bounty: 'for kills',
  chest: 'from chests',
  quest: 'for quests',
  market: 'at the market',
};

/** A line of a column: a label and its value, or a section's heading (no value); `part` of the line above it */
interface Line {
  readonly label: string;
  readonly value?: string;
  readonly color?: number;
  readonly part?: boolean;
}

/** "1 h 23 min", "4 min", "35 s" */
function duration(seconds: number) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return t('{h} h {m} min', { h, m });
  if (m > 0) return t('{m} min', { m });
  return t('{s} s', { s });
}

/** A world unit is about a metre */
function distance(units: number) {
  return t('{km} km', { km: (units / 1000).toFixed(1) });
}

/** A part of the line above, or a count still at nothing, is dim */
function labelColor(line: Line) {
  return line.color === UI.dim || line.part ? UI.dim : UI.text;
}

function whole(n: number) {
  return Math.round(n).toLocaleString('en-US').replaceAll(',', ' ');
}

/**
 * The statistics (I, or a click on the player's frame): what the player has done, all their ships together, and each
 * ship's own: the ship sailed and the ones laid up in port. Ships and monsters sunk by kind, the fight, the gold and
 * the voyage. Counted by the game (records/stats.ts) for the medals to come. Closed by Close, Escape, I or a click
 * beside it
 */
export class StatsPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly tabs = new Container();
  private readonly columns = new Container();
  /** The tab picked: -1 all ships, 0 the ship sailed, 1… the ships laid up */
  private picked = -1;
  private sinceRefresh = Infinity;
  /** What the tabs were built for, so they are rebuilt only when the fleet changes */
  private tabsFor = '';
  /** The columns' texts in the order of their lines: a heading's (no value) or a line's label and value */
  private cells: { readonly label: Text; readonly value: Text | null }[] = [];
  /** How many lines each section had when the cells were made: they are made again only when that changes */
  private cellsFor = '';

  constructor(screen: Rectangle) {
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide());
    this.container = this.window.container;
    const title = text(t('Statistics'), 20, UI.active, { fontWeight: 'bold' });
    title.position.set(PAD, PAD);
    const note = text(t('What you have done at sea: all your ships together, or each one'), 12, UI.dim);
    note.position.set(PAD, PAD + 30);
    this.tabs.position.set(PAD, TOP);
    this.columns.position.set(COLUMNS_X, TOP);
    this.window.panel.addChild(title, note, this.tabs, this.columns);
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    this.container.visible = !this.container.visible;
    this.sinceRefresh = Infinity;
  }

  hide() {
    this.container.visible = false;
  }

  /** dt: seconds since the last frame */
  update(state: GameState, dt: number) {
    if (!this.isOpen) return;
    this.window.fit();
    this.sinceRefresh += dt;
    if (this.sinceRefresh < REFRESH) return;
    this.sinceRefresh = 0;
    this.buildTabs(state);
    this.picked = Math.min(this.picked, state.player.fleet.length);
    const stats =
      this.picked < 0
        ? state.player.stats
        : this.picked === 0
          ? state.ship.stats
          : state.player.fleet[this.picked - 1].stats;
    this.showColumns(stats, this.picked < 0);
  }

  /** All ships, the ship sailed, then the ones laid up in port: rebuilt when the fleet changes */
  private buildTabs(state: GameState) {
    const { ship, player } = state;
    const entries = [
      { name: t('All ships'), note: t('{n} ship|{n} ships', { n: player.fleet.length + 1 }) },
      { name: t(ship.shipClass.name), note: t('Lv {level} · at the helm', { level: ship.level }) },
      ...player.fleet.map((laidUp) => ({
        name: t(SHIP_CLASSES[laidUp.shipClass].name),
        note: t('Lv {level} · in port', { level: laidUpLevel(laidUp) }),
      })),
    ];
    const key = `${this.picked}|${entries.map((e) => `${e.name}:${e.note}`).join('|')}`;
    if (key === this.tabsFor) return;
    this.tabsFor = key;
    for (const child of this.tabs.removeChildren()) child.destroy({ children: true });
    entries.forEach((entry, i) => {
      const index = i - 1;
      const tile = new Tile(TAB.width, TAB.height, () => {
        this.picked = index;
        this.sinceRefresh = Infinity;
      });
      tile.setLook({ pressed: index === this.picked, border: index === this.picked ? UI.active : UI.border });
      const fill = index === this.picked ? UI.darkText : UI.text;
      const name = text(entry.name, 14, fill, { fontWeight: 'bold' });
      name.position.set(10, 4);
      const note = text(entry.note, 11, index === this.picked ? UI.darkText : UI.dim);
      note.position.set(10, 22);
      tile.content.addChild(name, note);
      tile.container.position.set(0, i * (TAB.height + TAB.gap));
      this.tabs.addChild(tile.container);
    });
  }

  /**
   * The kills and the fight on the left, the gold and the voyage on the right. A new Text renders a new texture, so
   * the texts are made once for the lines and only their words and colors change
   */
  private showColumns(stats: Stats, all: boolean) {
    const kills: Line[] = [{ label: t('Sunk: {n}', { n: whole(totalKills(stats)) }) }];
    for (const shipClass of QUARRY) {
      const n = stats.kills[shipClass.id] ?? 0;
      kills.push({
        label: t(shipClass.name),
        value: whole(n),
        part: true,
        color: n === 0 ? UI.dim : BOSSES.has(shipClass.id) ? UI.active : UI.text,
      });
    }
    const fight: Line[] = [
      { label: t('In battle') },
      ...WEAPON_IDS.map((weapon) => ({ label: t(WEAPON_LABELS[weapon]), value: whole(stats.volleys[weapon]) })),
      { label: t('Damage dealt'), value: whole(stats.damageDealt) },
      { label: t('Critical hits'), value: whole(stats.crits) },
      { label: t('Damage taken'), value: whole(stats.damageTaken) },
      { label: t('Bites taken'), value: whole(stats.bitesTaken) },
      { label: t('Abilities used'), value: whole(stats.abilities) },
      { label: t('Times sunk'), value: whole(stats.sunk), color: stats.sunk > 0 ? UI.bad : UI.text },
    ];
    const gold: Line[] = [
      { label: t('Gold earned: {n}', { n: whole(totalGold(stats)) }) },
      ...GOLD_REASONS.map((reason) => ({
        label: t(GOLD_LABELS[reason]),
        value: whole(stats.goldEarned[reason]),
        part: true,
      })),
      ...(all ? [{ label: t('Gold spent'), value: whole(stats.goldSpent) }] : []),
      { label: t('Quests turned in'), value: whole(stats.questsDone) },
      { label: t('Chests hauled aboard'), value: whole(stats.chests) },
      { label: t('Goods brought in'), value: whole(stats.goods) },
    ];
    const voyage: Line[] = [
      { label: t('Voyage') },
      { label: t('Distance sailed'), value: distance(stats.distance) },
      { label: t('Time at sea'), value: duration(stats.timeAtSea) },
      { label: t('Time in port'), value: duration(stats.timeInPort) },
      { label: t('Hull mended at sea'), value: whole(stats.repaired) },
    ];
    const shape = [kills, fight, gold, voyage].map((section) => section.length).join();
    if (shape !== this.cellsFor) {
      this.cellsFor = shape;
      for (const child of this.columns.removeChildren()) child.destroy();
      this.cells = [];
      this.column([kills, fight], 0);
      this.column([gold, voyage], COLUMN_WIDTH + COLUMN_GAP);
    }
    [kills, fight, gold, voyage].flat().forEach((line, i) => {
      const { label, value } = this.cells[i];
      show(label, line.label);
      if (!value) return;
      tint(label, labelColor(line));
      show(value, line.value ?? '');
      tint(value, line.color ?? UI.text);
    });
  }

  /** Sections one under another: a heading, then its lines, the values to the right */
  private column(sections: readonly (readonly Line[])[], x: number) {
    let y = 0;
    for (const [heading, ...lines] of sections) {
      const title = text(heading.label, 15, UI.active, { fontWeight: 'bold' });
      title.position.set(x, y);
      this.columns.addChild(title);
      this.cells.push({ label: title, value: null });
      y += ROW + 4;
      for (const line of lines) {
        const label = text(line.label, 13, labelColor(line));
        label.position.set(x + (line.part ? INDENT : 0), y);
        const value = text(line.value ?? '', 13, line.color ?? UI.text, { fontWeight: 'bold' });
        value.anchor.set(1, 0);
        value.position.set(x + COLUMN_WIDTH, y);
        this.columns.addChild(label, value);
        this.cells.push({ label, value });
        y += ROW;
      }
      y += SECTION_GAP;
    }
  }
}
