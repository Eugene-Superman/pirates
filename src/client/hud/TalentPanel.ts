import { CanvasTextMetrics, Circle, Container, Graphics, Sprite, Text, Texture, type Rectangle } from 'pixi.js';
import {
  MILESTONES,
  milestonesToPick,
  pointsSpent,
  pointsToSpend,
  respecPrice,
  shipTalentPoints,
  signatureChoices,
  talentBlock,
  talentFigures,
  talentOf,
  talentTree,
  type BranchLook,
  type BranchTalent,
  type Player,
  type Ship,
  type ShipClass,
  type Talent,
  type TalentBranch,
  type TalentId,
  type TalentTree,
} from '../../game';
import type { Question } from './ConfirmDialog';
import { TALENT_ICONS, type TalentEmblemId } from './iconAtlas';
import {
  NIGHT,
  NIGHT_CORNER_REACH,
  NIGHT_WINDOW,
  drawNightCard,
  moonButton,
  nightCorners,
  nightDivider,
  nightHeader,
  takenGlow,
  DIM_TINT,
  TREE_COLORS,
} from './nightTheme';
import { ornament } from './ornaments';
import { StoryGuide } from './StoryGuide';
import { THEME, glowFill, subheading } from './theme';
import {
  HudWindow,
  UI,
  drawBroadside,
  drawCoin,
  drawHarpoonSign,
  drawSail,
  drawStar,
  drawWrench,
  show,
  text,
  tint,
  type Tile,
} from './ui';
import { t } from '../i18n/i18n';
import { mixColor } from '../render/Painter3D';

const PAD = 24;
// The header, pixels: from its top to the line under it, and from that line to the boards
const HEADER = { rule: 44, boards: 16 } as const;
const BOARD_CORNER = 26; // pixels: the corner pieces on a board, high
const BADGE_STAR = 16; // pixels: the painted star in the points to spend, high
const MILESTONE_ICON = 20; // pixels: the milestones' painted emblem in the milestones to pick, across
const CLOSE_WIDTH = 52; // pixels: the window's close cross and its room from the corner, beside the counts
const BOARD_GAP = 10; // pixels between two boards
const SIGNATURE_WIDTH = 186; // pixels: the milestones' board
const BRANCH_WIDTH = 196; // pixels: a branch's board; the window is as wide as the ship's branches ask
// Pixels: the window at least, its boards made wider alike (a tree of one branch): room for the counts beside Close in
// words, not numbers alone
const LEAST_WIDTH = 560;
const BOARD_PAD = 10; // pixels inside a board
const EMBLEM = 18; // pixels: a board's emblem's radius
const CHIP = { width: 22, height: 15 } as const; // pixels: the count on an emblem
// Pixels between a board's head and its tree, the divider between them in the middle: its painted star (BOARD_STAR
// across) clear of both
const HEAD_GAP = 44;
const BOARD_STAR = 140;
// Pixels: the boards' names, one size on every board; the smallest they are made for a word to fit its board
const HEADING = 17;
const LEAST_HEADING = 12;
// A board's tree from its head down, pixels: the first row's middle FIRST under the head, the rows ROW apart; a row's
// gate is a mark on the mast halfway up to the row before (the signatures' first, halfway up to the head)
const FIRST = 48;
const ROW = 72;
const NODE = { frame: 20, well: 16 } as const; // pixels: a talent's medallion's radius, and its well's
// Pixels from the mast to a talent of a row of two, on a branch's board and on the signatures'; and of a row of three,
// its ranks' chip clear of the middle one
const SIDE = { branch: 52, signature: 48, three: 58 } as const;
const MAST = { width: 7, lit: 3.5, glow: 9 } as const; // pixels: the groove down a board, its light and its glow
const KNOT = 11; // pixels: a gate's diamond on the mast
const TWIG = 3; // pixels: the line from the mast to a talent of a row of two, once taken
const FOOT = 40; // pixels a board reaches under its last row's middle
const RANKS = { x: 3, y: 10, width: 28, height: 14 } as const; // pixels: the chip with a talent's ranks, off its middle
const LINK = { x: 15, y: -15, radius: 7 } as const; // pixels: the chain on a talent that needs another, off its middle
const OR = { width: 34, height: 16 } as const; // pixels: the "or" between two talents of which one can be taken
const FOCUS = { out: 4, width: 2 } as const; // pixels: the ring round the talent under the pointer
// The rope from a talent to one it needs while either is under the pointer: its bend (a share of its length), its
// width and its glow's, pixels
const ROPE = { bend: 0.18, width: 2, glow: 7 } as const;
// The halo round a talent that can be taken: rings a few pixels apart, fainter outwards, breathing together
const HALO = { rings: 3, step: 2.5, alpha: 0.2, color: THEME.title } as const;
const PULSE = 1.4; // seconds one breath of the halos takes
// A talent taken in full, in its branch's colour: its light `spread` pixels beyond its frame (takenGlow), breathing
// between `low` and full; the share of white in its frame, and of its colour in its well
const TAKEN = { spread: 13, low: 0.55, edge: 0.45, rim: 0.35 } as const;
/** A sign's alpha while its talent can't be taken: short of points, not open yet, or shut by the other of two */
const DIM = { short: 0.8, locked: 0.45, shut: 0.3 } as const;
// The card beside the talent or gate under the pointer, pixels: across, inside it, from what it tells of, between its
// parts and between its lines of what is needed
const CARD = { width: 300, pad: 14, beside: 10, gap: 10, line: 5 } as const;
const CARD_TEXT = CARD.width - CARD.pad * 2; // pixels: a line across the card, wrapped
// A count beside Close (the milestones to pick, the points to spend), pixels: high, its glow's rings, its mark's middle
// and its text's left from its left end, its room after the text, and between two counts
const BADGE = { height: 28, glow: 3, mark: 18, label: 32, end: 14, gap: 8 } as const;
/** A count's texts, longest first: the longest that leaves every count room is shown, at last the number alone */
const COUNT_FORMS = ['long', 'short', 'bare'] as const;
const RESET = { width: 210, height: 30 } as const;
const FOOTER = 18; // pixels between the boards and the reset under them
const SCROLL_TOP = 4; // pixels under the header's line where the boards scroll out of sight
const WELL = NIGHT.well; // a medallion's or an emblem's dark middle
const EDGE = NIGHT.rim; // the dark rim round a medallion
const SIGNATURE_COLOR = THEME.title;

type Glyph = (g: Graphics, size: number, color: number) => void;

/**
 * Each kind of branch's colour (its emblem, names, ranks taken) and the sign on its emblem: guns, the sea, the hull,
 * the harpoons, the officers, the gold. The captain's mastery's specializations of the same have the same colours
 */
const BRANCH_LOOKS: Readonly<Record<BranchLook, { readonly color: number; readonly glyph: Glyph }>> = {
  gunnery: { color: TREE_COLORS.guns, glyph: drawBroadside },
  seamanship: { color: TREE_COLORS.sea, glyph: drawSail },
  hull: { color: TREE_COLORS.hull, glyph: drawWrench },
  harpoons: { color: TREE_COLORS.harpoons, glyph: drawHarpoonSign },
  command: { color: TREE_COLORS.command, glyph: (g, size, color) => drawStar(g, size * 0.45, color) },
  treasure: { color: TREE_COLORS.gold, glyph: (g, size) => drawCoin(g, size * 0.36) },
};

const SIGNATURE_GLYPH: Glyph = (g, size, color) => drawStar(g, size * 0.45, color);

