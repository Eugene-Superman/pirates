import { BlurFilter, Color, Filter, GlProgram, Sprite, UniformGroup, defaultFilterVert } from 'pixi.js';
import type { GameState } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import { Beacon, levelSpot } from './Beacon';

const LIFE = 3; // seconds the light stands round the ship, before it goes (Beacon: the level's pillar's fade)
// The gold glow round the ship: its sprite's light (its brightness, premultiplied, from `from` to `full`: the dark,
// see-through shadow baked into it stays dark) blurred under it, `blur` world units wide, `flare` times wider at
// first, falling off in `flareTime` seconds; its opacity, breathing by `breath` at `rate` radians a second; seconds it
// takes to come
const GLOW = {
  from: 0.03,
  full: 0.16,
  blur: 5,
  flare: 1.2,
  flareTime: 0.45,
  alpha: 0.95,
  breath: 0.2,
  rate: 4.2,
  rise: 0.15,
} as const;
const BLUR_QUALITY = 3; // passes of the glow's blur
// The hull lit gold from within, its sprite added over itself: a flash at first, falling off in `flashTime` seconds,
// then a faint shine breathing with the glow
const SHINE = { flash: 0.45, flashTime: 0.35, alpha: 0.1 } as const;
const SPARKS = 48; // sparks a level sends up round the ship
const SPARK_LIFE = [1.1, 1.9] as const; // seconds
const SPARK_RISE = [18, 34] as const; // world units per second
const SPARK_SPIN = 2.2; // radians per second they wind round the ship as they rise
const SPARK_SIZE = 1.5; // world units
// The story's gold, as the light round the ship (Beacon's)
const COLORS = { glow: 0xffc65a, shine: 0xffd98a, spark: 0xffe27a, halo: 0xfff6cc } as const;

// The glow's silhouette, before it is blurred: each pixel of the ship's sprite turned gold by how bright it is
const SILHOUETTE = /* glsl */ `
in vec2 vTextureCoord;

out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uGold;
uniform vec3 uSilhouette; // brightness where a pixel starts to glow, where it glows full; the glow's opacity

void main() {
  vec3 light = texture(uTexture, vTextureCoord).rgb;
  float a = smoothstep(uSilhouette.x, uSilhouette.y, dot(light, vec3(0.3, 0.59, 0.11))) * uSilhouette.z;
  finalColor = vec4(uGold * a, a);
}
`;

/** A spark winding up round the ship, which it sails with */
interface Spark {
  /** Seconds before it starts, and since */
  delay: number;
  age: number;
  life: number;
  angle: number;
  distance: number;
  rise: number;
}

interface Burst {
  shipId: number;
  x: number;
  y: number;
  radius: number;
  height: number;
  /** Seconds since the level was reached */
  age: number;
  readonly sparks: Spark[];
}

/**
 * A level reached: the story's gold light round the ship, as over where it sends the player (a pool of it in the
 * water, a soft pillar rising, motes in it), the ship glowing gold, its hull lit a moment, and sparks winding up round
 * it, while "Level N!" floats up over it (DamageNumbers). For the player's own ship, the only one with levels; it goes
 * with the ship if it sails on. One at a time: a second level at once starts it again
 */
export class LevelUpEffect {
  /** Under the ships, as a boss's: its pillar rises behind the masts instead of washing the hull out */
  readonly light = new Beacon('story');
  /** Under the ship's sprite: the ship's sprite blurred gold */
  readonly glow = new Sprite();
  /** Over it: the hull lit gold */
  readonly shine = new Sprite({ tint: COLORS.shine, blendMode: 'add' });
  private readonly blur = new BlurFilter({ quality: BLUR_QUALITY });
  private readonly silhouette = new UniformGroup({
    uGold: { value: new Float32Array(new Color(COLORS.glow).toRgbArray()), type: 'vec3<f32>' },
    uSilhouette: { value: new Float32Array(3), type: 'vec3<f32>' },
  });
  private readonly burst: Burst = {
    shipId: -1,
    x: 0,
    y: 0,
    radius: 0,
    height: 0,
    age: LIFE,
    sparks: Array.from({ length: SPARKS }, () => ({ delay: 0, age: 0, life: 1, angle: 0, distance: 0, rise: 0 })),
  };

