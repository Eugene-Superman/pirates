import { clamp } from '../lib/math';
import { signedDistanceToPolygon, type Point } from '../lib/geometry';
import { WORLD_HEIGHT, WORLD_WIDTH, type WorldData } from '../world/World';

const CELL = 16; // world units per grid cell
// Clearance is only measured this far from land, world units: farther out every ship has room enough
const CLEARANCE_CAP = 120;
const MAX_EXPANSIONS = 60_000; // of the path search: past that it gives up and the ship heads straight on
const LINE_STEP = CELL / 2; // world units between the samples of a line-of-sight check
const SQRT2 = Math.SQRT2;
const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
] as const;

/**
 * The open water as a grid, for finding routes around islands. Every cell knows its clearance: how far its centre is
 * from the nearest coast or the world's edge (negative on land). One grid serves ships of every size: a ship may
 * pass where the clearance is at least its half beam plus a margin. Built once from the world, the same on every
 * client and the server
 */
export class NavGrid {
  readonly cols = Math.ceil(WORLD_WIDTH / CELL);
  readonly rows = Math.ceil(WORLD_HEIGHT / CELL);
  private readonly clearance: Float32Array;
  // Search buffers, reused: a cell's data counts only when its stamp is the current search's
  private readonly stamp: Uint32Array;
  private readonly cost: Float64Array;
  private readonly from: Int32Array;
  private readonly closed: Uint8Array;
  private search = 0;

