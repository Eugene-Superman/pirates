import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import type { NavGrid } from '../navigation/NavGrid';
import { routeClearance } from '../navigation/pilot';
import type { Ship } from '../ships/Ship';
import { nearStoryMark } from '../story/story';
import { nearGate } from '../world/gates';
import { nearHarbour } from '../world/port';
import { BOT_KINDS, nearLair, type BotKind, type BotKindId } from './botKinds';

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
// Where a pack's second, third and fourth sail behind its first, world units along its heading and to starboard: a
// diamond, close enough that a player who meets one meets them all
// prettier-ignore
const PACK_FORMATION: readonly (readonly [number, number])[] = [[-45, 50], [-45, -50], [-90, 0]];
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
  /**
   * The pack it sails with (botKinds.ts, `pack`), by an id of the game's that no ship has: its mates follow the first
   * of them afloat and fight as one. Null for one that sails alone
   */
  readonly pack: number | null;
  /**
   * The player's ship it was brought in for, the story's prey (bots/spawner.ts, stepPrey): weaker than its kind, never
   * back once sunk. Null for the rest
   */
  readonly prey: number | null;
  /**
   * One of a monster's brood (combat/monsterSkills.ts): its mother is its leader, and it goes back to the deep once
   * she is gone or calm
   */
  readonly young: boolean;
  /** A monster's own ways of fighting (combat/monsterSkills.ts): game time it may dive again… */
  diveReadyAt: number;
  /** …how many of its ink's shares of the hull it has fallen past, a cloud shed for them, and its brood let loose */
  inks: number;
  broodLoosed: boolean;
}

export function newBotMind(
  kind: BotKindId,
  home: Point,
  circle: number,
  time: number,
  leader: number | null = null,
  prey: number | null = null,
  pack: number | null = null,
  young = false,
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
    pack,
    prey,
    young,
    diveReadyAt: time,
    inks: 0,
    broodLoosed: false,
  };
}

/**
 * Every pack's ships afloat, by its id, in the order they came into the game: the first leads. One pass over the
 * ships, so each bot need not look for its mates
 */
export function packsAfloat(ships: readonly Ship[]) {
  const packs = new Map<number, Ship[]>();
  for (const ship of ships) {
    const pack = ship.bot?.pack;
    if (pack === undefined || pack === null || ship.isSinking) continue;
    const mates = packs.get(pack);
    if (mates) mates.push(ship);
    else packs.set(pack, [ship]);
  }
  return packs;
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
 * hit it, or for an aggressive one a player who came within its aggro range, or the one its boss or a mate of its pack
 * fights), then fights it, runs from it, follows its boss or the first of its pack, or wanders round its home. Bots
 * never fight bots. The bots' own seeded `random` keeps it the same on the server and every client
 */
export function thinkBots(
  state: GameState,
  ships: readonly Ship[],
  players: readonly Ship[],
  nav: NavGrid,
  random: () => number,
) {
  const packs = packsAfloat(state.ships);
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
    const mates = mind.pack === null ? undefined : packs.get(mind.pack);
    if (mates && mind.foe === null) joinPack(state, ship, mind, mates);
    const foe = pickFoe(state, players, ship, mind);
    if (foe) fight(state.time, ship, mind, foe);
    else if (leader && !leader.isSinking) {
      follow(state.time, ship, mind, leader, -ESCORT.distance / 2, ESCORT.distance * mind.circle);
    } else if (mates && mates[0] !== ship) {
      // The first of the pack wanders; the rest keep their places behind it, the second the first place
      const [along, across] = PACK_FORMATION[(mates.indexOf(ship) - 1) % PACK_FORMATION.length];
      follow(state.time, ship, mind, mates[0], along, across);
    } else wander(state, nav, ship, mind, random);
  }
}

/**
 * A pack fights as one: a calm member takes on the foe a mate fights, if that foe is within LEASH of it. Farther, it
 * would only chase a fight its mates are giving up, and take it up again for them as they did
 */
function joinPack(state: GameState, ship: Ship, mind: BotMind, mates: readonly Ship[]) {
  for (const mate of mates) {
    const id = mate.bot?.foe ?? null;
    if (mate === ship || id === null) continue;
    const foe = state.ships.find((s) => s.id === id);
    if (!foe || foe.isSinking || foe.docked || Math.hypot(foe.x - ship.x, foe.y - ship.y) > LEASH) continue;
    engage(mind, foe, state.time);
    return;
  }
}

/**
 * An escort keeps off its leader's beam, on its own side, and a pack's mate its place behind the first: `along` its
 * heading and `across` to starboard of it, world units. A little faster than the leader cruises
 */
function follow(time: number, ship: Ship, mind: BotMind, leader: Ship, along: number, across: number) {
  ship.pursuing = false;
  // The throttle is set with each leg, not every update: set here, it would undo the cruise until the next leg
  if (time < mind.nextLegAt) return;
  mind.nextLegAt = time + ESCORT.every;
  const cos = Math.cos(leader.rotation);
  const sin = Math.sin(leader.rotation);
  const x = leader.x + cos * along - sin * across;
  const y = leader.y + sin * along + cos * across;
  if (Math.hypot(ship.x - x, ship.y - y) < ESCORT.slack) {
    ship.throttle = BOT_KINDS[mind.kind].cruise;
    return;
  }
  ship.throttle = 1;
  steerTo(ship, x, y);
}

/**
 * How near an aggressive bot of a kind notices a player's ship and attacks it, world units: its aggro range, nearer
 * with the ship's stealth (Dark lanterns, the captain's Ghost of the sea). The bestiary tells it
 */
export function noticeRange(kind: BotKind, ship: Ship) {
  return kind.aggroRange * (1 - ship.bonus.stealth);
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
    let nearest = Infinity;
    for (const other of players) {
      // In port, a player is out of the fight; and left alone while their crew watches something (the story)
      if (other.isSinking || other.docked || other.parley) continue;
      const distance = Math.hypot(other.x - ship.x, other.y - ship.y);
      if (distance <= noticeRange(kind, other) && distance <= nearest) {
        nearest = distance;
        engage(mind, other, time);
      }
    }
  }
  if (mind.foe === null) return null;

  const foe = state.ships.find((s) => s.id === mind.foe);
  // A foe whose crew watches something (the story) is left alone, unless it fires at this bot
  if (!foe || foe.isSinking || foe.docked || (foe.parley && foe.attackTarget !== ship.id)) {
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
 * Leg after leg to open water round its home (never into the harbour, by a gate or by a story's mark, nor into a
 * boss's waters but for the boss and its escort), at cruising speed, with a pause in between
 */
function wander(state: GameState, nav: NavGrid, ship: Ship, mind: BotMind, random: () => number) {
  const { time } = state;
  const kind = BOT_KINDS[mind.kind];
  ship.throttle = kind.cruise;
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
  const { port, gates, marks, zone } = state.world;
  if (
    !spot ||
    nearHarbour(port, spot.x, spot.y) ||
    nearGate(gates, spot.x, spot.y) ||
    nearStoryMark(marks, spot.x, spot.y) ||
    (!kind.boss && !mind.escort && nearLair(zone, spot.x, spot.y))
  ) {
    mind.nextLegAt = time + PAUSE[0];
    return;
  }
  ship.setTarget(spot.x, spot.y);
  mind.wandering = true;
}
