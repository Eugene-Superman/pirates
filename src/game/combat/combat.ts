import type { GameState } from '../GameState';
import { clamp } from '../lib/math';
import { hullGap } from '../physics/hull';
import type { Ship } from '../ships/Ship';
import { PERKS, reloadShare, type TalentId } from '../ships/talents';
import { AMMO, rollVolley, type AmmoId, type Bite, type DamageDie, type GunId } from './arsenal';
import type { Cargo } from '../economy/cargo';
import type { QuestId } from '../economy/quests';
import type { PathStepId } from '../economy/shipyard';
import type { GoldReason } from '../records/stats';
import type { ZoneId } from '../world/zones';
import { findUnit, isAfloat, unitKind, type Unit, type UnitKind } from './units';
import { WEAPONS, WEAPON_IDS, damageShare, type HoldReason, type WeaponId } from './weapons';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** What did the damage: a weapon's volley, a monster's bite, a boss's mortar shell (combat/barrage.ts) */
export type DamageSource = WeaponId | 'bite' | 'shell';

/** One die of a volley in full: which gun rolled it (null: a monster's jaws), its sides, the face, what it did */
export interface DieResult {
  readonly gun: GunId | null;
  readonly die: number;
  readonly roll: number;
  /** Before the weapon's share for the target; 0 for a miss */
  readonly damage: number;
}

/**
 * Who struck and with what, every die of it: rolled when a volley is fired (or a monster bites) and carried to the
 * damage it does, so the combat log can show how it went even after the attacker is gone
 */
