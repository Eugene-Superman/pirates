import { clamp } from './math';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A straight piece from a to b */
export interface Segment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

/** The point of a segment nearest to p */
export function closestOnSegment(px: number, py: number, s: Segment): Point {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? clamp(((px - s.ax) * dx + (py - s.ay) * dy) / length2, 0, 1) : 0;
  return { x: s.ax + dx * t, y: s.ay + dy * t };
}

/**
 * The closest pair of points of two segments, one on each (after Ericson, "Real-Time Collision Detection", 5.1.9).
 * Crossing segments give the crossing point twice
 */
export function closestBetweenSegments(s1: Segment, s2: Segment): { readonly p1: Point; readonly p2: Point } {
  const d1x = s1.bx - s1.ax;
  const d1y = s1.by - s1.ay;
  const d2x = s2.bx - s2.ax;
  const d2y = s2.by - s2.ay;
  const rx = s1.ax - s2.ax;
  const ry = s1.ay - s2.ay;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    // Both are points
  } else if (a <= 1e-12) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-12) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  return {
    p1: { x: s1.ax + d1x * s, y: s1.ay + d1y * s },
    p2: { x: s2.ax + d2x * t, y: s2.ay + d2y * t },
  };
}

/** Whether a point is inside a closed polygon (crossing count; the polygon may be concave) */
export function insidePolygon(px: number, py: number, polygon: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The point of a closed polygon's outline nearest to p */
export function closestOnPolygon(px: number, py: number, polygon: readonly Point[]): Point {
  let best = polygon[0];
  let bestDistance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const q = closestOnSegment(px, py, { ax: polygon[j].x, ay: polygon[j].y, bx: polygon[i].x, by: polygon[i].y });
    const d = Math.hypot(q.x - px, q.y - py);
    if (d < bestDistance) {
      bestDistance = d;
      best = q;
    }
  }
  return best;
}

/** Distance from a point to a polygon's outline: positive outside, negative inside */
export function signedDistanceToPolygon(px: number, py: number, polygon: readonly Point[]) {
  const q = closestOnPolygon(px, py, polygon);
  const d = Math.hypot(q.x - px, q.y - py);
  return insidePolygon(px, py, polygon) ? -d : d;
}
