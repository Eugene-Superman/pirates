import { AMMO, AMMO_IDS, GUNS, STARTING_AMMO, type AmmoId, type Gun, type GunId } from '../combat/arsenal';
import { WEAPON_IDS, type HoldReason, type TargetNature, type WeaponId } from '../combat/weapons';
import type { BotMind } from '../bots/brain';
import { clamp, normalizeAngle } from '../lib/math';
import type { Point } from '../lib/geometry';
import { newPilotMemory, type Helm } from '../navigation/pilot';
import { hullReach, type Body, type Hull } from '../physics/hull';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../world/World';
import { MAX_HEALTH, damageStage, damagedSpeed, type DamageStage } from './damage';
import { COMBAT_TIME } from './repair';
import type { ShipClass } from './shipClasses';

// Bounds for tuning the top speeds, world units per second (1 to 40 knots)
const MIN_TOP_SPEED = 10;
const MAX_TOP_SPEED = 400;
// Bounds for the view range, world units
const MIN_VIEW_RANGE = 100;
const MAX_VIEW_RANGE = 2000;

/**
 * Anything that sails under a pilot: the player's ship, the bots' ships, and sea monsters (a class of nature
 * `creature`, with jaws instead of guns). Movement, hull, weapons and repairs. How it looks is up to the view; shots are
 * run by combat/combat.ts, the way to its target by navigation/pilot.ts, bumping into things by physics/collisions.ts,
 * a bot's decisions by bots/brain.ts
 */
export class Ship implements Body {
  /** Unique among the ships of the game: what attacks and events refer to */
  readonly id: number;
  readonly shipClass: ShipClass;
  readonly nature: TargetNature;
  /** How far it sticks out of the water, world units */
  readonly height: number;
  x = 0;
  y = 0;
  rotation = 0;
  speed = 0;
  /** Top speed of the intact ship, world units per second. Copied from the class; only setSpeeds changes it (tuning) */
  maxSpeed: number;
  /** Top speed with the hull nearly gone, world units per second. Copied from the class like maxSpeed */
  minSpeed: number;
  /** Share of its top speed the pilot sails at: bots cruise slower while nobody bothers them */
  throttle = 1;
  /** Chasing (or fleeing) something that moves: the pilot doesn't slow down on the way into its target */
  pursuing = false;
  /** How far the crew sees, world units; beyond it is the fog of war. Copied from the class, changed by setViewRange */
  viewRange: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly turnSpeed: number; // radians per second
  /** Rough size for effects and the view; collisions use the hull */
  readonly radius: number;
  readonly hull: Hull;
  /** Hull points of the ship when new; `hp` is what is left. Damage takes hull points away */
  readonly maxHp: number;
  hp: number;
  /** Where the player sent the ship; null when it is not going anywhere */
  target: Point | null = null;
  /** Waypoints to the target round islands, planned by the pilot; the last one is where the ship stops */
  route: Point[] = [];
  /** What the pilot remembers between updates */
  readonly pilot = newPilotMemory();
  /** The weapon the ship fires: every gun of it that is loaded and in range, together, a volley */
  weapon: WeaponId = 'cannon';
  /** Seconds until the gun in each slot can fire again, by weapon */
  readonly reloads: Record<WeaponId, number[]>;
  /** Seconds until a monster can bite again */
  biteReload = 0;
  /** The gun in each of the class's slots, by weapon; null for an empty slot */
  readonly guns: Record<WeaponId, (GunId | null)[]>;
  /** Cannonballs and harpoons in the hold */
  readonly ammo: Record<AmmoId, number> = { ...STARTING_AMMO };
  /** The ammo each weapon fires */
  readonly loaded: Record<WeaponId, AmmoId> = { cannon: AMMO_IDS.cannon[0], harpoon: AMMO_IDS.harpoon[0] };
  /** The target the ship fires at, volley after volley, until told to stop or the target is gone; null for none */
  attackTarget: number | null = null;
  /** Why it isn't firing at its target right now (set by combat every update); null when it is, or has no target */
  holdReason: HoldReason | null = null;
  /** Who hit it last and hasn't been dealt with yet: combat sets it, a bot's brain takes it to fight back */
  lastHitBy: number | null = null;
  /** Game time until which it is in combat: it fired, or was fired at, less than COMBAT_TIME ago. No repairs till then */
  combatUntil = 0;
  /** Whether the crew is repairing the hull (ships/repair.ts) */
  repairing = false;
  /** Seconds since the last repair step */
  repairClock = 0;
  /** Game time it was wrecked; null while afloat. A player's ship comes back some time after (Game) */
  wreckedAt: number | null = null;
  /** In port (world/port.ts): stopped by the pier, out of the fight, its player in the port's menus */
  docked = false;
  /** False from leaving port till it has sailed out of the harbour: it doesn't dock again at once */
  mayDock = true;
  /** How a bot thinks; null for a player's ship */
  bot: BotMind | null = null;

