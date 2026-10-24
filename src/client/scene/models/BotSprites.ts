import { Graphics } from 'pixi.js';
import { SHIP_CLASSES, type DamageStage, type ShipClassId } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { Painter3D } from '../../render/Painter3D';
import { ShipFire, type BurningShip } from '../effects/ShipFire';
import { SerpentSprite } from './SerpentSprite';
import { ShipSprite, hasShipArt, type SinkPose, type SpriteMotion } from './ShipSprite';

// Radians of the waves' bob between one bot's id and the next, so ships near each other don't rise and fall together
const BOB_PHASE = 1.3;
// An animated ship's swim plays at its atlas's speed at top speed, and this share of it at rest
const SWIM_AT_REST = 0.5;
// With every stroke of its swim it rises a little in the water and rocks from side to side (world units, radians)
const SWIM_LIFT = 0.45;
const SWIM_ROLL = 0.025;

/** A bot's ship drawn from its atlases, with its fire and smoke on a layer of their own right over it. An animated
 * one (the turtle) swims all the time, faster the faster it goes, and plays its bite when it bites */
export class BotSprite {
  readonly ship: ShipSprite;
  /** Over the sprite in the display list: the ship's fire and smoke */
  readonly over = new Graphics();
  private readonly painter: Painter3D;
  private readonly fire = new ShipFire();
  private readonly bobPhase: number;
  /** How far through its swim the ship is, in cycles; each starts at its own point */
  private swim: number;

  constructor(id: number, classId: ShipClassId, camera: Camera3D) {
    this.bobPhase = id * BOB_PHASE;
    this.swim = (id * 0.37) % 1;
    this.ship = new ShipSprite(SHIP_CLASSES[classId], id, this.bobPhase);
    this.painter = new Painter3D(this.over, camera);
  }

  /** biteAge: seconds since the ship bit, while its bite is playing (ShotEffects.biteAge), or null */
  update(
    dt: number,
    target: BurningShip,
    camera: Camera3D,
    time: number,
    stage: DamageStage,
    pose: SinkPose,
    biteAge: number | null = null,
  ) {
    this.ship.update(target, camera, time, stage, pose, this.motion(dt, target, biteAge));
    this.fire.update(dt, target, stage, pose, time, this.bobPhase);
    this.over.clear();
    // Smoke after flames: it rises from them and drifts over them
    this.fire.drawFlames(this.painter);
    this.fire.drawSmoke(this.painter);
  }

  /** What goes into the scene's layers for it, bottom to top: the ship, its water mask, its fire */
  get layers() {
    return [...this.ship.layers, this.over];
  }

  destroy() {
    this.ship.destroy();
    this.over.destroy();
  }

  private motion(dt: number, target: BurningShip, biteAge: number | null): SpriteMotion | undefined {
    const swim = this.ship.clip('swim');
    if (!swim) return undefined;
    const top = SHIP_CLASSES[target.shipClass.id].maxSpeed;
    const pace = SWIM_AT_REST + (1 - SWIM_AT_REST) * Math.min(1, Math.abs(target.speed) / top);
    this.swim = (this.swim + (dt * pace * swim.fps) / swim.count) % 1;
    const bite = this.ship.clip('bite');
    if (bite && biteAge !== null) return { clip: 'bite', progress: (biteAge * bite.fps) / bite.count };
    const stroke = 2 * Math.PI * this.swim;
    return {
      clip: 'swim',
      progress: this.swim,
      lift: SWIM_LIFT * Math.sin(stroke),
      roll: SWIM_ROLL * Math.cos(stroke),
    };
  }
}

/**
 * The bots' ships and the sea serpents drawn from atlases, by unit id: made when a bot comes into sight, let go once it
 * isn't drawn for a frame. A sunk bot's wreck keeps its sprite (the same id) while it goes down
 */
export class BotSprites {
  private readonly sprites = new Map<number, BotSprite>();
  private readonly serpents = new Map<number, SerpentSprite>();
  private readonly taken = new Set<number>();
  private readonly camera: Camera3D;

  constructor(camera: Camera3D) {
    this.camera = camera;
  }

  /** The sprite to draw unit `id` with this frame; null when its class has no atlas or the atlas hasn't loaded yet */
  take(id: number, classId: ShipClassId): BotSprite | null {
    if (!hasShipArt(classId)) return null;
    let sprite = this.sprites.get(id);
    if (!sprite) {
      sprite = new BotSprite(id, classId, this.camera);
      this.sprites.set(id, sprite);
    }
    this.taken.add(id);
    return sprite.ship.loaded ? sprite : null;
  }

  /** The sprite to draw sea serpent `id` with this frame; null until its atlas has loaded */
  takeSerpent(id: number): SerpentSprite | null {
    let serpent = this.serpents.get(id);
    if (!serpent) {
      serpent = new SerpentSprite(id);
      this.serpents.set(id, serpent);
    }
    this.taken.add(id);
    return serpent.loaded ? serpent : null;
  }

  /** At the end of a frame: the sprites of the bots that weren't drawn are let go */
  sweep() {
    for (const [id, sprite] of this.sprites) {
      if (this.taken.has(id)) continue;
      sprite.destroy();
      this.sprites.delete(id);
    }
    for (const [id, serpent] of this.serpents) {
      if (this.taken.has(id)) continue;
      serpent.destroy();
      this.serpents.delete(id);
    }
    this.taken.clear();
  }
}
