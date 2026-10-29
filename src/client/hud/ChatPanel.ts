import { CanvasTextMetrics, Container, Graphics, Rectangle, TextStyle, type Text } from 'pixi.js';
import type { GameState } from '../../game';
import type { Slot } from '../storage/Store';
import { CombatLog, LOG_FILTERS, inFilter, type LogEntry, type LogFilter } from './combatLog';
import { THEME, subheading } from './theme';
import { NIGHT, NIGHT_SPOT, drawNightWell, moonButton, moonButtonEnd, nightPlate } from './nightTheme';
import { Tooltip, type TooltipText } from './Tooltip';
import { Tile, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const MARGIN = 16; // pixels from the screen's edges
const INSET = 10; // pixels from the plate's edge to what is in it, clear of its gold edge and rounded corners
const SPACE = 6; // pixels between the rows in it: the tabs, the log's filters, the well
const CLOSED = { width: 500, lines: 5 };
const OPEN = { width: 660, height: 560 };
const LEAST_LINES = 4; // lines the open panel shows at least, however little room the screen leaves it
const LINE = 16; // pixels per line of text
const FONT = 12;
const INDENT = 16; // pixels the dice of an entry are set in
const WRAP_INDENT = 10; // pixels the rest of a line too long for the well is set in further, on the lines under it
// Texts kept wrapped at most, at both the folded and the unfolded width: then they are all wrapped again as they come
const WRAPPED_KEPT = 8000;
const WELL = { x: 8, y: 5 } as const; // pixels inside the well, round its lines
const POOL = 60; // lines of text drawn at once at most
const WHEEL_LINES = 3; // lines one notch of the mouse wheel scrolls
// Pixels: the tabs along the top: their height, the room beside a name past the stars on a tab's points (and the
// least of it, squeezed into a narrow panel), between two tabs, and between the log's tab and the channels'; their
// names' size
const TAB = { height: 24, pad: 5, least: 1, gap: 2, apart: 10, font: 11 } as const;
const TOGGLE = 24; // pixels: the square button that unfolds and folds the panel
// Pixels: the combat log's filters, the room beside a name past the stars on their points
const FILTER = { height: 20, pad: 4, gap: 4, font: 10 } as const;
// Pixels: a channel's line to write in at the bottom of its well, its Send button, their letters
const INPUT = { height: 24, send: 72, font: 11 } as const;
// Pixels: the scroll bar inside the well's right edge, how wide a strip round it takes a grab, its thumb at least
const SCROLL = { width: 4, grip: 14, least: 18 } as const;
const LATEST = { width: 80, height: 18 } as const; // pixels: the button back to the newest lines
const DOT = 3.5; // pixels: the light on a tab with news since it was last looked at
const TOP = INSET + TAB.height + SPACE; // pixels: where what is under the tabs starts
const CLOSED_HEIGHT = TOP + CLOSED.lines * LINE + WELL.y * 2 + INSET;
const TONES = { crit: 0xffd34d, miss: 0xa9b4ba } as const;
const KIND_COLORS = {
  dealt: THEME.text,
  taken: 0xff8a7a,
  kill: 0x7dff8a,
  death: 0xff5a4a,
  repair: 0x9dffb0,
  gold: 0xffcf3f,
  level: 0x9fd4ff,
  note: NIGHT.dim,
} as const;
const FILTER_NAMES: Readonly<Record<LogFilter, string>> = {
  all: 'All',
  dealt: 'Dealt',
  taken: 'Taken',
  other: 'Kills, gold, levels',
};

/**
 * The chat's channels: every captain at sea, the captains in these waters, the player's group, their guild, and
 * messages between them and one captain. Empty until the online game: there is nobody to talk to yet
 */
const CHANNELS = ['general', 'zone', 'group', 'guild', 'private'] as const;
type Channel = (typeof CHANNELS)[number];
/** The panel's tabs: the combat log, then the chat's channels */
const TABS = ['combat', ...CHANNELS] as const;
type TabId = (typeof TABS)[number];
const TAB_NAMES: Readonly<Record<TabId, string>> = {
  combat: 'Combat log',
  general: 'General',
  zone: 'Zone',
  group: 'Group',
  guild: 'Guild',
  private: 'Private',
};
/** What an empty channel's well says under its name */
const EMPTY: Readonly<Record<Channel, string>> = {
  general: 'Every captain at sea talks here',
  zone: 'The captains in these waters talk here',
  group: "You're not in a group",
  guild: "You're not in a guild",
  private: 'Nobody has written to you yet',
};

/** A line of the list: its text, color and how far it is set in */
interface Line {
  readonly text: string;
  readonly color: number;
  readonly indent: number;
}

interface Tab {
  readonly id: TabId;
  readonly tile: Tile;
  readonly label: Text;
  /** Makes the tab another width, its stars and name kept in their places */
  readonly resize: (width: number) => void;
  /** Lit while the tab has news since it was last looked at */
  readonly dot: Graphics;
}

function entryColor(entry: LogEntry) {
  if (entry.tone === 'crit') return TONES.crit;
  if (entry.tone === 'miss') return TONES.miss;
  return KIND_COLORS[entry.kind];
}

/**
 * The chat in the bottom left corner, a plate in the night look like the frames at the top: tabs along its top (the
 * windows' moonlit buttons), the combat log and the chat's channels, and the lines of the one picked in a dark well.
 * Folded, it shows the last few lines; unfolded (its button, or J for the combat log) filters to pick what to list,
 * and every entry with all its dice, scrolled with the mouse wheel or the bar beside them. A channel shows who it is for and
 * a line to write in, closed until the online game. Only the lines in view are drawn, from a fixed pool of texts, so
 * a long log costs nothing more
 */
export class ChatPanel {
  /** Pixels: the folded panel's height */
  static readonly FOLDED_HEIGHT = CLOSED_HEIGHT;
  readonly container = new Container();
  readonly log = new CombatLog();
  /** Its size as last laid out, pixels */
  width = 0;
  height = 0;
  /** The plate under everything, made again at every new size */
  private frame = new Container();
  /** Over the plate: the well, and a channel's line to write in */
  private readonly boards = new Graphics();
  private readonly toggleButton = new Tile(TOGGLE, TOGGLE, () => this.toggle(), 4, NIGHT_SPOT);
  private readonly chevron = new Graphics();
  private toggleHovered = false;
  private readonly hints: { readonly fold: TooltipText; readonly unfold: TooltipText };
  private readonly tooltip: Tooltip;
  private readonly tabs: readonly Tab[];
  private readonly filters: readonly { filter: LogFilter; tile: Tile }[];
  private readonly list = new Container();
  private readonly clip = new Graphics();
  private readonly pool: Text[] = [];
  private readonly scrollBar = new Graphics();
  private readonly latest: Tile;
  /** An empty channel's name and what it is for, in the middle of its well */
  private readonly emptyTitle = subheading('', 15);
  private readonly emptyText = text('', FONT, NIGHT.dim, { align: 'center', wordWrap: true });
  private readonly placeholder = text('', INPUT.font, NIGHT.dim, { fontStyle: 'italic' });
  private readonly send: Tile;
  private open = false;
  private tab: TabId = 'combat';
  private filter: LogFilter = 'all';
  private lines: Line[] = [];
  /** What the lines were made from, to remake them only when it changes */
  private madeFor = '';
  /** The log's letters, to measure where a line too long for the well wraps */
  private readonly measure = new TextStyle({ fontFamily: 'Arial', fontSize: FONT, wordWrap: true, breakWords: true });
  /**
   * Texts wrapped to the well, by its width, their indent and text: each is measured once, not every time the lines are
   * made, and folding the panel or unfolding it again doesn't measure the whole log anew
   */
  private readonly wrapped = new Map<string, readonly string[]>();
  /** The width the log's lines are wrapped to, pixels */
  private listWidth = 0;
  /** Lines scrolled up from the newest: 0 shows the end of the log */
  private scroll = 0;
  private visible = 0;
  /** Size and state the panel was last laid out for */
  private laidOut = '';
  /** The scroll bar's track, in the panel */
  private track = new Rectangle();
  /** What the scroll bar was last drawn for */
  private drawnBar = '';
  /** Where the scroll bar's thumb was grabbed: the pointer's y and the scroll then; null while it isn't dragged */
  private dragging: { readonly y: number; readonly scroll: number } | null = null;
  /** The log's version when its tab was last in view: anything newer lights its dot */
  private seen: number;

  /** Where the log is kept between visits, with whether the panel was unfolded and on which tab */
  private readonly kept: Slot;
  /** The log's version when it was last kept */
  private keptVersion = -1;

  /** screen: the screen its tooltip stays inside */
  constructor(kept: Slot, screen: { readonly width: number }) {
    this.kept = kept;
    this.tooltip = new Tooltip(screen);
    const saved = kept.get();
    if (typeof saved === 'object' && saved !== null) {
      if ('log' in saved) this.log.restore(saved.log);
      if ('open' in saved && saved.open === true) this.open = true;
      const tab = 'tab' in saved ? TABS.find((id) => id === saved.tab) : undefined;
      if (tab) this.tab = tab;
      const filter = 'filter' in saved ? LOG_FILTERS.find((f) => f === saved.filter) : undefined;
      if (filter) this.filter = filter;
    }
    this.seen = this.log.version;

    this.tabs = TABS.map((id) => {
      const { tile, text: label, resize } = moonButton(0, TAB.height, t(TAB_NAMES[id]), () => this.pick(id), TAB.font);
      const dot = new Graphics().circle(0, 0, DOT).fill({ color: THEME.title }).stroke({ width: 1, color: 0x000000 });
      dot.visible = false;
      tile.content.addChild(dot);
      return { id, tile, label, resize, dot };
    });
    this.filters = LOG_FILTERS.map((filter) => {
      const {
        tile,
        text: label,
        resize,
      } = moonButton(0, FILTER.height, t(FILTER_NAMES[filter]), () => this.pickFilter(filter), FILTER.font);
      resize(Math.ceil(label.width) + (moonButtonEnd(FILTER.height) + FILTER.pad) * 2);
      return { filter, tile };
    });

    // A chevron pointing up, the way the panel unfolds; turned over while it is unfolded
    this.chevron
      .moveTo(-4.5, 2.25)
      .lineTo(0, -2.25)
      .lineTo(4.5, 2.25)
      .stroke({ width: 2, color: THEME.brassLight, cap: 'round', join: 'round' });
    this.chevron.position.set(TOGGLE / 2, TOGGLE / 2);
    this.toggleButton.content.addChild(this.chevron);
    this.toggleButton.container.on('pointerover', () => (this.toggleHovered = true));
    this.toggleButton.container.on('pointerout', () => (this.toggleHovered = false));
    const key = t('J opens the combat log');
    this.hints = { fold: { title: t('Fold'), lines: [key] }, unfold: { title: t('Unfold'), lines: [key] } };

    this.latest = moonButton(LATEST.width, LATEST.height, `${t('Latest')} ▼`, () => this.scrollTo(0), FILTER.font).tile;
    this.send = moonButton(INPUT.send, INPUT.height - 2, t('Send'), null, INPUT.font).tile;
    show(this.placeholder, t('The chat opens with the online game'));
    this.placeholder.anchor.set(0, 0.5);
    this.emptyTitle.anchor.set(0.5, 1);
    this.emptyText.anchor.set(0.5, 0);

    for (let i = 0; i < POOL; i++) {
      const line = text('', FONT, THEME.text);
      line.visible = false;
      this.pool.push(line);
      this.list.addChild(line);
    }
    this.list.mask = this.clip;
    this.bindScrollBar();

    this.container.eventMode = 'static';
    // Clicks on the panel must not reach the stage, which would steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
    this.container.on('wheel', (e) => this.scrollBy(e.deltaY > 0 ? -WHEEL_LINES : WHEEL_LINES));
    this.container.addChild(
      this.frame,
      this.boards,
      ...this.tabs.map((tab) => tab.tile.container),
      this.toggleButton.container,
      ...this.filters.map((f) => f.tile.container),
      this.list,
      this.clip,
      this.scrollBar,
      this.latest.container,
      this.emptyTitle,
      this.emptyText,
      this.placeholder,
      this.send.container,
      this.tooltip.container,
    );
  }

  /** Unfolds or folds the panel, on the tab it shows */
  toggle() {
    // The button moves with the panel's new size, from under the pointer: its tooltip would stay over it till it moved
    this.toggleHovered = false;
    this.open = !this.open;
    this.scroll = 0;
    this.keep(true);
  }

  /** J: unfolds the panel on the combat log; on the combat log already, folds it */
  toggleLog() {
    if (this.open && this.tab === 'combat') this.open = false;
    else {
      this.open = true;
      this.tab = 'combat';
    }
    this.scroll = 0;
    this.keep(true);
  }

  /** Keeps the log for the next visit, if anything changed since it was last kept (or `always`) */
  keep(always = false) {
    if (!always && this.log.version === this.keptVersion) return;
    this.keptVersion = this.log.version;
    this.kept.set({ open: this.open, tab: this.tab, filter: this.filter, log: this.log.toData() });
  }

  /** Pixels wide, folded or unfolded as it is now, on a screen that wide */
  widthOn(screenWidth: number) {
    return Math.min(this.open ? OPEN.width : CLOSED.width, screenWidth - MARGIN * 2);
  }

  /**
   * Records this update's events, then lays the panel out: unfolded no taller than `room` pixels (what the screen
   * leaves it), down from its top when it is put at the top of the screen (`down`), else up. The HUD puts it where it
   * goes, by its `width` and `height`
   */
  update(state: GameState, screenWidth: number, room: number, down: boolean) {
    this.log.record(state);
    const combat = this.tab === 'combat';
    const width = this.widthOn(screenWidth);
    const height = this.open ? Math.max(this.leastHeight(), Math.min(OPEN.height, Math.floor(room))) : CLOSED_HEIGHT;
    this.width = width;
    this.height = height;
    const size = `${width}x${height}/${this.open}/${this.tab}`;
    if (size !== this.laidOut) {
      this.laidOut = size;
      this.layout(width, height);
    }

    if (combat) {
      const key = `${this.log.version}/${this.filter}/${this.open}`;
      if (key !== this.madeFor) {
        const before = this.lines.length;
        this.madeFor = key;
        this.lines = this.makeLines();
        // Scrolled back to read: new lines come in below without moving what is being read
        if (this.scroll > 0) this.scroll += Math.max(0, this.lines.length - before);
      }
      this.seen = this.log.version;
      this.scrollTo(this.scroll);
      this.paint();
      for (const { filter, tile } of this.filters) tile.setLook({ pressed: filter === this.filter });
    }
    this.latest.container.visible = combat && this.open && this.scroll > 0;
    for (const { id, tile, dot } of this.tabs) {
      tile.setLook({ pressed: id === this.tab });
      dot.visible = id === 'combat' && !combat && this.log.version !== this.seen;
    }

    // Pointing the way a click moves the panel's far edge
    this.chevron.scale.y = this.open !== down ? -1 : 1;
    const { x, y } = this.toggleButton.container;
    const hint = this.open ? this.hints.fold : this.hints.unfold;
    this.tooltip.point(this.toggleHovered ? hint : null, x + TOGGLE / 2, y, { under: y + TOGGLE });
  }

  private pick(tab: TabId) {
    this.tab = tab;
    this.scroll = 0;
    this.keep(true);
  }

  private pickFilter(filter: LogFilter) {
    this.filter = filter;
    this.scroll = 0;
    this.keep(true);
  }

  private scrollBy(lines: number) {
    if (this.tab === 'combat') this.scrollTo(this.scroll + lines);
  }

  /** Scrolls to whole lines back from the newest, as far as there are */
  private scrollTo(scroll: number) {
    this.scroll = Math.round(Math.min(Math.max(0, scroll), Math.max(0, this.lines.length - this.visible)));
  }

  /** The unfolded panel's least height: the rows over the well, and a few lines in it */
  private leastHeight() {
    const combat = this.tab === 'combat';
    const over = combat ? FILTER.height + SPACE : 0;
    return TOP + over + LEAST_LINES * LINE + WELL.y * 2 + (combat ? 0 : INPUT.height) + INSET;
  }

  /**
   * Folded: the last lines of the last entries. Unfolded: the entries of the filter, each with its dice under it. A
   * line too long for the well wraps onto lines of its own under it, set in a little
   */
  private makeLines(): Line[] {
    const lines: Line[] = [];
    const add = (value: string, color: number, indent: number) =>
      this.wrap(value, indent).forEach((part, i) =>
        lines.push({ text: part, color, indent: i === 0 ? indent : indent + WRAP_INDENT }),
      );
    const { entries } = this.log;
    if (!this.open) {
      for (const entry of entries.slice(-CLOSED.lines)) add(entry.summary, entryColor(entry), 0);
      return lines.slice(-CLOSED.lines);
    }
    for (const entry of entries) {
      if (!inFilter(entry, this.filter)) continue;
      add(entry.summary, entryColor(entry), 0);
      for (const detail of entry.details) add(detail, NIGHT.dim, INDENT);
    }
    return lines;
  }

  /** A text set in `indent` pixels, cut into the lines it takes in the well */
  private wrap(value: string, indent: number) {
    const key = `${this.listWidth}/${indent}/${value}`;
    let parts = this.wrapped.get(key);
    if (!parts) {
      if (this.wrapped.size >= WRAPPED_KEPT) this.wrapped.clear();
      this.measure.wordWrapWidth = this.listWidth - indent - WRAP_INDENT;
      parts = CanvasTextMetrics.measureText(value, this.measure).lines;
      this.wrapped.set(key, parts);
    }
    return parts;
  }

  /**
   * The panel at a new size or on a new tab: the plate under it, the tabs along its top, then under them the combat
   * log's filters (unfolded), and the well: the log's lines and its scroll bar, or a channel's name and what
   * it is for over its line to write in
   */
  private layout(width: number, height: number) {
    const frame = nightPlate(width, height);
    this.container.addChildAt(frame, 0);
    this.frame.destroy({ children: true });
    this.frame = frame;
    this.container.hitArea = new Rectangle(0, 0, width, height);
    this.layTabs(width);

    const combat = this.tab === 'combat';
    const full = combat && this.open;
    let y = TOP;
    for (const { tile } of this.filters) tile.container.visible = full;
    if (full) {
      let x = INSET;
      for (const { tile } of this.filters) {
        tile.container.position.set(x, y);
        x += tile.width + FILTER.gap;
      }
      y += FILTER.height + SPACE;
    }

    const well = new Rectangle(INSET, y, width - INSET * 2, height - INSET - y);
    drawNightWell(this.boards.clear(), well.x, well.y, well.width, well.height);
    const box = new Rectangle(
      well.x + WELL.x,
      well.y + WELL.y,
      well.width - WELL.x * 2 - (combat ? SCROLL.grip : 0),
      well.height - WELL.y * 2 - (combat ? 0 : INPUT.height),
    );
    this.visible = Math.floor(box.height / LINE);
    if (combat && box.width !== this.listWidth) {
      this.listWidth = box.width;
      this.madeFor = '';
    }
    this.list.visible = this.scrollBar.visible = combat;
    this.list.position.set(box.x, box.y);
    this.clip.clear().rect(box.x, box.y, box.width, box.height).fill({ color: 0xffffff });
    this.track = new Rectangle(well.right - WELL.x - SCROLL.width, box.y, SCROLL.width, box.height);
    this.scrollBar.hitArea = new Rectangle(
      this.track.x - (SCROLL.grip - SCROLL.width) / 2,
      this.track.y,
      SCROLL.grip,
      this.track.height,
    );
    this.drawnBar = '';
    this.latest.container.position.set(box.right - LATEST.width, box.bottom - LATEST.height);

    for (const part of [this.emptyTitle, this.emptyText, this.placeholder, this.send.container]) part.visible = !combat;
    const channel = this.tab;
    if (channel === 'combat') return;
    const middle = box.x + box.width / 2;
    show(this.emptyTitle, t(TAB_NAMES[channel]));
    this.emptyText.style.wordWrapWidth = box.width;
    show(this.emptyText, t(EMPTY[channel]));
    const block = this.emptyTitle.height + SPACE + this.emptyText.height;
    const blockTop = box.y + (box.height - block) / 2;
    this.emptyTitle.position.set(middle, Math.round(blockTop + this.emptyTitle.height));
    this.emptyText.position.set(middle, Math.round(blockTop + this.emptyTitle.height + SPACE));
    // The line to write in along the bottom of the well, Send beside it
    const lineTop = box.bottom + 1;
    const lineHeight = INPUT.height - 2;
    const sendX = well.right - WELL.x - INPUT.send;
    this.boards
      .roundRect(box.x, lineTop, sendX - SPACE - box.x, lineHeight, 4)
      .fill({ color: NIGHT.glassDark, alpha: 0.7 })
      .stroke({ width: 1, color: THEME.brass, alpha: 0.35 });
    this.placeholder.position.set(box.x + WELL.x, lineTop + lineHeight / 2);
    this.send.container.position.set(sendX, lineTop);
  }

  /**
   * The tabs in a row along the top, squeezed closer in a narrow panel; the button that folds it at its right end. A
   * tab's light for news sits on its top edge, over the star on its right point
   */
  private layTabs(width: number) {
    const room = width - INSET * 2 - TOGGLE - SPACE;
    const end = moonButtonEnd(TAB.height);
    const names = this.tabs.reduce((sum, { label }) => sum + Math.ceil(label.width) + end * 2, 0);
    const gaps = (this.tabs.length - 2) * TAB.gap + TAB.apart;
    const pad = Math.max(TAB.least, Math.min(TAB.pad, Math.floor((room - names - gaps) / (this.tabs.length * 2))));
    let x = INSET;
    for (const { id, tile, label, resize, dot } of this.tabs) {
      resize(Math.ceil(label.width) + (end + pad) * 2);
      tile.container.position.set(x, INSET);
      dot.position.set(tile.width - end, DOT);
      x += tile.width + (id === 'combat' ? TAB.apart : TAB.gap);
    }
    this.toggleButton.container.position.set(width - INSET - TOGGLE, INSET);
  }

  /** The scroll bar: its thumb dragged, the track above or below it clicked to turn a page */
  private bindScrollBar() {
    const bar = this.scrollBar;
    bar.eventMode = 'static';
    bar.cursor = 'pointer';
    bar.on('pointerdown', (e) => {
      e.stopPropagation();
      const thumb = this.thumb();
      if (!thumb) return;
      const y = this.container.toLocal(e.global).y;
      if (y < thumb.y) this.scrollBy(this.visible);
      else if (y > thumb.y + thumb.height) this.scrollBy(-this.visible);
      else this.dragging = { y: e.global.y, scroll: this.scroll };
    });
    bar.on('globalpointermove', (e) => {
      const thumb = this.dragging && this.thumb();
      if (!this.dragging || !thumb) return;
      // Down the track is towards the newest lines, so the scroll back from them shrinks
      const most = this.lines.length - this.visible;
      const travel = Math.max(1, this.track.height - thumb.height);
      this.scrollTo(this.dragging.scroll - ((e.global.y - this.dragging.y) * most) / travel);
    });
    const drop = () => (this.dragging = null);
    bar.on('pointerup', drop);
    bar.on('pointerupoutside', drop);
  }

  /** The scroll bar's thumb: its top in the panel and its height; null while every line fits */
  private thumb() {
    const most = this.lines.length - this.visible;
    if (most <= 0) return null;
    const { y, height } = this.track;
    const size = Math.min(height, Math.max(SCROLL.least, (height * this.visible) / this.lines.length));
    return { y: y + ((height - size) * (most - this.scroll)) / most, height: size };
  }

  /**
   * Puts the lines in view into the pool's texts, the newest at the bottom (wide lines run under the clip), and
   * shows where they are on the scroll bar
   */
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

    const drawn = `${this.scroll}/${this.lines.length}/${this.visible}`;
    if (drawn === this.drawnBar) return;
    this.drawnBar = drawn;
    const thumb = this.thumb();
    this.scrollBar.clear();
    this.scrollBar.cursor = thumb ? 'pointer' : 'default';
    if (!thumb) return;
    const { x, y, width, height } = this.track;
    this.scrollBar
      .roundRect(x, y, width, height, 2)
      .fill({ color: 0x000000, alpha: 0.45 })
      .roundRect(x, thumb.y, width, thumb.height, 2)
      .fill({ color: THEME.brass });
  }
}
