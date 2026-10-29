import { Container, Sprite, Texture } from 'pixi.js';
import type { Shell, Ship, StoryMark } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { SHELL_LIGHTS, type WaterLight } from './seaSurface';

// Each look's colours: its pillar's glow, its bright heart, the motes rising in it
const COLORS = {
  story: { beam: 0xffb547, core: 0xffe3a6, mote: 0xffc65a }, // the lighthouse's gold: the story's colour
  boss: { beam: 0xff3b2e, core: 0xffb4a0, mote: 0xff7a3d }, // blood and fire: a boss and its shells
} as const;
export type BeaconLook = keyof typeof COLORS;

/** A beacon's pillar: world units it rises over the water and its glow is wide; seconds its light takes to come or go */
interface Pillar {
  readonly rise: number;
  readonly width: number;
  readonly fade: number;
}
// Over the story's mark (the harbour's taller, over the town's roofs, seen across the sea); over a boss, high above its
// masts, round a big hull; over a spot a boss's shell is to land on, quick: it lands within two seconds
const PILLARS: Readonly<Record<'mark' | 'harbour' | 'boss' | 'shell', Pillar>> = {
  mark: { rise: 110, width: 30, fade: 0.8 },
  harbour: { rise: 170, width: 30, fade: 0.8 },
  boss: { rise: 230, width: 46, fade: 0.8 },
  shell: { rise: 150, width: 28, fade: 0.3 },
};
// How far their light in the water reaches: a boss's this many times its hull's radius, round it, beyond its hull; a
// shell's this many times its blast's, a little beyond the ring it is marked with (BarrageMarks)
const SPREAD = { boss: 2.5, shell: 1.5 } as const;
// Light added onto the blue sea whitens it: the pillar's glow and the motes are laid over it (normal), tinting it,
// its heart and foot added, lighting it
// The share of the pillar's glow its bright heart takes, their opacities, breathing by `breath`
const BEAM = { core: 0.3, alpha: 0.4, coreAlpha: 0.55, breath: 0.15 } as const;
const BEAM_RATES = [1.3, 2.1] as const; // radians a second the glow and the heart breathe at, out of step
// Where it stands in the water: a soft glow round its foot, world units across (as wide as its light, its share), and
// its opacity
const FOOT = { share: 0.9, alpha: 0.45 } as const;
// Motes rising in the pillar and drifting round it as they go, fading in and out: how many, how high they go (a share
// of its height), how far from its middle (a share of its light's radius, narrowing as they rise), how big (world
// units), how fast they rise (shares of the way a second), turn round it (radians a second) and twinkle
const MOTES = {
  count: 18,
  rise: 0.8,
  spread: [0.08, 0.45],
  narrow: 0.6,
  size: [3.5, 6.5],
  speed: [0.09, 0.2],
  spin: [-0.5, 0.5],
  twinkle: [3, 7],
  alpha: 1,
} as const;
const OFF_SCREEN = 200; // pixels round the screen within which its foot still draws it: the pillar rises off its edge
// The textures, made once in a canvas: pixels a side
const TEXTURE = { beam: [64, 256], glow: 64 } as const;

let beamTexture: Texture | null = null;
let glowTexture: Texture | null = null;

/** What a beacon stands over: a spot on the water, world units, and what is there, so the beacon moves with it */
export interface BeaconSpot {
  /** The same while it is the same thing: a story mark's id, a unit's, a shell's */
  readonly key: string | number;
  readonly x: number;
  readonly y: number;
  /** How far its light in the water reaches; its motes rise within it */
  readonly radius: number;
  readonly pillar: Pillar;
}

/** Where the story sends the player (storyMark3d.ts) */
export function markSpot(mark: StoryMark): BeaconSpot {
  const pillar = mark.id === 'port' ? PILLARS.harbour : PILLARS.mark;
  return { key: mark.id, x: mark.x, y: mark.y, radius: mark.radius, pillar };
}

/** A boss that fights the player: its light round its hull, wherever it sails */
export function bossSpot(boss: Ship): BeaconSpot {
  return { key: boss.id, x: boss.x, y: boss.y, radius: boss.radius * SPREAD.boss, pillar: PILLARS.boss };
}

