import type { SpinePoint } from '../models/serpent3d';

const STEP = 0.8; // world units a head moves between two points of its trail
const KEEP = 90; // points kept per trail: well over a serpent's length
const JUMP = 40; // world units: a head that moved farther between two updates jumped, and its trail starts anew

/** One trail, newest point first */
type Trail = SpinePoint[];

/**
 * Where each sea serpent's head has been lately, so its body can lie along the way it swam: the game only knows its
 * position and heading. Client-only, like the wakes
 */
export class Trails {
  private readonly trails = new Map<number, Trail>();

  /** Records where each of these heads is now; forgets the trails of any not listed */
  update(heads: readonly { readonly id: number; readonly x: number; readonly y: number }[]) {
    const seen = new Set<number>();
    for (const { id, x, y } of heads) {
      seen.add(id);
      let trail = this.trails.get(id);
      if (!trail) {
        trail = [];
        this.trails.set(id, trail);
      }
      const last = trail[0];
      const moved = last ? Math.hypot(x - last.x, y - last.y) : Infinity;
      if (moved > JUMP) trail.length = 0;
      if (moved < STEP && trail.length > 0) continue;
      trail.unshift({ x, y });
      if (trail.length > KEEP) trail.length = KEEP;
    }
    for (const id of this.trails.keys()) {
      if (!seen.has(id)) this.trails.delete(id);
    }
  }

  /**
   * `count` points `spacing` apart along the head's trail, from where it is now back. Where the trail runs out (a
   * serpent just come into sight) they go on straight behind it, along `heading`
   */
  spine(id: number, x: number, y: number, heading: number, count: number, spacing: number): SpinePoint[] {
    const trail = this.trails.get(id) ?? [];
    const spine: SpinePoint[] = [{ x, y }];
    // The leg being walked starts at (fromX, fromY); the next point of the spine is `need` further along the way
    let fromX = x;
    let fromY = y;
    let dirX = -Math.cos(heading);
    let dirY = -Math.sin(heading);
    let need = spacing;
    for (const point of trail) {
      const length = Math.hypot(point.x - fromX, point.y - fromY);
      if (length < 1e-6) continue;
      dirX = (point.x - fromX) / length;
      dirY = (point.y - fromY) / length;
      let along = 0;
      while (length - along >= need) {
        along += need;
        spine.push({ x: fromX + dirX * along, y: fromY + dirY * along });
        if (spine.length >= count) return spine;
        need = spacing;
      }
      need -= length - along;
      fromX = point.x;
      fromY = point.y;
    }
    // Past the end of the trail: on the way it last went
    for (let along = need; spine.length < count; along += spacing) {
      spine.push({ x: fromX + dirX * along, y: fromY + dirY * along });
    }
    return spine;
  }
}
