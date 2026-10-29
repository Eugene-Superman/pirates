import { projectilePosition, type Point3, type Projectile } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = {
  ball: 0x262321,
  ballShine: 0x8d8a86,
  shaft: 0x7a5a32,
  head: 0x3b3a3d,
  shadow: 0x000000,
  rocket: 0x5a2a1c,
  rocketHead: 0x2b2b2e,
  stick: 0x8a6a3e,
  flame: 0xffb03a,
  flameCore: 0xfff0b0,
};
// A real 10 cm cannonball would be a dot; these are drawn bigger so the shot can be followed
const BALL_RADIUS = 1.6; // world units
const HARPOON_LENGTH = 8;
const HARPOON_HEAD = 2.2;
const SHADOW_ALPHA = 0.22;
// World units: a Congreve rocket's iron case, its cone, the long guide stick trailing it, and the fire out of its tail
const ROCKET = { case: 5, cone: 1.6, stick: 9, width: 1.4, flame: 2.2 } as const;

/** Shadow straight below the projectile: shows how high it flies. Drawn with the sea */
export function drawProjectileShadow(p: Painter3D, projectile: Projectile) {
  const at = projectilePosition(projectile);
  const radius = projectile.weapon === 'cannon' ? BALL_RADIUS : HARPOON_LENGTH / 4;
  p.disc(at.x, at.y, 0, radius, COLORS.shadow, SHADOW_ALPHA);
}

export function drawProjectile(p: Painter3D, projectile: Projectile) {
  const at = projectilePosition(projectile);
  if (projectile.kind === 'rocket') {
    drawRocket(p, projectile, at);
    return;
  }
  if (projectile.weapon === 'cannon') {
    p.ball([at.x, at.y, at.z], BALL_RADIUS, COLORS.ball);
    p.ball([at.x - 0.4, at.y - 0.4, at.z + 0.4], BALL_RADIUS * 0.35, COLORS.ballShine, 0.8);
    return;
  }

  // The harpoon points along its flight: where it will be a moment later
  const ahead = projectilePosition(projectile, projectile.age + 0.02);
  const dx = ahead.x - at.x;
  const dy = ahead.y - at.y;
  const dz = ahead.z - at.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const dir: Vec3 = [dx / len, dy / len, dz / len];
  const tail: Vec3 = [at.x - dir[0] * HARPOON_LENGTH, at.y - dir[1] * HARPOON_LENGTH, at.z - dir[2] * HARPOON_LENGTH];
  const tip: Vec3 = [at.x, at.y, at.z];
  drawHarpoon(p, tail, tip, dir);
}

/**
 * A Congreve rocket along its flight: an iron case with a cone, the guide stick trailing it, and fire flickering out of
 * its tail (its smoke is ShotEffects')
 */
function drawRocket(p: Painter3D, projectile: Projectile, at: Point3) {
  const ahead = projectilePosition(projectile, projectile.age + 0.02);
  const dx = ahead.x - at.x;
  const dy = ahead.y - at.y;
  const dz = ahead.z - at.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const dir: Vec3 = [dx / len, dy / len, dz / len];
  const back = (k: number): Vec3 => [at.x - dir[0] * k, at.y - dir[1] * k, at.z - dir[2] * k];
  const tip: Vec3 = [at.x, at.y, at.z];
  const tail = back(ROCKET.case);
  p.line(tail, back(ROCKET.case + ROCKET.stick), 0.5, COLORS.stick);
  p.line(tail, back(ROCKET.cone), ROCKET.width, COLORS.rocket);
  p.line(back(ROCKET.cone), tip, ROCKET.width * 0.6, COLORS.rocketHead);
  const flicker = 0.75 + 0.25 * Math.sin(projectile.age * 60);
  p.ball(back(ROCKET.case + 0.8), ROCKET.flame * flicker, COLORS.flame, 0.75);
  p.ball(back(ROCKET.case + 0.4), ROCKET.flame * 0.45, COLORS.flameCore, 0.95);
}

/** A harpoon from tail to tip, dir: its unit direction */
function drawHarpoon(p: Painter3D, tail: Vec3, tip: Vec3, dir: Vec3) {
  const neck: Vec3 = [tip[0] - dir[0] * HARPOON_HEAD, tip[1] - dir[1] * HARPOON_HEAD, tip[2] - dir[2] * HARPOON_HEAD];
  p.line(tail, neck, 0.9, COLORS.shaft);
  p.line(neck, tip, 1.2, COLORS.head);
  // Barbs: short strokes back from the neck, sideways in the horizontal plane
  const side: Vec3 = [-dir[1] * 0.9, dir[0] * 0.9, 0];
  const back: Vec3 = [neck[0] - dir[0] * 0.9, neck[1] - dir[1] * 0.9, neck[2] - dir[2] * 0.9];
  p.line(neck, [back[0] + side[0], back[1] + side[1], back[2]], 0.5, COLORS.head);
  p.line(neck, [back[0] - side[0], back[1] - side[1], back[2]], 0.5, COLORS.head);
}