export interface TalentActions {
  /** Takes a talent (a rank of a branch talent, or a signature talent); false if it can't */
  learnTalent: (id: TalentId) => boolean;
  /** Forgets every talent at the shipwright's, for doubloons; false if not in port or short of them */
  resetTalents: () => boolean;
}

/**
 * How a talent stands for the ship: taken in full, some ranks and more to take now, some ranks and no more now, open
 * to take, open but no point to spend, its row or what it needs not reached yet, or shut by the other of two
 */
type NodeState = 'full' | 'more' | 'some' | 'open' | 'short' | 'locked' | 'shut';

/** A talent's medallion on a board */
interface Node {
  readonly kind: 'node';
  readonly talent: Talent;
  /** Its branch's colour, the signatures' gold */
  readonly color: number;
  readonly glyph: Glyph;
  /**
   * Its middle in the panel's pixels, its boards not scrolled (the window's body): where the ropes to what it needs and
   * what needs it end
   */
  readonly x: number;
  readonly y: number;
  readonly container: Container;
  readonly halo: Graphics;
  /** The line from the mast to it, in a row of two: where it starts and ends across its board */
  readonly twig: { readonly g: Graphics; readonly from: number; readonly to: number; readonly y: number } | null;
  readonly disc: Graphics;
  /** Its painted icon in its well, once the icons have loaded and if it has one; till then its branch's sign */
  readonly icon: Sprite;
  readonly sign: Graphics;
  /** A branch talent's ranks: the chip at its foot */
  readonly ranks: { readonly back: Graphics; readonly label: Text } | null;
  state: NodeState;
  /** The state and rank it was painted for */
  drawn: string;
}

/** A gate on a mast: the diamond with what opens the row under it, lit once it is open */
interface Gate {
  readonly kind: 'gate';
  readonly color: number;
  readonly diamond: Graphics;
  readonly label: Text;
  /** Its middle in the panel's pixels, its boards not scrolled (the window's body), for the card beside it */
  readonly x: number;
  readonly y: number;
  /** For the card: what it is, where, and what opens it */
  readonly title: string;
  readonly where: string;
  readonly about: string;
  readonly needs: (ship: Ship) => { readonly text: string; readonly met: boolean };
  drawn: boolean | null;
}

/** A point of a mast: the gate's mark, the row it opens, and what the mast's count must reach for it */
interface Stop {
  readonly knot: number;
  readonly row: number;
  readonly need: number;
}

/**
 * The line down a board, from its head to its last row, filling with its count (a branch's points spent, the ship's
 * level for the signatures): up to a gate's mark as it nears what opens it, then on to the row it opened
 */
interface Mast {
  readonly lit: Graphics;
  readonly x: number;
  readonly top: number;
  /** Lit from the top down to here before anything is counted: to a branch's first row, open from the start */
  readonly from: number;
  /** The count at `from` */
  readonly base: number;
  readonly stops: readonly Stop[];
  readonly color: number;
  readonly count: (ship: Ship) => number;
  drawn: number;
}

