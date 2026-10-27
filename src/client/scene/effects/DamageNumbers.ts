import { Container, Text, TextStyle } from 'pixi.js';
import { GOODS, GOOD_IDS, TALENTS, ZONES, findUnit, isAfloat, type GameEvent, type GameState } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { t } from '../../i18n/i18n';

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
  /** Gold: a bounty, a chest, a quest */
  gold: new TextStyle({ ...BASE, fontSize: 19, fill: 0xffcf3f, stroke: { color: 0x3a2400, width: 4 } }),
  /** Gold paid the crew for a repair at sea: small, it comes every few steps */
  spent: new TextStyle({ ...BASE, fontSize: 13, fill: 0xd9b25a, stroke: { color: 0x2a1a00, width: 3 } }),
  /** Experience: a kill, a quest. Small and neat, under the bounty's gold */
  xp: new TextStyle({ ...BASE, fontSize: 14, fill: 0x9fd4ff, stroke: { color: 0x061c33, width: 3 } }),
  /** Goods hauled aboard */
  cargo: new TextStyle({ ...BASE, fontSize: 15, fill: 0xe8c48a, stroke: { color: 0x2e1a06, width: 3 } }),
  /** No room left in the hold */
  full: new TextStyle({ ...BASE, fontSize: 16, fill: 0xffa64d, stroke: { color: 0x3a1800, width: 4 } }),
  /** The ship reached a level */
  level: new TextStyle({ ...BASE, fontSize: 30, fill: 0xffe680, stroke: { color: 0x4a2a00, width: 6 } }),
  /** An ability used */
  talent: new TextStyle({ ...BASE, fontSize: 22, fill: 0xffb347, stroke: { color: 0x3a1800, width: 5 } }),
};
// Screen pixels higher an XP number starts than the gold paid with it, so the two don't cover each other
const XP_RAISE = 26;
// Screen pixels higher a repair's cost starts than the hull it paid for
const SPENT_RAISE = 18;
const LEVEL_RAISE = 40;
// Screen pixels higher goods hauled aboard start than the chest's gold
const CARGO_RAISE = 22;

type DamageEvent = Extract<GameEvent, { type: 'damage' }>;
type RepairEvent = Extract<GameEvent, { type: 'repair' }>;
type GoldEvent = Extract<GameEvent, { type: 'gold' }>;
type TalentEvent = Extract<GameEvent, { type: 'talent' }>;

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
  /** Screen pixels higher it starts than a number for the same thing */
  raise: number;
}

/**
 * How much a volley or a bite did, floating up over what it hit and fading out: white for full damage, gold with a "!"
 * when a die rolled a critical hit, pale blue when the weapon isn't made for the target, "Miss" when nothing got
 * through, and red when the player's own ship is hit. A repair step floats up green over the ship it mended, with the
 * gold it cost small over it; gold the player earns in gold (a bounty over the wreck, a chest over the ship), the
 * experience small and blue over it, a level
 * reached big over the ship, an ability used by its name.
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
      this.floaters.push({ text, targetId: -1, x: 0, y: 0, z: 0, age: LIFE, drift: 0, raise: 0 });
    }
  }

  /** Starts a number for every volley that landed in this update and moves the rest; the camera must be set */
  update(dt: number, state: GameState, camera: Camera3D) {
    for (const event of state.events) {
      if (event.type === 'damage') this.damage(event, event.targetId === state.ship.id);
      else if (event.type === 'repair') this.repair(event);
      else if (event.type === 'gold' && event.shipId === state.ship.id) this.gold(event);
      else if (event.type === 'xp' && event.shipId === state.ship.id) {
        // A kill's hangs over the wreck, like its bounty; a quest's follows the ship
        const over = event.reason === 'kill' ? -1 : event.shipId;
        this.spawn(STYLES.xp, t('+{n} XP', { n: event.amount }), over, event.at, XP_RAISE);
      } else if (event.type === 'level' && event.shipId === state.ship.id) {
        this.spawn(STYLES.level, t('Level {level}!', { level: event.level }), event.shipId, event.at, LEVEL_RAISE);
      } else if (event.type === 'talent' && event.shipId === state.ship.id) this.talent(event);
      else if (event.type === 'cargo' && event.shipId === state.ship.id) {
        const goods = GOOD_IDS.flatMap((id) => {
          const n = event.goods[id] ?? 0;
          return n > 0 ? [`+${n} ${t(GOODS[id].name)}`] : [];
        });
        this.spawn(STYLES.cargo, goods.join('  '), event.shipId, event.at, CARGO_RAISE);
      } else if (event.type === 'holdFull' && event.shipId === state.ship.id) {
        this.spawn(STYLES.full, t('Hold full'), event.shipId, event.at, CARGO_RAISE);
      } else if (event.type === 'gateClosed' && event.shipId === state.ship.id) {
        const sea = t(ZONES[event.to].name);
        const why =
          event.reason === 'tier'
            ? t('{sea}: needs a ship of tier {tier}', { sea, tier: event.tier })
            : t('{sea}: not in combat', { sea });
        this.spawn(STYLES.full, why, event.shipId, event.at, CARGO_RAISE);
      }
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
      const k = f.age / LIFE;
      const s = camera.project(f.x, f.y, f.z);
      f.text.position.set(s.x + f.drift, s.y - LIFT - f.raise - RISE * (1 - (1 - k) ** 2));
      f.text.alpha = k < FADE_FROM ? 1 : 1 - (k - FADE_FROM) / (1 - FADE_FROM);
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
    const text = miss ? t('Miss') : own ? `−${event.amount}` : event.crits > 0 ? `${event.amount}!` : `${event.amount}`;
    this.spawn(style, text, event.targetId, event.at);
  }

  private repair(event: RepairEvent) {
    this.spawn(STYLES.heal, `+${event.amount}`, event.shipId, event.at);
    if (event.paid > 0)
      this.spawn(STYLES.spent, t('−{n} gold', { n: event.paid }), event.shipId, event.at, SPENT_RAISE);
  }

  private gold(event: GoldEvent) {
    // A bounty hangs over the wreck it was paid for; a chest's gold follows the ship that took it
    this.spawn(
      STYLES.gold,
      t('+{n} gold', { n: event.amount }),
      event.reason === 'bounty' ? -1 : event.shipId,
      event.at,
    );
  }

  /** Second wind's hull floats up green; an ability used, its name */
  private talent(event: TalentEvent) {
    const name = t(TALENTS[event.talent].name);
    if (event.amount > 0) this.spawn(STYLES.heal, `+${event.amount} ${name}`, event.shipId, event.at);
    else this.spawn(STYLES.talent, `${name}!`, event.shipId, event.at, XP_RAISE);
  }

  private spawn(style: TextStyle, text: string, targetId: number, at: { x: number; y: number; z: number }, raise = 0) {
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
    f.raise = raise;
    // Cosmetic, so Math.random is fine here
    f.drift = (Math.random() - 0.5) * 2 * SPREAD;
  }
}
