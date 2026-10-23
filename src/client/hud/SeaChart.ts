import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import { MAP_SQUARE, MAP_SQUARES, WORLD_HEIGHT, WORLD_WIDTH, type GameState } from '../../game';
import {
  CHART,
  MapProjection,
  columnName,
  drawIsland,
  drawRoute,
  drawShipArrow,
  squareName,
  type MapAxes,
} from './chart';
import { Tile, UI, drawAnchor, show, text } from './ui';

const MARGIN = 24; // pixels from the screen's edges to the window
const PAD = 16; // pixels inside the window
const HEADER = 34; // pixels: the title row
const LABEL_ROOM = 26; // pixels beside and above the chart for the names of the columns and rows (on its upper edges)
const LABEL_OFFSET = 12; // pixels from the chart's edge to a name
const ME_SIZE = 16; // pixels: the player's arrow
const DIM_ALPHA = 0.55;
const HOVER_COLOR = 0xffffff;

/**
 * The sea chart: the whole world, turned like the screen, in MAP_SQUARES × MAP_SQUARES squares named A1…H8 (the
 * letters along one edge, the numbers along the other), with every island, the port (its anchor) and the player's ship and its
 * way on. Opened by the minimap or M, closed by M, Escape, Close or a click beside it. The islands and the grid are
 * drawn once for a screen size; only the ship and the square under the pointer move
 */
export class SeaChart {
  readonly container = new Container();
  private readonly dim = new Graphics();
  private readonly panel = new Graphics();
  private readonly title = text('Sea chart', 18, UI.active, { fontWeight: 'bold' });
  private readonly info = text('', 13, UI.text);
  private readonly hint = text('M or Esc to close', 12, UI.dim);
  private readonly close: Tile;
  private readonly chart = new Graphics();
  private readonly harbour = new Graphics();
  private readonly marks = new Graphics();
  private readonly columns: Text[] = [];
  private readonly rows: Text[] = [];
  private readonly map: MapProjection;
  private readonly screen: Rectangle;
  /** The screen size the chart was drawn for */
  private drawnFor = '';
  /** The square under the pointer, as its column and row; null off the chart */
  private hovered: { col: number; row: number } | null = null;

  constructor(axes: MapAxes, screen: Rectangle) {
    this.map = new MapProjection(axes);
    this.screen = screen;
    this.container.visible = false;
    for (const blocker of [this.dim, this.panel]) {
      blocker.eventMode = 'static';
      // Clicks on the chart and round it must not reach the stage, which would steer the ship
      blocker.on('pointerdown', (e) => e.stopPropagation());
    }
    this.dim.on('pointertap', () => this.hide());
    this.panel.on('pointermove', (e) => this.hover(e.global.x, e.global.y));
    this.panel.on('pointerleave', () => (this.hovered = null));
    this.close = new Tile(70, 26, () => this.hide(), 6);
    const closeText = text('Close', 13);
    closeText.anchor.set(0.5);
    closeText.position.set(35, 13);
    this.close.content.addChild(closeText);
    drawAnchor(this.harbour, 16, UI.active);
    for (let i = 0; i < MAP_SQUARES; i++) {
      this.columns.push(text(columnName(i), 12, UI.dim, { fontWeight: 'bold' }));
      this.rows.push(text(`${i + 1}`, 12, UI.dim, { fontWeight: 'bold' }));
    }
    for (const label of [...this.columns, ...this.rows]) label.anchor.set(0.5);
    this.container.addChild(
      this.dim,
      this.panel,
      this.chart,
      this.harbour,
      this.marks,
      ...this.columns,
      ...this.rows,
      this.title,
      this.info,
      this.hint,
      this.close.container,
    );
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.isOpen) return;
      this.hide();
      // Escape closed the chart; it shouldn't also stop the ship firing (keyboardInput)
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  toggle() {
    this.container.visible = !this.container.visible;
    this.hovered = null;
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
    const hovered = this.hovered ? `  ·  Pointer: ${columnName(this.hovered.col)}${this.hovered.row + 1}` : '';
    show(this.info, `You are in ${squareName(ship.x, ship.y)}${hovered}`);

    const map = this.map;
    const g = this.marks.clear();
    if (this.hovered) {
      const x0 = this.hovered.col * MAP_SQUARE;
      const y0 = this.hovered.row * MAP_SQUARE;
      const corners = [x0, y0, x0 + MAP_SQUARE, y0, x0 + MAP_SQUARE, y0 + MAP_SQUARE, x0, y0 + MAP_SQUARE];
      const points: number[] = [];
      for (let i = 0; i < corners.length; i += 2)
        points.push(map.x(corners[i], corners[i + 1]), map.y(corners[i], corners[i + 1]));
      g.poly(points).fill({ color: HOVER_COLOR, alpha: 0.12 }).stroke({ width: 1.5, color: HOVER_COLOR, alpha: 0.7 });
    }
    drawRoute(g, ship, map, 1.5);
    g.circle(map.x(ship.x, ship.y), map.y(ship.x, ship.y), ship.viewRange * map.scale).stroke({
      width: 1,
      color: CHART.me,
      alpha: 0.6,
    });
    drawShipArrow(g, ship, map, ME_SIZE);
  }

