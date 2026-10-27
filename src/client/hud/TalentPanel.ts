import { Container, FillGradient, Graphics, Text, type Rectangle } from 'pixi.js';
import {
  BRANCHES,
  BRANCH_IDS,
  MILESTONES,
  ROW_POINTS,
  TALENTS,
  branchTalents,
  pointsSpent,
  respecPrice,
  signatureChoices,
  talentBlock,
  talentPoints,
  xpForLevel,
  type BranchId,
  type Player,
  type Ship,
  type TalentId,
} from '../../game';
import { THEME, THEMED_WINDOW, TITLE_STYLE, brassButton, drawDivider, drawMeter, glowFill, subheading } from './theme';
import {
  HudWindow,
  Tile,
  UI,
  drawBroadside,
  drawSail,
  drawStar,
  drawWrench,
  show,
  text,
  tint,
  type TileStyle,
} from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1092; // pixels, before scaling down to fit the screen
const PAD = 24;
const DIVIDER = PAD + 50; // the gold line under the title
const TOP = DIVIDER + 16; // where the columns start
const CLOSE_WIDTH = 96; // pixels: the themed window's Close button, beside the points to spend
const SIGNATURE_WIDTH = 290; // pixels: the signature talents' column
const COLUMN_GAP = 16; // pixels between the signatures' column and the branches'
const BRANCH_GAP = 12; // pixels between two branches
const BRANCH_X = PAD + SIGNATURE_WIDTH + COLUMN_GAP;
const BRANCH_WIDTH = (WIDTH - BRANCH_X - PAD - BRANCH_GAP * 2) / 3;
const BOARD_PAD = 10; // pixels inside a column's board
const EMBLEM = 18; // pixels: a column's emblem's radius
const CHIP = { width: 22, height: 15 } as const; // pixels: the count on an emblem
const HEAD_GAP = 14; // pixels between a column's head and its first row
const GATE = 26; // pixels: a line with what opens the row under it (a branch), or a milestone's level
// A talent's card, pixels: between two, its name's and its text's tops, under its text, and the least it is
const CARD = { gap: 8, name: 8, about: 26, bottom: 9, least: 52 } as const;
const PIP = { size: 9, step: 12 } as const; // pixels: a rank's diamond, and from one to the next
const OR = { width: 34, height: 16 } as const; // pixels: the "or" between a milestone's two talents
// The halo round a talent that can be taken: rings a few pixels apart, fainter outwards, breathing together
const HALO = { rings: 3, step: 2.5, alpha: 0.32, color: THEME.title } as const;
const PULSE = 1.4; // seconds one breath of the halos takes
const XP_BAR = { width: 180, height: 10 } as const; // pixels
const XP_COLOR = 0x5aa8ff; // as under the player's frame
const BADGE = { height: 28, star: 7, glow: 3 } as const; // pixels: the points to spend, beside Close
const RESET = { width: 240, height: 30 } as const;
const FOOTER = 14; // pixels between the line over the reset and the button
const WELL = 0x0a0705; // a pip's or an emblem's dark middle
const BOARD = 0x070504; // a column's board, under its cards
const SIGNATURE_COLOR = THEME.title;

type Glyph = (g: Graphics, size: number, color: number) => void;

/** Each branch's colour (its emblem, names, ranks taken) and the sign on its emblem: a cannon, a sail, a wrench */
const BRANCH_LOOKS: Readonly<Record<BranchId, { readonly color: number; readonly glyph: Glyph }>> = {
  gunnery: { color: 0xe0703a, glyph: drawBroadside },
  seamanship: { color: 0x5aa9ff, glyph: drawSail },
  // Green as the repairs are in the game
  hull: { color: 0x6fbf73, glyph: drawWrench },
};

/** Talent cards: boards like the windows' rows, warmer once a talent is taken in full */
const CARD_LOOK: TileStyle = {
  idle: THEME.card,
  hover: THEME.buttonHover,
  pressed: 0x302318,
  alpha: 0.95,
  border: THEME.brass,
  borderAlpha: 0.55,
  pressedBorder: THEME.brassLight,
  bevel: true,
};

// A gate's lines, brightening towards its label in the middle
const fade = (from: number, to: number) =>
  new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: `rgba(201,154,69,${from})` },
      { offset: 1, color: `rgba(243,213,138,${to})` },
    ],
    textureSpace: 'local',
  });
