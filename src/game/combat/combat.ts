import type { GameState } from '../GameState';
import { clamp } from '../lib/math';
import type { Ship } from '../ships/Ship';
import type { Target } from './targets';
import { WEAPONS, WEAPON_IDS, type WeaponId } from './weapons';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A cannonball or harpoon in flight. It always flies at a target and always hits it: `to` follows the target every
 * update, so the shot bends after a moving one. Everything is computed from game state, so the server and clients agree
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
  /** Seconds since it was fired */
  age: number;
}

/** What happened during the last update, for the client to animate. Cleared at the start of every update */
export type CombatEvent =
  | {
      readonly type: 'shot';
      readonly weapon: WeaponId;
      /** The muzzle, in world coordinates */
      readonly at: Point3;
      /** Horizontal direction of the shot, a unit vector */
      readonly dirX: number;
      readonly dirY: number;
    }
  | {
      readonly type: 'impact';
      readonly weapon: WeaponId;
      readonly at: Point3;
      readonly dirX: number;
      readonly dirY: number;
      readonly targetId: number;
    }
  | {
      /** The ship was ordered to fire but held fire: the target is beyond the weapon's range, or hidden in the fog */
      readonly type: 'holdFire';
      readonly reason: 'range' | 'sight';
      readonly weapon: WeaponId;
      readonly targetId: number;
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

/** Whether the ship's selected weapon reaches the target, measured from the ship's centre */
export function inRange(ship: Ship, target: Target, weapon: WeaponId = ship.weapon) {
  return Math.hypot(target.x - ship.x, target.y - ship.y) <= WEAPONS[weapon].range;
}

/**
 * Reloads weapons, fires the ship's pending order and moves projectiles.
 * Stepped from Game.update after the ship and the targets have moved
 */
export function stepCombat(state: GameState, dt: number) {
  const { ship } = state;
  for (const id of WEAPON_IDS) ship.reloads[id] = Math.max(0, ship.reloads[id] - dt);

  if (ship.fireOrder !== null && ship.reloads[ship.weapon] === 0) {
    const target = state.targets.find((t) => t.id === ship.fireOrder);
    ship.fireOrder = null;
    // No shots that can't hit and none into the fog: the ship holds fire, and the player is told why
    if (target) {
      const reason = !ship.canSee(target.x, target.y) ? 'sight' : !inRange(ship, target) ? 'range' : null;
      if (reason) state.events.push({ type: 'holdFire', reason, weapon: ship.weapon, targetId: target.id });
      else fire(state, ship, target);
    }
  }

  // Backwards, so landed projectiles can be removed in place
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const target = state.targets.find((t) => t.id === p.targetId);
    if (!target) {
      state.projectiles.splice(i, 1);
      continue;
    }
    aimAt(p.to, target);
    p.age += dt;
    if (p.age < p.duration) continue;
    state.projectiles.splice(i, 1);
    target.hits++;
    const length = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y) || 1;
    state.events.push({
      type: 'impact',
      weapon: p.weapon,
      at: { ...p.to },
      dirX: (p.to.x - p.from.x) / length,
      dirY: (p.to.y - p.from.y) / length,
      targetId: target.id,
    });
  }
}

function aimAt(point: { x: number; y: number; z: number }, target: Target) {
  point.x = target.x;
  point.y = target.y;
  point.z = target.height / 2;
}

function fire(state: GameState, ship: Ship, target: Target) {
  const weapon = WEAPONS[ship.weapon];
  ship.reloads[weapon.id] = weapon.reload;

  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  // Cannons fire from the side facing the target; other weapons from every mount
  const starboard = -(target.x - ship.x) * sin + (target.y - ship.y) * cos >= 0;
  const mounts = ship.shipClass.mounts[weapon.id].filter((m) => weapon.id !== 'cannon' || m.y >= 0 === starboard);

  for (const m of mounts) {
    const from = { x: ship.x + m.x * cos - m.y * sin, y: ship.y + m.x * sin + m.y * cos, z: m.z };
    const to = { x: 0, y: 0, z: 0 };
    aimAt(to, target);
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    state.projectiles.push({
      weapon: weapon.id,
      from,
      to,
      duration: length / weapon.speed,
      arcHeight: length * weapon.arc,
      targetId: target.id,
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
