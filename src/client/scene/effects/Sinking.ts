import { Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup } from 'pixi.js';
import type { DamageStage, Island, Ship } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { LIGHT } from '../../render/Painter3D';
import type { SinkPose } from '../models/ShipSprite';
import { FOAM_COLORS, FOAM_GLSL, FOAM_TILE, loadFoam, rgb, smoothstep, waterShare } from './foam';

const SINK_TIME = 7; // seconds from the last hit to the ship vanishing
const SETTLE_TIME = 1; // the ship lists for a moment before it starts going down
const SINK_DEPTH = 1.25; // how far the ship goes down, in ship radii: enough to hide the whole wreck
const TILT = 0.24; // radians of roll at the end
const WOBBLE = 0.03; // radians, the ship rocks while it goes down
const FADE_FROM = 0.72; // share of SINK_TIME after which what is left of the ship fades out
const WATER_TIME = 6; // seconds the disturbed water lasts after the ship is gone
// Ring waves sent out by the hull as it settles and goes down, one every RING_INTERVAL from RING_START
const RINGS = 10; // the shader's loop runs over this many
const RING_START = 0.8; // seconds
const RING_INTERVAL = 0.75; // seconds
const RING_SPEED = 13; // world units per second
const RING_REACH = 170; // world units from the hull: the rings have died out before they get farther
// The churned water round the hull: how far it reaches from the hull, world units, once the ship is gone, and how fast
// it keeps spreading after that
const CHURN_REACH = 20;
const CHURN_SPREAD = 2.5; // world units per second
const BUBBLE_CELL = 3.2; // world units: at most one bubble in a square this big at a time
// The water is a grid of this many squares a side: its corners know how far they are from land, to fade out at a coast
const GRID = 16;

const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aWorld;
in float aWater;

out vec2 vFromShip;
out float vWater;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

uniform vec2 uCenter;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vFromShip = aWorld - uCenter;
  vWater = aWater;
}
`;

// Every pixel knows where it is from the ship, and works out the rest: its distance from the hull, the ring waves
// passing it (lit and shaded like the bow waves of the wake), the churned water and foam, and the bubbles bursting.
// Colors are premultiplied
const FRAGMENT = /* glsl */ `
#define RINGS ${RINGS}
in vec2 vFromShip;
in float vWater; // 0 on land, 1 out on the water

out vec4 finalColor;

