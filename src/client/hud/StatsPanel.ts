import { Container, Graphics, Text, type Rectangle } from 'pixi.js';
import {
  BOT_KINDS,
  GOLD_REASONS,
  SHIP_CLASSES,
  WEAPON_IDS,
  isLineShip,
  laidUpLevel,
  totalGold,
  totalKills,
  type GoldReason,
  type GameState,
  type ShipClassId,
  type Stats,
  type WeaponId,
} from '../../game';
import { SHIP_ICONS } from './iconAtlas';
import { BRASS, THEME, THEMED_WINDOW, TITLE_STYLE, drawCard, drawDivider, iconSlot, subheading } from './theme';
import { HudWindow, Tile, UI, drawSail, show, text, tierColor, tint, whole } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 980; // pixels, before scaling down to fit the screen
const PAD = 24;
const DIVIDER = PAD + 50; // the gold line under the title
const TOP = DIVIDER + 16; // where the tabs and the columns start
const TAB = { width: 230, height: 56, gap: 8, icon: 42 } as const; // pixels: a ship's tab, and its picture's slot
const COLUMNS_X = PAD + TAB.width + 20;
const COLUMN_GAP = 16;
const COLUMN_WIDTH = (WIDTH - COLUMNS_X - PAD - COLUMN_GAP) / 2;
const SECTION = { pad: 12, heading: 30, gap: 12 } as const; // pixels: inside a section's board, its heading, between two
const ROW = 22; // pixels a line
const INDENT = 14; // pixels a part of the line above is set in
const REFRESH = 0.5; // seconds between two refreshes while open: the numbers grow as the game goes on
const ALL_SHIPS = 0xc99a45; // the glow of the "all ships" tab's slot: brass

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
  arsenal: 'at the arsenal',
};

/** A line of a section: a label and its value, or a section's heading and its total if any; `part` of the line above */
interface Line {
  readonly label: string;
  readonly value?: string;
  readonly color?: number;
  readonly part?: boolean;
}

/** A tab: all the player's ships together, or one of them */
interface Entry {
  readonly name: string;
  readonly note: string;
  /** Its class, for its picture; none for all ships */
  readonly shipClass: ShipClassId | null;
  /** On its slot's chip: the ship's level, or how many ships */
  readonly chip: string;
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
  return line.color === THEME.dim || line.part ? THEME.dim : THEME.text;
}