/** A board: its back, the light round its talents under them and their twigs, and the rest over them */
interface Board {
  readonly container: Container;
  readonly back: Graphics;
  readonly glows: Container;
  readonly twigs: Container;
  /** Its top left corner in the panel's pixels */
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/**
 * A board's emblem, or the milestones' on their count: its painted icon, `size` pixels across, once the icons have
 * loaded, its sign till then
 */
interface Emblem {
  readonly id: TalentEmblemId;
  readonly icon: Sprite;
  readonly sign: Graphics;
  readonly size: number;
}

/** A count beside Close, while there is some: the milestones to pick, or the talent points to spend */
interface Count {
  readonly container: Container;
  readonly glow: Graphics;
  readonly back: Graphics;
  readonly label: Text;
  readonly count: (ship: Ship) => number;
  /** Its text for `n`, long or short (COUNT_FORMS) */
  readonly text: (n: number, form: 'long' | 'short') => string;
}

/** A board's head as made, laid out once every board's is (settleHeads) */
interface Head {
  /** Its name, wrapped to its board */
  readonly heading: Text;
  /** What the board is for, under its name */
  readonly about: Text;
  /** Pixels across for a line of its name */
  readonly room: number;
  /** Where its emblem with the count on it ends, down the board */
  readonly emblem: number;
}

/** Where a board's tree is: its top under the head, and a row's middle */
interface Layout {
  readonly top: number;
  readonly rowY: (row: number) => number;
}

/**
 * The boards' heads laid out: every name in one size, on two lines where one is not room enough, smaller on every board
 * only while a word alone runs over its board (a translation's); what each board is for under its name. Returns where
 * the lowest head ends
 */
function settleHeads(heads: readonly Head[]) {
  // Wrapped, a line runs over only when a word alone does
  const overrun = () =>
    heads.some(({ heading, room }) => CanvasTextMetrics.measureText(heading.text, heading.style).maxLineWidth > room);
  let size = HEADING;
  while (size > LEAST_HEADING && overrun()) {
    size -= 1;
    for (const { heading } of heads) heading.style.fontSize = size;
  }
  for (const { heading, about } of heads) about.y = heading.y + heading.height;
  return Math.max(...heads.map(({ about, emblem }) => Math.max(emblem, about.y + about.height)));
}

/** A count for the header, its mark (a painted sign) before its text: hidden till there is some */
function headerCount(mark: Container, count: Count['count'], says: Count['text']): Count {
  const container = new Container();
  const glow = new Graphics();
  const back = new Graphics();
  mark.position.set(BADGE.mark, BADGE.height / 2);
  const label = text('', 14, THEME.title, { fontWeight: 'bold' });
  label.anchor.set(0, 0.5);
  label.position.set(BADGE.label, BADGE.height / 2);
  container.addChild(glow, back, mark, label);
  container.visible = false;
  return { container, glow, back, label, count, text: says };
}

/** Pixels across a count, for its text now */
function countWidth({ label }: Count) {
  return Math.ceil(label.x + label.width + BADGE.end);
}

/** A count's back of dark glass under a gold edge, and its glow, `width` pixels across */
function drawCount({ glow, back }: Count, width: number) {
  glow.clear();
  for (let i = BADGE.glow; i >= 1; i--) {
    const out = i * 2.5;
    glow
      .roundRect(-out, -out, width + out * 2, BADGE.height + out * 2, BADGE.height / 2 + out)
      .fill({ color: HALO.color, alpha: 0.32 / i });
  }
  back
    .clear()
    .roundRect(0, 0, width, BADGE.height, BADGE.height / 2)
    .fill({ color: NIGHT.glassDark, alpha: 0.95 })
    .stroke({ width: 1.5, color: THEME.title });
}

/** Two links of a chain round (0, 0), `size` pixels long */
function drawChain(g: Graphics, size: number, color: number) {
  const r = size * 0.22;
  for (const k of [-1, 1]) {
    g.roundRect(k * r * 0.55 - r, -r * 0.62 + k * r * 0.4, r * 2, r * 1.24, r * 0.62).stroke({ width: 1.6, color });
  }
}

/** How a talent stands for the ship now */
function nodeState(talent: Talent, ship: Ship): NodeState {
  const block = talentBlock(ship, talent.id);
  if (talent.kind === 'signature') {
    if (ship.hasTalent(talent.id)) return 'full';
    if (block === null) return 'open';
    return block === 'picked' ? 'shut' : 'locked';
  }
  const rank = ship.rank(talent.id);
  if (block === 'full') return 'full';
  if (block === null) return rank > 0 ? 'more' : 'open';
  if (rank > 0) return 'some';
  if (block === 'rival') return 'shut';
  return block === 'points' ? 'short' : 'locked';
}

/** Whether a talent can be taken now: a rank of it, its first or another */
function takeable(node: Node) {
  return node.state === 'open' || node.state === 'more';
}

/** What `ranks` of a branch talent give, for the player */
function rankText(talent: BranchTalent, ranks: number) {
  return t(talent.text, talentFigures(talent, ranks));
}

/** How far down a mast is lit for its count: to a gate's mark as the count nears it, on to its row once reached */
function litTo(mast: Mast, count: number) {
  let from = mast.from;
  let base = mast.base;
  for (const stop of mast.stops) {
    if (count < stop.need) return from + ((stop.knot - from) * Math.max(0, count - base)) / (stop.need - base);
    from = stop.row;
    base = stop.need;
  }
  return from;
}

/**
 * The talent tree (K), in the windows' theme: the ship's own (ships/talentTrees.ts) as a tree of medallions, each
 * talent's painted icon in one (iconAtlas.ts's TALENT_ICONS), or its branch's sign till it is painted. Down each board a mast: on the left the signature
 * talents', every ship's, every fifth level one of two, lit as the ship's level climbs; then the ship's
 * branches, one to four, every other level from 2 giving a point, spent a rank at a time. A branch's mast fills with
 * the points spent in it, and at each gate's mark (the points that open the row under it) the next row opens. Two
 * talents with "or" between them are one of two; a chain on a talent says it needs one of another branch, a rope to it
 * showing which while either is under the pointer. A talent that can be taken now glows; one taken in full shines in
 * its branch's colour; its ranks are on the chip at its foot. A card beside the talent or gate under the pointer tells
 * all about it, in a size to read. Taller than the screen (the milestones of a high tier's ship), the boards scroll under
 * the header, with the mouse wheel or the bar beside them, the reset staying at the window's foot.
 * A click takes a talent once the player says yes; while the story asks for one, the first that can be taken is lit
 * and all else dimmed round it, the gold pointer clicking it (StoryGuide), and Yes is lit in the question too.
 * Only what the ship's class can reach is shown: the starter sloop, up to level 10, has the
 * milestones 5 and 10. The shipwright forgets them all at once for doubloons, a level of the ship's a doubloon, in
 * port, once the player says yes. Closed by Close, Escape, K or a click beside it
 */
export class TalentPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  /** Pixels across, before scaling down to fit the screen: as many branches as the ship has */
  private readonly width: number;
  private readonly tree: TalentTree;
  private readonly milestones: readonly number[];
  /** Beside Close, apart: the milestones to pick, the points to spend */
  private readonly counts: readonly Count[];
  private readonly chips: { readonly label: Text; readonly count: (ship: Ship) => number }[] = [];
  private readonly emblems: Emblem[] = [];
  private readonly nodes: Node[] = [];
  private readonly byId = new Map<TalentId, Node>();
  private readonly gates: Gate[] = [];
  private readonly masts: Mast[] = [];
  /** Over the boards: the ring round what is under the pointer, and the ropes to what it needs */
  private readonly focus = new Graphics();
  private readonly ropes = new Graphics();
  /** The card beside the talent or gate under the pointer: all about it, in a size to read */
  private readonly card = new Container();
  private readonly cardBack = new Graphics();
  private readonly cardTitle = subheading('', 17);
  private readonly cardWhere = text('', 12, NIGHT.dim, { wordWrap: true, wordWrapWidth: CARD_TEXT });
  private readonly cardRule = new Graphics();
  private readonly cardBody = text('', 14, THEME.text, { wordWrap: true, wordWrapWidth: CARD_TEXT, lineHeight: 20 });
  /** What a talent needs, a line a need, each lit as it is met */
  private readonly cardNeeds = [0, 1, 2].map(() =>
    text('', 13, NIGHT.dim, { wordWrap: true, wordWrapWidth: CARD_TEXT, lineHeight: 18 }),
  );
  private readonly cardStatus = text('', 13, UI.good, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: CARD_TEXT });
  /** Pixels of the boards scrolled past when the card was last shown: scrolled since, the card goes */
  private scrolledAt = 0;
  private hovered: Node | Gate | null = null;
  /** What the card, the ring and the ropes were drawn for */
  private shown = '';
  /** The ship's talents and level the tree was painted for */
  private painted = '';
  private readonly reset: Tile;
  private readonly resetText: Text;
  private readonly message = text('', 12, NIGHT.dim);
  /** Pixels across to the title's right end: the counts keep clear of it */
  private readonly titleRight: number;
  /** The counts they were drawn for */
  private countsFor = '';
  /** The message is the last reset's: it stays up till the panel is closed */
  private said = false;
  private clock = 0;
  /** What forgetting the talents costs now, in doubloons: for the question before it */
  private price = 0;
  /** The player's ship as of the last frame: whether a talent clicked can be taken, and what it would give */
  private ship: Ship | null = null;
  /** The story asking for a talent: the one to take lit for a new player, under the card */
  private readonly guide: StoryGuide;
  private guided = false;
  private readonly guideSays = t('Click the talent to take it');
  private readonly actions: TalentActions;
  private readonly ask: (question: Question, onYes: () => void) => void;

  /**
   * shipClass: the player's ship's, whose tree it shows and whose last level sets how much of the signatures; ask:
   * the HUD's question before a talent is taken, and before they are all forgotten, for doubloons
   */
  constructor(
    actions: TalentActions,
    screen: Rectangle,
    shipClass: ShipClass,
    ask: (question: Question, onYes: () => void) => void,
  ) {
    this.actions = actions;
    this.ask = ask;
    const { maxLevel } = shipClass;
    const tree = talentTree(shipClass.id);
    this.tree = tree;
    const milestones = MILESTONES.filter((m) => m <= maxLevel);
    this.milestones = milestones;
    const boardsWidth = SIGNATURE_WIDTH + tree.branches.length * (BOARD_GAP + BRANCH_WIDTH);
    const wider = Math.max(0, LEAST_WIDTH - PAD * 2 - boardsWidth) / (tree.branches.length + 1);
    const signatureWidth = SIGNATURE_WIDTH + wider;
    const branchWidth = BRANCH_WIDTH + wider;
    this.width = Math.max(LEAST_WIDTH, boardsWidth + PAD * 2);

    // The header: the title, the counts and Close
    const header = nightHeader(this.width, PAD, t('Talents'), { rule: HEADER.rule });
    this.titleRight = header.title.x + header.title.width;
    const divider = PAD + HEADER.rule;
    const top = divider + HEADER.boards;

    const branchX = PAD + signatureWidth + BOARD_GAP;
    const signatures = boardAt(PAD, top, signatureWidth);
    const branches = tree.branches.map((_, i) => boardAt(branchX + i * (branchWidth + BOARD_GAP), top, branchWidth));
    const heads = [
      this.head(
        signatures,
        t('Milestones'),
        t('One of two at levels {levels}', { levels: milestones.join(', ') }),
        SIGNATURE_COLOR,
        SIGNATURE_GLYPH,
        'signatures',
        (ship) => milestones.filter((m) => signatureChoices(m).some((s) => ship.hasTalent(s.id))).length,
      ),
      ...tree.branches.map((branch, i) =>
        this.head(
          branches[i],
          t(branch.name),
          t(branch.text),
          BRANCH_LOOKS[branch.look].color,
          BRANCH_LOOKS[branch.look].glyph,
          `${shipClass.id}/${branch.key}`,
          (ship) => pointsSpent(ship, branch.key),
        ),
      ),
    ];
    const head = settleHeads(heads) + HEAD_GAP;
    const layout: Layout = { top: head, rowY: (row) => head + FIRST + row * ROW };
    const bottom = Math.max(
      this.buildSignatures(signatures, layout),
      ...tree.branches.map((branch, i) => this.buildBranch(branches[i], branch, layout)),
    );
    const boardHeight = bottom + BOARD_PAD;
    for (const { container, back, width } of [signatures, ...branches]) {
      drawNightCard(back, width, boardHeight);
      const line = placed(nightDivider(width - 28, BOARD_STAR), 14, head - HEAD_GAP / 2);
      container.addChildAt(nightCorners(width, boardHeight, BOARD_CORNER, 'corner1', 2), 1);
      container.addChildAt(line, 1);
    }
    this.buildCard();

    const footer = top + boardHeight + FOOTER;
    const height = footer + RESET.height + PAD;
    // Taller than the screen, the boards scroll between the header's line and the reset
    const scroll = { top: divider + SCROLL_TOP, bottom: height - (top + boardHeight + FOOTER / 2) };
    const size = { width: this.width, height, pad: PAD, scroll };
    this.window = new HudWindow(screen, size, () => this.hide(), NIGHT_WINDOW);
    this.container = this.window.container;

    // The milestones' count wears their board's emblem, in a gold ring
    const milestoneSign = new Graphics();
    SIGNATURE_GLYPH(milestoneSign, MILESTONE_ICON, SIGNATURE_COLOR);
    const milestoneMark = new Container();
    milestoneMark.addChild(
      this.emblemIcon('signatures', MILESTONE_ICON, milestoneSign),
      milestoneSign,
      new Graphics().circle(0, 0, MILESTONE_ICON / 2).stroke({ width: 1.5, color: THEME.title }),
    );
    this.counts = [
      headerCount(milestoneMark, milestonesToPick, (n, form) =>
        form === 'long'
          ? t('{n} milestone to pick|{n} milestones to pick', { n })
          : t('{n} milestone|{n} milestones', { n }),
      ),
      headerCount(ornament('star4Small', { height: BADGE_STAR }), pointsToSpend, (n, form) =>
        form === 'long' ? t('{n} point to spend|{n} points to spend', { n }) : t('{n} point|{n} points', { n }),
      ),
    ];

    const reset = moonButton(RESET.width, RESET.height, '', () => this.askForget(), 13);
    this.reset = reset.tile;
    this.resetText = reset.text;
    this.reset.container.position.set(NIGHT_CORNER_REACH, footer);
    this.message.anchor.set(0, 0.5);
    // On a narrow tree's window in two lines, clear of the corner piece
    this.message.style.wordWrap = true;
    this.message.style.wordWrapWidth = this.width - NIGHT_CORNER_REACH * 2 - RESET.width - 14;
    this.message.position.set(NIGHT_CORNER_REACH + RESET.width + 14, footer + RESET.height / 2);
    this.focus.visible = false;
    this.guide = new StoryGuide({ width: this.width });
    this.window.panel.addChild(
      header.container,
      ...this.counts.map((c) => c.container),
      this.guide.container,
      this.card,
    );
    this.window.body.addChild(signatures.container, ...branches.map((b) => b.container), this.ropes, this.focus);
    this.window.foot.addChild(this.reset.container, this.message);
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.open();
  }

  hide() {
    this.container.visible = false;
    this.said = false;
    this.hovered = null;
  }

  /** dt: seconds since the last frame, for the halos; guided: the story asks for a talent (storyCue) */
  update(ship: Ship, player: Player, dt: number, guided: boolean) {
    this.guided = guided;
    if (!this.isOpen) return;
    this.ship = ship;
    this.window.fit();
    this.clock = (this.clock + dt) % PULSE;
    const breath = 0.45 + 0.55 * Math.sin((this.clock / PULSE) * Math.PI) ** 2;
    this.header(ship, breath);
    // The boards scrolled under a still pointer: what was under it may not be now, till it moves
    if (this.window.scrolled !== this.scrolledAt) {
      this.scrolledAt = this.window.scrolled;
      this.hovered = null;
    }

    const state = `${ship.level}:${shipTalentPoints(ship)}:${[...ship.talentRanks()].join()}`;
    if (state !== this.painted) {
      this.painted = state;
      for (const node of this.nodes) paintNode(node, ship);
      for (const mast of this.masts) paintMast(mast, ship);
      for (const gate of this.gates) paintGate(gate, ship);
      for (const chip of this.chips) show(chip.label, `${chip.count(ship)}`);
    }
    for (const node of this.nodes) {
      node.halo.alpha = node.state === 'full' ? TAKEN.low + (1 - TAKEN.low) * breath : breath;
    }
    // The first talent that can be taken now, a branch's before a milestone's
    const first =
      this.nodes.find((node) => node.talent.kind === 'branch' && takeable(node)) ?? this.nodes.find(takeable);
    const r = NODE.frame;
    this.guide.update(
      guided && first
        ? {
            kind: 'click',
            target: { container: first.container, box: { x: -r, y: -r, width: r * 2, height: r * 2 } },
            round: true,
            // Over it: under it, the note would hide the next row
            above: true,
            spotlight: true,
          }
        : null,
      this.guideSays,
      dt,
    );
    const hovered = this.hovered;
    const shown = `${state}|${hovered?.kind === 'node' ? hovered.talent.id : (hovered?.title ?? '')}`;
    if (shown !== this.shown) {
      this.shown = shown;
      this.describe(ship, hovered);
    }

    const price = respecPrice(ship);
    this.price = price;
    show(
      this.resetText,
      price > 0
        ? t('Forget them all: {n} doubloon|Forget them all: {n} doubloons', { n: price })
        : t('Nothing to forget'),
    );
    this.reset.setLook({ disabled: !ship.docked || price === 0 || player.doubloons < price });
    if (this.said) return;
    show(this.message, ship.docked ? t('The shipwright retrains the crew') : t('Only in port'));
    tint(this.message, NIGHT.dim);
  }

  private open() {
    this.container.visible = true;
    this.said = false;
    this.shown = '';
    TALENT_ICONS.load(() => this.showIcons());
  }

  /** The talents' painted icons, once their atlas has loaded: the medallions are painted again with them */
  private showIcons() {
    for (const node of this.nodes) {
      const texture = TALENT_ICONS.get(node.talent.id);
      if (!texture) continue;
      node.icon.texture = texture;
      node.icon.setSize((NODE.well + 1) * 2);
      node.drawn = '';
    }
    for (const { id, icon, sign, size } of this.emblems) {
      const texture = TALENT_ICONS.get(id);
      if (!texture) continue;
      icon.texture = texture;
      icon.setSize(size);
      icon.visible = true;
      sign.visible = false;
    }
    this.painted = '';
  }

  /**
   * The milestones to pick and the points to spend beside Close, apart, each while there is some, breathing: the long
   * texts where they fit between the title and Close, else the short ones, or the numbers alone (a narrow tree's window)
   */
  private header(ship: Ship, breath: number) {
    const ns = this.counts.map((c) => c.count(ship));
    for (const c of this.counts) c.glow.alpha = breath;
    const key = ns.join();
    if (key === this.countsFor) return;
    this.countsFor = key;
    const shown = this.counts.flatMap((c, i) => {
      const n = ns[i] ?? 0;
      c.container.visible = n > 0;
      return n > 0 ? [{ c, n }] : [];
    });
    const right = this.width - PAD - CLOSE_WIDTH - 16;
    const room = right - this.titleRight - 16;
    for (const form of COUNT_FORMS) {
      for (const { c, n } of shown) show(c.label, form === 'bare' ? `${n}` : c.text(n, form));
      const width = shown.reduce((sum, { c }) => sum + countWidth(c) + BADGE.gap, -BADGE.gap);
      if (width <= room) break;
    }
    // Laid from the left end of their row, which ends at Close
    let x = right - shown.reduce((sum, { c }) => sum + countWidth(c) + BADGE.gap, -BADGE.gap);
    for (const { c } of shown) {
      const width = countWidth(c);
      drawCount(c, width);
      c.container.position.set(x, PAD);
      x += width + BADGE.gap;
    }
  }

  /** An emblem's painted icon round (0, 0), `size` pixels across, `sign` standing in for it till the icons have loaded */
  private emblemIcon(id: TalentEmblemId, size: number, sign: Graphics) {
    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.visible = false;
    this.emblems.push({ id, icon, sign, size });
    return icon;
  }

  /**
   * A board's head: its emblem with a count on it (`count`), its name in its colour and what it is for, laid out once
   * every board's head is made (settleHeads). The emblem is a brass ring round a dark well lit in its colour, its sign
   * in it till its painted icon (`emblem`) goes over the well
   */
  private head(
    board: Board,
    name: string,
    about: string,
    color: number,
    glyph: Glyph,
    emblem: TalentEmblemId,
    count: (ship: Ship) => number,
  ): Head {
    const middle = BOARD_PAD + EMBLEM + 2;
    const well = new Graphics()
      .circle(0, 0, EMBLEM)
      .fill({ color: WELL })
      .circle(0, 0, EMBLEM - 2)
      .fill(glowFill(color));
    const sign = new Graphics().circle(0, 0, EMBLEM - 5).stroke({ width: 1, color, alpha: 0.5 });
    glyph(sign, EMBLEM * 1.1, color);
    // Its edge under the brass ring
    const icon = this.emblemIcon(emblem, (EMBLEM - 1) * 2, sign);
    const ring = new Graphics().circle(0, 0, EMBLEM).stroke({ width: 3, color: THEME.brass });
    const disc = new Container();
    disc.position.set(middle, middle);
    disc.addChild(well, icon, sign, ring);
    const chip = new Graphics()
      .roundRect(middle + EMBLEM * 0.35, middle + EMBLEM * 0.45, CHIP.width, CHIP.height, 4)
      .fill({ color })
      .stroke({ width: 1, color: THEME.brassDark });
    const label = text('0', 11, THEME.darkText, { fontWeight: 'bold' });
    label.anchor.set(0.5);
    label.position.set(middle + EMBLEM * 0.35 + CHIP.width / 2, middle + EMBLEM * 0.45 + CHIP.height / 2);
    this.chips.push({ label, count });
    const x = middle + EMBLEM + 14;
    const room = board.width - x - BOARD_PAD;
    const heading = subheading(name, HEADING);
    tint(heading, color);
    // A long name on two lines, not run into the next board
    heading.style.wordWrap = true;
    heading.style.wordWrapWidth = room;
    heading.position.set(x, BOARD_PAD - 1);
    const line = text(about, 11, NIGHT.dim, { wordWrap: true, wordWrapWidth: room });
    line.x = x;
    board.container.addChild(disc, chip, label, heading, line);
    return { heading, about: line, room, emblem: middle + EMBLEM + CHIP.height / 2 };
  }

  /**
   * The milestones down the signatures' board: a level's gate over its two talents, "or" between them, the mast lit
   * as the ship's level climbs. Returns where it ends
   */
  private buildSignatures(board: Board, layout: Layout) {
    const { milestones } = this;
    const x = board.width / 2;
    const stops = milestones.map((level, row) => {
      const y = layout.rowY(row);
      const knot = y - ROW / 2;
      this.gate(board, x, knot, SIGNATURE_COLOR, {
        label: `${level}`,
        title: t('Level {level}: one of two', { level }),
        where: t('Milestones'),
        about: t('A milestone level offers one of two signature talents instead of a point'),
        needs: (ship) => ({ text: t('Opens at level {level}', { level }), met: ship.level >= level }),
      });
      const [a, b] = signatureChoices(level);
      this.pair(board, [a, b], x, y, SIGNATURE_COLOR, SIGNATURE_GLYPH, true);
      return { knot, row: y, need: level };
    });
    const last = layout.rowY(Math.max(0, milestones.length - 1));
    this.mast(board, x, layout.top, layout.top, 1, stops, last, SIGNATURE_COLOR, (ship) => ship.level);
    return last + FOOT;
  }

  /**
   * A branch down its board: a row's gate (the points that open it) on the mast over it, its talents on the mast or
   * either side of it, "or" between two that are one of two. Returns where it ends
   */
  private buildBranch(board: Board, branch: TalentBranch, layout: Layout) {
    const { color, glyph } = BRANCH_LOOKS[branch.look];
    const x = board.width / 2;
    const last = Math.max(0, ...branch.talents.map((talent) => talent.row));
    const stops: Stop[] = [];
    for (let row = 0; row <= last; row++) {
      const inRow = branch.talents.filter((talent) => talent.row === row);
      const y = layout.rowY(row);
      const [first] = inRow;
      if (row > 0 && first) {
        const need = first.opens;
        const knot = y - ROW / 2;
        stops.push({ knot, row: y, need });
        this.gate(board, x, knot, color, {
          label: `${need}`,
          title: t('Row {row}', { row: row + 1 }),
          where: t(branch.name),
          about:
            row === last
              ? t(
                  'The last row opens once every row above it is taken in full: the line down the branch fills with the points spent and lights the mark when it opens',
                )
              : t(
                  'A row opens with points spent in its branch: the line down the branch fills with them and lights the mark when it opens',
                ),
          needs: (ship) => {
            const spent = pointsSpent(ship, branch.key);
            return {
              text: t('Needs {n} point in the branch: {spent} spent|Needs {n} points in the branch: {spent} spent', {
                n: need,
                spent,
              }),
              met: spent >= need,
            };
          },
        });
      }
      this.pair(board, inRow, x, y, color, glyph, false);
    }
    const end = layout.rowY(last);
    this.mast(board, x, layout.top, layout.rowY(0), 0, stops, end, color, (ship) => pointsSpent(ship, branch.key));
    return end + FOOT;
  }

  /**
   * A row's talents at `y` on a board: one on the mast at `x`, two either side of it, with "or" if one of two; of
   * three, the middle one on the mast and the others either side, their twigs from its frame
   */
  private pair(
    board: Board,
    talents: readonly Talent[],
    x: number,
    y: number,
    color: number,
    glyph: Glyph,
    signature: boolean,
  ) {
    const [a, b, c] = talents;
    if (!a) return;
    if (!b) {
      this.node(board, a, x, y, color, glyph, null);
      return;
    }
    if (c) {
      this.node(board, b, x, y, color, glyph, null);
      this.node(board, a, x - SIDE.three, y, color, glyph, x - NODE.frame);
      this.node(board, c, x + SIDE.three, y, color, glyph, x + NODE.frame);
      return;
    }
    const side = signature ? SIDE.signature : SIDE.branch;
    const rivals = signature || (a.kind === 'branch' && a.rival === b.id);
    const from = rivals ? OR.width / 2 : MAST.width / 2;
    this.node(board, a, x - side, y, color, glyph, x - from);
    this.node(board, b, x + side, y, color, glyph, x + from);
    if (rivals) board.container.addChild(orBadge(x, y));
  }

  /**
   * A talent's medallion at (x, y) on a board: on the mast (`twig` null) or off it, a twig from the mast (from
   * `twig` across) to it. The card tells all about it while the pointer is on it; a click takes it
   */
  private node(board: Board, talent: Talent, x: number, y: number, color: number, glyph: Glyph, twig: number | null) {
    const container = new Container();
    container.position.set(x, y);
    const halo = new Graphics();
    halo.position.set(x, y);
    board.glows.addChild(halo);
    let line: Node['twig'] = null;
    if (twig !== null) {
      const g = new Graphics();
      board.twigs.addChild(g);
      line = { g, from: twig, to: x + Math.sign(twig - x) * NODE.frame, y };
    }
    const disc = new Graphics();
    const icon = new Sprite();
    icon.anchor.set(0.5);
    const sign = new Graphics();
    container.addChild(disc, icon, sign);

    let ranks: Node['ranks'] = null;
    if (talent.kind === 'branch') {
      const back = new Graphics();
      back.position.set(RANKS.x, RANKS.y);
      const label = text('', 10, NIGHT.dim, { fontWeight: 'bold' });
      label.anchor.set(0.5);
      label.position.set(RANKS.x + RANKS.width / 2, RANKS.y + RANKS.height / 2);
      container.addChild(back, label);
      ranks = { back, label };
    }
    if (talent.kind === 'branch' && talent.needs) {
      const needed = talentOf(talent.needs.id);
      const look = needed.kind === 'branch' ? this.lookOf(needed.branch) : null;
      const chain = new Graphics()
        .circle(0, 0, LINK.radius)
        .fill({ color: WELL })
        .stroke({ width: 1.5, color: look?.color ?? THEME.brass });
      drawChain(chain, LINK.radius * 2, THEME.brassLight);
      chain.position.set(LINK.x, LINK.y);
      container.addChild(chain);
    }

    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.hitArea = new Circle(0, 0, NODE.frame + 3);
    const node: Node = {
      kind: 'node',
      talent,
      color,
      glyph,
      x: board.x + x,
      y: board.y + y,
      container,
      halo,
      twig: line,
      disc,
      icon,
      sign,
      ranks,
      state: 'locked',
      drawn: '',
    };
    // Clicks on the window never reach the stage, which would steer the ship
    container.on('pointerdown', (e) => e.stopPropagation());
    container.on('pointerover', () => {
      this.hovered = node;
    });
    container.on('pointerout', () => {
      if (this.hovered === node) this.hovered = null;
    });
    container.on('pointertap', () => this.askTake(talent));
    board.container.addChild(container);
    this.nodes.push(node);
    this.byId.set(talent.id, node);
    return node;
  }

  /** A gate's diamond on a mast at (x, y), its label what opens it; the card tells of it */
  private gate(
    board: Board,
    x: number,
    y: number,
    color: number,
    about: Pick<Gate, 'title' | 'where' | 'about' | 'needs'> & { readonly label: string },
  ) {
    const container = new Container();
    container.position.set(x, y);
    const diamond = new Graphics();
    const { label: mark, ...told } = about;
    const label = text(mark, 10, NIGHT.dim, { fontWeight: 'bold' });
    label.anchor.set(0.5);
    container.addChild(diamond, label);
    const gate: Gate = { kind: 'gate', color, diamond, label, x: board.x + x, y: board.y + y, ...told, drawn: null };
    container.eventMode = 'static';
    container.hitArea = new Circle(0, 0, KNOT + 3);
    container.on('pointerdown', (e) => e.stopPropagation());
    container.on('pointerover', () => {
      this.hovered = gate;
    });
    container.on('pointerout', () => {
      if (this.hovered === gate) this.hovered = null;
    });
    board.container.addChild(container);
    this.gates.push(gate);
  }

  /** A board's mast at `x`, from `top` to `end`, its groove drawn now and its light as its count goes */
  private mast(
    board: Board,
    x: number,
    top: number,
    from: number,
    base: number,
    stops: readonly Stop[],
    end: number,
    color: number,
    count: (ship: Ship) => number,
  ) {
    const groove = new Graphics()
      .roundRect(x - MAST.width / 2, top, MAST.width, end - top, MAST.width / 2)
      .fill({ color: WELL, alpha: 0.9 })
      .stroke({ width: 1, color: THEME.brass, alpha: 0.35 });
    const lit = new Graphics();
    // Under the twigs, the glows and the talents: the board's first children after its back
    board.container.addChildAt(lit, 1);
    board.container.addChildAt(groove, 1);
    this.masts.push({ lit, x, top, from, base, stops, color, count, drawn: -1 });
  }

  /** The card's parts, laid out down it as it is shown */
  private buildCard() {
    this.card.eventMode = 'none';
    this.card.visible = false;
    for (const part of [this.cardTitle, this.cardWhere, this.cardBody, ...this.cardNeeds, this.cardStatus]) {
      part.x = CARD.pad;
    }
    this.cardTitle.style.wordWrap = true;
    this.cardTitle.style.wordWrapWidth = CARD_TEXT;
    this.cardTitle.y = CARD.pad;
    this.card.addChild(
      this.cardBack,
      this.cardTitle,
      this.cardWhere,
      this.cardRule,
      this.cardBody,
      ...this.cardNeeds,
      this.cardStatus,
    );
  }

  /** The card beside what is under the pointer, the ring round a talent and the ropes to what it needs */
  private describe(ship: Ship, hovered: Node | Gate | null) {
    this.focus.clear();
    this.ropes.clear();
    this.focus.visible = hovered?.kind === 'node';
    this.card.visible = hovered !== null;
    if (!hovered) return;
    const lines: { readonly text: string; readonly color: number }[] = [];
    let status: { readonly text: string; readonly color: number } | null = null;
    if (hovered.kind === 'node') {
      this.focus
        .circle(hovered.x, hovered.y, NODE.frame + FOCUS.out)
        .stroke({ width: FOCUS.width, color: THEME.title });
      this.drawRopes(ship, hovered);
      const { talent } = hovered;
      show(this.cardTitle, t(talent.name));
      show(this.cardWhere, this.whereOf(talent));
      show(this.cardBody, this.bodyOf(talent, ship));
      lines.push(...this.needsOf(talent, ship));
      status = statusOf(talent, ship);
    } else {
      show(this.cardTitle, hovered.title);
      show(this.cardWhere, hovered.where);
      show(this.cardBody, hovered.about);
      const { text: need, met } = hovered.needs(ship);
      lines.push({ text: need, color: ok(met) });
    }
    tint(this.cardTitle, hovered.color);

    // Laid out down the card: its title, where it is, a rule, what it gives, what it needs, what a click does
    this.cardWhere.y = this.cardTitle.y + this.cardTitle.height + 2;
    const rule = this.cardWhere.y + this.cardWhere.height + CARD.gap;
    this.cardRule.clear().rect(CARD.pad, rule, CARD_TEXT, 1).fill({ color: THEME.brass, alpha: 0.4 });
    this.cardBody.y = rule + CARD.gap;
    let bottom = this.cardBody.y + this.cardBody.height;
    let gap: number = CARD.gap;
    this.cardNeeds.forEach((label, i) => {
      const line = lines[i];
      label.visible = line !== undefined;
      if (!line) return;
      show(label, line.text);
      tint(label, line.color);
      label.y = bottom + gap;
      bottom = label.y + label.height;
      gap = CARD.line;
    });
    this.cardStatus.visible = status !== null;
    if (status) {
      show(this.cardStatus, status.text);
      tint(this.cardStatus, status.color);
      this.cardStatus.y = bottom + CARD.gap;
      bottom = this.cardStatus.y + this.cardStatus.height;
    }
    const height = Math.ceil(bottom + CARD.pad);
    this.cardBack
      .clear()
      .roundRect(4, 5, CARD.width, height, 8)
      .fill({ color: 0x000000, alpha: 0.35 })
      .roundRect(0, 0, CARD.width, height, 6)
      .fill({ color: NIGHT.bottom });
    // Blue glass, as the boards under it, but opaque over the tree and edged brighter
    drawNightCard(this.cardBack, CARD.width, height, THEME.brass);

    // Beside what it tells of: to its right if the window has room, else to its left; from its top down, in the window
    // as drawn, the boards as scrolled
    const reach = hovered.kind === 'node' ? NODE.frame + FOCUS.out : KNOT;
    const right = hovered.x + reach + CARD.beside;
    const x = right + CARD.width <= this.width - PAD / 2 ? right : hovered.x - reach - CARD.beside - CARD.width;
    const top = hovered.y - this.window.scrolled - reach;
    const y = Math.min(Math.max(top, PAD / 2), this.window.shownHeight - PAD / 2 - height);
    this.card.position.set(Math.round(Math.max(PAD / 2, x)), Math.round(y));
  }

  /** Where a talent is in the tree, for the card: its branch and row, or its milestone */
  private whereOf(talent: Talent) {
    if (talent.kind === 'signature') {
      const ability = talent.active ? ` · ${t('Ability')}` : '';
      return `${t('Milestones')} · ${t('Level {level}', { level: talent.level })}${ability}`;
    }
    const branch = this.tree.branches.find((b) => b.key === talent.branch);
    return t('{branch} · row {row}', { branch: branch ? t(branch.name) : '', row: talent.row + 1 });
  }

  /** What a talent gives: a ranked one's now, with its next rank and in full */
  private bodyOf(talent: Talent, ship: Ship) {
    if (talent.kind === 'signature') return t(talent.text, talent.figures);
    if (talent.maxRank === 1) return rankText(talent, 1);
    const rank = ship.rank(talent.id);
    const lines = [t('Rank {rank} of {max}', { rank, max: talent.maxRank })];
    if (rank > 0) lines.push(t('Now: {effect}', { effect: rankText(talent, rank) }));
    if (rank < talent.maxRank) lines.push(t('Next rank: {effect}', { effect: rankText(talent, rank + 1) }));
    if (rank + 1 < talent.maxRank) lines.push(t('In full: {effect}', { effect: rankText(talent, talent.maxRank) }));
    return lines.join('\n');
  }

  /** What a talent needs, a line each, lit as met: its row's points, a talent of another branch; the other of two */
  private needsOf(talent: Talent, ship: Ship) {
    const lines: { text: string; color: number }[] = [];
    if (talent.kind === 'signature') {
      lines.push({ text: t('Opens at level {level}', { level: talent.level }), color: ok(ship.level >= talent.level) });
      const other = signatureChoices(talent.level).find((s) => s.id !== talent.id);
      if (other) lines.push(rivalLine(other, ship));
      return lines;
    }
    const need = talent.opens;
    if (need > 0) {
      const spent = pointsSpent(ship, talent.branch);
      const label = t('Needs {n} point in the branch: {spent} spent|Needs {n} points in the branch: {spent} spent', {
        n: need,
        spent,
      });
      lines.push({ text: label, color: ok(spent >= need) });
    }
    if (talent.needs) {
      const have = ship.rank(talent.needs.id);
      const label = t('Needs {talent}: {n} rank, {have} taken|Needs {talent}: {n} ranks, {have} taken', {
        talent: t(talentOf(talent.needs.id).name),
        n: talent.needs.rank,
        have,
      });
      lines.push({ text: label, color: ok(have >= talent.needs.rank) });
    }
    if (talent.rival !== null) lines.push(rivalLine(talentOf(talent.rival), ship));
    return lines;
  }

  /** The ropes from the talent under the pointer to the one it needs, and to those that need it */
  private drawRopes(ship: Ship, node: Node) {
    const { talent } = node;
    if (talent.kind === 'branch' && talent.needs) {
      const needed = this.byId.get(talent.needs.id);
      if (needed) drawRope(this.ropes, needed, node, ship.rank(needed.talent.id) >= talent.needs.rank);
    }
    for (const other of this.nodes) {
      const needs = other.talent.kind === 'branch' ? other.talent.needs : null;
      if (needs?.id === talent.id) {
        drawRope(this.ropes, node, other, ship.rank(talent.id) >= needs.rank);
      }
    }
  }

  private lookOf(branchKey: string) {
    const branch = this.tree.branches.find((b) => b.key === branchKey);
    return branch ? BRANCH_LOOKS[branch.look] : null;
  }

  /**
   * Asks before a talent (a rank of it) is taken: its point comes back only when every talent is forgotten at the
   * shipwright's, for doubloons, and the other of two stays shut till then
   */
  private askTake(talent: Talent) {
    const take = () => this.actions.learnTalent(talent.id);
    const ship = this.ship;
    // What can't be taken is refused at once, with its sound, as before
    if (!ship || talentBlock(ship, talent.id) !== null) {
      take();
      return;
    }
    const lines: string[] = [];
    let yes = t('Take');
    if (talent.kind === 'signature') {
      lines.push(t(talent.text, talent.figures));
      const other = signatureChoices(talent.level).find((s) => s.id !== talent.id);
      if (other) {
        lines.push(
          t(
            'It shuts the other of the two, {talent}, till every talent of the ship is forgotten, in port, for doubloons',
            { talent: t(other.name) },
          ),
        );
      }
    } else {
      const rank = ship.rank(talent.id) + 1;
      if (talent.maxRank > 1) lines.push(t('Rank {rank} of {max}', { rank, max: talent.maxRank }));
      lines.push(rankText(talent, rank));
      lines.push(t('Its point comes back only when every talent of the ship is forgotten, in port, for doubloons'));
      if (talent.rival !== null && rank === 1) {
        lines.push(t('It shuts the other of the two, {talent}', { talent: t(talentOf(talent.rival).name) }));
      }
      yes = t('Take for {n} point|Take for {n} points', { n: 1 });
    }
    this.ask(
      { title: t('Take {name}?', { name: t(talent.name) }), text: lines.join('\n'), yes, guided: this.guided },
      take,
    );
  }

  /** Asks before every talent is forgotten: it can't be undone, and costs doubloons */
  private askForget() {
    const n = this.price;
    this.ask(
      {
        title: t('Forget the talents?'),
        text: t(
          'Every talent of the ship is forgotten and its points come back to spend again, for {n} doubloon|Every talent of the ship is forgotten and its points come back to spend again, for {n} doubloons',
          { n },
        ),
        yes: t('Forget for {n} doubloon|Forget for {n} doubloons', { n }),
      },
      () => this.forget(),
    );
  }

  private forget() {
    if (this.actions.resetTalents()) {
      show(this.message, t('Forgotten: pick again'));
      tint(this.message, UI.good);
      this.said = true;
    }
  }
}

