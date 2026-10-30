import { spawnBrood } from '../bots/spawner';
import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import type { NavGrid } from '../navigation/NavGrid';
import { routeClearance } from '../navigation/pilot';
import { hullGap, hullReach } from '../physics/hull';
import type { Ship } from '../ships/Ship';
import type { ShipClassId } from '../ships/shipClasses';
import type { DamageDie } from './arsenal';
import { strikeOnce } from './combat';
import { findUnit, isAfloat } from './units';

/**
 * A monster's dive (MonsterSkills.dive): at a foe out of its arms' reach it goes under, swims at it and comes up under
 * it, its arms striking every player's ship within `radius` of where it comes up. That spot is marked on the water the
 * last `warn` seconds before, where the foe will be if it sails on: seen in time, it is got out of, turning hard
 */
export interface Dive extends DamageDie {
  readonly bonus: number;
  /** Seconds from one dive to the next: while its hull is above its skills' `phase`, and below it */
  readonly cooldown: readonly [number, number];
  /** World units from its foe: it dives at one farther than `from` (its arms reach nearer) and nearer than `range` */
  readonly from: number;
  readonly range: number;
  /** Seconds under water in all, the last `warn` of them with the spot it comes up at marked */
  readonly under: number;
  readonly warn: number;
  /** World units round that spot its arms strike */
  readonly radius: number;
}

/**
 * Its ink (MonsterSkills.ink): a cloud on the water round it each time its hull falls past one of `at` (shares of it,
 * from the top), spreading to `radius` in `spread` seconds and lasting `lasts`. A player's crew in it sees only `sight`
 * round the ship, and nobody sees into it from farther (Ship.canSee); the sea's beasts see through it
 */
export interface Ink {
  readonly at: readonly number[];
  readonly radius: number;
  readonly spread: number;
  readonly lasts: number;
  readonly sight: number;
}

/**
 * Its brood (MonsterSkills.brood): `count` young of this hull, the sea's kind that sails it (bots/spawner.ts,
 * spawnBrood), let loose once as its hull falls past `at`. They follow it and fight with it, and go back to the deep
 * once it is gone or calm
 */
export interface Brood {
  readonly hull: ShipClassId;
  readonly count: number;
  readonly at: number;
}

/**
 * A monster's own ways of fighting besides its jaws (ShipClass.skills): the Inkmother's. Below `phase` of its hull it
 * fights harder, its second phase: it dives more often (`dive.cooldown`)
 */
export interface MonsterSkills {
  readonly phase: number;
  readonly dive: Dive | null;
  readonly ink: Ink | null;
  readonly brood: Brood | null;
}

/** A monster under water (Ship.diving): where it went down and when, at whom, and the spot it comes up at once marked */
export interface Diving {
  readonly fromX: number;
  readonly fromY: number;
  readonly targetId: number;
  readonly startAt: number;
  /** Game time the spot it comes up at is marked, and it comes up */
  readonly markAt: number;
  readonly surfaceAt: number;
  /** World units round the spot its arms strike */
  readonly radius: number;
  /** Where its arms strike as it comes up: null till markAt */
  spot: Point | null;
}

/** A cloud of ink on the water (state.inks), spreading from where the monster shed it */
export interface InkCloud {
  readonly id: number;
  readonly ownerId: number;
  readonly x: number;
  readonly y: number;
  /** World units it has spread to now, out of `reach` */
  radius: number;
  readonly reach: number;
  /** Game times it was shed and thins away */
  readonly from: number;
  readonly until: number;
  /** Seconds it takes to spread */
  readonly spread: number;
  /** World units a player's crew in it sees */
  readonly sight: number;
}

/** What hides a player's crew's sight (Ship.veils): a cloud of ink as it is now */
export type Veil = Pick<InkCloud, 'x' | 'y' | 'radius' | 'sight'>;

// Seconds into a fight before a monster's first dive: the captain sees what it is first
const FIRST_DIVE = 4;

/**
 * The monsters' own ways of fighting (ShipClass.skills): the clouds of ink spread and thin away; a monster under water
 * marks where it will come up and comes up there, striking; one awake sheds ink and lets its brood loose as its hull
 * falls, and dives at its foe when it is ready; a brood whose mother is gone or calm goes back to the deep. Stepped
 * from Game.update after the barrages. `random`: the dice; `botRandom`: the bots' own (where the young come in)
 */
export function stepMonsterSkills(state: GameState, nav: NavGrid, random: () => number, botRandom: () => number) {
  const { time } = state;
  state.inks = state.inks.filter((cloud) => time < cloud.until);
  for (const cloud of state.inks) {
    const k = Math.min(1, (time - cloud.from) / cloud.spread);
    cloud.radius = cloud.reach * (1 - (1 - k) * (1 - k));
  }
  for (const ship of state.ships) ship.veils = state.inks;

  // A brood let loose joins the ships as this goes on, and is passed over: it has no skills of its own
  for (const ship of state.ships) {
    const skills = ship.shipClass.skills;
    const mind = ship.bot;
    if (!skills || !mind || ship.isSinking) continue;
    if (ship.diving) {
      stepDive(state, nav, ship, ship.diving, random);
      continue;
    }
    // Calm, it is ready to dive a while into the next fight
    if (mind.foe === null) mind.diveReadyAt = Math.max(mind.diveReadyAt, time + FIRST_DIVE);
    const share = ship.hp / ship.maxHp;
    if (skills.ink) shedInk(state, ship, skills.ink, share);
    if (skills.brood && !mind.broodLoosed && share <= skills.brood.at) {
      mind.broodLoosed = true;
      spawnBrood(state, nav, botRandom, ship, skills.brood.hull, skills.brood.count);
    }
    if (skills.dive) goUnder(state, ship, skills.dive, share <= skills.phase ? 1 : 0);
  }
  broodHome(state);
}

