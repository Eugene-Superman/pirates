import type { DamageStage, Ship } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';
import type { SinkPose } from '../models/ShipSprite';

const SINK_TIME = 7; // seconds from the last hit to the ship vanishing
const SETTLE_TIME = 1; // the ship lists for a moment before it starts going down
const SINK_DEPTH = 1.25; // how far the ship goes down, in ship radii: enough to hide the whole wreck
const TILT = 0.24; // radians of roll at the end
const WOBBLE = 0.03; // radians, the ship rocks while it goes down
const FADE_FROM = 0.72; // share of SINK_TIME after which what is left of the ship fades out
const FOAM_TIME = 5; // seconds the foam stays on the water after the ship is gone
const FOAM_RINGS = 4;
const FOAM_COLOR = 0xffffff;

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

// The sinking animation: client-only, started when the ship's damage stage becomes `sinking`.
// The game only knows the ship is wrecked; how it goes down is up to the view
export class Sinking {
  readonly pose: SinkPose = { depth: 0, tilt: 0, alpha: 1 };
  private startTime: number | null = null;
  private elapsed = 0;

  update(time: number, stage: DamageStage, ship: Ship) {
    if (stage !== 'sinking') {
      // Repaired (with the debug buttons, for now): the ship is back afloat
      this.startTime = null;
      this.elapsed = 0;
      this.pose.depth = 0;
      this.pose.tilt = 0;
      this.pose.alpha = 1;
      return;
    }
    this.startTime ??= time;
    const t = (this.elapsed = time - this.startTime);
    const going = smoothstep(SETTLE_TIME, SINK_TIME, t);
    this.pose.depth = SINK_DEPTH * ship.radius * going ** 1.4;
    this.pose.tilt = TILT * smoothstep(0, SINK_TIME * 0.8, t) + WOBBLE * Math.sin(t * 2.3) * (1 - going);
    this.pose.alpha = 1 - smoothstep(SINK_TIME * FADE_FROM, SINK_TIME, t);
  }

  /** Foam and bubbles on the water around a sinking ship, drawn flat on the sea under the ship */
  drawFoam(painter: Painter3D, ship: Ship) {
    if (this.startTime === null || this.elapsed > SINK_TIME + FOAM_TIME) return;
    const t = this.elapsed;
    const r = ship.radius;
    // Fades in as the ship starts to go down and out a few seconds after it is gone
    const strength =
      smoothstep(SETTLE_TIME * 0.5, SETTLE_TIME * 2, t) * (1 - smoothstep(SINK_TIME, SINK_TIME + FOAM_TIME, t));
    painter.disc(ship.x, ship.y, 0, r * (1.1 + 0.5 * smoothstep(0, SINK_TIME, t)), FOAM_COLOR, 0.22 * strength);
    for (let i = 0; i < FOAM_RINGS; i++) {
      // Rings spread out from the hull one after another
      const phase = (t * 0.45 + i / FOAM_RINGS) % 1;
      painter.ring(
        ship.x,
        ship.y,
        0,
        r * (1 + phase * 1.6),
        0.5 + (1 - phase),
        FOAM_COLOR,
        0.5 * strength * (1 - phase),
      );
    }
  }
}
