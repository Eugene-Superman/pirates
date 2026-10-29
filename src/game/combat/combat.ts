import type { GameState } from '../GameState';
import { clamp } from '../lib/math';
import { hullGap } from '../physics/hull';
import { BONUS_PERKS, type BonusEffect, type ShipBonus } from '../ships/bonus';
import type { Ship } from '../ships/Ship';
import { PERKS, abilityCooldown, abilityUsed, reloadShare, talentsGiving, type TalentId } from '../ships/talents';
import { AMMO, rollVolley, type AmmoId, type Bite, type DamageDie, type GunId } from './arsenal';
import type { Cargo } from '../economy/cargo';
import type { QuestId } from '../economy/quests';
import type { GoldReason } from '../records/stats';
import type { StoryStepId } from '../story/story';
import type { ZoneId } from '../world/zones';
import { findUnit, isAfloat, unitKind, type Unit, type UnitKind } from './units';
import { WEAPONS, WEAPON_IDS, damageShare, type HoldReason, type WeaponId } from './weapons';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * What did the damage: a weapon's volley, a monster's bite, a boss's mortar shell (combat/barrage.ts), a rocket or a
 * powder keg (the level 25 abilities, combat/ordnance.ts), a ship's own shell (the level 50 Bombardment)
 */
export type DamageSource = WeaponId | 'bite' | 'shell' | 'rocket' | 'keg' | 'bombard';

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
  /**
   * What the attacker's talents (Broadside, Heavy shot), its captain's mastery and a bot's power in its sea multiply
   * the damage by; 1 without
   */
  readonly boost: number;
  /** The captain's mastery's part of `boost`; 1 without */
  readonly captain: number;
  /** The attacker's talents that multiplied the damage (in `boost`) */
  readonly talents: readonly TalentId[];
  /** The attacker's talents that changed its dice: more on every die that hits (in `bonus`), crits sooner */
  readonly diceTalents: readonly TalentId[];
  readonly dice: readonly DieResult[];
}

/**
 * A volley in flight: the guns of one weapon that fired together at one target, as one cannonball or harpoon from the
 * middle of them, however many there are. Its damage is rolled when it is fired and done when it lands. It always
 * flies at the target and always hits it: `to` follows the target every update, so the shot bends after a moving one.
 * Everything is computed from game state, so the server and clients agree
 */
export interface Projectile {
  /** A volley of guns, or a rocket (combat/ordnance.ts): its dice a volley of every cannon fitted */
  readonly kind: 'volley' | 'rocket';
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
  /** The volley as a whole a critical hit (`VolleyRoll.critical`) */
  readonly critical: boolean;
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
      /** A volley's projectile landed, or a rocket */
      readonly type: 'impact';
      readonly kind: Projectile['kind'];
      readonly weapon: WeaponId;
      readonly at: Point3;
      readonly dirX: number;
      readonly dirY: number;
      readonly targetId: number;
    }
  | {
      /** A ship fired a rocket (combat/ordnance.ts): from its deck, at the target */
      readonly type: 'rocket';
      readonly shooterId: number;
      readonly targetId: number;
      readonly at: Point3;
      /** Horizontal direction of the shot, a unit vector */
      readonly dirX: number;
      readonly dirY: number;
    }
  | {
      /** A ship dropped a powder keg astern (combat/ordnance.ts) */
      readonly type: 'kegDropped';
      readonly shipId: number;
      readonly at: Point3;
    }
  | {
      /** A powder keg blew up, set off by a foe: every bot within `radius` of it is hit */
      readonly type: 'kegBlast';
      readonly ownerId: number;
      readonly at: Point3;
      readonly radius: number;
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
      /** The dice that crit; `critical`: the volley as a whole a critical hit (`VolleyRoll.critical`) */
      readonly crits: number;
      readonly misses: number;
      readonly critical: boolean;
      readonly full: boolean;
      readonly at: Point3;
      /** Every die of it, for the combat log */
      readonly strike: Strike;
      /** Share of it the target's talents let through (Iron bow, Reinforced sides), and which; 1 and none without */
      readonly guard: number;
      readonly guardedBy: readonly TalentId[];
      /** Share of it the target's captain's mastery let through; 1 without */
      readonly captainGuard: number;
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
      /** Which step of the story, for one done (story/story.ts) */
      readonly story?: StoryStepId;
      readonly at: Point3;
    }
  | {
      /** A ship earned experience (ships/talents.ts): what it took, never at its last level */
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
      /** The story moved on (story/story.ts): an objective of the player's step met, or the step done */
      readonly type: 'story';
      readonly shipId: number;
      readonly step: StoryStepId;
      /** The objective met, its place in the step's; null for the step itself */
      readonly objective: number | null;
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
      kind: p.kind,
      weapon: p.weapon,
      at: { ...p.to },
      dirX: (p.to.x - p.from.x) / length,
      dirY: (p.to.y - p.from.y) / length,
      targetId: target.id,
    });
    hurt(state, target, p.strike, p, { x: target.x, y: target.y, z: target.height });
  }
}

