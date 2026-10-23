import type { GameState, Ship, Target } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';

/** Debug views of the game's navigation, switched in the settings: what the logic sees, drawn over everything */
export const NAV_DEBUG = ['route', 'hulls'] as const;
export type NavDebug = (typeof NAV_DEBUG)[number];

const ROUTE_COLOR = 0xffe27a;
const HULL_COLOR = 0xff5a5a;
const COAST_COLOR = 0xffa040;
const ALPHA = 0.85;
const WIDTH = 0.9; // world units
const WAYPOINT_RADIUS = 4;

/** The legs of the ship's route round islands and the waypoints between them */
export function drawRoute(p: Painter3D, ship: Ship) {
  let x = ship.x;
  let y = ship.y;
  for (const point of ship.route) {
    p.line([x, y, 0], [point.x, point.y, 0], WIDTH, ROUTE_COLOR, ALPHA);
    p.ring(point.x, point.y, 0, WAYPOINT_RADIUS, WIDTH, ROUTE_COLOR, ALPHA);
    x = point.x;
    y = point.y;
  }
}

/** What collides: every hull's capsule (its two end circles and sides) and every island's coastline */
export function drawHulls(p: Painter3D, state: GameState) {
  const bodies: (Ship | Target)[] = [...state.ships, ...state.targets];
  for (const body of bodies) {
    const { hull } = body;
    if (!p.isVisible(body.x, body.y, 0, Math.max(hull.bow, -hull.stern) + hull.halfBeam)) continue;
    const cos = Math.cos(body.heading);
    const sin = Math.sin(body.heading);
    const front = Math.max(hull.bow - hull.halfBeam, hull.stern + hull.halfBeam);
    const back = Math.min(hull.bow - hull.halfBeam, hull.stern + hull.halfBeam);
    // A point of the hull, in hull coordinates (along the heading, to starboard), on the water
    const at = (along: number, side: number): Vec3 => [
      body.x + along * cos - side * sin,
      body.y + along * sin + side * cos,
      0,
    ];
    for (const end of [front, back]) {
      const [x, y] = at(end, 0);
      p.ring(x, y, 0, hull.halfBeam, WIDTH, HULL_COLOR, ALPHA);
    }
    p.line(at(back, hull.halfBeam), at(front, hull.halfBeam), WIDTH, HULL_COLOR, ALPHA);
    p.line(at(back, -hull.halfBeam), at(front, -hull.halfBeam), WIDTH, HULL_COLOR, ALPHA);
  }
  for (const island of state.world.islands) {
    if (!p.isVisible(island.x, island.y, 0, island.reach)) continue;
    const coast = island.coast;
    for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) {
      p.line([coast[j].x, coast[j].y, 0], [coast[i].x, coast[i].y, 0], WIDTH, COAST_COLOR, ALPHA);
    }
  }
}
