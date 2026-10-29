import { Assets, Circle, Container, Ellipse, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  MAP_SQUARE,
  SHIP_CLASSES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  captainPoints,
  isAfloat,
  isHostile,
  milestonesToPick,
  pointsToSpend,
  storyFitting,
  storyGoal,
  storyTargets,
  zoneBoss,
  type GameState,
  type Island,
  type Unit,
} from '../../game';
import type { CursorId } from '../input/cursor';
import type { Selection } from '../input/selection';
import {
  CHART,
  MapProjection,
  bossLair,
  bossMarker,
  bountyTargets,
  bountyWaiting,
  drawBossLair,
  drawGates,
  drawGoalGlow,
  drawStoryMark,
  drawIslands,
  drawLostCargo,
  drawRoute,
  drawShipArrow,
  goalMarker,
  squareName,
  unitMarker,
  type MapAxes,
} from './chart';
import { canFillScreen, isFullscreen, toggleFullscreen } from './fullscreen';
import { IconSprites, MAP_MARKERS, MINIMAP_BUTTONS, type MinimapButtonId } from './iconAtlas';
import type { GuideTarget } from './StoryGuide';
import { subheading } from './theme';
import { UI, playTap, show, text } from './ui';
import { t } from '../i18n/i18n';

// Made by blender-assets/hud/build_minimap_frame.py, which prints the figures in FRAME
const FRAME_URL = `${import.meta.env.BASE_URL}sprites/hud/minimap_frame.webp`;
/**
 * The frame's picture, in its own pixels: its size, the opening the map shows through (its middle and radii), how far
 * out round the opening its ring reaches (in the opening's radii), and the deep blue slots in gold rings round its top,
 * left to right (their middles and radius)
 */
const FRAME = {
  width: 653,
  height: 602,
  x: 326.5,
  y: 295.2,
  rx: 228,
  ry: 217.2,
  reach: 1.318,
  slots: [
    [57.5, 275.2],
    [73.5, 201.2],
    [118, 131.8],
    [183, 81.2],
    [261.5, 46.5],
    [391.8, 46.2],
    [470, 81.2],
    [534.2, 131.8],
    [579, 201],
    [595.8, 275],
  ],
  slot: 28.6,
} as const;
const FRAME_WIDTH = 240; // pixels on the screen
const FRAME_SCALE = FRAME_WIDTH / FRAME.width;
const FRAME_HEIGHT = Math.round(FRAME.height * FRAME_SCALE);
/** The opening on the screen, pixels from the frame's top left corner */
const OPENING = {
  x: FRAME.x * FRAME_SCALE,
  y: FRAME.y * FRAME_SCALE,
  rx: FRAME.rx * FRAME_SCALE,
  ry: FRAME.ry * FRAME_SCALE,
};
const UNDER_RIM = 2; // pixels the map reaches under the frame's inner rim, so its soft edge shows no gap
// A button's radius, in its slot's: a medallion's own gold rim lies on the slot's edge
const BUTTON_OVER_SLOT = 1.05;
const BUTTON_RADIUS = FRAME.slot * BUTTON_OVER_SLOT * FRAME_SCALE;
// An icon's longer side, in its slot's width: it fills the slot's blue up to the gold ring round it, as a medallion's
// picture fills it
const ICON_IN_SLOT = 1;
const ICON_SIZE = FRAME.slot * 2 * ICON_IN_SLOT * FRAME_SCALE;
const HOVER_SCALE = 1.15; // a button under the pointer grows
const LIT = 0xf3d58a; // the ring round a button whose window is open
const HINT_GAP = 3; // pixels between a button and its hint above it
const HINT_EDGE = 4; // pixels a hint keeps from the screen's right edge
/**
 * The buttons in the frame's slots, left to right: what each one's hint says (English: t() when the HUD is made), and
 * whether its picture is a painted medallion, its own rim over the slot's, or an icon standing in the slot
 */