  constructor(world: WorldData) {
    const count = this.cols * this.rows;
    this.clearance = new Float32Array(count);
    this.stamp = new Uint32Array(count);
    this.cost = new Float64Array(count);
    this.from = new Int32Array(count);
    this.closed = new Uint8Array(count);

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x = (col + 0.5) * CELL;
        const y = (row + 0.5) * CELL;
        this.clearance[row * this.cols + col] = Math.min(x, WORLD_WIDTH - x, y, WORLD_HEIGHT - y, CLEARANCE_CAP);
      }
    }
    // Only cells near an island need the exact distance to its coast
    for (const island of world.islands) {
      const reach = island.reach + CLEARANCE_CAP;
      const col0 = Math.max(0, Math.floor((island.x - reach) / CELL));
      const col1 = Math.min(this.cols - 1, Math.floor((island.x + reach) / CELL));
      const row0 = Math.max(0, Math.floor((island.y - reach) / CELL));
      const row1 = Math.min(this.rows - 1, Math.floor((island.y + reach) / CELL));
      for (let row = row0; row <= row1; row++) {
        for (let col = col0; col <= col1; col++) {
          const i = row * this.cols + col;
          const d = signedDistanceToPolygon((col + 0.5) * CELL, (row + 0.5) * CELL, island.coast);
          if (d < this.clearance[i]) this.clearance[i] = d;
        }
      }
    }
  }

  /** Clearance at any point, blended from the four nearest cells: world units to the nearest coast or edge */
  clearanceAt(x: number, y: number) {
    const fx = clamp(x / CELL - 0.5, 0, this.cols - 1);
    const fy = clamp(y / CELL - 0.5, 0, this.rows - 1);
    const col = Math.min(Math.floor(fx), this.cols - 2);
    const row = Math.min(Math.floor(fy), this.rows - 2);
    const tx = fx - col;
    const ty = fy - row;
    const i = row * this.cols + col;
    const c = this.clearance;
    const top = c[i] * (1 - tx) + c[i + 1] * tx;
    const bottom = c[i + this.cols] * (1 - tx) + c[i + this.cols + 1] * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /** Whether a ship needing this much clearance can sail straight from a to b */
  lineOfSight(ax: number, ay: number, bx: number, by: number, need: number) {
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / LINE_STEP));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      if (this.clearanceAt(ax + (bx - ax) * t, ay + (by - ay) * t) < need) return false;
    }
    return true;
  }

  /**
   * The nearest point to (x, y) where a ship needing this much clearance fits: (x, y) itself if it does. For a target
   * on land or too close to it. null if there is no such point near
   */
  nearestOpen(x: number, y: number, need: number): Point | null {
    if (this.clearanceAt(x, y) >= need) return { x, y };
    const col = clamp(Math.floor(x / CELL), 0, this.cols - 1);
    const row = clamp(Math.floor(y / CELL), 0, this.rows - 1);
    let best: Point | null = null;
    let bestDistance = Infinity;
    // Rings of cells around (x, y), until no nearer cell can be found
    for (let ring = 1; ring < Math.max(this.cols, this.rows); ring++) {
      if ((ring - 1) * CELL > bestDistance) break;
      for (let r = row - ring; r <= row + ring; r++) {
        for (let c = col - ring; c <= col + ring; c++) {
          if (Math.max(Math.abs(r - row), Math.abs(c - col)) !== ring) continue;
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          if (this.clearance[r * this.cols + c] < need) continue;
          const px = (c + 0.5) * CELL;
          const py = (r + 0.5) * CELL;
          const d = Math.hypot(px - x, py - y);
          if (d < bestDistance) {
            bestDistance = d;
            best = { x: px, y: py };
          }
        }
      }
    }
    return best;
  }

  /**
   * A route from one point to another for a ship needing this much clearance: waypoints after the start, the last
   * one where the ship can get nearest to the goal (the goal itself unless it is on or too close to land).
   * Straight if nothing is in the way; otherwise the shortest way round the land (A* on the grid), pulled tight to as
   * few legs as possible. null if there is no way
   */
  findRoute(fromX: number, fromY: number, toX: number, toY: number, need: number): Point[] | null {
    const goal = this.nearestOpen(toX, toY, need);
    if (!goal) return null;
    const route: Point[] = [];
    // A ship squeezed against a coast first moves out to where it fits
    let here: Point = { x: fromX, y: fromY };
    if (this.clearanceAt(fromX, fromY) < need) {
      const exit = this.nearestOpen(fromX, fromY, need);
      if (!exit) return null;
      route.push(exit);
      here = exit;
    }
    if (this.lineOfSight(here.x, here.y, goal.x, goal.y, need)) return [...route, goal];

    const cells = this.searchCells(this.cellIndex(here.x, here.y), this.cellIndex(goal.x, goal.y), need);
    if (!cells) return null;
    const points: Point[] = cells.map((i) => ({
      x: ((i % this.cols) + 0.5) * CELL,
      y: (Math.floor(i / this.cols) + 0.5) * CELL,
    }));
    points[points.length - 1] = goal;
    // Pulled tight: from each corner, on to the farthest point of the path still in sight
    let next = 1;
    while (next < points.length) {
      let far = next;
      while (far + 1 < points.length && this.lineOfSight(here.x, here.y, points[far + 1].x, points[far + 1].y, need)) {
        far++;
      }
      route.push(points[far]);
      here = points[far];
      next = far + 1;
    }
    // Start and goal in one cell, but land between them (round a cape's tip): the loop added nothing
    if (points.length === 1) route.push(goal);
    return route;
  }

  private cellIndex(x: number, y: number) {
    const col = clamp(Math.floor(x / CELL), 0, this.cols - 1);
    const row = clamp(Math.floor(y / CELL), 0, this.rows - 1);
    return row * this.cols + col;
  }

  /**
   * A* over the cells with enough clearance. The start and goal cells may lack it at their centres: a ship scraping a
   * coast, a goal that fits where it is (nearestOpen blends the clearance) but not in its cell's middle. Cells start →
   * goal
   */
  private searchCells(start: number, goal: number, need: number): number[] | null {
    const stampId = ++this.search;
    const { cols, clearance, stamp, cost, from, closed } = this;
    const goalCol = goal % cols;
    const goalRow = Math.floor(goal / cols);
    const heuristic = (i: number) => {
      const dx = Math.abs((i % cols) - goalCol);
      const dy = Math.abs(Math.floor(i / cols) - goalRow);
      return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
    };
    const open = new MinHeap();
    stamp[start] = stampId;
    cost[start] = 0;
    from[start] = -1;
    closed[start] = 0;
    open.push(start, heuristic(start));

    for (let expansions = 0; open.size > 0 && expansions < MAX_EXPANSIONS; expansions++) {
      const current = open.pop();
      if (closed[current]) continue;
      closed[current] = 1;
      if (current === goal) {
        // Walked back from the goal, written from the end
        let length = 0;
        for (let i = current; i !== -1; i = from[i]) length++;
        const cells = Array.from({ length }, () => 0);
        for (let i = current, k = length - 1; i !== -1; i = from[i], k--) cells[k] = i;
        return cells;
      }
      const col = current % cols;
      const row = Math.floor(current / cols);
      for (const [dx, dy, step] of NEIGHBOURS) {
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= cols || r >= this.rows) continue;
        const next = r * cols + c;
        if (clearance[next] < need && next !== goal) continue;
        // No cutting a corner of land diagonally
        if (dx !== 0 && dy !== 0 && (clearance[row * cols + c] < need || clearance[r * cols + col] < need)) continue;
        const g = cost[current] + step;
        if (stamp[next] === stampId && (closed[next] || g >= cost[next])) continue;
        stamp[next] = stampId;
        closed[next] = 0;
        cost[next] = g;
        from[next] = current;
        open.push(next, g + heuristic(next));
      }
    }
    return null;
  }
}

/** A binary heap of cells by priority; equal priorities come out in the order they went in, so searches repeat exactly */
class MinHeap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];
  private readonly order: number[] = [];
  private counter = 0;

  get size() {
    return this.items.length;
  }

  push(item: number, key: number) {
    const { items, keys, order } = this;
    items.push(item);
    keys.push(key);
    order.push(this.counter++);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop() {
    const { items, keys, order } = this;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    const lastOrder = order.pop()!;
    if (items.length > 0) {
      items[0] = lastItem;
      keys[0] = lastKey;
      order[0] = lastOrder;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && this.before(left, smallest)) smallest = left;
        if (right < items.length && this.before(right, smallest)) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private before(a: number, b: number) {
    return this.keys[a] < this.keys[b] || (this.keys[a] === this.keys[b] && this.order[a] < this.order[b]);
  }

  private swap(a: number, b: number) {
    const { items, keys, order } = this;
    [items[a], items[b]] = [items[b], items[a]];
    [keys[a], keys[b]] = [keys[b], keys[a]];
    [order[a], order[b]] = [order[b], order[a]];
  }
}
