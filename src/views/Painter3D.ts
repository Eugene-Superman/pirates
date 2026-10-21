import type { Graphics } from 'pixi.js';
import { NEAR, type Camera3D, type CameraPoint, type Vec3 } from './Camera3D';

// Звідки світить сонце: із заходу і трохи з півдня, високо
const LIGHT = normalize([-0.6, 0.1, 0.8])!;
const UP: Vec3 = [0, 0, 1];
const AMBIENT = 0.62; // яскравість у тіні
const DIFFUSE = 0.45; // скільки додає пряме сонце
const MAX_FOG = 0.85;

// Малює 3D-примітиви у Graphics: проекція, обрізання за камерою, світло й туман
export class Painter3D {
  readonly g: Graphics;
  readonly camera: Camera3D;
  fogColor = 0xffffff;
  fogStart = Infinity;
  fogEnd = Infinity;
  screenWidth = 0;
  screenHeight = 0;

  constructor(g: Graphics, camera: Camera3D) {
    this.g = g;
    this.camera = camera;
  }

  fogAt(depth: number) {
    if (depth <= this.fogStart) return 0;
    return Math.min((depth - this.fogStart) / (this.fogEnd - this.fogStart), 1) * MAX_FOG;
  }

  depth(p: Vec3) {
    return this.camera.toCamera(p[0], p[1], p[2]).z;
  }

  averageDepth(points: readonly Vec3[]) {
    return this.depth(average(points));
  }

  /** Груба перевірка, чи варто взагалі малювати об'єкт такого розміру */
  isVisible(x: number, y: number, z: number, radius: number) {
    const c = this.camera.toCamera(x, y, z);
    if (this.camera.perspective) {
      if (c.z + radius < NEAR) return false;
      if (c.z - radius > this.fogEnd * 1.5) return false;
      if (c.z < NEAR + radius) return true; // частково за камерою, обріжеться при малюванні
    }
    const s = this.camera.toScreen(c);
    const margin = radius * s.scale + 40;
    return s.x > -margin && s.x < this.screenWidth + margin && s.y > -margin && s.y < this.screenHeight + margin;
  }

  polygon(points: readonly Vec3[], color: number, alpha = 1) {
    let cam = points.map((p) => this.camera.toCamera(p[0], p[1], p[2]));
    if (this.camera.perspective) cam = clipNear(cam);
    if (cam.length < 3) return;

    const flat: number[] = [];
    let depth = 0;
    for (const c of cam) {
      const s = this.camera.toScreen(c);
      flat.push(s.x, s.y);
      depth += c.z;
    }
    this.g.poly(flat).fill({ color: this.fogged(color, depth / cam.length), alpha });
  }

  /** Горизонтальна поверхня, що дивиться вгору (палуба, верх скелі) */
  top(points: readonly Vec3[], color: number) {
    this.polygon(points, shade(color, lightAt(UP)));
  }

  /** Тонка поверхня, видима з обох боків (вітрило, прапор) */
  surface(points: readonly Vec3[], color: number, ambient = AMBIENT, diffuse = DIFFUSE) {
    let n = polygonNormal(points);
    if (!n) return;
    if (!this.camera.isFacing(average(points), n)) n = [-n[0], -n[1], -n[2]];
    this.polygon(points, shade(color, lightAt(n, ambient, diffuse)));
  }

  /** Бічні стінки між нижнім і верхнім контуром. Малюються лише ті, що дивляться на камеру */
  sides(bottom: readonly Vec3[], top: readonly Vec3[], color: number) {
    const center = average([...bottom, ...top]);
    const faces: { points: Vec3[]; depth: number; color: number }[] = [];

    for (let i = 0; i < bottom.length; i++) {
      const j = (i + 1) % bottom.length;
      const quad = [bottom[i], bottom[j], top[j], top[i]];
      const n = outwardNormal(quad, center);
      const mid = average(quad);
      if (!n || !this.camera.isFacing(mid, n)) continue;
      faces.push({ points: quad, depth: this.depth(mid), color: shade(color, lightAt(n)) });
    }

    faces.sort((a, b) => b.depth - a.depth);
    for (const face of faces) this.polygon(face.points, face.color);
  }

  /** Чи видно поверхню, яка дивиться назовні від точки center */
  facesCamera(points: readonly Vec3[], center: Vec3) {
    const n = outwardNormal(points, center);
    return n !== null && this.camera.isFacing(average(points), n);
  }