function boardAt(x: number, y: number, width: number): Board {
  const container = new Container();
  container.position.set(x, y);
  const back = new Graphics();
  const twigs = new Container();
  const glows = new Container();
  container.addChild(back, twigs, glows);
  return { container, back, glows, twigs, x, y, width };
}

/** A part of the window put at (x, y) */
function placed<T extends Container>(part: T, x: number, y: number) {
  part.position.set(x, y);
  return part;
}

/** The "or" between two talents one of which the ship may have, a small plate round (x, y) on the mast */
function orBadge(x: number, y: number) {
  const badge = new Container();
  badge.position.set(x - OR.width / 2, y - OR.height / 2);
  const back = new Graphics()
    .roundRect(0, 0, OR.width, OR.height, OR.height / 2)
    .fill({ color: NIGHT.glassDark })
    .stroke({ width: 1, color: THEME.brass, alpha: 0.7 });
  const label = text(t('or'), 10, THEME.title, { fontWeight: 'bold', fontStyle: 'italic' });
  label.anchor.set(0.5);
  label.position.set(OR.width / 2, OR.height / 2);
  badge.addChild(back, label);
  return badge;
}

/** A need's colour: met, or not yet */
function ok(met: boolean) {
  return met ? UI.good : UI.warn;
}

/** The line for the other of two: shut if it is taken */
function rivalLine(other: Talent, ship: Ship) {
  const name = t(other.name);
  if (ship.hasTalent(other.id)) return { text: t('Shut: {talent} is taken', { talent: name }), color: UI.warn };
  return { text: t('One of two with {talent}', { talent: name }), color: NIGHT.dim };
}