/** Where a shot at a unit lands: its middle, half its height up */
export function aimAt(point: { x: number; y: number; z: number }, target: Unit) {
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
  // Powder monkeys, the captain's Quartermaster general: now and then a volley takes no shot out of the hold
  const free = ship.bonus.freeShot > 0 && random() < ship.bonus.freeShot;
  if (!ship.infiniteAmmo && !free) ship.addAmmo(ammo.id, -count);
  const reload = reloadShare(ship, weapon.id);
  for (const { gun, slot } of firing) reloads[slot] = gun.reload * reload;

  // The ship's talents and its captain's mastery: more on every die, crits sooner; then the signature talents' boosts,
  // from a Broadside, an ambush, a run of volleys at one target or a last stand, and what the branches and the mastery
  // multiply the damage by (bonusBoost)
  const cannon = weapon.id === 'cannon';
  const given = ship.bonus;
  const bonus = ammo.bonus + given.dieBonus;
  let dice: DamageDie[] = firing.map((f) => f.gun);
  const sooner = given.critSooner + (cannon ? given.cannonCrit : 0);
  if (sooner > 0) {
    dice = dice.map((die) => ({ ...die, critFrom: Math.max(die.missOn + 1, die.critFrom - sooner) }));
  }
  const diceTalents = talentsGiving(
    ship,
    cannon ? ['dieBonus', 'critSooner', 'cannonCrit'] : ['dieBonus', 'critSooner'],
  );
  const talents: TalentId[] = [];
  let boost = 1;
  if (ship.broadsideArmed) {
    ship.broadsideArmed = false;
    ship.abilityReadyAt[0] = state.time + abilityCooldown(ship, 0);
    // Used now it is fired: loaded and put away again, it gave nothing (nor is it counted, records/tally.ts)
    state.events.push({
      type: 'talent',
      shipId: ship.id,
      talent: 'broadside',
      amount: 0,
      at: { x: ship.x, y: ship.y, z: ship.height },
    });
    abilityUsed(state, ship);
    boost *= PERKS.broadside;
    talents.push('broadside');
  }
  if (ship.hasTalent('ambush') && !target.inCombat(state.time)) {
    boost *= PERKS.ambush;
    talents.push('ambush');
  }
  const run = ship.relentless;
  const again = run.target === target.id;
  run.volleys = again ? run.volleys + 1 : 0;
  run.cannons = (again ? run.cannons : 0) + (cannon ? 1 : 0);
  run.target = target.id;
  if (ship.hasTalent('relentless') && run.volleys > 0) {
    boost *= 1 + PERKS.relentless.boost * Math.min(run.volleys, PERKS.relentless.most);
    talents.push('relentless');
  }
  if (ship.hasTalent('lastStand') && ship.health < PERKS.lastStand.below) {
    boost *= PERKS.lastStand.boost;
    talents.push('lastStand');
  }
  if (state.time < ship.standardUntil) {
    boost *= 1 + PERKS.royalStandard.damage;
    talents.push('royalStandard');
  }
  const tree = bonusBoost(state, ship, ship.talentBonus, target, weapon.id, distance, count);
  talents.push(...talentsGiving(ship, tree.by));
  const captain = bonusBoost(state, ship, ship.captain, target, weapon.id, distance, count).boost;
  // A bot hits as hard as its sea asks
  boost *= tree.boost * captain * ship.power;
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
    captain,
    talents,
    diceTalents,
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
    kind: 'volley',
    damage: roll.damage,
    crits: roll.crits,
    misses: roll.misses,
    critical: roll.critical,
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
 * A bonus's effects as a strike reads them (`has`: an effect's share, 0 unless `when`), noting those that did something
 * (`by`), for the combat log
 */