const FADE_IN = fade(0, 0.85);
const FADE_OUT = fade(0.85, 0);

export interface TalentActions {
  /** Takes a talent (a rank of a branch talent, or a signature talent); false if it can't */
  learnTalent: (id: TalentId) => boolean;
  /** Forgets every talent at the shipwright's, for gold; false if not in port or short of it */
  resetTalents: () => boolean;
}

interface Card {
  readonly id: TalentId;
  /** Its column's colour: its stripe and ranks once taken, its edge in full */
  readonly color: number;
  readonly container: Container;
  readonly halo: Graphics;
  readonly tile: Tile;
  readonly stripe: Graphics;
  readonly pips: Graphics;
  readonly name: Text;
  readonly about: Text;
  /** The rank its pips were drawn for */
  drawn: number;
}

/** A line across a column with a label in its middle, lit once what it stands for is reached */
interface Gate {
  readonly label: Text;
  readonly lines: Graphics;
  readonly open: (ship: Ship) => boolean;
}

/** A column: its board under everything, its head, cards and gates */
interface Column {
  readonly container: Container;
  readonly board: Graphics;
  readonly width: number;
}

/** A column's emblem round (0, 0): a brass ring round a dark well lit in its colour, and its sign in it */
function drawEmblem(g: Graphics, radius: number, color: number, glyph: Glyph) {
  g.circle(0, 0, radius).fill({ color: WELL }).stroke({ width: 3, color: THEME.brass });
  g.circle(0, 0, radius - 2).fill(glowFill(color));
  g.circle(0, 0, radius - 5).stroke({ width: 1, color, alpha: 0.5 });
  glyph(g, radius * 1.1, color);
}

/** A talent's ranks as diamonds ending at (x, y), filled in `color` for those taken */
function drawPips(g: Graphics, x: number, y: number, rank: number, max: number, color: number) {
  g.clear();
  const h = PIP.size / 2;
  for (let i = 0; i < max; i++) {
    const cx = x - (max - 1 - i) * PIP.step;
    g.poly([cx, y - h, cx + h, y, cx, y + h, cx - h, y]);
    if (i < rank) g.fill({ color }).stroke({ width: 1, color: THEME.brassLight, alpha: 0.8 });
    else g.fill({ color: WELL }).stroke({ width: 1, color: THEME.brass, alpha: 0.6 });
  }
}

/** The height that fits every card's text, the same for all of them */
function cardHeight(cards: readonly Card[]) {
  return Math.max(CARD.least, ...cards.map((card) => Math.ceil(CARD.about + card.about.height + CARD.bottom)));
}

/**
 * The talent tree (K), in the windows' theme. On the left the signature talents: at levels 5, 10, 15 and 20 one of
 * two. On the right the three branches: every other level from 2 gives a point, spent a rank at a time; a branch's
 * next row opens with ROW_POINTS more points spent in it, its gate lighting up. A talent that can be taken now glows,
 * its ranks taken are diamonds filled in its branch's colour, the rest is dim. Only what the ship's class can reach is
 * shown: the starter sloop, up to level 10, has the milestones 5 and 10 and the rows its points open. The shipwright
 * forgets them all for gold, in port. Closed by Close, Escape, K or a click beside it
 */
