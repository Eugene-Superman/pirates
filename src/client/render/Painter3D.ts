import type { Graphics } from 'pixi.js';
import type { Camera3D, Vec3 } from './Camera3D';

// Where the sun shines from: the west and slightly south, high up
const LIGHT = normalize([-0.6, 0.1, 0.8])!;
const UP: Vec3 = [0, 0, 1];
const AMBIENT = 0.62; // brightness in shadow
const DIFFUSE = 0.45; // how much direct sunlight adds

// Draws 3D primitives into Graphics: projection and lighting
export class Painter3D {
  readonly g: Graphics;
  readonly camera: Camera3D;
  screenWidth = 0;
  screenHeight = 0;

  constructor(g: Graphics, camera: Camera3D) {
    this.g = g;
    this.camera = camera;
  }

  depth(p: Vec3) {
    return this.camera.toCamera(p[0], p[1], p[2]).z;
  }

  averageDepth(points: readonly Vec3[]) {
    return this.depth(average(points));
  }

  /** Rough check whether an object of this size is worth drawing at all */
  isVisible(x: number, y: number, z: number, radius: number) {
    const s = this.camera.project(x, y, z);
    const margin = radius * this.camera.zoom + 40;
    return s.x > -margin && s.x < this.screenWidth + margin && s.y > -margin && s.y < this.screenHeight + margin;
  }

  polygon(points: readonly Vec3[], color: number, alpha = 1) {
    const flat: number[] = [];
    for (const p of points) {
      const s = this.camera.project(p[0], p[1], p[2]);
      flat.push(s.x, s.y);
    }
    this.g.poly(flat).fill({ color, alpha });
  }

  /** Horizontal upward-facing surface (deck, top of a cliff) */
  top(points: readonly Vec3[], color: number) {
    this.polygon(points, shade(color, lightAt(UP)));
  }

  /** Thin surface visible from both sides (sail, flag) */
  surface(points: readonly Vec3[], color: number, ambient = AMBIENT, diffuse = DIFFUSE) {
    let n = polygonNormal(points);
    if (!n) return;
    if (!this.camera.isFacing(n)) n = [-n[0], -n[1], -n[2]];
    this.polygon(points, shade(color, lightAt(n, ambient, diffuse)));
  }

  /** Side walls between the bottom and top outlines. Only the ones facing the camera are drawn */
  sides(bottom: readonly Vec3[], top: readonly Vec3[], color: number) {
    const center = average([...bottom, ...top]);
    const faces: { points: Vec3[]; depth: number; color: number }[] = [];

    for (let i = 0; i < bottom.length; i++) {
      const j = (i + 1) % bottom.length;
      const quad = [bottom[i], bottom[j], top[j], top[i]];
      const n = outwardNormal(quad, center);
      if (!n || !this.camera.isFacing(n)) continue;
      faces.push({ points: quad, depth: this.depth(average(quad)), color: shade(color, lightAt(n)) });
    }

    faces.sort((a, b) => b.depth - a.depth);
    for (const face of faces) this.polygon(face.points, face.color);
  }

  /** Whether a surface facing outward from center is visible */
  facesCamera(points: readonly Vec3[], center: Vec3) {
    const n = outwardNormal(points, center);
    return n !== null && this.camera.isFacing(n);
  }

  /** Line that is width world units thick */
  line(a: Vec3, b: Vec3, width: number, color: number, alpha = 1) {
    const sa = this.camera.project(a[0], a[1], a[2]);
    const sb = this.camera.project(b[0], b[1], b[2]);
    this.g
      .moveTo(sa.x, sa.y)
      .lineTo(sb.x, sb.y)
      .stroke({ width: width * this.camera.zoom, color, alpha, cap: 'round' });
  }

  curve(a: Vec3, control: Vec3, b: Vec3, width: number, color: number, alpha = 1) {
    const [sa, sc, sb] = [a, control, b].map((p) => this.camera.project(p[0], p[1], p[2]));
    this.g
      .moveTo(sa.x, sa.y)
      .quadraticCurveTo(sc.x, sc.y, sb.x, sb.y)
      .stroke({ width: width * this.camera.zoom, color, alpha });
  }

  /** Horizontal circle (on the water or at height z) */
  disc(x: number, y: number, z: number, radius: number, color: number, alpha = 1) {
    const e = this.ellipseAt(x, y, z, radius);
    this.g.ellipse(e.x, e.y, e.rx, e.ry).fill({ color, alpha });
  }

  /** A round blob that looks the same from any side (a puff of smoke, a tongue of flame): a circle around the projected point */
  ball(p: Vec3, radius: number, color: number, alpha = 1) {
    const s = this.camera.project(p[0], p[1], p[2]);
    this.g.circle(s.x, s.y, radius * this.camera.zoom).fill({ color, alpha });
  }

  ring(x: number, y: number, z: number, radius: number, width: number, color: number, alpha = 1) {
    const e = this.ellipseAt(x, y, z, radius);
    this.g.ellipse(e.x, e.y, e.rx, e.ry).stroke({ width: width * this.camera.zoom, color, alpha });
  }

  private ellipseAt(x: number, y: number, z: number, radius: number) {
    const center = this.camera.project(x, y, z);
    const side = this.camera.project(x + radius * this.camera.rightX, y + radius * this.camera.rightY, z);
    const front = this.camera.project(x + radius * this.camera.fwdX, y + radius * this.camera.fwdY, z);
    return {
      x: center.x,
      y: center.y,
      rx: Math.abs(side.x - center.x),
      ry: Math.max(Math.abs(front.y - center.y), 0.3),
    };
  }
}

/** Where a point's shadow falls on the groundZ plane */
export function shadowPoint(p: Vec3, groundZ = 0): Vec3 {
  const h = p[2] - groundZ;
  return [p[0] - (LIGHT[0] / LIGHT[2]) * h, p[1] - (LIGHT[1] / LIGHT[2]) * h, groundZ];
}

/** Multiplies a color's brightness by k */
export function shade(color: number, k: number) {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
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

// Polygon normal via Newell's method (works for slightly non-planar ones too)
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