  /** Лінія завтовшки width одиниць світу (товщає ближче до камери) */
  line(a: Vec3, b: Vec3, width: number, color: number, alpha = 1) {
    let ca = this.camera.toCamera(a[0], a[1], a[2]);
    let cb = this.camera.toCamera(b[0], b[1], b[2]);

    if (this.camera.perspective) {
      if (ca.z < NEAR && cb.z < NEAR) return;
      if (ca.z < NEAR) ca = toNear(cb, ca);
      else if (cb.z < NEAR) cb = toNear(ca, cb);
    }

    const sa = this.camera.toScreen(ca);
    const sb = this.camera.toScreen(cb);
    this.g
      .moveTo(sa.x, sa.y)
      .lineTo(sb.x, sb.y)
      .stroke({
        width: (width * (sa.scale + sb.scale)) / 2,
        color: this.fogged(color, (ca.z + cb.z) / 2),
        alpha,
        cap: 'round',
      });
  }

  curve(a: Vec3, control: Vec3, b: Vec3, width: number, color: number, alpha = 1) {
    const cam = [a, control, b].map((p) => this.camera.toCamera(p[0], p[1], p[2]));
    if (this.camera.perspective && cam.some((c) => c.z < NEAR)) return;

    const [sa, sc, sb] = cam.map((c) => this.camera.toScreen(c));
    this.g
      .moveTo(sa.x, sa.y)
      .quadraticCurveTo(sc.x, sc.y, sb.x, sb.y)
      .stroke({ width: width * sc.scale, color: this.fogged(color, cam[1].z), alpha });
  }

  /** Горизонтальне коло (на воді чи на висоті z) */
  disc(x: number, y: number, z: number, radius: number, color: number, alpha = 1) {
    const e = this.ellipseAt(x, y, z, radius);
    if (e) this.g.ellipse(e.x, e.y, e.rx, e.ry).fill({ color: this.fogged(color, e.depth), alpha });
  }

  ring(x: number, y: number, z: number, radius: number, width: number, color: number, alpha = 1) {
    const e = this.ellipseAt(x, y, z, radius);
    if (e) {
      this.g
        .ellipse(e.x, e.y, e.rx, e.ry)
        .stroke({ width: width * e.scale, color: this.fogged(color, e.depth), alpha });
    }
  }

  private ellipseAt(x: number, y: number, z: number, radius: number) {
    const c = this.camera.toCamera(x, y, z);
    if (this.camera.perspective && c.z < NEAR + radius) return null;

    const center = this.camera.toScreen(c);
    const side = this.camera.project(x + radius * this.camera.rightX, y + radius * this.camera.rightY, z);
    const front = this.camera.project(x + radius * this.camera.fwdX, y + radius * this.camera.fwdY, z);
    return {
      x: center.x,
      y: center.y,
      rx: Math.abs(side.x - center.x),
      ry: Math.max(Math.abs(front.y - center.y), 0.3),
      scale: center.scale,
      depth: c.z,
    };
  }

  private fogged(color: number, depth: number) {
    const fog = this.fogAt(depth);
    return fog > 0 ? mix(color, this.fogColor, fog) : color;
  }
}

/** Куди падає тінь точки на площину groundZ */
export function shadowPoint(p: Vec3, groundZ = 0): Vec3 {
  const h = p[2] - groundZ;
  return [p[0] - (LIGHT[0] / LIGHT[2]) * h, p[1] - (LIGHT[1] / LIGHT[2]) * h, groundZ];
}

/** Множить яскравість кольору на k */
export function shade(color: number, k: number) {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number) {
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8) & 0xff) * (1 - t) + ((b >> 8) & 0xff) * t);
  const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}

function lightAt(n: Vec3, ambient = AMBIENT, diffuse = DIFFUSE) {
  return ambient + diffuse * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
}

function normalize(v: Vec3): Vec3 | null {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len < 1e-9 ? null : [v[0] / len, v[1] / len, v[2] / len];
}

function average(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  return [x / points.length, y / points.length, z / points.length];
}

// Нормаль багатокутника методом Ньюела (працює і для трохи неплоских)
function polygonNormal(points: readonly Vec3[]): Vec3 | null {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize([nx, ny, nz]);
}

function outwardNormal(points: readonly Vec3[], center: Vec3): Vec3 | null {
  const n = polygonNormal(points);
  if (!n) return null;
  const mid = average(points);
  const dot = n[0] * (mid[0] - center[0]) + n[1] * (mid[1] - center[1]) + n[2] * (mid[2] - center[2]);
  return dot >= 0 ? n : [-n[0], -n[1], -n[2]];
}

// Обрізає багатокутник ближньою площиною камери (Сазерленд-Ходжмен)
function clipNear(points: CameraPoint[]): CameraPoint[] {
  const out: CameraPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const aInside = a.z >= NEAR;
    if (aInside) out.push(a);
    if (aInside !== b.z >= NEAR) out.push(aInside ? toNear(a, b) : toNear(b, a));
  }
  return out;
}

function toNear(inside: CameraPoint, outside: CameraPoint): CameraPoint {
  const t = (NEAR - inside.z) / (outside.z - inside.z);
  return {
    x: inside.x + (outside.x - inside.x) * t,
    y: inside.y + (outside.y - inside.y) * t,
    z: NEAR,
  };
}
