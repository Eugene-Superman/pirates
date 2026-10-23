import type { GameState } from '../GameState';
import { clamp } from '../lib/math';
import type { Ship } from '../ships/Ship';
import { AMMO, rollVolley } from './arsenal';
import { RESPAWN_TIME, isAlive, type Target, type TargetKind } from './targets';
import { WEAPONS, WEAPON_IDS, damageShare, type HoldReason, type WeaponId } from './weapons';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * All the guns of one weapon fired together at one target. Its damage is rolled when it is fired and done when its
 * projectiles land: they all fly for the same time, so they land together
 */
export interface Volley {
  readonly weapon: WeaponId;
  readonly targetId: number;
  /** How many guns fired */
  readonly guns: number;
  /** Hit points it takes away, the weapon's share for the target already applied */
  readonly damage: number;
  readonly crits: number;
  readonly misses: number;
  /** Whether the weapon is made for this target (full damage) or not (OFF_TARGET_SHARE of it) */
  readonly full: boolean;
  /** Set when its damage has been done, by the first of its projectiles to land */
  landed: boolean;
}

/**
 * A cannonball or harpoon in flight, one per gun of a volley. It always flies at a target and always hits it: `to`
 * follows the target every update, so the shot bends after a moving one. Everything is computed from game state, so
 * the server and clients agree
 */
export interface Projectile {
  readonly weapon: WeaponId;
  readonly from: Point3;
  /** Where it lands: the target's middle, updated as the target moves */
  readonly to: { x: number; y: number; z: number };
  /** Seconds from the muzzle to the target */
  readonly duration: number;
  /** Top of the arc above the straight line from `from` to `to`, world units */
  readonly arcHeight: number;
  readonly targetId: number;
  readonly volley: Volley;
  /** Seconds since it was fired */
  age: number;
}