export class TalentPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly level = subheading('', 18);
  private readonly xpBar = new Graphics();
  private readonly xpText = text('', 12, THEME.dim, { fontWeight: 'bold' });
  /** The level and XP the header was drawn for */
  private xpDrawn = '';
  private readonly badge = new Container();
  private readonly badgeBack = new Graphics();
  private readonly badgeGlow = new Graphics();
  private readonly badgeText = text('', 14, THEME.title, { fontWeight: 'bold' });
  private readonly gates: Gate[] = [];
  private readonly chips: { readonly label: Text; readonly count: (ship: Ship) => number }[] = [];
  private readonly cards: Card[] = [];
  private readonly reset: Tile;
  private readonly resetText: Text;
  private readonly message = text('', 12, THEME.dim);
  /** The message is the last reset's: it stays up till the panel is closed */
  private said = false;
  private clock = 0;
  private readonly actions: TalentActions;

  /** maxLevel: the ship's class's last level, which sets how much of the tree it has */
  constructor(actions: TalentActions, screen: Rectangle, maxLevel: number) {
    this.actions = actions;
    const milestones = MILESTONES.filter((m) => m <= maxLevel);
    // A branch's rows that the points of the class's last level can open
    const rows = Math.floor(talentPoints(maxLevel) / ROW_POINTS) + 1;

    const signatures = columnAt(PAD, SIGNATURE_WIDTH);
    const branches = BRANCH_IDS.map((_, i) => columnAt(BRANCH_X + i * (BRANCH_WIDTH + BRANCH_GAP), BRANCH_WIDTH));
    const heads = [
      this.head(
        signatures,
        t('Signature talents'),
        t('One of two at levels {levels}', { levels: milestones.join(', ') }),
        SIGNATURE_COLOR,
        (g, size, color) => drawStar(g, size * 0.45, color),
        (ship) => milestones.filter((m) => signatureChoices(m).some((s) => ship.hasTalent(s.id))).length,
      ),
      ...BRANCH_IDS.map((id, i) =>
        this.head(
          branches[i],
          t(BRANCHES[id].name),
          t(BRANCHES[id].text),
          BRANCH_LOOKS[id].color,
          BRANCH_LOOKS[id].glyph,
          (ship) => pointsSpent(ship, id),
        ),
      ),
    ];
    const top = Math.max(...heads) + HEAD_GAP;
    const bottom = Math.max(
      this.buildSignatures(signatures, milestones, top, maxLevel),
      this.buildBranches(branches, rows, top),
    );
    const boardHeight = bottom + BOARD_PAD;
    for (const { board, width } of [signatures, ...branches]) {
      board
        .roundRect(0, 0, width, boardHeight, 8)
        .fill({ color: BOARD, alpha: 0.5 })
        .stroke({ width: 1, color: THEME.brass, alpha: 0.3 });
      board.rect(BOARD_PAD, top - HEAD_GAP / 2, width - BOARD_PAD * 2, 1).fill({ color: THEME.brass, alpha: 0.25 });
    }

    const footer = TOP + boardHeight + 16;
    const height = footer + FOOTER + RESET.height + PAD;
    this.window = new HudWindow(screen, { width: WIDTH, height, pad: PAD }, () => this.hide(), THEMED_WINDOW);
    this.container = this.window.container;

    const title = new Text({ text: t('Talents'), style: { ...TITLE_STYLE, fontSize: 28 } });
    title.position.set(PAD, PAD - 6);
    this.level.position.set(PAD + title.width + 26, PAD + 1);
    const note = text(
      t('A point at every level from 2 for the branches; at levels {levels} a signature talent instead', {
        levels: milestones.join(', '),
      }),
      13,
      THEME.dim,
    );
    note.position.set(PAD, PAD + 30);
    const star = new Graphics();
    drawStar(star, BADGE.star, THEME.title);
    star.position.set(BADGE.star + 9, BADGE.height / 2);
    this.badgeText.anchor.set(0, 0.5);
    this.badgeText.position.set(BADGE.star * 2 + 16, BADGE.height / 2);
    this.badge.addChild(this.badgeGlow, this.badgeBack, star, this.badgeText);
    this.badge.visible = false;

    const reset = brassButton(RESET.width, RESET.height, '', () => this.forget(), 13);
    this.reset = reset.tile;
    this.resetText = reset.text;
    this.reset.container.position.set(PAD, footer + FOOTER);
    this.message.anchor.set(0, 0.5);
    this.message.position.set(PAD + RESET.width + 14, footer + FOOTER + RESET.height / 2);
    const hint = text(t('A glowing talent can be taken now: click it'), 12, THEME.dim);
    hint.anchor.set(1, 0.5);
    hint.position.set(WIDTH - PAD, this.message.y);

    this.window.panel.addChild(
      title,
      this.level,
      this.xpBar,
      this.xpText,
      note,
      this.badge,
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      signatures.container,
      ...branches.map((b) => b.container),
      drawDivider(new Graphics(), PAD, footer, WIDTH - PAD * 2),
      this.reset.container,
      this.message,
      hint,
    );
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    this.container.visible = !this.container.visible;
    this.said = false;
  }

  hide() {
    this.container.visible = false;
    this.said = false;
  }

  /** dt: seconds since the last frame, for the halos */
  update(ship: Ship, player: Player, dt: number) {
    if (!this.isOpen) return;
    this.window.fit();
    this.clock = (this.clock + dt) % PULSE;
    const breath = 0.45 + 0.55 * Math.sin((this.clock / PULSE) * Math.PI) ** 2;
    this.header(ship, breath);

    for (const gate of this.gates) {
      const open = gate.open(ship);
      tint(gate.label, open ? THEME.title : THEME.dim);
      gate.lines.alpha = open ? 1 : 0.35;
    }
    for (const chip of this.chips) show(chip.label, `${chip.count(ship)}`);
    for (const card of this.cards) paintCard(card, ship, breath);

    const price = respecPrice(ship);
    show(this.resetText, price > 0 ? t('Forget them all: {n} gold', { n: price }) : t('Nothing to forget'));
    this.reset.setLook({ disabled: !ship.docked || price === 0 || player.gold < price });
    if (this.said) return;
    show(this.message, ship.docked ? t('The shipwright retrains the crew') : t('Only in port, at the shipwright'));
    tint(this.message, THEME.dim);
  }

  /** The level and its XP beside the title, and the points to spend beside Close */
  private header(ship: Ship, breath: number) {
    const { level, xp } = ship;
    const top = level >= ship.shipClass.maxLevel;
    const key = `${level}:${xp}:${top}`;
    if (key !== this.xpDrawn) {
      this.xpDrawn = key;
      const start = xpForLevel(level);
      const need = xpForLevel(level + 1) - start;
      show(this.level, t('Level {level}', { level }));
      show(this.xpText, top ? t('Max level') : t('{xp} / {need} XP', { xp: xp - start, need }));
      this.xpBar.position.set(this.level.x + this.level.width + 14, PAD + 9);
      drawMeter(this.xpBar.clear(), XP_BAR.width, XP_BAR.height, top ? 1 : (xp - start) / need, XP_COLOR);
      this.xpText.position.set(this.xpBar.x + XP_BAR.width + 10, PAD + 6);
    }

    const left = talentPoints(level) - pointsSpent(ship);
    this.badge.visible = left > 0;
    if (!this.badge.visible) return;
    this.badgeGlow.alpha = breath;
    const label = t('{n} point to spend|{n} points to spend', { n: left });
    if (label === this.badgeText.text) return;
    show(this.badgeText, label);
    const width = Math.ceil(this.badgeText.x + this.badgeText.width + 14);
    this.badgeGlow.clear();
    for (let i = BADGE.glow; i >= 1; i--) {
      const out = i * 2.5;
      this.badgeGlow
        .roundRect(-out, -out, width + out * 2, BADGE.height + out * 2, BADGE.height / 2 + out)
        .fill({ color: HALO.color, alpha: HALO.alpha / i });
    }
    this.badgeBack
      .clear()
      .roundRect(0, 0, width, BADGE.height, BADGE.height / 2)
      .fill({ color: 0x3a2a10, alpha: 0.95 })
      .stroke({ width: 1.5, color: THEME.title });
    this.badge.position.set(WIDTH - PAD - CLOSE_WIDTH - 16 - width, PAD);
  }

  /**
   * A column's head on its board: its emblem with a count on it (`count`), its name in its colour and what it is
   * for. Returns its height
   */
  private head(
    column: Column,
    name: string,
    about: string,
    color: number,
    glyph: Glyph,
    count: (ship: Ship) => number,
  ) {
    const emblem = new Graphics();
    drawEmblem(emblem, EMBLEM, color, glyph);
    const middle = BOARD_PAD + EMBLEM + 2;
    emblem.position.set(middle, middle);
    const chip = new Graphics()
      .roundRect(middle + EMBLEM * 0.35, middle + EMBLEM * 0.45, CHIP.width, CHIP.height, 4)
      .fill({ color })
      .stroke({ width: 1, color: THEME.brassDark });
    const label = text('0', 11, THEME.darkText, { fontWeight: 'bold' });
    label.anchor.set(0.5);
    label.position.set(middle + EMBLEM * 0.35 + CHIP.width / 2, middle + EMBLEM * 0.45 + CHIP.height / 2);
    this.chips.push({ label, count });
    const x = middle + EMBLEM + 14;
    const heading = subheading(name, 17);
    tint(heading, color);
    heading.position.set(x, BOARD_PAD - 1);
    const line = text(about, 11, THEME.dim, { wordWrap: true, wordWrapWidth: column.width - x - BOARD_PAD });
    line.position.set(x, BOARD_PAD + 23);
    column.container.addChild(emblem, chip, label, heading, line);
    return Math.max(middle + EMBLEM + CHIP.height / 2, line.y + line.height);
  }

  /**
   * The milestones down the signatures' column from `y`: a level's gate over its two talents, "or" between them, and
   * a word on the rest of the tree when the class stops short of it. Returns where they end
   */
  private buildSignatures(column: Column, milestones: readonly number[], y: number, maxLevel: number) {
    const width = column.width - BOARD_PAD * 2;
    const choices = milestones.map((level) =>
      signatureChoices(level).map((talent) => this.card(talent.id, width, SIGNATURE_COLOR)),
    );
    const height = cardHeight(choices.flat());
    const ors: Container[] = [];
    milestones.forEach((level, i) => {
      this.gate(column, y, t('Level {level}: one of two', { level }), (ship) => ship.level >= level);
      y += GATE;
      choices[i].forEach((card, k) => {
        if (k > 0) ors.push(orBadge(BOARD_PAD + width / 2, y - CARD.gap / 2));
        this.place(card, column, y, height);
        y += height + CARD.gap;
      });
    });
    column.container.addChild(...ors);
    // The whole tree is open by its last milestone: the levels past it give points for it
    if (maxLevel >= MILESTONES[MILESTONES.length - 1]) return y - CARD.gap;
    const more = text(
      t('This ship goes up to level {level}: the rest of the tree comes with a ship of a higher tier', {
        level: maxLevel,
      }),
      12,
      THEME.dim,
      { wordWrap: true, wordWrapWidth: width, fontStyle: 'italic' },
    );
    more.position.set(BOARD_PAD, y + 4);
    column.container.addChild(more);
    return more.y + more.height;
  }

  /**
   * The branches' rows from `y`, side by side: a row's gate (the points that open it) over its talents, the rows
   * level across the branches. rows: how many of their rows the ship's class can open. Returns where they end
   */
  private buildBranches(columns: readonly Column[], rows: number, y: number) {
    const width = BRANCH_WIDTH - BOARD_PAD * 2;
    const talents = BRANCH_IDS.map((id) => branchTalents(id).filter((b) => b.row < rows));
    const cards = talents.map((list, i) =>
      list.map((talent) => this.card(talent.id, width, BRANCH_LOOKS[BRANCH_IDS[i]].color)),
    );
    const height = cardHeight(cards.flat());
    const last = Math.max(...talents.flat().map((b) => b.row));
    for (let row = 0; row <= last; row++) {
      if (row > 0) {
        const need = row * ROW_POINTS;
        columns.forEach((column, i) =>
          this.gate(
            column,
            y,
            t('{n} point in the branch|{n} points in the branch', { n: need }),
            (ship) => pointsSpent(ship, BRANCH_IDS[i]) >= need,
          ),
        );
        y += GATE;
      }
      let bottom = y;
      columns.forEach((column, i) => {
        let at = y;
        talents[i].forEach((talent, k) => {
          if (talent.row !== row) return;
          this.place(cards[i][k], column, at, height);
          at += height + CARD.gap;
        });
        bottom = Math.max(bottom, at);
      });
      y = bottom;
    }
    return y - CARD.gap;
  }

  /** A gate across a column at `y`: its label in the middle, lines out to the column's edges */
  private gate(column: Column, y: number, label: string, open: (ship: Ship) => boolean) {
    const width = column.width - BOARD_PAD * 2;
    const middle = BOARD_PAD + width / 2;
    const cy = y + GATE / 2;
    const caption = text(label, 11, THEME.dim, { fontWeight: 'bold' });
    caption.anchor.set(0.5);
    caption.position.set(middle, cy);
    const half = caption.width / 2 + 10;
    const lines = new Graphics()
      .rect(BOARD_PAD, cy - 0.5, width / 2 - half, 1)
      .fill(FADE_IN)
      .rect(middle + half, cy - 0.5, width / 2 - half, 1)
      .fill(FADE_OUT);
    for (const x of [middle - half, middle + half]) {
      lines.poly([x, cy - 3, x + 3, cy, x, cy + 3, x - 3, cy]).fill({ color: THEME.brassLight });
    }
    column.container.addChild(lines, caption);
    this.gates.push({ label: caption, lines, open });
  }

  /** A talent's card, `width` pixels: its name, ranks and what it does; laid out by `place` */
  private card(id: TalentId, width: number, color: number): Card {
    const { name, text: about } = TALENTS[id];
    const tile = new Tile(width, CARD.least, () => this.actions.learnTalent(id), 6, CARD_LOOK);
    const stripe = new Graphics();
    const title = text(t(name), 13, THEME.text, { fontWeight: 'bold' });
    title.position.set(12, CARD.name);
    const line = text(t(about), 11, THEME.dim, { wordWrap: true, wordWrapWidth: width - 24, lineHeight: 14 });
    line.position.set(12, CARD.about);
    const pips = new Graphics();
    tile.content.addChild(stripe, title, pips, line);
    const halo = new Graphics();
    const container = new Container();
    container.addChild(halo, tile.container);
    const card = { id, color, container, halo, tile, stripe, pips, name: title, about: line, drawn: -1 };
    this.cards.push(card);
    return card;
  }

  /** A card at `y` in a column, `height` pixels tall: its board, stripe and halo drawn to it */
  private place(card: Card, column: Column, y: number, height: number) {
    const { width } = card.tile;
    card.tile.resize(width, height);
    card.stripe.roundRect(0, 4, 3, height - 8, 1.5).fill({ color: card.color });
    for (let i = HALO.rings; i >= 1; i--) {
      const out = i * 2.5;
      card.halo
        .roundRect(-out, -out, width + out * 2, height + out * 2, 6 + out)
        .fill({ color: HALO.color, alpha: HALO.alpha / i });
    }
    card.container.position.set(BOARD_PAD, y);
    column.container.addChild(card.container);
  }

  private forget() {
    if (this.actions.resetTalents()) {
      show(this.message, t('Forgotten: pick again'));
      tint(this.message, UI.good);
      this.said = true;
    }
  }
}

