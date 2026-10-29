import { Container, Sprite, Texture } from 'pixi.js';
import type { StoryMark } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import type { WaterLight } from './seaSurface';

const COLORS = {
  beam: 0xffb547, // the lighthouse's gold: the story's colour
  core: 0xffe3a6, // the pillar's bright heart
  mote: 0xffc65a,
};
// Light added onto the blue sea whitens it: the pillar's glow and the motes are laid over it (normal), tinting it gold,
// its heart and foot added, lighting it
// World units: how high the pillar of light rises over the mark (the harbour's over the town's roofs, seen across the
// sea), how wide its glow is and the share of it its bright heart takes; their opacities, breathing by `breath`
const BEAM = { height: 110, harbour: 170, width: 30, core: 0.3, alpha: 0.4, coreAlpha: 0.55, breath: 0.15 } as const;
const BEAM_RATES = [1.3, 2.1] as const; // radians a second the glow and the heart breathe at, out of step
// Where it stands in the water: a soft glow round its foot, world units across (as wide as the mark, its share), and its
// opacity
const FOOT = { share: 0.9, alpha: 0.45 } as const;
// Gold motes rising in the pillar and drifting round it as they go, fading in and out: how many, how high they go (a
// share of its height), how far from its middle (a share of the mark's radius, narrowing as they rise), how big (world
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
const FADE = 0.8; // seconds the light takes to come in or go
const OFF_SCREEN = 200; // pixels round the screen within which its foot still draws it: the pillar rises off its edge
// The textures, made once in a canvas: pixels a side
const TEXTURE = { beam: [64, 256], glow: 64 } as const;

let beamTexture: Texture | null = null;
let glowTexture: Texture | null = null;

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
 * Where the story sends the player (storyMark3d.ts), the light over its mark: a pillar of soft gold light rising out of
 * the water, breathing, a glow round its foot and gold motes rising in it; and the light in the water under it, which
 * the sea's shader draws (`water`). Sprites over the fog: the pillar is seen from afar.
 * It comes in and goes softly, and moves to a new mark only once the old one's light has gone
 */
export class StoryLight {
  readonly container = new Container();
  /** For the sea's shader, while the light shows */
  water: WaterLight | null = null;
  private readonly glow: Sprite;
  private readonly core: Sprite;
  private readonly foot: Sprite;
  private readonly motes: Mote[] = [];
  /** The mark whose light shows, or fades */
  private mark: StoryMark | null = null;
  private shown = 0;

  constructor() {
    const add = (texture: Texture, tint: number, anchor: [number, number], blendMode: 'add' | 'normal' = 'add') => {
      const sprite = new Sprite({ texture, tint, blendMode });
      sprite.anchor.set(...anchor);
      this.container.addChild(sprite);
      return sprite;
    };
    this.foot = add(glow(), COLORS.beam, [0.5, 0.5]);
    this.glow = add(beam(), COLORS.beam, [0.5, 1], 'normal');
    this.core = add(beam(), COLORS.core, [0.5, 1]);
    for (let i = 0; i < MOTES.count; i++) {
      this.motes.push({
        sprite: add(glow(), COLORS.mote, [0.5, 0.5], 'normal'),
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

  /** mark: where the story sends the player now, if anywhere; width, height: the screen's, pixels */
  update(dt: number, mark: StoryMark | null, camera: Camera3D, time: number, width: number, height: number) {
    if (this.shown === 0) this.mark = mark;
    const shown = this.mark;
    const coming = mark !== null && shown !== null && mark.x === shown.x && mark.y === shown.y;
    this.shown = Math.min(1, Math.max(0, this.shown + (coming ? dt : -dt) / FADE));
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
    const rise = shown.id === 'port' ? BEAM.harbour : BEAM.height;
    const top = camera.project(shown.x, shown.y, rise);
    const tall = foot.y - top.y;
    const pillar = (sprite: Sprite, share: number, alpha: number, rate: number) => {
      sprite.position.set(foot.x, foot.y);
      sprite.scale.set((BEAM.width * share * zoom) / sprite.texture.width, tall / sprite.texture.height);
      sprite.alpha = alpha * (1 - BEAM.breath + BEAM.breath * Math.sin(time * rate)) * fade;
    };
    pillar(this.glow, 1, BEAM.alpha, BEAM_RATES[0]);
    pillar(this.core, BEAM.core, BEAM.coreAlpha, BEAM_RATES[1]);
    // A circle on the water is twice as wide as it is high on the screen
    const across = (shown.radius * 2 * FOOT.share * zoom) / this.foot.texture.width;
    this.foot.position.set(foot.x, foot.y);
    this.foot.scale.set(across, across / 2);
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
