import { Container, Text, TextStyle } from 'pixi.js';
import { GOODS, GOOD_IDS, ZONES, findUnit, isAfloat, talentOf, type GameEvent, type GameState } from '../../../game';
import { goldCoin, xpStar } from '../../hud/ui';
import type { Camera3D } from '../../render/Camera3D';
import { t } from '../../i18n/i18n';

const POOL = 24; // numbers on the screen at once at most; the oldest is reused
const LIFE = 1.4; // seconds a number floats
const RISE = 46; // screen pixels it floats up over its life, slowing down
const LIFT = 24; // screen pixels above the target's top it starts at: over its hit point bar
const GAP = 1; // screen pixels kept between two numbers one over the other
// A number's height for keeping clear of the others, in its font size: its letters and their outline, without the room
// a text leaves above and below them
const LINE = 1.05;
const POP = 0.14; // seconds it shrinks from POP_SCALE to its size, so a new one catches the eye
const POP_SCALE = 1.15; // no more, or it would cover the number over it while it pops
const FADE_FROM = 0.6; // share of its life after which it fades out
const SIGN = 8; // screen pixels: the radius the signs after an amount (a coin, a star) are made at, scaled to their text
const SIGN_SHARE = 0.55; // a sign's radius in its text's font size
const SIGN_GAP = 3; // screen pixels between an amount and its sign

// Round joins: the default miter puts spikes on the outline over a sharp letter's points (the M of Miss)
const outline = (color: number, width: number) => ({ color, width, join: 'round' }) as const;
const BASE = { fontFamily: 'Arial', fontWeight: 'bold', stroke: outline(0x1d0d05, 3) } as const;
const STYLES = {
  /** Damage done: the weapon is made for this target */
  hit: new TextStyle({ ...BASE, fontSize: 13, fill: 0xff5a45, stroke: outline(0x2a0500, 3) }),
  /** The wrong weapon for the target: a share of the damage, a paler red */
  weak: new TextStyle({ ...BASE, fontSize: 12, fill: 0xffa898, stroke: outline(0x2a0500, 3) }),
  /** Every gun rolled a miss */
  miss: new TextStyle({ ...BASE, fontSize: 12, fill: 0xd0d6da, fontStyle: 'italic' }),
  /** The player's own ship was hit: a deeper red, with a minus */
  hurt: new TextStyle({ ...BASE, fontSize: 12, fill: 0xe8392b, stroke: outline(0x200300, 3) }),
  /** A repair step mended the hull */
  heal: new TextStyle({ ...BASE, fontSize: 13, fill: 0x7dff8a, stroke: outline(0x05300f, 3) }),
  /** Gold: a bounty, a chest, a quest; a coin after it */
  gold: new TextStyle({ ...BASE, fontSize: 13, fill: 0xffcf3f, stroke: outline(0x3a2400, 3) }),
  /** Gold paid the crew for a repair at sea: small, it comes every few steps */
  spent: new TextStyle({ ...BASE, fontSize: 11, fill: 0xd9b25a, stroke: outline(0x2a1a00, 3) }),
  /** Experience: a kill, a quest. Small and neat, over the bounty's gold */
  xp: new TextStyle({ ...BASE, fontSize: 12, fill: 0x9fd4ff, stroke: outline(0x061c33, 3) }),
  /** Goods hauled aboard */
  cargo: new TextStyle({ ...BASE, fontSize: 13, fill: 0xe8c48a, stroke: outline(0x2e1a06, 3) }),
  /** No room left in the hold */
  full: new TextStyle({ ...BASE, fontSize: 16, fill: 0xffa64d, stroke: outline(0x3a1800, 4) }),
  /** The ship reached a level */
  level: new TextStyle({ ...BASE, fontSize: 15, fill: 0xffe680, stroke: outline(0x4a2a00, 3) }),
  /** An ability used */
  talent: new TextStyle({ ...BASE, fontSize: 12, fill: 0xffb347, stroke: outline(0x3a1800, 3) }),
};
// Screen pixels higher an XP number starts than the gold paid with it: over it, the gold under it
const XP_RAISE = 12;
// Screen pixels higher a repair's cost starts than the hull it paid for
const SPENT_RAISE = 12;
const LEVEL_RAISE = 40;
// Screen pixels higher goods hauled aboard start than the chest's gold
const CARGO_RAISE = 14;

