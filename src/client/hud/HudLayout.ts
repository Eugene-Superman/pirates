import type { Slot } from '../storage/Store';

/** The parts of the main screen the player can move */
export const LAYOUT_BLOCKS = ['player', 'target', 'column', 'tracker', 'chat', 'skills', 'minimap'] as const;
export type BlockId = (typeof LAYOUT_BLOCKS)[number];

/** Along one axis, what a block keeps its distance from: the screen's start (left, top), its middle, or its end */
type Anchor = 'start' | 'middle' | 'end';
const ANCHORS: readonly Anchor[] = ['start', 'middle', 'end'];
const EDGE = 16; // pixels a block that grows keeps from the screen's far edge

/** Where the player put a block: along each axis what it keeps to, and how far from it (pixels) */
interface Placement {
  readonly x: Anchor;
  readonly dx: number;
  readonly y: Anchor;
  readonly dy: number;
}

/** A block's place on the screen, pixels */
export interface Spot {
  readonly x: number;
  readonly y: number;
}

/** A block's box on the screen, pixels */
export interface Box extends Spot {
  readonly width: number;
  readonly height: number;
}

/** On the screen, in whole pixels: a block bigger than the screen starts at its edge */
function onScreen(at: number, size: number, screen: number) {
  return Math.round(Math.max(0, Math.min(at, screen - size)));
}

/** Where a block `size` pixels long goes along an axis of the screen, `screen` pixels long */
function along(anchor: Anchor, offset: number, size: number, screen: number) {
  if (anchor === 'start') return onScreen(offset, size, screen);
  if (anchor === 'end') return onScreen(screen - offset - size, size, screen);
  return onScreen((screen - size) / 2 + offset, size, screen);
}

/** What a block at `at` keeps to along an axis: the third of the screen its middle is in; and how far from it */
function anchorOf(at: number, size: number, screen: number): readonly [Anchor, number] {
  const middle = at + size / 2;
  if (middle < screen / 3) return ['start', at];
  if (middle > (screen * 2) / 3) return ['end', screen - at - size];
  return ['middle', at - (screen - size) / 2];
}

function readAnchor(value: object, key: string) {
  const anchor: unknown = Reflect.get(value, key);
  return ANCHORS.find((a) => a === anchor);
}

function readOffset(value: object, key: string) {
  const offset: unknown = Reflect.get(value, key);
  return typeof offset === 'number' && Number.isFinite(offset) ? offset : undefined;
}

/** The placements as kept, those that make sense: a block's that doesn't is at its default place */
function loadPlacements(saved: unknown) {
  const placements = new Map<BlockId, Placement>();
  if (typeof saved !== 'object' || saved === null) return placements;
  for (const id of LAYOUT_BLOCKS) {
    const value: unknown = Reflect.get(saved, id);
    if (typeof value !== 'object' || value === null) continue;
    const x = readAnchor(value, 'x');
    const y = readAnchor(value, 'y');
    const dx = readOffset(value, 'dx');
    const dy = readOffset(value, 'dy');
    if (x && y && dx !== undefined && dy !== undefined) placements.set(id, { x, dx, y, dy });
  }
  return placements;
}

/**
 * Where the parts of the main screen go: where the HUD lays them out by default, or where the player put them in the
 * layout editor, kept in the browser. A block put somewhere keeps to the edge of the screen it was put nearest (or to
 * its middle), so it stays there on a screen of any size, and grows away from it: a chat put at the top unfolds down.
 * While the editor is open, the placements being tried are used, and kept only once saved
 */
export class HudLayout {
  private saved: ReadonlyMap<BlockId, Placement>;
  private draft: Map<BlockId, Placement> | null = null;
  /** Where each block is this frame, and where the HUD would lay it out */
  private readonly boxes = new Map<BlockId, Box>();
  private readonly homes = new Map<BlockId, Spot>();
  private readonly kept: Slot;
  private readonly screen: { readonly width: number; readonly height: number };

  constructor(kept: Slot, screen: { readonly width: number; readonly height: number }) {
    this.kept = kept;
    this.screen = screen;
    this.saved = loadPlacements(kept.get());
  }

  private get placements(): ReadonlyMap<BlockId, Placement> {
    return this.draft ?? this.saved;
  }

  /**
   * Where a block `width` × `height` pixels goes this frame: where the player put it, or else `home`, where the HUD
   * lays it out; on the screen, in whole pixels
   */
  place(id: BlockId, width: number, height: number, home: Spot): Spot {
    const { screen } = this;
    const at = { x: onScreen(home.x, width, screen.width), y: onScreen(home.y, height, screen.height) };
    this.homes.set(id, at);
    const placed = this.placements.get(id);
    const spot = placed
      ? { x: along(placed.x, placed.dx, width, screen.width), y: along(placed.y, placed.dy, height, screen.height) }
      : at;
    this.boxes.set(id, { ...spot, width, height });
    return spot;
  }

  /**
   * Pixels a block the player put somewhere may grow to down the screen, from the edge it keeps to to the far one;
   * null for a block at its default place, which its owner sizes
   */
  room(id: BlockId) {
    const placed = this.placements.get(id);
    if (!placed) return null;
    const { height } = this.screen;
    return placed.y === 'middle' ? height - EDGE * 2 : height - placed.dy - EDGE;
  }

  /** Whether a block grows down from its top: one the player put in the top third. The rest grow up, or both ways */
  growsDown(id: BlockId) {
    return this.placements.get(id)?.y === 'start';
  }

  /** Where a block was put this frame */
  box(id: BlockId) {
    return this.boxes.get(id);
  }

  /** Where the HUD would lay a block out this frame */
  home(id: BlockId) {
    return this.homes.get(id);
  }

  get editing() {
    return this.draft !== null;
  }

  /** Starts trying placements, from those kept */
  edit() {
    this.draft = new Map(this.saved);
  }

  /** Puts a block's top left corner at (x, y) while editing; at its default place, it is laid out by default again */
  move(id: BlockId, x: number, y: number) {
    const box = this.boxes.get(id);
    if (!this.draft || !box) return;
    const home = this.homes.get(id);
    if (home && Math.round(x) === home.x && Math.round(y) === home.y) {
      this.draft.delete(id);
      return;
    }
    const { width, height } = this.screen;
    const [ax, dx] = anchorOf(x, box.width, width);
    const [ay, dy] = anchorOf(y, box.height, height);
    this.draft.set(id, { x: ax, dx: Math.round(dx), y: ay, dy: Math.round(dy) });
  }

  /** Puts a block back at its default place while editing; every block, without `id` */
  reset(id?: BlockId) {
    if (!this.draft) return;
    if (id) this.draft.delete(id);
    else this.draft.clear();
  }

  /** Ends the editing: keeps what was tried, or (`save` false) goes back to what was kept */
  finish(save: boolean) {
    if (save && this.draft) {
      this.saved = this.draft;
      this.kept.set(Object.fromEntries(this.saved));
    }
    this.draft = null;
  }
}
