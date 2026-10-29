import type { Application } from 'pixi.js';
import { isHostile, onPort, seaOpenTo, type GameState, type Ship, type Unit } from '../../game';
import type { SceneView } from '../scene/SceneView';
import type { Hover } from './hover';

// Painted, and cut by blender-assets/hud/build_cursors.py
const ART = `${import.meta.env.BASE_URL}sprites/hud/cursors.json`;

const CURSOR_IDS = [
  'arrow',
  'arrowLit',
  'arrowGold',
  'forbidden',
  'info',
  'help',
  'sabres',
  'sight',
  'harpoon',
  'forbiddenRed',
  'keg',
  'vortex',
  'wave',
  'compass',
  'wheel',
  'coinHand',
  'chest',
  'magnifier',
  'hammer',
  'plus',
  'exchange',
  'seal',
  'anchor',
  'hourglass',
] as const;

/**
 * The painted cursors, by what they show. A HUD element takes one by its id as its Pixi `cursor`; the ones in
 * KEYWORDS also stand for the CSS cursor of that name
 */
export type CursorId = (typeof CURSOR_IDS)[number];

const SIZE = 32; // CSS pixels a side of a cursor: a browser drops a bigger one near the window's edge

// The system's cursor each stands for until the pictures have loaded, or where a browser won't show them
const SYSTEM: Partial<Readonly<Record<CursorId, string>>> = {
  arrow: 'default',
  sight: 'crosshair',
  forbidden: 'not-allowed',
  forbiddenRed: 'not-allowed',
  help: 'help',
  hourglass: 'wait',
};

// The CSS cursors the HUD asks for by name, and the pictures that take their place
const KEYWORDS = {
  pointer: 'arrowLit',
  'not-allowed': 'forbidden',
  wait: 'hourglass',
  help: 'help',
} as const satisfies Readonly<Record<string, CursorId>>;

const CHEST_PICK = 24; // world units round a floating chest within which the mouse is over it

