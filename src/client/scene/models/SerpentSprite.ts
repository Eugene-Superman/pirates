import { Container, Sprite } from 'pixi.js';
import { SHIP_CLASSES, type DamageStage } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { BODY_RADIUS, serpentBody, type Segment, type SpinePoint } from './serpent3d';
import { frameOf, shipAtlases, type Atlases, type SpriteMotion } from './ShipSprite';

// Half a piece of the body's length in the atlas at its full thickness, world units (PIECE_LENGTH in its build.py)
const PIECE_LENGTH = 3;
// The share of a piece's length the next one starts within, so they overlap into one scaly body; where the body thins
// (or the neck rises steeply), more pieces fill in between the points of the spine. Much closer, the round pieces
// would stack into rings
const OVERLAP = 0.6;
// The first piece of the body with a spined fin on its back, counted from the head; then every other one
const FIN_FROM = 4;
// The pieces with a harpoon in them at each damage stage: odd ones, the fins are on the even ones
const HARPOONS: Readonly<Record<DamageStage, readonly number[]>> = {
  intact: [],
  minor: [9],
  heavy: [9, 13],
  burning: [9, 13, 5],
  sinking: [9, 13, 5],
};
// The tail's piece is this much thinner than a body piece at its thickest (build_tail)
const TAIL_RADIUS = 0.8;
// The least the tail is drawn at, against its size in the atlas: any smaller, its fin would be lost
const TAIL_SCALE = 0.4;
// A piece sunk deeper than this share of its radius is under the water; less deep, it shows smaller at the surface
const UNDER = 0.4;
// World units in front of the neck's end where the middle of the head is: it is sorted by that point
const HEAD_MIDDLE = 3;

/** A sprite placed this frame and how far it is from the camera */
interface Part {
  readonly sprite: Sprite;
  readonly depth: number;
}

/**
 * A sea serpent from its Blender atlases: its body bends along the way it swam (effects/Trails.ts), so it isn't one
 * picture but pieces laid along it (serpent3d.ts's serpentBody: the humps rolling back, the neck up to the head, the
 * lunge), each turned its own way and scaled to the body's thickness there: plain, with a fin on its back, with a
 * harpoon in it as it is hurt, and the tail. The head swims (its jaw working) and bites from its own animations
 */
export class SerpentSprite {
  /** The pieces and the head, far to near */
  readonly container = new Container();
  private readonly atlases: Atlases;
  private readonly pool: Sprite[] = [];
  /** Where in its swim the head starts, in cycles, so serpents near each other don't move as one */
  private readonly phase: number;

  constructor(id: number) {
    this.atlases = shipAtlases(SHIP_CLASSES.seaSerpent, id);
    this.phase = (id * 0.37) % 1;
  }

  /** Whether the intact atlas has loaded: until then the serpent can't be drawn from it */
  get loaded() {
    return this.atlases.intact !== undefined;
  }

  /** What goes into the scene's layers for it */
  get layers() {
    return [this.container];
  }

  /** shake, lunge, sink: as for serpentBody; biteAge: seconds since it bit, while the bite plays
   * (ShotEffects.biteAge), or null */
  update(
    spine: readonly SpinePoint[],
    camera: Camera3D,
    time: number,
    stage: DamageStage,
    shake: number,
    lunge: number,
    biteAge: number | null,
    sink = 0,
  ) {
    const set = this.atlases.frames(stage);
    if (!set) return;
    const segments = serpentBody(spine, time, shake, lunge, sink);
    const harpoons = HARPOONS[stage];
    const scale = camera.zoom / set.pxPerUnit;
    const parts: Part[] = [];

    const put = (s: Segment, size: number, motion: SpriteMotion, alpha = 1, forward = 0) => {
      const sprite = this.pool[parts.length] ?? new Sprite();
      this.pool[parts.length] = sprite;
      sprite.texture = frameOf(set, camera, Math.atan2(s.ay, s.ax), motion);
      sprite.anchor.set(set.anchorX, set.anchorY);
      const screen = camera.project(s.x, s.y, s.z);
      sprite.position.set(screen.x, screen.y);
      sprite.scale.set(scale * size);
      sprite.alpha = alpha;
      const depth = camera.toCamera(s.x + s.ax * forward, s.y + s.ay * forward, s.z).z;
      parts.push({ sprite, depth });
    };

    // A piece of the body, if it shows above the water
    const piece = (s: Segment, size: number, clip: string) => {
      if (s.z < -s.r * UNDER) return;
      // Half under: smaller, at the surface, like the vector model's
      const under = s.z < 0 ? 1 + s.z / s.r : 1;
      put({ ...s, z: Math.max(s.z, 0) }, size * under, { clip, progress: 0 });
    };

    const last = segments.length - 1;
    segments.forEach((s, i) => {
      if (i === last) {
        piece(s, Math.max(s.r / (BODY_RADIUS * TAIL_RADIUS), TAIL_SCALE), 'tail');
        return;
      }
      const fin = i >= FIN_FROM && (i - FIN_FROM) % 2 === 0;
      piece(s, s.r / BODY_RADIUS, harpoons.includes(i) ? 'harpoon' : fin ? 'fin' : 'segment');
      // Pieces in between where the body is thin, or the neck steep, so the pieces meet
      const next = segments[i + 1];
      const gap = Math.hypot(next.x - s.x, next.y - s.y, next.z - s.z);
      const reach = 2 * PIECE_LENGTH * (Math.min(s.r, next.r) / BODY_RADIUS) * OVERLAP;
      const extra = Math.ceil(gap / reach) - 1;
      for (let k = 1; k <= extra; k++) {
        const t = k / (extra + 1);
        const ax = s.ax + (next.ax - s.ax) * t;
        const ay = s.ay + (next.ay - s.ay) * t;
        const d = Math.hypot(ax, ay) || 1;
        const between = {
          x: s.x + (next.x - s.x) * t,
          y: s.y + (next.y - s.y) * t,
          z: s.z + (next.z - s.z) * t,
          r: s.r + (next.r - s.r) * t,
          ax: ax / d,
          ay: ay / d,
        };
        piece(between, between.r / BODY_RADIUS, 'segment');
      }
    });

    // The head on the end of the neck, going under with the rest of it when dead
    const neck = segments[0];
    if (neck.z >= -neck.r) {
      const bite = set.clips.get('bite');
      const head = set.clips.get('head');
      const motion: SpriteMotion =
        bite && biteAge !== null
          ? { clip: 'bite', progress: (biteAge * bite.fps) / bite.count }
          : { clip: 'head', progress: head ? ((time * head.fps) / head.count + this.phase) % 1 : 0 };
      put(neck, 1, motion, neck.z < 0 ? 1 + neck.z / neck.r : 1, HEAD_MIDDLE);
    }

    parts.sort((a, b) => b.depth - a.depth);
    this.container.removeChildren();
    if (parts.length > 0) this.container.addChild(...parts.map((p) => p.sprite));
  }

  destroy() {
    this.container.destroy();
    for (const sprite of this.pool) sprite.destroy();
  }
}