  /** Fits the chart into the screen and draws what doesn't move: the sea, the grid, the islands, the names */
  private layout(state: GameState, width: number, height: number) {
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: DIM_ALPHA });
    const panelWidth = width - MARGIN * 2;
    const panelHeight = height - MARGIN * 2;
    this.panel
      .clear()
      .roundRect(MARGIN, MARGIN, panelWidth, panelHeight, 12)
      .fill({ color: UI.panel, alpha: 0.97 })
      .stroke({ width: 1.5, color: UI.border, alpha: 0.4 });
    this.title.position.set(MARGIN + PAD, MARGIN + PAD - 2);
    this.info.position.set(MARGIN + PAD + this.title.width + 20, MARGIN + PAD + 2);
    this.close.container.position.set(MARGIN + panelWidth - PAD - this.close.width, MARGIN + PAD - 4);
    this.hint.position.set(this.close.container.x - this.hint.width - 14, MARGIN + PAD + 3);

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
    const xs = corners.map(([x, y]) => map.x(x, y));
    const ys = corners.map(([x, y]) => map.y(x, y));
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const areaTop = MARGIN + PAD + HEADER;
    const areaWidth = panelWidth - PAD * 2 - LABEL_ROOM * 2;
    const areaHeight = panelHeight - PAD * 2 - HEADER - LABEL_ROOM;
    map.scale = Math.max(0.001, Math.min(areaWidth / spanX, areaHeight / spanY));
    map.screenX = width / 2;
    map.screenY = areaTop + LABEL_ROOM + areaHeight / 2;
    this.panel.hitArea = new Rectangle(MARGIN, MARGIN, panelWidth, panelHeight);

    const g = this.chart.clear();
    g.poly(corners.flatMap(([x, y]) => [map.x(x, y), map.y(x, y)])).fill({ color: CHART.sea });
    for (const island of state.world.islands) drawIsland(g, island, map, 0);
    for (let k = 0; k <= MAP_SQUARES; k++) {
      const edge = k === 0 || k === MAP_SQUARES;
      const at = k * MAP_SQUARE;
      const style = { width: edge ? 2 : 1, color: CHART.grid, alpha: edge ? 0.7 : 0.18 };
      g.moveTo(map.x(at, 0), map.y(at, 0)).lineTo(map.x(at, WORLD_HEIGHT), map.y(at, WORLD_HEIGHT)).stroke(style);
      g.moveTo(map.x(0, at), map.y(0, at)).lineTo(map.x(WORLD_WIDTH, at), map.y(WORLD_WIDTH, at)).stroke(style);
    }
    // The columns' letters along the north edge, the rows' numbers along the east edge: the two at the top
    const offset = LABEL_OFFSET / map.scale;
    for (let i = 0; i < MAP_SQUARES; i++) {
      const middle = (i + 0.5) * MAP_SQUARE;
      this.columns[i].position.set(map.x(middle, -offset), map.y(middle, -offset));
      this.rows[i].position.set(map.x(WORLD_WIDTH + offset, middle), map.y(WORLD_WIDTH + offset, middle));
    }
    const { mooring } = state.world.port;
    this.harbour.position.set(map.x(mooring.x, mooring.y), map.y(mooring.x, mooring.y));
  }

  /** Picks out the square under the pointer */
  private hover(sx: number, sy: number) {
    const p = this.map.toWorld(sx, sy);
    const inside = p.x >= 0 && p.y >= 0 && p.x < WORLD_WIDTH && p.y < WORLD_HEIGHT;
    this.hovered = inside ? { col: Math.floor(p.x / MAP_SQUARE), row: Math.floor(p.y / MAP_SQUARE) } : null;
  }
}
