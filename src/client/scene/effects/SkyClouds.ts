import { Assets, Container, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import type { Camera3D } from '../../render/Camera3D';
import { shadowPoint } from '../../render/Painter3D';
import { WIND_X, WIND_Y } from './wind';

// Small cumulus clouds seen from the game camera, made by blender-assets/effects/sky/build_clouds.py
const CLOUDS_URL = `${import.meta.env.BASE_URL}sprites/sky/clouds.json`;

const HEIGHT = 300; // world units over the sea: where the clouds' shadows fall
const FRAME = [620, 950] as const; // world units a cloud's frame spans, smallest and biggest (the cloud is about half)
const ALPHA = [0.1, 0.17] as const; // a cloud's opacity, least and most: see-through, so the sea and ships show under it
const SHADOW_ALPHA = 0.06;
const SHADOW_COLOR = 0x0a2c40; // a cloud's shadow tints what it falls on deep blue, not black
const DRIFT = 6; // times the wind's speed
const LIFE = [45, 90] as const; // seconds a cloud lasts, at random
const FADE = 8; // seconds a cloud takes to form and to melt away
const GROW = 0.12; // share a cloud grows by over its life, slowly billowing up
const GAP = [10, 28] as const; // seconds between two clouds, at random
const FIRST_GAP = [2, 6] as const; // seconds before the first
const MAX_CLOUDS = 3;
// A cloud forms upwind of the camera's focus, between these shares of the screen's reach: some just off the screen,
// to drift in, some on it, to form in sight
const UPWIND = [0.2, 1.2] as const;
const ACROSS = 1; // share of the screen's reach a cloud may form to either side of the wind's line through the focus
const GONE = 1.6; // share of the screen's reach beyond which a cloud is let go of, out of sight

interface Cloud {
  x: number;
  y: number;
  born: number;
  life: number;
  frame: number; // world units its frame spans across
  alpha: number;
  readonly sprite: Sprite;
  readonly shadow: Sprite;
}

function between([from, to]: readonly [number, number]) {
  return from + Math.random() * (to - from);
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Now and then a light cloud drifts with the wind high over the sea, over anything on the screen, and its faint
 * shadow drifts over the sea, the islands and the ships under it. Only for life: the game knows nothing of them.
 * Two containers: the shadows go over everything on the water and under the fog of war, the clouds over the fog
 */
export class SkyClouds {
  readonly shadows = new Container();
  readonly clouds = new Container();
  private readonly live: Cloud[] = [];
  private textures: Texture[] = [];
  /** Game time the next cloud forms at; set from the first update's */
  private next: number | null = null;

  constructor() {
    Assets.load<Spritesheet>(CLOUDS_URL)
      .then((sheet) => {
        this.textures = sheet.animations.cloud ?? [];
      })
      .catch((error) => console.warn('Sky clouds failed to load', error));
  }

  /** screenWidth/Height: pixels; the camera must already be set for this frame */
  update(camera: Camera3D, time: number, screenWidth: number, screenHeight: number) {
    if (this.textures.length === 0) return;
    // How far from the camera's focus the screen reaches on the water
    let reach = 0;
    for (const [sx, sy] of [
      [0, 0],
      [screenWidth, 0],
      [0, screenHeight],
      [screenWidth, screenHeight],
    ]) {
      const p = camera.screenToGround(sx, sy);
      reach = Math.max(reach, Math.hypot(p.x - camera.focusX, p.y - camera.focusY));
    }
    reach += FRAME[1] / 2;

    this.next ??= time + between(FIRST_GAP);
    if (time >= this.next) {
      this.next = time + between(GAP);
      if (this.live.length < MAX_CLOUDS) this.form(camera, time, reach);
    }

    for (let i = this.live.length - 1; i >= 0; i--) {
      const cloud = this.live[i];
      const age = time - cloud.born;
      // Worked out from where and when it formed rather than added up frame by frame
      const x = cloud.x + WIND_X * DRIFT * age;
      const y = cloud.y + WIND_Y * DRIFT * age;
      const far = Math.hypot(x - camera.focusX, y - camera.focusY) > reach * GONE;
      if (age > cloud.life || far) {
        cloud.sprite.destroy();
        cloud.shadow.destroy();
        this.live.splice(i, 1);
        continue;
      }
      const fade = smoothstep(0, FADE, age) * smoothstep(cloud.life, cloud.life - FADE, age);
      const width = cloud.frame * (1 + (GROW * age) / cloud.life) * camera.zoom;

      const s = camera.project(x, y, HEIGHT);
      place(cloud.sprite, s.x, s.y, width, cloud.alpha * fade);
      const [gx, gy] = shadowPoint([x, y, HEIGHT], 0);
      const g = camera.project(gx, gy, 0);
      place(cloud.shadow, g.x, g.y, width, SHADOW_ALPHA * fade);
    }
  }

  private form(camera: Camera3D, time: number, reach: number) {
    const wind = Math.hypot(WIND_X, WIND_Y);
    const ux = WIND_X / wind;
    const uy = WIND_Y / wind;
    const back = between(UPWIND) * reach;
    const side = (Math.random() * 2 - 1) * ACROSS * reach;
    const texture = this.textures[Math.floor(Math.random() * this.textures.length)];
    const sprite = new Sprite({ texture, anchor: 0.5 });
    const shadow = new Sprite({ texture, anchor: 0.5, tint: SHADOW_COLOR });
    sprite.alpha = shadow.alpha = 0;
    this.clouds.addChild(sprite);
    this.shadows.addChild(shadow);
    this.live.push({
      x: camera.focusX - ux * back - uy * side,
      y: camera.focusY - uy * back + ux * side,
      born: time,
      life: between(LIFE),
      frame: between(FRAME),
      alpha: between(ALPHA),
      sprite,
      shadow,
    });
  }
}

/** A cloud's sprite (or its shadow's) at a screen point, its frame `width` pixels across */
function place(sprite: Sprite, x: number, y: number, width: number, alpha: number) {
  sprite.position.set(x, y);
  sprite.scale.set(width / sprite.texture.orig.width);
  sprite.alpha = alpha;
}
