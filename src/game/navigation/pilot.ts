import type { Point } from '../lib/geometry';
import { clamp, normalizeAngle } from '../lib/math';
import { hullReach, type Body } from '../physics/hull';
import type { Ship } from '../ships/Ship';
import type { NavGrid } from './NavGrid';

const ARRIVE_DISTANCE = 20; // world units from the last waypoint
const SLOW_DOWN_DISTANCE = 250; // world units: the ship eases off on its way into the last waypoint
const ARRIVE_SPEED = 0.15; // share of top speed it slows to at the very end
// World units of water a route keeps from land beyond the ship's half beam: room for the bow and stern swinging round
const LAND_MARGIN = 16;
const WAYPOINT_REACH = 24; // world units: a waypoint this close counts as passed
const REPLAN_INTERVAL = 1; // seconds: at most this often a ship pushed off its route plans a new one
const STUCK_TIME = 4; // seconds without progress: the ship stops where it is (something sits on its target)
const STUCK_PROGRESS = 2; // world units the route left to sail must shrink by to count as progress
const SLOWEST_TURN = 0.2; // share of top speed: slowest the ship goes to make a sharp turn
// Avoiding other ships: looks this far ahead in time, and keeps this much water between hulls
const AVOID_HORIZON = 3; // seconds
const AVOID_MARGIN = 8; // world units
const AVOID_STEP = (10 * Math.PI) / 180; // radians between the headings it tries
const AVOID_TRIES = 10; // to each side: up to 100°
const AVOID_LOOKAHEAD = 80; // world units of open water a swerve needs ahead of it
const SWERVE_SLOWDOWN = 0.7; // share of speed kept on a swerve wider than 45°
const BLOCKED_SPEED = 0.3; // share of speed when every heading is blocked

/** Where the pilot wants to go this instant: the ship turns and speeds up towards it as fast as it can */
export interface Helm {
  /** Radians */
  readonly heading: number;
  /** World units per second */
  readonly speed: number;
}

/** What the pilot of one ship remembers between updates */
export interface PilotMemory {
  /** The target the current route was planned for */
  plannedFor: Point | null;
  /** Game time before which the route isn't planned again */
  replanAfter: number;
  /** Least route the ship has had left to sail, world units, and when */
  closest: number;
  closestAt: number;
  /** Side it passed the last obstacle on, kept so it doesn't dither: 1 starboard, −1 port, 0 none */
  side: number;
}

export function newPilotMemory(): PilotMemory {
  return { plannedFor: null, replanAfter: 0, closest: Infinity, closestAt: 0, side: 0 };
}

/** How much open water a ship's route keeps from land, world units */
export function routeClearance(ship: Ship) {
  return ship.hull.halfBeam + LAND_MARGIN;
}

/**
 * Steers a ship to its target: plans a route round islands (NavGrid), follows it leg by leg, slows for turns it
 * couldn't make at speed, and swerves round other ships in the way (velocity obstacles: of the
 * headings near the route's, the first that won't bring the hulls together within AVOID_HORIZON). Starboard is tried
 * first, as ships do to pass each other. Collisions are still handled by physics; the pilot only tries to avoid them
 */
export function pilot(ship: Ship, nav: NavGrid, others: readonly Body[], time: number): Helm {
  const stop = { heading: ship.rotation, speed: 0 };
  const memory = ship.pilot;
  const { target } = ship;
  if (!target) {
    ship.route = [];
    memory.plannedFor = null;
    return stop;
  }
  const need = routeClearance(ship);
  if (memory.plannedFor !== target) plan(ship, nav, need, time);

  const { route } = ship;
  // Legs the ship can already see past are done
  while (route.length > 1) {
    const [here, next] = route;
    const passed = Math.hypot(here.x - ship.x, here.y - ship.y) < WAYPOINT_REACH;
    if (!passed && !nav.lineOfSight(ship.x, ship.y, next.x, next.y, need)) break;
    route.shift();
  }
  // Pushed off the route (round another ship, by a collision): plan again from here
  const waypoint = route[0];
  if (time >= memory.replanAfter && !nav.lineOfSight(ship.x, ship.y, waypoint.x, waypoint.y, need * 0.5)) {
    plan(ship, nav, need, time);
  }

  const goal = route[route.length - 1];
  const toGoal = Math.hypot(goal.x - ship.x, goal.y - ship.y);
  if (route.length === 1 && toGoal < ARRIVE_DISTANCE) {
    ship.clearTarget();
    return stop;
  }
  // Progress along the route, not as the crow flies: a way round an island first leads away from the goal
  let left = Math.hypot(route[0].x - ship.x, route[0].y - ship.y);
  for (let i = 1; i < route.length; i++) left += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
  if (left < memory.closest - STUCK_PROGRESS) {
    memory.closest = left;
    memory.closestAt = time;
  } else if (time - memory.closestAt > STUCK_TIME) {
    ship.clearTarget();
    return stop;
  }

  const next = route[0];
  const dx = next.x - ship.x;
  const dy = next.y - ship.y;
  const distance = Math.hypot(dx, dy);
  const heading = Math.atan2(dy, dx);
  let speed = ship.topSpeed * ship.throttle;
  // A bot after its foe doesn't ease off: its target moves on
  if (route.length === 1 && !ship.pursuing) speed *= clamp(distance / SLOW_DOWN_DISTANCE, ARRIVE_SPEED, 1);
  // A point `distance` away and `off` radians off the bow is reached only if the turning circle (speed / turnSpeed)
  // is at most distance / (2 sin off): slower than that, or the ship circles round it
  const off = Math.min(Math.abs(normalizeAngle(heading - ship.rotation)), Math.PI / 2);
  if (off > 0.01) {
    const turnable = (ship.turnSpeed * distance) / (2 * Math.sin(off));
    speed = Math.min(speed, Math.max(turnable, ship.topSpeed * SLOWEST_TURN));
  }
  // A sea monster after its prey wants to touch its hull, not to keep clear of it
  const prey = ship.shipClass.bite ? ship.attackTarget : null;
  return avoid(ship, nav, others, heading, speed, need, prey);
}

