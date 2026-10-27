import { SHIP_CLASSES, type GameState, type Mount, type UnitKind } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import type { BotSprites } from '../models/BotSprites';
import { drawBotShip } from '../models/botShip3d';
import { drawSerpent, type SpinePoint } from '../models/serpent3d';
import { drawTurtle } from '../models/turtle3d';
import { drawMonster, isMonsterModel } from '../models/monster3d';
import type { SceneObject } from '../sceneObjects';
import { smoothstep } from './foam';

const SINK_TIME = 3.5; // seconds a sunk bot takes to go under
const DEPTH = 26; // world units it goes down by then: enough for the tallest mast
// A ship drawn from its atlases goes down by this many of its radii (its sinking atlas, the part under water masked
// off), rolling over by TILT radians, and fades out over the last FADE share of the time
const SPRITE_DEPTH = 1.3;
const SPRITE_TILT = 0.22;
const SPRITE_FADE = 0.3;
const BUBBLE_TIME = 5; // seconds the water boils where it went down
const BUBBLES = 5; // rings of bubbles at a time
const BUBBLE_REACH = 9; // world units round the wreck
const FOAM = 0xffffff;

/** A bot that was sunk, going down where it was */
interface Wreck {
  readonly id: number;
  readonly kind: UnitKind;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  /** A serpent's body as it was when it died */
  readonly spine: readonly SpinePoint[] | null;
  readonly guns: readonly Mount[];
  readonly start: number;
}

/**
 * Bots sunk in sight go down where they were: the game takes them out of the game at once, so the client keeps their
 * last pose and lowers their model (or their sprite, burning) into the sea, the water boiling over them a little
 * longer. The player's own ship has its own animation (Sinking)
 */
export class Wrecks {
  private wrecks: Wreck[] = [];

  /** spine: the body of a serpent with this id as it was a moment ago */
  update(state: GameState, spine: (id: number) => readonly SpinePoint[] | null) {
    for (const event of state.events) {
      if (event.type !== 'destroyed' || event.targetId === state.ship.id) continue;
      if (!state.ship.canSee(event.at.x, event.at.y)) continue;
      const shipClass = SHIP_CLASSES[event.kind];
      this.wrecks.push({
        id: event.targetId,
        kind: event.kind,
        x: event.at.x,
        y: event.at.y,
        heading: event.heading,
        spine: event.kind === 'seaSerpent' ? spine(event.targetId) : null,
        guns: shipClass.slots.cannon,
        start: state.time,
      });
    }
    this.wrecks = this.wrecks.filter((w) => state.time - w.start < SINK_TIME + BUBBLE_TIME);
  }

  /** Bubbles bursting where each wreck went down. Drawn with the sea */
  drawWater(p: Painter3D, time: number) {
    for (const w of this.wrecks) {
      const t = time - w.start;
      const fade = 1 - Math.max(0, t - SINK_TIME) / BUBBLE_TIME;
      for (let i = 0; i < BUBBLES; i++) {
        // Each ring lives a second, at its own spot, starting at its own moment
        const phase = (t + i * 0.37) % 1;
        const angle = i * 2.4 + Math.floor(t + i * 0.37) * 1.7;
        const r = BUBBLE_REACH * (0.2 + ((i * 0.31) % 0.8));
        p.ring(
          w.x + Math.cos(angle) * r,
          w.y + Math.sin(angle) * r,
          0,
          0.5 + phase * 2.2,
          0.35,
          FOAM,
          0.6 * fade * (1 - phase),
        );
      }
    }
  }

  /** Every wreck still above the water, as volumetric objects to sort with the rest. A ship with atlases goes down
   * as its sprite (its sinking stage, still burning a while), a serpent as its pieces, the rest as their models */
  objects(p: Painter3D, time: number, dt: number, camera: Camera3D, sprites: BotSprites): SceneObject[] {
    return this.wrecks
      .filter((w) => time - w.start < SINK_TIME)
      .map((w): SceneObject => {
        const t = (time - w.start) / SINK_TIME;
        const shipClass = SHIP_CLASSES[w.kind];
        const sink = DEPTH * t * t;
        const serpent = w.spine ? sprites.takeSerpent(w.id) : null;
        if (w.spine && serpent) {
          serpent.update(w.spine, camera, time, 'sinking', 0, 0, null, sink);
          return { depth: p.depth([w.x, w.y, 0]), layers: serpent.layers };
        }
        const sprite = w.spine ? null : sprites.take(w.id, w.kind);
        if (sprite) {
          const target = { x: w.x, y: w.y, rotation: w.heading, radius: shipClass.radius, speed: 0, shipClass };
          const pose = {
            depth: SPRITE_DEPTH * shipClass.radius * t ** 1.4,
            tilt: SPRITE_TILT * t,
            alpha: 1 - smoothstep(1 - SPRITE_FADE, 1, t),
          };
          sprite.update(dt, target, camera, time, 'sinking', pose);
          return { depth: p.depth([w.x, w.y, shipClass.radius]), layers: sprite.layers };
        }
        return {
          depth: p.depth([w.x, w.y, 0]),
          draw: (painter: Painter3D) => {
            const pose = { id: w.id, x: w.x, y: w.y, heading: w.heading, speed: 0 };
            if (w.kind === 'seaSerpent') {
              if (w.spine) drawSerpent(painter, w.spine, time, 0, 0, sink);
            } else if (w.kind === 'seaTurtle') drawTurtle(painter, pose, time, 0, 0, sink);
            else if (isMonsterModel(w.kind)) drawMonster(painter, pose, w.kind, time, 0, 0, sink);
            else drawBotShip(painter, pose, w.kind, w.guns, time, 0, sink);
          },
        };
      });
  }
}
