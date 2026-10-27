import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import type { NavGrid } from '../navigation/NavGrid';
import { routeClearance } from '../navigation/pilot';
import type { Ship } from '../ships/Ship';
import { nearGate } from '../world/gates';
import { nearHarbour } from '../world/port';
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
const ESCORT = { distance: 70, slack: 40, every: 1 } as const; // world units off its leader's beam; seconds between courses
// World units from a player's ship: a bot farther than that from every player is dormant, waiting where it is (no
// thinking, no sailing), so a big sea full of bots costs only the bots round the players. Well beyond a player's view
// range and LEASH: a bot wakes before anyone can see it, and gives up a fight before it falls asleep
export const WAKE_RANGE = 1500;

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
  /** The boss it escorts (botKinds.ts, Boss): it follows it and joins its fights; null once the boss is gone */
  leader: number | null;
  /** Part of a boss's escort: it doesn't come back on its own when sunk, the boss brings new ones */
  readonly escort: boolean;
}

export function newBotMind(
  kind: BotKindId,
  home: Point,
  circle: number,
  time: number,
  leader: number | null = null,
): BotMind {
  return {
    kind,
    home,
    circle,
    foe: null,
    foeSeenAt: time,
    wandering: false,
    nextLegAt: time,
    aimedAt: -Infinity,
    leader,
    escort: leader !== null,
  };
}

/** Whether a ship is a threat to this player: an aggressive bot, or any bot fighting them now */
export function isHostile(ship: Ship, playerId: number) {
  const mind = ship.bot;
  return mind !== null && (BOT_KINDS[mind.kind].behaviour === 'aggressive' || mind.foe === playerId);
}

/** Whether a point is within `range` of a player's ship, in a square round it: a cheap test of what is near */
export function nearPlayers(x: number, y: number, range: number, players: readonly Ship[]) {
  return players.some((p) => Math.abs(p.x - x) < range && Math.abs(p.y - y) < range);
}

/** Whether a ship sails this update: a player's always, a bot only within WAKE_RANGE of a player's ship */
export function isAwake(ship: Ship, players: readonly Ship[]) {
  return !ship.bot || nearPlayers(ship.x, ship.y, WAKE_RANGE, players);
}

/**
 * What every bot awake (`ships`, isAwake) does this update, before the ships steer: it picks its foe (the player who
 * hit it, or for an aggressive one a player who came within its aggro range), then fights it, runs from it, or wanders
 * round its home. Bots never fight bots. The bots' own seeded `random` keeps it the same on the server and every client
 */
export function thinkBots(
  state: GameState,
  ships: readonly Ship[],
  players: readonly Ship[],
  nav: NavGrid,
  random: () => number,
) {
  for (const ship of ships) {
    const mind = ship.bot;
    if (!mind || ship.isSinking) continue;
    const leader = mind.leader === null ? undefined : state.ships.find((s) => s.id === mind.leader);
    if (mind.leader !== null && (!leader || leader.isSinking)) mind.leader = null;
    // An escort joins its leader's fight
    const leaderFoe = leader?.bot?.foe ?? null;
    if (leader && mind.foe === null && leaderFoe !== null) {
      const foe = state.ships.find((s) => s.id === leaderFoe);
      if (foe && !foe.isSinking && !foe.docked) engage(mind, foe, state.time);
    }
    const foe = pickFoe(state, players, ship, mind);
    if (foe) fight(state.time, ship, mind, foe);
    else if (leader && !leader.isSinking) follow(state.time, ship, mind, leader);
    else wander(state, nav, ship, mind, random);
  }
}

/** An escort keeps off its leader's beam, on its own side, a little faster than the leader cruises */
function follow(time: number, ship: Ship, mind: BotMind, leader: Ship) {
  ship.pursuing = false;
  // The throttle is set with each leg, not every update: set here, it would undo the cruise until the next leg
  if (time < mind.nextLegAt) return;
  mind.nextLegAt = time + ESCORT.every;
  const side = leader.rotation + (Math.PI / 2) * mind.circle;
  const x = leader.x + Math.cos(side) * ESCORT.distance - Math.cos(leader.rotation) * ESCORT.distance * 0.5;
  const y = leader.y + Math.sin(side) * ESCORT.distance - Math.sin(leader.rotation) * ESCORT.distance * 0.5;
  if (Math.hypot(ship.x - x, ship.y - y) < ESCORT.slack) {
    ship.throttle = BOT_KINDS[mind.kind].cruise;
    return;
  }
  ship.throttle = 1;
  steerTo(ship, x, y);
}

function pickFoe(state: GameState, players: readonly Ship[], ship: Ship, mind: BotMind): Ship | null {
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
    for (const other of players) {
      // In port, a player is out of the fight
      if (other.isSinking || other.docked) continue;
      const distance = Math.hypot(other.x - ship.x, other.y - ship.y);
      if (distance <= nearest) {
        nearest = distance;
        engage(mind, other, time);
      }
    }
  }
  if (mind.foe === null) return null;

  const foe = state.ships.find((s) => s.id === mind.foe);
  if (!foe || foe.isSinking || foe.docked) {
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

/**
 * Leg after leg to open water round its home (never into the harbour or by a gate), at cruising speed, with a pause in
 * between
 */
function wander(state: GameState, nav: NavGrid, ship: Ship, mind: BotMind, random: () => number) {
  const { time } = state;
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
  if (!spot || nearHarbour(state.world.port, spot.x, spot.y) || nearGate(state.world.gates, spot.x, spot.y)) {
    mind.nextLegAt = time + PAUSE[0];
    return;
  }
  ship.setTarget(spot.x, spot.y);
  mind.wandering = true;
}
