import { Circle, Container, Graphics, type Rectangle } from 'pixi.js';
import { MAP_SQUARE, WORLD_HEIGHT, WORLD_WIDTH, isAfloat, isHostile, type GameState, type Unit } from '../../game';
import type { Selection } from '../input/selection';
import { CHART, MapProjection, drawIsland, drawRoute, drawShipArrow, squareName, type MapAxes } from './chart';
import { Tile, UI, drawAnchor, show, text } from './ui';

const MARGIN = 16; // pixels from the screen's edges
const RADIUS = 95; // pixels
const RANGE = 1200; // world units from the ship to the rim
const GAP = 30; // pixels above the skill bar (and its status line), when the minimap would overlap it
const LABEL_GAP = 6; // pixels between the disc and the button under it
const LABEL = { width: 120, height: 22 };
const UNIT_RADIUS = 3; // pixels
const CHEST_COLOR = 0xffcf3f;
const ME_SIZE = 13; // pixels: the player's arrow
const COLORS = { neutral: 0xf4f1e6, selected: 0xf2b33d } as const;

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
 * The minimap in the bottom right corner: the sea round the player's ship, turned like the screen, with the islands
 * near, the squares of the map, the water the ship can see and every unit and chest in it (an enemy red, a chest a
 * gold diamond), the port's anchor, and the ship's way on.
 * A click on it (or M) opens the sea chart
 */
export class Minimap {
  readonly container = new Container();
  private readonly disc = new Container();
  private readonly content = new Graphics();
  private readonly clip = new Graphics();
  private readonly label: Tile;
  /** The port, when it is within the rim */
  private readonly harbour = new Graphics();
  private readonly labelText = text('', 12, UI.text, { fontWeight: 'bold' });
  private readonly map: MapProjection;

  constructor(axes: MapAxes, onOpen: () => void) {
    this.map = new MapProjection(axes);
    this.map.screenX = RADIUS;
    this.map.screenY = RADIUS;
    this.map.scale = RADIUS / RANGE;

    const background = new Graphics().circle(RADIUS, RADIUS, RADIUS).fill({ color: CHART.sea, alpha: 0.92 });
    const rim = new Graphics()
      .circle(RADIUS, RADIUS, RADIUS)
      .stroke({ width: 2, color: UI.border, alpha: 0.55 })
      .circle(RADIUS, RADIUS, RADIUS - 3)
      .stroke({ width: 1, color: UI.border, alpha: 0.15 });
    this.clip.circle(RADIUS, RADIUS, RADIUS - 1).fill({ color: 0xffffff });
    this.content.mask = this.clip;
    // Which way north is, at the rim: the map turns with the camera
    const north = text('N', 11, UI.dim, { fontWeight: 'bold' });
    const toNorth = this.map.direction(-Math.PI / 2);
    north.anchor.set(0.5);
    north.position.set(RADIUS + toNorth.x * (RADIUS - 10), RADIUS + toNorth.y * (RADIUS - 10));
    drawAnchor(this.harbour, 13, UI.active);
    this.disc.addChild(background, this.content, this.clip, this.harbour, rim, north);
    this.disc.eventMode = 'static';
    this.disc.cursor = 'pointer';
    this.disc.hitArea = new Circle(RADIUS, RADIUS, RADIUS);
    // A click on the minimap must not reach the stage, which would steer the ship
    this.disc.on('pointerdown', (e) => e.stopPropagation());
    this.disc.on('pointertap', onOpen);

    this.label = new Tile(LABEL.width, LABEL.height, onOpen, 6);
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(LABEL.width / 2, LABEL.height / 2);
    this.label.content.addChild(this.labelText);
    this.label.container.position.set(RADIUS - LABEL.width / 2, RADIUS * 2 + LABEL_GAP);
    this.container.addChild(this.disc, this.label.container);
  }

  /** Lays the minimap out in the bottom right corner, above the skill bar (`bar`) if it would overlap it, and draws it */
  update(state: GameState, selection: Selection, screenWidth: number, screenHeight: number, bar: Rectangle) {
    const height = RADIUS * 2 + LABEL_GAP + LABEL.height;
    const left = screenWidth - MARGIN - RADIUS * 2;
    const overlaps = bar.width > 0 && left < bar.x + bar.width;
    const bottom = overlaps ? bar.y - GAP : screenHeight - MARGIN;
    this.container.position.set(Math.round(left), Math.round(bottom - height));

    const { ship } = state;
    show(this.labelText, `${squareName(ship.x, ship.y)}  ·  Map (M)`);
    const map = this.map;
    map.centerX = ship.x;
    map.centerY = ship.y;
    const g = this.content.clear();
    g.circle(RADIUS, RADIUS, ship.viewRange * map.scale).fill({ color: CHART.seen, alpha: 0.8 });
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
    drawShipArrow(g, ship, map, ME_SIZE);
    const { mooring } = state.world.port;
    const hx = map.x(mooring.x, mooring.y);
    const hy = map.y(mooring.x, mooring.y);
    this.harbour.visible = Math.hypot(hx - RADIUS, hy - RADIUS) < RADIUS - 8;
    this.harbour.position.set(hx, hy);
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
