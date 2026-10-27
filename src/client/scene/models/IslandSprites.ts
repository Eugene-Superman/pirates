import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Island } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import type { SceneObject } from '../sceneObjects';

// For this camera (pitch 30°, yaw 45°): paintings of the islands laid on their coasts and cut into slices, and their
// shallows, by blender-assets/islands/build_island_art.py
const ISLAND_ART = `${import.meta.env.BASE_URL}sprites/islands`;
// World units: a painting is of the island whose centre is this near its own; one of an island the game no longer has
// (its islands made up afresh) is left out, and the island stays vector-drawn
const SAME_CENTRE = 1;

/** A slice of an island's painting: where it is on the island's page, and where it goes */
interface SliceInfo {
  /** x, y, width, height on the page, pixels */
  readonly frame: readonly [number, number, number, number];
  /** Its top left corner from the island's centre on the water, picture pixels */
  readonly x: number;
  readonly y: number;
  /** A point on the water in the middle of the ground it covers: it is sorted by this point's depth */
  readonly at: readonly [number, number];
}

/** The light water round an island: a small picture the game stretches, a smooth fade needing few pixels */
interface ShallowsInfo {
  readonly file: string;
  /** Its own pixels per world unit */
  readonly pxPerUnit: number;
  /** Its top left corner from the island's centre on the water, its own pixels */
  readonly x: number;
  readonly y: number;
}

interface IslandArt {
  /** The island's centre (game coordinates), which its slices' and shallows' x, y are counted from */
  readonly at: readonly [number, number];
  readonly page: string;
  readonly slices: readonly SliceInfo[];
  readonly shallows: ShallowsInfo;
}

/** islands.json, written by the script that made the pictures */
interface IslandsArt {
  /** Picture pixels per world unit */
  readonly pxPerUnit: number;
  readonly islands: readonly IslandArt[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumbers(value: unknown, length: number) {
  return Array.isArray(value) && value.length === length && value.every((n) => typeof n === 'number');
}

function isSlice(value: unknown): value is SliceInfo {
  return (
    isRecord(value) &&
    isNumbers(value.frame, 4) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    isNumbers(value.at, 2)
  );
}

function isShallows(value: unknown): value is ShallowsInfo {
  return (
    isRecord(value) &&
    typeof value.file === 'string' &&
    typeof value.pxPerUnit === 'number' &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
  );
}

function isIslandArt(value: unknown): value is IslandArt {
  return (
    isRecord(value) &&
    isNumbers(value.at, 2) &&
    typeof value.page === 'string' &&
    Array.isArray(value.slices) &&
    value.slices.every(isSlice) &&
    isShallows(value.shallows)
  );
}

// islands.json is plain JSON, so it is checked rather than trusted
function isIslandsArt(value: unknown): value is IslandsArt {
  return (
    isRecord(value) &&
    typeof value.pxPerUnit === 'number' &&
    Array.isArray(value.islands) &&
    value.islands.every(isIslandArt)
  );
}

interface Painted {
  readonly art: IslandArt;
  readonly slices: readonly { readonly sprite: Sprite; readonly info: SliceInfo; readonly layers: readonly Sprite[] }[];
  readonly shallows: Sprite;
}

/**
 * The islands from their paintings: each cut into slices along the camera's view, sorted with the ships by their
 * depth, so a ship sails behind an island's trees and in front of its beach; and their shallows, lying on the water
 * under everything. An island whose painting hasn't loaded (or that has none) is vector-drawn (island3d.ts)
 */
export class IslandSprites {
  /** The painted islands' shallows: the scene puts it under everything that lies on the water */
  readonly shallows = new Container();
  private pxPerUnit = 1;
  private readonly painted = new Map<Island, Painted>();

  constructor(islands: readonly Island[]) {
    this.load(islands).catch((error) => console.warn('The island pictures failed to load', error));
  }

  /** Whether the island's painting has loaded: until then it is vector-drawn */
  has(island: Island) {
    return this.painted.has(island);
  }

  private async load(islands: readonly Island[]) {
    const data = await Assets.load<unknown>(`${ISLAND_ART}/islands.json`);
    if (!isIslandsArt(data)) throw new Error('islands.json is not what the game expects');
    this.pxPerUnit = data.pxPerUnit;
    // Mipmaps: the pictures are shown at half their size at the farthest zoom
    const load = (file: string) =>
      Assets.load<Texture>({ src: `${ISLAND_ART}/${file}`, data: { autoGenerateMipmaps: true } });
    // Each island shows its painting as soon as it has loaded
    await Promise.all(
      data.islands.map(async (art) => {
        const island = islands.find((one) => Math.hypot(one.x - art.at[0], one.y - art.at[1]) < SAME_CENTRE);
        if (!island) return;
        const [page, water] = await Promise.all([load(art.page), load(art.shallows.file)]);
        const slices = art.slices.map((info) => {
          const [x, y, width, height] = info.frame;
          const sprite = new Sprite(new Texture({ source: page.source, frame: new Rectangle(x, y, width, height) }));
          return { sprite, info, layers: [sprite] };
        });
        const shallows = new Sprite(water);
        shallows.visible = false;
        this.shallows.addChild(shallows);
        this.painted.set(island, { art, slices, shallows });
      }),
    );
  }

  /**
   * Places the painted islands among `islands` for this frame, and their shallows. Returns the slices on the screen as
   * objects for the scene to sort with everything else
   */
  objects(painter: Painter3D, camera: Camera3D, islands: readonly Island[], width: number, height: number) {
    const objects: SceneObject[] = [];
    const onScreen = (x: number, y: number, w: number, h: number) => x < width && y < height && x + w > 0 && y + h > 0;
    for (const { shallows } of this.painted.values()) shallows.visible = false;
    for (const island of islands) {
      const painted = this.painted.get(island);
      if (!painted) continue;
      const origin = camera.project(painted.art.at[0], painted.art.at[1], 0);
      const { shallows } = painted;
      const info = painted.art.shallows;
      const stretch = camera.zoom / info.pxPerUnit;
      shallows.position.set(origin.x + info.x * stretch, origin.y + info.y * stretch);
      shallows.scale.set(stretch);
      shallows.visible = onScreen(
        shallows.x,
        shallows.y,
        shallows.texture.width * stretch,
        shallows.texture.height * stretch,
      );
      const scale = camera.zoom / this.pxPerUnit;
      for (const { sprite, info: slice, layers } of painted.slices) {
        const x = origin.x + slice.x * scale;
        const y = origin.y + slice.y * scale;
        if (!onScreen(x, y, slice.frame[2] * scale, slice.frame[3] * scale)) continue;
        sprite.position.set(x, y);
        sprite.scale.set(scale);
        objects.push({ depth: painter.depth([slice.at[0], slice.at[1], 0]), layers });
      }
    }
    return objects;
  }
}