const BUTTONS: readonly { readonly id: MinimapButtonId; readonly hint: string; readonly medallion?: boolean }[] = [
  { id: 'settings', hint: 'Settings' },
  { id: 'fullscreen', hint: 'Full screen' },
  { id: 'feats', hint: 'Feats' },
  { id: 'hold', hint: 'Hold (H)', medallion: true },
  { id: 'loadout', hint: 'Loadout (L)', medallion: true },
  { id: 'talents', hint: 'Talents (K)', medallion: true },
  { id: 'mastery', hint: "Captain's mastery (P)", medallion: true },
  { id: 'bestiary', hint: 'Bestiary (B)' },
  { id: 'world', hint: 'World chart (N)' },
  { id: 'logout', hint: 'Log out' },
];
const RANGE = 1200; // world units from the ship to the rim at the opening's sides, where it is widest
// The square the ship is in, at the bottom of the opening: its letters' size (pixels on the screen) and how far above
// the opening's bottom, in the frame's picture's pixels: over the spike that stands up into the opening there
const SQUARE = { size: 14, above: 36 } as const;
const UNIT_RADIUS = 3; // pixels: a unit's dot, until the markers have loaded
const TARGET_RING = 2.5; // pixels round a unit's dot: the gold ring of one the story asks the player to sink
/**
 * The painted markers, pixels across: a unit's, one the story or a bounty asks the player to sink, a boss's, the sight
 * round the unit the ship fires at, the harbour's, and where the story sends the player
 */
const MARKER = { unit: 13, prey: 16, boss: 20, target: 21, home: 15, goal: 20 } as const;
const RIM_INSET = 10; // pixels inside the opening's edge a mark beyond it is drawn at
const CHEST_COLOR = 0xffcf3f;
const ME_SIZE = 11; // pixels: the player's arrow
const LANDMARK_SIZE = 4; // pixels: the lost cargo's and the boss's marks
const COLORS = { neutral: 0xf4f1e6, selected: 0xf2b33d } as const;
/**
 * The talents' button while a talent waits to be picked, and the captain's mastery's while a point waits to be spent: a
 * "!" on a gold badge at its top right, breathing, and a gold halo round the medallion pulsing with it; the badge pops
 * in bigger when there are more to pick
 */
const ALERT = {
  radius: 6.5, // pixels: the badge's
  at: 0.75, // the badge's middle, in the button's radius right of and above the button's
  size: 11, // pixels: the "!" high
  color: 0xffc94a,
  edge: 0x3a2400,
  pulse: 1.4, // seconds one breath takes
  breath: 0.15, // the badge grows this much bigger at the top of a breath
  halo: { rings: 3, step: 2.5, alpha: 0.4 }, // round the medallion: rings this many pixels apart, fainter outwards
  pop: { time: 0.4, scale: 1.6 }, // it pops in this much bigger when there are more to pick, for these seconds
} as const;
/**
 * The buttons that wear the mark while something waits in their windows: a talent to pick, a captain's point to spend,
 * the guns the story asks to be fitted from the hold
 */
type AlertId = 'talents' | 'mastery' | 'loadout';

/**
 * What the buttons on the frame do: most open or close their windows; logging out leaves for the landing. The full
 * screen's the frame does itself
 */
export type MinimapActions = Readonly<Record<Exclude<MinimapButtonId, 'fullscreen'>, () => void>>;
/** Which of the buttons' windows are open: those buttons are lit (the full screen's while the game fills the screen) */
export type MinimapLit = Readonly<Record<Exclude<MinimapButtonId, 'fullscreen' | 'logout'>, boolean>>;

