import type { Ship } from './Ship';

export const WAKE_LIFETIME = 1.6; // seconds
const POOL_SIZE = 120;
const SPAWN_INTERVAL = 0.04;

export interface Foam {
  x: number;
  y: number;
  life: number;
  startAlpha: number;
}

// Foam wake behind the ship (data only, views draw it).
// Particles are reused from the pool round-robin, nothing is allocated during gameplay.
export class Wake {
  readonly particles: Foam[] = Array.from({ length: POOL_SIZE }, () => ({
    x: 0,
    y: 0,
    life: WAKE_LIFETIME,
    startAlpha: 0,
  }));
  private next = 0;
  private spawnTimer = 0;

  update(dt: number, ship: Ship) {
    for (const p of this.particles) {
      if (p.life < WAKE_LIFETIME) p.life += dt;
    }

    this.spawnTimer -= dt;
    if (ship.speed > 15 && this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      const cos = Math.cos(ship.rotation);
      const sin = Math.sin(ship.rotation);
      const alpha = 0.6 * (ship.speed / ship.maxSpeed);

      // Two foam trails on both sides of the stern
      for (const side of [-8, 8]) {
        this.spawn(ship.x - cos * 32 - sin * side, ship.y - sin * 32 + cos * side, alpha);
      }
    }
  }

  private spawn(x: number, y: number, alpha: number) {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % POOL_SIZE;

    p.x = x + (Math.random() - 0.5) * 4;
    p.y = y + (Math.random() - 0.5) * 4;
    p.life = 0;
    p.startAlpha = alpha;
  }
}

/** How much of its life a particle has lived: 0 = just spawned, 1 = gone */
export function foamProgress(p: Foam) {
  return Math.min(p.life / WAKE_LIFETIME, 1);
}
