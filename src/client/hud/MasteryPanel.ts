import { Circle, Container, Graphics, Rectangle, Sprite, Text, type Point } from 'pixi.js';
import {
  MASTERY_BRANCHES,
  MASTERY_BRANCH_IDS,
  MASTERY_PASSIVES,
  MASTERY_RANKS,
  MASTERY_RINGS,
  type MasteryBranchId,
  type MasteryPassive,
  type PassiveKind,
} from '../../game';
import { MINIMAP_BUTTONS } from './iconAtlas';
import { THEME, THEMED_WINDOW, TITLE_STYLE, drawCard, drawDivider } from './theme';
import { HudWindow, drawBall, drawCoin, drawHarpoon, drawSail, drawStar, drawWrench, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1040; // pixels, before scaling down to fit the screen
const HEIGHT = 780;
const PAD = 24;
const DIVIDER = PAD + 50; // the gold line under the title
const CLOSE_WIDTH = 96; // pixels: the themed window's Close button, beside the summary
const INFO = 66; // pixels: the board at the bottom, what the passive under the pointer gives
const GAP = 12; // pixels between the tree's view and the divider over it and the board under it
/** Where the tree is seen, in the window */
const VIEW = { x: PAD, y: DIVIDER + GAP, width: WIDTH - PAD * 2, height: HEIGHT - DIVIDER - GAP * 2 - INFO - PAD };
// The tree, in its own pixels round the captain: the first ring's radius, the step out to each next one, and the arc
// between two neighbours across a ring
const RING = { first: 80, step: 58, arc: 66 } as const;
const NODE: Readonly<Record<PassiveKind, number>> = { root: 34, minor: 11, notable: 17, keystone: 23 }; // radii, pixels
const LABEL_OUT = 26; // pixels beyond a keystone's edge where its branch's name starts
const LABEL_HEIGHT = 44; // pixels: a branch's name and the line under it
const VIEW_MARGIN = 16; // pixels between the tree as it opens and the view's edge
// How far out the tree reaches with its branches' names, pixels: the view fits it at first
const OUTER = RING.first + (MASTERY_RINGS - 1) * RING.step + NODE.keystone + LABEL_OUT + LABEL_HEIGHT + VIEW_MARGIN;
const ZOOM = { step: 1.15, most: 2.4, least: 0.8 } as const; // a wheel notch; the nearest; the farthest, of the fit
const WELL = 0x0a0705; // a passive's dark middle
const FOCUS = 0xf3d58a; // the ring round the passive under the pointer
/** Each branch's colour: its passives' glow, its links and its name */
const BRANCH_COLORS: Readonly<Record<MasteryBranchId, number>> = {
  gunnery: 0xe0703a,
  hunting: 0x3fbfae,
  seamanship: 0x5aa9ff,
  shipwright: 0xc98b4a,
  trade: 0xf0c66a,
  command: 0xb57cff,
};
/** What a notable passive or a keystone shows in its middle, `size` pixels: its branch's sign */
const GLYPHS: Readonly<Record<MasteryBranchId, (g: Graphics, size: number, color: number) => void>> = {
  gunnery: (g, size) => drawBall(g, size * 0.3, 1),
  hunting: (g, size) => drawHarpoon(g, size * 0.9, 1),
  seamanship: drawSail,
  shipwright: drawWrench,
  trade: (g, size) => drawCoin(g, size * 0.36),
  command: (g, size, color) => drawStar(g, size * 0.45, color),
};
const KIND_NAMES: Readonly<Record<PassiveKind, string>> = {
  root: 'The middle of the tree',
  minor: 'Minor passive',
  notable: 'Notable passive',
  keystone: 'Keystone',
};

/** Which way a branch goes from the middle, radians: the first one up, the rest clockwise */
function branchAngle(branch: MasteryBranchId) {
  return -Math.PI / 2 + (MASTERY_BRANCH_IDS.indexOf(branch) * Math.PI * 2) / MASTERY_BRANCH_IDS.length;
}

function ringRadius(ring: number) {
  return RING.first + (ring - 1) * RING.step;
}

/** Where a passive is in the tree, pixels from the captain */
function place(passive: MasteryPassive) {
  if (!passive.branch) return { x: 0, y: 0 };
  const radius = ringRadius(passive.ring);
  const angle = branchAngle(passive.branch) + ((passive.slot - (passive.across - 1) / 2) * RING.arc) / radius;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** A passive's disc round (0, 0): a brass rim round a dark well lit in its branch's colour, and its sign in it */
function drawPassive(g: Graphics, passive: MasteryPassive, color: number) {
  const r = NODE[passive.kind];
  if (passive.kind === 'keystone') g.circle(0, 0, r + 4).stroke({ width: 1.5, color: THEME.brass, alpha: 0.6 });
  g.circle(0, 0, r)
    .fill({ color: WELL })
    .stroke({ width: passive.kind === 'minor' ? 2 : 3, color: THEME.brass, alpha: 0.9 });
  g.circle(0, 0, r - 3).fill({ color, alpha: 0.16 });
  if (passive.kind === 'minor') g.circle(0, 0, r * 0.35).fill({ color, alpha: 0.8 });
  else if (passive.branch) GLYPHS[passive.branch](g, r * 1.1, color);
}

/**
 * The captain's mastery (P, or the captain on the minimap's frame): the account's tree of passives, for every ship the
 * player sails. The captain in the middle, six branches round them, each ring by ring out to its keystone, linked to
 * what opens them. Planned: the captain's levels and points come with the online game, so for now it is a look ahead,
 * with what each passive will give under the pointer. Dragged to look round it, the mouse wheel brings it nearer.
 * Closed by Close, Escape, P or a click beside it
 */
export class MasteryPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  /** The view's window onto the tree, and the tree in it, moved and scaled */
  private readonly view = new Container();
  private readonly tree = new Container();
  private readonly focus = new Graphics();
  private readonly captain = new Sprite();
  private readonly infoTitle = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 17 } });
  private readonly infoText = text('', 13, THEME.text, { wordWrap: true, wordWrapWidth: WIDTH - PAD * 2 - 300 });
  private readonly infoKind = text('', 12, THEME.dim, { fontWeight: 'bold' });
  private readonly infoRanks = text('', 12, THEME.dim);
  private hovered: MasteryPassive | null = null;
  /** The passive the board was last filled for ('' for none) */
  private shown: string | null = null;
  private drag: { readonly x: number; readonly y: number; readonly treeX: number; readonly treeY: number } | null =
    null;
  private readonly fitZoom = Math.min(VIEW.width, VIEW.height) / (OUTER * 2);

  constructor(screen: Rectangle) {
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), THEMED_WINDOW);
    this.container = this.window.container;
    const title = new Text({ text: t("Captain's Mastery"), style: { ...TITLE_STYLE, fontSize: 28 } });
    title.position.set(PAD, PAD - 6);
    const note = text(
      t(
        'Passives for the captain, kept from ship to ship. The levels and points to take them come with the online game: for now the tree is a look ahead',
      ),
      13,
      THEME.dim,
    );
    note.position.set(PAD, PAD + 30);
    const summary = text(
      t('{passives} passives, {ranks} ranks', { passives: MASTERY_PASSIVES.length - 1, ranks: MASTERY_RANKS }),
      13,
      THEME.title,
      { fontWeight: 'bold' },
    );
    summary.anchor.set(1, 0);
    summary.position.set(WIDTH - PAD - CLOSE_WIDTH - 16, PAD + 6);

    this.buildView();
    const info = new Container();
    info.position.set(PAD, VIEW.y + VIEW.height + GAP);
    this.infoTitle.position.set(14, 9);
    this.infoText.position.set(14, 35);
    this.infoKind.anchor.set(1, 0);
    this.infoKind.position.set(VIEW.width - 14, 12);
    this.infoRanks.anchor.set(1, 0);
    this.infoRanks.position.set(VIEW.width - 14, 36);
    info.addChild(
      drawCard(new Graphics(), VIEW.width, INFO),
      this.infoTitle,
      this.infoText,
      this.infoKind,
      this.infoRanks,
    );
    this.window.panel.addChild(
      title,
      note,
      summary,
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      this.view,
      info,
    );
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

  update() {
    if (!this.isOpen) return;
    this.window.fit();
    const id = this.hovered?.id ?? '';
    if (id === this.shown) return;
    this.shown = id;
    this.describe(this.hovered);
  }

  /** Opens it with the whole tree in view */
  private open() {
    this.container.visible = true;
    this.tree.scale.set(this.fitZoom);
    this.tree.position.set(VIEW.width / 2, VIEW.height / 2);
    this.showCaptain();
  }

  /** The captain's picture in the middle, once the minimap's buttons have loaded (the last of them is theirs) */
  private showCaptain() {
    const texture = MINIMAP_BUTTONS.get('mastery');
    if (!texture || this.captain.texture === texture) return;
    this.captain.texture = texture;
    this.captain.setSize(NODE.root * 2, NODE.root * 2);
  }

  /** The window onto the tree: its board, the tree clipped to it, dragged and scaled with the wheel */
  private buildView() {
    this.view.position.set(VIEW.x, VIEW.y);
    const board = new Graphics()
      .roundRect(0, 0, VIEW.width, VIEW.height, 8)
      .fill({ color: 0x070504, alpha: 0.55 })
      .stroke({ width: 1, color: THEME.brass, alpha: 0.3 });
    const clip = new Graphics().roundRect(0, 0, VIEW.width, VIEW.height, 8).fill({ color: 0xffffff });
    this.tree.mask = clip;
    this.buildTree();
    this.view.addChild(board, this.tree, clip);

    this.view.eventMode = 'static';
    this.view.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.view.cursor = 'grab';
    this.view.on('pointerdown', (e) => {
      // Not to the stage, which would steer the ship
      e.stopPropagation();
      this.drag = { x: e.global.x, y: e.global.y, treeX: this.tree.x, treeY: this.tree.y };
    });
    this.view.on('globalpointermove', (e) => {
      if (!this.drag) return;
      // The window is scaled to fit the screen: the pointer moves in the screen's pixels
      const scale = this.window.panel.scale.x;
      this.moveTree(
        this.drag.treeX + (e.global.x - this.drag.x) / scale,
        this.drag.treeY + (e.global.y - this.drag.y) / scale,
      );
    });
    this.view.on('pointerup', () => (this.drag = null));
    this.view.on('pointerupoutside', () => (this.drag = null));
    this.view.on('wheel', (e) => this.zoomAt(this.view.toLocal(e.global), e.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step));
  }

  /** The tree drawn once: the rings, the links, the branches' names, and a disc for every passive */
  private buildTree() {
    const places = new Map(MASTERY_PASSIVES.map((passive) => [passive.id, place(passive)]));
    const under = new Graphics();
    for (let ring = 1; ring <= MASTERY_RINGS; ring++) {
      under.circle(0, 0, ringRadius(ring)).stroke({ width: 1, color: THEME.brass, alpha: 0.08 });
    }
    for (const passive of MASTERY_PASSIVES) {
      const to = places.get(passive.id);
      const color = passive.branch ? BRANCH_COLORS[passive.branch] : THEME.brass;
      for (const link of passive.links) {
        const from = places.get(link);
        if (!from || !to) continue;
        under.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: 4, color: THEME.brassDark, alpha: 0.9 });
        under.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: 1.5, color, alpha: 0.45 });
      }
    }
    this.tree.addChild(under);
    for (const branch of MASTERY_BRANCH_IDS) this.tree.addChild(this.branchLabel(branch));
    for (const passive of MASTERY_PASSIVES) {
      const at = places.get(passive.id) ?? { x: 0, y: 0 };
      this.tree.addChild(this.node(passive, at.x, at.y));
    }
    this.focus.visible = false;
    this.tree.addChild(this.focus);
  }

  /** A branch's name and what it is for, beyond its keystone, reaching outwards from the middle */
  private branchLabel(branch: MasteryBranchId) {
    const { name, text: about } = MASTERY_BRANCHES[branch];
    const label = new Container();
    const heading = new Text({ text: t(name), style: { ...TITLE_STYLE, fontSize: 18, fill: BRANCH_COLORS[branch] } });
    const line = text(t(about), 12, THEME.dim);
    const width = Math.max(heading.width, line.width);
    heading.position.set((width - heading.width) / 2, 0);
    line.position.set((width - line.width) / 2, heading.height + 1);
    label.addChild(heading, line);
    const angle = branchAngle(branch);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const radius = ringRadius(MASTERY_RINGS) + NODE.keystone + LABEL_OUT;
    // Its edge nearest the middle at the radius, so it never covers the keystone
    label.pivot.set(width * (0.5 - cos / 2), label.height * (0.5 - sin / 2));
    label.position.set(cos * radius, sin * radius);
    return label;
  }

  /** A passive's disc at (x, y): the board under the tree says what it gives while the pointer is on it */
  private node(passive: MasteryPassive, x: number, y: number) {
    const node = new Container();
    node.position.set(x, y);
    const g = new Graphics();
    const radius = NODE[passive.kind];
    if (passive.kind === 'root') {
      g.circle(0, 0, radius + 3)
        .fill({ color: WELL })
        .stroke({ width: 3, color: THEME.brass });
      drawStar(g, radius * 0.5, THEME.title);
      this.captain.anchor.set(0.5);
      node.addChild(g, this.captain);
    } else {
      drawPassive(g, passive, BRANCH_COLORS[passive.branch ?? 'gunnery']);
      node.addChild(g);
    }
    node.eventMode = 'static';
    node.hitArea = new Circle(0, 0, radius + 3);
    node.on('pointerover', () => {
      this.hovered = passive;
      this.focus
        .clear()
        .circle(x, y, radius + 4)
        .stroke({ width: 2.5, color: FOCUS, alpha: 0.95 });
      this.focus.visible = true;
    });
    node.on('pointerout', () => {
      if (this.hovered !== passive) return;
      this.hovered = null;
      this.focus.visible = false;
    });
    return node;
  }

  /** The tree's middle at (x, y) in the view, kept within it so the tree can't be lost off the edge */
  private moveTree(x: number, y: number) {
    this.tree.position.set(Math.min(Math.max(x, 0), VIEW.width), Math.min(Math.max(y, 0), VIEW.height));
  }

  /** Brings the tree nearer (`by` over 1) or farther, the point under the pointer (`at`, in the view) staying put */
  private zoomAt(at: Point, by: number) {
    const old = this.tree.scale.x;
    const zoom = Math.min(Math.max(old * by, this.fitZoom * ZOOM.least), this.fitZoom * ZOOM.most);
    const k = zoom / old;
    this.tree.scale.set(zoom);
    this.moveTree(at.x - (at.x - this.tree.x) * k, at.y - (at.y - this.tree.y) * k);
  }

  /** The board under the tree: the passive under the pointer, or how to look round the tree */
  private describe(passive: MasteryPassive | null) {
    if (!passive) {
      show(this.infoTitle, t("The captain's tree"));
      show(
        this.infoText,
        t('Point at a passive to see what it gives. Drag to look round the tree, the wheel brings it nearer'),
      );
      show(this.infoKind, '');
      show(this.infoRanks, '');
      tint(this.infoTitle, THEME.title);
      return;
    }
    const effect = t(passive.text, { n: passive.value });
    const branch = passive.branch ? MASTERY_BRANCHES[passive.branch] : null;
    // A minor passive is known by what it gives, under it what its branch is for
    show(this.infoTitle, passive.kind === 'minor' ? effect : t(passive.name));
    show(this.infoText, passive.kind === 'minor' && branch ? t(branch.text) : effect);
    tint(this.infoTitle, passive.branch ? BRANCH_COLORS[passive.branch] : THEME.title);
    show(this.infoKind, branch ? `${t(branch.name)} · ${t(KIND_NAMES[passive.kind])}` : t(KIND_NAMES[passive.kind]));
    const ranks = t('{n} rank|{n} ranks', { n: passive.maxRank });
    show(
      this.infoRanks,
      passive.maxRank === 0
        ? t('Yours from the start')
        : passive.maxRank === 1
          ? ranks
          : `${ranks} · ${t('each one gives as much again')}`,
    );
  }
}