/** A button in a slot of the frame, its painted picture loaded with the atlas */
interface FrameButton {
  readonly id: MinimapButtonId;
  readonly container: Container;
  readonly picture: Sprite;
  /** The picture's side on the screen: a medallion's covers its slot, an icon's stands in it */
  readonly size: number;
  /** Round it: gold while its window is open, pale under the pointer */
  readonly ring: Graphics;
  readonly hint: string;
  /** As last painted, to repaint only on change */
  painted: string;
}

/** The mark on a button while something waits to be picked in its window */
interface PickAlert {
  /** Round the medallion, under it */
  readonly halo: Graphics;
  /** The "!" on its gold badge, over the medallion's top right */
  readonly badge: Container;
  /**
   * The points to spend (the talents' or the captain's) and the milestones to pick (the talents' alone) when last
   * updated: the badge pops when there are more
   */
  points: number;
  milestones: number;
  /** Seconds since it last popped */
  popAge: number;
}

/** What waits to be picked, counted apart: the points to spend and the milestones to pick */
function pickLabel(points: number, milestones: number) {
  if (milestones === 0) return t('{n} point to spend|{n} points to spend', { n: points });
  if (points === 0) return t('{n} milestone to pick|{n} milestones to pick', { n: milestones });
  return `${t('{n} point|{n} points', { n: points })} · ${t('{n} milestone|{n} milestones', { n: milestones })}`;
}

/** A unit's dot on a map: an enemy red, the rest pale */
export function unitColor(unit: Unit, playerId: number) {
  return isHostile(unit, playerId) ? UI.hostile : COLORS.neutral;
}

/** Where the lines between the map's squares cross one axis from `from` to `to`, inside the world (0…size) */
function gridLines(from: number, to: number, size: number) {
  const first = Math.max(0, Math.ceil(from / MAP_SQUARE));
  const last = Math.min(Math.floor(size / MAP_SQUARE), Math.floor(to / MAP_SQUARE));
  const at: number[] = [];
  for (let k = first; k <= last; k++) at.push(k * MAP_SQUARE);
  return at;
}

/**
 * The minimap in the bottom right corner, in a painted frame of wood and brass: the sea round the player's ship, turned
 * like the screen, with the islands near as the sea chart draws them, the squares of the map, the water the ship can see and every unit and chest
 * in it (an enemy red, a chest a gold diamond), the ship's way on, and the square it is in. Until the
 * frame's picture has loaded the opening has a thin rim of its own.
 * A click on it (or M) opens the sea chart. The ten slots round the frame's top are buttons, left to right: the
 * settings, the full screen (where the browser allows it), the captain's feats, the hold, the loadout, the ship's
 * talents, the captain's mastery, the bestiary, the world chart and logging out, each lit while its window is open.
 * While a talent waits to be picked the talents' button wears a breathing "!", and while a captain's point waits to be
 * spent the mastery's, each one's hint telling what waits
 */
export class Minimap {
  static readonly WIDTH = FRAME_WIDTH;
  static readonly HEIGHT = FRAME_HEIGHT;
  readonly container = new Container();
  private readonly disc = new Container();
  /** What the opening shows, cut to it: the water seen and the squares' lines, the islands, then the rest */
  private readonly inside = new Container();
  private readonly under = new Graphics();
  /**
   * The sea's islands, drawn once round the world's origin: the map keeps its turn and scale wherever the ship is, so
   * they only move under it
   */
  private readonly islands = new Graphics();
  private readonly content = new Graphics();
  /** The painted markers, over the content; the ship's arrow over them */
  private readonly markers = new IconSprites(MAP_MARKERS);
  private readonly top = new Graphics();
  private readonly clip = new Graphics();
  /** The islands as last drawn, to draw them again only for another sea's */
  private drawnIslands: readonly Island[] | null = null;
  private readonly frame = new Sprite();
  private readonly buttons: readonly FrameButton[];
  private hovered: FrameButton | null = null;
  private readonly alerts: Readonly<Record<AlertId, PickAlert>>;
  /** Seconds into the marks' breath: they breathe together */
  private alertClock = 0;
  /** Seconds the minimap has been drawn, for the light round where the story sends the player */
  private time = 0;
  private readonly fitHint = t('The guns wait in the hold');
  /** The pointer is on the map: the hint over the frame says what a click does */
  private overMap = false;
  private readonly mapHint = t('Map (M)');
  /** The full screen's hint while the game fills the screen */
  private readonly leaveFullHint = t('Leave full screen');
  /** The hint over the button under the pointer, or over the frame */
  private readonly hint = text('', 12, UI.text, {
    fontWeight: 'bold',
    stroke: { color: 0x000000, width: 3 },
    // The talents' and the mastery's hints have a second line while something waits there
    align: 'center',
  });
  /** The square the ship is in, gold at the bottom of the opening */
  private readonly square = subheading('', SQUARE.size);
  private readonly map: MapProjection;
  /** The map's turn and scale round the world's origin, at (0, 0): what the islands are drawn with */
  private readonly atOrigin: MapProjection;