/**
 * The statistics (I, or a click on the player's frame), in the windows' theme: what the player has done, all their
 * ships together, and each ship's own: the ship sailed and the ones laid up in port, a tab each with its picture. Ships
 * and monsters sunk by kind, the fight, the gold and the voyage, each on a board of its own. Counted by the game
 * (records/stats.ts) for the medals to come. Closed by Close, Escape, I or a click beside it
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
  /** The sections' texts in the order of their lines: a heading's and its total, or a line's label and value */
  private cells: { readonly label: Text; readonly value: Text; readonly heading: boolean }[] = [];
  /** How many lines each section had when the cells were made: they are made again only when that changes */
  private cellsFor = '';
  /** As tall as the tabs or the columns, whichever is taller; it only grows, so a tab picked doesn't jolt it */
  private height = TOP + PAD;

  constructor(screen: Rectangle) {
    this.window = new HudWindow(
      screen,
      { width: WIDTH, height: this.height, pad: PAD },
      () => this.hide(),
      THEMED_WINDOW,
    );
    this.container = this.window.container;
    const title = new Text({ text: t('Statistics'), style: { ...TITLE_STYLE, fontSize: 28 } });
    title.position.set(PAD, PAD - 6);
    const note = text(t('What you have done at sea: all your ships together, or each one'), 13, THEME.dim);
    note.position.set(PAD, PAD + 30);
    this.tabs.position.set(PAD, TOP);
    this.columns.position.set(COLUMNS_X, TOP);
    this.window.panel.addChild(
      title,
      note,
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      this.tabs,
      this.columns,
    );
    // The tabs again with the ships' pictures, once they are there
    SHIP_ICONS.load(() => (this.tabsFor = ''));
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
    this.sinceRefresh += dt;
    if (this.sinceRefresh >= REFRESH) {
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
      const needed = TOP + Math.max(this.tabs.height, this.columns.height) + PAD;
      if (needed > this.height) {
        this.height = needed;
        this.window.resize(needed);
      }
    }
    this.window.fit();
  }

  /** All ships, the ship sailed, then the ones laid up in port: rebuilt when the fleet changes */
  private buildTabs(state: GameState) {
    const { ship, player } = state;
    const entries: Entry[] = [
      {
        name: t('All ships'),
        note: t('{n} ship|{n} ships', { n: player.fleet.length + 1 }),
        shipClass: null,
        chip: `${player.fleet.length + 1}`,
      },
      {
        name: t(ship.shipClass.name),
        note: t('Lv {level} · at the helm', { level: ship.level }),
        shipClass: ship.shipClass.id,
        chip: `${ship.level}`,
      },
      ...player.fleet.map((laidUp) => ({
        name: t(SHIP_CLASSES[laidUp.shipClass].name),
        note: t('Lv {level} · in port', { level: laidUpLevel(laidUp) }),
        shipClass: laidUp.shipClass,
        chip: `${laidUpLevel(laidUp)}`,
      })),
    ];
    const key = `${this.picked}|${entries.map((e) => `${e.name}:${e.note}`).join('|')}`;
    if (key === this.tabsFor) return;
    this.tabsFor = key;
    for (const child of this.tabs.removeChildren()) child.destroy({ children: true });
    entries.forEach((entry, i) => {
      const tab = this.tab(entry, i - 1);
      tab.position.set(0, i * (TAB.height + TAB.gap));
      this.tabs.addChild(tab);
    });
  }

  /** A tab: the ship's picture in a slot lit in its tier's colour, its name and level; gold while picked */
  private tab(entry: Entry, index: number) {
    const picked = index === this.picked;
    const tile = new Tile(
      TAB.width,
      TAB.height,
      () => {
        this.picked = index;
        this.sinceRefresh = Infinity;
      },
      6,
      BRASS,
    );
    tile.setLook({ pressed: picked });
    const shipClass = entry.shipClass ? SHIP_CLASSES[entry.shipClass] : null;
    const slot = iconSlot(TAB.icon, shipClass ? tierColor(shipClass.tier) : ALL_SHIPS, entry.chip, false);
    if (shipClass && isLineShip(shipClass.id)) slot.show(SHIP_ICONS.get(shipClass.id));
    if (!shipClass) {
      const sail = new Graphics();
      drawSail(sail, TAB.icon * 0.6, THEME.brassLight);
      sail.position.set(TAB.icon / 2, TAB.icon / 2);
      slot.container.addChildAt(sail, 1);
    }
    slot.container.position.set(7, (TAB.height - TAB.icon) / 2);
    const x = 7 + TAB.icon + 12;
    const name = text(entry.name, 14, picked ? THEME.darkText : THEME.text, { fontWeight: 'bold' });
    name.position.set(x, 10);
    const note = text(entry.note, 11, picked ? THEME.darkText : THEME.dim);
    note.position.set(x, 30);
    tile.content.addChild(slot.container, name, note);
    return tile.container;
  }

  /**
   * The kills and the fight on the left, the gold and the voyage on the right. A new Text renders a new texture, so
   * the texts are made once for the lines and only their words and colors change
   */
  private showColumns(stats: Stats, all: boolean) {
    const kills: Line[] = [{ label: t('Sunk'), value: whole(totalKills(stats)) }];
    for (const shipClass of QUARRY) {
      const n = stats.kills[shipClass.id] ?? 0;
      kills.push({
        label: t(shipClass.name),
        value: whole(n),
        part: true,
        color: n === 0 ? THEME.dim : BOSSES.has(shipClass.id) ? THEME.title : THEME.text,
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
      { label: t('Times sunk'), value: whole(stats.sunk), color: stats.sunk > 0 ? UI.bad : THEME.text },
    ];
    const gold: Line[] = [
      { label: t('Gold earned'), value: whole(totalGold(stats)) },
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
      for (const child of this.columns.removeChildren()) child.destroy({ children: true });
      this.cells = [];
      this.column([kills, fight], 0);
      this.column([gold, voyage], COLUMN_WIDTH + COLUMN_GAP);
    }
    [kills, fight, gold, voyage].flat().forEach((line, i) => {
      const { label, value, heading } = this.cells[i];
      show(label, line.label);
      show(value, line.value ?? '');
      if (heading) return;
      tint(label, labelColor(line));
      tint(value, line.color ?? THEME.text);
    });
  }

  /** Sections one under another, each on its board: a gold heading, then its lines, every other one shaded */
  private column(sections: readonly (readonly Line[])[], x: number) {
    let y = 0;
    for (const [heading, ...lines] of sections) {
      const height = SECTION.pad * 2 + SECTION.heading + lines.length * ROW;
      const board = drawCard(new Graphics(), COLUMN_WIDTH, height);
      board.position.set(x, y);
      lines.forEach((_, i) => {
        if (i % 2 === 0) return;
        board
          .rect(SECTION.pad - 4, SECTION.pad + SECTION.heading + i * ROW, COLUMN_WIDTH - (SECTION.pad - 4) * 2, ROW)
          .fill({ color: 0xffffff, alpha: 0.035 });
      });
      const title = subheading(heading.label, 16);
      title.position.set(x + SECTION.pad, y + SECTION.pad - 2);
      // Its total, if it has one, in plain figures: the serif's old-style 0 reads as an o
      const total = text(heading.value ?? '', 15, THEME.title, { fontWeight: 'bold' });
      total.anchor.set(1, 0.5);
      total.position.set(x + COLUMN_WIDTH - SECTION.pad, title.y + title.height / 2);
      board
        .rect(SECTION.pad, SECTION.pad + SECTION.heading - 5, COLUMN_WIDTH - SECTION.pad * 2, 1)
        .fill({ color: THEME.brass, alpha: 0.35 });
      this.columns.addChild(board, title, total);
      this.cells.push({ label: title, value: total, heading: true });
      let row = y + SECTION.pad + SECTION.heading;
      for (const line of lines) {
        const label = text(line.label, 13, labelColor(line));
        label.anchor.set(0, 0.5);
        label.position.set(x + SECTION.pad + (line.part ? INDENT : 0), row + ROW / 2);
        const value = text(line.value ?? '', 13, line.color ?? THEME.text, { fontWeight: 'bold' });
        value.anchor.set(1, 0.5);
        value.position.set(x + COLUMN_WIDTH - SECTION.pad, row + ROW / 2);
        this.columns.addChild(label, value);
        this.cells.push({ label, value, heading: false });
        row += ROW;
      }
      y += height + SECTION.gap;
    }
  }
}
