import type { Ship } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

const WAKE_LIFETIME = 1.6; // seconds
const POOL_SIZE = 120;
const SPAWN_INTERVAL = 0.04;
// Where the foam starts and how big it is, in ship radii, so the wake fits ships of every size
const STERN_OFFSET = 1.45;
const SIDE_OFFSET = 0.36;
const FOAM_RADIUS = 0.18;
const FOAM_JITTER = 0.18;

interface Foam {
  x: number;
  y: number;
  life: number;
  startAlpha: number;
  /** Starting radius, world units */
  size: number;
}

// Foam wake behind the ship. Pure decoration, so it lives on the client and may use Math.random.
// Particles are reused from the pool round-robin, nothing is allocated during gameplay.
export class Wake {
  readonly particles: Foam[] = Array.from({ length: POOL_SIZE }, () => ({
    x: 0,
    y: 0,
    life: WAKE_LIFETIME,
    startAlpha: 0,
    size: 0,
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
      const stern = ship.radius * STERN_OFFSET;
      for (const side of [-1, 1]) {
        const offset = side * ship.radius * SIDE_OFFSET;
        this.spawn(ship.x - cos * stern - sin * offset, ship.y - sin * stern + cos * offset, alpha, ship.radius);
      }
    }
  }

  private spawn(x: number, y: number, alpha: number, shipRadius: number) {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % POOL_SIZE;

    const jitter = shipRadius * FOAM_JITTER;
    p.x = x + (Math.random() - 0.5) * jitter;
    p.y = y + (Math.random() - 0.5) * jitter;
    p.life = 0;
    p.startAlpha = alpha;
    p.size = shipRadius * FOAM_RADIUS;
  }
}

/** How much of its life a particle has lived: 0 = just spawned, 1 = gone */
function foamProgress(p: Foam) {
  return Math.min(p.life / WAKE_LIFETIME, 1);
}

export function drawWake(p: Painter3D, wake: Wake) {
  for (const foam of wake.particles) {
    const t = foamProgress(foam);
    if (t < 1) p.disc(foam.x, foam.y, 0, foam.size * (1 + t * 2.5), 0xffffff, foam.startAlpha * (1 - t));
  }
}
