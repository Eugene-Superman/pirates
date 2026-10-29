import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { CURSOR_ICONS } from './iconAtlas';
import { NIGHT } from './nightTheme';
import { THEME } from './theme';
import { show } from './ui';

const LOOP = 2.8; // seconds a show of the drag takes, start to start
// Its beats, as shares of LOOP: the pointer comes in over the gun, presses it, carries it over to the slot, lets it go
// and fades
const BEATS = { press: 0.14, carry: 0.24, drop: 0.66, gone: 0.78, out: 0.92 } as const;
// A click shown: seconds one takes, start to start; its beats as shares of it (the pointer in over the button, pressing
// it, letting it go, going back out); pixels: how far down and right of the button it comes in from, and its size
const CLICK = { loop: 1.6, come: 0.25, press: 0.4, release: 0.52, leave: 0.82, from: 26, size: 46 } as const;
const POINTER = { size: 58, press: 0.86 } as const; // pixels: the pointer carrying a gun, and its scale pressed
// Where the painted gold arrow's tip is in its tile: cursors.json's hot spot, in its 64 pixels
const TIP = { x: 1.3 / 64, y: 0.4 / 64 } as const;
const GHOST = { size: 56, alpha: 0.85, x: 12, y: 18 } as const; // pixels: the gun carried, off the pointer's tip
// The light round the box to go to: pixels out from it, its rim's width and its soft edge's, how fast it breathes
// (radians a second)
const GLOW = { pad: 5, width: 3, soft: 9, speed: 4.5 } as const;
// The rings of light going out from a button as the pointer clicks it: how many, seconds apart, pixels beyond the
// light they go, seconds each takes, and their width
const RIPPLE = { count: 2, apart: 0.22, reach: 30, time: 0.9, width: 3 } as const;
// Everything round the one thing to click dimmed (a spotlight): how dark, pixels round its box left clear, and how far
// out the dark reaches (beyond the window, over the screen)
const SPOT = { alpha: 0.55, pad: 8, reach: 4000 } as const;
const CALLOUT = { size: 14, pad: 10, gap: 12, width: 360, edge: 20 } as const; // pixels: the note to the player
const COLORS = { lit: 0xffd447, ink: 0x1d1206, dark: 0x02040a } as const;

/** A box in a container's own pixels */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A part of the HUD to point at: its box is its bounds, unless given in its own pixels (a button whose bounds aren't
 * its face: a slot painted on a frame, a medallion with its name under it, a halo round it)
 */
export interface GuideTarget {
  readonly container: Container;
  readonly box?: Box;
}

/**
 * What the guide shows: a gun of the hold (`from`, its picture `texture`) dragged onto an empty slot (`to`), or a
 * button clicked (`target`: round, its light a ring; its note over it, `above`, or under it, or over or under
 * `noteBy`, a button's bar its note would hide the rest of; everything round it dimmed, `spotlight`)
 */
export type Guide =
  | { readonly kind: 'drag'; readonly from: Container; readonly to: Container; readonly texture: Texture | null }
  | {
      readonly kind: 'click';
      readonly target: GuideTarget;
      readonly round?: boolean;
      readonly above?: boolean;
      readonly noteBy?: GuideTarget;
      readonly spotlight?: boolean;
    };

/**
 * The story showing a new player what to do, so one who reads none of it still finds the way: the game's gold pointer
 * clicking the button the story wants pressed, a light breathing round it and rings of it going out at each click, a
 * note beside it; or, in the loadout, coming in over a gun in the hold, pressing it and carrying it over to the empty
 * slot lit for it, again and again. Over what it points at, never in the way of a click
 */
export class StoryGuide {
  readonly container = new Container();
  private readonly shade = new Graphics();
  private readonly glow = new Graphics();
  private readonly ripples = new Graphics();
  private readonly ghost = new Sprite({ anchor: 0.5 });
  private readonly pointer = new Container();
  private readonly painted = new Sprite();
  private readonly drawn = new Graphics();
  private readonly callout = new Container();
  private readonly back = new Graphics();
  private readonly words: Text;
  /** What the guide's parent spans (a window, the screen: read as it is now, after a resize too): the note stays inside it */
  private readonly room: { readonly width: number };
  private time = 0;

