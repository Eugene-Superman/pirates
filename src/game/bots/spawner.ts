import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import { clamp } from '../lib/math';
import type { NavGrid } from '../navigation/NavGrid';
import { hullReach } from '../physics/hull';
import { Ship } from '../ships/Ship';
import { SHIP_CLASSES } from '../ships/shipClasses';
import { nearGate } from '../world/gates';
import { nearHarbour } from '../world/port';
import { MAP_SQUARES, START, WORLD_HEIGHT, WORLD_WIDTH } from '../world/World';
import { BOT_KINDS, zoneKinds, type BotKindId } from './botKinds';
import { newBotMind } from './brain';

// World units round the start where no aggressive bot comes into the game: a new player's harbour. With the bots'
// wandering radius it keeps them out of sight of a ship at the start
const SAFE_RADIUS = 1000;
const SIGHT_MARGIN = 150; // world units beyond a player's view range, at least: a new bot never appears in sight
const FIRST_GAP = 250; // world units from a player's ship, at least, for the bots already there when the game starts
const SPAWN_GAP = 80; // world units from any other ship
const ROOM = 30; // world units of open water round its hull
const EDGE = 60; // world units from the world's edge
const SPAWN_TRIES = 40;
// World units round the place a sunk bot sailed (its home) where its replacement comes in: the sea round a player
// fighting there stays as full as it was, instead of the bots drifting off to the rest of the world
const RESPAWN_SPREAD = 1500;
const RETRY_TIME = 1; // seconds before a bot that found no room tries again
const LAIR_SPREAD = 200; // world units round its lair a boss comes in
const ESCORT_SPREAD = [50, 90] as const; // world units from the boss its escorts come in

/** A bot waiting to come into the game in place of one that was sunk */
export interface Respawn {
  readonly kind: BotKindId;
  /** Game time it may come */
  readonly at: number;
  /** Near where it comes in, within RESPAWN_SPREAD; null for anywhere */
  readonly near: Point | null;
}

/** The bots of every kind of the sea, there when the game starts: anywhere on it, but not on top of a player */
export function populate(state: GameState, nav: NavGrid, random: () => number) {
  for (const { id: kind } of zoneKinds(state.world.zone)) {
    if (BOT_KINDS[kind].boss) {
      if (!spawnBoss(state, nav, random, kind, false))
        state.respawns.push({ kind, at: state.time + RETRY_TIME, near: null });
      continue;
    }
    const count = Math.round(BOT_KINDS[kind].perSquare * MAP_SQUARES * MAP_SQUARES);
    for (let i = 0; i < count; i++) {
      if (!spawn(state, nav, random, kind, false, null)) {
        state.respawns.push({ kind, at: state.time + RETRY_TIME, near: null });
      }
    }
  }
}

/**
 * Takes the bots that were sunk this update out of the game (the client shows them going down), and brings new ones
 * in for them when their time comes: on open water near where they sailed, but where no player can see, so nothing
 * appears out of thin air. Stepped from Game.update after combat
 */
export function stepSpawns(state: GameState, nav: NavGrid, random: () => number) {
  for (let i = state.ships.length - 1; i >= 0; i--) {
    const { bot, isSinking } = state.ships[i];
    if (!bot || !isSinking) continue;
    state.ships.splice(i, 1);
    // A boss's escort comes back with the boss
    if (bot.escort) continue;
    state.respawns.push({ kind: bot.kind, at: state.time + BOT_KINDS[bot.kind].respawnTime, near: bot.home });
  }
  const due = state.respawns.filter((r) => state.time >= r.at);
  if (due.length === 0) return;
  state.respawns = state.respawns.filter((r) => state.time < r.at);
  for (const { kind, near } of due) {
    const done = BOT_KINDS[kind].boss
      ? spawnBoss(state, nav, random, kind, true)
      : spawn(state, nav, random, kind, true, near);
    if (!done) state.respawns.push({ kind, at: state.time + RETRY_TIME, near });
  }
}

/**
 * A boss at its lair (open water within LAIR_SPREAD of it, out of every player's sight when `unseen`) and its escort
 * round it; false if there was no room this time
 */