/** What a click on a talent would do now, or why it does nothing */
function statusOf(talent: Talent, ship: Ship): { readonly text: string; readonly color: number } | null {
  const block = talentBlock(ship, talent.id);
  if (block === null) {
    const label = talent.kind === 'branch' && talent.maxRank > 1 ? 'Click to take a rank' : 'Click to take it';
    return { text: t(label), color: UI.good };
  }
  if (block === 'full') return { text: t('Taken in full'), color: THEME.title };
  if (block === 'picked' && ship.hasTalent(talent.id)) return { text: t('Picked'), color: THEME.title };
  if (block === 'points') return { text: t('No points to spend'), color: UI.bad };
  return null;
}

/** A rope from a talent to one that needs it, bowed a little; in the first one's colour once enough of it is taken */
function drawRope(g: Graphics, from: Node, to: Node, met: boolean) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const bend = length * ROPE.bend;
  const cx = (from.x + to.x) / 2 - (dy / length) * bend;
  const cy = (from.y + to.y) / 2 + (dx / length) * bend;
  // From frame to frame, not over the medallions
  const end = (at: Node) => {
    const ex = cx - at.x;
    const ey = cy - at.y;
    const d = Math.hypot(ex, ey) || 1;
    return { x: at.x + (ex / d) * (NODE.frame + FOCUS.out), y: at.y + (ey / d) * (NODE.frame + FOCUS.out) };
  };
  const a = end(from);
  const b = end(to);
  const color = met ? from.color : UI.warn;
  g.moveTo(a.x, a.y).quadraticCurveTo(cx, cy, b.x, b.y).stroke({ width: ROPE.glow, color, alpha: 0.22, cap: 'round' });
  g.moveTo(a.x, a.y).quadraticCurveTo(cx, cy, b.x, b.y).stroke({ width: ROPE.width, color, cap: 'round' });
  g.circle(b.x, b.y, 3.5).fill({ color });
  g.circle(from.x, from.y, NODE.frame + FOCUS.out).stroke({ width: 2, color, alpha: 0.8 });
}

