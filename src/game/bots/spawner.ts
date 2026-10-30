import type { UnitKind } from '../combat/units';
import { shipOf } from '../economy/player';
import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import { clamp } from '../lib/math';
import type { NavGrid } from '../navigation/NavGrid';
import { hullReach } from '../physics/hull';
import { Ship } from '../ships/Ship';
import { SHIP_CLASSES, type ShipClassId } from '../ships/shipClasses';
import { nearStoryMark, storyPrey } from '../story/story';
import { nearGate } from '../world/gates';
import { nearHarbour } from '../world/port';
import { START, WORLD_HEIGHT, WORLD_WIDTH } from '../world/World';
import type { ZoneId } from '../world/zones';
import { BOT_KINDS, botsInSea, nearLair, zoneKinds, type BotKind, type BotKindId } from './botKinds';
import { WAKE_RANGE, newBotMind, packsAfloat } from './brain';

// World units round the start where no aggressive bot comes into the game: a new player's harbour. With the bots'
// wandering radius it keeps them out of sight of a ship at the start
const SAFE_RADIUS = 1000;
// World units round the start where no pack comes in: packs keep to the far waters, out of a new captain's way till
// they sail out to the bosses' corners
const PACK_SAFE = 2200;
// World units from the first of its pack a mate comes in: clear of its way, near enough to take its place behind it
const PACK_JOIN = [120, 260] as const;
const SIGHT_MARGIN = 150; // world units beyond a player's view range, at least: a new bot never appears in sight
const FIRST_GAP = 250; // world units from a player's ship, at least, for the bots already there when the game starts
const SPAWN_GAP = 80; // world units from any other ship
const ROOM = 30; // world units of open water round its hull
const EDGE = 60; // world units from the world's edge
const SPAWN_TRIES = 40;
// World units round the place a sunk bot sailed (its home) where its replacement comes in: the sea round a player
// fighting there stays as full as it was, instead of the bots drifting off to the rest of the world
const RESPAWN_SPREAD = 1500;
// Places that fit a new bot, of which it takes the emptiest water (crowding): the sea filled evenly, the gaps a captain
// leaves where they hunt filled first, yet with a few, not the one emptiest, still its knots and open stretches
const CHOICES = 8;
// World units each way from a place over which the bots are counted to tell how full the sea is there: about the
// stretch a captain hunting one spot clears round their ship
const CROWD_RADIUS = 700;
const ROOM_CELL = 100; // world units across a cell of the sea's room (SeaRoom)
const OPEN_WATER = 50; // world units of clearance a cell's middle needs to be room: a middling hull's reach and ROOM
const RETRY_TIME = 1; // seconds before a bot that found no room tries again
const LAIR_SPREAD = 200; // world units round its lair a boss comes in
const ESCORT_SPREAD = [50, 90] as const; // world units from the boss its escorts come in
const BROOD_SPREAD = [35, 60] as const; // world units from their mother a monster's young come up…
const BROOD_FAN = 0.7; // …radians apart, fanned out behind her
// The story's prey (stepPrey): world units beyond the player's view range one comes in, out of sight but near; and
// from one of its kind already in, for the next, so they come together
const PREY_RING = [150, 350] as const;
const PREY_PACK = [100, 180] as const;
const PREY_LEASH = 1800; // world units from the player's ship: a prey left farther is taken away unseen, to come nearer
const PREY_SAFE = 600; // world units round the start where no aggressive prey comes in
const PREY_TRIES = 8; // places tried an update: a prey that finds none tries again the next
const PREY_HULL = 0.4; // share of its kind's hull a prey has: a new captain sinks it in a few volleys
const PREY_POWER = 0.5; // share of its kind's damage

/** A bot waiting to come into the game in place of one that was sunk */
export interface Respawn {
  readonly kind: BotKindId;
  /** Game time it may come */
  readonly at: number;
  /** Near where it comes in, within RESPAWN_SPREAD; null for anywhere */
  readonly near: Point | null;
  /** The pack it comes back to (BotMind.pack); null for one that sails alone */
  readonly pack: number | null;
}