/** The atlas's JSON: the tiles' size, each cursor's tile (its column and row) and hot spot (pixels of its tile) */
interface CursorArt {
  readonly file: string;
  readonly tile: number;
  readonly icons: Readonly<Record<string, readonly [number, number]>>;
  readonly spots: Readonly<Record<string, readonly [number, number]>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPairs(value: unknown): value is Readonly<Record<string, readonly [number, number]>> {
  return (
    isRecord(value) &&
    Object.values(value).every((at) => Array.isArray(at) && at.length === 2 && at.every((n) => typeof n === 'number'))
  );
}

// The JSON is plain JSON, so it is checked rather than trusted
function isCursorArt(value: unknown): value is CursorArt {
  return (
    isRecord(value) &&
    typeof value.file === 'string' &&
    typeof value.tile === 'number' &&
    isPairs(value.icons) &&
    isPairs(value.spots)
  );
}

/** How a browser takes a picture for a pixel density of its own: image-set, prefixed or not, or nothing */
function imageSet() {
  for (const name of ['image-set', '-webkit-image-set']) {
    if (CSS.supports('cursor', `${name}(url("a.png") 1x) 0 0, auto`)) return name;
  }
  return null;
}

/**
 * The CSS cursors from the atlas, drawn at the screen's pixel density where the browser takes one, SIZE CSS pixels
 * across; null if it didn't load
 */
async function loadCursors(): Promise<Partial<Record<CursorId, string>> | null> {
  const response = await fetch(ART);
  const art: unknown = await response.json();
  if (!isCursorArt(art)) throw new Error('cursors.json is not an atlas of cursors');
  const picture = new Image();
  picture.src = new URL(art.file, response.url).href;
  await picture.decode();
  const set = imageSet();
  const density = set ? Math.min(window.devicePixelRatio || 1, art.tile / SIZE) : 1;
  const side = Math.round(SIZE * density);
  const css: Partial<Record<CursorId, string>> = {};
  for (const id of CURSOR_IDS) {
    const at = art.icons[id];
    const spot = art.spots[id];
    if (!at || !spot) continue;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.imageSmoothingQuality = 'high';
    g.drawImage(picture, at[0] * art.tile, at[1] * art.tile, art.tile, art.tile, 0, 0, side, side);
    const url = `url("${canvas.toDataURL('image/png')}")`;
    const image = set ? `${set}(${url} ${density}x)` : url;
    const [x, y] = spot.map((n) => Math.min(SIZE - 1, Math.round((n * SIZE) / art.tile)));
    css[id] = `${image} ${x} ${y}, ${SYSTEM[id] ?? 'pointer'}`;
  }
  return css;
}

/** Over a unit: one that leaves the player be is looked at; one that attacks them, fired at with the weapon picked */
function unitCursor(ship: Ship, unit: Unit): CursorId {
  if (!unit.bot || !isHostile(unit, ship.id)) return 'magnifier';
  if (ship.fittedGuns(ship.weapon).length === 0) return 'forbiddenRed';
  return ship.weapon === 'harpoon' ? 'harpoon' : 'sight';
}

/** Over a point of the sea: the port to sail into, a gate to another sea (shut to the ship's tier), a chest to haul */
function placeCursor(state: GameState, x: number, y: number): CursorId {
  const { ship, world, chests } = state;
  if (onPort(world.port, x, y)) return 'anchor';
  const gate = world.gates.find((g) => Math.hypot(x - g.x, y - g.y) < g.radius);
  if (gate) return seaOpenTo(gate.to, ship.shipClass.tier) ? 'vortex' : 'forbidden';
  const chest = chests.some((c) => ship.canSee(c.x, c.y) && Math.hypot(x - c.x, y - c.y) < CHEST_PICK);
  return chest ? 'chest' : 'arrow';
}

/**
 * The game's own mouse pointers, painted: over the sea an arrow, a ship's wheel while the mouse is held down steering,
 * an anchor over the port, a vortex over a gate, a chest over floating loot; a magnifier over a unit that leaves the
 * player be, the weapon picked over one that attacks them (a sight for the cannons, a harpoon), crossed out with no
 * gun of it fitted. It follows what is under the mouse every frame (into `hover`, for a click to take), so a unit
 * sailing under a still mouse changes it too. The HUD's elements pick theirs by name (CursorId, or a CSS cursor of
 * KEYWORDS): a gold arrow over a button. Until the pictures load, the system's cursors stand in
 */
export function bindCursor(app: Application, view: SceneView, state: GameState, hover: Hover) {
  const { ship } = state;
  // The canvas inherits its cursor from the page, except over the HUD's elements (Pixi's cursor styles)
  const page = app.canvas.parentElement ?? document.body;
  let css: Partial<Record<CursorId, string>> = {};
  const styles = app.renderer.events.cursorStyles;
  const style = (id: CursorId) => css[id] ?? SYSTEM[id] ?? 'pointer';
  const register = () => {
    for (const id of CURSOR_IDS) styles[id] = style(id);
    for (const [keyword, id] of Object.entries(KEYWORDS)) styles[keyword] = css[id] ?? keyword;
  };
  register();
  let shown: CursorId | null = null;
  loadCursors()
    .then((loaded) => {
      if (!loaded) return;
      css = loaded;
      register();
      shown = null;
    })
    .catch((error: unknown) => console.warn('The cursors failed to load', error));

  let pointer: { x: number; y: number } | null = null;
  app.stage.on('pointermove', (e) => {
    // Over the HUD, what lies under it doesn't count
    pointer = e.target === app.stage ? { x: e.global.x, y: e.global.y } : null;
  });
  app.canvas.addEventListener('pointerleave', () => {
    pointer = null;
  });
  app.ticker.add(() => {
    const unit = pointer ? view.pickUnit(pointer.x, pointer.y, hover.id) : null;
    hover.id = unit ? unit.id : null;
    let id: CursorId = 'arrow';
    if (view.isSteering) id = 'wheel';
    else if (unit) id = unitCursor(ship, unit);
    else if (pointer) {
      const p = view.screenToWorld(pointer.x, pointer.y);
      id = placeCursor(state, p.x, p.y);
    }
    if (id === shown) return;
    shown = id;
    page.style.cursor = style(id);
  });
}