  constructor(axes: MapAxes, onOpen: () => void, actions: MinimapActions) {
    this.map = new MapProjection(axes);
    this.map.screenX = OPENING.x;
    this.map.screenY = OPENING.y;
    this.map.scale = OPENING.rx / RANGE;
    this.atOrigin = new MapProjection(axes);
    this.atOrigin.scale = this.map.scale;

    const { x, y, rx, ry } = OPENING;
    const background = new Graphics()
      .ellipse(x, y, rx + UNDER_RIM, ry + UNDER_RIM)
      .fill({ color: CHART.sea, alpha: 0.92 });
    const rim = new Graphics()
      .ellipse(x, y, rx, ry)
      .stroke({ width: 2, color: UI.border, alpha: 0.55 })
      .ellipse(x, y, rx - 3, ry - 3)
      .stroke({ width: 1, color: UI.border, alpha: 0.15 });
    this.clip.ellipse(x, y, rx + UNDER_RIM, ry + UNDER_RIM).fill({ color: 0xffffff });
    this.inside.addChild(this.under, this.islands, this.content, this.markers.container, this.top);
    this.inside.mask = this.clip;
    this.square.anchor.set(0.5, 1);
    this.square.position.set(x, y + ry - SQUARE.above * FRAME_SCALE);
    this.frame.visible = false;
    this.disc.addChild(background, this.inside, this.clip, rim, this.frame, this.square);
    this.disc.eventMode = 'static';
    this.disc.cursor = 'compass' satisfies CursorId;
    // The frame's ring too, but not its spikes and the slots on top
    this.disc.hitArea = new Ellipse(x, y, rx * FRAME.reach, ry * FRAME.reach);
    // A click on the minimap must not reach the stage, which would steer the ship
    this.disc.on('pointerdown', (e) => e.stopPropagation());
    this.disc.on('pointertap', onOpen);
    this.disc.on('pointerover', () => (this.overMap = true));
    this.disc.on('pointerout', () => (this.overMap = false));
    Assets.load<Texture>({ src: FRAME_URL, data: { autoGenerateMipmaps: true } })
      .then((texture) => {
        this.frame.texture = texture;
        this.frame.setSize(FRAME_WIDTH, FRAME_HEIGHT);
        this.frame.visible = true;
        rim.visible = false;
      })
      .catch((error) => console.warn("The minimap's frame failed to load", error));

    // Over the disc, which would open the chart: the buttons are its siblings, so their clicks don't reach it
    this.buttons = BUTTONS.map(({ id, hint, medallion }, i) =>
      this.button(
        id,
        FRAME.slots[i],
        medallion ? BUTTON_RADIUS * 2 : ICON_SIZE,
        t(hint),
        id === 'fullscreen' ? toggleFullscreen : actions[id],
      ),
    );
    MINIMAP_BUTTONS.load(() => {
      for (const { id, picture, size } of this.buttons) {
        const texture = MINIMAP_BUTTONS.get(id);
        if (!texture) continue;
        picture.texture = texture;
        picture.setSize(size, size);
      }
    });
    this.alerts = {
      talents: this.pickAlert('talents'),
      mastery: this.pickAlert('mastery'),
      loadout: this.pickAlert('loadout'),
    };
    this.hint.anchor.set(0.5, 1);
    this.hint.visible = false;
    // The badges over every button: each reaches towards the next one
    this.container.addChild(
      this.disc,
      ...this.buttons.map((b) => b.container),
      this.alerts.talents.badge,
      this.alerts.mastery.badge,
      this.alerts.loadout.badge,
      this.hint,
    );
  }

