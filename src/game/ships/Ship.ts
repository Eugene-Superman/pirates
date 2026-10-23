import { clamp, normalizeAngle } from '../lib/math';
import type { WeaponId } from '../combat/weapons';
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
  /** Hull integrity, percent of MAX_HEALTH */
  health = MAX_HEALTH;
  /** Where the player sent the ship; null when it is not going anywhere */
  target: Point | null = null;
  /** Waypoints to the target round islands, planned by the pilot; the last one is where the ship stops */
  route: Point[] = [];
  /** What the pilot remembers between updates */
  readonly pilot = newPilotMemory();
  /** The weapon the next shot uses */
  weapon: WeaponId = 'cannon';
  /** Seconds until each weapon can fire again */
  readonly reloads: Record<WeaponId, number> = { cannon: 0, harpoon: 0 };
  /** The target the player wants to shoot at; fired as soon as the selected weapon is loaded */
  fireOrder: number | null = null;

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

  get damageStage(): DamageStage {
    return damageStage(this.health);
  }

  /** A sinking ship can't be steered any more */
  get isSinking() {
    return this.health <= 0;
  }

  /** Sets hull integrity directly, in percent. For now only the debug buttons use it; later combat will */
  setHealth(health: number) {
    this.health = clamp(health, 0, MAX_HEALTH);
    if (this.isSinking) {
      this.target = null;
      this.route = [];
      this.fireOrder = null;
    }
  }

  setWeapon(weapon: WeaponId) {
    this.weapon = weapon;
  }

  /** Shoot at a target with the selected weapon. If it is out of range when the weapon is loaded, the ship holds fire */
  orderFire(targetId: number) {
    if (this.isSinking) return;
    this.fireOrder = targetId;
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
