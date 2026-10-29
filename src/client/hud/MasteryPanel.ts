import { Circle, Container, Graphics, Rectangle, Sprite, Text, Texture, type Point } from 'pixi.js';
import {
  CROWN_STEP,
  LEGENDARY_GATE,
  MASTERY_PASSIVES,
  MASTERY_SPECS,
  MASTERY_SPEC_IDS,
  SPECIAL_STEP,
  captainPoints,
  masteryBlock,
  masteryRespecPrice,
  masterySpent,
  type CaptainPoints,
  type GameState,
  type MasteryBlock,
  type MasteryPassive,
  type MasterySpecId,
  type PassiveTier,
} from '../../game';
import type { Question } from './ConfirmDialog';
import { MASTERY_ICONS, MINIMAP_BUTTONS } from './iconAtlas';
import {
  NIGHT,
  NIGHT_HEADER,
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
import { THEME, TITLE_STYLE, glowFill } from './theme';
import {
  HudWindow,
  UI,
  drawBroadside,
  drawCoin,
  drawHarpoonSign,
  drawSail,
  drawStar,
  show,
  text,
  tint,
  whole,
  type Tile,
} from './ui';
import { t } from '../i18n/i18n';
import type { CursorId } from '../input/cursor';
import { mixColor } from '../render/Painter3D';

const WIDTH = 1220; // pixels, before scaling down to fit the screen
const HEIGHT = 860;
const PAD = 24;
const DIVIDER = PAD + NIGHT_HEADER.rule; // the gold line under the header
const HEADER_MOON = 44; // pixels: the crescent before the title, high
const POINTS_STAR = 18; // pixels: the star before the points to spend, high
const INFO = 76; // pixels: the board at the bottom, what the passive under the pointer gives
const INFO_ICON = 28; // pixels: the radius of the passive's icon on the board
const INFO_TEXT = 14 + INFO_ICON * 2 + 14; // pixels from the board's left to its texts, right of the icon
const FORGET = { width: 230, height: 32 } as const; // pixels: the Forget button on the board's right
const GAP = 12; // pixels between the view and the divider over it and the board under it
/** Where the tree is seen, in the window */
const VIEW = {
  x: PAD,
  y: DIVIDER + GAP,
  width: WIDTH - PAD * 2,
  height: HEIGHT - DIVIDER - GAP * 2 - INFO - PAD,
};
// The tree, in its own pixels round the captain at the bottom (y up is negative): a column a specialization, COLUMN
// apart, standing on a line BUS over the captain; in a column its trunk, the three twigs LANE apart going up a ROW a
// step, their specials, and the two legendaries over the outer twigs, with room at the forks for the lines to turn
const COLUMN = 168;
const CARD_HALF = 80; // pixels: half a column's board's width
const CARD_FOOT = 26; // pixels a column's board reaches under its trunk
const LANE = 46;
const ROW = 48;
const BUS = 66;
const TRUNK = 108; // pixels from the captain up to the trunks
const FORK_ROOM = 60; // pixels from a trunk up to its twigs' first steps
const SPECIAL_ROOM = 56; // pixels from a twig's last step up to its special
const CROWN_ROOM = 76; // pixels from the specials up to the legendaries
/** Pixels over the legendaries: a column's top, its name's foot, its points' foot, the divider under them */
const HEADER = { top: 100, name: 66, points: 50, divider: 42 } as const;
const CORNER = 8; // pixels: the radius a line turns round
const CAPTAIN = 34; // pixels: the captain's disc's radius
/** The radius of a passive's painted icon by its tier, pixels */
const NODE: Readonly<Record<PassiveTier, number>> = { common: 13, improved: 14, rare: 14, special: 17, legendary: 24 };
/**
 * How far a passive's frame reaches round its icon, pixels: a ring for a common one, a wider one for an improved, a
 * diamond's points for a rare, a hexagon's for a special, a broad ring for a legendary (its rays reach BURST further)
 */
const FRAME: Readonly<Record<PassiveTier, number>> = {
  common: 15.5,
  improved: 18,
  rare: 19.5,
  special: 20.5,
  legendary: 27,
};
const BURST = 1.15;
const STEM = 2.4; // pixels: the line from the captain up to the trunks
const LINE = 1.8; // pixels: a line between two passives
const MOON_HAZE = 2.4; // pixels of the haze round a line's moonlight
const LIT_GLOW = 3; // pixels of the glow round a lit line's light
/** The lines' moonlight, opaque: its silver and the cold haze round it */
const MOON = { line: 0xb9c6d9, haze: 0x2a3240 } as const;
const EDGE = NIGHT.rim; // the dark rim round a passive
const CARD_CORNER = 26; // pixels: the corner pieces on a column's board, high
const INFO_CORNER = 22; // pixels: the corner pieces on the board under the tree, high
const COMPASS = 156; // pixels: the compass rose behind the captain, across
const COMPASS_ALPHA = 0.55;
/** The moon low in the view's right corner, under the tree: its middle (pixels from the corner), size and glow */
const MOON_SPOT = { right: 120, bottom: 64, size: 70, glow: 92, glowAlpha: 0.8, color: 0xcfe0ff } as const;
/** A constellation low in the view's left corner, under the tree */
const STARS_SPOT = { left: 150, bottom: 64, height: 92, alpha: 0.6 } as const;
// The zoom, over the one that shows the whole tree, by which the moon and the constellation have faded out: nearer,
// the tree covers the view and they would show through its boards
const BACKDROP_FADE = 1.3;
const VIEW_MARGIN = 14; // pixels between the tree as it opens and the view's edge
const ZOOM = { step: 1.15, most: 2.6, least: 0.8 } as const; // a wheel notch; the nearest; the farthest, of the fit
const TAP_SLOP = 5; // pixels the pointer may move between down and up for a click, not a drag
const WELL = NIGHT.well; // a passive's dark middle
const FOCUS = 0xf3d58a; // the ring round the passive under the pointer
const PULSE = 1.6; // seconds a glow round a passive that can be taken breathes in and out
/**
 * A passive taken, so the specializations' colours show at a glance what is: its light, a soft glow `spread` pixels
 * beyond its frame (takenGlow); breathing every `pulse` seconds between `low` and full and swelling by `swell`, `climb`
 * of a breath later a step out, so the light runs up a twig; the share of white in its edge, and of its colour in the
 * dark rim round it
 */
const TAKEN = { spread: 16, pulse: 2.4, low: 0.5, swell: 0.08, climb: 0.1, edge: 0.45, rim: 0.5 } as const;
/** Each specialization's colour: its passives' light, its lit branches and its name; a ship's talents of the same alike */
const SPEC_COLORS: Readonly<Record<MasterySpecId, number>> = {
  economy: TREE_COLORS.gold,
  exploration: TREE_COLORS.exploration,
  navigation: TREE_COLORS.sea,
  artillery: TREE_COLORS.guns,
  survival: TREE_COLORS.survival,
  hunting: TREE_COLORS.harpoons,
  command: TREE_COLORS.command,
};
const TIER_NAMES: Readonly<Record<PassiveTier, string>> = {
  common: 'Common passive',
  improved: 'Improved passive',
  rare: 'Rare passive',
  special: 'Special passive',
  legendary: 'Legendary passive',
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** What the mastery window does in the game */
export interface MasteryActions {
  /** Takes a passive of the captain's mastery; false if it can't */
  takePassive: (id: string) => boolean;
  /** Forgets every passive in port, for doubloons; false if not in port or short of them */
  forgetMastery: () => boolean;
}

/** A specialization's sign, drawn in the middle of its specials and legendaries, `size` pixels */
const GLYPHS: Readonly<Record<MasterySpecId, (g: Graphics, size: number, color: number) => void>> = {
  economy: (g, size) => drawCoin(g, size * 0.36),
  exploration: drawCompass,
  navigation: drawSail,
  artillery: drawBroadside,
  survival: drawShield,
  hunting: drawHarpoonSign,
  command: (g, size, color) => drawStar(g, size * 0.45, color),
};

/** A compass rose of four points round (0, 0), `size` pixels across */
function drawCompass(g: Graphics, size: number, color: number) {
  const r = size / 2;
  const w = r * 0.28;
  g.poly([0, -r, w, -w, r, 0, w, w, 0, r, -w, w, -r, 0, -w, -w]).fill({ color });
  g.circle(0, 0, w * 0.7).fill({ color: WELL });
}

/** A heater shield round (0, 0), `size` pixels high */
function drawShield(g: Graphics, size: number, color: number) {
  const h = size / 2;
  g.moveTo(-h * 0.75, -h * 0.8)
    .lineTo(h * 0.75, -h * 0.8)
    .lineTo(h * 0.75, -h * 0.1)
    .quadraticCurveTo(h * 0.7, h * 0.6, 0, h)
    .quadraticCurveTo(-h * 0.7, h * 0.6, -h * 0.75, -h * 0.1)
    .closePath()
    .fill({ color });
}

/**
 * A passive's frame round (0, 0), reaching `r` pixels: round, a diamond for a rare one, a hexagon for a special (its
 * flat sides to the twigs beside it)
 */
function outline(g: Graphics, tier: PassiveTier, r: number) {
  if (tier === 'rare') return g.poly([0, -r, r, 0, 0, r, -r, 0]);
  if (tier === 'special') {
    const points: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = ((i - 1.5) * Math.PI) / 3;
      points.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    return g.poly(points);
  }
  return g.circle(0, 0, r);
}

/** A burst of rays behind a legendary, its frame `r` pixels round */
function drawBurst(g: Graphics, r: number, color: number, alpha: number) {
  const points: number[] = [];
  const rays = 12;
  for (let i = 0; i < rays * 2; i++) {
    const out = i % 2 === 0 ? r * BURST : r * 0.92;
    const angle = (i * Math.PI) / rays - Math.PI / 2;
    points.push(Math.cos(angle) * out, Math.sin(angle) * out);
  }
  g.poly(points).fill({ color, alpha });
}

/** How a passive stands for the player now */
type NodeState = 'taken' | 'open' | 'short' | 'locked';

function nodeState(block: MasteryBlock | null): NodeState {
  if (block === null) return 'open';
  if (block === 'taken') return 'taken';
  return block === 'locked' ? 'locked' : 'short';
}

/** A point of the tree, pixels from the captain */
interface Spot {
  readonly x: number;
  readonly y: number;
}

/** The middle of a specialization's column, pixels across from the captain */
function columnX(spec: MasterySpecId) {
  return (MASTERY_SPEC_IDS.indexOf(spec) - (MASTERY_SPEC_IDS.length - 1) / 2) * COLUMN;
}

/** How high a step's row is: pixels from the captain, up being negative */
function rowY(step: number): number {
  if (step === 0) return -TRUNK;
  if (step === CROWN_STEP) return rowY(SPECIAL_STEP) - CROWN_ROOM;
  if (step === SPECIAL_STEP) return rowY(SPECIAL_STEP - 1) - SPECIAL_ROOM;
  return -TRUNK - FORK_ROOM - (step - 1) * ROW;
}

/** Where a passive is: its twig's lane, the trunk in the middle, a legendary over an outer twig */
function place(passive: MasteryPassive): Spot {
  const lane = passive.place === 'trunk' ? 0 : passive.place === 'crown' ? passive.branch * 2 - 1 : passive.branch - 1;
  return { x: columnX(passive.spec) + lane * LANE, y: rowY(passive.step) };
}

/** A line from one point up to another: straight when one is over the other, else across at `turnY` */
function elbow(from: Spot, to: Spot, turnY: number): Spot[] {
  if (from.x === to.x) return [from, to];
  return [from, { x: from.x, y: turnY }, { x: to.x, y: turnY }, to];
}

/**
 * The box round the whole tree, pixels from the captain: the columns' boards and the captain. Worked out from the
 * layout, not the tree's bounds: a masked container's are cut to its mask
 */
function treeBounds() {
  const half = ((MASTERY_SPEC_IDS.length - 1) / 2) * COLUMN + CARD_HALF;
  const top = rowY(CROWN_STEP) - HEADER.top;
  return new Rectangle(-half, top, half * 2, CAPTAIN + 6 - top);
}

const TREE_BOUNDS = treeBounds();

/** Where the tree (the captain) is in the view with the whole of it in sight at `zoom` */
function fitPosition(zoom: number) {
  const bounds = TREE_BOUNDS;
  return {
    x: VIEW.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: VIEW.height / 2 - (bounds.y + bounds.height / 2) * zoom,
  };
}

/** A passive's name: a twig's steps by their number */
function passiveName(passive: MasteryPassive) {
  return passive.place === 'twig' ? `${t(passive.name)} ${ROMAN[passive.step - 1]}` : t(passive.name);
}

/** What a passive gives, for the player */
function passiveText(passive: MasteryPassive) {
  return t(passive.text, passive.figures);
}

interface Node {
  readonly passive: MasteryPassive;
  readonly container: Container;
  readonly disc: Graphics;
  /** Its glow, in a layer under every passive: a wide one never covers a neighbour's icon */
  readonly halo: Graphics;
  /** Its painted icon, empty until the atlas has loaded; then the ring round it, and its sign until then */
  readonly icon: Sprite;
  readonly ring: Graphics;
  readonly glyph: Graphics;
  /** The state it was drawn in */
  drawn: NodeState | null;
}

/** A line from one passive (or the captain) to the next: lit in its specialization's colour once it is taken */
interface Branch {
  readonly to: MasteryPassive;
  /** Its corners, from where it grows to where it leads */
  readonly path: readonly Spot[];
  /** The part of it lit once it is taken */
  readonly lit: readonly Spot[];
  readonly width: number;
}

/**
 * The captain's mastery (P, or the captain on the minimap's frame): the account's passives for every ship the player
 * sails, as a tree. The captain at the bottom, seven specializations side by side in columns on a line out of them,
 * each a trunk forking into three twigs of five steps up, a special at the end of each and two legendaries at the
 * top, joined by straight lines, every passive its painted icon in a frame of its tier; what can be taken now glows,
 * a click asks and takes it, a line lights up in its colour once what it leads to is taken. The points come from every tenth
 * level of every ship and from feats (a window of their own). Dragged to look round the tree, the mouse wheel brings
 * it nearer; forgotten in port for doubloons. Closed by its gold cross, Escape, P or a click beside it
 */
export class MasteryPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly actions: MasteryActions;
  private readonly ask: (question: Question, onYes: () => void) => void;
  private readonly points = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 18 } });
  /** The view's window onto the tree, and the tree in it, moved and scaled */
  private readonly view = new Container();
  /** The moon and a constellation under the tree, fading out as it is brought nearer */
  private readonly backdrop = new Container();
  private readonly tree = new Container();
  private readonly lit = new Graphics();
  private readonly glows = new Container();
  private readonly focus = new Graphics();
  private readonly captain = new Sprite();
  private readonly specLabels = new Map<MasterySpecId, Text>();
  private readonly nodes: Node[] = [];
  private readonly branches: Branch[] = [];
  /** The board's picture: the passive under the pointer's icon in its frame, or the captain */
  private readonly infoIcon = new Sprite();
  private readonly infoFrame = new Graphics();
  private readonly infoTitle = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 17 } });
  private readonly infoText = text('', 13, THEME.text, {
    wordWrap: true,
    wordWrapWidth: WIDTH - PAD * 2 - FORGET.width - 300 - INFO_TEXT,
  });
  private readonly infoKind = text('', 12, NIGHT.dim, { fontWeight: 'bold' });
  private readonly infoState = text('', 12, NIGHT.dim, { fontWeight: 'bold' });
  private readonly forget: { readonly tile: Tile; readonly text: Text };
  private hovered: MasteryPassive | null = null;
  /** What the board was last filled for, and the mastery the nodes and branches were drawn for */
  private shown = '';
  private drawnFor = '';
  private drag: { readonly x: number; readonly y: number; readonly treeX: number; readonly treeY: number } | null =
    null;
  /**
   * The pointer went past TAP_SLOP since it was pressed: kept past the pointerup, which Pixi sends before the tap (and
   * which lets go of `drag`), so a drag ending on a passive doesn't take it
   */
  private dragged = false;
  /** The zoom that shows the whole crown */
  private readonly fitZoom = Math.min(
    (VIEW.width - VIEW_MARGIN * 2) / TREE_BOUNDS.width,
    (VIEW.height - VIEW_MARGIN * 2) / TREE_BOUNDS.height,
  );
  private clock = 0;
  private takenClock = 0;
  /** The game state of the last update: what a click on a passive is checked against */
  private state: GameState | null = null;

  constructor(actions: MasteryActions, screen: Rectangle, ask: (question: Question, onYes: () => void) => void) {
    this.actions = actions;
    this.ask = ask;
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), NIGHT_WINDOW);
    this.container = this.window.container;
    // A crescent before the title, not a star
    const header = nightHeader(WIDTH, PAD, t("Captain's Mastery"), {
      piece: 'crescentStars',
      pieceHeight: HEADER_MOON,
    });
    const titleRight = header.title.x + header.title.width;
    const star = ornament('star4Small', { height: POINTS_STAR });
    star.position.set(titleRight + 30, PAD + 16);
    this.points.position.set(titleRight + 44, PAD + 4);

    this.buildView();
    const info = new Container();
    info.position.set(PAD, VIEW.y + VIEW.height + GAP);
    this.infoIcon.anchor.set(0.5);
    this.infoIcon.position.set(14 + INFO_ICON, INFO / 2);
    this.infoFrame.position.copyFrom(this.infoIcon.position);
    this.infoTitle.position.set(INFO_TEXT, 8);
    this.infoText.position.set(INFO_TEXT, 34);
    const right = VIEW.width - FORGET.width - 26;
    this.infoKind.anchor.set(1, 0);
    this.infoKind.position.set(right, 12);
    this.infoState.anchor.set(1, 0);
    this.infoState.position.set(right, 36);
    this.forget = moonButton(FORGET.width, FORGET.height, '', () => this.askForget(), 13);
    this.forget.tile.container.position.set(VIEW.width - FORGET.width - 12, (INFO - FORGET.height) / 2);
    info.addChild(
      drawNightCard(new Graphics(), VIEW.width, INFO),
      nightCorners(VIEW.width, INFO, INFO_CORNER, 'corner1', 2),
      this.infoFrame,
      this.infoIcon,
      this.infoTitle,
      this.infoText,
      this.infoKind,
      this.infoState,
      this.forget.tile.container,
    );
    this.window.panel.addChild(header.container, star, this.points, this.view, info);
    MINIMAP_BUTTONS.load(() => this.showCaptain());
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.open();
  }

  hide() {
    this.drag = null;
    this.container.visible = false;
  }

  /** dt: seconds since the last frame, for the glow round what can be taken and what is */
  update(state: GameState, dt: number) {
    this.state = state;
    if (!this.isOpen) return;
    this.window.fit();
    this.clock = (this.clock + dt) % PULSE;
    this.takenClock = (this.takenClock + dt) % TAKEN.pulse;
    const { player } = state;
    const points = captainPoints(state, player);
    show(this.points, t('{n} point to spend|{n} points to spend', { n: points.left }));
    tint(this.points, points.left > 0 ? THEME.title : NIGHT.dim);
    const key = `${player.mastery.join()}|${points.left}`;
    if (key !== this.drawnFor) {
      this.drawnFor = key;
      this.paintTree(state, points);
    }
    const breath = 0.35 + 0.65 * Math.sin((this.clock / PULSE) * Math.PI) ** 2;
    const breathTaken = this.takenClock / TAKEN.pulse;
    for (const node of this.nodes) {
      const { halo } = node;
      if (node.drawn !== 'taken') {
        halo.alpha = breath;
        halo.scale.set(1);
        continue;
      }
      const swell = Math.sin((breathTaken - node.passive.step * TAKEN.climb) * Math.PI) ** 2;
      halo.alpha = TAKEN.low + (1 - TAKEN.low) * swell;
      halo.scale.set(1 + TAKEN.swell * swell);
    }

    const price = masteryRespecPrice(player);
    show(
      this.forget.text,
      price > 0
        ? t('Forget them all: {n} doubloon|Forget them all: {n} doubloons', { n: whole(price) })
        : t('Nothing to forget'),
    );
    this.forget.tile.setLook({ disabled: !state.ship.docked || price === 0 || player.doubloons < price });

    const hovered = this.hovered;
    const shown = hovered ? `${hovered.id}|${key}` : '';
    if (shown === this.shown) return;
    this.shown = shown;
    this.describe(state, points, hovered);
  }

  /** Opens it with the whole tree in view */
  private open() {
    this.container.visible = true;
    this.tree.scale.set(this.fitZoom);
    this.backdrop.alpha = 1;
    const fit = fitPosition(this.fitZoom);
    this.tree.position.set(fit.x, fit.y);
    this.showCaptain();
    MASTERY_ICONS.load(() => this.showIcons());
  }

  /** The passives' painted icons, once their atlas has loaded: the nodes are drawn again with them */
  private showIcons() {
    for (const node of this.nodes) {
      const texture = MASTERY_ICONS.get(node.passive.id);
      if (!texture) continue;
      node.icon.texture = texture;
      node.icon.setSize(NODE[node.passive.tier] * 2);
      node.drawn = null;
    }
    this.drawnFor = '';
    this.shown = '-';
  }

  /** The captain's picture at the root, once the minimap's buttons have loaded (the last of them is theirs) */
  private showCaptain() {
    const texture = MINIMAP_BUTTONS.get('mastery');
    if (!texture || this.captain.texture === texture) return;
    this.captain.texture = texture;
    this.captain.setSize(CAPTAIN * 2, CAPTAIN * 2);
    // The board shows the captain while no passive is under the pointer
    this.shown = '-';
  }

  /**
   * The window onto the tree: the night sky darker inside its gold edge, the moon and a constellation low in its
   * corners where the tree leaves room (they stay put while the tree is dragged and brought nearer), the tree clipped
   * to it, dragged and scaled with the wheel
   */
  private buildView() {
    this.view.position.set(VIEW.x, VIEW.y);
    const board = new Graphics()
      .roundRect(0, 0, VIEW.width, VIEW.height, 8)
      .fill({ color: NIGHT.well, alpha: 0.45 })
      .stroke({ width: 1, color: THEME.brass, alpha: 0.35 });
    const glow = new Graphics().circle(0, 0, MOON_SPOT.glow).fill(glowFill(MOON_SPOT.color));
    glow.alpha = MOON_SPOT.glowAlpha;
    const moon = ornament('moon', { height: MOON_SPOT.size });
    glow.position.set(VIEW.width - MOON_SPOT.right, VIEW.height - MOON_SPOT.bottom);
    moon.position.copyFrom(glow.position);
    const stars = ornament('constellation1', { height: STARS_SPOT.height });
    stars.position.set(STARS_SPOT.left, VIEW.height - STARS_SPOT.bottom);
    stars.alpha = STARS_SPOT.alpha;
    this.backdrop.addChild(glow, moon, stars);
    const clip = new Graphics().roundRect(0, 0, VIEW.width, VIEW.height, 8).fill({ color: 0xffffff });
    this.tree.mask = clip;
    this.buildTree();
    this.view.addChild(board, this.backdrop, this.tree, clip);

    this.view.eventMode = 'static';
    this.view.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    // The painted compass rose, every way: the tree is dragged
    this.view.cursor = 'compass' satisfies CursorId;
    this.view.on('pointerdown', (e) => {
      // Not to the stage, which would steer the ship
      e.stopPropagation();
      this.drag = { x: e.global.x, y: e.global.y, treeX: this.tree.x, treeY: this.tree.y };
      this.dragged = false;
    });
    this.view.on('globalpointermove', (e) => {
      const { drag } = this;
      if (!drag) return;
      // The window is scaled to fit the screen: the pointer moves in the screen's pixels
      const scale = this.window.panel.scale.x;
      const dx = e.global.x - drag.x;
      const dy = e.global.y - drag.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) this.dragged = true;
      this.moveTree(drag.treeX + dx / scale, drag.treeY + dy / scale);
    });
    this.view.on('pointerup', () => (this.drag = null));
    this.view.on('pointerupoutside', () => (this.drag = null));
    this.view.on('wheel', (e) => this.zoomAt(this.view.toLocal(e.global), e.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step));
  }

  /**
   * The tree, made once: a board of blue glass a column, gold corners on it, its specialization's name and points at
   * the top over a divider; the lines from the captain and between the passives in moonlight, the lit layer over them,
   * the captain on a compass rose and every passive
   */
  private buildTree() {
    const crownY = rowY(CROWN_STEP);
    for (const spec of MASTERY_SPEC_IDS) {
      const x = columnX(spec);
      const top = crownY - HEADER.top;
      const width = CARD_HALF * 2;
      const height = rowY(0) + CARD_FOOT - top;
      const divider = nightDivider(width - 28, width - 28);
      divider.position.set(14, HEADER.top - HEADER.divider);
      const board = new Container();
      board.addChild(
        drawNightCard(new Graphics(), width, height),
        nightCorners(width, height, CARD_CORNER, 'corner1', 2),
        divider,
      );
      board.position.set(x - CARD_HALF, top);
      const name = new Text({
        text: t(MASTERY_SPECS[spec].name),
        style: { ...TITLE_STYLE, fontSize: 17, fill: SPEC_COLORS[spec] },
      });
      name.anchor.set(0.5, 1);
      name.position.set(x, crownY - HEADER.name);
      const spent = text('', 11, NIGHT.dim, { fontWeight: 'bold' });
      spent.anchor.set(0.5, 1);
      spent.position.set(x, crownY - HEADER.points);
      this.specLabels.set(spec, spent);
      this.tree.addChild(board, name, spent);
    }

    const places = new Map(MASTERY_PASSIVES.map((passive) => [passive.id, place(passive)]));
    const forkY = (rowY(0) + rowY(1)) / 2;
    const joinY = (rowY(SPECIAL_STEP) + crownY) / 2;
    for (const passive of MASTERY_PASSIVES) {
      const end = places.get(passive.id) ?? { x: 0, y: 0 };
      if (passive.place === 'trunk') {
        // Lit only from the line up: the captain's stem and the line are every specialization's
        const lit = [{ x: end.x, y: -BUS - CORNER }, end];
        this.branches.push({ to: passive, path: elbow({ x: 0, y: 0 }, end, -BUS), lit, width: STEM });
        continue;
      }
      for (const link of passive.links) {
        const from = places.get(link);
        if (!from) continue;
        const path = elbow(from, end, passive.place === 'crown' ? joinY : forkY);
        this.branches.push({ to: passive, path, lit: path, width: LINE });
      }
    }
    const compass = ornament('compass', { width: COMPASS });
    compass.alpha = COMPASS_ALPHA;
    this.tree.addChild(compass, drawMoonlit(new Graphics(), this.branches), this.lit, this.glows);

    const root = new Graphics();
    root
      .circle(0, 0, CAPTAIN + 4)
      .fill({ color: WELL })
      .stroke({ width: 3, color: THEME.brass });
    drawStar(root, CAPTAIN * 0.5, THEME.title);
    this.captain.anchor.set(0.5);
    this.tree.addChild(root, this.captain);

    for (const passive of MASTERY_PASSIVES) {
      const at = places.get(passive.id) ?? { x: 0, y: 0 };
      this.tree.addChild(this.node(passive, at.x, at.y));
    }
    this.focus.visible = false;
    this.tree.addChild(this.focus);
  }

  /** A passive at (x, y): the board under the tree says what it gives while the pointer is on it, a click takes it */
  private node(passive: MasteryPassive, x: number, y: number) {
    const container = new Container();
    container.position.set(x, y);
    const halo = new Graphics();
    halo.position.set(x, y);
    this.glows.addChild(halo);
    const disc = new Graphics();
    const icon = new Sprite();
    icon.anchor.set(0.5);
    const ring = new Graphics();
    const glyph = new Graphics();
    container.addChild(disc, icon, ring, glyph);
    const frame = FRAME[passive.tier];
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.hitArea = new Circle(0, 0, frame + 2);
    container.on('pointerover', () => {
      this.hovered = passive;
      this.focus.position.set(x, y);
      outline(this.focus.clear(), passive.tier, passive.tier === 'legendary' ? frame * BURST : frame + 4).stroke({
        width: 2.5,
        color: FOCUS,
        alpha: 0.95,
      });
      this.focus.visible = true;
    });
    container.on('pointerout', () => {
      if (this.hovered !== passive) return;
      this.hovered = null;
      this.focus.visible = false;
    });
    container.on('pointertap', () => {
      if (!this.dragged) this.askTake(passive);
    });
    this.nodes.push({ passive, container, disc, halo, icon, ring, glyph, drawn: null });
    return container;
  }

  /** The nodes and branches as the player's mastery stands, and every specialization's points: when it changes */
  private paintTree(state: GameState, points: CaptainPoints) {
    const { player } = state;
    drawLit(
      this.lit.clear(),
      this.branches.filter((branch) => player.mastery.includes(branch.to.id)),
    );
    for (const node of this.nodes) {
      const drawn = nodeState(masteryBlock(player, points, node.passive.id));
      if (drawn === node.drawn) continue;
      node.drawn = drawn;
      paintNode(node, drawn);
    }
    for (const [spec, label] of this.specLabels) {
      const total = MASTERY_PASSIVES.filter((p) => p.spec === spec).reduce((sum, p) => sum + p.cost, 0);
      show(label, `${masterySpent(player.mastery, spec)} / ${total}`);
    }
  }

  /** The tree's middle at (x, y) in the view, kept so some of it always shows */
  private moveTree(x: number, y: number) {
    const bounds = TREE_BOUNDS;
    const zoom = this.tree.scale.x;
    const left = VIEW.width - (bounds.x + bounds.width) * zoom - VIEW_MARGIN;
    const right = -bounds.x * zoom + VIEW_MARGIN;
    const top = VIEW.height - (bounds.y + bounds.height) * zoom - VIEW_MARGIN;
    const bottom = -bounds.y * zoom + VIEW_MARGIN;
    this.tree.position.set(
      Math.min(Math.max(x, Math.min(left, right)), Math.max(left, right)),
      Math.min(Math.max(y, Math.min(top, bottom)), Math.max(top, bottom)),
    );
  }

  /** Brings the tree nearer (`by` over 1) or farther, the point under the pointer (`at`, in the view) staying put */
  private zoomAt(at: Point, by: number) {
    const old = this.tree.scale.x;
    const zoom = Math.min(Math.max(old * by, this.fitZoom * ZOOM.least), this.fitZoom * ZOOM.most);
    const k = zoom / old;
    this.tree.scale.set(zoom);
    this.moveTree(at.x - (at.x - this.tree.x) * k, at.y - (at.y - this.tree.y) * k);
    this.backdrop.alpha = Math.min(Math.max((BACKDROP_FADE - zoom / this.fitZoom) / (BACKDROP_FADE - 1), 0), 1);
  }

  /** Asks before a passive is taken: its points come back only with the whole mastery, forgotten for doubloons */
  private askTake(passive: MasteryPassive) {
    const take = () => {
      if (this.actions.takePassive(passive.id)) this.shown = '-';
    };
    const state = this.state;
    // What can't be taken is refused at once, with its sound, as before
    if (!state || masteryBlock(state.player, captainPoints(state, state.player), passive.id) !== null) {
      take();
      return;
    }
    const back = t('Its points come back only when the whole mastery is forgotten, in port, for doubloons');
    this.ask(
      {
        title: t('Take {name}?', { name: passiveName(passive) }),
        text: `${passiveText(passive)}\n${back}`,
        yes: t('Take for {n} point|Take for {n} points', { n: passive.cost }),
      },
      take,
    );
  }

  /** Asks before every passive is forgotten: it can't be undone, and costs doubloons */
  private askForget() {
    const state = this.state;
    if (!state) return;
    const price = masteryRespecPrice(state.player);
    this.ask(
      {
        title: t('Forget the mastery?'),
        text: t(
          'Every passive is forgotten and its points come back to spend again, for {n} doubloon|Every passive is forgotten and its points come back to spend again, for {n} doubloons',
          { n: whole(price) },
        ),
        yes: t('Forget for {n} doubloon|Forget for {n} doubloons', { n: whole(price) }),
      },
      () => this.actions.forgetMastery(),
    );
  }

  /** The board under the tree: the passive under the pointer, or how the tree works */
  private describe(state: GameState, points: CaptainPoints, passive: MasteryPassive | null) {
    if (!passive) {
      show(this.infoTitle, t("The captain's tree"));
      show(
        this.infoText,
        t(
          'Passives for every ship the captain sails. A glowing one can be taken now: click it. Drag to look round the tree, the wheel brings it nearer',
        ),
      );
      show(this.infoKind, t('In port the mastery can be forgotten, to take it again'));
      show(this.infoState, '');
      tint(this.infoTitle, THEME.title);
      // The captain's medallion has a frame of its own
      this.showInfoIcon(MINIMAP_BUTTONS.get('mastery'), INFO_ICON + 3);
      this.infoFrame.clear();
      return;
    }
    const color = SPEC_COLORS[passive.spec];
    this.showInfoIcon(MASTERY_ICONS.get(passive.id), INFO_ICON);
    this.infoFrame
      .clear()
      .circle(0, 0, INFO_ICON + 3)
      .fill({ color: EDGE })
      .circle(0, 0, INFO_ICON + 1)
      .fill({ color: WELL })
      .stroke({ width: 2, color });
    show(this.infoTitle, passiveName(passive));
    tint(this.infoTitle, color);
    show(this.infoText, passiveText(passive));
    const cost = t('{n} point|{n} points', { n: passive.cost });
    show(this.infoKind, `${t(MASTERY_SPECS[passive.spec].name)} · ${t(TIER_NAMES[passive.tier])} · ${cost}`);
    const block = masteryBlock(state.player, points, passive.id);
    const [status, statusColor] = statusOf(passive, block);
    show(this.infoState, status);
    tint(this.infoState, statusColor);
  }

  /** The board's picture, `radius` pixels round; none while its atlas is loading */
  private showInfoIcon(texture: Texture | null, radius: number) {
    this.infoIcon.visible = texture !== null;
    if (!texture) return;
    this.infoIcon.texture = texture;
    this.infoIcon.setSize(radius * 2);
  }
}