  constructor(room: { readonly width: number }) {
    this.room = room;
    this.container.eventMode = 'none';
    this.container.visible = false;
    this.words = new Text({
      text: '',
      style: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontWeight: 'bold',
        fontSize: CALLOUT.size,
        fill: THEME.title,
        wordWrap: true,
        wordWrapWidth: CALLOUT.width,
        align: 'center',
      },
    });
    this.words.anchor.set(0.5);
    this.callout.addChild(this.back, this.words);
    this.ghost.alpha = GHOST.alpha;
    this.painted.anchor.set(TIP.x, TIP.y);
    this.painted.visible = false;
    // Until the painted pointers load: a gold arrow of its own, its tip at (0, 0)
    this.drawn
      .poly([0, 0, 0, 30, 8, 23, 14, 36, 20, 33, 14, 21, 24, 21])
      .fill({ color: COLORS.lit })
      .stroke({ width: 2, color: COLORS.ink });
    this.pointer.addChild(this.drawn, this.painted);
    CURSOR_ICONS.load(() => this.paintPointer());
    this.paintPointer();
    this.container.addChild(this.shade, this.glow, this.ripples, this.ghost, this.pointer, this.callout);
  }

  /** Shows `guide` (none: hidden), saying `say` (nothing: no note). dt: seconds since the last frame */
  update(guide: Guide | null, say: string, dt: number) {
    this.container.visible = guide !== null;
    if (!guide) {
      this.time = 0;
      return;
    }
    this.time += dt;
    show(this.words, say);
    this.callout.visible = say !== '';
    if (guide.kind === 'click') this.showClick(guide);
    else this.showDrag(this.box({ container: guide.from }), this.box({ container: guide.to }), guide.texture);
  }

  private paintPointer() {
    const texture = CURSOR_ICONS.get('arrowGold');
    if (!texture) return;
    this.painted.texture = texture;
    this.painted.setSize(POINTER.size, POINTER.size);
    this.painted.visible = true;
    this.drawn.visible = false;
  }

  /** A target's box, in the guide's pixels (its parent's, however it is scaled) */
  private box({ container, box }: GuideTarget): Box {
    const parent = this.container.parent ?? this.container;
    let a: { x: number; y: number };
    let c: { x: number; y: number };
    if (box) {
      a = parent.toLocal(container.toGlobal({ x: box.x, y: box.y }));
      c = parent.toLocal(container.toGlobal({ x: box.x + box.width, y: box.y + box.height }));
    } else {
      const b = container.getBounds();
      a = parent.toLocal({ x: b.x, y: b.y });
      c = parent.toLocal({ x: b.x + b.width, y: b.y + b.height });
    }
    return { x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y };
  }

  /** The outline `out` pixels round a box, a ring round a round one, drawn on `g` for the caller to fill or stroke */
  private outline(g: Graphics, box: Box, round: boolean, out: number) {
    if (round) {
      g.circle(box.x + box.width / 2, box.y + box.height / 2, Math.max(box.width, box.height) / 2 + out);
    } else {
      g.roundRect(box.x - out, box.y - out, box.width + out * 2, box.height + out * 2, 10 + out / 2);
    }
    return g;
  }

  /** The light round the box to go to, breathing */
  private lightUp(box: Box, round: boolean) {
    const breath = 0.5 + 0.5 * Math.sin(this.time * GLOW.speed);
    const g = this.glow.clear();
    this.outline(g, box, round, GLOW.pad).fill({ color: COLORS.lit, alpha: 0.08 + 0.1 * breath });
    this.outline(g, box, round, GLOW.pad).stroke({ width: GLOW.soft, color: COLORS.lit, alpha: 0.12 + 0.14 * breath });
    this.outline(g, box, round, GLOW.pad).stroke({ width: GLOW.width, color: COLORS.lit, alpha: 0.6 + 0.4 * breath });
  }

  /** The note, its middle `x` across, over (`above`) or under the point `y`, kept inside the room */
  private placeCallout(x: number, y: number, above: boolean) {
    const w = Math.min(CALLOUT.width, this.words.width) + CALLOUT.pad * 2;
    const h = this.words.height + CALLOUT.pad;
    this.back
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill({ color: NIGHT.bottom, alpha: 0.94 })
      .stroke({ width: 2, color: COLORS.lit, alpha: 0.9 });
    const half = w / 2 + CALLOUT.edge;
    this.callout.position.set(
      Math.min(Math.max(x, half), this.room.width - half),
      above ? y - CALLOUT.gap - h / 2 : y + CALLOUT.gap + h / 2,
    );
  }

  /**
   * The button lit, the pointer coming in from down and right of it, pressing it and letting go, rings of light going
   * out from it at the press, and the note over or under it (under the pointer)
   */
  private showClick(guide: Extract<Guide, { kind: 'click' }>) {
    const { target, round = false, above = false, spotlight = false } = guide;
    const box = this.box(target);
    this.shade.clear();
    if (spotlight) {
      const { reach, pad } = SPOT;
      this.shade.rect(box.x - reach, box.y - reach, box.width + reach * 2, box.height + reach * 2);
      this.shade.fill({ color: COLORS.dark, alpha: SPOT.alpha });
      this.outline(this.shade, box, round, GLOW.pad + pad).cut();
    }
    this.lightUp(box, round);
    this.ghost.visible = false;
    const k = (this.time % CLICK.loop) / CLICK.loop;
    const there =
      k < CLICK.come ? smooth(k / CLICK.come) : k < CLICK.leave ? 1 : 1 - smooth((k - CLICK.leave) / (1 - CLICK.leave));
    // Its tip in the button, off its middle, so the pointer hides little of it
    const tipX = box.x + box.width * (round ? 0.6 : 0.55);
    const tipY = box.y + box.height * 0.6;
    const off = CLICK.from * (1 - there);
    this.pointer.position.set(tipX + off, tipY + off);
    this.pointer.alpha = there;
    const pressed = k >= CLICK.press && k < CLICK.release;
    this.pointer.scale.set((CLICK.size / POINTER.size) * (pressed ? POINTER.press : 1));

    const g = this.ripples.clear();
    const sincePress = ((k - CLICK.press + 1) % 1) * CLICK.loop;
    for (let i = 0; i < RIPPLE.count; i++) {
      const p = (sincePress - i * RIPPLE.apart) / RIPPLE.time;
      if (p < 0 || p >= 1) continue;
      const out = GLOW.pad + RIPPLE.reach * smooth(p);
      this.outline(g, box, round, out).stroke({ width: RIPPLE.width, color: COLORS.lit, alpha: 0.8 * (1 - p) });
    }
    const by = guide.noteBy ? this.box(guide.noteBy) : box;
    const middle = box.x + box.width / 2;
    if (above) this.placeCallout(middle, Math.min(box.y, by.y) - GLOW.pad, true);
    else this.placeCallout(middle, Math.max(box.y + box.height + CLICK.size * 0.8, by.y + by.height), false);
  }

  /** The pointer's beat in the loop: over the gun, pressing it, carrying it to the slot, letting it go, fading out */
  private showDrag(from: Box, to: Box, texture: Texture | null) {
    this.shade.clear();
    this.ripples.clear();
    this.lightUp(to, false);
    this.placeCallout(to.x + to.width / 2, to.y, true);
    const k = (this.time % LOOP) / LOOP;
    const start = { x: from.x + from.width * 0.3, y: from.y + from.height * 0.5 };
    const end = { x: to.x + to.width * 0.42, y: to.y + to.height * 0.45 };
    const carry = smooth((k - BEATS.carry) / (BEATS.drop - BEATS.carry));
    this.pointer.position.set(start.x + (end.x - start.x) * carry, start.y + (end.y - start.y) * carry);
    const pressed = k >= BEATS.press && k < BEATS.drop;
    this.pointer.scale.set(pressed ? POINTER.press : 1);
    // In over the gun, out after the drop
    this.pointer.alpha =
      k < BEATS.press ? k / BEATS.press : k < BEATS.out ? 1 : Math.max(0, 1 - (k - BEATS.out) / (1 - BEATS.out));
    // The gun carried from the press, shrinking into the slot after the drop
    const carried = k >= BEATS.press && k < BEATS.gone;
    this.ghost.visible = carried && texture !== null;
    if (!this.ghost.visible || !texture) return;
    this.ghost.texture = texture;
    const settle = k < BEATS.drop ? 1 : 1 - (k - BEATS.drop) / (BEATS.gone - BEATS.drop);
    this.ghost.setSize(GHOST.size * (0.75 + 0.25 * settle), GHOST.size * (0.75 + 0.25 * settle));
    this.ghost.alpha = GHOST.alpha * settle;
    this.ghost.position.set(this.pointer.x + GHOST.x, this.pointer.y + GHOST.y);
  }
}

/** 0…1 eased in and out, clamped */
function smooth(k: number) {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
}