  /**
   * Draws the minimap with its top left corner at (left, top) on the screen. lit: the buttons whose windows are open;
   * dt: seconds since the last frame, for the marks on the talents' and the mastery's buttons
   */
  update(
    state: GameState,
    selection: Selection,
    left: number,
    top: number,
    screenWidth: number,
    lit: MinimapLit,
    dt: number,
  ) {
    this.container.position.set(left, top);
    this.time += dt;
    this.updateAlerts(state, dt);
    // The full screen's button follows the page's state, however it changed (Escape leaves the full screen too)
    const full = isFullscreen();
    for (const button of this.buttons) {
      const { id } = button;
      this.paint(button, id === 'fullscreen' ? full : id !== 'logout' && lit[id]);
    }
    this.showHint(screenWidth - left, full);

    const { ship } = state;
    show(this.square, squareName(ship.x, ship.y));
    const map = this.map;
    map.centerX = ship.x;
    map.centerY = ship.y;
    const under = this.under.clear();
    under.circle(OPENING.x, OPENING.y, ship.viewRange * map.scale).fill({ color: CHART.seen, alpha: 0.8 });
    const { spotted } = ship;
    if (spotted) {
      const sx = map.x(spotted.x, spotted.y);
      const sy = map.y(spotted.x, spotted.y);
      under.circle(sx, sy, spotted.radius * map.scale).fill({ color: CHART.seen, alpha: 0.8 });
    }
    this.drawGrid(under, ship.x, ship.y);
    const { islands } = state.world;
    if (islands !== this.drawnIslands) {
      this.drawnIslands = islands;
      drawIslands(this.islands.clear(), islands, this.atOrigin);
    }
    this.islands.position.set(map.x(0, 0), map.y(0, 0));
    const g = this.content.clear();
    drawRoute(g, ship, map, 1.2);
    const markers = this.markers;
    markers.begin();
    // The boss's lair, seen or not, under its crown; the harbour, its lighthouse silver while a bounty waits there (on
    // the rim, far off, if the story sends the player nowhere)
    const { zone } = state.world;
    const lair = bossLair(zone);
    const boss = zoneBoss(zone);
    if (lair && boss) {
      const marker = bossMarker(SHIP_CLASSES[boss.shipClass]);
      if (!markers.put(marker, map.x(lair.x, lair.y), map.y(lair.x, lair.y), MARKER.boss, 0.8)) {
        drawBossLair(g, map, LANDMARK_SIZE, zone);
      }
    }
    const goal = storyGoal(state, state.player);
    const waiting = bountyWaiting(state);
    if (goal?.kind !== 'port') {
      const { mooring } = state.world.port;
      const home = this.onRimIf(waiting && !goal, map.x(mooring.x, mooring.y), map.y(mooring.x, mooring.y));
      markers.put(waiting ? 'questHome' : 'port', home.x, home.y, MARKER.home);
    }

    // Only what the ship can see: the rest is in the fog of war, but for the prey the story brought in for the player.
    // Each unit its painted marker: the story's prey gold, a bounty's silver, a boss crowned, hostile red, the rest
    // green; the one the ship fires at in a sight
    const targets = storyTargets(state.player);
    const bounties = bountyTargets(state);
    for (const unit of state.ships) {
      if (unit === ship || !isAfloat(unit)) continue;
      if (unit.bot?.prey !== ship.id && !ship.canSee(unit.x, unit.y)) continue;
      const x = map.x(unit.x, unit.y);
      const y = map.y(unit.x, unit.y);
      if (unit.id === ship.attackTarget) markers.put('target', x, y, MARKER.target, 0.9);
      const marker = unitMarker(unit, ship.id, targets, bounties);
      const size =
        marker === 'storyPrey' || marker === 'questPrey'
          ? MARKER.prey
          : marker.startsWith('boss')
            ? MARKER.boss
            : MARKER.unit;
      if (!markers.put(marker, x, y, size)) {
        g.circle(x, y, UNIT_RADIUS)
          .fill({ color: unitColor(unit, ship.id) })
          .stroke({ width: 1, color: 0x000000, alpha: 0.5 });
        if (targets.includes(unit.shipClass.id)) {
          g.circle(x, y, UNIT_RADIUS + TARGET_RING).stroke({ width: 1.5, color: CHART.story });
        }
      }
      if (unit.id === selection.id) g.circle(x, y, size / 2 + 2).stroke({ width: 1.5, color: COLORS.selected });
    }
    // Chests in sight: gold diamonds
    for (const chest of state.chests) {
      if (!ship.canSee(chest.x, chest.y)) continue;
      const x = map.x(chest.x, chest.y);
      const y = map.y(chest.x, chest.y);
      g.poly([x, y - 4, x + 4, y, x, y + 4, x - 4, y])
        .fill({ color: CHEST_COLOR })
        .stroke({ width: 1, color: 0x3a2400 });
    }
    drawLostCargo(g, state, map, LANDMARK_SIZE);
    drawGates(g, markers, map, state.world.gates, LANDMARK_SIZE, ship.shipClass.tier);
    // Where the story sends the player, always in sight: on the rim, the way to steer, while it is far off; breathing
    // gold, over everything but the ship
    if (goal) {
      const at = this.onRim(map.x(goal.x, goal.y), map.y(goal.x, goal.y));
      drawGoalGlow(g, at.x, at.y, MARKER.goal, this.time);
      if (!markers.put(goalMarker(goal), at.x, at.y, MARKER.goal)) {
        drawStoryMark(g, map, state, LANDMARK_SIZE, (x, y) => this.onRim(x, y));
      }
    }
    markers.end();
    drawShipArrow(this.top.clear(), ship, map, ME_SIZE);
  }