function spawnBoss(state: GameState, nav: NavGrid, random: () => number, kindId: BotKindId, unseen: boolean) {
  const kind = BOT_KINDS[kindId];
  if (!kind.boss) return false;
  const shipClass = SHIP_CLASSES[kind.shipClass];
  const need = hullReach(shipClass.hull) + ROOM;
  for (let attempt = 0; attempt < SPAWN_TRIES; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * LAIR_SPREAD;
    const spot = nav.nearestOpen(
      kind.boss.lair.x + Math.cos(angle) * distance,
      kind.boss.lair.y + Math.sin(angle) * distance,
      need,
    );
    if (!spot) continue;
    const seen = state.ships.some(
      (other) =>
        !other.bot &&
        Math.hypot(other.x - spot.x, other.y - spot.y) < (unseen ? other.viewRange + SIGHT_MARGIN : FIRST_GAP),
    );
    if (seen) continue;
    const boss = addBot(state, random, kindId, spot.x, spot.y, null);
    const { kind: escortKind, count } = kind.boss.escorts;
    // The escort that outlived the last boss (still wandering round the lair) serves the new one, and new ships only
    // make up the number: otherwise every boss sunk with its escort afloat would leave more of them there
    let missing = count;
    for (const ship of state.ships) {
      const mind = ship.bot;
      if (missing === 0) break;
      if (!mind?.escort || mind.leader !== null || mind.kind !== escortKind || ship.isSinking) continue;
      mind.leader = boss.id;
      missing--;
    }
    const escortClass = SHIP_CLASSES[BOT_KINDS[escortKind].shipClass];
    for (let i = 0; i < missing; i++) {
      const side = boss.rotation + (i % 2 === 0 ? 1 : -1) * (Math.PI / 2);
      const off = ESCORT_SPREAD[0] + random() * (ESCORT_SPREAD[1] - ESCORT_SPREAD[0]);
      const place = nav.nearestOpen(
        spot.x + Math.cos(side) * off,
        spot.y + Math.sin(side) * off,
        hullReach(escortClass.hull) + ROOM,
      );
      if (place) addBot(state, random, escortKind, place.x, place.y, boss.id);
    }
    return true;
  }
  return false;
}

/** A new bot of a kind at (x, y), facing anywhere: an escort of `leader`, if given */
function addBot(
  state: GameState,
  random: () => number,
  kindId: BotKindId,
  x: number,
  y: number,
  leader: number | null,
) {
  const kind = BOT_KINDS[kindId];
  const ship = new Ship(SHIP_CLASSES[kind.shipClass], state.nextId++);
  ship.x = x;
  ship.y = y;
  ship.rotation = random() * Math.PI * 2 - Math.PI;
  ship.throttle = kind.cruise;
  if (kind.ammo) ship.loadAmmo(kind.ammo);
  // As tough and as hard-hitting as its sea asks
  if (kind.hp !== null) ship.setHull(kind.hp);
  ship.power = kind.power;
  // An escort circles a fight on its own side of the leader
  const circle =
    leader === null
      ? random() < 0.5
        ? 1
        : -1
      : state.ships.filter((s) => s.bot?.leader === leader).length % 2 === 0
        ? 1
        : -1;
  ship.bot = newBotMind(kindId, { x, y }, circle, state.time, leader);
  state.ships.push(ship);
  return ship;
}

/** A bot of this kind, somewhere with room for it (near `near`, if given); false if no such place turned up this time */
function spawn(
  state: GameState,
  nav: NavGrid,
  random: () => number,
  kindId: BotKindId,
  unseen: boolean,
  near: Point | null,
) {
  const kind = BOT_KINDS[kindId];
  const shipClass = SHIP_CLASSES[kind.shipClass];
  const need = hullReach(shipClass.hull) + ROOM;
  for (let attempt = 0; attempt < SPAWN_TRIES; attempt++) {
    const { x, y } = near ? around(near, random) : anywhere(random);
    if (nav.clearanceAt(x, y) < need || nearHarbour(state.world.port, x, y)) continue;
    if (nearGate(state.world.gates, x, y)) continue;
    if (kind.behaviour === 'aggressive' && Math.hypot(x - START.x, y - START.y) < SAFE_RADIUS) continue;
    const crowded = state.ships.some((other) => {
      const distance = Math.hypot(other.x - x, other.y - y);
      if (distance < SPAWN_GAP) return true;
      // A player's ship: out of its sight, or at least not right next to it at the start
      return !other.bot && distance < (unseen ? other.viewRange + SIGHT_MARGIN : FIRST_GAP);
    });
    if (crowded) continue;

    addBot(state, random, kindId, x, y, null);
    return true;
  }
  return false;
}

function anywhere(random: () => number): Point {
  return { x: EDGE + random() * (WORLD_WIDTH - 2 * EDGE), y: EDGE + random() * (WORLD_HEIGHT - 2 * EDGE) };
}

/** A point within RESPAWN_SPREAD of `near`, evenly over the disc, inside the world */
function around(near: Point, random: () => number): Point {
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * RESPAWN_SPREAD;
  return {
    x: clamp(near.x + Math.cos(angle) * distance, EDGE, WORLD_WIDTH - EDGE),
    y: clamp(near.y + Math.sin(angle) * distance, EDGE, WORLD_HEIGHT - EDGE),
  };
}
