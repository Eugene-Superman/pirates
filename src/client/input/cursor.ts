import type { Application } from 'pixi.js';
import { isHostile, type Ship } from '../../game';
import type { SceneView } from '../scene/SceneView';
import type { Hover } from './hover';

/** What is under the mouse: the sea, a unit that leaves the player be, or one that attacks them */
type CursorKind = 'sea' | 'neutral' | 'hostile';

const OUTLINE = '#3d2304';

// An arrow like the system's, orange; its shadow under it
const ARROW = 'M3 2 L3 23.5 L8.6 18.4 L12.6 27.3 L16.4 25.6 L12.5 16.9 L19.8 16.9 Z';

function arrow(top: string, bottom: string, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<path d="${ARROW}" transform="translate(1.2 1.4)" fill="#000" opacity=".35"/>
<path d="${ARROW}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/>${extra}</svg>`;
}

// Over a neutral unit: a yellow arrow with a ring beside it, "pick it out"
const RING = `<circle cx="24" cy="24" r="5" fill="none" stroke="${OUTLINE}" stroke-width="4.4"/>
<circle cx="24" cy="24" r="5" fill="none" stroke="#ffe24a" stroke-width="2.2"/>`;

// Over a unit that attacks the player: a red sight
const SIGHT_LINES = 'M16 2 V9 M16 23 V30 M2 16 H9 M23 16 H30';
const SIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<g fill="none" stroke="#2a0505" stroke-width="4.6" stroke-linecap="round"><circle cx="16" cy="16" r="8.5"/><path d="${SIGHT_LINES}"/></g>
<circle cx="16" cy="16" r="2.5" fill="#2a0505"/>
<g fill="none" stroke="#ff4a3d" stroke-width="2.2" stroke-linecap="round"><circle cx="16" cy="16" r="8.5"/><path d="${SIGHT_LINES}"/></g>
<circle cx="16" cy="16" r="1.4" fill="#ff4a3d"/></svg>`;

// Over a button: an orange hand, its outline drawn first under the same shapes
const HAND_SHAPES = `<rect x="10" y="2" width="5" height="18" rx="2.5"/><rect x="14.8" y="10" width="4.6" height="10" rx="2.3"/>
<rect x="19.2" y="11.2" width="4.4" height="9" rx="2.2"/><rect x="23.4" y="13" width="3.9" height="8" rx="1.95"/>
<rect x="10" y="16" width="17.3" height="12" rx="4.5"/><rect x="4" y="15.5" width="9.5" height="4.6" rx="2.3" transform="rotate(40 10 18)"/>`;
const HAND = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd46e"/><stop offset="1" stop-color="#ff9518"/></linearGradient></defs>
<g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round">${HAND_SHAPES}</g>
<g fill="url(#g)">${HAND_SHAPES}</g>
<path d="M14.9 16 V19.5 M19.3 16 V19.5 M23.5 16 V19.5" stroke="${OUTLINE}" stroke-width="0.9" opacity=".5"/></svg>`;

/** A CSS cursor from an SVG picture, pointing at (x, y) of it; the system's `fallback` where pictures aren't shown */
function css(svg: string, x: number, y: number, fallback: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
}

const CURSORS: Readonly<Record<CursorKind, string>> = {
  sea: css(arrow('#ffd46e', '#ff9518'), 3, 2, 'default'),
  neutral: css(arrow('#fff27a', '#ffc928', RING), 3, 2, 'pointer'),
  hostile: css(SIGHT, 16, 16, 'crosshair'),
};
const BUTTON = css(HAND, 12, 3, 'pointer');

/**
 * The game's own mouse pointer: an orange arrow over the sea, a yellow one with a ring over a unit that leaves the
 * player be, a red sight over one that attacks them, an orange hand over the HUD's buttons. It follows what is under
 * the mouse every frame (into `hover`, for a click to take), so a unit sailing under a still mouse changes it too
 */
export function bindCursor(app: Application, view: SceneView, ship: Ship, hover: Hover) {
  // The canvas inherits its cursor from the page, except over a button (Pixi's `pointer`)
  const page = app.canvas.parentElement ?? document.body;
  app.renderer.events.cursorStyles.pointer = BUTTON;
  let pointer: { x: number; y: number } | null = null;
  app.stage.on('pointermove', (e) => {
    // Over the HUD, what lies under it doesn't count
    pointer = e.target === app.stage ? { x: e.global.x, y: e.global.y } : null;
  });
  app.canvas.addEventListener('pointerleave', () => {
    pointer = null;
  });
  let shown: CursorKind | null = null;
  app.ticker.add(() => {
    const unit = pointer ? view.pickUnit(pointer.x, pointer.y, hover.id) : null;
    hover.id = unit ? unit.id : null;
    const kind: CursorKind = !unit ? 'sea' : unit.bot && isHostile(unit, ship.id) ? 'hostile' : 'neutral';
    if (kind === shown) return;
    shown = kind;
    page.style.cursor = CURSORS[kind];
  });
}
