import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import type { NavGrid } from '../navigation/NavGrid';
import { routeClearance } from '../navigation/pilot';
import type { Ship } from '../ships/Ship';
import { BOT_KINDS, type BotKindId } from './botKinds';

const WANDER_RADIUS = 350; // world units round its home it wanders
const PAUSE = [2, 6] as const; // seconds it drifts between two legs of wandering
const LEASH = 650; // world units: a foe farther than this is out of the fight…
const LOSE_TIME = 4; // …and given up after this many seconds out of it
const FIGHT_SHARE = 0.75; // of its guns' range: the distance a gunship fights from
const CLOSE_IN = 1.15; // a gunship farther than this many times that distance sails straight at its foe
const CIRCLE_STEP = 0.7; // radians round its foe a gunship moves on with each new course: broadside on, never still
const FLEE_DISTANCE = 400; // world units ahead of its foe a bot with no weapon runs to
const REAIM_TIME = 0.6; // seconds between two new courses in a fight…
const REAIM_DISTANCE = 20; // …and world units the new one must move the goal by: each may need a route round an island

/** What a bot remembers between updates */
export interface BotMind {
  readonly kind: BotKindId;
  /** Where it came into the game: it wanders round here */
  readonly home: Point;
  /** Which way it circles a foe: 1 or −1 */
  readonly circle: number;
  /** The player's ship it fights or runs from; null while calm */
  foe: number | null;
  /** Game time its foe was last within LEASH */
  foeSeenAt: number;
  /** On a leg of wandering; once there, it drifts till nextLegAt */
  wandering: boolean;
  nextLegAt: number;
  /** Game time of its last course in a fight */
  aimedAt: number;
}

export function newBotMind(kind: BotKindId, home: Point, circle: number, time: number): BotMind {
  return { kind, home, circle, foe: null, foeSeenAt: time, wandering: false, nextLegAt: time, aimedAt: -Infinity };
}

/** Whether a ship is a threat to this player: an aggressive bot, or any bot fighting them now */
export function isHostile(ship: Ship, playerId: number) {
  const mind = ship.bot;
  return mind !== null && (BOT_KINDS[mind.kind].behaviour === 'aggressive' || mind.foe === playerId);
}

/**
 * What every bot does this update, before the ships steer: it picks its foe (the player who hit it, or for an
 * aggressive one a player who came within its aggro range), then fights it, runs from it, or wanders round its home.
 * Bots never fight bots. The bots' own seeded `random` keeps it the same on the server and every client
 */
export function thinkBots(state: GameState, nav: NavGrid, random: () => number) {
  for (const ship of state.ships) {
    const mind = ship.bot;
    if (!mind || ship.isSinking) continue;
    const foe = pickFoe(state, ship, mind);
    if (foe) fight(state.time, ship, mind, foe);
    else wander(state.time, nav, ship, mind, random);
  }
}

function pickFoe(state: GameState, ship: Ship, mind: BotMind): Ship | null {
  const { time } = state;
  // Hit by a player: it turns on them (or runs), whatever it is
  if (ship.lastHitBy !== null) {
    const attacker = state.ships.find((s) => s.id === ship.lastHitBy);
    ship.lastHitBy = null;
    if (mind.foe === null && attacker && !attacker.bot && !attacker.isSinking) engage(mind, attacker, time);
  }
  const kind = BOT_KINDS[mind.kind];
  if (mind.foe === null && kind.behaviour === 'aggressive') {
    let nearest = kind.aggroRange;
    for (const other of state.ships) {
      if (other.bot || other.isSinking) continue;
      const distance = Math.hypot(other.x - ship.x, other.y - ship.y);
      if (distance <= nearest) {
        nearest = distance;
        engage(mind, other, time);
      }
    }
  }
  if (mind.foe === null) return null;

  const foe = state.ships.find((s) => s.id === mind.foe);
  if (!foe || foe.isSinking) {
    calm(ship, mind, time);
    return null;
  }
  if (Math.hypot(foe.x - ship.x, foe.y - ship.y) <= LEASH) mind.foeSeenAt = time;
  else if (time - mind.foeSeenAt > LOSE_TIME) {
    calm(ship, mind, time);
    return null;
  }
  return foe;
}

function engage(mind: BotMind, foe: Ship, time: number) {
  mind.foe = foe.id;
  mind.foeSeenAt = time;
  mind.aimedAt = -Infinity;
}

/** The fight is over: it stops firing and soon wanders off again */
function calm(ship: Ship, mind: BotMind, time: number) {
  mind.foe = null;
  ship.pursuing = false;
  mind.wandering = false;
  mind.nextLegAt = time + PAUSE[0];
  ship.ceaseFire();
  ship.clearTarget();
}

/**
 * A monster goes straight for its foe's hull; a gunship closes to FIGHT_SHARE of its guns' range and then circles
 * there, firing; a bot with neither runs. At full speed, re-aimed every REAIM_TIME
 */
function fight(time: number, ship: Ship, mind: BotMind, foe: Ship) {
  ship.throttle = 1;
  ship.pursuing = true;
  const range = ship.range();
  const armed = ship.shipClass.bite !== null || range > 0;
  if (armed) ship.attack(foe.id);
  if (time - mind.aimedAt < REAIM_TIME) return;
  mind.aimedAt = time;

  const dx = ship.x - foe.x;
  const dy = ship.y - foe.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (!armed) {
    steerTo(ship, ship.x + (dx / distance) * FLEE_DISTANCE, ship.y + (dy / distance) * FLEE_DISTANCE);
    return;
  }
  if (ship.shipClass.bite) {
    steerTo(ship, foe.x, foe.y);
    return;
  }
  const want = range * FIGHT_SHARE;
  const angle = Math.atan2(dy, dx) + (distance > want * CLOSE_IN ? 0 : CIRCLE_STEP * mind.circle);
  steerTo(ship, foe.x + Math.cos(angle) * want, foe.y + Math.sin(angle) * want);
}

/** A new course, unless it is next to the one the ship is on: then the pilot keeps its route */
function steerTo(ship: Ship, x: number, y: number) {
  const { target } = ship;
  if (target && Math.hypot(target.x - x, target.y - y) < REAIM_DISTANCE) return;
  ship.setTarget(x, y);
}

/** Leg after leg to open water round its home, at cruising speed, with a pause in between */
function wander(time: number, nav: NavGrid, ship: Ship, mind: BotMind, random: () => number) {
  ship.throttle = BOT_KINDS[mind.kind].cruise;
  if (mind.wandering) {
    if (ship.target) return;
    // There (or stuck on the way): drift for a while
    mind.wandering = false;
    mind.nextLegAt = time + PAUSE[0] + random() * (PAUSE[1] - PAUSE[0]);
    return;
  }
  if (time < mind.nextLegAt) return;
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * WANDER_RADIUS;
  const spot = nav.nearestOpen(
    mind.home.x + Math.cos(angle) * distance,
    mind.home.y + Math.sin(angle) * distance,
    routeClearance(ship),
  );
  if (!spot) {
    mind.nextLegAt = time + PAUSE[0];
    return;
  }
  ship.setTarget(spot.x, spot.y);
  mind.wandering = true;
}
