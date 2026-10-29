import { Container, Graphics, Sprite, Text, type Rectangle } from 'pixi.js';
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
import { MINIMAP_BUTTONS, SHIP_ICONS, type MinimapButtonId } from './iconAtlas';
import {
  NIGHT,
  NIGHT_HEADER,
  NIGHT_TAB,
  NIGHT_WINDOW,
  emblemMiddle,
  nightBoard,
  nightDivider,
  nightEmblem,
  nightHeader,
  type NightBoardLayout,
} from './nightTheme';
import { THEME, iconSlot } from './theme';
import { HudWindow, Tile, UI, drawSail, goldCoin, show, text, tierColor, tint, whole } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1000; // pixels, before scaling down to fit the screen
const PAD = 24;
const DIVIDER = PAD + NIGHT_HEADER.rule; // the gold line under the header
const HEADER_MIDDLE = PAD + NIGHT_HEADER.middle; // pixels: the header's middle, down the window
const NOTE_GAP = 20; // pixels between the title and the line beside it
const CLOSE_ROOM = 70; // pixels the line beside the title keeps clear of the window's right edge: its gold cross
const TOP = DIVIDER + 18; // pixels: the tabs' and the boards' top
const BOTTOM = PAD + 14; // pixels under the taller column, clear of the window's bottom corner pieces
const TAB = { width: 230, height: 58, gap: 10, icon: 44 } as const; // pixels: a ship's tab, and its picture's slot
const COLUMNS_X = PAD + TAB.width + 18;
const COLUMN_GAP = 14;
const COLUMN_WIDTH = (WIDTH - COLUMNS_X - PAD - COLUMN_GAP) / 2;
// A section's board, pixels: inside it, its corner pieces (high), its emblem's radius, its heading
const BOARD: NightBoardLayout = { pad: 18, corner: 24, emblem: 16, heading: { y: 12, size: 17 } };
const BOARD_GAP = 14; // pixels between two boards
const BOARD_STAR = 120; // pixels: the painted star of the divider under a board's heading, across
// Pixels down a board: the divider under its heading, its first line, and the room under its last
const LINES = { divider: 48, top: 58, bottom: 18 } as const;
const ROW = 22; // pixels a line
const INDENT = 14; // pixels a part of the line above is set in
const SHADE = 0.04; // how light every other line is
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

/** A section's board: its lines, the first its heading; its emblem a painted button of the minimap's, or the gold coin */
interface Section {
  readonly lines: readonly Line[];
  readonly emblem: MinimapButtonId | 'gold';
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
  return line.color === NIGHT.dim || line.part ? NIGHT.dim : THEME.text;
}