  constructor(shipClass: ShipClass, id: number) {
    this.id = id;
    this.shipClass = shipClass;
    this.nature = shipClass.nature;
    this.height = shipClass.height;
    this.maxSpeed = shipClass.maxSpeed;
    this.acceleration = shipClass.acceleration;
    this.deceleration = shipClass.deceleration;
    this.turnSpeed = shipClass.turnSpeed;
    this.radius = shipClass.radius;
    this.hull = shipClass.hull;
    this.minSpeed = shipClass.minSpeed;
    this.viewRange = shipClass.viewRange;
    this.maxHp = shipClass.hp;
    this.hp = shipClass.hp;
    this.guns = { cannon: [...shipClass.startingGuns.cannon], harpoon: [...shipClass.startingGuns.harpoon] };
    this.reloads = { cannon: this.guns.cannon.map(() => 0), harpoon: this.guns.harpoon.map(() => 0) };
    // A ship with guns of one weapon only (a bot's) fires those
    if (this.guns.cannon.every((gun) => gun === null) && this.guns.harpoon.some((gun) => gun !== null)) {
      this.weapon = 'harpoon';
    }
  }

  get heading() {
    return this.rotation;
  }

  get vx() {
    return Math.cos(this.rotation) * this.speed;
  }

  get vy() {
    return Math.sin(this.rotation) * this.speed;
  }

  /** Bots never run out of ammo: their holds aren't counted */
  get infiniteAmmo() {
    return this.bot !== null;
  }

  /** Whether a point is close enough to be seen, not hidden in the fog of war */
  canSee(x: number, y: number) {
    return Math.hypot(x - this.x, y - this.y) <= this.viewRange;
  }

  /** For tuning with the debug buttons now, and for upgrades later */
  setViewRange(range: number) {
    this.viewRange = clamp(range, MIN_VIEW_RANGE, MAX_VIEW_RANGE);
  }

  /** The fastest the ship can go now: between maxSpeed and minSpeed, by how much hull is left */
  get topSpeed() {
    return damagedSpeed(this.health, this.maxSpeed, this.minSpeed);
  }

  /** Changes the top speeds, world units per second; min is kept between 0 and max. For tuning with the debug buttons */
  setSpeeds(max: number, min: number) {
    this.maxSpeed = clamp(max, MIN_TOP_SPEED, MAX_TOP_SPEED);
    this.minSpeed = clamp(min, 0, this.maxSpeed);
  }

  /** Hull integrity in percent of MAX_HEALTH: what the damage stages and the speed go by */
  get health() {
    return (this.hp / this.maxHp) * MAX_HEALTH;
  }

  get damageStage(): DamageStage {
    return damageStage(this.health);
  }

  /** A sinking ship can't be steered any more */
  get isSinking() {
    return this.hp <= 0;
  }

  /** Sets hull integrity directly, in percent. For the debug buttons */
  setHealth(health: number) {
    this.setHp((clamp(health, 0, MAX_HEALTH) / MAX_HEALTH) * this.maxHp);
  }

  /** Takes hull points away: what a hit does */
  takeDamage(amount: number) {
    this.setHp(this.hp - amount);
  }

  /** Gives hull points back: what a repair step does */
  heal(amount: number) {
    this.setHp(this.hp + amount);
  }

  private setHp(hp: number) {
    this.hp = Math.round(clamp(hp, 0, this.maxHp));
    // Afloat again (the debug buttons): no longer a wreck waiting to come back
    if (!this.isSinking) this.wreckedAt = null;
    if (this.isSinking) {
      this.target = null;
      this.route = [];
      this.attackTarget = null;
      this.repairing = false;
    }
  }

  /** Whether it fired or was fired at less than COMBAT_TIME ago */
  inCombat(time: number) {
    return time < this.combatUntil;
  }

  /** It fired, or was fired at: in combat for COMBAT_TIME from now, and any repair stops */
  enterCombat(time: number) {
    this.combatUntil = Math.max(this.combatUntil, time + COMBAT_TIME);
    this.repairing = false;
  }

