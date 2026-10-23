import { Assets, Graphics, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import { DAMAGE_STAGES, type DamageStage, type Ship, type ShipClass, type ShipClassId } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';

/** The part of the atlas's meta.ship (written by the Blender render script) that the game reads */
interface ShipSheetMeta {
  pxPerUnit: number;
  yaw: number;
}

/** How the sinking animation moves the sprite. All zero for a ship afloat */
export interface SinkPose {
  /** How far the ship has gone down, world units */
  depth: number;
  /** Roll of the sprite, radians */
  tilt: number;
  alpha: number;
}

/** One atlas: 64 frames of the ship at one damage stage */
interface FrameSet {
  frames: Texture[];
  pxPerUnit: number;
  renderYaw: number;
  anchorX: number;
  anchorY: number;
}

const DEG = Math.PI / 180;
// Atlases are public/sprites/ships/<line>/<id>/<stage>.{webp,json}, mirroring blender-assets/ships/<line>/<id>/.
// The damage stages each class has art for; any other stage shows the nearest one before it
// (the bots' classes have none: they are vector-drawn, models/botShip3d.ts)
const ATLAS_STAGES: Readonly<Partial<Record<ShipClassId, readonly DamageStage[]>>> = {
  sloop: DAMAGE_STAGES,
};
const SPRITES = `${import.meta.env.BASE_URL}sprites/ships`;
const BOB_HEIGHT = 0.8; // world units
const BOB_SPEED = 2.1; // radians per second
// Waterline footprint of the hull in ship radii, used to hide the part of a sinking ship that is under water
const WATERLINE_HALF_LENGTH = 1.7;
const WATERLINE_HALF_WIDTH = 0.65;
const WATERLINE_POINTS = 24;
// Far enough to cover any part of the sprite outside the hull's outline, screen pixels
const MASK_REACH = 4000;

/** Height of the ship above the water while it bobs on the waves, in world units. Effects on the ship use it too */
export function shipBob(time: number) {
  return Math.sin(time * BOB_SPEED) * BOB_HEIGHT;
}

// The atlas is plain JSON, so its custom fields are checked rather than trusted
function isShipSheetMeta(value: unknown): value is ShipSheetMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pxPerUnit' in value &&
    typeof value.pxPerUnit === 'number' &&
    'yaw' in value &&
    typeof value.yaw === 'number'
  );
}

// The ship from atlases rendered in Blender, one atlas per damage stage.
// Nothing is drawn until the intact atlas has loaded.
// Frame i is the ship turned by i * 360 / N degrees, with its shadow on the water already baked in.
// Only fits a camera with the same pitch.
export class ShipSprite {
  readonly sprite = new Sprite();
  /** Hides what is below the water while the ship sinks. Must be in the display list next to the sprite and stay
   * visible: Pixi skips an invisible mask, which hides the whole sprite */
  readonly waterMask = new Graphics();
  private readonly sets: (FrameSet | undefined)[] = [];

  constructor(shipClass: ShipClass) {
    this.sprite.visible = false;
    const folder = `${SPRITES}/${shipClass.line}/${shipClass.id}`;
    for (const stage of ATLAS_STAGES[shipClass.id] ?? []) {
      const url = `${folder}/${stage}.json`;
      // Every atlas names its frames ship_00…ship_63, so each needs its own prefix in Pixi's texture cache
      Assets.load<Spritesheet>({ src: url, data: { cachePrefix: `${url}#` } })
        .then((sheet) => {
          const set = toFrameSet(sheet);
          if (set) this.sets[DAMAGE_STAGES.indexOf(stage)] = set;
        })
        .catch((error) => console.warn(`Ship atlas ${url} failed to load`, error));
    }
  }

