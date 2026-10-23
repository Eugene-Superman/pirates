import type { GameState } from '../GameState';
import { closestOnSegment } from '../lib/geometry';
import { clamp } from '../lib/math';
import { bodyAxis } from '../physics/hull';
import { Ship } from '../ships/Ship';
import { AMMO, rollVolley, type Bite, type VolleyRoll } from './arsenal';
import { RESPAWN_TIME } from './targets';
import { findUnit, isAfloat, unitKind, type Unit, type UnitKind } from './units';
import { WEAPONS, WEAPON_IDS, damageShare, type HoldReason, type WeaponId } from './weapons';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** What did the damage: a weapon's volley, or a sea monster's jaws */
export type DamageSource = WeaponId | 'bite';

/**
 * A volley in flight: the guns of one weapon that fired together at one target, as one cannonball or harpoon from the
 * middle of them, however many there are. Its damage is rolled when it is fired and done when it lands. It always
 * flies at the target and always hits it: `to` follows the target every update, so the shot bends after a moving one.
 * Everything is computed from game state, so the server and clients agree
 */
export interface Projectile {
  readonly weapon: WeaponId;
  /** The ship that fired it */
  readonly shooterId: number;
  readonly from: Point3;
  /** Where it lands: the target's middle, updated as the target moves */
  readonly to: { x: number; y: number; z: number };
  /** Seconds from the guns to the target */
  readonly duration: number;
  /** Top of the arc above the straight line from `from` to `to`, world units */
  readonly arcHeight: number;
  readonly targetId: number;
  /** How many guns fired it */
  readonly guns: number;
  /** Hit points it takes away, the weapon's share for the target already applied */
  readonly damage: number;
  readonly crits: number;
  readonly misses: number;
  /** Whether the weapon is made for this target (full damage) or not (OFF_TARGET_SHARE of it) */
  readonly full: boolean;
  /** Seconds since it was fired */
  age: number;
}

/** What happened during the last update, for the client to animate. Cleared at the start of every update */
export type GameEvent =
  | {
      /** A volley was fired */
      readonly type: 'shot';
      readonly weapon: WeaponId;
      readonly shooterId: number;
      /** Where its projectile starts: the middle of the guns that fired, in world coordinates */
      readonly at: Point3;
      /** The muzzle of every gun that fired */
      readonly muzzles: readonly Point3[];
      /** Horizontal direction of the shot, a unit vector */
      readonly dirX: number;
      readonly dirY: number;
    }
  | {
      /** A volley's projectile landed */
      readonly type: 'impact';
      readonly weapon: WeaponId;
      readonly at: Point3;
      readonly dirX: number;
      readonly dirY: number;
      readonly targetId: number;
    }
  | {
      /** A sea monster bit something */
      readonly type: 'bite';
      readonly attackerId: number;
      readonly targetId: number;
      /** The monster's head, and where the bite landed on its victim */
      readonly from: Point3;
      readonly at: Point3;
    }
  | {
      /** A volley or a bite did its damage */
      readonly type: 'damage';
      readonly targetId: number;
      readonly attackerId: number;
      readonly source: DamageSource;
      readonly amount: number;
      /** How many dice were rolled: the guns that fired, or one for a bite */
      readonly guns: number;
      readonly crits: number;
      readonly misses: number;
      readonly full: boolean;
      readonly at: Point3;
    }
  | {
      /** A unit's hit points ran out: a target is gone until it respawns, a ship goes down */
      readonly type: 'destroyed';
      readonly targetId: number;
      readonly kind: UnitKind;
      readonly at: Point3;
      /** Which way it faced, for the client's wreck */
      readonly heading: number;
    }
  | {
      /** A repair step mended a ship's hull (ships/repair.ts) */
      readonly type: 'repair';
      readonly shipId: number;
      readonly amount: number;
      readonly at: Point3;
    };

/** Where a projectile is now: a straight line from the muzzle to the target, lifted by a parabolic arc */
export function projectilePosition(p: Projectile, age = p.age): Point3 {
  const t = clamp(age / p.duration, 0, 1);
  return {
    x: p.from.x + (p.to.x - p.from.x) * t,
    y: p.from.y + (p.to.y - p.from.y) * t,
    z: p.from.z + (p.to.z - p.from.z) * t + 4 * p.arcHeight * t * (1 - t),
  };
}