  /** A button of the frame, for the story's guide to point at: its round face, not its halo */
  target(id: MinimapButtonId): GuideTarget | null {
    const button = this.buttons.find((b) => b.id === id);
    const r = BUTTON_RADIUS;
    return button ? { container: button.container, box: { x: -r, y: -r, width: r * 2, height: r * 2 } } : null;
  }

  /** A point of the map moved onto the opening's edge if it is beyond it, when `rim`; else where it is */
  private onRimIf(rim: boolean, x: number, y: number) {
    return rim ? this.onRim(x, y) : { x, y };
  }

  /** A point of the map, pixels in the frame, moved onto the opening's edge (a little inside) if it is beyond it */
  private onRim(x: number, y: number) {
    const rx = OPENING.rx - RIM_INSET;
    const ry = OPENING.ry - RIM_INSET;
    const dx = x - OPENING.x;
    const dy = y - OPENING.y;
    const out = Math.hypot(dx / rx, dy / ry);
    return out <= 1 ? { x, y } : { x: OPENING.x + dx / out, y: OPENING.y + dy / out };
  }

  /**
   * A round button in a slot of the frame (`at`: its middle, in the frame's picture's pixels), its picture `size`
   * pixels on the screen under its ring
   */
  private button(
    id: MinimapButtonId,
    at: readonly [number, number],
    size: number,
    hint: string,
    onTap: () => void,
  ): FrameButton {
    const container = new Container();
    container.position.set(at[0] * FRAME_SCALE, at[1] * FRAME_SCALE);
    // The full screen's only where the browser lets the page fill it: elsewhere its slot stays empty
    container.visible = id !== 'fullscreen' || canFillScreen();
    const picture = new Sprite();
    picture.anchor.set(0.5);
    const ring = new Graphics();
    container.addChild(picture, ring);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.hitArea = new Circle(0, 0, BUTTON_RADIUS);
    const button: FrameButton = { id, container, picture, size, ring, hint, painted: '' };
    // Not to the stage, which would steer the ship
    container.on('pointerdown', (e) => e.stopPropagation());
    container.on('pointertap', () => {
      playTap();
      onTap();
    });
    container.on('pointerover', () => (this.hovered = button));
    container.on('pointerout', () => {
      if (this.hovered === button) this.hovered = null;
    });
    return button;
  }

