import { Assets, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Port } from '../../../game';
import type { Camera3D, Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import type { SceneObject } from '../sceneObjects';
import { drawLampGlow, drawPennant } from './port3d';

// For this camera (pitch 30°, yaw 45°): painted over the port as blender-assets/port/build_port.py renders it and cut
// like it by build_port_art.py, or rendered by build_port.py itself
const PORT_ART = `${import.meta.env.BASE_URL}sprites/port`;
// An animated piece (the lamp, a flag) is drawn right after the slice its tower stands in: nearer than it, but not as
// near as anything that is nearer than the slice
const OVER_SLICE = 0.001;
const ANIMATED_REACH = 12; // world units round the lamp or a flag's top that it may cover

/** A slice of the port's raised part: where it is on its page, and where it goes */
interface SliceInfo {
  readonly page: number;
  /** x, y, width, height on the page, pixels */
  readonly frame: readonly [number, number, number, number];
  /** Its top left corner from the island's centre on the water, picture pixels */
  readonly x: number;
  readonly y: number;
  /** A point on the water in the middle of the ground it covers: it is sorted by this point's depth */
  readonly at: readonly [number, number];
}

/** Something on the picture the game animates: the lighthouse's lamp, a flag's top, and the slice it stands in */
interface Animated {
  readonly point: Vec3;
  readonly slice: number;
}

/** port.json, written by the script that made the pictures */
interface PortArt {
  /** Picture pixels per world unit */
  readonly pxPerUnit: number;
  /** The island's centre (game coordinates), which the pictures' x, y are counted from */
  readonly centre: readonly [number, number];
  /** The water-level picture: its file and where the island's centre is in it, pixels */
  readonly ground: { readonly file: string; readonly x: number; readonly y: number };
  readonly pages: readonly string[];
  readonly slices: readonly SliceInfo[];
  /** The render's lighthouse lamp and flags; a painted port has flags of its own, and no lighthouse */
  readonly lamp?: Animated;
  readonly flag?: Animated;
  readonly castleFlag?: Animated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumbers(value: unknown, length: number) {
  return Array.isArray(value) && value.length === length && value.every((n) => typeof n === 'number');
}

function isAnimated(value: unknown): value is Animated {
  return isRecord(value) && isNumbers(value.point, 3) && typeof value.slice === 'number';
}

function isSlice(value: unknown): value is SliceInfo {
  return (
    isRecord(value) &&
    typeof value.page === 'number' &&
    isNumbers(value.frame, 4) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    isNumbers(value.at, 2)
  );
}

// port.json is plain JSON, so it is checked rather than trusted
function isPortArt(value: unknown): value is PortArt {
  return (
    isRecord(value) &&
    typeof value.pxPerUnit === 'number' &&
    isNumbers(value.centre, 2) &&
    isRecord(value.ground) &&
    typeof value.ground.file === 'string' &&
    typeof value.ground.x === 'number' &&
    typeof value.ground.y === 'number' &&
    Array.isArray(value.pages) &&
    value.pages.every((page) => typeof page === 'string') &&
    Array.isArray(value.slices) &&
    value.slices.every(isSlice) &&
    [value.lamp, value.flag, value.castleFlag].every((piece) => piece === undefined || isAnimated(piece))
  );
}

/**
 * The port from its pictures: its island, town, castle and harbour. The ground (the shallows, the sea floor in them,
 * the shadows on the water) lies under the ships; the rest is cut into slices along the camera's view, each sorted with
 * the ships by its depth, so a ship sails behind the hill, between the harbour walls and in front of the town. The
 * render's lighthouse lamp and flags are drawn over them, animated, when port.json has them. Until the pictures have
 * loaded the port is vector-drawn (port3d.ts)
 */
export class PortSprites {
  /** The water-level picture: the scene puts it under everything that stands on the water */
  readonly ground = new Sprite();
  private art: PortArt | null = null;
  private slices: { readonly sprite: Sprite; readonly info: SliceInfo; readonly layers: readonly Sprite[] }[] = [];

  constructor() {
    this.ground.visible = false;
    this.load().catch((error) => console.warn('The port pictures failed to load', error));
  }

  /** Whether the pictures have loaded: until then the port is vector-drawn */
  get loaded() {
    return this.art !== null;
  }

  private async load() {
    const art = await Assets.load<unknown>(`${PORT_ART}/port.json`);
    if (!isPortArt(art)) throw new Error('port.json is not what the game expects');
    // Mipmaps: the pictures are shown at half their size at the farthest zoom
    const load = (file: string) =>
      Assets.load<Texture>({ src: `${PORT_ART}/${file}`, data: { autoGenerateMipmaps: true } });
    const [ground, ...pages] = await Promise.all([load(art.ground.file), ...art.pages.map(load)]);
    this.ground.texture = ground;
    this.slices = art.slices.map((info) => {
      const [x, y, width, height] = info.frame;
      const sprite = new Sprite(
        new Texture({ source: pages[info.page].source, frame: new Rectangle(x, y, width, height) }),
      );
      return { sprite, info, layers: [sprite] };
    });
    this.art = art;
  }

  /**
   * Places the pictures for this frame. Returns the slices on the screen, and the lamp and the flags, as objects for
   * the scene to sort with everything else; empty until the pictures have loaded
   */
  objects(painter: Painter3D, camera: Camera3D, port: Port, time: number, width: number, height: number) {
    const { art } = this;
    const objects: SceneObject[] = [];
    if (!art) return objects;
    const scale = camera.zoom / art.pxPerUnit;
    const origin = camera.project(art.centre[0], art.centre[1], 0);
    const onScreen = (x: number, y: number, w: number, h: number) => x < width && y < height && x + w > 0 && y + h > 0;
    const { texture } = this.ground;
    const gx = origin.x - art.ground.x * scale;
    const gy = origin.y - art.ground.y * scale;
    this.ground.position.set(gx, gy);
    this.ground.scale.set(scale);
    this.ground.visible = onScreen(gx, gy, texture.width * scale, texture.height * scale);
    const depths = this.slices.map(({ info }) => painter.depth([info.at[0], info.at[1], 0]));
    this.slices.forEach(({ sprite, info, layers }, i) => {
      const x = origin.x + info.x * scale;
      const y = origin.y + info.y * scale;
      if (!onScreen(x, y, info.frame[2] * scale, info.frame[3] * scale)) return;
      sprite.position.set(x, y);
      sprite.scale.set(scale);
      objects.push({ depth: depths[i], layers });
    });
    const fly = port.harbour + Math.PI / 2;
    const { lamp, flag, castleFlag } = art;
    const animated = [
      lamp && { piece: lamp, draw: (p: Painter3D) => drawLampGlow(p, lamp.point, time) },
      flag && { piece: flag, draw: (p: Painter3D) => drawPennant(p, flag.point, fly, time) },
      castleFlag && { piece: castleFlag, draw: (p: Painter3D) => drawPennant(p, castleFlag.point, fly, time + 1) },
    ];
    for (const one of animated) {
      if (one && painter.isVisible(...one.piece.point, ANIMATED_REACH))
        objects.push({ depth: depths[one.piece.slice] - OVER_SLICE, draw: one.draw });
    }
    return objects;
  }
}