uniform sampler2D uFoam;
uniform vec3 uSun;
uniform vec3 uView;
uniform vec3 uFoamColor;
uniform vec3 uChurnColor;
uniform vec2 uAxis;   // cos and sin of the hull's heading
uniform vec3 uHull;   // the capsule: its middle line from x to y along the heading, half beam
uniform vec4 uTime;   // seconds since the ship was wrecked, sink time, how strong the churn is, how far it reaches
uniform vec4 uRings;  // first ring, interval, speed, 1 / foam tile
uniform float uBubbleCell;
${FOAM_GLSL}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float t = uTime.x;
  float sinkTime = uTime.y;
  // Into the hull's frame, then the distance from its outline (negative inside) and the way out from it
  vec2 q = vec2(dot(vFromShip, uAxis), dot(vFromShip, vec2(-uAxis.y, uAxis.x)));
  vec2 off = vec2(q.x - clamp(q.x, uHull.x, uHull.y), q.y);
  float lenOff = max(length(off), 0.001);
  float d = lenOff - uHull.z;
  vec2 outLocal = off / lenOff;
  vec2 outward = outLocal.x * uAxis + outLocal.y * vec2(-uAxis.y, uAxis.x);

  // A slow swirl as the wreck goes under: the foam turns round the spot
  float swirl = 1.6 * smoothstep(sinkTime - 2.0, sinkTime + 1.0, t) * exp(-max(d, 0.0) / 18.0)
    * (1.0 - smoothstep(sinkTime + 2.0, sinkTime + 6.0, t));
  float cs = cos(swirl);
  float sn = sin(swirl);
  vec2 turned = vec2(cs * vFromShip.x - sn * vFromShip.y, sn * vFromShip.x + cs * vFromShip.y);
  vec3 tex = texture(uFoam, turned * uRings.w).rgb;

  // Ring waves: each a short train of a crest and troughs, sent out from the hull, weakening as it spreads
  float slope = 0.0;
  for (int k = 0; k < RINGS; k++) {
    float born = uRings.x + float(k) * uRings.y;
    float age = t - born;
    if (age <= 0.0) continue;
    // The strongest when the hull plunges, just before it is gone
    float lead = (born - sinkTime + 0.6) / 1.6;
    float strength = 0.35 + 0.9 * exp(-lead * lead);
    float width = 2.2 + age * 1.1;
    float x = (d - age * uRings.z) / width;
    float envelope = exp(-x * x) * strength * exp(-age * 0.5);
    slope += envelope * (-2.0 * x * cos(2.6 * x) - 2.6 * sin(2.6 * x)) / width;
  }
  slope *= 1.3 * (0.6 + 0.8 * tex.g);
  vec3 n = normalize(vec3(-outward * slope, 1.0));
  float shade = (dot(n, uSun) - uSun.z) * 0.8 + (fresnel(n) - fresnel(vec3(0.0, 0.0, 1.0))) * 2.2;
  shade = clamp(shade, -0.3, 0.35);
  vec4 color = shade > 0.0 ? vec4(vec3(shade), shade) : vec4(0.0, 0.0, 0.0, -shade * 0.6);

  // Churned water and foam round the hull, spreading, then thinning out to a lace
  float churn = uTime.z;
  float reach = uTime.w;
  // Frayed by the foam's own patterns, so the churned water has no clean outline
  float edge = d + (tex.b - 0.5) * 7.0 + (tex.g - 0.5) * 9.0;
  float region = 1.0 - smoothstep(reach * 0.2, reach, edge);
  float amount = churn * region * (0.15 + 0.6 * tex.g);
  float foam = dissolve(mix(tex.r, 0.6 * tex.g + 0.4 * tex.b, clamp(amount * 1.4, 0.0, 1.0)), amount, 0.3) * 0.85;
  // A collar of foam right along the hull where the water climbs it
  float collar = churn * (1.0 - smoothstep(0.0, 2.5, abs(d - 0.5))) * step(t, sinkTime);
  foam = max(foam, dissolve(tex.r, collar * 0.8, 0.3));
  color = over(vec4(uChurnColor, 1.0) * churn * region * (0.35 + 0.25 * tex.g), color);
  color = over(vec4(uFoamColor, 1.0) * foam, color);

  // Bubbles of air coming up and bursting: one at most per cell, each with its own size and rhythm
  vec2 cellPos = vFromShip / uBubbleCell;
  vec2 cell = floor(cellPos);
  float h1 = hash(cell);
  float h2 = hash(cell + 17.3);
  float h3 = hash(cell + 41.9);
  float period = 0.6 + 0.9 * h2;
  float cycle = t / period + h1;
  float life = fract(cycle);
  float seed = hash(cell + floor(cycle) * 3.7);
  // More of them while the hull goes down, most as it disappears; only over the churned water
  float gulp = (t - sinkTime) / 1.5;
  float busy = churn * region * (0.25 + 0.55 * exp(-gulp * gulp));
  if (seed < busy) {
    vec2 centre = 0.25 + 0.5 * vec2(hash(cell + floor(cycle) + 5.1), hash(cell + floor(cycle) + 9.7));
    float radius = (0.12 + 0.2 * h3) * smoothstep(0.0, 0.7, life);
    float r = length(cellPos - cell - centre);
    float rim = 1.0 - smoothstep(0.0, 0.05, abs(r - radius));
    float pop = life < 0.85 ? 1.0 : 1.0 - (life - 0.85) / 0.15;
    float bubble = max(rim * 0.9, (1.0 - smoothstep(radius * 0.6, radius, r)) * 0.25) * pop;
    color = over(vec4(uFoamColor, 1.0) * bubble, color);
  }
  finalColor = color * vWater;
}
`;

// The sinking animation: client-only, started when the ship's damage stage becomes `sinking`.
// The game only knows the ship is wrecked; how it goes down, and what it does to the water, is up to the view
export class Sinking {
  readonly pose: SinkPose = { depth: 0, tilt: 0, alpha: 1 };
  /** The disturbed water round the wreck: a square on the water under the ship, drawn by its own shader */
  readonly water: Mesh<Geometry, Shader>;
  private readonly uniforms;
  private startTime: number | null = null;
  private elapsed = 0;
  private loaded = false;

  constructor() {
    const side = GRID + 1;
    const indices = new Uint32Array(GRID * GRID * 6);
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const a = row * side + col;
        indices.set([a, a + 1, a + side, a + 1, a + side + 1, a + side], (row * GRID + col) * 6);
      }
    }
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: new Float32Array(side * side * 2), format: 'float32x2' },
        aWorld: { buffer: new Float32Array(side * side * 2), format: 'float32x2' },
        aWater: { buffer: new Float32Array(side * side), format: 'float32' },
      },
      indexBuffer: indices,
    });
    const group = new UniformGroup({
      uCenter: { value: new Float32Array(2), type: 'vec2<f32>' },
      uSun: { value: new Float32Array(LIGHT), type: 'vec3<f32>' },
      uView: { value: new Float32Array(3), type: 'vec3<f32>' },
      uFoamColor: { value: new Float32Array(rgb(FOAM_COLORS.foam)), type: 'vec3<f32>' },
      uChurnColor: { value: new Float32Array(rgb(FOAM_COLORS.churn)), type: 'vec3<f32>' },
      uAxis: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
      uHull: { value: new Float32Array(3), type: 'vec3<f32>' },
      uTime: { value: new Float32Array(4), type: 'vec4<f32>' },
      uRings: {
        value: new Float32Array([RING_START, RING_INTERVAL, RING_SPEED, 1 / FOAM_TILE]),
        type: 'vec4<f32>',
      },
      uBubbleCell: { value: BUBBLE_CELL, type: 'f32' },
    });
    this.uniforms = group.uniforms;
    const shader = new Shader({
      // The bubbles' hash needs a full float
      glProgram: new GlProgram({
        name: 'sinking-water',
        vertex: VERTEX,
        fragment: FRAGMENT,
        preferredFragmentPrecision: 'highp',
      }),
      resources: { sinkUniforms: group, uFoam: Texture.WHITE.source },
    });
    this.water = new Mesh({ geometry, shader });
    this.water.visible = false;
    // The wake's foam
    loadFoam()
      .then((foam) => {
        shader.resources.uFoam = foam;
        this.loaded = true;
      })
      .catch((error) => console.warn('Foam texture failed to load', error));
  }

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

  /** Places the disturbed water round a sinking ship for this frame; the camera must already be set */
  drawWater(camera: Camera3D, ship: Ship, islands: readonly Island[]) {
    const t = this.elapsed;
    const active = this.startTime !== null && this.loaded && t < SINK_TIME + WATER_TIME;
    this.water.visible = active;
    if (!active) return;

    const u = this.uniforms;
    const cos = Math.cos(ship.rotation);
    const sin = Math.sin(ship.rotation);
    const { hull } = ship;
    u.uCenter.set([ship.x, ship.y]);
    u.uAxis.set([cos, sin]);
    // The capsule's middle line, as in physics/hull.ts: the hull's ends are round
    u.uHull.set([hull.stern + hull.halfBeam, hull.bow - hull.halfBeam, hull.halfBeam]);
    u.uView.set([-camera.fwdX * camera.cosP, -camera.fwdY * camera.cosP, camera.sinP]);
    // The churn builds up as the ship settles and goes down, and dies away after it is gone
    const churn = smoothstep(0.2, SETTLE_TIME * 2, t) * (1 - smoothstep(SINK_TIME, SINK_TIME + WATER_TIME, t));
    const reach = CHURN_REACH * smoothstep(0, SINK_TIME * 0.8, t) + CHURN_SPREAD * Math.max(0, t - SINK_TIME);
    u.uTime.set([t, SINK_TIME, churn, Math.max(reach, 1)]);

    // A square on the water big enough for the rings that are still alive
    const half = Math.max(hull.bow, -hull.stern) + Math.min(RING_REACH, RING_SPEED * Math.max(0, t - RING_START) + 20);
    const geometry = this.water.geometry;
    const positions = geometry.getBuffer('aPosition');
    const world = geometry.getBuffer('aWorld');
    const water = geometry.getBuffer('aWater');
    const side = GRID + 1;
    for (let row = 0; row < side; row++) {
      for (let col = 0; col < side; col++) {
        const i = row * side + col;
        const x = ship.x + (col / GRID) * 2 * half - half;
        const y = ship.y + (row / GRID) * 2 * half - half;
        const p = camera.project(x, y, 0);
        positions.data[i * 2] = p.x;
        positions.data[i * 2 + 1] = p.y;
        world.data[i * 2] = x;
        world.data[i * 2 + 1] = y;
        water.data[i] = waterShare(x, y, islands);
      }
    }
    positions.update();
    world.update();
    water.update();
  }
}