/**
 * Where on a sea a bot may come in (open water away from the harbour, the gates, the story's marks and the bosses'
 * waters), as a grid of ROOM_CELL cells summed up from its corner, so the room round any place is four lookups.
 * Made once with the sea: a place by a coast or by a boss's waters has less room, not fewer bots for it, and isn't
 * taken for an empty one
 */
export interface SeaRoom {
  readonly columns: number;
  readonly rows: number;
  /** The room's cells above and left of each corner of a cell, (columns + 1) × (rows + 1), row by row */
  readonly sums: Int32Array;
}

/** The room of the sea the game is in: once its gates and the story's marks are placed */
export function seaRoom(state: GameState, nav: NavGrid): SeaRoom {
  const { port, gates, marks, zone } = state.world;
  const columns = Math.ceil(WORLD_WIDTH / ROOM_CELL);
  const rows = Math.ceil(WORLD_HEIGHT / ROOM_CELL);
  const width = columns + 1;
  const sums = new Int32Array(width * (rows + 1));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = (column + 0.5) * ROOM_CELL;
      const y = (row + 0.5) * ROOM_CELL;
      const open =
        nav.clearanceAt(x, y) >= OPEN_WATER &&
        !nearHarbour(port, x, y) &&
        !nearGate(gates, x, y) &&
        !nearStoryMark(marks, x, y) &&
        !nearLair(zone, x, y);
      sums[(row + 1) * width + column + 1] =
        (open ? 1 : 0) + sums[row * width + column + 1] + sums[(row + 1) * width + column] - sums[row * width + column];
    }
  }
  return { columns, rows, sums };
}

/**
 * The bots of every kind of the sea, there when the game starts: anywhere on it, spread evenly, but not on top of a
 * player; a pack's together
 */
export function populate(state: GameState, nav: NavGrid, room: SeaRoom, random: () => number) {
  for (const kind of zoneKinds(state.world.zone)) {
    if (kind.boss) {
      if (!spawnBoss(state, nav, random, kind.id, false))
        state.respawns.push({ kind: kind.id, at: state.time + RETRY_TIME, near: null, pack: null });
      continue;
    }
    const count = botsInSea(kind);
    let pack: number | null = null;
    for (let i = 0; i < count; i++) {
      // Every `pack` of them a new pack, its id one of the game's that no ship takes
      if (kind.pack > 1 && i % kind.pack === 0) pack = state.nextId++;
      if (!placeBot(state, nav, room, random, kind.id, false, null, pack)) {
        state.respawns.push({ kind: kind.id, at: state.time + RETRY_TIME, near: null, pack });
      }
    }
  }
}

/**
 * Takes the bots that were sunk this update out of the game (the client shows them going down), and brings new ones
 * in for them when their time comes, the sooner the more players hunt there (respawnDelay): on the emptiest open water
 * near where they sailed, but where no player can see, so nothing appears out of thin air. Stepped from Game.update
 * after combat
 */
export function stepSpawns(state: GameState, nav: NavGrid, room: SeaRoom, random: () => number) {
  for (let i = state.ships.length - 1; i >= 0; i--) {
    const ship = state.ships[i];
    const { bot } = ship;
    if (!bot || !ship.isSinking) continue;
    state.ships.splice(i, 1);
    // A boss's escort comes back with the boss; the story's prey, when the story asks for more; a pack's, to its pack
    if (bot.escort || bot.prey !== null) continue;
    const at = state.time + respawnDelay(state, ship, BOT_KINDS[bot.kind]);
    state.respawns.push({ kind: bot.kind, at, near: bot.home, pack: bot.pack });
  }
  const due = state.respawns.filter((r) => state.time >= r.at);
  if (due.length === 0) return;
  state.respawns = state.respawns.filter((r) => state.time < r.at);
  for (const { kind, near, pack } of due) {
    const done = BOT_KINDS[kind].boss
      ? spawnBoss(state, nav, random, kind, true)
      : placeBot(state, nav, room, random, kind, true, near, pack);
    if (!done) state.respawns.push({ kind, at: state.time + RETRY_TIME, near, pack });
  }
}

/**
 * Seconds before a sunk bot is replaced: its kind's respawnTime, shared by the players' ships within WAKE_RANGE of it,
 * so ten captains hunting the same waters find them as full as one does. A boss's alone keeps its time: one of it,
 * never farmed faster for a crowd
 */