  /**
   * The hint over the button under the pointer, or over the frame's top while the pointer is on the map; clear of the
   * screen's right edge, `right` pixels from the frame's left one. full: whether the game fills the screen
   */
  private showHint(right: number, full: boolean) {
    const button = this.hovered;
    if (button) {
      show(this.hint, this.hintOf(button, full));
      const x = Math.min(button.container.x, right - HINT_EDGE - this.hint.width / 2);
      this.hint.position.set(x, button.container.y - BUTTON_RADIUS * HOVER_SCALE - HINT_GAP);
    } else if (this.overMap) {
      show(this.hint, this.mapHint);
      this.hint.position.set(OPENING.x, -HINT_GAP);
    }
    this.hint.visible = button !== null || this.overMap;
  }

  /**
   * What a button's hint says: the full screen's while the game fills the screen, the talents' and the mastery's what
   * waits too
   */
  private hintOf(button: FrameButton, full: boolean) {
    if (button.id === 'fullscreen' && full) return this.leaveFullHint;
    if (button.id === 'loadout' && this.alerts.loadout.badge.visible) return `${button.hint}\n${this.fitHint}`;
    const alert = button.id === 'talents' || button.id === 'mastery' ? this.alerts[button.id] : null;
    if (alert?.badge.visible) return `${button.hint}\n${pickLabel(alert.points, alert.milestones)}`;
    return button.hint;
  }

  /**
   * A button's mark, hidden: its halo under the medallion, and its badge, its middle where the mark goes, for the update
   * to show
   */
  private pickAlert(id: AlertId): PickAlert {
    const halo = new Graphics();
    const { rings, step, alpha } = ALERT.halo;
    for (let i = rings; i >= 1; i--) {
      halo.circle(0, 0, BUTTON_RADIUS + i * step).fill({ color: ALERT.color, alpha: alpha / i });
    }
    const badge = new Container();
    const mark = text('!', ALERT.size, UI.darkText, { fontWeight: 'bold' });
    mark.anchor.set(0.5);
    badge.addChild(
      new Graphics().circle(0, 0, ALERT.radius).fill({ color: ALERT.color }).stroke({ width: 1, color: ALERT.edge }),
      mark,
    );
    const button = this.buttons.find((b) => b.id === id);
    if (button) {
      button.container.addChildAt(halo, 0);
      const { x, y } = button.container;
      badge.position.set(x + BUTTON_RADIUS * ALERT.at, y - BUTTON_RADIUS * ALERT.at);
    }
    halo.visible = false;
    badge.visible = false;
    return { halo, badge, points: 0, milestones: 0, popAge: ALERT.pop.time };
  }