/**
 * A medallion as the ship has it: taken in full (its frame in its branch's light, shining), some ranks taken (its
 * frame and its twig in its colour), open to take (glowing), short of a point, not open yet or shut by the other of
 * two (its icon darker and darker, or its sign dimmer, till it is painted)
 */
function paintNode(node: Node, ship: Ship) {
  const { talent, color, disc, halo, icon, sign, ranks, twig } = node;
  const state = nodeState(talent, ship);
  const rank = talent.kind === 'branch' ? ship.rank(talent.id) : ship.hasTalent(talent.id) ? 1 : 0;
  node.state = state;
  const key = `${state}:${rank}`;
  if (key === node.drawn) return;
  node.drawn = key;
  const full = state === 'full';
  const some = full || rank > 0;
  const edge = full
    ? mixColor(color, 0xffffff, TAKEN.edge)
    : some
      ? color
      : state === 'open'
        ? THEME.brassLight
        : state === 'short'
          ? THEME.brass
          : THEME.brassDark;
  disc
    .clear()
    .circle(0, 0, NODE.frame + 2.5)
    .fill({ color: EDGE })
    .circle(0, 0, NODE.frame)
    .fill({ color: full ? mixColor(WELL, color, TAKEN.rim) : WELL })
    .stroke({ width: 2.5, color: edge })
    .circle(0, 0, NODE.well + 1)
    .fill({ color: WELL });
  const painted = icon.texture !== Texture.EMPTY;
  icon.visible = painted;
  icon.tint = state === 'short' || state === 'locked' || state === 'shut' ? DIM_TINT[state] : 0xffffff;
  sign.clear();
  if (!painted) node.glyph(sign, NODE.well * 1.2, color);
  sign.alpha = state === 'short' ? DIM.short : state === 'locked' ? DIM.locked : state === 'shut' ? DIM.shut : 1;
  halo.clear();
  if (full) halo.circle(0, 0, NODE.frame + TAKEN.spread).fill(takenGlow(color, NODE.frame, TAKEN.spread));
  else if (state === 'open' || state === 'more') {
    for (let i = HALO.rings; i >= 1; i--) {
      halo.circle(0, 0, NODE.frame + 2 + i * HALO.step).fill({ color: HALO.color, alpha: HALO.alpha / i });
    }
  }
  node.container.alpha = state === 'shut' ? 0.7 : 1;
  if (twig) {
    twig.g.clear().moveTo(twig.from, twig.y).lineTo(twig.to, twig.y);
    if (some) twig.g.stroke({ width: TWIG, color });
    else twig.g.stroke({ width: 2, color: THEME.brassDark, alpha: 0.8 });
  }
  if (!ranks || talent.kind !== 'branch') return;
  ranks.back
    .clear()
    .roundRect(0, 0, RANKS.width, RANKS.height, RANKS.height / 2)
    .fill({ color: full ? THEME.title : rank > 0 ? color : WELL })
    .stroke({ width: 1, color: rank > 0 ? THEME.brassLight : THEME.brassDark });
  show(ranks.label, `${rank}/${talent.maxRank}`);
  tint(ranks.label, rank > 0 ? THEME.darkText : NIGHT.dim);
}

/** A mast's light down to where its count reaches, with a glow round it */
function paintMast(mast: Mast, ship: Ship) {
  const count = mast.count(ship);
  if (count === mast.drawn) return;
  mast.drawn = count;
  const to = litTo(mast, count);
  mast.lit.clear();
  if (to <= mast.top) return;
  const { x, top, color } = mast;
  mast.lit.moveTo(x, top).lineTo(x, to).stroke({ width: MAST.glow, color, alpha: 0.25, cap: 'round' });
  mast.lit.moveTo(x, top).lineTo(x, to).stroke({ width: MAST.lit, color, cap: 'round' });
}

/** A gate's diamond: lit in its colour once open, dark with its label dim till then */
function paintGate(gate: Gate, ship: Ship) {
  const open = gate.needs(ship).met;
  if (open === gate.drawn) return;
  gate.drawn = open;
  gate.diamond
    .clear()
    .poly([0, -KNOT, KNOT, 0, 0, KNOT, -KNOT, 0])
    .fill({ color: open ? gate.color : WELL })
    .stroke({ width: 1.5, color: open ? THEME.brassLight : THEME.brass, alpha: open ? 1 : 0.7 });
  tint(gate.label, open ? THEME.darkText : NIGHT.dim);
}