export interface Strike {
  readonly attackerId: number;
  readonly attackerKind: UnitKind;
  readonly source: DamageSource;
  /** The ammo fired; null for a bite */
  readonly ammo: AmmoId | null;
  /** Added to every die that hits: the ammo's, or the jaws' own */
  readonly bonus: number;
  /** Share of the dice's sum the target takes: 1, or OFF_TARGET_SHARE for a weapon not made for it */
  readonly share: number;
  /** What the attacker's talents (Broadside, Point blank) and a bot's power in its sea multiply the damage by; 1 without */
  readonly boost: number;
  /** The attacker's talents that changed this strike: Steady hands (in `bonus`), Keen eye, Broadside, Point blank */
  readonly talents: readonly TalentId[];
  readonly dice: readonly DieResult[];
}

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
  /** How it was rolled, die by die */
  readonly strike: Strike;
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
      /** The ammo it fired, one shot per muzzle */
      readonly ammo: AmmoId;
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
      readonly targetKind: UnitKind;
      readonly attackerId: number;
      readonly source: DamageSource;
      readonly amount: number;
      /** How many dice were rolled: the guns that fired, or one for a bite */
      readonly guns: number;
      readonly crits: number;
      readonly misses: number;
      readonly full: boolean;
      readonly at: Point3;
      /** Every die of it, for the combat log */
      readonly strike: Strike;
      /** Share of it the target's talent let through (Iron bow, Reinforced sides), and which; 1 and null without */
      readonly guard: number;
      readonly guardedBy: TalentId | null;
    }
  | {
      /** A unit's hit points ran out: it goes down */
      readonly type: 'destroyed';
      readonly targetId: number;
      readonly kind: UnitKind;
      /** Whose blow it was */
      readonly attackerId: number;
      readonly attackerKind: UnitKind;
      readonly at: Point3;
      /** Which way it faced, for the client's wreck */
      readonly heading: number;
    }
  | {
      /** A repair step mended a ship's hull (ships/repair.ts) */
      readonly type: 'repair';
      readonly shipId: number;
      readonly amount: number;
      /** Gold its player paid the crew for it: 0 for most steps, the fractions adding up to a coin every few */
      readonly paid: number;
      readonly at: Point3;
    }
  | {
      /** A repair stopped before the hull was whole for want of gold to pay the crew (ships/repair.ts) */
      readonly type: 'repairStopped';
      readonly shipId: number;
      readonly reason: 'gold';
    }
  | {
      /** A player was paid (economy/): a bounty for a kill, a chest hauled aboard, a quest turned in, goods sold, guns
       * or ammo sold back */
      readonly type: 'gold';
      /** The player's ship */
      readonly shipId: number;
      readonly amount: number;
      readonly reason: GoldReason;
      /** What was sunk, for a bounty */
      readonly kind: UnitKind | null;
      /** Which quest, for a quest */
      readonly quest: QuestId | null;
      readonly at: Point3;
    }
  | {
      /** A ship earned experience (ships/talents.ts) */
      readonly type: 'xp';
      readonly shipId: number;
      readonly amount: number;
      readonly reason: 'kill' | 'quest';
      readonly at: Point3;
    }
  | {
      /** A ship reached a level: a talent to pick */
      readonly type: 'level';
      readonly shipId: number;
      readonly level: number;
      readonly at: Point3;
    }
  | {
      /** A talent did something now: an ability used, Second wind mending the hull (`amount` points) */
      readonly type: 'talent';
      readonly shipId: number;
      readonly talent: TalentId;
      readonly amount: number;
      readonly at: Point3;
    }
  | {
      /**
       * Goods hauled aboard (economy/loot.ts): from a wreck's chest (`loot`), or a player's own cargo lost when their
       * ship went down (`salvage`)
       */
      readonly type: 'cargo';
      readonly shipId: number;
      readonly goods: Cargo;
      readonly reason: 'loot' | 'salvage';
      readonly at: Point3;
    }
  | {
      /** A player's ship went down: the cargo it had aboard floats where it sank, to be hauled aboard again */
      readonly type: 'cargoLost';
      readonly shipId: number;
      readonly goods: Cargo;
      readonly at: Point3;
    }
  | {
      /** A player's ship sailed over goods with no room left in its hold */
      readonly type: 'holdFull';
      readonly shipId: number;
      readonly at: Point3;
    }
  | {
      /**
       * A player's ship sailed into a gate to another sea that won't let it through (world/gates.ts): a ship of a lower
       * tier than the sea's (`tier`, the one it needs), or one in combat
       */
      readonly type: 'gateClosed';
      readonly shipId: number;
      readonly to: ZoneId;
      readonly reason: 'tier' | 'combat';
      readonly tier: number;
      readonly at: Point3;
    }
  | {
      /** A boss fired a barrage: its shells are marked on the water (state.shells) */
      readonly type: 'barrage';
      readonly shipId: number;
      readonly targetId: number;
      readonly at: Point3;
    }
  | {
      /** A barrage's shell landed */
      readonly type: 'shellLanded';
      readonly ownerId: number;
      readonly at: Point3;
    }
  | {
      /** A step of the Captain's path done (economy/shipyard.ts) */
      readonly type: 'pathStep';
      readonly shipId: number;
      readonly step: PathStepId;
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
  if (!ship.infiniteAmmo) {
    const loaded = ship.loaded[ship.weapon];
    if (ship.ammo[loaded] <= 0) return 'noAmmo';
    if (!ship.ammoBar[ship.weapon].includes(loaded)) return 'notAtHand';
  }
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
    // Destroyed, gone, or in port (out of the fight): nothing left to fire at
    if (!target || !isAfloat(target) || target.docked || ship.isSinking) {
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
    // Its target was destroyed by another volley first, or made it into port: the shot falls into the sea
    if (!target || !isAfloat(target) || target.docked) {
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
    hurt(state, target, p.strike, p, { x: target.x, y: target.y, z: target.height });
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
  const ready = ship
    .fittedGuns(weapon.id)
    .filter(({ gun, slot }) => reloads[slot] === 0 && ship.reach(gun) >= distance);
  const count = ship.infiniteAmmo ? ready.length : Math.min(ready.length, ship.ammo[ammo.id]);
  if (count === 0) return;
  const firing = ready.slice(0, count);
  if (!ship.infiniteAmmo) ship.addAmmo(ammo.id, -count);
  const reload = reloadShare(ship, weapon.id);
  for (const { gun, slot } of firing) reloads[slot] = gun.reload * reload;

  // The ship's talents: more on every die, crits sooner, more damage up close, from a Broadside, an ambush, a run of
  // volleys at one target or a last stand
  const talents: TalentId[] = [];
  let bonus = ammo.bonus;
  const steady = ship.rank('steadyHands');
  if (steady > 0) {
    bonus += PERKS.dieBonus * steady;
    talents.push('steadyHands');
  }
  let dice: DamageDie[] = firing.map((f) => f.gun);
  const keen = ship.rank('keenEye');
  if (keen > 0) {
    dice = dice.map((die) => ({ ...die, critFrom: Math.max(die.missOn + 1, die.critFrom - PERKS.critSooner * keen) }));
    talents.push('keenEye');
  }
  let boost = 1;
  const close = ship.rank('pointBlank');
  if (close > 0 && distance <= ship.range(weapon.id) * PERKS.pointBlank.within) {
    boost *= 1 + PERKS.pointBlank.boost * close;
    talents.push('pointBlank');
  }
  if (ship.broadsideArmed) {
    ship.broadsideArmed = false;
    boost *= PERKS.broadside;
    talents.push('broadside');
  }
  if (ship.hasTalent('ambush') && !target.inCombat(state.time)) {
    boost *= PERKS.ambush;
    talents.push('ambush');
  }
  const run = ship.relentless;
  run.volleys = run.target === target.id ? Math.min(run.volleys + 1, PERKS.relentless.most) : 0;
  run.target = target.id;
  if (ship.hasTalent('relentless') && run.volleys > 0) {
    boost *= 1 + PERKS.relentless.boost * run.volleys;
    talents.push('relentless');
  }
  if (ship.hasTalent('lastStand') && ship.health < PERKS.lastStand.below) {
    boost *= PERKS.lastStand.boost;
    talents.push('lastStand');
  }
  // A bot hits as hard as its sea asks
  boost *= ship.power;
  const share = damageShare(weapon.id, target.nature);
  const roll = rollVolley(dice, bonus, share * boost, random);
  const strike: Strike = {
    attackerId: ship.id,
    attackerKind: unitKind(ship),
    source: weapon.id,
    ammo: ammo.id,
    bonus,
    share,
    boost,
    talents,
    dice: firing.map(({ gun }, i) => ({ gun: gun.id, die: gun.die, ...roll.rolls[i] })),
  };

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
    damage: roll.damage,
    crits: roll.crits,
    misses: roll.misses,
    strike,
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
    ammo: ammo.id,
    at: from,
    muzzles,
    dirX: (to.x - from.x) / length,
    dirY: (to.y - from.y) / length,
  });
  // Firing, or being fired at, is combat: no repairs for a while
  ship.enterCombat(state.time);
  target.enterCombat(state.time);
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
  const gap = hullGap(from.x, from.y, target);
  monster.holdReason = !monster.canSee(target.x, target.y) ? 'sight' : gap > jaws.reach ? 'range' : null;
  if (monster.holdReason !== null || monster.biteReload > 0) return;
  monster.biteReload = jaws.reload;
  const at = { x: target.x, y: target.y, z: target.height / 2 };
  state.events.push({ type: 'bite', attackerId: monster.id, targetId: target.id, from, at });
  monster.enterCombat(state.time);
  strikeOnce(state, monster, target, jaws, 'bite', random);
}