/** Why the ship can't fire at the target right now with its selected weapon; null if it can (once a gun is loaded) */
export function holdReason(ship: Ship, target: Unit): HoldReason | null {
  const range = ship.range();
  if (range === 0) return 'noGuns';
  if (!ship.infiniteAmmo && ship.ammo[ship.loaded[ship.weapon]] <= 0) return 'noAmmo';
  if (!ship.canSee(target.x, target.y)) return 'sight';
  if (Math.hypot(target.x - ship.x, target.y - ship.y) > range) return 'range';
  return null;
}

/**
 * Reloads guns and jaws, fires every ship that has a target, moves projectiles and lands them. Stepped from
 * Game.update after the ships have moved. `random` is the game's own seeded generator: the dice must roll the same on
 * the server and every client
 */
export function stepCombat(state: GameState, dt: number, random: () => number) {
  for (const ship of state.ships) {
    for (const weapon of WEAPON_IDS) {
      const reloads = ship.reloads[weapon];
      for (let slot = 0; slot < reloads.length; slot++) reloads[slot] = Math.max(0, reloads[slot] - dt);
    }
    ship.biteReload = Math.max(0, ship.biteReload - dt);
    if (ship.attackTarget === null) continue;
    const target = findUnit(state, ship.attackTarget);
    // Destroyed, or gone: nothing left to fire at
    if (!target || !isAfloat(target) || ship.isSinking) {
      ship.ceaseFire();
      continue;
    }
    const jaws = ship.shipClass.bite;
    if (jaws) {
      bite(state, ship, jaws, target, random);
      continue;
    }
    // No shots that can't hit and none into the fog: the ship holds fire, and the player is told why
    ship.holdReason = holdReason(ship, target);
    if (ship.holdReason === null) fire(state, ship, target, random);
  }

  // Backwards, so landed projectiles can be removed in place
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const target = findUnit(state, p.targetId);
    // Its target was destroyed by another volley first: the shot falls into the sea
    if (!target || !isAfloat(target)) {
      state.projectiles.splice(i, 1);
      continue;
    }
    aimAt(p.to, target);
    p.age += dt;
    if (p.age < p.duration) continue;
    state.projectiles.splice(i, 1);
    const length = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y) || 1;
    state.events.push({
      type: 'impact',
      weapon: p.weapon,
      at: { ...p.to },
      dirX: (p.to.x - p.from.x) / length,
      dirY: (p.to.y - p.from.y) / length,
      targetId: target.id,
    });
    hurt(state, target, p.shooterId, p.weapon, p, p.full, { x: target.x, y: target.y, z: target.height });
  }
}

function aimAt(point: { x: number; y: number; z: number }, target: Unit) {
  point.x = target.x;
  point.y = target.y;
  point.z = target.height / 2;
}

/**
 * A volley: every fitted gun of the selected weapon that is loaded, reaches the target and has a shot of the loaded
 * ammo fires one, the ammo is taken from the hold (a bot's never runs out), the dice are rolled and those guns reload.
 * It flies as one projectile, so fifty guns cost no more to move and draw than one
 */
