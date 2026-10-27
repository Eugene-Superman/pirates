import { Assets, Container, FillGradient, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import {
  SHIP_CLASSES,
  MAP_SQUARE,
  MAP_SQUARES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  ZONES,
  islandOutline,
  signedDistanceToPolygon,
  zoneBoss,
  type GameState,
  type GatePlace,
  type Island,
  type Ship,
  type ZoneId,
} from '../../game';
import {
  CHART,
  MapProjection,
  bossLair,
  columnName,
  drawGates,
  drawLostCargo,
  drawShipArrow,
  type MapAxes,
} from './chart';
import { THEME, TITLE_STYLE, brassButton, subheading } from './theme';
import { Tooltip, type TooltipText } from './Tooltip';
import { playTap, show } from './ui';
import { t } from '../i18n/i18n';

// Made by blender-assets/hud/build_chart_frame.py, which prints the figures in FRAME
const FRAME_URL = `${import.meta.env.BASE_URL}sprites/hud/chart_frame.webp`;
/**
 * The frame's picture, in its own pixels: its size (it is square), the diamond opening the chart shows through (its
 * middle and half diagonals, out to its tips under the brass spikes), and the close button's slot in the top right
 * corner (the middle and half size of its dark inside)
 */
const FRAME = {
  size: 1254,
  x: 625,
  y: 620.5,
  rx: 566,
  ry: 562.3,
  close: { x: 1147, y: 116.5, half: 31.8 },
} as const;

const COLORS = {
  seaMiddle: 0x1d5a7c, // the open sea in the chart's middle
  sea: 0x154768,
  seaEdge: 0x0b2943, // and at its tips, under the frame
  edgeShade: 0x02070d, // the frame's shadow along the opening's edges
  shallow: 0x6fd0e0,
  waterline: 0xd2f0f8, // the lines round a coast, as on an old chart
  sand: 0xe8d18f,
  coast: 0x6b5a2e,
  land: 0x5c9440,
  hill: 0x467d31,
  hillTop: 0x6aa84c,
  palm: 0x24561d,
  course: 0xf1e3bf, // the ship's way on, pencilled in
  bossDisc: 0x3c0b08,
  bossRing: 0x8a1c14,
  bone: 0xefe3c2,
  boneShade: 0x1c0604,
} as const;

const MARGIN = 16; // pixels from the screen's edges to the frame
const UNDER_RIM = 3; // pixels the chart reaches under the opening's brass edge, so its own edge shows no gap
const CLOSE_RIM = 12; // the frame's pixels of the slot's brass rim round its inside: a click on it closes too
const CROSS = 0.55; // the close button's cross, in its slot's inside
const DIM_ALPHA = 0.55;
// The frame's shadow along the opening's edges: strokes over the edge, each `width` pixels wider than the last
const EDGE_SHADE = { steps: 4, width: 9, alpha: 0.1 } as const;
const SHALLOWS = 5; // pixels of shallow water round a coast
// The lines round a coast: pixels out from it, how bright
const WATERLINES = [
  { offset: 3.5, alpha: 0.42 },
  { offset: 7.5, alpha: 0.24 },
  { offset: 12, alpha: 0.12 },
] as const;
const ISLAND_SHADOW = { x: 1.5, y: 2, alpha: 0.35 } as const; // pixels down and right of an island, as carved
// An island's land inside its beach, its hill's foot and its top, as shares of its coast's radius (the 3D island's)
const LAND = 0.72;
const HILL = [0.42, 0.22] as const;
const HILL_MIN = 7; // pixels: a smaller island shows no hill
const PALM_RADIUS = 1.3; // pixels
const GRID_ALPHA = 0.3;
const LABEL = { size: 13, inset: 15, alpha: 0.9 } as const; // the squares' letters and numbers inside the edges, pixels
const SQUARE_SIZE = 16; // pixels: the name of the square under the pointer, in its middle
const ME_SIZE = 16; // pixels: the player's arrow
const LANDMARK_SIZE = 6; // pixels: the lost cargo's mark
const COURSE = { dash: 7, gap: 5, width: 1.5, end: 3.5 } as const; // pixels: the ship's way on
// The boss's medallion: its radius (pixels), the seconds a ring takes to spread from it, and how far round it the
// pointer tells of it (in its radius)
const BOSS = { radius: 13, period: 2.4, rings: 2, hover: 1.4 } as const;
const PORT_HOVER = 4; // pixels off the port's coast the pointer still tells of it
const GATE = { size: 6, hover: 16 } as const; // pixels: a gate's mark, and how far round it the pointer tells of it
// The world chart's button in the frame's bottom left corner: its size and its inset from the frame's edges, pixels
const WORLD_BUTTON = { width: 170, height: 30, inset: 22 } as const;

/** The boss's medallion round (0, 0): a skull over crossed bones on dark red, in a brass ring */
function drawBossMedallion(g: Graphics, r: number) {
  g.circle(0, 0, r * 1.5).fill({ color: CHART.boss, alpha: 0.16 });
  g.circle(0, 0, r).fill({ color: COLORS.bossDisc }).stroke({ width: 1.6, color: THEME.brass });
  g.circle(0, 0, r * 0.84).stroke({ width: 1, color: COLORS.bossRing });
  for (const side of [1, -1]) {
    const x0 = -0.56 * r * side;
    const x1 = 0.56 * r * side;
    const y0 = -0.3 * r;
    const y1 = 0.62 * r;
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ width: 0.17 * r, color: COLORS.bone, cap: 'round' });
    for (const [x, y] of [
      [x0, y0],
      [x1, y1],
    ]) {
      g.circle(x - 0.07 * r, y + 0.04 * r * side, 0.1 * r).fill({ color: COLORS.bone });
      g.circle(x + 0.04 * r, y - 0.07 * r * side, 0.1 * r).fill({ color: COLORS.bone });
    }
  }
  g.circle(0, -0.14 * r, 0.4 * r).fill({ color: COLORS.bone });
  g.roundRect(-0.22 * r, 0.12 * r, 0.44 * r, 0.24 * r, 0.06 * r).fill({ color: COLORS.bone });
  for (const side of [1, -1]) g.circle(0.15 * r * side, -0.13 * r, 0.11 * r).fill({ color: COLORS.boneShade });
  g.poly([0, 0.02 * r, 0.05 * r, 0.1 * r, -0.05 * r, 0.1 * r]).fill({ color: COLORS.boneShade });
  for (const x of [-0.1, 0, 0.1]) {
    g.moveTo(x * r, 0.2 * r)
      .lineTo(x * r, 0.34 * r)
      .stroke({ width: 0.04 * r, color: COLORS.boneShade });
  }
}