/**
 * One die's blow at full damage, done at once with no projectile: a monster's bite, a boss's mortar shell
 * (combat/barrage.ts). `random` is the game's dice
 */
export function strikeOnce(
  state: GameState,
  attacker: Unit,
  target: Unit,
  weapon: DamageDie & { readonly bonus: number },
  source: 'bite' | 'shell',
  random: () => number,
) {
  // A bot's bite or shell as hard as its sea asks
  const roll = rollVolley([weapon], weapon.bonus, attacker.power, random);
  const strike: Strike = {
    attackerId: attacker.id,
    attackerKind: unitKind(attacker),
    source,
    ammo: null,
    bonus: weapon.bonus,
    share: 1,
    boost: attacker.power,
    talents: [],
    dice: [{ gun: null, die: weapon.die, ...roll.rolls[0] }],
  };
  hurt(state, target, strike, { ...roll, guns: 1 }, { x: target.x, y: target.y, z: target.height });
}

/** The talent of a unit that takes less from this source, if it has one: Iron bow against bites, Reinforced sides cannons */
function guardOf(unit: Unit, source: DamageSource): { talent: TalentId; share: number } | null {
  const talent = source === 'bite' ? 'ironBow' : source === 'cannon' || source === 'shell' ? 'reinforcedSides' : null;
  const rank = talent ? unit.rank(talent) : 0;
  if (!talent || rank === 0) return null;
  return { talent, share: 1 - (talent === 'ironBow' ? PERKS.biteGuard : PERKS.cannonGuard) * rank };
}

