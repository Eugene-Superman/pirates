import { AMMO, AMMO_IDS, GUNS, STARTING_AMMO, type AmmoId, type Gun, type GunId } from '../combat/arsenal';
import type { HoldReason, WeaponId } from '../combat/weapons';
import { clamp, normalizeAngle } from '../lib/math';
import type { Point } from '../lib/geometry';
import { newPilotMemory, type Helm } from '../navigation/pilot';
import { hullReach, type Body, type Hull } from '../physics/hull';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../world/World';
import { MAX_HEALTH, damageStage, damagedSpeed, type DamageStage } from './damage';
import type { ShipClass } from './shipClasses';

// Bounds for tuning the top speeds, world units per second (1 to 40 knots)
const MIN_TOP_SPEED = 10;
const MAX_TOP_SPEED = 400;
// Bounds for the view range, world units
const MIN_VIEW_RANGE = 100;
const MAX_VIEW_RANGE = 2000;

/**
 * Movement, hull and weapon state. How the ship looks is up to the view; shots are run by combat/combat.ts, the way
 * to its target by navigation/pilot.ts, bumping into things by physics/collisions.ts
 */
export class Ship implements Body {
  readonly shipClass: ShipClass;
  x = 0;
  y = 0;
  rotation = 0;
  speed = 0;
  /** Top speed of the intact ship, world units per second. Copied from the class; only setSpeeds changes it (tuning) */
  maxSpeed: number;
  /** Top speed with the hull nearly gone, world units per second. Copied from the class like maxSpeed */
  minSpeed: number;
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
  /** The weapon the ship fires: all its guns together, a volley */
  weapon: WeaponId = 'cannon';
  /** Seconds until each weapon can fire again */
  readonly reloads: Record<WeaponId, number> = { cannon: 0, harpoon: 0 };
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

  constructor(shipClass: ShipClass) {
    this.shipClass = shipClass;
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

  private setHp(hp: number) {
    this.hp = Math.round(clamp(hp, 0, this.maxHp));
    if (this.isSinking) {
      this.target = null;
      this.route = [];
      this.attackTarget = null;
    }
  }

  setWeapon(weapon: WeaponId) {
    this.weapon = weapon;
  }

  /** Fire at a target with the selected weapon, every time it is loaded, until ceaseFire or the target is gone */
  attack(targetId: number) {
    if (this.isSinking) return;
    this.attackTarget = targetId;
  }

  ceaseFire() {
    this.attackTarget = null;
    this.holdReason = null;
  }

  /** Fits a gun of its weapon into a slot, or empties the slot (null). Anything else is ignored */
  fitGun(weapon: WeaponId, slot: number, gun: GunId | null) {
    if (slot < 0 || slot >= this.guns[weapon].length) return;
    if (gun !== null && GUNS[gun].weapon !== weapon) return;
    this.guns[weapon][slot] = gun;
  }

  /** The fitted guns of a weapon with their slots, in slot order */
  fittedGuns(weapon: WeaponId) {
    const fitted: { gun: Gun; slot: number }[] = [];
    this.guns[weapon].forEach((id, slot) => {
      if (id !== null) fitted.push({ gun: GUNS[id], slot });
    });
    return fitted;
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
    if (this.isSinking) return;
    const reach = hullReach(this.hull);
    this.target = { x: clamp(x, reach, WORLD_WIDTH - reach), y: clamp(y, reach, WORLD_HEIGHT - reach) };
  }

  /** Stops going anywhere */
  clearTarget() {
    this.target = null;
    this.route = [];
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
