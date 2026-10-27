import { Assets, Circle, Container, Ellipse, Graphics, Sprite, type Rectangle, type Texture } from 'pixi.js';
import { MAP_SQUARE, WORLD_HEIGHT, WORLD_WIDTH, isAfloat, isHostile, type GameState, type Unit } from '../../game';
import type { Selection } from '../input/selection';
import {
  CHART,
  MapProjection,
  drawBossLair,
  drawGates,
  drawIsland,
  drawLostCargo,
  drawRoute,
  drawShipArrow,
  squareName,
  type MapAxes,
} from './chart';
import { canFillScreen, isFullscreen, toggleFullscreen } from './fullscreen';
import { MINIMAP_BUTTONS, type MinimapButtonId } from './iconAtlas';
import { THEME, drawMedallion, subheading } from './theme';
import { UI, drawFullscreen, drawGear, playTap, show, text } from './ui';
import { t } from '../i18n/i18n';

// Made by blender-assets/hud/build_minimap_frame.py, which prints the figures in FRAME
const FRAME_URL = `${import.meta.env.BASE_URL}sprites/hud/minimap_frame.webp`;
/**
 * The frame's picture, in its own pixels: its size, the oval opening the map shows through (its middle and radii), how
 * far out round the opening its ring reaches (in the opening's radii), and the dark slots on top, left to right (their
 * middles and radius)
 */
const FRAME = {
  width: 652,
  height: 603,
  x: 326.2,
  y: 308,
  rx: 223.8,
  ry: 204,
  reach: 1.306,
  slots: [
    [169.5, 94.2],
    [268.8, 63.8],
    [383.2, 63.8],
    [482.5, 94.2],
  ],
  slot: 34.4,
} as const;
const FRAME_WIDTH = 224; // pixels on the screen
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
// A button's radius, in its slot's: its own gold rim lies on the slot's edge
const BUTTON_OVER_SLOT = 1.05;
const BUTTON_RADIUS = FRAME.slot * BUTTON_OVER_SLOT * FRAME_SCALE;
const HOVER_SCALE = 1.15; // a button under the pointer grows
const LIT = 0xf3d58a; // the ring round a button whose window is open
const HINT_GAP = 3; // pixels between a button and its hint above it
const HINT_EDGE = 4; // pixels a hint keeps from the screen's right edge
// The two smaller medallions in the frame's empty top corners, left and right of the slots (their middles, in the
// frame's picture's pixels; clear of the slots and the ring), their radius and their icons' size on the screen (pixels)
const CORNERS = { settings: [80, 98], fullscreen: [572, 98] } as const;
const CORNER = { radius: 13, icon: 11 } as const;
/** The buttons in the frame's slots, left to right, and what each one's hint says (English: t() when the HUD is made) */
const BUTTONS: readonly { readonly id: MinimapButtonId; readonly hint: string }[] = [
  { id: 'hold', hint: 'Hold (H)' },
  { id: 'loadout', hint: 'Loadout (L)' },
  { id: 'talents', hint: 'Talents (K)' },
  { id: 'mastery', hint: "Captain's mastery (P)" },
];
const MARGIN = 16; // pixels from the screen's edges
const RANGE = 1200; // world units from the ship to the rim at the opening's sides, where it is widest
const GAP = 30; // pixels above the skill bar (and its status line), when the minimap would overlap it
// The square the ship is in, at the bottom of the opening: its letters' size and how far above the rim (pixels)
const SQUARE = { size: 14, inset: 5 } as const;
const UNIT_RADIUS = 3; // pixels
const CHEST_COLOR = 0xffcf3f;
const ME_SIZE = 11; // pixels: the player's arrow
const LANDMARK_SIZE = 4; // pixels: the lost cargo's and the boss's marks
const COLORS = { neutral: 0xf4f1e6, selected: 0xf2b33d } as const;

/** What the buttons on top of the frame do: each opens or closes its window (the slots', and the settings) */
export type MinimapActions = Readonly<Record<MinimapButtonId | 'settings', () => void>>;
/** Which of the buttons' windows are open: those buttons are lit */
export type MinimapLit = Readonly<Record<MinimapButtonId | 'settings', boolean>>;

/** A button on the frame: a painted medallion in a slot, or a drawn one in a corner */
interface FrameButton {
  readonly container: Container;
  /** Round it: gold while its window is open, pale under the pointer */
  readonly ring: Graphics;
  readonly radius: number;
  hint: string;
  /** As last painted, to repaint only on change */
  painted: string;
}

