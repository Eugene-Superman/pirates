import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import type { GameState } from '../../game';
import type { Slot } from '../storage/Store';
import { CombatLog, LOG_FILTERS, inFilter, statsLines, type LogEntry, type LogFilter } from './combatLog';
import { Tile, UI, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const MARGIN = 16; // pixels from the screen's edges
const GAP = 30; // above the skill bar (and its status line), when the log would overlap it
const PAD = 10;
const LINE = 16; // pixels per line of text
const FONT = 12;
const INDENT = 16; // pixels the dice of an entry are set in
const HEADER = 26; // pixels: the title row
const CLOSED = { width: 470, lines: 5 };
const OPEN = { width: 640, height: 560 };
const STATS_LINES = 4;
const POOL = 60; // lines of text drawn at once at most
const WHEEL_LINES = 3; // lines one notch of the mouse wheel scrolls
const TONES = { crit: 0xffd34d, miss: 0xa9b4ba } as const;
const KIND_COLORS = {
  dealt: UI.text,
  taken: 0xff8a7a,
  kill: 0x7dff8a,
  death: 0xff5a4a,
  repair: 0x9dffb0,
  gold: 0xffcf3f,
  level: 0x9fd4ff,
  note: UI.dim,
} as const;
const FILTER_NAMES: Readonly<Record<LogFilter, string>> = {
  all: 'All',
  dealt: 'Dealt',
  taken: 'Taken',
  other: 'Kills, gold, levels',
};

/** A line of the list: its text, color and how far it is set in */
interface Line {
  readonly text: string;
  readonly color: number;
  readonly indent: number;
}

function entryColor(entry: LogEntry) {
  if (entry.tone === 'crit') return TONES.crit;
  if (entry.tone === 'miss') return TONES.miss;
  return KIND_COLORS[entry.kind];
}

/**
 * The combat log in the bottom left corner. Closed, it shows the last few entries; opened (J, or its button) it shows
 * the totals, tabs to pick what to list, and every entry with all its dice, scrolled with the mouse wheel or the
 * arrows. Only the lines in view are drawn, from a fixed pool of texts, so a long log costs nothing more
 */
export class CombatLogPanel {
  readonly container = new Container();
  readonly log = new CombatLog();
  private readonly background = new Graphics();
  private readonly title = text(t('Combat log'), 14, UI.active, { fontWeight: 'bold' });
  private readonly toggleButton: Tile;
  private readonly toggleText = text('', 12);
  private readonly tabs: { filter: LogFilter; tile: Tile; label: Text }[];
  private readonly scrollButtons: Tile[];
  private readonly stats: Text[];
  private readonly list = new Container();
  private readonly clip = new Graphics();
  private readonly pool: Text[] = [];
  private open = false;
  private filter: LogFilter = 'all';
  private lines: Line[] = [];
  /** What the lines were made from, to remake them only when it changes */
  private madeFor = '';
  /** Lines scrolled up from the newest: 0 shows the end of the log */
  private scroll = 0;
  private visible = 0;
  /** Size and state the panel was last laid out for */
  private laidOut = '';

  /** Where the log is kept between visits, with whether it was open and on which tab */
  private readonly kept: Slot;
  /** The log's version when it was last kept */
  private keptVersion = -1;

  constructor(kept: Slot) {
    this.kept = kept;
    const saved = kept.get();
    if (typeof saved === 'object' && saved !== null) {
      if ('log' in saved) this.log.restore(saved.log);
      if ('open' in saved && saved.open === true) this.open = true;
      const filter = 'filter' in saved ? LOG_FILTERS.find((f) => f === saved.filter) : undefined;
      if (filter) this.filter = filter;
    }
    this.toggleButton = new Tile(96, 20, () => this.toggle(), 4);
    this.toggleText.anchor.set(0.5);
    this.toggleText.position.set(48, 10);
    this.toggleButton.content.addChild(this.toggleText);
    this.title.position.set(PAD, 6);

    this.tabs = LOG_FILTERS.map((filter) => {
      const label = text(t(FILTER_NAMES[filter]), 11, UI.text, { fontWeight: 'bold' });
      const tile = new Tile(Math.ceil(label.width) + 16, 20, () => this.pick(filter), 4);
      label.anchor.set(0.5);
      label.position.set(tile.width / 2, 10);
      tile.content.addChild(label);
      return { filter, tile, label };
    });
    this.scrollButtons = [
      { label: '▲', lines: 10 },
      { label: '▼', lines: -10 },
      { label: '▼▼', lines: -Infinity },
    ].map(({ label, lines }) => {
      const tile = new Tile(label.length > 1 ? 30 : 24, 20, () => this.scrollBy(lines), 4);
      const arrow = text(label, 10);
      arrow.anchor.set(0.5);
      arrow.position.set(tile.width / 2, 10);
      tile.content.addChild(arrow);
      return tile;
    });
    this.stats = Array.from({ length: STATS_LINES }, () => text('', FONT, UI.dim));
    for (let i = 0; i < POOL; i++) {
      const line = text('', FONT, UI.text);
      line.visible = false;
      this.pool.push(line);
      this.list.addChild(line);
    }
    this.list.mask = this.clip;

    this.background.eventMode = 'static';
    // Clicks on the log must not reach the stage, which would steer the ship
    this.background.on('pointerdown', (e) => e.stopPropagation());
    this.container.eventMode = 'static';
    this.container.on('wheel', (e) => this.scrollBy(e.deltaY > 0 ? -WHEEL_LINES : WHEEL_LINES));
    this.container.addChild(
      this.background,
      this.title,
      this.toggleButton.container,
      ...this.tabs.map((tab) => tab.tile.container),
      ...this.scrollButtons.map((b) => b.container),
      ...this.stats,
      this.list,
      this.clip,
    );
  }

  get isOpen() {
    return this.open;
  }

  toggle() {
    this.open = !this.open;
    this.scroll = 0;
    this.keep(true);
  }

  /** Keeps the log for the next visit, if anything changed since it was last kept (or `always`) */
  keep(always = false) {
    if (!always && this.log.version === this.keptVersion) return;
    this.keptVersion = this.log.version;
    this.kept.set({ open: this.open, filter: this.filter, log: this.log.toData() });
  }

  /**
   * Records this update's events, then lays the log out in the bottom left corner: above the skill bar (`bar`, its
   * box on the screen) if it would overlap it, and opened no higher than `top` (what the HUD shows above it)
   */
  update(state: GameState, screenWidth: number, screenHeight: number, bar: Rectangle, top: number) {
    this.log.record(state);
    const width = Math.min(this.open ? OPEN.width : CLOSED.width, screenWidth - MARGIN * 2);
    const overlaps = MARGIN + width > bar.x && bar.width > 0;
    const bottom = overlaps ? bar.y - GAP : screenHeight - MARGIN;
    const listTop = this.open ? HEADER + PAD + STATS_LINES * LINE + PAD : HEADER + 2;
    const height = this.open
      ? Math.max(listTop + LINE * 4 + PAD, Math.min(OPEN.height, bottom - top))
      : listTop + CLOSED.lines * LINE + PAD;
    this.container.position.set(MARGIN, Math.round(bottom - height));
    const size = `${width}x${height}/${this.open}`;
    if (size !== this.laidOut) {
      this.laidOut = size;
      this.container.hitArea = new Rectangle(0, 0, width, height);
      this.layout(width, height, listTop);
    }

    const key = `${this.log.version}/${this.filter}/${this.open}`;
    if (key !== this.madeFor) {
      const before = this.lines.length;
      this.madeFor = key;
      this.lines = this.makeLines();
      // Scrolled back to read: new lines come in below without moving what is being read
      if (this.scroll > 0) this.scroll += Math.max(0, this.lines.length - before);
    }
    this.visible = Math.floor((height - listTop - PAD) / LINE);
    this.scroll = Math.min(this.scroll, Math.max(0, this.lines.length - this.visible));
    this.paint();
    if (this.open) {
      statsLines(this.log.stats).forEach((line, i) => show(this.stats[i], line));
      for (const { filter, tile, label } of this.tabs) {
        tile.setLook({ pressed: filter === this.filter });
        tint(label, filter === this.filter ? UI.darkText : UI.text);
      }
    }
  }

  private pick(filter: LogFilter) {
    this.filter = filter;
    this.scroll = 0;
    this.keep(true);
  }

  private scrollBy(lines: number) {
    this.scroll = Math.min(Math.max(0, this.scroll + lines), Math.max(0, this.lines.length - this.visible));
  }

  /** Closed: the last entries, one line each. Open: the entries of the tab, each with its dice under it */
  private makeLines(): Line[] {
    const { entries } = this.log;
    if (!this.open) {
      return entries.slice(-CLOSED.lines).map((e) => ({ text: e.summary, color: entryColor(e), indent: 0 }));
    }
    const lines: Line[] = [];
    for (const entry of entries) {
      if (!inFilter(entry, this.filter)) continue;
      lines.push({ text: entry.summary, color: entryColor(entry), indent: 0 });
      for (const detail of entry.details) lines.push({ text: detail, color: UI.dim, indent: INDENT });
    }
    return lines;
  }

  private layout(width: number, height: number, listTop: number) {
    this.background
      .clear()
      .roundRect(0, 0, width, height, 8)
      .fill({ color: UI.panel, alpha: this.open ? 0.94 : 0.72 })
      .stroke({ width: 1, color: UI.border, alpha: 0.3 });
    show(this.toggleText, this.open ? t('Close  (J)') : t('Open  (J)'));
    this.toggleButton.container.position.set(width - PAD - this.toggleButton.width, 4);
    let x = PAD + this.title.width + 12;
    for (const { tile } of this.tabs) {
      tile.container.visible = this.open;
      tile.container.position.set(x, 4);
      x += tile.width + 4;
    }
    let bx = width - PAD - this.toggleButton.width - 8;
    for (let i = this.scrollButtons.length - 1; i >= 0; i--) {
      const button = this.scrollButtons[i];
      bx -= button.width + 4;
      button.container.visible = this.open;
      button.container.position.set(bx, 4);
    }
    this.stats.forEach((line, i) => {
      line.visible = this.open;
      line.position.set(PAD, HEADER + PAD + i * LINE);
    });
    this.list.position.set(PAD, listTop);
    this.clip
      .clear()
      .rect(PAD, listTop, width - PAD * 2, height - listTop - PAD)
      .fill({ color: 0xffffff });
  }

  /** Puts the lines in view into the pool's texts, the newest at the bottom. Wide lines run under the clip */
  private paint() {
    const count = Math.min(this.visible, this.lines.length, POOL);
    const first = Math.max(0, this.lines.length - count - this.scroll);
    for (let i = 0; i < POOL; i++) {
      const slot = this.pool[i];
      const line = i < count ? this.lines[first + i] : undefined;
      slot.visible = line !== undefined;
      if (!line) continue;
      show(slot, line.text);
      tint(slot, line.color);
      slot.position.set(line.indent, i * LINE);
    }
  }
}