function columnAt(x: number, width: number): Column {
  const container = new Container();
  container.position.set(x, TOP);
  const board = new Graphics();
  container.addChild(board);
  return { container, board, width };
}

/** The "or" between a milestone's two talents, a small plate over the gap round (x, y) */
function orBadge(x: number, y: number) {
  const badge = new Container();
  badge.position.set(x - OR.width / 2, y - OR.height / 2);
  const back = new Graphics()
    .roundRect(0, 0, OR.width, OR.height, OR.height / 2)
    .fill({ color: THEME.woodDark })
    .stroke({ width: 1, color: THEME.brass, alpha: 0.7 });
  const label = text(t('or'), 10, THEME.title, { fontWeight: 'bold', fontStyle: 'italic' });
  label.anchor.set(0.5);
  label.position.set(OR.width / 2, OR.height / 2);
  badge.addChild(back, label);
  return badge;
}

/**
 * A card as the ship has it: taken in full (a warm board edged in its colour, its name gold), with ranks to take now
 * (glowing), some ranks taken (its stripe and pips in its colour), or out of reach (dim)
 */
function paintCard(card: Card, ship: Ship, breath: number) {
  const talent = TALENTS[card.id];
  const rank = ship.rank(card.id);
  const max = talent.kind === 'branch' ? talent.maxRank : 1;
  const open = talentBlock(ship, card.id) === null;
  const full = rank >= max;
  card.tile.setLook({
    pressed: full,
    disabled: rank === 0 && !open,
    border: full || rank > 0 ? card.color : open ? THEME.brassLight : THEME.brassDark,
  });
  card.halo.visible = open;
  card.halo.alpha = breath;
  card.stripe.visible = rank > 0;
  tint(card.name, full ? THEME.title : THEME.text);
  if (card.drawn === rank) return;
  card.drawn = rank;
  drawPips(card.pips, card.tile.width - 14, CARD.name + 8, rank, max, card.color);
}
