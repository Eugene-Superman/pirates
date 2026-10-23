import type { GameState } from '../GameState';
import type { NavGrid } from '../navigation/NavGrid';
import { hullReach } from '../physics/hull';
import { Ship } from '../ships/Ship';
import { SHIP_CLASSES } from '../ships/shipClasses';
import { START, WORLD_HEIGHT, WORLD_WIDTH } from '../world/World';
import { BOT_KINDS, BOT_KIND_IDS, type BotKindId } from './botKinds';
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
const RETRY_TIME = 1; // seconds before a bot that found no room tries again

/** A bot waiting to come into the game in place of one that was sunk */
export interface Respawn {
  readonly kind: BotKindId;
  /** Game time it may come */
  readonly at: number;
}

/** The bots of every kind, there when the game starts: anywhere on the sea, but not on top of a player */
export function populate(state: GameState, nav: NavGrid, random: () => number) {
  for (const kind of BOT_KIND_IDS) {
    for (let i = 0; i < BOT_KINDS[kind].count; i++) {
      if (!spawn(state, nav, random, kind, false)) state.respawns.push({ kind, at: state.time + RETRY_TIME });
    }
  }
}

/**
 * Takes the bots that were sunk this update out of the game (the client shows them going down), and brings new ones
 * in for them when their time comes: somewhere on open water that no player can see, so nothing appears out of thin
 * air. Stepped from Game.update after combat
 */
export function stepSpawns(state: GameState, nav: NavGrid, random: () => number) {
  for (let i = state.ships.length - 1; i >= 0; i--) {
    const { bot, isSinking } = state.ships[i];
    if (!bot || !isSinking) continue;
    state.ships.splice(i, 1);
    state.respawns.push({ kind: bot.kind, at: state.time + BOT_KINDS[bot.kind].respawnTime });
  }
  const due = state.respawns.filter((r) => state.time >= r.at);
  if (due.length === 0) return;
  state.respawns = state.respawns.filter((r) => state.time < r.at);
  for (const { kind } of due) {
    if (!spawn(state, nav, random, kind, true)) state.respawns.push({ kind, at: state.time + RETRY_TIME });
  }
}

/** A bot of this kind, somewhere with room for it; false if no such place turned up this time */
function spawn(state: GameState, nav: NavGrid, random: () => number, kindId: BotKindId, unseen: boolean) {
  const kind = BOT_KINDS[kindId];
  const shipClass = SHIP_CLASSES[kind.shipClass];
  const need = hullReach(shipClass.hull) + ROOM;
  for (let attempt = 0; attempt < SPAWN_TRIES; attempt++) {
    const x = EDGE + random() * (WORLD_WIDTH - 2 * EDGE);
    const y = EDGE + random() * (WORLD_HEIGHT - 2 * EDGE);
    if (nav.clearanceAt(x, y) < need) continue;
    if (kind.behaviour === 'aggressive' && Math.hypot(x - START.x, y - START.y) < SAFE_RADIUS) continue;
    const crowded = state.ships.some((other) => {
      const distance = Math.hypot(other.x - x, other.y - y);
      if (distance < SPAWN_GAP) return true;
      // A player's ship: out of its sight, or at least not right next to it at the start
      return !other.bot && distance < (unseen ? other.viewRange + SIGHT_MARGIN : FIRST_GAP);
    });
    if (crowded) continue;

    const ship = new Ship(shipClass, state.nextId++);
    ship.x = x;
    ship.y = y;
    ship.rotation = random() * Math.PI * 2 - Math.PI;
    ship.throttle = kind.cruise;
    if (kind.ammo) ship.loadAmmo(kind.ammo);
    ship.bot = newBotMind(kindId, { x, y }, random() < 0.5 ? 1 : -1, state.time);
    state.ships.push(ship);
    return true;
  }
  return false;
}