/** The ship's way on, pencilled in: dashes from it along the route left to sail, a ring at its end */
function drawCourse(g: Graphics, ship: Ship, map: MapProjection) {
  if (!ship.target || ship.route.length === 0) return;
  const period = COURSE.dash + COURSE.gap;
  let x = map.x(ship.x, ship.y);
  let y = map.y(ship.x, ship.y);
  let along = 0; // pixels along the whole course
  for (const p of ship.route) {
    const toX = map.x(p.x, p.y);
    const toY = map.y(p.x, p.y);
    const length = Math.hypot(toX - x, toY - y);
    for (let at = 0; at < length;) {
      const phase = along % period;
      const step = Math.min(length - at, phase < COURSE.dash ? COURSE.dash - phase : period - phase);
      if (phase < COURSE.dash) {
        const a = at / length;
        const b = (at + step) / length;
        g.moveTo(x + (toX - x) * a, y + (toY - y) * a).lineTo(x + (toX - x) * b, y + (toY - y) * b);
      }
      at += step;
      along += step;
    }
    x = toX;
    y = toY;
  }
  g.stroke({ width: COURSE.width, color: COLORS.course, alpha: 0.8, cap: 'round' });
  g.circle(x, y, COURSE.end).stroke({ width: COURSE.width, color: COLORS.course, alpha: 0.9 });
}

/**
 * The sea chart: the whole world, turned like the screen, in MAP_SQUARES × MAP_SQUARES squares named A1…H8 (the
 * letters west to east along its north edge, the numbers north to south along its east edge), in the diamond opening
 * of a painted frame and nothing else. Painted to go with the frame: deep water darkening to its edges, the islands as
 * in the game (shallows and lines round their coasts, beach, land, hills, palms), the brass lines of the squares; the
 * boss's lair a medallion, its name under the pointer, as is the port's. The square
 * under the pointer lights up with its name. Opened by the minimap or M, closed by M, Escape, the button in the frame's
 * top right corner or a click beside it. Until the frame's picture has loaded the opening has a thin rim of its own.
 * The chart is drawn once for a screen size; only the ship, the boss's rings and the square under the pointer move
 */