type DamageEvent = Extract<GameEvent, { type: 'damage' }>;
type RepairEvent = Extract<GameEvent, { type: 'repair' }>;
type GoldEvent = Extract<GameEvent, { type: 'gold' }>;
type TalentEvent = Extract<GameEvent, { type: 'talent' }>;

interface Floater {
  /** The text and its sign, round the middle of their bottom edge */
  readonly label: Container;
  readonly text: Text;
  /** After an amount of gold, of experience: in place of the word */
  readonly coin: Container;
  readonly star: Container;
  /** Screen pixels: the label's size at its own scale, for keeping clear of the others */
  width: number;
  height: number;
  targetId: number;
  /** Where it hangs over: the target's top, followed while the target is afloat */
  x: number;
  y: number;
  z: number;
  /** Seconds since it appeared; LIFE and more when the floater is free */
  age: number;
  /** Counts up with every number started: of two started in one update, the later is the newer */
  serial: number;
  /** Screen pixels higher it starts than a number for the same thing */
  raise: number;
  /** Screen pixels it has been pushed up over newer numbers; it only grows, so a number never drops back */
  push: number;
  /** This frame's place before the push: the middle of its bottom edge, in screen pixels */
  sx: number;
  sy: number;
}

/**
 * How much a volley or a bite did, floating up over what it hit and fading out: red, a paler red when the weapon
 * isn't made for the target, "Miss" when nothing got through, a deeper red with a minus when the player's own ship is
 * hit (critical hits are the combat log's to tell). A repair step floats up green over the ship it mended, with the
 * gold it cost small over it; gold the player earns as an amount and a coin (a bounty over the wreck, a chest over the
 * ship), the experience small and blue with its star over it, a level reached big over the ship, an ability used by its name.
 * A newer number never hides under an older one: the older is pushed up over it.
 * Screen-space text on the top layer, the same size at every zoom; a fixed pool of labels reused round-robin
 */