  /**
   * The marks while a talent waits to be picked, a captain's point to be spent or the story's guns to be fitted,
   * breathing together. dt: seconds since the last frame
   */
  private updateAlerts(state: GameState, dt: number) {
    const { ship } = state;
    this.alertClock = (this.alertClock + dt) % ALERT.pulse;
    const breath = Math.sin((this.alertClock / ALERT.pulse) * Math.PI) ** 2;
    const afloat = !ship.isSinking;
    this.updateAlert(this.alerts.talents, pointsToSpend(ship), milestonesToPick(ship), afloat, breath, dt);
    this.updateAlert(this.alerts.mastery, captainPoints(state, state.player).left, 0, afloat, breath, dt);
    const fitting = storyFitting(state, state.player) !== null ? 1 : 0;
    this.updateAlert(this.alerts.loadout, fitting, 0, afloat, breath, dt);
  }

  /**
   * A button's mark while `points` wait to be spent or `milestones` to be picked, and the ship is `afloat`. breath: how
   * far the marks are into a breath (0…1, its top at 1); dt: seconds since the last frame
   */
  private updateAlert(
    alert: PickAlert,
    points: number,
    milestones: number,
    afloat: boolean,
    breath: number,
    dt: number,
  ) {
    if (points + milestones > alert.points + alert.milestones) alert.popAge = 0;
    alert.points = points;
    alert.milestones = milestones;
    const shown = points + milestones > 0 && afloat;
    alert.halo.visible = shown;
    alert.badge.visible = shown;
    if (!shown) return;
    alert.halo.alpha = 0.35 + 0.65 * breath;
    alert.popAge = Math.min(ALERT.pop.time, alert.popAge + dt);
    const pop = 1 + (ALERT.pop.scale - 1) * (1 - alert.popAge / ALERT.pop.time) ** 2;
    alert.badge.scale.set(pop * (1 + ALERT.breath * breath));
  }

  /** A button as it is now: bigger under the pointer, a gold ring round it when `lit` */
  private paint(button: FrameButton, lit: boolean) {
    const hovered = this.hovered === button;
    const key = `${hovered}${lit}`;
    if (key === button.painted) return;
    button.painted = key;
    button.container.scale.set(hovered ? HOVER_SCALE : 1);
    const ring = button.ring.clear();
    if (lit) {
      ring
        .circle(0, 0, BUTTON_RADIUS + 3)
        .stroke({ width: 3, color: LIT, alpha: 0.3 })
        .circle(0, 0, BUTTON_RADIUS + 0.5)
        .stroke({ width: 2, color: LIT, alpha: 0.95 });
    } else if (hovered) {
      ring.circle(0, 0, BUTTON_RADIUS + 0.5).stroke({ width: 1.5, color: UI.border, alpha: 0.6 });
    }
  }

  /** The lines between the map's squares near the ship, and the world's edge if it is near */
  private drawGrid(g: Graphics, x: number, y: number) {
    const map = this.map;
    const x0 = Math.max(0, x - RANGE);
    const x1 = Math.min(WORLD_WIDTH, x + RANGE);
    const y0 = Math.max(0, y - RANGE);
    const y1 = Math.min(WORLD_HEIGHT, y + RANGE);
    for (const gx of gridLines(x - RANGE, x + RANGE, WORLD_WIDTH)) {
      const edge = gx === 0 || gx === WORLD_WIDTH;
      g.moveTo(map.x(gx, y0), map.y(gx, y0))
        .lineTo(map.x(gx, y1), map.y(gx, y1))
        .stroke({ width: edge ? 2 : 1, color: CHART.grid, alpha: edge ? 0.6 : 0.16 });
    }
    for (const gy of gridLines(y - RANGE, y + RANGE, WORLD_HEIGHT)) {
      const edge = gy === 0 || gy === WORLD_HEIGHT;
      g.moveTo(map.x(x0, gy), map.y(x0, gy))
        .lineTo(map.x(x1, gy), map.y(x1, gy))
        .stroke({ width: edge ? 2 : 1, color: CHART.grid, alpha: edge ? 0.6 : 0.16 });
    }
  }
}
