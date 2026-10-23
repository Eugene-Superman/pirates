import { Container, Text, TextStyle } from 'pixi.js';
import { findUnit, isAfloat, type GameEvent, type GameState } from '../../../game';
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
  /** The player's own ship was hit */
  hurt: new TextStyle({ ...BASE, fontSize: 20, fill: 0xff5a4a, stroke: { color: 0x2a0500, width: 4 } }),
  /** A repair step mended the hull */
  heal: new TextStyle({ ...BASE, fontSize: 19, fill: 0x7dff8a, stroke: { color: 0x05300f, width: 4 } }),
};

type DamageEvent = Extract<GameEvent, { type: 'damage' }>;
type RepairEvent = Extract<GameEvent, { type: 'repair' }>;

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
 * How much a volley or a bite did, floating up over what it hit and fading out: white for full damage, gold with a "!"
 * when a die rolled a critical hit, pale blue when the weapon isn't made for the target, "Miss" when nothing got
 * through, and red when the player's own ship is hit. A repair step floats up green over the ship it mended.
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
    for (const event of state.events) {
      if (event.type === 'damage') this.damage(event, event.targetId === state.ship.id);
      else if (event.type === 'repair') this.repair(event);
    }
    for (const f of this.floaters) {
      if (f.age >= LIFE) continue;
      f.age += dt;
      if (f.age >= LIFE) {
        f.text.visible = false;
        continue;
      }
      const target = findUnit(state, f.targetId);
      if (target && isAfloat(target)) {
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

  private damage(event: DamageEvent, own: boolean) {
    const miss = event.amount === 0;
    const style = miss
      ? STYLES.miss
      : own
        ? STYLES.hurt
        : event.crits > 0
          ? STYLES.crit
          : event.full
            ? STYLES.hit
            : STYLES.weak;
    const text = miss ? 'Miss' : own ? `−${event.amount}` : event.crits > 0 ? `${event.amount}!` : `${event.amount}`;
    this.spawn(style, text, event.targetId, event.at);
  }

  private repair(event: RepairEvent) {
    this.spawn(STYLES.heal, `+${event.amount}`, event.shipId, event.at);
  }

  private spawn(style: TextStyle, text: string, targetId: number, at: { x: number; y: number; z: number }) {
    const f = this.floaters[this.next];
    this.next = (this.next + 1) % POOL;
    f.text.style = style;
    f.text.text = text;
    f.text.visible = true;
    f.targetId = targetId;
    f.x = at.x;
    f.y = at.y;
    f.z = at.z;
    f.age = 0;
    // Cosmetic, so Math.random is fine here
    f.drift = (Math.random() - 0.5) * 2 * SPREAD;
  }
}