function reading(bonus: ShipBonus) {
  const by: BonusEffect[] = [];
  const has = (effect: BonusEffect, when = true) => {
    if (!when || bonus[effect] === 0) return 0;
    by.push(effect);
    return bonus[effect];
  };
  return { has, by };
}

/**
 * What a ship's talents, or its captain's mastery, multiply a volley's damage by: more of its weapon's, of everything
 * and against monsters; at a target nearly sunk (Coup de grace); up close (Point blank); for cannons a Rolling thunder (its run of volleys at the target counted
 * already), a Marksman's far volley and a full broadside of `fired` guns; a Battle cry. With the effects that did, for
 * the combat log. 1 for a bot
 */
function bonusBoost(
  state: GameState,
  ship: Ship,
  bonus: ShipBonus,
  target: Unit,
  weapon: WeaponId,
  distance: number,
  fired: number,
) {
  const { has, by } = reading(bonus);
  const cannon = weapon === 'cannon';
  let boost = 1 + has('damage') + (cannon ? has('cannonDamage') : has('harpoonDamage'));
  boost += has('monsterDamage', target.nature === 'creature');
  boost *= 1 + has('finisher', target.health < BONUS_PERKS.finisherBelow);
  boost *= 1 + has('pointBlank', distance <= ship.range(weapon) * BONUS_PERKS.pointBlankWithin);
  if (cannon) {
    boost *= 1 + has('rollingThunder', ship.relentless.cannons % BONUS_PERKS.thunderEvery === 0);
    boost *= 1 + has('marksman', distance > ship.range('cannon') * BONUS_PERKS.marksmanBeyond);
    boost *= 1 + has('fullBroadside', fired > 1 && fired === ship.fittedGuns('cannon').length);
  }
  boost *= 1 + has('battleCry', state.time < ship.battleCryUntil);
  return { boost, by };
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
    captain: 1,
    talents: [],
    diceTalents: [],
    dice: [{ gun: null, die: weapon.die, ...roll.rolls[0] }],
  };
  hurt(state, target, strike, { ...roll, guns: 1 }, { x: target.x, y: target.y, z: target.height });
}

/**
 * Share of a blow from this source a unit's talents, or its captain's mastery, let through: less from cannons and
 * shells, from bites, from everything, and while its hull is low (Oak and iron, Last bastion). With the effects that
 * did, for the combat log. 1 for a bot
 */
function bonusGuard(unit: Unit, bonus: ShipBonus, source: DamageSource) {
  const { has, by } = reading(bonus);
  const from = has('biteGuard', source === 'bite') + has('cannonGuard', source === 'cannon' || source === 'shell');
  let share = 1 - has('guard') - from;
  share *= 1 - has('lowHullGuard', unit.health < BONUS_PERKS.lowHull);
  share *= 1 - has('lastBastion', unit.health < BONUS_PERKS.lastBastion);
  return { share: Math.max(0, share), by };
}

/** Slows a unit to a share of its top speed for some seconds: a chain shot, a barbed harpoon */
function slow(state: GameState, unit: Unit, speed: number, time: number) {
  unit.slowedUntil = state.time + time;
  unit.slowedTo = speed;
}

/**
 * Damage is done: the unit loses hit points (less with a talent or the captain's mastery that guards against it), and
 * remembers who hit it (a bot fights back). Second wind may mend it at once; a chain shot or a barbed harpoon slows it;
 * the attacker may mend a share of the damage (Spoils of battle). At 0 it is wrecked: it goes down (a bot's is then taken out of the game, bots/spawner.ts), and the captain who sank
 * it may have something of it (spoils)
 */
