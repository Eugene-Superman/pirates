import type { Camera3D } from '../render/Camera3D';

/** What the camera keeps up with: the ship, or something the story shows the player */
interface Spot {
  readonly x: number;
  readonly y: number;
}

const FOLLOW_SPEED = 6; // share of the remaining distance closed per second
const LOOK_SPEED = 2; // share per second: the camera turning to what the story shows, and back to the ship after
// Seconds the way back takes to speed up from LOOK_SPEED to FOLLOW_SPEED. Gliding back at LOOK_SPEED alone never
// reaches a ship under sail: it trails it by its speed over the rate, so the rate grows until it is the follow's
const RETURN_RAMP = 1;

/** How the camera keeps up with the ship: it always glides after it, the ship staying in the middle of the screen */
export class CameraControl {
  /** Seconds since the camera started back from something the story showed; null when it isn't on its way back */
  private returning: number | null = null;

  /**
   * Moves the camera's focus after the ship, or to `look` (what the story shows: the Baron through the spyglass) while
   * there is one. The camera's zoom and origin must already be set for this frame
   */
  update(camera: Camera3D, ship: Spot, dt: number, look: Spot | null = null) {
    if (look) {
      glide(camera, look, LOOK_SPEED * dt);
      this.returning = 0;
      return;
    }
    let speed = FOLLOW_SPEED;
    if (this.returning !== null) {
      this.returning += dt;
      const ramp = Math.min(1, this.returning / RETURN_RAMP);
      speed = LOOK_SPEED + (FOLLOW_SPEED - LOOK_SPEED) * ramp;
      if (ramp >= 1) this.returning = null;
    }
    glide(camera, ship, speed * dt);
  }
}

function glide(camera: Camera3D, spot: Spot, share: number) {
  const k = Math.min(1, share);
  camera.focusX += (spot.x - camera.focusX) * k;
  camera.focusY += (spot.y - camera.focusY) * k;
}