function plan(ship: Ship, nav: NavGrid, need: number, time: number) {
  const target = ship.target;
  if (!target) return;
  const route = nav.findRoute(ship.x, ship.y, target.x, target.y, need);
  ship.route = route ?? [target];
  const memory = ship.pilot;
  // A new target, or a new way to it, starts the count of progress afresh. No way found: the count goes on, so a ship
  // that can't get there gives up after STUCK_TIME instead of searching again every REPLAN_INTERVAL forever
  if (memory.plannedFor !== target || route) {
    memory.closest = Infinity;
    memory.closestAt = time;
  }
  memory.plannedFor = target;
  memory.replanAfter = time + REPLAN_INTERVAL;
}

/**
 * The heading nearest the wanted one that keeps clear of every body near (but the one with id `prey`), and the speed
 * to sail it at
 */
function avoid(
  ship: Ship,
  nav: NavGrid,
  others: readonly Body[],
  heading: number,
  speed: number,
  need: number,
  prey: number | null,
): Helm {
  const reach = hullReach(ship.hull);
  const pace = Math.max(speed, ship.speed);
  // Only bodies that could meet the ship within the horizon
  const near = others.filter((body) => {
    if (body === ship || body.id === prey) return false;
    const closing = (pace + Math.hypot(body.vx, body.vy)) * AVOID_HORIZON;
    const range = closing + reach + hullReach(body.hull) + AVOID_MARGIN;
    return Math.hypot(body.x - ship.x, body.y - ship.y) < range;
  });
  const memory = ship.pilot;
  if (near.length === 0) {
    memory.side = 0;
    return { heading, speed };
  }

  const first = memory.side === 0 ? 1 : memory.side;
  let fallback: { heading: number; miss: number } | null = null;
  for (let k = 0; k <= AVOID_TRIES * 2; k++) {
    // 0, then alternately to the preferred side and the other: 1, −1, 2, −2…
    const step = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 === 1 ? first : -first);
    const candidate = normalizeAngle(heading + step * AVOID_STEP);
    const vx = Math.cos(candidate) * pace;
    const vy = Math.sin(candidate) * pace;
    // A swerve mustn't take the ship onto land
    if (step !== 0) {
      const aheadX = ship.x + Math.cos(candidate) * AVOID_LOOKAHEAD;
      const aheadY = ship.y + Math.sin(candidate) * AVOID_LOOKAHEAD;
      if (!nav.lineOfSight(ship.x, ship.y, aheadX, aheadY, need * 0.5)) continue;
    }
    const miss = nearestMiss(ship, near, vx, vy, reach);
    if (miss >= 0) {
      memory.side = Math.sign(step);
      const slow = Math.abs(step) * AVOID_STEP > Math.PI / 4 ? SWERVE_SLOWDOWN : 1;
      return { heading: candidate, speed: speed * slow };
    }
    if (!fallback || miss > fallback.miss) fallback = { heading: candidate, miss };
  }
  // Boxed in: the least bad heading, slowly
  return { heading: fallback ? fallback.heading : heading, speed: speed * BLOCKED_SPEED };
}

/**
 * For the ship sailing at velocity (vx, vy): how much room is left at the closest approach to the nearest body within
 * AVOID_HORIZON, world units. Negative means the hulls would come closer than they may
 */
function nearestMiss(ship: Ship, bodies: readonly Body[], vx: number, vy: number, reach: number) {
  let worst = Infinity;
  for (const body of bodies) {
    const room = reach + hullReach(body.hull) + AVOID_MARGIN;
    const px = body.x - ship.x;
    const py = body.y - ship.y;
    const rvx = vx - body.vx;
    const rvy = vy - body.vy;
    const closing = px * rvx + py * rvy;
    let miss: number;
    if (Math.hypot(px, py) < room) {
      // Already too close: fine as long as the ship is getting away
      miss = closing > 0 ? -1 : 0;
    } else {
      const v2 = rvx * rvx + rvy * rvy;
      const t = v2 > 1e-9 ? clamp(closing / v2, 0, AVOID_HORIZON) : 0;
      miss = Math.hypot(px - rvx * t, py - rvy * t) - room;
    }
    worst = Math.min(worst, miss);
  }
  return worst;
}
