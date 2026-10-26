import { Assets, Container, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import type { Ship } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { WIND_X, WIND_Y } from './wind';

// Volumetric clouds rendered in Blender by blender-assets/effects/fog/build_fog.py
const PUFFS_URL = `${import.meta.env.BASE_URL}sprites/fog/puffs.json`;

const CELL = 120; // world units: puffs sit one per cell of a grid on the water, at a random spot in it
const PUFF_CHANCE = 0.8; // share of cells with a puff
const PUFF_SIZE = [200, 320] as const; // width of a puff's frame, world units
const PUFF_Z = 6; // world units above the water
const PUFF_ALPHA = 0.42;
const PUFF_DRIFT = 2; // times the wind's speed
// Shares of the view range over which puffs fade in. They start a little inside it, so the edge isn't a clean line
const PUFF_FADE = [0.92, 1.3] as const;
const PUFF_BAND = 1.8; // share of the view range: farther out there are no puffs, only the haze and mist (puffs cost fill rate)
const BREATHE = 0.05; // puffs swell and shrink by this share, slowly
const MAX_PUFFS = 700;

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** A stable pseudo-random number 0..1 for a grid cell: the same cell always gets the same puff */
function cellRandom(i: number, j: number, salt: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The fog of war's puffs: clouds on a world grid in a band around the clear water, fading in near its edge.
 * Its container goes over the haze and mist (fogOfWar.ts), over everything on the water as they are
 */
export class FogClouds {
  readonly container = new Container({ sortableChildren: true });
  private readonly puffSprites: Sprite[] = [];
  private puffTextures: Texture[] = [];
  private puffAspect = 1;

  constructor() {
    Assets.load<Spritesheet>(PUFFS_URL)
      .then((sheet) => {
        this.puffTextures = sheet.animations.puff ?? [];
        const first = this.puffTextures[0];
        if (first) this.puffAspect = first.orig.height / first.orig.width;
      })
      .catch((error) => console.warn('Fog puffs failed to load', error));
  }

  /** screenWidth/Height: pixels; the camera must already be set for this frame */
  update(camera: Camera3D, ship: Ship, time: number, screenWidth: number, screenHeight: number) {
    let used = 0;
    const textures = this.puffTextures;
    if (textures.length > 0) {
      // The whole bank drifts: cells are counted in a frame that moves with the wind
      const driftX = WIND_X * PUFF_DRIFT * time;
      const driftY = WIND_Y * PUFF_DRIFT * time;
      const fadeFrom = ship.viewRange * PUFF_FADE[0];
      const fadeTo = ship.viewRange * PUFF_FADE[1];
      // Only the cells of the band of puffs around the clear water
      const band = ship.viewRange * PUFF_BAND;
      const i0 = Math.floor((ship.x - band - driftX) / CELL);
      const i1 = Math.ceil((ship.x + band - driftX) / CELL);
      const j0 = Math.floor((ship.y - band - driftY) / CELL);
      const j1 = Math.ceil((ship.y + band - driftY) / CELL);
      const margin = PUFF_SIZE[1] * camera.zoom;

      for (let i = i0; i <= i1 && used < MAX_PUFFS; i++) {
        for (let j = j0; j <= j1 && used < MAX_PUFFS; j++) {
          if (cellRandom(i, j, 0) > PUFF_CHANCE) continue;
          const x = (i + cellRandom(i, j, 1)) * CELL + driftX;
          const y = (j + cellRandom(i, j, 2)) * CELL + driftY;
          const dist = Math.hypot(x - ship.x, y - ship.y);
          if (dist < fadeFrom || dist > band) continue;
          const s = camera.project(x, y, PUFF_Z);
          if (s.x < -margin || s.y < -margin || s.x > screenWidth + margin) continue;
          if (s.y > screenHeight + margin) continue;

          const sprite = this.puffSprite(used++);
          const variant = Math.floor(cellRandom(i, j, 3) * textures.length);
          const phase = cellRandom(i, j, 4) * Math.PI * 2;
          const size = PUFF_SIZE[0] + (PUFF_SIZE[1] - PUFF_SIZE[0]) * cellRandom(i, j, 5);
          const width = size * camera.zoom * (1 + BREATHE * Math.sin(time * 0.4 + phase));
          sprite.texture = textures[variant];
          sprite.position.set(s.x, s.y);
          sprite.width = width;
          sprite.height = width * this.puffAspect;
          sprite.alpha = PUFF_ALPHA * smoothstep(fadeFrom, fadeTo, dist);
          // Lower on the screen is nearer the camera: drawn later, over the puffs behind it
          sprite.zIndex = s.y;
          sprite.visible = true;
        }
      }
    }
    for (let k = used; k < this.puffSprites.length; k++) this.puffSprites[k].visible = false;
  }

  private puffSprite(index: number) {
    let sprite = this.puffSprites[index];
    if (!sprite) {
      sprite = new Sprite({ anchor: { x: 0.5, y: 0.55 } });
      this.puffSprites.push(sprite);
      this.container.addChild(sprite);
    }
    return sprite;
  }
}