export class SeaChart {
  readonly container = new Container();
  private readonly dim = new Graphics();
  private readonly chart = new Graphics();
  private readonly labels: Text[] = [];
  /** Under the boss's medallion: the square under the pointer, the rings spreading from the lair, the ship's way on */
  private readonly under = new Graphics();
  private readonly lair = new Graphics();
  /** Over it: the lost cargo and the ship */
  private readonly marks = new Graphics();
  /** The name of the square under the pointer */
  private readonly square = subheading('', SQUARE_SIZE);
  private readonly rim = new Graphics();
  private readonly frame = new Sprite();
  /** Over the frame and the chart: where the pointer is, and clicks kept from the stage */
  private readonly board = new Container();
  private readonly close = new Container();
  private readonly cross = new Graphics();
  private readonly tooltip = new Tooltip();
  private readonly bossText: TooltipText;
  private readonly portText: TooltipText;
  private readonly sea = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: COLORS.seaMiddle },
      { offset: 0.6, color: COLORS.sea },
      { offset: 1, color: COLORS.seaEdge },
    ],
    textureSpace: 'local',
  });
  private readonly map: MapProjection;
  private readonly screen: Rectangle;
  /** The screen size the chart was drawn for */
  private drawnFor = '';
  /** The square under the pointer, as its column and row; null off the chart */
  private hovered: { col: number; row: number } | null = null;
  /** What the pointer is on that the tooltip tells of: the boss's lair, the port, a gate */
  private pointing: 'boss' | 'port' | GatePlace | null = null;
  /** The sea's boss's lair, if it has one */
  private readonly lairAt: { readonly x: number; readonly y: number } | null;
  /** The sea's gates, as last laid out */
  private gates: readonly GatePlace[] = [];
  /** Opens the world chart: every sea */
  private readonly world: ReturnType<typeof brassButton>;
  private closeHovered = false;
  /** Screen pixels per pixel of the frame's picture, as last laid out */
  private frameScale = 0;
  /** The port's island, as last laid out: the pointer on it names the port */
  private port: Island | null = null;

  /** portName: the port's, as the game names it; zone: the sea it charts; openWorld: opens the world chart */
  constructor(axes: MapAxes, screen: Rectangle, portName: string, zone: ZoneId, openWorld: () => void) {
    this.map = new MapProjection(axes);
    this.screen = screen;
    this.container.visible = false;
    this.lairAt = bossLair(zone);
    const boss = zoneBoss(zone);
    this.bossText = {
      title: boss ? t(SHIP_CLASSES[boss.shipClass].name) : '',
      color: CHART.boss,
      lines: [t('Lv {level}', { level: boss?.level ?? 1 }), t("A boss's lair")],
    };
    this.world = brassButton(WORLD_BUTTON.width, WORLD_BUTTON.height, t('World chart (N)'), () => {
      this.hide();
      openWorld();
    });
    this.portText = { title: t(portName), lines: [] };
    for (const blocker of [this.dim, this.board, this.close]) {
      blocker.eventMode = 'static';
      // Clicks on the chart and round it must not reach the stage, which would steer the ship
      blocker.on('pointerdown', (e) => e.stopPropagation());
    }
    this.dim.on('pointertap', () => this.hide());
    this.board.on('pointermove', (e) => this.hover(e.global.x, e.global.y));
    this.board.on('pointerleave', () => {
      this.hovered = null;
      this.pointing = null;
    });
    this.close.cursor = 'pointer';
    this.close.on('pointertap', () => {
      playTap();
      this.hide();
    });
    this.close.on('pointerover', () => this.paintCross(true));
    this.close.on('pointerout', () => this.paintCross(false));
    this.close.addChild(this.cross);
    for (let i = 0; i < MAP_SQUARES; i++) {
      for (const name of [columnName(i), `${i + 1}`]) {
        const label = new Text({ text: name, style: { ...TITLE_STYLE, fontSize: LABEL.size } });
        label.anchor.set(0.5);
        label.alpha = LABEL.alpha;
        this.labels.push(label);
      }
    }
    this.square.anchor.set(0.5);
    this.square.visible = false;
    drawBossMedallion(this.lair, BOSS.radius);
    this.lair.visible = this.lairAt !== null;
    this.frame.visible = false;
    Assets.load<Texture>({ src: FRAME_URL, data: { autoGenerateMipmaps: true } })
      .then((texture) => {
        this.frame.texture = texture;
        this.frame.visible = true;
        this.rim.visible = false;
        // Laid out again with the picture
        this.drawnFor = '';
      })
      .catch((error) => console.warn("The sea chart's frame failed to load", error));
    this.container.addChild(
      this.dim,
      this.chart,
      ...this.labels,
      this.under,
      this.lair,
      this.marks,
      this.square,
      this.rim,
      this.frame,
      this.board,
      this.close,
      this.world.tile.container,
      this.tooltip.container,
    );
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.isOpen || e.defaultPrevented) return;
      this.hide();
      // Escape closed the chart; it shouldn't also close a window under it or stop the ship firing (keyboardInput)
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  toggle() {
    this.container.visible = !this.container.visible;
    this.hovered = null;
    this.pointing = null;
  }

  hide() {
    this.container.visible = false;
  }

  update(state: GameState) {
    if (!this.isOpen) return;
    const { width, height } = this.screen;
    const size = `${width}x${height}`;
    if (size !== this.drawnFor) {
      this.drawnFor = size;
      this.layout(state, width, height);
    }
    const { ship } = state;
    const map = this.map;
    const under = this.under.clear();
    const square = this.pointing ? null : this.hovered;
    this.square.visible = square !== null;
    if (square) {
      const x0 = square.col * MAP_SQUARE;
      const y0 = square.row * MAP_SQUARE;
      const corners = [x0, y0, x0 + MAP_SQUARE, y0, x0 + MAP_SQUARE, y0 + MAP_SQUARE, x0, y0 + MAP_SQUARE];
      const points: number[] = [];
      for (let i = 0; i < corners.length; i += 2)
        points.push(map.x(corners[i], corners[i + 1]), map.y(corners[i], corners[i + 1]));
      under
        .poly(points)
        .fill({ color: THEME.brassLight, alpha: 0.1 })
        .stroke({ width: 1.5, color: THEME.brassLight, alpha: 0.75 });
      const middleX = x0 + MAP_SQUARE / 2;
      const middleY = y0 + MAP_SQUARE / 2;
      show(this.square, `${columnName(square.col)}${square.row + 1}`);
      this.square.position.set(map.x(middleX, middleY), map.y(middleX, middleY));
    }
    if (this.lairAt) {
      // Rings spreading from the lair one after another, fading as they go
      const time = performance.now() / 1000;
      for (let i = 0; i < BOSS.rings; i++) {
        const k = (time / BOSS.period + i / BOSS.rings) % 1;
        under
          .circle(this.lair.x, this.lair.y, BOSS.radius * (1.05 + 1.4 * k))
          .stroke({ width: 2, color: CHART.boss, alpha: 0.7 * (1 - k) });
      }
    }
    drawCourse(under, ship, map);
    under.circle(map.x(ship.x, ship.y), map.y(ship.x, ship.y), ship.viewRange * map.scale).stroke({
      width: 1,
      color: CHART.me,
      alpha: 0.5,
    });
    const g = this.marks.clear();
    drawLostCargo(g, state, map, LANDMARK_SIZE);
    drawGates(g, map, this.gates, GATE.size);
    drawShipArrow(g, ship, map, ME_SIZE);

    const { pointing } = this;
    if (pointing === 'boss') {
      this.tooltip.point(this.bossText, this.lair.x, this.lair.y - BOSS.radius);
    } else if (pointing !== null && pointing !== 'port') {
      this.tooltip.point(
        gateText(pointing, ship),
        map.x(pointing.x, pointing.y),
        map.y(pointing.x, pointing.y) - GATE.hover,
      );
    } else if (pointing === 'port' && this.port) {
      const { x, y, reach } = this.port;
      this.tooltip.point(this.portText, map.x(x, y), map.y(x, y) - reach * map.scale);
    } else {
      this.tooltip.point(null, 0, 0);
    }
  }

  /** Fits the frame into the screen and the chart into its opening, and draws what doesn't move */
  private layout(state: GameState, width: number, height: number) {
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: DIM_ALPHA });
    const side = Math.max(1, Math.min(width, height) - MARGIN * 2);
    const k = side / FRAME.size;
    this.frameScale = k;
    const left = Math.round((width - side) / 2);
    const top = Math.round((height - side) / 2);
    this.frame.position.set(left, top);
    if (this.frame.visible) this.frame.setSize(side, side);
    this.board.hitArea = new Rectangle(left, top, side, side);
    const x = left + FRAME.x * k;
    const y = top + FRAME.y * k;
    const rx = FRAME.rx * k;
    const ry = FRAME.ry * k;
    this.rim
      .clear()
      .poly([x, y - ry, x + rx, y, x, y + ry, x - rx, y])
      .stroke({ width: 3, color: THEME.brass, alpha: 0.8 });

    const half = (FRAME.close.half + CLOSE_RIM) * k;
    this.close.position.set(left + FRAME.close.x * k, top + FRAME.close.y * k);
    this.close.hitArea = new Rectangle(-half, -half, half * 2, half * 2);
    this.paintCross(this.closeHovered);

    // The chart's corners at one pixel per world unit, round its middle: how big it is turned like the screen
    const map = this.map;
    map.centerX = WORLD_WIDTH / 2;
    map.centerY = WORLD_HEIGHT / 2;
    map.scale = 1;
    map.screenX = 0;
    map.screenY = 0;
    const corners = [
      [0, 0],
      [WORLD_WIDTH, 0],
      [WORLD_WIDTH, WORLD_HEIGHT],
      [0, WORLD_HEIGHT],
    ] as const;
    const xs = corners.map(([cx, cy]) => map.x(cx, cy));
    const ys = corners.map(([cx, cy]) => map.y(cx, cy));
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    // The world is a diamond on the screen as the opening is: its edges just under the opening's
    map.scale = Math.max(0.001, Math.min((rx * 2 + UNDER_RIM * 2) / spanX, (ry * 2 + UNDER_RIM * 2) / spanY));
    map.screenX = x;
    map.screenY = y;

    const { islands, port, gates } = state.world;
    this.port = port.island;
    this.gates = gates;
    const lair = this.lairAt;
    if (lair) this.lair.position.set(map.x(lair.x, lair.y), map.y(lair.x, lair.y));
    this.world.tile.container.position.set(
      left + WORLD_BUTTON.inset,
      top + side - WORLD_BUTTON.inset - WORLD_BUTTON.height,
    );

    const g = this.chart.clear();
    const outline = corners.flatMap(([cx, cy]) => [map.x(cx, cy), map.y(cx, cy)]);
    g.poly(outline).fill(this.sea);
    const lines = { width: 1, color: THEME.brass, alpha: GRID_ALPHA };
    for (let n = 1; n < MAP_SQUARES; n++) {
      const at = n * MAP_SQUARE;
      g.moveTo(map.x(at, 0), map.y(at, 0)).lineTo(map.x(at, WORLD_HEIGHT), map.y(at, WORLD_HEIGHT)).stroke(lines);
      g.moveTo(map.x(0, at), map.y(0, at)).lineTo(map.x(WORLD_WIDTH, at), map.y(WORLD_WIDTH, at)).stroke(lines);
    }
    this.drawIslands(g, islands);
    for (let i = EDGE_SHADE.steps; i >= 1; i--) {
      // Beveled: a mitred corner would reach out past the frame's spikes
      g.poly(outline).stroke({
        width: EDGE_SHADE.width * i * 2,
        color: COLORS.edgeShade,
        alpha: EDGE_SHADE.alpha,
        join: 'bevel',
      });
    }

    // The columns' letters inside the north edge, the rows' numbers inside the east edge: the two at the top
    const inset = (LABEL.inset + UNDER_RIM) / map.scale;
    for (let i = 0; i < MAP_SQUARES; i++) {
      const middle = (i + 0.5) * MAP_SQUARE;
      this.labels[i * 2].position.set(map.x(middle, inset), map.y(middle, inset));
      this.labels[i * 2 + 1].position.set(map.x(WORLD_WIDTH - inset, middle), map.y(WORLD_WIDTH - inset, middle));
    }
  }

  /** The islands as in the game, seen from above: shallows and lines round the coast, beach, land, hill and palms */
  private drawIslands(g: Graphics, islands: readonly Island[]) {
    const map = this.map;
    const screen = (points: readonly { x: number; y: number }[], dx = 0, dy = 0) =>
      points.flatMap((p) => [map.x(p.x, p.y) + dx, map.y(p.x, p.y) + dy]);
    for (const island of islands) {
      const size = island.radius * map.scale;
      g.poly(screen(islandOutline(island, 1 + SHALLOWS / size))).fill({ color: COLORS.shallow, alpha: 0.2 });
      for (const { offset, alpha } of WATERLINES) {
        g.poly(screen(islandOutline(island, 1 + offset / size))).stroke({ width: 1, color: COLORS.waterline, alpha });
      }
    }
    for (const island of islands) {
      g.poly(screen(island.coast, ISLAND_SHADOW.x, ISLAND_SHADOW.y)).fill({
        color: 0x000000,
        alpha: ISLAND_SHADOW.alpha,
      });
    }
    for (const island of islands) {
      // Every point: the port's walls are a few points of its coast
      g.poly(screen(island.coast)).fill({ color: COLORS.sand }).stroke({ width: 1, color: COLORS.coast, alpha: 0.9 });
      g.poly(screen(islandOutline(island, LAND))).fill({ color: COLORS.land });
      if (island.hillHeight > 0 && island.radius * map.scale >= HILL_MIN) {
        g.poly(screen(islandOutline(island, HILL[0]))).fill({ color: COLORS.hill });
        g.poly(screen(islandOutline(island, HILL[1]))).fill({ color: COLORS.hillTop });
      }
      for (const palm of island.palms) {
        g.circle(map.x(palm.x, palm.y), map.y(palm.x, palm.y), PALM_RADIUS).fill({ color: COLORS.palm });
      }
    }
  }

  /** The close button's cross in its slot: brass, lit under the pointer */
  private paintCross(hovered: boolean) {
    this.closeHovered = hovered;
    const arm = FRAME.close.half * CROSS * this.frameScale;
    this.cross
      .clear()
      .moveTo(-arm, -arm)
      .lineTo(arm, arm)
      .moveTo(arm, -arm)
      .lineTo(-arm, arm)
      .stroke({ width: Math.max(2, arm * 0.35), color: hovered ? THEME.brassLight : THEME.brass, cap: 'round' });
  }

  /** Picks out the square under the pointer, and the boss's lair or the port if it is on them */
  private hover(sx: number, sy: number) {
    const map = this.map;
    const p = map.toWorld(sx, sy);
    const inside = p.x >= 0 && p.y >= 0 && p.x < WORLD_WIDTH && p.y < WORLD_HEIGHT;
    this.hovered = inside ? { col: Math.floor(p.x / MAP_SQUARE), row: Math.floor(p.y / MAP_SQUARE) } : null;
    const gate = this.gates.find((g) => Math.hypot(sx - map.x(g.x, g.y), sy - map.y(g.x, g.y)) <= GATE.hover);
    if (this.lairAt && Math.hypot(sx - this.lair.x, sy - this.lair.y) <= BOSS.radius * BOSS.hover) {
      this.pointing = 'boss';
    } else if (gate) {
      this.pointing = gate;
    } else if (this.port && signedDistanceToPolygon(p.x, p.y, this.port.coast) * map.scale < PORT_HOVER) {
      this.pointing = 'port';
    } else {
      this.pointing = null;
    }
  }
}

/** A gate's tooltip: the sea beyond it, its tier and levels, and whether the ship may sail there */
function gateText(gate: GatePlace, ship: Ship): TooltipText {
  const zone = ZONES[gate.to];
  const [from, to] = zone.levels;
  const open = zone.tier <= ship.shipClass.tier;
  return {
    title: t(zone.name),
    color: CHART.gate,
    lines: [
      t('A tier {tier} sea, levels {from}–{to}', { tier: zone.tier, from, to }),
      open ? t('Sail into the gate to go there') : t('Needs a ship of tier {tier}', { tier: zone.tier }),
    ],
  };
}