export function hurt(
  state: GameState,
  unit: Unit,
  strike: Strike,
  roll: {
    readonly damage: number;
    readonly guns: number;
    readonly crits: number;
    readonly misses: number;
    readonly critical: boolean;
  },
  at: Point3,
) {
  const { guns, crits, misses, critical } = roll;
  const { attackerId, attackerKind, source } = strike;
  const attacker = findUnit(state, attackerId);
  const guard = bonusGuard(unit, unit.talentBonus, source);
  // A Royal standard flying takes its share off, with the talents'
  const standard = state.time < unit.standardUntil;
  const share = guard.share * (standard ? 1 - PERKS.royalStandard.guard : 1);
  const captainShare = bonusGuard(unit, unit.captain, source).share;
  const guarded = Math.round(roll.damage * share * captainShare);
  const damage = unsinkable(state, unit, ironKeel(unit, guarded));
  const afloat = isAfloat(unit);
  unit.takeDamage(damage);
  unit.lastHitBy = attackerId;
  unit.enterCombat(state.time);
  // Whatever did it, a volley, a keg or a bombardment's shell: its owner is in the fight too, no repairs, no gate
  if (attacker && attacker !== unit) attacker.enterCombat(state.time);
  if (source === 'cannon' && damage > 0 && (attacker?.bonus.chainShot ?? 0) > 0) {
    slow(state, unit, BONUS_PERKS.chainSpeed, BONUS_PERKS.chainTime);
  }
  if (source === 'rocket' && damage > 0) slow(state, unit, PERKS.rocket.slow, PERKS.rocket.slowTime);
  const barbed = attacker?.bonus.barbedHeads ?? 0;
  if (source === 'harpoon' && damage > 0 && unit.nature === 'creature' && barbed > 0) {
    slow(state, unit, BONUS_PERKS.barbedSpeed, barbed);
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
    critical,
    full: strike.share === 1,
    at,
    strike,
    guard: share,
    guardedBy: [...talentsGiving(unit, guard.by), ...(standard ? (['royalStandard'] as const) : [])],
    captainGuard: captainShare,
  });
  if (isAfloat(unit)) secondWind(state, unit);
  if (attacker && attacker !== unit && isAfloat(attacker) && attacker.bonus.lifesteal > 0) {
    mend(state, attacker, Math.round(damage * attacker.bonus.lifesteal), 'lifesteal');
  }
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
  if (attacker && isAfloat(attacker)) spoils(state, attacker, unit);
}

/**
 * Iron keel: once a fight, a blow that would sink the ship leaves it a share of its hull instead (mending it up to that
 * share if it had less). The damage it is left to take
 */
function ironKeel(ship: Ship, damage: number) {
  const keep = ship.bonus.ironKeel;
  if (keep <= 0 || ship.ironKeelUsed || damage < ship.hp) return damage;
  ship.ironKeelUsed = true;
  const left = Math.max(1, Math.round(ship.maxHp * keep));
  if (ship.hp > left) return ship.hp - left;
  ship.heal(left - ship.hp);
  return 0;
}

/**
 * What a ship's talents and its captain's mastery give it for a kill: anything sunk mends its hull (Prize crew), a ship
 * sunk reloads its cannons (Hot barrels), a monster its harpoon guns (Feeding frenzy) and mends its hull (Apex predator)
 */
function spoils(state: GameState, ship: Ship, wreck: Unit) {
  const { bonus } = ship;
  if (bonus.prizeCrew > 0) mend(state, ship, Math.round(ship.maxHp * bonus.prizeCrew), 'prizeCrew');
  if (wreck.nature === 'object') {
    if (bonus.hotBarrels > 0) ship.reloads.cannon.fill(0);
    return;
  }
  if (bonus.feedingFrenzy > 0) ship.reloads.harpoon.fill(0);
  if (bonus.apexPredator > 0) ship.heal(Math.round(ship.maxHp * bonus.apexPredator));
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
  const heal = ship.bonus.secondWind;
  if (heal <= 0 || ship.secondWindUsed || ship.health > BONUS_PERKS.secondWindBelow) return;
  ship.secondWindUsed = true;
  mend(state, ship, Math.round(ship.maxHp * heal), 'secondWind');
}

/**
 * A talent mends the ship's hull at once (Second wind, Spoils of battle, Prize crew): a `talent` event with what it
 * mended, for the client, when one of its talents gave it (the captain's mastery has no talent to name)
 */
function mend(state: GameState, ship: Ship, amount: number, effect: BonusEffect) {
  if (amount <= 0 || ship.hp >= ship.maxHp) return;
  const before = ship.hp;
  ship.heal(amount);
  const [talent] = talentsGiving(ship, [effect]);
  if (!talent) return;
  const at = { x: ship.x, y: ship.y, z: ship.height };
  state.events.push({ type: 'talent', shipId: ship.id, talent, amount: ship.hp - before, at });
}
