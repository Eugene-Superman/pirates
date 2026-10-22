import { clamp, normalizeAngle } from '../lib/math';
import { WORLD_HEIGHT, WORLD_WIDTH, type Island } from '../world/World';
import { MAX_HEALTH, damageStage, type DamageStage } from './damage';
import type { ShipClass } from './shipClasses';

const ARRIVE_DISTANCE = 20;

// Movement and hull state only. How the ship looks is up to the view.
export class Ship {
  readonly shipClass: ShipClass;
  x = 0;
  y = 0;
  rotation = 0;
  speed = 0;
  readonly maxSpeed: number; // world units per second
  readonly acceleration: number;
  readonly deceleration: number;
  readonly turnSpeed: number; // radians per second
  readonly radius: number; // for collisions
  /** Hull integrity, percent of MAX_HEALTH */
  health = MAX_HEALTH;
  target: { x: number; y: number } | null = null;

  constructor(shipClass: ShipClass) {
    this.shipClass = shipClass;
    this.maxSpeed = shipClass.maxSpeed;
    this.acceleration = shipClass.acceleration;
    this.deceleration = shipClass.deceleration;
    this.turnSpeed = shipClass.turnSpeed;
    this.radius = shipClass.radius;
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
    if (this.isSinking) this.target = null;
  }

  setTarget(x: number, y: number) {
    if (this.isSinking) return;
    this.target = {
      x: clamp(x, this.radius, WORLD_WIDTH - this.radius),
      y: clamp(y, this.radius, WORLD_HEIGHT - this.radius),
    };
  }

  update(dt: number, islands: readonly Island[]) {
    let desiredSpeed = 0;

    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist < ARRIVE_DISTANCE) {
        this.target = null;
      } else {
        const angleDiff = normalizeAngle(Math.atan2(dy, dx) - this.rotation);
        const maxTurn = this.turnSpeed * dt;
        this.rotation = normalizeAngle(this.rotation + clamp(angleDiff, -maxTurn, maxTurn));

        // Slow down near the target and on sharp turns
        const arriveFactor = clamp(dist / 250, 0.15, 1);
        const turnFactor = Math.abs(angleDiff) > Math.PI / 2 ? 0.35 : 1;
        desiredSpeed = this.maxSpeed * arriveFactor * turnFactor;
      }
    }

    const rate = desiredSpeed > this.speed ? this.acceleration : this.deceleration;
    this.speed += clamp(desiredSpeed - this.speed, -rate * dt, rate * dt);

    this.x += Math.cos(this.rotation) * this.speed * dt;
    this.y += Math.sin(this.rotation) * this.speed * dt;

    this.resolveCollisions(islands);
  }

  private resolveCollisions(islands: readonly Island[]) {
    for (const island of islands) {
      const dx = this.x - island.x;
      const dy = this.y - island.y;
      const dist = Math.hypot(dx, dy);
      const minDist = island.radius + this.radius;

      if (dist > 0 && dist < minDist) {
        // Push the ship out of the island and kill its speed
        this.x = island.x + (dx / dist) * minDist;
        this.y = island.y + (dy / dist) * minDist;
        this.speed = Math.min(this.speed, this.maxSpeed * 0.25);
      }
    }

    this.x = clamp(this.x, this.radius, WORLD_WIDTH - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_HEIGHT - this.radius);
  }
}
