import type { Ship } from '../../game';
import type { Camera3D } from '../render/Camera3D';

/**
 * How the camera keeps up with the ship:
 * - follow: always glides after it, the ship stays in the middle of the screen;
 * - deadZone: stands still while the ship is inside a box around the middle, and is pushed along only past its edge;
 * - recenter: stands still until the ship gets near the screen's edge, then glides back onto it once and stops again.
 * A still camera makes clicking on targets easier: they don't slide under the mouse while the ship sails
 */
export type CameraMode = 'follow' | 'deadZone' | 'recenter';
export const CAMERA_MODES: readonly CameraMode[] = ['follow', 'deadZone', 'recenter'];

const FOLLOW_SPEED = 6; // share of the remaining distance closed per second
const DEAD_ZONE = 0.4; // share of the screen's width and height around the middle where the ship moves freely
const DEAD_ZONE_SPEED = 10; // how quickly the camera catches up once the ship is past the box, share per second
const RECENTER_ZONE = 0.7; // share of the screen around the middle; leaving it starts a recentering
const RECENTER_SPEED = 2.5; // share per second
const RECENTER_DONE = 3; // world units: close enough to the ship to stop gliding

export class CameraControl {
  private current: CameraMode = 'deadZone';
  private recentering = false;

  get mode() {
    return this.current;
  }

  set mode(mode: CameraMode) {
    this.current = mode;
    this.recentering = false;
  }

  /** The box around the middle of the screen the ship moves in without moving the camera, as a share of the screen */
  get zone() {
    if (this.current === 'deadZone') return DEAD_ZONE;
    if (this.current === 'recenter') return RECENTER_ZONE;
    return null;
  }

  /** Moves the camera's focus after the ship. The camera's zoom and origin must already be set for this frame */
  update(camera: Camera3D, ship: Ship, dt: number, width: number, height: number) {
    if (this.current === 'follow') {
      glide(camera, ship, FOLLOW_SPEED * dt);
    } else if (this.current === 'deadZone') {
      const push = overshoot(camera, ship, DEAD_ZONE, width, height);
      const k = Math.min(1, DEAD_ZONE_SPEED * dt);
      camera.focusX += push.x * k;
      camera.focusY += push.y * k;
    } else {
      if (!this.recentering) {
        const push = overshoot(camera, ship, RECENTER_ZONE, width, height);
        this.recentering = push.x !== 0 || push.y !== 0;
      }
      if (this.recentering) {
        glide(camera, ship, RECENTER_SPEED * dt);
        if (Math.hypot(ship.x - camera.focusX, ship.y - camera.focusY) < RECENTER_DONE) this.recentering = false;
      }
    }
  }
}

function glide(camera: Camera3D, ship: Ship, share: number) {
  const k = Math.min(1, share);
  camera.focusX += (ship.x - camera.focusX) * k;
  camera.focusY += (ship.y - camera.focusY) * k;
}

/** The move of the camera's focus, in world units, that brings the ship back to the edge of the box; zero inside it */
function overshoot(camera: Camera3D, ship: Ship, zone: number, width: number, height: number) {
  const s = camera.project(ship.x, ship.y, 0);
  const sx = s.x - camera.originX;
  const sy = s.y - camera.originY;
  const halfW = (width * zone) / 2;
  const halfH = (height * zone) / 2;
  const ex = sx - Math.min(Math.max(sx, -halfW), halfW);
  const ey = sy - Math.min(Math.max(sy, -halfH), halfH);
  // Screen pixels back to the water: across the screen is the camera's right, up the screen is forward, foreshortened
  const u = ex / camera.zoom;
  const v = -ey / (camera.zoom * camera.sinP);
  return { x: u * camera.rightX + v * camera.fwdX, y: u * camera.rightY + v * camera.fwdY };
}