export class DamageNumbers {
  readonly container = new Container();
  private readonly floaters: Floater[] = [];
  /** The floaters shown this frame, newest first: kept to lay them out without making an array a frame */
  private readonly live: Floater[] = [];
  private next = 0;
  private serial = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const label = new Container();
      const text = new Text({ text: '', style: STYLES.hit });
      text.anchor.set(0, 1);
      const coin = goldCoin(SIGN);
      const star = xpStar(SIGN);
      label.addChild(text, coin, star);
      label.visible = false;
      this.container.addChild(label);
      this.floaters.push({
        label,
        text,
        coin,
        star,
        width: 0,
        height: 0,
        targetId: -1,
        x: 0,
        y: 0,
        z: 0,
        age: LIFE,
        serial: 0,
        raise: 0,
        push: 0,
        sx: 0,
        sy: 0,
      });
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
        this.spawn(STYLES.xp, `+${event.amount}`, over, event.at, XP_RAISE, 'xp');
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
    const { live } = this;
    live.length = 0;
    for (const f of this.floaters) {
      if (f.age >= LIFE) continue;
      f.age += dt;
      if (f.age >= LIFE) {
        f.label.visible = false;
        continue;
      }
      const target = findUnit(state, f.targetId);
      if (target && isAfloat(target)) {
        f.x = target.x;
        f.y = target.y;
      }
      const k = f.age / LIFE;
      const s = camera.project(f.x, f.y, f.z);
      f.sx = s.x;
      f.sy = s.y - LIFT - f.raise - RISE * (1 - (1 - k) ** 2);
      f.label.alpha = k < FADE_FROM ? 1 : 1 - (k - FADE_FROM) / (1 - FADE_FROM);
      f.label.scale.set(f.age < POP ? POP_SCALE - (POP_SCALE - 1) * (f.age / POP) : 1);
      live.push(f);
    }
    // From the bottom of the screen up, as they stand now: a number only ever makes way upwards, so two never swap.
    // Of two started together in one place (a kill's damage and its bounty), the first stays under the next
    live.sort((a, b) => b.sy - b.push - (a.sy - a.push) || a.serial - b.serial);
    for (let i = 0; i < live.length; i++) this.place(live[i], i);
  }

  /**
   * Puts a number where it floats, above every one under it that it would cover (`live` before `i`, already placed): a
   * newer one starts low and rises faster, so without this it runs into the older ones
   */
  private place(f: Floater, i: number) {
    const { live } = this;
    let bottom = f.sy - f.push;
    for (let moved = true; moved;) {
      moved = false;
      for (let j = 0; j < i; j++) {
        const o = live[j];
        const under = o.sy - o.push; // its bottom edge, as placed
        const over = under - o.height; // its top edge
        const clear =
          Math.abs(f.sx - o.sx) * 2 >= f.width + o.width || bottom <= over - GAP || bottom - f.height >= under;
        if (clear) continue;
        // Over it, so never back under it: each newer one pushes it up once at most
        bottom = over - GAP;
        moved = true;
      }
    }
    f.push = f.sy - bottom;
    f.label.position.set(f.sx, bottom);
  }

  private damage(event: DamageEvent, own: boolean) {
    if (event.amount === 0) this.spawn(STYLES.miss, t('Miss'), event.targetId, event.at);
    else if (own) this.spawn(STYLES.hurt, `−${event.amount}`, event.targetId, event.at);
    else this.spawn(event.full ? STYLES.hit : STYLES.weak, `${event.amount}`, event.targetId, event.at);
  }

  private repair(event: RepairEvent) {
    this.spawn(STYLES.heal, `+${event.amount}`, event.shipId, event.at);
    if (event.paid > 0) this.spawn(STYLES.spent, `−${event.paid}`, event.shipId, event.at, SPENT_RAISE, 'gold');
  }

  private gold(event: GoldEvent) {
    // A bounty hangs over the wreck it was paid for; a chest's gold follows the ship that took it
    const over = event.reason === 'bounty' ? -1 : event.shipId;
    this.spawn(STYLES.gold, `+${event.amount}`, over, event.at, 0, 'gold');
  }

  /** Second wind's hull floats up green; an ability used, its name */
  private talent(event: TalentEvent) {
    const name = t(talentOf(event.talent).name);
    if (event.amount > 0) this.spawn(STYLES.heal, `+${event.amount} ${name}`, event.shipId, event.at);
    else this.spawn(STYLES.talent, `${name}!`, event.shipId, event.at, XP_RAISE);
  }

  /** `sign`: an amount of gold or of experience, the coin or the star after it in place of the word */
  private spawn(
    style: TextStyle,
    text: string,
    targetId: number,
    at: { x: number; y: number; z: number },
    raise = 0,
    sign: 'gold' | 'xp' | null = null,
  ) {
    const f = this.floaters[this.next];
    this.next = (this.next + 1) % POOL;
    f.text.style = style;
    f.text.text = text;
    f.coin.visible = sign === 'gold';
    f.star.visible = sign === 'xp';
    const radius = style.fontSize * SIGN_SHARE;
    const width = f.text.width + (sign ? SIGN_GAP + radius * 2 : 0);
    f.text.x = -width / 2;
    for (const mark of [f.coin, f.star]) {
      mark.scale.set(radius / SIGN);
      mark.position.set(width / 2 - radius, -f.text.height / 2);
    }
    f.width = width;
    f.height = style.fontSize * LINE;
    f.label.visible = true;
    f.targetId = targetId;
    f.x = at.x;
    f.y = at.y;
    f.z = at.z;
    f.age = 0;
    f.serial = ++this.serial;
    f.raise = raise;
    f.push = 0;
  }
}
