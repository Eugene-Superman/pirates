import { isHostile } from '../bots/brain';
import type { GameState } from '../GameState';
import { hullGap } from '../physics/hull';
import type { Ship } from '../ships/Ship';
import { PERKS, type SignatureId } from '../ships/talents';
import { AMMO, GUNS, rollVolley, type GunId } from './arsenal';
import type { Shell, ShellOrdnance } from './barrage';
import { aimAt, hurt, type Strike } from './combat';
import { findUnit, isAfloat, unitKind, type Unit, type UnitKind } from './units';

const ROCKET_ARC = 0.06; // of its flight's length: how high a rocket's path bends up
const DECK = 0.8; // of a ship's height: where its rocket leaves from

/**
 * What a rocket, a powder keg or a bombardment's shell rolls (the level 25 and 50 abilities, ships/talents.ts PERKS):
 * the dice of every cannon the ship has fitted, the loaded cannon ammo's bonus on each, as a volley of all of them
 * would. So they grow with its guns
 */
export interface Charge {
  readonly guns: readonly GunId[];
  readonly bonus: number;
}

/**
 * A powder keg afloat where a ship dropped it: live at once, it blows up when a ship or monster hostile to its owner
 * is within its blast (one there already as it falls sets it off at the next update), and sinks unexploded after a
 * while. It keeps its charge: it blows up as hard once its owner is gone
 */
export interface PowderKeg {
  readonly id: number;
  readonly ownerId: number;
  readonly ownerKind: UnitKind;
  readonly charge: Charge;
  /** Its damage multiplier: the keg's volleys, times a bot's power in its sea (1 for a player's) */
  readonly boost: number;
  readonly x: number;
  readonly y: number;
  /** Game times it was dropped and it sinks unexploded */
  readonly droppedAt: number;
  readonly sinksAt: number;
}

/** The ship's charge: null without a cannon fitted, when it has no rocket, keg or shell to fire */
function chargeOf(ship: Ship): Charge | null {
  const guns = ship.fittedGuns('cannon').map(({ gun }) => gun.id);
  return guns.length > 0 ? { guns, bonus: AMMO[ship.loaded.cannon].bonus } : null;
}

/**
 * The unit a ship's rocket would fly at, or its bombardment fall round: unit `id` (the one it attacks or the player
 * picked out), if afloat, out of port, in its sight and within the ability's range, and the ship has a cannon fitted;
 * null if none
 */
export function abilityTarget(
  state: GameState,
  ship: Ship,
  ability: 'rocket' | 'bombardment',
  id: number | null,
): Unit | null {
  if (id === null || id === ship.id || !chargeOf(ship)) return null;
  const unit = findUnit(state, id);
  if (!unit || !isAfloat(unit) || unit.docked || !ship.canSee(unit.x, unit.y)) return null;
  return Math.hypot(unit.x - ship.x, unit.y - ship.y) <= PERKS[ability].range ? unit : null;
}

/**
 * A bombardment at the target (a `barrage` event, as a boss's mortar): its shells marked along the target's course,
 * each where the target will be as it lands if it sails on (where it lies if it doesn't), every other a little to
 * either side of it. They land with the boss's (barrage.ts), on the bots under them (shellBlast). False without a
 * cannon fitted to charge them
 */
export function bombard(state: GameState, ship: Ship, target: Unit) {
  const charge = chargeOf(ship);
  if (!charge) return false;
  const { bombardment } = PERKS;
  const speed = Math.hypot(target.vx, target.vy);
  const along = speed > 1 ? Math.atan2(target.vy, target.vx) : target.rotation;
  const ordnance = { ownerKind: unitKind(ship), charge, boost: bombardment.volleys * ship.power };
  for (let i = 0; i < bombardment.shells; i++) {
    const delay = bombardment.delay + i * bombardment.stagger;
    const side = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * bombardment.spread;
    state.shells.push({
      id: state.nextId++,
      ownerId: ship.id,
      x: target.x + target.vx * delay - Math.sin(along) * side,
      y: target.y + target.vy * delay + Math.cos(along) * side,
      radius: bombardment.radius,
      firedAt: state.time,
      landsAt: state.time + delay,
      ordnance,
    });
  }
  state.events.push({
    type: 'barrage',
    shipId: ship.id,
    targetId: target.id,
    at: { x: ship.x, y: ship.y, z: ship.height },
  });
  return true;
}

/**
 * A bombardment's shell lands (barrage.ts): every bot under it takes its charge, rolled for each, as from the ship that
 * fired it; a player's ships are spared
 */
export function shellBlast(
  state: GameState,
  shell: Shell & { readonly ordnance: ShellOrdnance },
  random: () => number,
) {
  const shot = { ownerId: shell.ownerId, ...shell.ordnance };
  for (const unit of state.ships) {
    if (unit.bot === null || !isAfloat(unit) || unit.docked || hullGap(shell.x, shell.y, unit) > shell.radius) continue;
    const { roll, strike } = rolled(shot, 'bombardment', random);
    hurt(state, unit, strike, roll, { x: unit.x, y: unit.y, z: unit.height });
  }
}

