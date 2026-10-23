import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { Island } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';

// Pictures of the island shapes, rendered in Blender by blender-assets/islands/build_islands.py
const ISLANDS_URL = `${import.meta.env.BASE_URL}sprites/islands`;

/** The looks build_islands.py renders every island shape in, in its order */
export const ISLAND_LOOKS = [
  { id: 'tropical', name: 'Tropical' },
  { id: 'green', name: 'Green isle' },
  { id: 'desert', name: 'Desert' },
  { id: 'volcanic', name: 'Volcanic' },
  { id: 'northern', name: 'Northern' },
] as const;
export type IslandLook = (typeof ISLAND_LOOKS)[number]['id'];

const LAYERS = ['ground', 'raised'] as const;
type Layer = (typeof LAYERS)[number];

/** One picture: its file and where the island's centre on the water is in it, pixels */
interface Picture {
  readonly file: string;
  readonly w: number;
  readonly h: number;
  readonly x: number;
  readonly y: number;
}

interface IslandsMeta {
  /** Picture pixels per world unit of an island at scale 1 */
  readonly pxPerUnit: number;
  readonly sprites: Readonly<Record<string, Readonly<Record<string, Readonly<Record<Layer, Picture>>>>>>;
}

/**
 * Textured islands: per island two pictures of its shape in the chosen look. "ground" (the terrain with the sea
 * floor around it) lies under everything on the water; "raised" (the land above the beach with its plants) goes
 * over the ship when the island is in front of it, under the ship otherwise. The three containers sit at those
 * places among SceneView's layers
 */
export class IslandSprites {
  readonly ground = new Container();
  readonly far = new Container();
  readonly near = new Container();
  private meta: IslandsMeta | null = null;
  private look: IslandLook | null = null;
  private readonly textures = new Map<string, Texture>();
  private readonly loading = new Set<IslandLook>();
  private readonly sprites: Record<Layer, Sprite>[] = [];

  constructor() {
    Assets.load<IslandsMeta>(`${ISLANDS_URL}/islands.json`)
      .then((meta) => {
        this.meta = meta;
        if (this.look) this.load(this.look);
      })
      .catch((error) => console.warn('Island pictures failed to load', error));
  }

  /** null: no pictures (the low-poly islands are drawn instead) */
  setLook(look: IslandLook | null) {
    this.look = look;
    if (look && this.meta) this.load(look);
  }

  /** Whether the island has its pictures in the chosen look, loaded. If not, it is drawn low-poly */
  has(island: Island) {
    const layers = this.look && this.meta?.sprites[this.look]?.[island.shapeId];
    return !!layers && LAYERS.every((layer) => this.textures.has(layers[layer].file));
  }

  /**
   * Places the pictures of these islands (all of them must have their pictures: `has`). inFront: whether an island
   * is nearer to the camera than the ship where the two could overlap on the screen
   */
  update(camera: Camera3D, islands: readonly Island[], inFront: (island: Island) => boolean) {
    const meta = this.meta;
    const pictures = this.look && meta?.sprites[this.look];
    const shown = meta && pictures ? islands : [];
    shown.forEach((island, i) => {
      const pair = this.pair(i);
      const s = camera.project(island.x, island.y, 0);
      const scale = (camera.zoom / (meta?.pxPerUnit ?? 1)) * island.scale;
      for (const layer of LAYERS) {
        const sprite = pair[layer];
        const picture = pictures?.[island.shapeId]?.[layer];
        const texture = picture && this.textures.get(picture.file);
        sprite.visible = !!texture;
        if (!picture || !texture) continue;
        sprite.texture = texture;
        sprite.anchor.set(picture.x / picture.w, picture.y / picture.h);
        sprite.position.set(s.x, s.y);
        sprite.scale.set(scale);
      }
      const parent = inFront(island) ? this.near : this.far;
      if (pair.raised.parent !== parent) parent.addChild(pair.raised);
    });
    for (let i = shown.length; i < this.sprites.length; i++) {
      this.sprites[i].ground.visible = false;
      this.sprites[i].raised.visible = false;
    }
  }

  private pair(index: number) {
    let pair = this.sprites[index];
    if (!pair) {
      pair = { ground: new Sprite(), raised: new Sprite() };
      this.ground.addChild(pair.ground);
      this.far.addChild(pair.raised);
      this.sprites.push(pair);
    }
    return pair;
  }

  /** Loads a look's pictures, once */
  private load(look: IslandLook) {
    const pictures = this.meta?.sprites[look];
    if (!pictures || this.loading.has(look)) return;
    this.loading.add(look);
    const files = Object.values(pictures).flatMap((layers) => LAYERS.map((layer) => layers[layer].file));
    // Mipmaps: at the usual zoom the pictures are drawn smaller than they are, and would shimmer as the camera moves
    const textures = files.map((file) =>
      Assets.load<Texture>({ src: `${ISLANDS_URL}/${file}`, data: { autoGenerateMipmaps: true } }),
    );
    Promise.all(textures)
      .then((loaded) => {
        loaded.forEach((texture, i) => this.textures.set(files[i], texture));
      })
      .catch((error) => {
        this.loading.delete(look);
        console.warn(`Island look ${look} failed to load`, error);
      });
  }
}
