import { Assets, Sprite, Texture, TilingSprite, type Spritesheet } from 'pixi.js';

// Cut out of painted pictures, and the night sky made, by blender-assets/hud/build_ornaments.py
const ART = `${import.meta.env.BASE_URL}sprites/hud`;
const ORNAMENTS_URL = `${ART}/ornaments.json`;
const SKY_URL = `${ART}/night_sky.webp`;

/** The night theme's painted pieces, by their names in ornaments.json */
export type OrnamentId =
  // Stars and moons
  | 'star4'
  | 'star8'
  | 'star4Small'
  | 'starCluster'
  | 'star8Thin'
  | 'crescent'
  | 'crescentStars'
  | 'crescentMedallion'
  | 'moon'
  | 'sun'
  | 'crescentWave'
  // Star charts
  | 'constellation1'
  | 'constellation2'
  | 'constellation3'
  | 'constellation4'
  | 'celestialRing'
  | 'armillary'
  | 'compass'
  | 'comet'
  | 'cornerFlourish'
  // Frames: corner pieces, each the top left corner, and dividers
  | 'corner1'
  | 'corner2'
  | 'corner3'
  | 'corner4'
  | 'dividerStar'
  | 'dividerMoon'
  | 'dividerStarTall'
  | 'dividerChain'
  | 'wave'
  | 'knot'
  // Buttons: every window's close button
  | 'cross'
  // Swatches
  | 'starsGold'
  | 'starsNavy'
  | 'woodGrain'
  | 'wavesEngraved'
  | 'chartParchment'
  | 'goldStreaks'
  | 'nebula'
  | 'patina'
  | 'celestialChart'
  | 'rope'
  | 'compassParchment'
  | 'starsFaint';

/**
 * How a piece is laid: scaled alike both ways (painted art is never stretched) to `width` or `height` pixels, else
 * as painted; mirrored (a corner piece for another corner); `anchor` its point at the sprite's place (its middle by
 * default)
 */
export interface OrnamentFit {
  readonly width?: number;
  readonly height?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly anchor?: readonly [number, number];
}

let sheet: Spritesheet | null = null;
let sky: Texture | null = null;
// Each load under way; one that failed is tried again by the next panel that asks for a piece
let loadingSheet = false;
let loadingSky = false;
/** Sprites made before the pieces had loaded, dressed once they have */
let waiting: [Sprite, OrnamentId, OrnamentFit][] = [];
let waitingSky: TilingSprite[] = [];

/** Loads the pieces and the night sky, once: the first panel that asks for one starts it */
function load() {
  if (!sheet && !loadingSheet) {
    loadingSheet = true;
    Assets.load<Spritesheet>(ORNAMENTS_URL)
      .then((loaded) => {
        sheet = loaded;
        for (const [sprite, id, fit] of waiting.splice(0)) dress(sprite, id, fit);
      })
      .catch((error: unknown) => {
        console.warn('The ornaments failed to load', error);
        loadingSheet = false;
        // The pieces still shown wait for the next try; those of panels made again since are let go of
        waiting = waiting.filter(([sprite]) => !sprite.destroyed);
      });
  }
  if (!sky && !loadingSky) {
    loadingSky = true;
    Assets.load<Texture>({ src: SKY_URL, data: { autoGenerateMipmaps: true } })
      .then((loaded) => {
        sky = loaded;
        for (const tiles of waitingSky.splice(0)) if (!tiles.destroyed) tiles.texture = loaded;
      })
      .catch((error: unknown) => {
        console.warn('The night sky failed to load', error);
        loadingSky = false;
        waitingSky = waitingSky.filter((tiles) => !tiles.destroyed);
      });
  }
}

function dress(sprite: Sprite, id: OrnamentId, fit: OrnamentFit) {
  const texture = sheet?.textures[id];
  // A panel made again at a new size destroys the old one, its pieces with it
  if (!texture || sprite.destroyed) return;
  sprite.texture = texture;
  const k =
    fit.width !== undefined ? fit.width / texture.width : fit.height !== undefined ? fit.height / texture.height : 1;
  sprite.scale.set(fit.flipX ? -k : k, fit.flipY ? -k : k);
}

/** A painted piece, laid as `fit` says: empty until the pieces have loaded, then dressed in its picture */
export function ornament(id: OrnamentId, fit: OrnamentFit = {}) {
  load();
  const sprite = new Sprite();
  const [ax, ay] = fit.anchor ?? [0.5, 0.5];
  sprite.anchor.set(ax, ay);
  if (sheet) dress(sprite, id, fit);
  else waiting.push([sprite, id, fit]);
  return sprite;
}

/** The night sky, tiled over `width` × `height` pixels: stars and faint nebulae, the blue under it showing through */
export function nightSky(width: number, height: number) {
  load();
  const tiles = new TilingSprite({ texture: sky ?? Texture.EMPTY, width, height });
  if (!sky) waitingSky.push(tiles);
  return tiles;
}