/**
 * The statistics (I, or a click on the player's frame), in the night look like the hold: what the player has done,
 * all their ships together, and each ship's own: the ship sailed and the ones laid up in port, a tab each with its
 * picture, lit while its page shows. Ships and monsters sunk by kind, the fight, the gold and the voyage, each on a
 * board of blue glass under a painted emblem. Counted by the game (records/stats.ts) for the medals to come. Closed by
 * its gold cross, Escape, I or a click beside it
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
  /** How tall the tabs are, and the columns: not their bounds, which take in a lit tab's moonlight round it */
  private tabsHeight = 0;
  private columnsHeight = 0;
  /** The sections' texts in the order of their lines: a heading's and its total, or a line's label and value */
  private cells: { readonly label: Text; readonly value: Text; readonly heading: boolean }[] = [];
  /** How many lines each section had when the cells were made: they are made again only when that changes */
  private cellsFor = '';
  /** As tall as the tabs or the columns, whichever is taller; it only grows, so a tab picked doesn't jolt it */
  private height = TOP + BOTTOM;

  constructor(screen: Rectangle) {
    this.window = new HudWindow(
      screen,
      { width: WIDTH, height: this.height, pad: PAD },
      () => this.hide(),
      NIGHT_WINDOW,
    );
    this.container = this.window.container;

    // The header: a star, the title, a line about the window beside it, and Close
    const header = nightHeader(WIDTH, PAD, t('Statistics'));
    const noteLeft = header.title.x + header.title.width + NOTE_GAP;
    const note = text(t('What you have done at sea: all your ships together, or each one'), 13, NIGHT.dim, {
      wordWrap: true,
      wordWrapWidth: WIDTH - noteLeft - CLOSE_ROOM,
      lineHeight: 16,
    });
    note.anchor.set(0, 0.5);
    note.position.set(noteLeft, HEADER_MIDDLE + 2);

    this.tabs.position.set(PAD, TOP);
    this.columns.position.set(COLUMNS_X, TOP);
    this.window.panel.addChild(header.container, note, this.tabs, this.columns);
    // The tabs and the boards again with their pictures, once they are there
    SHIP_ICONS.load(() => (this.tabsFor = ''));
    MINIMAP_BUTTONS.load(() => (this.cellsFor = ''));
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
      const needed = TOP + Math.max(this.tabsHeight, this.columnsHeight) + BOTTOM;
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
    this.tabsHeight = entries.length * (TAB.height + TAB.gap) - TAB.gap;
  }

  /** A tab: the ship's picture in a slot lit in its tier's colour, its name and level; lit, its name gold, while picked */
  private tab(entry: Entry, index: number) {
    const picked = index === this.picked;
    const tile = new Tile(
      TAB.width,
      TAB.height,
      () => {
        this.picked = index;
        this.sinceRefresh = Infinity;
      },
      0,
      NIGHT_TAB,
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
    slot.container.position.set(8, (TAB.height - TAB.icon) / 2);
    const x = 8 + TAB.icon + 12;
    const name = text(entry.name, 14, picked ? THEME.title : THEME.text, { fontWeight: 'bold' });
    name.position.set(x, 11);
    const note = text(entry.note, 11, picked ? THEME.text : NIGHT.dim);
    note.position.set(x, 32);
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
        color: n === 0 ? NIGHT.dim : BOSSES.has(shipClass.id) ? THEME.title : THEME.text,
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
    const left: Section[] = [
      { lines: kills, emblem: 'bestiary' },
      { lines: fight, emblem: 'loadout' },
    ];
    const right: Section[] = [
      { lines: gold, emblem: 'gold' },
      { lines: voyage, emblem: 'world' },
    ];
    const sections = [...left, ...right];
    const shape = sections.map((section) => section.lines.length).join();
    if (shape !== this.cellsFor) {
      this.cellsFor = shape;
      for (const child of this.columns.removeChildren()) child.destroy({ children: true });
      this.cells = [];
      this.columnsHeight = Math.max(this.column(left, 0), this.column(right, COLUMN_WIDTH + COLUMN_GAP));
    }
    sections
      .flatMap((section) => section.lines)
      .forEach((line, i) => {
        const { label, value, heading } = this.cells[i];
        show(label, line.label);
        show(value, line.value ?? '');
        if (heading) return;
        tint(label, labelColor(line));
        tint(value, line.color ?? THEME.text);
      });
  }

  /**
   * Boards one under another at `x`, each of blue glass under its emblem: a gold heading and its total, a divider, then
   * its lines, every other one lit a little. How tall they are together
   */
  private column(sections: readonly Section[], x: number) {
    let y = 0;
    for (const { lines: all, emblem } of sections) {
      const [heading, ...lines] = all;
      const height = LINES.top + lines.length * ROW + LINES.bottom;
      const {
        container: board,
        card: glass,
        title,
      } = nightBoard(COLUMN_WIDTH, height, BOARD, boardEmblem(emblem), heading.label);
      board.position.set(x, y);
      const shaded = COLUMN_WIDTH - (BOARD.pad - 6) * 2;
      lines.forEach((_, i) => {
        if (i % 2 === 0) return;
        glass.roundRect(BOARD.pad - 6, LINES.top + i * ROW, shaded, ROW, 3).fill({ color: 0xffffff, alpha: SHADE });
      });
      // Its total, if it has one, in plain figures: the serif's old-style 0 reads as an o
      const total = text(heading.value ?? '', 15, THEME.title, { fontWeight: 'bold' });
      total.anchor.set(1, 0.5);
      total.position.set(COLUMN_WIDTH - BOARD.pad, emblemMiddle(BOARD));
      const divider = nightDivider(COLUMN_WIDTH - BOARD.pad * 2, BOARD_STAR);
      divider.position.set(BOARD.pad, LINES.divider);
      board.addChild(total, divider);
      this.cells.push({ label: title, value: total, heading: true });
      lines.forEach((line, i) => {
        const middle = LINES.top + i * ROW + ROW / 2;
        const label = text(line.label, 13, labelColor(line));
        label.anchor.set(0, 0.5);
        label.position.set(BOARD.pad + (line.part ? INDENT : 0), middle);
        const value = text(line.value ?? '', 13, line.color ?? THEME.text, { fontWeight: 'bold' });
        value.anchor.set(1, 0.5);
        value.position.set(COLUMN_WIDTH - BOARD.pad, middle);
        board.addChild(label, value);
        this.cells.push({ label, value, heading: false });
      });
      this.columns.addChild(board);
      y += height + BOARD_GAP;
    }
    return y - BOARD_GAP;
  }
}

/**
 * A board's emblem round (0, 0) in a dark well under a brass ring: a minimap button's painting (empty till it loads),
 * or the gold coin
 */
function boardEmblem(id: Section['emblem']) {
  if (id === 'gold') return nightEmblem(BOARD.emblem, goldCoin(BOARD.emblem - 4));
  const painted = MINIMAP_BUTTONS.get(id);
  if (!painted) return nightEmblem(BOARD.emblem);
  const sprite = new Sprite(painted);
  sprite.anchor.set(0.5);
  sprite.setSize(BOARD.emblem * 2 - 2);
  return nightEmblem(BOARD.emblem, sprite);
}