/** It goes under at its foe, if it is ready and the foe is out of its arms' reach but not too far */
function goUnder(state: GameState, ship: Ship, dive: Dive, phase: 0 | 1) {
  const mind = ship.bot;
  const { time } = state;
  if (!mind || time < mind.diveReadyAt || ship.attackTarget === null) return;
  const foe = findUnit(state, ship.attackTarget);
  if (!foe || !isAfloat(foe) || foe.docked) return;
  const distance = Math.hypot(foe.x - ship.x, foe.y - ship.y);
  // No canSee: a bot's stops at its view range, short of the dive's, and a monster chasing its foe knows where it is
  if (distance <= dive.from || distance > dive.range) return;
  mind.diveReadyAt = time + dive.cooldown[phase];
  ship.diving = {
    fromX: ship.x,
    fromY: ship.y,
    targetId: foe.id,
    startAt: time,
    markAt: time + dive.under - dive.warn,
    surfaceAt: time + dive.under,
    radius: dive.radius,
    spot: null,
  };
  ship.speed = 0;
  ship.clearTarget();
  ship.enterCombat(time);
  state.events.push({ type: 'dive', shipId: ship.id, targetId: foe.id, at: { x: ship.x, y: ship.y, z: 0 } });
}

/**
 * Under water: the spot it comes up at is marked where its foe will be as it comes up, if it sails on; then it comes
 * up beside the hull nearest that spot, facing it, its arms striking every player's ship within the radius
 */
function stepDive(state: GameState, nav: NavGrid, ship: Ship, diving: Diving, random: () => number) {
  const { time } = state;
  ship.speed = 0;
  const foe = findUnit(state, diving.targetId);
  const chased = foe && isAfloat(foe) && !foe.docked ? foe : null;
  if (!diving.spot && time >= diving.markAt) {
    const ahead = diving.surfaceAt - diving.markAt;
    diving.spot = chased
      ? { x: chased.x + chased.vx * ahead, y: chased.y + chased.vy * ahead }
      : { x: diving.fromX, y: diving.fromY };
  }
  const { spot } = diving;
  if (!spot || time < diving.surfaceAt) return;
  ship.diving = null;
  const place = surfacePlace(state, nav, ship, spot, diving);
  ship.x = place.x;
  ship.y = place.y;
  const facing = chased ?? spot;
  ship.rotation = Math.atan2(facing.y - ship.y, facing.x - ship.x);
  ship.clearTarget();
  if (ship.bot) ship.bot.aimedAt = -Infinity;
  ship.enterCombat(time);
  state.events.push({ type: 'surface', shipId: ship.id, at: { x: spot.x, y: spot.y, z: 0 }, radius: diving.radius });
  const arms = ship.shipClass.skills?.dive;
  if (!arms) return;
  for (const unit of state.ships) {
    if (unit.bot || unit.isSinking || unit.docked || hullGap(spot.x, spot.y, unit) > diving.radius) continue;
    strikeOnce(state, ship, unit, arms, 'arms', random);
  }
}

/**
 * Where a monster comes up at a spot: there, but beside a hull in the way rather than on top of it, on the side it swam
 * from; the open water nearest that, or where it went down if there is none
 */
function surfacePlace(state: GameState, nav: NavGrid, ship: Ship, spot: Point, diving: Diving): Point {
  let { x, y } = spot;
  for (const other of state.ships) {
    if (other === ship || other.isSinking) continue;
    const room = hullReach(ship.hull) + hullReach(other.hull);
    let dx = x - other.x;
    let dy = y - other.y;
    let d = Math.hypot(dx, dy);
    if (d >= room) continue;
    if (d < 1) {
      dx = diving.fromX - other.x;
      dy = diving.fromY - other.y;
      d = Math.hypot(dx, dy) || 1;
    }
    x = other.x + (dx / d) * room;
    y = other.y + (dy / d) * room;
  }
  return nav.nearestOpen(x, y, routeClearance(ship)) ?? { x: diving.fromX, y: diving.fromY };
}

/** A cloud of ink round it as its hull falls past the next of its ink's shares: one for several passed at once */
function shedInk(state: GameState, ship: Ship, ink: Ink, share: number) {
  const mind = ship.bot;
  if (!mind || mind.inks >= ink.at.length || share > ink.at[mind.inks]) return;
  while (mind.inks < ink.at.length && share <= ink.at[mind.inks]) mind.inks++;
  const { time } = state;
  state.inks.push({
    id: state.nextId++,
    ownerId: ship.id,
    x: ship.x,
    y: ship.y,
    radius: 0,
    reach: ink.radius,
    from: time,
    until: time + ink.lasts,
    spread: ink.spread,
    sight: ink.sight,
  });
  state.events.push({ type: 'ink', shipId: ship.id, at: { x: ship.x, y: ship.y, z: 0 }, radius: ink.radius });
}

/** A brood whose mother is gone, or calm with them, goes back to the deep: out of the game, a `dive` event each */
function broodHome(state: GameState) {
  for (let i = state.ships.length - 1; i >= 0; i--) {
    const young = state.ships[i];
    const mind = young.bot;
    if (!mind?.young || young.isSinking) continue;
    const mother = mind.leader === null ? undefined : findUnit(state, mind.leader);
    const gone = !mother || mother.isSinking;
    if (!gone && (mother.bot?.foe !== null || mind.foe !== null)) continue;
    state.ships.splice(i, 1);
    state.events.push({ type: 'dive', shipId: young.id, targetId: null, at: { x: young.x, y: young.y, z: 0 } });
  }
}