/** What the board says of a passive's state, and in what colour */
function statusOf(passive: MasteryPassive, block: MasteryBlock | null): [string, number] {
  if (block === null) return [t('Click to take it'), UI.good];
  if (block === 'taken') return [t('Taken: it works on every ship'), THEME.title];
  if (block === 'points') return [t('Not enough points'), UI.bad];
  if (block === 'gate') {
    const spec = t(MASTERY_SPECS[passive.spec].name);
    return [t('Opens with {n} points in {spec}', { n: LEGENDARY_GATE, spec }), NIGHT.dim];
  }
  const first = passive.place === 'crown' ? 'Take a special beside it first' : 'Take the one it grows from first';
  return [t(first), NIGHT.dim];
}

/** A line along `path`, rounding its corners */
function trace(g: Graphics, path: readonly Spot[]) {
  path.forEach((at, i) => {
    const next = path[i + 1];
    if (i === 0) g.moveTo(at.x, at.y);
    else if (next) g.arcTo(at.x, at.y, next.x, next.y, CORNER);
    else g.lineTo(at.x, at.y);
  });
  return g;
}

// Opaque and a pass at a time, the haze or glow first: where lines meet or run together, none shows brighter
const ROUND = { cap: 'round', join: 'round' } as const;

/** The lines in moonlight: a cold haze round them, then the silver */
function drawMoonlit(g: Graphics, branches: readonly Branch[]) {
  for (const b of branches) trace(g, b.path).stroke({ ...ROUND, width: b.width + MOON_HAZE, color: MOON.haze });
  for (const b of branches) trace(g, b.path).stroke({ ...ROUND, width: b.width, color: MOON.line });
  return g;
}

