import { clamp, normalizeAngle } from './math';
import { WORLD_HEIGHT, WORLD_WIDTH, type Island } from './World';

const ARRIVE_DISTANCE = 20;

// Тільки логіка руху. Як корабель виглядає, вирішує view.
export class Ship {
  x = 0;
  y = 0;
  rotation = 0;
  speed = 0;
  turnRate = 0; // поточна швидкість повороту, рад/с (для крену)
  maxSpeed = 220; // пікселів за секунду
  acceleration = 90;
  deceleration = 140;
  turnSpeed = 1.8; // радіан за секунду
  radius = 22; // для зіткнень
  target: { x: number; y: number } | null = null;

  setTarget(x: number, y: number) {
    this.target = {
      x: clamp(x, this.radius, WORLD_WIDTH - this.radius),
      y: clamp(y, this.radius, WORLD_HEIGHT - this.radius),
    };
  }

  update(dt: number, islands: readonly Island[]) {
    let desiredSpeed = 0;
    let turn = 0;

    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist < ARRIVE_DISTANCE) {
        this.target = null;
      } else {
        const angleDiff = normalizeAngle(Math.atan2(dy, dx) - this.rotation);
        const maxTurn = this.turnSpeed * dt;
        turn = clamp(angleDiff, -maxTurn, maxTurn);
        this.rotation = normalizeAngle(this.rotation + turn);

        // Сповільнюємось біля цілі та на крутих поворотах
        const arriveFactor = clamp(dist / 250, 0.15, 1);
        const turnFactor = Math.abs(angleDiff) > Math.PI / 2 ? 0.35 : 1;
        desiredSpeed = this.maxSpeed * arriveFactor * turnFactor;
      }
    }

    this.turnRate = dt > 0 ? turn / dt : 0;

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
        // Виштовхуємо корабель з острова і гасимо швидкість
        this.x = island.x + (dx / dist) * minDist;
        this.y = island.y + (dy / dist) * minDist;
        this.speed = Math.min(this.speed, this.maxSpeed * 0.25);
      }
    }

    this.x = clamp(this.x, this.radius, WORLD_WIDTH - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_HEIGHT - this.radius);
  }
}