function respawnDelay(state: GameState, sunk: Ship, kind: BotKind) {
  if (kind.boss) return kind.respawnTime;
  let hunters = 0;
  for (const ship of state.ships) {
    if (!ship.bot && Math.hypot(ship.x - sunk.x, ship.y - sunk.y) < WAKE_RANGE) hunters++;
  }
  return kind.respawnTime / Math.max(1, hunters);
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
    // A mini-boss keeps its lair alone
    if (!kind.boss.escorts) return true;
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

/**
 * A new bot of a kind at (x, y), facing anywhere: an escort of `leader`, if given, the prey of a player's ship, or one
 * of a pack
 */
function addBot(
  state: GameState,
  random: () => number,
  kindId: BotKindId,
  x: number,
  y: number,
  leader: number | null,
  prey: number | null = null,
  pack: number | null = null,
  young = false,
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
  ship.bot = newBotMind(kindId, { x, y }, circle, state.time, leader, prey, pack, young);
  state.ships.push(ship);
  return ship;
}

/**
 * A monster's brood (combat/monsterSkills.ts): `count` young of the sea's kind that sails this hull, coming up round
 * their mother, fanned out behind her, her escort (they follow her and join her fight). None if the sea has no such kind
 */
export function spawnBrood(
  state: GameState,
  nav: NavGrid,
  random: () => number,
  mother: Ship,
  hull: ShipClassId,
  count: number,
) {
  const kind = zoneKinds(state.world.zone).find((k) => k.shipClass === hull);
  if (!kind) return;
  const need = hullReach(SHIP_CLASSES[hull].hull) + ROOM;
  for (let i = 0; i < count; i++) {
    const angle = mother.rotation + Math.PI + (i - (count - 1) / 2) * BROOD_FAN;
    const off = BROOD_SPREAD[0] + random() * (BROOD_SPREAD[1] - BROOD_SPREAD[0]);
    const place = nav.nearestOpen(mother.x + Math.cos(angle) * off, mother.y + Math.sin(angle) * off, need);
    if (!place) continue;
    const young = addBot(state, random, kind.id, place.x, place.y, mother.id, null, null, true);
    young.rotation = angle;
    state.events.push({ type: 'surface', shipId: young.id, at: { x: place.x, y: place.y, z: 0 }, radius: 0 });
  }
}

/**
 * Whether a bot of a kind may come into the game at (x, y): open water with room for its hull, away from the harbour,
 * the gates, the story's marks and the bosses' waters, an aggressive one from the start (a pack farther still), no
 * other ship close, and out of every player's sight (`unseen`) or at least not right next to one at the start
 */
function fits(state: GameState, nav: NavGrid, kind: BotKind, x: number, y: number, unseen: boolean) {
  const need = hullReach(SHIP_CLASSES[kind.shipClass].hull) + ROOM;
  if (nav.clearanceAt(x, y) < need || nearHarbour(state.world.port, x, y)) return false;
  if (nearGate(state.world.gates, x, y) || nearStoryMark(state.world.marks, x, y)) return false;
  if (nearLair(state.world.zone, x, y)) return false;
  const safe = kind.pack > 1 ? PACK_SAFE : kind.behaviour === 'aggressive' ? SAFE_RADIUS : 0;
  if (Math.hypot(x - START.x, y - START.y) < safe) return false;
  return !state.ships.some((other) => {
    const distance = Math.hypot(other.x - x, other.y - y);
    if (distance < SPAWN_GAP) return true;
    return !other.bot && distance < (unseen ? other.viewRange + SIGHT_MARGIN : FIRST_GAP);
  });
}

/** A bot of a kind, alone or one of a pack; false if no place turned up for it this time */
function placeBot(
  state: GameState,
  nav: NavGrid,
  room: SeaRoom,
  random: () => number,
  kindId: BotKindId,
  unseen: boolean,
  near: Point | null,
  pack: number | null,
) {
  return pack === null
    ? spawn(state, nav, room, random, kindId, unseen, near, null)
    : spawnInPack(state, nav, room, random, kindId, unseen, near, pack);
}

/**
 * A bot of this kind, somewhere with room for it (near `near`, if given), of a pack if given: the emptiest water of
 * the CHOICES places that fit; false if none turned up this time
 */
function spawn(
  state: GameState,
  nav: NavGrid,
  room: SeaRoom,
  random: () => number,
  kindId: BotKindId,
  unseen: boolean,
  near: Point | null,
  pack: number | null,
) {
  const kind = BOT_KINDS[kindId];
  let best: Point | null = null;
  let emptiest = Infinity;
  let found = 0;
  for (let attempt = 0; attempt < SPAWN_TRIES && found < CHOICES; attempt++) {
    const spot = near ? around(near, random) : anywhere(random);
    if (!spot || !fits(state, nav, kind, spot.x, spot.y, unseen)) continue;
    found++;
    const crowd = crowding(state, room, spot.x, spot.y);
    if (crowd < emptiest) {
      emptiest = crowd;
      best = spot;
    }
  }
  if (!best) return false;
  addBot(state, random, kindId, best.x, best.y, null, null, pack);
  return true;
}

/**
 * How full the sea would be at a place with one more bot there: the bots within CROWD_RADIUS of it each way, and the
 * new one, for the room there (SeaRoom). By the room, a place by a coast or a boss's waters is as full as the open sea
 * with fewer bots; with the new one counted, a little room isn't taken for an empty stretch only because it has
 * none yet, or the bots would pile up along every coast, the Seam and the bosses' waters
 */
function crowding(state: GameState, { columns, rows, sums }: SeaRoom, x: number, y: number) {
  let bots = 0;
  for (const ship of state.ships) {
    if (ship.bot && Math.abs(ship.x - x) < CROWD_RADIUS && Math.abs(ship.y - y) < CROWD_RADIUS) bots++;
  }
  const left = clamp(Math.floor((x - CROWD_RADIUS) / ROOM_CELL), 0, columns);
  const right = clamp(Math.ceil((x + CROWD_RADIUS) / ROOM_CELL), 0, columns);
  const top = clamp(Math.floor((y - CROWD_RADIUS) / ROOM_CELL), 0, rows);
  const bottom = clamp(Math.ceil((y + CROWD_RADIUS) / ROOM_CELL), 0, rows);
  const width = columns + 1;
  const cells =
    sums[bottom * width + right] - sums[top * width + right] - sums[bottom * width + left] + sums[top * width + left];
  return (bots + 1) / Math.max(1, cells);
}

/**
 * One of a pack: by its mates afloat, near the first of them, never while they fight (no help comes out of the fog in
 * the middle of a fight); with none of them afloat, as a bot alone would come (spawn), the first of the pack again, so
 * the next ones come by it. False if it can't come this time
 */
function spawnInPack(
  state: GameState,
  nav: NavGrid,
  room: SeaRoom,
  random: () => number,
  kindId: BotKindId,
  unseen: boolean,
  near: Point | null,
  pack: number,
) {
  const mates = packsAfloat(state.ships).get(pack);
  if (!mates) return spawn(state, nav, room, random, kindId, unseen, near, pack);
  if (mates.some((mate) => (mate.bot?.foe ?? null) !== null)) return false;
  const kind = BOT_KINDS[kindId];
  const [first] = mates;
  for (let attempt = 0; attempt < SPAWN_TRIES; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = PACK_JOIN[0] + random() * (PACK_JOIN[1] - PACK_JOIN[0]);
    const x = clamp(first.x + Math.cos(angle) * distance, EDGE, WORLD_WIDTH - EDGE);
    const y = clamp(first.y + Math.sin(angle) * distance, EDGE, WORLD_HEIGHT - EDGE);
    if (!fits(state, nav, kind, x, y, unseen)) continue;
    addBot(state, random, kindId, x, y, null, null, pack);
    return true;
  }
  return false;
}

/** The sea's kind of bot that sails this hull, if any: not its boss, who is never prey */
function preyKind(zone: ZoneId, target: UnitKind): BotKindId | null {
  return zoneKinds(zone).find((kind) => kind.shipClass === target && !kind.boss)?.id ?? null;
}

/**
 * The story's prey: as many bots of the kind the player's step asks them to sink (story/story.ts, storyPrey) as it
 * still asks for, brought in near their ship at sea, out of sight, weaker than their kind (PREY_HULL, PREY_POWER).
 * One the story no longer asks for, or left far behind, is taken away where the player doesn't see it. Each is the
 * player's own: online, one per player who needs it. Stepped from Game.update after the spawns
 */
export function stepPrey(state: GameState, nav: NavGrid, random: () => number) {
  const { player } = state;
  const ship = shipOf(state, player);
  const want = storyPrey(state, player);
  const kind = want ? preyKind(state.world.zone, want.target) : null;
  let afloat = 0;
  for (let i = state.ships.length - 1; i >= 0; i--) {
    const bot = state.ships[i];
    if (bot.bot?.prey !== player.shipId || bot.isSinking) continue;
    const wanted = bot.bot.kind === kind;
    const far = !ship || Math.hypot(bot.x - ship.x, bot.y - ship.y) > PREY_LEASH;
    if ((!wanted || far) && !ship?.canSee(bot.x, bot.y)) state.ships.splice(i, 1);
    else if (wanted) afloat++;
  }
  if (!want || !kind || !ship || ship.docked || ship.isSinking || afloat >= want.count) return;
  spawnPrey(state, nav, random, kind, ship);
}

/** A prey of a kind for a player's ship: near another of its kind already in, or else round the ship */
function spawnPrey(state: GameState, nav: NavGrid, random: () => number, kindId: BotKindId, ship: Ship) {
  const kind = BOT_KINDS[kindId];
  const need = hullReach(SHIP_CLASSES[kind.shipClass].hull) + ROOM;
  const pack = state.ships.find((s) => s.bot?.prey === ship.id && s.bot.kind === kindId && !s.isSinking);
  for (let attempt = 0; attempt < PREY_TRIES; attempt++) {
    // Half the tries by its pack, if it has one: the other half round the ship, in case the pack is in sight
    const from = pack && attempt < PREY_TRIES / 2 ? pack : ship;
    const least = from === ship ? ship.viewRange + PREY_RING[0] : PREY_PACK[0];
    const most = from === ship ? ship.viewRange + PREY_RING[1] : PREY_PACK[1];
    const angle = random() * Math.PI * 2;
    const distance = least + random() * (most - least);
    const x = clamp(from.x + Math.cos(angle) * distance, EDGE, WORLD_WIDTH - EDGE);
    const y = clamp(from.y + Math.sin(angle) * distance, EDGE, WORLD_HEIGHT - EDGE);
    if (nav.clearanceAt(x, y) < need || nearHarbour(state.world.port, x, y)) continue;
    if (nearGate(state.world.gates, x, y) || nearStoryMark(state.world.marks, x, y)) continue;
    if (nearLair(state.world.zone, x, y)) continue;
    if (kind.behaviour === 'aggressive' && Math.hypot(x - START.x, y - START.y) < PREY_SAFE) continue;
    const crowded = state.ships.some((other) => {
      const gap = Math.hypot(other.x - x, other.y - y);
      return gap < SPAWN_GAP || (!other.bot && gap < other.viewRange + SIGHT_MARGIN);
    });
    if (crowded) continue;
    const bot = addBot(state, random, kindId, x, y, null, ship.id);
    bot.setHull(Math.round(bot.maxHp * PREY_HULL));
    bot.power = kind.power * PREY_POWER;
    return true;
  }
  return false;
}

function anywhere(random: () => number): Point {
  return { x: EDGE + random() * (WORLD_WIDTH - 2 * EDGE), y: EDGE + random() * (WORLD_HEIGHT - 2 * EDGE) };
}

/**
 * A point within RESPAWN_SPREAD of `near`, evenly over the disc; null outside the world. Not pushed in to its edge:
 * every point beyond it would land on the edge's line, and the bots near it pile up in the Seam's storm
 */
function around(near: Point, random: () => number): Point | null {
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * RESPAWN_SPREAD;
  const x = near.x + Math.cos(angle) * distance;
  const y = near.y + Math.sin(angle) * distance;
  return x < EDGE || y < EDGE || x > WORLD_WIDTH - EDGE || y > WORLD_HEIGHT - EDGE ? null : { x, y };
}
