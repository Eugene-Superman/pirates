const DEG = Math.PI / 180;

/** Ближня площина перспективи: все, що ближче до камери, обрізається */
export const NEAR = 50;

export type Vec3 = readonly [number, number, number];

export interface CameraPoint {
  x: number;
  y: number;
  z: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  scale: number;
}

export interface CameraConfig {
  /** Нахил у градусах: 90 = строго зверху, менше = більше збоку */
  pitch: number;
  /** Поворот у градусах: 0 = північ угорі екрана */
  yaw: number;
  /** false = без перспективи (паралельна проекція), true = далеке менше */
  perspective: boolean;
  /** Відстань від камери до корабля (тільки для перспективи) */
  distance?: number;
  /** Пікселів на одиницю світу біля корабля */
  zoom: number;
  /** Де по висоті екрана (0..1) стоїть корабель */
  originY: number;
}

// Світ: x на схід, y на південь (як на екрані зверху), z вгору від води.
// Простір камери: x праворуч, y вгору по екрану, z вглиб (чим більше, тим далі).
export class Camera3D {
  focusX = 0;
  focusY = 0;
  originX = 0;
  originY = 0;

  readonly perspective: boolean;
  readonly distance: number;
  readonly zoom: number;
  readonly focal: number;
  readonly sinP: number;
  readonly cosP: number;

  // Напрямки на воді: "вперед" (вгору по екрану) і "праворуч"
  fwdX = 0;
  fwdY = -1;
  rightX = 1;
  rightY = 0;
  private yawValue = 0;

  constructor(config: CameraConfig) {
    this.perspective = config.perspective;
    this.distance = config.distance ?? 1;
    this.zoom = config.zoom;
    this.focal = config.zoom * this.distance;
    this.sinP = Math.sin(config.pitch * DEG);
    this.cosP = Math.cos(config.pitch * DEG);
    this.yaw = config.yaw * DEG;
  }

  get yaw() {
    return this.yawValue;
  }

  set yaw(value: number) {
    this.yawValue = value;
    this.fwdX = Math.sin(value);
    this.fwdY = -Math.cos(value);
    this.rightX = Math.cos(value);
    this.rightY = Math.sin(value);
  }

  toCamera(x: number, y: number, z: number): CameraPoint {
    const dx = x - this.focusX;
    const dy = y - this.focusY;
    const u = dx * this.rightX + dy * this.rightY;
    const v = dx * this.fwdX + dy * this.fwdY;
    return {
      x: u,
      y: v * this.sinP + z * this.cosP,
      z: v * this.cosP - z * this.sinP + (this.perspective ? this.distance : 0),
    };
  }

  toScreen(c: CameraPoint): ScreenPoint {
    const scale = this.perspective ? this.focal / c.z : this.zoom;
    return { x: this.originX + c.x * scale, y: this.originY - c.y * scale, scale };
  }

  project(x: number, y: number, z: number): ScreenPoint {
    return this.toScreen(this.toCamera(x, y, z));
  }

  /** Зворотна проекція: точка екрана → точка на воді (z = 0) */
  screenToGround(sx: number, sy: number): { x: number; y: number } | null {
    const X = sx - this.originX;
    const Y = this.originY - sy;
    let u: number;
    let v: number;

    if (this.perspective) {
      const denom = this.focal * this.sinP - Y * this.cosP;
      if (denom <= 1e-6) return null; // вище горизонту
      v = (Y * this.distance) / denom;
      u = (X * (this.distance + v * this.cosP)) / this.focal;
    } else {
      u = X / this.zoom;
      v = Y / (this.zoom * this.sinP);
    }

    return {
      x: this.focusX + u * this.rightX + v * this.fwdX,
      y: this.focusY + u * this.rightY + v * this.fwdY,
    };
  }

  /** Чи дивиться поверхня з нормаллю n (у точці p) в бік камери */
  isFacing(p: Vec3, n: Vec3) {
    // Напрямок погляду камери
    const vx = this.fwdX * this.cosP;
    const vy = this.fwdY * this.cosP;
    const vz = -this.sinP;
    let tx = -vx;
    let ty = -vy;
    let tz = -vz;

    if (this.perspective) {
      // Камера стоїть на відстані distance від фокусу, проти напрямку погляду
      tx = this.focusX - vx * this.distance - p[0];
      ty = this.focusY - vy * this.distance - p[1];
      tz = -vz * this.distance - p[2];
    }

    return n[0] * tx + n[1] * ty + n[2] * tz > 0;
  }

  /** Y горизонту на екрані, або null якщо горизонту не видно */
  horizonY() {
    if (!this.perspective || this.cosP < 0.01) return null;
    return this.originY - (this.focal * this.sinP) / this.cosP;
  }
}