/** A slot's button, its painted picture loaded with the atlas */
interface SlotButton {
  readonly id: MinimapButtonId;
  readonly button: FrameButton;
  readonly picture: Sprite;
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
 * like the screen, with the islands near, the squares of the map, the water the ship can see and every unit and chest
 * in it (an enemy red, a chest a gold diamond), the ship's way on, and the square it is in. Until the
 * frame's picture has loaded the opening has a thin rim of its own.
 * A click on it (or M) opens the sea chart. The four slots on top of the frame are buttons: the hold, the loadout, the
 * ship's talents and the captain's mastery, each lit while its window is open; and in the frame's top corners two
 * smaller ones, the settings and the full screen (where the browser allows it)
 */
export class Minimap {
  readonly container = new Container();
  private readonly disc = new Container();
  private readonly content = new Graphics();
  private readonly clip = new Graphics();
  private readonly frame = new Sprite();
  private readonly buttons: readonly SlotButton[];
  private readonly settings: FrameButton;
  private readonly fullscreen: FrameButton;
  private readonly fullscreenIcon = new Graphics();
  /** Whether the full screen's icon was drawn for the full screen; null before the first frame */
  private drawnFull: boolean | null = null;
  private hovered: FrameButton | null = null;
  /** The pointer is on the map: the hint over the frame says what a click does */
  private overMap = false;
  private readonly mapHint = t('Map (M)');
  /** The hint over the button under the pointer, or over the frame */
  private readonly hint = text('', 12, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } });
  /** The square the ship is in, gold at the bottom of the opening */
  private readonly square = subheading('', SQUARE.size);
  private readonly map: MapProjection;

  constructor(axes: MapAxes, onOpen: () => void, actions: MinimapActions) {
    this.map = new MapProjection(axes);
    this.map.screenX = OPENING.x;
    this.map.screenY = OPENING.y;
    this.map.scale = OPENING.rx / RANGE;

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
    this.content.mask = this.clip;
    this.square.anchor.set(0.5, 1);
    this.square.position.set(x, y + ry - SQUARE.inset);
    this.frame.visible = false;
    this.disc.addChild(background, this.content, this.clip, rim, this.frame, this.square);
    this.disc.eventMode = 'static';
    this.disc.cursor = 'pointer';
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
    this.buttons = BUTTONS.map(({ id, hint }, i) => {
      const button = this.button(FRAME.slots[i], BUTTON_RADIUS, t(hint), actions[id]);
      const picture = new Sprite();
      picture.anchor.set(0.5);
      button.container.addChildAt(picture, 0);
      return { id, button, picture };
    });
    MINIMAP_BUTTONS.load(() => {
      for (const { id, picture } of this.buttons) {
        const texture = MINIMAP_BUTTONS.get(id);
        if (!texture) continue;
        picture.texture = texture;
        picture.setSize(BUTTON_RADIUS * 2, BUTTON_RADIUS * 2);
      }
    });
    this.settings = this.button(CORNERS.settings, CORNER.radius, t('Settings'), actions.settings);
    const gear = new Graphics();
    drawGear(gear, CORNER.icon, THEME.brassLight);
    this.settings.container.addChildAt(drawMedallion(new Graphics(), CORNER.radius), 0);
    this.settings.container.addChildAt(gear, 1);
    this.fullscreen = this.button(CORNERS.fullscreen, CORNER.radius, '', toggleFullscreen);
    this.fullscreen.container.addChildAt(drawMedallion(new Graphics(), CORNER.radius), 0);
    this.fullscreen.container.addChildAt(this.fullscreenIcon, 1);
    this.fullscreen.container.visible = canFillScreen();
    this.hint.anchor.set(0.5, 1);
    this.hint.visible = false;
    this.container.addChild(
      this.disc,
      ...this.buttons.map((b) => b.button.container),
      this.settings.container,
      this.fullscreen.container,
      this.hint,
    );
  }

  /**
   * Lays the minimap out in the bottom right corner, above the skill bar (`bar`) if it would overlap it, and draws it.
   * lit: the buttons whose windows are open
   */
  update(
    state: GameState,
    selection: Selection,
    screenWidth: number,
    screenHeight: number,
    bar: Rectangle,
    lit: MinimapLit,
  ) {
    const left = screenWidth - MARGIN - FRAME_WIDTH;
    const overlaps = bar.width > 0 && left < bar.x + bar.width;
    const bottom = overlaps ? bar.y - GAP : screenHeight - MARGIN;
    this.container.position.set(Math.round(left), Math.round(bottom - FRAME_HEIGHT));
    for (const { id, button } of this.buttons) this.paint(button, lit[id]);
    this.paint(this.settings, lit.settings);
    // Its icon and hint follow the page's state, however it changed (Escape leaves the full screen too)
    const full = isFullscreen();
    if (full !== this.drawnFull) {
      this.drawnFull = full;
      drawFullscreen(this.fullscreenIcon.clear(), CORNER.icon, THEME.brassLight, full);
      this.fullscreen.hint = full ? t('Leave full screen') : t('Full screen');
    }
    this.paint(this.fullscreen, false);
    this.showHint(screenWidth - left);

    const { ship } = state;
    show(this.square, squareName(ship.x, ship.y));
    const map = this.map;
    map.centerX = ship.x;
    map.centerY = ship.y;
    const g = this.content.clear();
    g.circle(OPENING.x, OPENING.y, ship.viewRange * map.scale).fill({ color: CHART.seen, alpha: 0.8 });
    this.drawGrid(g, ship.x, ship.y);
    for (const island of state.world.islands) {
      if (Math.hypot(island.x - ship.x, island.y - ship.y) < RANGE + island.reach) drawIsland(g, island, map, 1);
    }
    drawRoute(g, ship, map, 1.2);

    // Only what the ship can see: the rest is in the fog of war
    for (const unit of state.ships) {
      if (unit === ship || !isAfloat(unit) || !ship.canSee(unit.x, unit.y)) continue;
      const x = map.x(unit.x, unit.y);
      const y = map.y(unit.x, unit.y);
      g.circle(x, y, UNIT_RADIUS)
        .fill({ color: unitColor(unit, ship.id) })
        .stroke({ width: 1, color: 0x000000, alpha: 0.5 });
      if (unit.id === selection.id) g.circle(x, y, UNIT_RADIUS + 3).stroke({ width: 1.5, color: COLORS.selected });
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
    drawBossLair(g, map, LANDMARK_SIZE, state.world.zone);
    drawGates(g, map, state.world.gates, LANDMARK_SIZE);
    drawShipArrow(g, ship, map, ME_SIZE);
  }

  /**
   * A round button on the frame (`at`: its middle, in the frame's picture's pixels; `radius`: on the screen). Its owner
   * puts what it shows under its ring
   */
  private button(at: readonly [number, number], radius: number, hint: string, onTap: () => void): FrameButton {
    const container = new Container();
    container.position.set(at[0] * FRAME_SCALE, at[1] * FRAME_SCALE);
    const ring = new Graphics();
    container.addChild(ring);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.hitArea = new Circle(0, 0, radius);
    const button: FrameButton = { container, ring, radius, hint, painted: '' };
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
   * screen's right edge, `right` pixels from the frame's left one
   */
  private showHint(right: number) {
    const button = this.hovered;
    if (button) {
      show(this.hint, button.hint);
      const x = Math.min(button.container.x, right - HINT_EDGE - this.hint.width / 2);
      this.hint.position.set(x, button.container.y - button.radius * HOVER_SCALE - HINT_GAP);
    } else if (this.overMap) {
      show(this.hint, this.mapHint);
      this.hint.position.set(OPENING.x, -HINT_GAP);
    }
    this.hint.visible = button !== null || this.overMap;
  }

  /** A button as it is now: bigger under the pointer, a gold ring round it when `lit` */
  private paint(button: FrameButton, lit: boolean) {
    const hovered = this.hovered === button;
    const key = `${hovered}${lit}`;
    if (key === button.painted) return;
    button.painted = key;
    button.container.scale.set(hovered ? HOVER_SCALE : 1);
    const ring = button.ring.clear();
    const { radius } = button;
    if (lit) {
      ring
        .circle(0, 0, radius + 3)
        .stroke({ width: 3, color: LIT, alpha: 0.3 })
        .circle(0, 0, radius + 0.5)
        .stroke({ width: 2, color: LIT, alpha: 0.95 });
    } else if (hovered) {
      ring.circle(0, 0, radius + 0.5).stroke({ width: 1.5, color: UI.border, alpha: 0.6 });
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