  update(ship: Ship, camera: Camera3D, time: number, stage: DamageStage, pose: SinkPose) {
    const set = this.frameSet(stage);
    if (!set) return;
    const n = set.frames.length;
    // Ship rotation relative to the camera the frames were rendered with
    const cameraYaw = Math.atan2(camera.fwdX, -camera.fwdY);
    const heading = ship.rotation - (cameraYaw - set.renderYaw);
    const index = ((Math.round((heading / (Math.PI * 2)) * n) % n) + n) % n;
    this.sprite.texture = set.frames[index];
    this.sprite.anchor.set(set.anchorX, set.anchorY);

    const screen = camera.project(ship.x, ship.y, shipBob(time) - pose.depth);
    this.sprite.position.set(screen.x, screen.y);
    this.sprite.scale.set(camera.zoom / set.pxPerUnit);
    this.sprite.rotation = pose.tilt;
    this.sprite.alpha = pose.alpha;
    this.sprite.visible = pose.alpha > 0;

    if (pose.depth > 0) {
      this.drawWaterMask(ship, camera);
      this.sprite.mask = this.waterMask;
    } else if (this.sprite.mask) {
      // Without the mask the Graphics would be drawn as a plain white shape
      this.sprite.mask = null;
      this.waterMask.clear();
    }
  }

  private frameSet(stage: DamageStage) {
    for (let i = DAMAGE_STAGES.indexOf(stage); i >= 0; i--) {
      const set = this.sets[i];
      if (set) return set;
    }
    return undefined;
  }

  // Everything above the near half of the hull's waterline stays visible. Water hides the rest: a sprite has
  // no depth, so this is the closest a flat picture gets to sinking into the sea
  private drawWaterMask(ship: Ship, camera: Camera3D) {
    const cos = Math.cos(ship.rotation);
    const sin = Math.sin(ship.rotation);
    const halfLength = ship.radius * WATERLINE_HALF_LENGTH;
    const halfWidth = ship.radius * WATERLINE_HALF_WIDTH;
    const outline: { x: number; y: number }[] = [];
    for (let i = 0; i < WATERLINE_POINTS; i++) {
      const a = (i / WATERLINE_POINTS) * Math.PI * 2;
      const lx = Math.cos(a) * halfLength;
      const ly = Math.sin(a) * halfWidth;
      outline.push(camera.project(ship.x + lx * cos - ly * sin, ship.y + lx * sin + ly * cos, 0));
    }

    let left = 0;
    let right = 0;
    for (let i = 1; i < outline.length; i++) {
      if (outline[i].x < outline[left].x) left = i;
      if (outline[i].x > outline[right].x) right = i;
    }
    // Of the two arcs between the leftmost and rightmost points, the near one is lower on the screen
    const arc = (step: number) => {
      const points: { x: number; y: number }[] = [];
      for (let i = left; ; i = (i + step + outline.length) % outline.length) {
        points.push(outline[i]);
        if (i === right) return points;
      }
    };
    const forward = arc(1);
    const backward = arc(-1);
    const near = lowest(forward) > lowest(backward) ? forward : backward;

    const a = outline[left];
    const b = outline[right];
    const flat = [a.x - MASK_REACH, a.y];
    for (const p of near) flat.push(p.x, p.y);
    flat.push(b.x + MASK_REACH, b.y, b.x + MASK_REACH, b.y - MASK_REACH, a.x - MASK_REACH, a.y - MASK_REACH);
    this.waterMask.clear().poly(flat).fill({ color: 0xffffff });
  }
}

/** Screen y of the lowest point (screen y grows downwards) */
function lowest(points: readonly { y: number }[]) {
  return Math.max(...points.map((p) => p.y));
}

function toFrameSet(sheet: Spritesheet): FrameSet | undefined {
  const { meta: sheetMeta } = sheet.data;
  const meta = 'ship' in sheetMeta && isShipSheetMeta(sheetMeta.ship) ? sheetMeta.ship : undefined;
  const frames = sheet.animations.ship ?? [];
  if (frames.length === 0) return undefined;
  // All frames of an atlas share one anchor: the ship's centre on the waterline
  const anchor = frames[0].defaultAnchor;
  return {
    frames,
    pxPerUnit: meta?.pxPerUnit ?? 1,
    renderYaw: (meta?.yaw ?? 0) * DEG,
    anchorX: anchor?.x ?? 0.5,
    anchorY: anchor?.y ?? 0.5,
  };
}
