import { Container, Text, TextStyle } from 'pixi.js';
import { isAlive, type CombatEvent, type GameState } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';

const POOL = 24; // numbers on the screen at once at most; the oldest is reused
const LIFE = 1.4; // seconds a number floats
const RISE = 46; // screen pixels it floats up over its life, slowing down
const LIFT = 24; // screen pixels above the target's top it starts at: over its hit point bar
const SPREAD = 12; // screen pixels: numbers start a little apart sideways, so quick hits don't cover each other
const POP = 0.14; // seconds it shrinks from POP_SCALE to its size, so a new one catches the eye
const POP_SCALE = 1.45;
const FADE_FROM = 0.6; // share of its life after which it fades out

const BASE = { fontFamily: 'Arial', fontWeight: 'bold', stroke: { color: 0x1d0d05, width: 4 } } as const;
const STYLES = {
  /** Full damage: the weapon is made for this target */
  hit: new TextStyle({ ...BASE, fontSize: 20, fill: 0xffffff }),
  /** At least one gun rolled a critical hit */
  crit: new TextStyle({ ...BASE, fontSize: 26, fill: 0xffd34d, stroke: { color: 0x5a1800, width: 5 } }),
  /** The wrong weapon for the target: a share of the damage */
  weak: new TextStyle({ ...BASE, fontSize: 17, fill: 0xa9c9d9 }),
  /** Every gun rolled a 1 */
  miss: new TextStyle({ ...BASE, fontSize: 16, fill: 0xd0d6da, fontStyle: 'italic' }),
};

type DamageEvent = Extract<CombatEvent, { type: 'damage' }>;

interface Floater {
  readonly text: Text;
  targetId: number;
  /** Where it hangs over: the target's top, followed while the target is afloat */
  x: number;
  y: number;
  z: number;
  /** Seconds since it appeared; LIFE and more when the floater is free */
  age: number;
  /** Screen pixels sideways */
  drift: number;
}

/**
 * How much a volley did, floating up over the target and fading out: white for full damage, gold with a "!" when a gun
 * rolled a critical hit, pale blue when the weapon isn't made for the target, "Miss" when nothing got through.
 * Screen-space text on the top layer, the same size at every zoom; a fixed pool of Text objects reused round-robin
 */
export class DamageNumbers {
  readonly container = new Container();
  private readonly floaters: Floater[] = [];
  private next = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const text = new Text({ text: '', style: STYLES.hit });
      text.anchor.set(0.5, 1);
      text.visible = false;
      this.container.addChild(text);
      this.floaters.push({ text, targetId: -1, x: 0, y: 0, z: 0, age: LIFE, drift: 0 });
    }
  }

  /** Starts a number for every volley that landed in this update and moves the rest; the camera must be set */
  update(dt: number, state: GameState, camera: Camera3D) {
    for (const event of state.events) if (event.type === 'damage') this.spawn(event);
    for (const f of this.floaters) {
      if (f.age >= LIFE) continue;
      f.age += dt;
      if (f.age >= LIFE) {
        f.text.visible = false;
        continue;
      }
      const target = state.targets.find((t) => t.id === f.targetId);
      if (target && isAlive(target)) {
        f.x = target.x;
        f.y = target.y;
      }
      const t = f.age / LIFE;
      const s = camera.project(f.x, f.y, f.z);
      f.text.position.set(s.x + f.drift, s.y - LIFT - RISE * (1 - (1 - t) ** 2));
      f.text.alpha = t < FADE_FROM ? 1 : 1 - (t - FADE_FROM) / (1 - FADE_FROM);
      f.text.scale.set(f.age < POP ? POP_SCALE - (POP_SCALE - 1) * (f.age / POP) : 1);
    }
  }

  private spawn(event: DamageEvent) {
    const f = this.floaters[this.next];
    this.next = (this.next + 1) % POOL;
    const miss = event.amount === 0;
    f.text.style = miss ? STYLES.miss : event.crits > 0 ? STYLES.crit : event.full ? STYLES.hit : STYLES.weak;
    f.text.text = miss ? 'Miss' : event.crits > 0 ? `${event.amount}!` : `${event.amount}`;
    f.text.visible = true;
    f.targetId = event.targetId;
    f.x = event.at.x;
    f.y = event.at.y;
    f.z = event.at.z;
    f.age = 0;
    // Cosmetic, so Math.random is fine here
    f.drift = (Math.random() - 0.5) * 2 * SPREAD;
  }
}
