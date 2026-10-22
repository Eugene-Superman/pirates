import { Assets, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import type { Ship } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { shipBob } from './ship3d';

/** The part of the atlas's meta.ship (written by the Blender render script) that the game reads */
interface ShipSheetMeta {
  pxPerUnit: number;
  yaw: number;
}

const DEG = Math.PI / 180;

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

// The ship from an atlas rendered in Blender.
// Frame i is the ship turned by i * 360 / N degrees, with its shadow on the water already baked in.
// Only fits a camera with the same pitch.
export class ShipSprite {
  readonly sprite = new Sprite();
  ready = false;
  private frames: Texture[] = [];
  private pxPerUnit = 1;
  private renderYaw = 0;

  constructor(url: string) {
    this.sprite.visible = false;
    Assets.load<Spritesheet>(url)
      .then((sheet) => {
        const { meta: sheetMeta } = sheet.data;
        const meta = 'ship' in sheetMeta && isShipSheetMeta(sheetMeta.ship) ? sheetMeta.ship : undefined;
        this.frames = sheet.animations.ship ?? [];
        this.pxPerUnit = meta?.pxPerUnit ?? 1;
        this.renderYaw = (meta?.yaw ?? 0) * DEG;
        if (this.frames.length === 0) return;
        // All frames share the same anchor: the ship's centre on the waterline
        const anchor = this.frames[0].defaultAnchor;
        if (anchor) this.sprite.anchor.set(anchor.x, anchor.y);
        this.ready = true;
      })
      .catch((error) => console.warn('Ship atlas failed to load, keeping the drawn ship', error));
  }

  update(ship: Ship, camera: Camera3D, time: number) {
    const n = this.frames.length;
    // Ship rotation relative to the camera the frames were rendered with
    const cameraYaw = Math.atan2(camera.fwdX, -camera.fwdY);
    const heading = ship.rotation - (cameraYaw - this.renderYaw);
    const index = ((Math.round((heading / (Math.PI * 2)) * n) % n) + n) % n;
    this.sprite.texture = this.frames[index];

    const screen = camera.project(ship.x, ship.y, shipBob(time));
    this.sprite.position.set(screen.x, screen.y);
    this.sprite.scale.set(camera.zoom / this.pxPerUnit);
    this.sprite.visible = true;
  }
}