  /** Starts repairing the hull. Only out of combat (checked by ships/repair.ts every update) and with damage to mend */
  startRepair() {
    if (this.isSinking || this.hp >= this.maxHp || this.repairing) return;
    this.repairing = true;
    this.repairClock = 0;
  }

  stopRepair() {
    this.repairing = false;
  }

  setWeapon(weapon: WeaponId) {
    this.weapon = weapon;
  }

  /** Fire at a target with the selected weapon, every time a gun is loaded, until ceaseFire or the target is gone */
  attack(targetId: number) {
    if (this.isSinking || this.docked || targetId === this.id) return;
    this.attackTarget = targetId;
  }

  ceaseFire() {
    this.attackTarget = null;
    this.holdReason = null;
  }

  /**
   * Fits a gun of its weapon into a slot, or empties the slot (null). Anything else is ignored. A new gun starts
   * unloaded, so swapping guns mid-fight doesn't skip a reload
   */
  fitGun(weapon: WeaponId, slot: number, gun: GunId | null) {
    if (slot < 0 || slot >= this.guns[weapon].length) return;
    if (gun !== null && GUNS[gun].weapon !== weapon) return;
    this.guns[weapon][slot] = gun;
    this.reloads[weapon][slot] = gun === null ? 0 : GUNS[gun].reload;
  }

  /** The fitted guns of a weapon with their slots, in slot order */
  fittedGuns(weapon: WeaponId) {
    const fitted: { gun: Gun; slot: number }[] = [];
    this.guns[weapon].forEach((id, slot) => {
      if (id !== null) fitted.push({ gun: GUNS[id], slot });
    });
    return fitted;
  }

  /** How far the farthest-reaching fitted gun of a weapon reaches, world units; 0 with none fitted */
  range(weapon: WeaponId = this.weapon) {
    return this.fittedGuns(weapon).reduce((longest, { gun }) => Math.max(longest, gun.range), 0);
  }

  /** Picks the ammo its weapon fires from now on */
  loadAmmo(ammo: AmmoId) {
    this.loaded[AMMO[ammo].weapon] = ammo;
  }

  /** Puts ammo in the hold (or takes it out, for a negative count). For testing now; bought later */
  addAmmo(ammo: AmmoId, count: number) {
    this.ammo[ammo] = Math.max(0, this.ammo[ammo] + count);
  }

  /** Sends the ship somewhere; the pilot finds the way round islands and other ships */
  setTarget(x: number, y: number) {
    if (this.isSinking || this.docked) return;
    const reach = hullReach(this.hull);
    this.target = { x: clamp(x, reach, WORLD_WIDTH - reach), y: clamp(y, reach, WORLD_HEIGHT - reach) };
  }

  /** Stops going anywhere */
  clearTarget() {
    this.target = null;
    this.route = [];
  }

  /** Comes into port (world/port.ts decides when): it stops firing and sails on to its berth, where it lies */
  dock(berth: Point) {
    this.ceaseFire();
    // Before it is docked: a docked ship takes no orders
    this.setTarget(berth.x, berth.y);
    this.docked = true;
  }

  /** Leaves port; it may not dock again till it has sailed out of the harbour */
  undock() {
    this.docked = false;
    this.mayDock = false;
  }

  /** Back afloat, whole, at (x, y): a wrecked player's ship comes back. Guns and ammo are kept */
  respawn(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.rotation = 0;
    this.speed = 0;
    this.hp = this.maxHp;
    this.clearTarget();
    this.ceaseFire();
    for (const weapon of WEAPON_IDS) this.reloads[weapon].fill(0);
    this.combatUntil = 0;
    this.repairing = false;
    this.lastHitBy = null;
    this.wreckedAt = null;
    this.docked = false;
    this.mayDock = true;
  }

  /** Turns towards the helm's heading no faster than turnSpeed, speeds up or slows down towards its speed, and moves */
  steer(dt: number, helm: Helm) {
    const angleDiff = normalizeAngle(helm.heading - this.rotation);
    const maxTurn = this.turnSpeed * dt;
    this.rotation = normalizeAngle(this.rotation + clamp(angleDiff, -maxTurn, maxTurn));

    const rate = helm.speed > this.speed ? this.acceleration : this.deceleration;
    this.speed += clamp(helm.speed - this.speed, -rate * dt, rate * dt);

    this.x += Math.cos(this.rotation) * this.speed * dt;
    this.y += Math.sin(this.rotation) * this.speed * dt;
  }
}