/**
 * Damage is done: the unit loses hit points (less with a talent that guards against it), and remembers who hit it (a
 * bot fights back). Second wind may mend it at once; a chain shot slows it. At 0 it is wrecked: it goes down (a bot's
 * is then taken out of the game, bots/spawner.ts)
 */
export function hurt(
  state: GameState,
  unit: Unit,
  strike: Strike,
  roll: { readonly damage: number; readonly guns: number; readonly crits: number; readonly misses: number },
  at: Point3,
) {
  const { guns, crits, misses } = roll;
  const { attackerId, attackerKind, source } = strike;
  const guard = guardOf(unit, source);
  const damage = unsinkable(state, unit, guard ? Math.round(roll.damage * guard.share) : roll.damage);
  const afloat = isAfloat(unit);
  unit.takeDamage(damage);
  unit.lastHitBy = attackerId;
  unit.enterCombat(state.time);
  if (source === 'cannon' && damage > 0 && findUnit(state, attackerId)?.hasTalent('chainShot')) {
    unit.slowedUntil = state.time + PERKS.chainShot.time;
  }
  state.events.push({
    type: 'damage',
    targetId: unit.id,
    targetKind: unitKind(unit),
    attackerId,
    source,
    amount: damage,
    guns,
    crits,
    misses,
    full: strike.share === 1,
    at,
    strike,
    guard: guard ? guard.share : 1,
    guardedBy: guard ? guard.talent : null,
  });
  if (isAfloat(unit)) secondWind(state, unit);
  if (!afloat || isAfloat(unit)) return;
  state.events.push({
    type: 'destroyed',
    targetId: unit.id,
    kind: unitKind(unit),
    attackerId,
    attackerKind,
    at,
    heading: unit.heading,
  });
}

/** Unsinkable: a blow that would sink the ship leaves it at 1 hull point instead, once every few minutes */
function unsinkable(state: GameState, ship: Ship, damage: number) {
  if (damage < ship.hp || ship.hp <= 1 || !ship.hasTalent('unsinkable') || state.time < ship.unsinkableReadyAt) {
    return damage;
  }
  ship.unsinkableReadyAt = state.time + PERKS.unsinkable;
  state.events.push({
    type: 'talent',
    shipId: ship.id,
    talent: 'unsinkable',
    amount: 0,
    at: { x: ship.x, y: ship.y, z: ship.height },
  });
  return ship.hp - 1;
}

/** Second wind: once a fight, a ship hit down to a quarter of its hull gets a share of it back at once */
function secondWind(state: GameState, ship: Ship) {
  if (!ship.hasTalent('secondWind') || ship.secondWindUsed || ship.health > PERKS.secondWind.below) return;
  ship.secondWindUsed = true;
  const amount = Math.round(ship.maxHp * PERKS.secondWind.heal);
  ship.heal(amount);
  state.events.push({
    type: 'talent',
    shipId: ship.id,
    talent: 'secondWind',
    amount,
    at: { x: ship.x, y: ship.y, z: ship.height },
  });
}