/** A spot a boss's shell is to land on */
function shellSpot(shell: Shell): BeaconSpot {
  return { key: shell.id, x: shell.x, y: shell.y, radius: shell.radius * SPREAD.shell, pillar: PILLARS.shell };
}

function between([from, to]: readonly [number, number]) {
  return from + Math.random() * (to - from);
}

/** A texture made pixel by pixel in a canvas: `alpha` of its place (0..1 across, 0..1 down) gives each one's opacity */
function painted(width: number, height: number, alpha: (u: number, v: number) => number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Texture.EMPTY;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(255 * alpha((x + 0.5) / width, (y + 0.5) / height));
    }
  }
  context.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

/** The pillar: soft across, brightest just over its foot (melting into the water under it) and fading to its top */
function beam() {
  beamTexture ??= painted(TEXTURE.beam[0], TEXTURE.beam[1], (u, v) => {
    const across = (u - 0.5) * 2;
    const up = 1 - v;
    return Math.exp(-across * across * 6) * (1 - up) ** 1.8 * Math.min(1, up * 30);
  });
  return beamTexture;
}

/** A round soft glow, bright in the middle: the motes, and the pillar's foot squashed onto the water */
function glow() {
  glowTexture ??= painted(TEXTURE.glow, TEXTURE.glow, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    return Math.max(0, 1 - r) ** 2 * (0.6 + 0.4 * Math.exp(-r * r * 30));
  });
  return glowTexture;
}

interface Mote {
  readonly sprite: Sprite;
  readonly phase: number;
  readonly angle: number;
  readonly spread: number;
  readonly size: number;
  readonly speed: number;
  readonly spin: number;
  readonly twinkle: number;
}

/**
 * A beacon over a spot on the water: a pillar of soft light rising out of it, breathing, a glow round its foot and
 * motes rising in it; and the light in the water under it, which the sea's shader draws (`water`). Gold where the story
 * sends the player, red round a boss that fights them and where its shells will land. It comes in and goes softly,
 * moves with what it stands over, and to something else only once its light has gone
 */
export class Beacon {
  readonly container = new Container();
  /** For the sea's shader, while the light shows */
  water: WaterLight | null = null;
  private readonly glow: Sprite;
  private readonly core: Sprite;
  private readonly foot: Sprite;
  private readonly motes: Mote[] = [];
  /** The spot whose light shows, or fades */
  private spot: BeaconSpot | null = null;
  private shown = 0;

  constructor(look: BeaconLook) {
    const colors = COLORS[look];
    const add = (texture: Texture, tint: number, anchor: [number, number], blendMode: 'add' | 'normal' = 'add') => {
      const sprite = new Sprite({ texture, tint, blendMode });
      sprite.anchor.set(...anchor);
      this.container.addChild(sprite);
      return sprite;
    };
    this.foot = add(glow(), colors.beam, [0.5, 0.5]);
    this.glow = add(beam(), colors.beam, [0.5, 1], 'normal');
    this.core = add(beam(), colors.core, [0.5, 1]);
    for (let i = 0; i < MOTES.count; i++) {
      this.motes.push({
        sprite: add(glow(), colors.mote, [0.5, 0.5], 'normal'),
        phase: Math.random(),
        angle: Math.random() * Math.PI * 2,
        spread: between(MOTES.spread),
        size: between(MOTES.size),
        speed: between(MOTES.speed),
        spin: between(MOTES.spin),
        twinkle: between(MOTES.twinkle),
      });
    }
    this.container.visible = false;
  }

  /** What it stands over while its light shows or fades */
  get key() {
    return this.spot?.key ?? null;
  }

  /** Whether its light has gone: free to stand over something else */
  get dark() {
    return this.shown === 0;
  }