function fire(state: GameState, ship: Ship, target: Unit, random: () => number) {
  const weapon = WEAPONS[ship.weapon];
  const ammo = AMMO[ship.loaded[weapon.id]];
  const distance = Math.hypot(target.x - ship.x, target.y - ship.y);
  const reloads = ship.reloads[weapon.id];
  const ready = ship.fittedGuns(weapon.id).filter(({ gun, slot }) => reloads[slot] === 0 && gun.range >= distance);
  const count = ship.infiniteAmmo ? ready.length : Math.min(ready.length, ship.ammo[ammo.id]);
  if (count === 0) return;
  const firing = ready.slice(0, count);
  if (!ship.infiniteAmmo) ship.ammo[ammo.id] -= count;
  for (const { gun, slot } of firing) reloads[slot] = gun.reload;

  const share = damageShare(weapon.id, target.nature);
  const roll = rollVolley(
    firing.map((f) => f.gun),
    ammo.bonus,
    share,
    random,
  );

  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  // Cannons are run out on the side facing the target
  const side = -(target.x - ship.x) * sin + (target.y - ship.y) * cos >= 0 ? 1 : -1;
  const muzzles = firing.map(({ slot }): Point3 => {
    const m = ship.shipClass.slots[weapon.id][slot];
    const y = weapon.id === 'cannon' ? Math.abs(m.y) * side : m.y;
    return { x: ship.x + m.x * cos - y * sin, y: ship.y + m.x * sin + y * cos, z: m.z };
  });
  const from = {
    x: muzzles.reduce((sum, m) => sum + m.x, 0) / count,
    y: muzzles.reduce((sum, m) => sum + m.y, 0) / count,
    z: muzzles.reduce((sum, m) => sum + m.z, 0) / count,
  };
  const to = { x: 0, y: 0, z: 0 };
  aimAt(to, target);
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  state.projectiles.push({
    ...roll,
    weapon: weapon.id,
    shooterId: ship.id,
    from,
    to,
    duration: length / weapon.speed,
    arcHeight: length * weapon.arc,
    targetId: target.id,
    guns: count,
    full: share === 1,
    age: 0,
  });
  state.events.push({
    type: 'shot',
    weapon: weapon.id,
    shooterId: ship.id,
    at: from,
    muzzles,
    dirX: (to.x - from.x) / length,
    dirY: (to.y - from.y) / length,
  });
  // Firing, or being fired at, is combat: no repairs for a while
  ship.enterCombat(state.time);
  if (target instanceof Ship) target.enterCombat(state.time);
}

/**
 * A sea monster's attack: once its jaws are ready and its head within reach of its victim's hull, it bites. No
 * projectile: the damage is done at once, full whatever the victim is
 */
function bite(state: GameState, monster: Ship, jaws: Bite, target: Unit, random: () => number) {
  const head = monster.hull.bow;
  const from = {
    x: monster.x + Math.cos(monster.rotation) * head,
    y: monster.y + Math.sin(monster.rotation) * head,
    z: monster.height,
  };
  const hull = closestOnSegment(from.x, from.y, bodyAxis(target));
  const gap = Math.hypot(hull.x - from.x, hull.y - from.y) - target.hull.halfBeam;
  monster.holdReason = !monster.canSee(target.x, target.y) ? 'sight' : gap > jaws.reach ? 'range' : null;
  if (monster.holdReason !== null || monster.biteReload > 0) return;
  monster.biteReload = jaws.reload;
  const roll = rollVolley([jaws], jaws.bonus, 1, random);
  const at = { x: target.x, y: target.y, z: target.height / 2 };
  state.events.push({ type: 'bite', attackerId: monster.id, targetId: target.id, from, at });
  monster.enterCombat(state.time);
  if (target instanceof Ship) target.enterCombat(state.time);
  hurt(state, target, monster.id, 'bite', { ...roll, guns: 1 }, true, { ...at, z: target.height });
}

/**
 * Damage is done: the unit loses hit points, and remembers who hit it (a bot fights back). At 0 a target is destroyed
 * until it respawns, and a ship is wrecked: it goes down (a bot's is then taken out of the game, bots/spawner.ts)
 */
function hurt(
  state: GameState,
  unit: Unit,
  attackerId: number,
  source: DamageSource,
  roll: VolleyRoll & { readonly guns: number },
  full: boolean,
  at: Point3,
) {
  const { damage, guns, crits, misses } = roll;
  const afloat = isAfloat(unit);
  if (unit instanceof Ship) {
    unit.takeDamage(damage);
    unit.lastHitBy = attackerId;
    unit.enterCombat(state.time);
  } else {
    unit.hp = Math.max(0, unit.hp - damage);
    if (unit.hp === 0) unit.respawnAt = state.time + RESPAWN_TIME;
  }
  state.events.push({
    type: 'damage',
    targetId: unit.id,
    attackerId,
    source,
    amount: damage,
    guns,
    crits,
    misses,
    full,
    at,
  });
  if (!afloat || isAfloat(unit)) return;
  state.events.push({ type: 'destroyed', targetId: unit.id, kind: unitKind(unit), at, heading: unit.heading });
}
