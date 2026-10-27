import { Assets, Graphics, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import { DAMAGE_STAGES, type DamageStage, type ShipClass, type ShipClassId } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';

/** Where a sprite's ship is: a ship afloat, or a sunk bot's wreck */
export interface SpriteShip {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly radius: number;
}

/** The part of the atlas's meta.ship (written by the Blender render script) that the game reads */
interface ShipSheetMeta {
  pxPerUnit: number;
  yaw: number;
}

/** How an animation of an animated ship (meta.ship.animations) plays */
export interface ClipInfo {
  /** Frames from each direction */
  readonly count: number;
  /** Frames a second */
  readonly fps: number;
  readonly loop: boolean;
}

/** Which of its animations a ship shows and how far into it: 0 its first frame, towards 1 its last */
export interface SpriteMotion {
  readonly clip: string;
  readonly progress: number;
  /** How far the animation lifts the whole sprite, world units (a stroke of a swim), and rolls it, radians */
  readonly lift?: number;
  readonly roll?: number;
}

/** An animation's frames: every direction of its first frame, then every direction of the next... */
interface Clip extends ClipInfo {
  readonly frames: readonly Texture[];
}

/** How the sinking animation moves the sprite. All zero for a ship afloat */
export interface SinkPose {
  /** How far the ship has gone down, world units */
  depth: number;
  /** Roll of the sprite, radians */
  tilt: number;
  alpha: number;
}

/** One atlas: the ship at one damage stage from every direction (64), in each frame of its animations if it has any */
export interface FrameSet {
  /** By name: "ship" for a still ship; an animated one's, such as "swim" and "bite" */
  clips: ReadonlyMap<string, Clip>;
  /** What a still ship or an animated one at rest shows: the first clip */
  still: Clip;
  directions: number;
  pxPerUnit: number;
  renderYaw: number;
  anchorX: number;
  anchorY: number;
}

/** A class's art: the damage stages it has an atlas for, and its looks when it has several */
interface ShipArt {
  /** Any other stage shows the nearest one before it */
  readonly stages: readonly DamageStage[];
  /** A folder of atlases each; a ship's look is picked by its id, so a sea of them isn't one ship over and over */
  readonly looks?: readonly string[];
}

const DEG = Math.PI / 180;
// Atlases are public/sprites/ships/<line>/<id>/[<look>/]<stage>.{webp,json}, mirroring blender-assets/ships/<line>/<id>/.
// A class not here would be vector-drawn
const ART: Readonly<Partial<Record<ShipClassId, ShipArt>>> = {
  sloop: { stages: DAMAGE_STAGES },
  coastalBark: { stages: DAMAGE_STAGES },
  corsair: { stages: DAMAGE_STAGES },
  frigate: { stages: DAMAGE_STAGES },
  royalGalleon: { stages: DAMAGE_STAGES },
  admiral: { stages: DAMAGE_STAGES },
  shipOfTheLine: { stages: DAMAGE_STAGES },
  fishingBoat: { stages: DAMAGE_STAGES, looks: ['nets', 'barrels', 'pots'] },
  merchantSloop: { stages: DAMAGE_STAGES, looks: ['crates', 'bales'] },
  smugglerSloop: { stages: DAMAGE_STAGES },
  baronBrig: { stages: DAMAGE_STAGES },
  // Animated: it swims and bites (see BotSprite)
  seaTurtle: { stages: DAMAGE_STAGES },
  // Parts the game lays along its body (SerpentSprite), the head animated
  seaSerpent: { stages: DAMAGE_STAGES },
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

/** Height of the ship above the water while it bobs on the waves, in world units. Effects on the ship use it too.
 * phase: radians, so ships near each other don't all rise and fall together */
export function shipBob(time: number, phase = 0) {
  return Math.sin(time * BOB_SPEED + phase) * BOB_HEIGHT;
}

/** Whether ships of a class are drawn from atlases */
export function hasShipArt(classId: ShipClassId) {
  return ART[classId] !== undefined;
}

/**
 * The atlases in a folder, a damage stage each: a ship's, or the floating loot's. Shared by all its sprites, so each
 * atlas loads once. The intact and sinking ones load at once (a ship can go down from any stage, and its wreck needs
 * its atlas then); every other stage the first time it is shown: a monster's are megabytes each, wasted on a player
 * who never hurts one
 */
export class Atlases {
  private readonly folder: string;
  private readonly stages: readonly DamageStage[];
  // By the stage's place in DAMAGE_STAGES; empty until its atlas has loaded
  private readonly sets: (FrameSet | undefined)[] = [];
  private readonly asked = new Set<DamageStage>();

  constructor(folder: string, stages: readonly DamageStage[]) {
    this.folder = folder;
    this.stages = stages;
    this.load('intact');
    this.load('sinking');
  }

  /** The intact atlas, once it has loaded: nothing is drawn from the others before it */
  get intact() {
    return this.sets[0];
  }

  /** The atlas to show a stage with: its own, or the nearest earlier stage's while it has none (or it hasn't loaded) */
  frames(stage: DamageStage) {
    this.load(stage);
    for (let i = DAMAGE_STAGES.indexOf(stage); i >= 0; i--) {
      const set = this.sets[i];
      if (set) return set;
    }
    return undefined;
  }

  private load(stage: DamageStage) {
    if (this.asked.has(stage) || !this.stages.includes(stage)) return;
    this.asked.add(stage);
    const url = `${this.folder}/${stage}.json`;
    // Every atlas names its frames ship_00…ship_63, so each needs its own prefix in Pixi's texture cache
    Assets.load<Spritesheet>({ src: url, data: { cachePrefix: `${url}#` } })
      .then((sheet) => {
        const set = toFrameSet(sheet);
        if (set) this.sets[DAMAGE_STAGES.indexOf(stage)] = set;
      })
      .catch((error) => console.warn(`Ship atlas ${url} failed to load`, error));
  }
}

// Every folder's atlases, shared by all the sprites drawn from it
const atlases = new Map<string, Atlases>();

/** The atlases in a folder (made once, shared) */
export function loadAtlases(folder: string, stages: readonly DamageStage[]) {
  let known = atlases.get(folder);
  if (!known) {
    known = new Atlases(folder, stages);
    atlases.set(folder, known);
  }
  return known;
}

/** A ship's atlases: those of its class, and of its look when the class has several (picked by its id) */
export function shipAtlases(shipClass: ShipClass, id = 0) {
  const art = ART[shipClass.id];
  const looks = art?.looks ?? [];
  const look = looks.length > 0 ? `/${looks[id % looks.length]}` : '';
  return loadAtlases(`${SPRITES}/${shipClass.line}/${shipClass.id}${look}`, art?.stages ?? []);
}

/** The atlas's frame of something turned by `rotation` (radians, as a ship's), at a point of one of its animations; a
 * still ship, or one without that animation, shows its still */
export function frameOf(set: FrameSet, camera: Camera3D, rotation: number, motion?: SpriteMotion) {
  const n = set.directions;
  // Rotation relative to the camera the frames were rendered with
  const cameraYaw = Math.atan2(camera.fwdX, -camera.fwdY);
  const heading = rotation - (cameraYaw - set.renderYaw);
  const index = ((Math.round((heading / (Math.PI * 2)) * n) % n) + n) % n;
  // A clip asked for by name plays even when it is also the still (the turtle's swim, the serpent's head)
  const named = motion && set.clips.get(motion.clip);
  const clip = named ?? set.still;
  const k = motion && named ? Math.min(clip.count - 1, Math.floor(motion.progress * clip.count)) : 0;
  return clip.frames[Math.max(0, k) * n + index];
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
  private readonly atlases: Atlases;
  private readonly bobPhase: number;

  /** id: the ship's, which picks its look when the class has several; bobPhase: see shipBob */
  constructor(shipClass: ShipClass, id = 0, bobPhase = 0) {
    this.sprite.visible = false;
    this.bobPhase = bobPhase;
    this.atlases = shipAtlases(shipClass, id);
  }

  /** What goes into the scene's layers for it, bottom to top */
  get layers() {
    return [this.sprite, this.waterMask];
  }

  /** Whether the intact atlas has loaded: until then the ship can't be drawn from it */
  get loaded() {
    return this.atlases.intact !== undefined;
  }

  /** How an animation of the ship plays (from its intact atlas); undefined for a ship without it */
  clip(name: string): ClipInfo | undefined {
    return this.atlases.intact?.clips.get(name);
  }

  /** motion: which animation and how far into it; a still ship, or one without that animation, shows its still */
  update(ship: SpriteShip, camera: Camera3D, time: number, stage: DamageStage, pose: SinkPose, motion?: SpriteMotion) {
    const set = this.atlases.frames(stage);
    if (!set) return;
    this.sprite.texture = frameOf(set, camera, ship.rotation, motion);
    this.sprite.anchor.set(set.anchorX, set.anchorY);

    const lift = motion?.lift ?? 0;
    const screen = camera.project(ship.x, ship.y, shipBob(time, this.bobPhase) - pose.depth + lift);
    this.sprite.position.set(screen.x, screen.y);
    this.sprite.scale.set(camera.zoom / set.pxPerUnit);
    this.sprite.rotation = pose.tilt + (motion?.roll ?? 0);
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

  destroy() {
    this.sprite.destroy();
    this.waterMask.destroy();
  }

  // Everything above the near half of the hull's waterline stays visible. Water hides the rest: a sprite has
  // no depth, so this is the closest a flat picture gets to sinking into the sea
  private drawWaterMask(ship: SpriteShip, camera: Camera3D) {
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

/** An animation's entry in meta.ship.animations, checked */
function clipInfo(animations: unknown, name: string): Omit<ClipInfo, 'count'> & { count?: number } {
  const entry: unknown = typeof animations === 'object' && animations !== null ? Reflect.get(animations, name) : null;
  if (typeof entry !== 'object' || entry === null) return { fps: 1, loop: true };
  const frames: unknown = Reflect.get(entry, 'frames');
  const fps: unknown = Reflect.get(entry, 'fps');
  const loop: unknown = Reflect.get(entry, 'loop');
  return {
    count: typeof frames === 'number' && frames > 0 ? frames : undefined,
    fps: typeof fps === 'number' && fps > 0 ? fps : 1,
    loop: typeof loop === 'boolean' ? loop : true,
  };
}

function toFrameSet(sheet: Spritesheet): FrameSet | undefined {
  const { meta: sheetMeta } = sheet.data;
  const meta = 'ship' in sheetMeta && isShipSheetMeta(sheetMeta.ship) ? sheetMeta.ship : undefined;
  const shipMeta: unknown = 'ship' in sheetMeta ? sheetMeta.ship : undefined;
  const directionsMeta: unknown =
    typeof shipMeta === 'object' && shipMeta !== null ? Reflect.get(shipMeta, 'directions') : undefined;
  const animationsMeta: unknown =
    typeof shipMeta === 'object' && shipMeta !== null ? Reflect.get(shipMeta, 'animations') : undefined;
  const clips = new Map<string, Clip>();
  let directions = typeof directionsMeta === 'number' && directionsMeta > 0 ? directionsMeta : 0;
  for (const [name, frames] of Object.entries(sheet.animations)) {
    if (frames.length === 0) continue;
    const info = clipInfo(animationsMeta, name);
    const count = info.count ?? (directions > 0 ? Math.max(1, Math.round(frames.length / directions)) : 1);
    if (directions === 0) directions = frames.length / count;
    clips.set(name, { frames, count, fps: info.fps, loop: info.loop });
  }
  const still = clips.get('ship') ?? clips.values().next().value;
  if (!still) return undefined;
  // All frames of an atlas share one anchor: the ship's centre on the waterline
  const anchor = still.frames[0].defaultAnchor;
  return {
    clips,
    still,
    directions,
    pxPerUnit: meta?.pxPerUnit ?? 1,
    renderYaw: (meta?.yaw ?? 0) * DEG,
    anchorX: anchor?.x ?? 0.5,
    anchorY: anchor?.y ?? 0.5,
  };
}