/** The lines to the passives taken: each in its specialization's light, over the moonlight */
function drawLit(g: Graphics, branches: readonly Branch[]) {
  for (const b of branches) {
    const glow = mixColor(NIGHT.glassDark, SPEC_COLORS[b.to.spec], 0.4);
    trace(g, b.lit).stroke({ ...ROUND, width: b.width + LIT_GLOW, color: glow });
  }
  for (const b of branches) trace(g, b.lit).stroke({ ...ROUND, width: b.width, color: SPEC_COLORS[b.to.spec] });
}

/**
 * A passive as the player has it: its icon in a frame of its tier; taken (the frame filled with its specialization's
 * colour, edged in its light, glowing steadily), open to take now (a glow breathing round it), open but short of points
 * (edged in its colour, the icon dimmed), or not reached yet (dark, the icon darker). Until the icons have loaded, its
 * sign stands in for its icon
 */
function paintNode(node: Node, state: NodeState) {
  const { passive, disc, halo, icon, ring, glyph } = node;
  const color = SPEC_COLORS[passive.spec];
  const r = NODE[passive.tier];
  const frame = FRAME[passive.tier];
  const taken = state === 'taken';
  const reach = state === 'open' || state === 'short';
  const edge = taken ? mixColor(color, 0xffffff, TAKEN.edge) : reach ? color : THEME.brassDark;
  disc.clear();
  halo.clear();
  ring.clear();
  glyph.clear();
  if (passive.tier === 'legendary') drawBurst(disc, frame, taken ? color : THEME.brass, taken ? 0.9 : 0.35);
  outline(disc, passive.tier, frame + 2.5).fill({ color: taken ? mixColor(EDGE, color, TAKEN.rim) : EDGE });
  outline(disc, passive.tier, frame)
    .fill({ color: taken ? color : WELL })
    .stroke({ width: 2, color: edge, alpha: state === 'short' ? 0.7 : 1 });
  disc.circle(0, 0, r).fill({ color: WELL });
  const painted = icon.texture !== Texture.EMPTY;
  icon.visible = painted;
  icon.tint = state === 'short' ? DIM_TINT.short : state === 'locked' ? DIM_TINT.locked : 0xffffff;
  ring.circle(0, 0, r).stroke({ width: passive.tier === 'common' ? 1.5 : 2, color: edge });
  if (!painted && (passive.place === 'special' || passive.place === 'crown')) {
    GLYPHS[passive.spec](glyph, r * 1.15, color);
  } else if (!painted) {
    glyph.circle(0, 0, r * 0.32).fill({ color, alpha: reach || taken ? 0.9 : 0.5 });
  }
  if (state === 'open') {
    for (let i = 1; i <= 3; i++) outline(halo, passive.tier, frame + 2 + i * 3).fill({ color, alpha: 0.16 / i });
  } else if (taken) {
    halo.circle(0, 0, frame + TAKEN.spread).fill(takenGlow(color, frame, TAKEN.spread));
  }
  node.container.alpha = state === 'locked' ? 0.92 : 1;
}
