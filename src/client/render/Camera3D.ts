const DEG = Math.PI / 180;

export type Vec3 = readonly [number, number, number];

export interface CameraPoint {
  x: number;
  y: number;
  z: number;
}

export interface CameraConfig {
  /** Tilt in degrees: 90 = straight down, less = more from the side */
  pitch: number;
  /** Rotation in degrees: 0 = north at the top of the screen */
  yaw: number;
  /** Pixels per world unit */
  zoom: number;
  /** Where the ship sits on the screen height (0..1) */
  originY: number;
}

// Parallel projection: things don't get smaller with distance.
// World: x east, y south (as on screen from above), z up from the water.
// Camera space: x right, y up the screen, z into the screen (larger = farther).
export class Camera3D {
  focusX = 0;
  focusY = 0;
  originX = 0;
  originY = 0;

  readonly zoom: number;
  readonly sinP: number;
  readonly cosP: number;

  // Directions on the water: "forward" (up the screen) and "right"
  readonly fwdX: number;
  readonly fwdY: number;
  readonly rightX: number;
  readonly rightY: number;

  constructor(config: CameraConfig) {
    this.zoom = config.zoom;
    this.sinP = Math.sin(config.pitch * DEG);
    this.cosP = Math.cos(config.pitch * DEG);

    const yaw = config.yaw * DEG;
    this.fwdX = Math.sin(yaw);
    this.fwdY = -Math.cos(yaw);
    this.rightX = Math.cos(yaw);
    this.rightY = Math.sin(yaw);
  }

  toCamera(x: number, y: number, z: number): CameraPoint {
    const dx = x - this.focusX;
    const dy = y - this.focusY;
    const u = dx * this.rightX + dy * this.rightY;
    const v = dx * this.fwdX + dy * this.fwdY;
    return {
      x: u,
      y: v * this.sinP + z * this.cosP,
      z: v * this.cosP - z * this.sinP,
    };
  }

  project(x: number, y: number, z: number) {
    const c = this.toCamera(x, y, z);
    return { x: this.originX + c.x * this.zoom, y: this.originY - c.y * this.zoom };
  }

  /** Inverse projection: screen point → point on the water (z = 0) */
  screenToGround(sx: number, sy: number) {
    const u = (sx - this.originX) / this.zoom;
    const v = (this.originY - sy) / (this.zoom * this.sinP);
    return {
      x: this.focusX + u * this.rightX + v * this.fwdX,
      y: this.focusY + u * this.rightY + v * this.fwdY,
    };
  }

  /** Whether a surface with normal n faces the camera */
  isFacing(n: Vec3) {
    // Direction towards the camera, opposite to its view direction
    const tx = -this.fwdX * this.cosP;
    const ty = -this.fwdY * this.cosP;
    const tz = this.sinP;
    return n[0] * tx + n[1] * ty + n[2] * tz > 0;
  }
}