/** What happened during the last update, for the client to animate. Cleared at the start of every update */
export type CombatEvent =
  | {
      /** One gun fired */
      readonly type: 'shot';
      readonly weapon: WeaponId;
      /** The muzzle, in world coordinates */
      readonly at: Point3;
      /** Horizontal direction of the shot, a unit vector */
      readonly dirX: number;
      readonly dirY: number;
    }
  | {
      /** One projectile landed */
      readonly type: 'impact';
      readonly weapon: WeaponId;
      readonly at: Point3;
      readonly dirX: number;
      readonly dirY: number;
      readonly targetId: number;
    }
  | {
      /** A volley did its damage */
      readonly type: 'damage';
      readonly targetId: number;
      readonly weapon: WeaponId;
      readonly amount: number;
      readonly guns: number;
      readonly crits: number;
      readonly misses: number;
      readonly full: boolean;
      readonly at: Point3;
    }
  | {
      /** A target's hit points ran out: it is gone until it respawns */
      readonly type: 'destroyed';
      readonly targetId: number;
      readonly kind: TargetKind;
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

/** Whether a weapon reaches the target, measured from the ship's centre */
export function inRange(ship: Ship, target: Target, weapon: WeaponId = ship.weapon) {
  return Math.hypot(target.x - ship.x, target.y - ship.y) <= WEAPONS[weapon].range;
}

/** Why the ship can't fire at the target right now with its selected weapon; null if it can (once loaded) */
export function holdReason(ship: Ship, target: Target): HoldReason | null {
  const guns = ship.guns[ship.weapon];
  if (!guns.some((gun) => gun !== null)) return 'noGuns';
  if (ship.ammo[ship.loaded[ship.weapon]] <= 0) return 'noAmmo';
  if (!ship.canSee(target.x, target.y)) return 'sight';
  if (!inRange(ship, target)) return 'range';
  return null;
}

/**
 * Reloads weapons, fires every ship that has a target and its weapon loaded, moves projectiles and lands them.
 * Stepped from Game.update after the ships and the targets have moved. `random` is the game's own seeded generator:
 * the dice must roll the same on the server and every client
 */
export function stepCombat(state: GameState, dt: number, random: () => number) {
  for (const ship of state.ships) {
    for (const id of WEAPON_IDS) ship.reloads[id] = Math.max(0, ship.reloads[id] - dt);
    if (ship.attackTarget === null) continue;
    const target = state.targets.find((t) => t.id === ship.attackTarget);
    // Destroyed, or gone: nothing left to fire at
    if (!target || !isAlive(target) || ship.isSinking) {
      ship.ceaseFire();
      continue;
    }
    // No shots that can't hit and none into the fog: the ship holds fire, and the player is told why
    ship.holdReason = holdReason(ship, target);
    if (ship.holdReason === null && ship.reloads[ship.weapon] === 0) fire(state, ship, target, random);
  }

  // Backwards, so landed projectiles can be removed in place
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const target = state.targets.find((t) => t.id === p.targetId);
    // Its target was destroyed by another volley first: the shot falls into the sea
    if (!target || !isAlive(target)) {
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
    if (!p.volley.landed) land(state, p.volley, target);
  }
}

function aimAt(point: { x: number; y: number; z: number }, target: Target) {
  point.x = target.x;
  point.y = target.y;
  point.z = target.height / 2;
}

/**
 * A volley: every fitted gun of the selected weapon that has a shot of the loaded ammo fires one, the ammo is taken
 * from the hold, the dice are rolled and the weapon reloads
 */
function fire(state: GameState, ship: Ship, target: Target, random: () => number) {
  const weapon = WEAPONS[ship.weapon];
  const ammo = AMMO[ship.loaded[weapon.id]];
  const fitted = ship.fittedGuns(weapon.id);
  const count = Math.min(fitted.length, ship.ammo[ammo.id]);
  ship.ammo[ammo.id] -= count;
  ship.reloads[weapon.id] = weapon.reload;

  const share = damageShare(weapon.id, target.nature);
  const roll = rollVolley(
    fitted.map((f) => f.gun),
    count,
    ammo.bonus,
    share,
    random,
  );
  const volley: Volley = {
    ...roll,
    weapon: weapon.id,
    targetId: target.id,
    guns: count,
    full: share === 1,
    landed: false,
  };

  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  // Cannons are run out on the side facing the target
  const side = -(target.x - ship.x) * sin + (target.y - ship.y) * cos >= 0 ? 1 : -1;
  // Every shot of the volley flies for the same time, so they land together and the damage is done once
  const duration = Math.hypot(target.x - ship.x, target.y - ship.y) / weapon.speed;
  for (let k = 0; k < count; k++) {
    const m = ship.shipClass.slots[weapon.id][fitted[k].slot];
    const y = weapon.id === 'cannon' ? Math.abs(m.y) * side : m.y;
    const from = { x: ship.x + m.x * cos - y * sin, y: ship.y + m.x * sin + y * cos, z: m.z };
    const to = { x: 0, y: 0, z: 0 };
    aimAt(to, target);
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    state.projectiles.push({
      weapon: weapon.id,
      from,
      to,
      duration,
      arcHeight: length * weapon.arc,
      targetId: target.id,
      volley,
      age: 0,
    });
    state.events.push({
      type: 'shot',
      weapon: weapon.id,
      at: from,
      dirX: (to.x - from.x) / length,
      dirY: (to.y - from.y) / length,
    });
  }
}

/** A volley's damage is done: the target loses hit points, and is destroyed at 0 */
function land(state: GameState, volley: Volley, target: Target) {
  volley.landed = true;
  target.hp = Math.max(0, target.hp - volley.damage);
  const at = { x: target.x, y: target.y, z: target.height };
  const { weapon, guns, crits, misses, full } = volley;
  state.events.push({
    type: 'damage',
    targetId: target.id,
    weapon,
    amount: volley.damage,
    guns,
    crits,
    misses,
    full,
    at,
  });
  if (target.hp > 0) return;
  target.respawnAt = state.time + RESPAWN_TIME;
  state.events.push({ type: 'destroyed', targetId: target.id, kind: target.kind, at });
}