  constructor() {
    const glProgram = GlProgram.from({ vertex: defaultFilterVert, fragment: SILHOUETTE, name: 'level-glow' });
    this.glow.filters = [new Filter({ glProgram, resources: { silhouette: this.silhouette } }), this.blur];
    this.glow.visible = this.shine.visible = false;
  }

  /** width, height: the screen's, pixels; the camera must already be set for this frame */
  update(dt: number, state: GameState, camera: Camera3D, width: number, height: number) {
    const b = this.burst;
    for (const event of state.events) {
      if (event.type !== 'level' || event.shipId !== state.ship.id) continue;
      b.shipId = event.shipId;
      b.radius = state.ship.radius;
      b.height = state.ship.height;
      b.age = 0;
      // Cosmetic, so Math.random is fine here
      for (const s of b.sparks) {
        s.delay = Math.random() * 0.7;
        s.age = 0;
        s.life = SPARK_LIFE[0] + Math.random() * (SPARK_LIFE[1] - SPARK_LIFE[0]);
        s.angle = Math.random() * Math.PI * 2;
        s.distance = b.radius * (0.5 + Math.random() * 0.8);
        s.rise = SPARK_RISE[0] + Math.random() * (SPARK_RISE[1] - SPARK_RISE[0]);
      }
    }
    const ship = b.age < LIFE ? state.ships.find((s) => s.id === b.shipId) : undefined;
    this.light.update(dt, ship ? levelSpot(ship) : null, camera, state.time, width, height);
    if (b.age >= LIFE) return;
    b.age += dt;
    if (ship) {
      b.x = ship.x;
      b.y = ship.y;
    }
    for (const s of b.sparks) {
      if (b.age < s.delay) continue;
      s.age += dt;
    }
  }

  /** The glow and the shine in the ship's sprite as it is drawn this frame */
  dress(ship: Sprite, camera: Camera3D, time: number) {
    const b = this.burst;
    // Coming in on its own, quicker than the light; going as the light goes
    const fade = (b.age < LIFE ? Math.min(1, b.age / GLOW.rise) : (this.light.water?.shown ?? 0)) * ship.alpha;
    this.glow.visible = this.shine.visible = fade > 0 && ship.visible;
    if (!this.glow.visible) return;
    for (const sprite of [this.glow, this.shine]) {
      sprite.texture = ship.texture;
      sprite.anchor.copyFrom(ship.anchor);
      sprite.position.copyFrom(ship.position);
      sprite.scale.copyFrom(ship.scale);
      sprite.rotation = ship.rotation;
    }
    const breath = 1 - GLOW.breath + GLOW.breath * Math.sin(time * GLOW.rate);
    this.silhouette.uniforms.uSilhouette.set([GLOW.from, GLOW.full, Math.min(1, GLOW.alpha * breath * fade)]);
    this.blur.strength = GLOW.blur * camera.zoom * (1 + GLOW.flare * Math.exp(-b.age / GLOW.flareTime));
    this.shine.alpha = (SHINE.flash * Math.exp(-b.age / SHINE.flashTime) + SHINE.alpha * breath) * fade;
  }

  /** The sparks, over the ship */
  draw(p: Painter3D) {
    const b = this.burst;
    if (b.age >= LIFE) return;
    for (const s of b.sparks) {
      if (s.age <= 0 || s.age >= s.life) continue;
      const k = s.age / s.life;
      const angle = s.angle + SPARK_SPIN * s.age;
      const x = b.x + Math.cos(angle) * s.distance * (1 - 0.4 * k);
      const y = b.y + Math.sin(angle) * s.distance * (1 - 0.4 * k);
      const z = b.height * 0.6 + s.rise * s.age;
      const alpha = Math.min(1, k * 8) * (1 - k);
      p.ball([x, y, z], SPARK_SIZE * 2.6, COLORS.halo, alpha * 0.3);
      p.ball([x, y, z], SPARK_SIZE * (1 - 0.4 * k), COLORS.spark, alpha);
    }
  }
}
