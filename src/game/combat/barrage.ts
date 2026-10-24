import type { GameState } from '../GameState';
import { hullGap } from '../physics/hull';
import type { DamageDie } from './arsenal';
import { strikeOnce, type Point3 } from './combat';
import { findUnit, isAfloat } from './units';

/**
 * A boss's mortar (ShipClass.barrage): every `cooldown` seconds, at a foe within `range` it can see, it marks `shells`
 * spots on the water, `radius` world units each, that its shells hit `delay` seconds later: one where the foe is, one
 * where it will be if it sails on, the rest scattered round that within `spread`. Each shell rolls the die (plus
 * `bonus`) against every player's ship it lands on. Seen coming, it is dodged by turning or stopping
 */
export interface Barrage extends DamageDie {
  readonly range: number;
  readonly cooldown: number;
  readonly shells: number;
  readonly radius: number;
  readonly delay: number;
  readonly spread: number;
  readonly bonus: number;
}

/** A shell on its way: the spot it was aimed at, marked on the water till it lands */
export interface Shell {
  readonly id: number;
  /** The ship that fired it */
  readonly ownerId: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly firedAt: number;
  readonly landsAt: number;
}

/**
 * Bosses fire their barrages at the foes they attack, and shells due land: a `shellLanded` event each, and damage to
 * every player's ship under it (`hurt`, as from a cannon). Stepped from Game.update right after combat; `random` is the
 * game's dice
 */
export function stepBarrages(state: GameState, random: () => number) {
  for (const ship of state.ships) {
    const barrage = ship.shipClass.barrage;
    if (!barrage || ship.isSinking || ship.attackTarget === null || state.time < ship.barrageReadyAt) continue;
    const target = findUnit(state, ship.attackTarget);
    if (!target || !isAfloat(target) || target.docked) continue;
    if (Math.hypot(target.x - ship.x, target.y - ship.y) > barrage.range || !ship.canSee(target.x, target.y)) continue;
    ship.barrageReadyAt = state.time + barrage.cooldown;
    const lead = { x: target.x + target.vx * barrage.delay, y: target.y + target.vy * barrage.delay };
    for (let i = 0; i < barrage.shells; i++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * barrage.spread;
      const spot =
        i === 0
          ? { x: target.x, y: target.y }
          : i === 1
            ? lead
            : { x: lead.x + Math.cos(angle) * distance, y: lead.y + Math.sin(angle) * distance };
      state.shells.push({
        id: state.nextId++,
        ownerId: ship.id,
        x: spot.x,
        y: spot.y,
        radius: barrage.radius,
        firedAt: state.time,
        landsAt: state.time + barrage.delay,
      });
    }
    state.events.push({
      type: 'barrage',
      shipId: ship.id,
      targetId: target.id,
      at: { x: ship.x, y: ship.y, z: ship.height },
    });
  }

  const landed = state.shells.filter((shell) => state.time >= shell.landsAt);
  if (landed.length === 0) return;
  state.shells = state.shells.filter((shell) => state.time < shell.landsAt);
  for (const shell of landed) {
    const at: Point3 = { x: shell.x, y: shell.y, z: 0 };
    state.events.push({ type: 'shellLanded', ownerId: shell.ownerId, at });
    const owner = findUnit(state, shell.ownerId);
    const barrage = owner?.shipClass.barrage;
    if (!owner || !barrage) continue;
    for (const unit of state.ships) {
      if (unit.bot || unit.isSinking || unit.docked) continue;
      if (hullGap(shell.x, shell.y, unit) > shell.radius) continue;
      strikeOnce(state, owner, unit, barrage, 'shell', random);
    }
  }
}