/** A powder keg dropped astern of the ship (a `kegDropped` event). False without a cannon fitted to charge it */
export function dropKeg(state: GameState, ship: Ship) {
  const charge = chargeOf(ship);
  if (!charge) return false;
  const { powderKeg } = PERKS;
  const back = ship.hull.stern - powderKeg.astern;
  const x = ship.x + Math.cos(ship.rotation) * back;
  const y = ship.y + Math.sin(ship.rotation) * back;
  state.kegs.push({
    id: state.nextId++,
    ownerId: ship.id,
    ownerKind: unitKind(ship),
    charge,
    boost: powderKeg.volleys * ship.power,
    x,
    y,
    droppedAt: state.time,
    sinksAt: state.time + powderKeg.life,
  });
  state.events.push({ type: 'kegDropped', shipId: ship.id, at: { x, y, z: 0 } });
  return true;
}

/**
 * Rockets asked for fly (ships/abilities.ts useAbility: the target still in range and sight, the ship afloat), and
 * powder kegs a foe has come near blow up; those afloat too long sink. Stepped from Game.update before combat, which
 * flies the rockets with the volleys; `random` is the game's dice
 */
export function stepOrdnance(state: GameState, random: () => number) {
  for (const ship of state.ships) {
    if (ship.rocketAt === null) continue;
    const target = abilityTarget(state, ship, 'rocket', ship.rocketAt);
    ship.rocketAt = null;
    if (target && !ship.isSinking) launch(state, ship, target, random);
  }
  if (state.kegs.length === 0) return;
  state.kegs = state.kegs.filter((keg) => {
    if (state.time >= keg.sinksAt) return false;
    if (!setOff(state, keg)) return true;
    blast(state, keg, random);
    return false;
  });
}

/**
 * A charge's dice rolled as one strike of a rocket, a keg or a shell (`talent`, the ability's), from who fired or
 * dropped it: for the combat log as for the damage
 */
function rolled(
  shot: Pick<PowderKeg, 'ownerId' | 'ownerKind' | 'charge' | 'boost'>,
  talent: SignatureId,
  random: () => number,
) {
  const { charge, boost } = shot;
  const dice = charge.guns.map((id) => GUNS[id]);
  const roll = rollVolley(dice, charge.bonus, boost, random);
  const strike: Strike = {
    attackerId: shot.ownerId,
    attackerKind: shot.ownerKind,
    source: talent === 'rocket' ? 'rocket' : talent === 'bombardment' ? 'bombard' : 'keg',
    ammo: null,
    bonus: charge.bonus,
    share: 1,
    boost,
    captain: 1,
    talents: [talent],
    diceTalents: [],
    dice: dice.map((gun, i) => ({ gun: gun.id, die: gun.die, ...roll.rolls[i] })),
  };
  return { roll: { ...roll, guns: dice.length }, strike };
}

/**
 * A rocket off the ship's deck at the target: its damage rolled now, as a volley's, a projectile that always lands
 * (combat.ts flies it), full whatever the target and slowing it (combat.ts hurt). A `rocket` event; both are in combat
 */
function launch(state: GameState, ship: Ship, target: Unit, random: () => number) {
  const charge = chargeOf(ship);
  if (!charge) return;
  const { rocket } = PERKS;
  const shot = { ownerId: ship.id, ownerKind: unitKind(ship), charge, boost: rocket.volley * ship.power };
  const { roll, strike } = rolled(shot, 'rocket', random);
  const from = { x: ship.x, y: ship.y, z: ship.height * DECK };
  const to = { x: 0, y: 0, z: 0 };
  aimAt(to, target);
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  state.projectiles.push({
    kind: 'rocket',
    weapon: 'cannon',
    shooterId: ship.id,
    from,
    to,
    duration: length / rocket.speed,
    arcHeight: length * ROCKET_ARC,
    targetId: target.id,
    guns: roll.guns,
    damage: roll.damage,
    crits: roll.crits,
    misses: roll.misses,
    critical: roll.critical,
    full: true,
    strike,
    age: 0,
  });
  const dirX = (to.x - from.x) / length;
  const dirY = (to.y - from.y) / length;
  state.events.push({ type: 'rocket', shooterId: ship.id, targetId: target.id, at: from, dirX, dirY });
  ship.enterCombat(state.time);
  target.enterCombat(state.time);
}

/** Whether a ship or monster hostile to the keg's owner is within its blast */
function setOff(state: GameState, keg: PowderKeg) {
  const { blast: reach } = PERKS.powderKeg;
  return state.ships.some(
    (unit) =>
      unit.bot !== null &&
      isAfloat(unit) &&
      !unit.docked &&
      isHostile(unit, keg.ownerId) &&
      hullGap(keg.x, keg.y, unit) <= reach,
  );
}

/**
 * The keg blows up (a `kegBlast` event): every bot within its blast takes its charge, rolled for each, as from its
 * owner; a player's ships are spared
 */
function blast(state: GameState, keg: PowderKeg, random: () => number) {
  const radius = PERKS.powderKeg.blast;
  state.events.push({ type: 'kegBlast', ownerId: keg.ownerId, at: { x: keg.x, y: keg.y, z: 0 }, radius });
  for (const unit of state.ships) {
    if (unit.bot === null || !isAfloat(unit) || unit.docked || hullGap(keg.x, keg.y, unit) > radius) continue;
    const { roll, strike } = rolled(keg, 'powderKeg', random);
    hurt(state, unit, strike, roll, { x: unit.x, y: unit.y, z: unit.height });
  }
}