  /** spot: what it is to stand over now, if anything; width, height: the screen's, pixels */
  update(dt: number, spot: BeaconSpot | null, camera: Camera3D, time: number, width: number, height: number) {
    if (this.shown === 0 || (spot !== null && spot.key === this.spot?.key)) this.spot = spot;
    const shown = this.spot;
    const coming = spot !== null && shown !== null && spot.key === shown.key;
    const fadeTime = shown?.pillar.fade ?? 1;
    this.shown = Math.min(1, Math.max(0, this.shown + (coming ? dt : -dt) / fadeTime));
    const fade = this.shown * this.shown * (3 - 2 * this.shown);
    this.water = shown && fade > 0 ? { x: shown.x, y: shown.y, radius: shown.radius, shown: fade } : null;
    const foot = shown ? camera.project(shown.x, shown.y, 0) : null;
    const inSight =
      foot !== null &&
      foot.x > -OFF_SCREEN &&
      foot.x < width + OFF_SCREEN &&
      foot.y > -OFF_SCREEN &&
      foot.y < height + OFF_SCREEN * 4;
    this.container.visible = fade > 0 && inSight;
    if (!shown || !foot || !this.container.visible) return;

    const { zoom } = camera;
    const { rise } = shown.pillar;
    const top = camera.project(shown.x, shown.y, rise);
    const tall = foot.y - top.y;
    const across = shown.pillar.width * zoom;
    const pillar = (sprite: Sprite, share: number, alpha: number, rate: number) => {
      sprite.position.set(foot.x, foot.y);
      sprite.scale.set((across * share) / sprite.texture.width, tall / sprite.texture.height);
      sprite.alpha = alpha * (1 - BEAM.breath + BEAM.breath * Math.sin(time * rate)) * fade;
    };
    pillar(this.glow, 1, BEAM.alpha, BEAM_RATES[0]);
    pillar(this.core, BEAM.core, BEAM.coreAlpha, BEAM_RATES[1]);
    // A circle on the water is twice as wide as it is high on the screen
    const round = (shown.radius * 2 * FOOT.share * zoom) / this.foot.texture.width;
    this.foot.position.set(foot.x, foot.y);
    this.foot.scale.set(round, round / 2);
    this.foot.alpha = FOOT.alpha * fade;

    for (const mote of this.motes) {
      const k = (time * mote.speed + mote.phase) % 1;
      const angle = mote.angle + time * mote.spin;
      const out = shown.radius * mote.spread * (1 - MOTES.narrow * k);
      const at = camera.project(
        shown.x + Math.cos(angle) * out,
        shown.y + Math.sin(angle) * out,
        k * rise * MOTES.rise,
      );
      const twinkle = 0.65 + 0.35 * Math.sin(time * mote.twinkle + mote.phase * 40);
      mote.sprite.position.set(at.x, at.y);
      mote.sprite.scale.set((mote.size * zoom) / mote.sprite.texture.width);
      mote.sprite.alpha = MOTES.alpha * Math.sin(Math.PI * k) * twinkle * fade;
    }
  }
}

/**
 * A red beacon over every spot a boss's shells are to land on (state.shells; a player's own bombardment's are left to
 * their gold marks), from the moment it is marked till its shell lands: as many as the sea's shader lights, each shell
 * keeping its own and a new one taking one whose light has gone
 */
export class ShellBeacons {
  readonly container = new Container();
  private readonly beacons: Beacon[] = [];

  constructor() {
    for (let i = 0; i < SHELL_LIGHTS; i++) {
      const beacon = new Beacon('boss');
      this.beacons.push(beacon);
      this.container.addChild(beacon.container);
    }
  }

  /** For the sea's shader: each beacon's light in the water, null where none shows */
  get water() {
    return this.beacons.map((beacon) => beacon.water);
  }

  /** width, height: the screen's, pixels */
  update(dt: number, shells: readonly Shell[], camera: Camera3D, time: number, width: number, height: number) {
    const free = [...this.beacons];
    for (const shell of shells) {
      if (shell.ordnance !== null) continue;
      const spot = shellSpot(shell);
      const own = free.findIndex((beacon) => beacon.key === spot.key);
      const index = own >= 0 ? own : free.findIndex((beacon) => beacon.dark);
      // More shells than beacons: the rest go unlit
      if (index < 0) continue;
      const [beacon] = free.splice(index, 1);
      beacon.update(dt, spot, camera, time, width, height);
    }
    for (const beacon of free) beacon.update(dt, null, camera, time, width, height);
  }
}
