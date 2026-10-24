import { Graphics, Sprite } from 'pixi.js';
import type { Chest } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { Painter3D } from '../../render/Painter3D';
import { CHEST_BLINK, chestAge } from './chest3d';
import { frameOf, loadAtlases, type Atlases, type FrameSet } from './ShipSprite';

// The loot's atlases, rendered in Blender (blender-assets/loot/chest/build.py): a look each, from every direction
const LOOT = `${import.meta.env.BASE_URL}sprites/loot/chest`;
const LOOKS = ['gold', 'goods', 'lost'] as const;
type Look = (typeof LOOKS)[number];

const COLORS = { glint: 0xffe27a, lostGlint: 0xffb067 };
const TURN = 1.3; // radians each chest's id turns it by: chests near each other lie every which way
const BOB = { height: 0.6, speed: 2.2, roll: 0.05, rollSpeed: 0.9 }; // world units, radians a second, radians
const DROP = { time: 0.3, height: 6 }; // a chest just dropped falls into the sea: seconds, world units
// World units over the water of the glint over each look, so it is seen from afar: over the gold, the crates, the flag
const GLINT_HEIGHT: Readonly<Record<Look, number>> = { gold: 8, goods: 6, lost: 15 };

/** Which look a chest has: gold in it, only goods, or a player's own lost cargo */
function lookOf(chest: Chest): Look {
  if (chest.lostBy !== null) return 'lost';
  return chest.gold > 0 ? 'gold' : 'goods';
}

/** One chest afloat: its sprite, and the glint over it on a layer of its own */
class ChestSprite {
  readonly sprite = new Sprite();
  readonly over = new Graphics();
  private readonly painter: Painter3D;

  constructor(camera: Camera3D) {
    this.painter = new Painter3D(this.over, camera);
  }

  get layers() {
    return [this.sprite, this.over];
  }

  update(chest: Chest, set: FrameSet, camera: Camera3D, time: number) {
    const left = chest.expiresAt - time;
    const blinking = left < CHEST_BLINK && Math.sin(time * 10) < 0;
    // Dropped a moment ago: it falls, then bobs
    const t = Math.min(chestAge(chest, time) / DROP.time, 1);
    const fall = DROP.height * (1 - t) * (1 - t);
    const z = Math.sin(time * BOB.speed + chest.id) * BOB.height + fall;
    this.sprite.texture = frameOf(set, camera, chest.id * TURN);
    this.sprite.anchor.set(set.anchorX, set.anchorY);
    const screen = camera.project(chest.x, chest.y, z);
    this.sprite.position.set(screen.x, screen.y);
    this.sprite.scale.set(camera.zoom / set.pxPerUnit);
    this.sprite.rotation = Math.sin(time * BOB.rollSpeed + chest.id) * BOB.roll;
    this.sprite.visible = !blinking;

    this.over.clear();
    if (blinking || t < 1) return;
    const look = lookOf(chest);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4 + chest.id);
    const color = look === 'lost' ? COLORS.lostGlint : COLORS.glint;
    this.painter.ball([chest.x, chest.y, z + GLINT_HEIGHT[look]], 1.1 + pulse, color, 0.3 + 0.35 * pulse);
  }

  destroy() {
    this.sprite.destroy();
    this.over.destroy();
  }
}

/**
 * The chests afloat drawn from their atlases, by chest id: made when one comes into sight, let go once it isn't drawn
 * for a frame. It falls into the sea when dropped, bobs and rolls on the waves, a chest of gold glints, and every chest
 * blinks in its last seconds before it sinks
 */
export class ChestSprites {
  private readonly sprites = new Map<number, ChestSprite>();
  private readonly taken = new Set<number>();
  private readonly camera: Camera3D;
  private readonly sets = new Map<Look, Atlases>();

  constructor(camera: Camera3D) {
    this.camera = camera;
    for (const look of LOOKS) this.sets.set(look, loadAtlases(`${LOOT}/${look}`, ['intact']));
  }

  /** The layers to draw a chest with this frame; null until its look's atlas has loaded (the vector chest then) */
  take(chest: Chest, time: number) {
    const set = this.sets.get(lookOf(chest))?.intact;
    if (!set) return null;
    let sprite = this.sprites.get(chest.id);
    if (!sprite) {
      sprite = new ChestSprite(this.camera);
      this.sprites.set(chest.id, sprite);
    }
    this.taken.add(chest.id);
    sprite.update(chest, set, this.camera, time);
    return sprite.layers;
  }

  /** At the end of a frame: the sprites of the chests that weren't drawn are let go */
  sweep() {
    for (const [id, sprite] of this.sprites) {
      if (this.taken.has(id)) continue;
      sprite.destroy();
      this.sprites.delete(id);
    }
    this.taken.clear();
  }
}
