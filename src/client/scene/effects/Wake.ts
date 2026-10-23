import { Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup } from 'pixi.js';
import type { Body, Island } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { LIGHT } from '../../render/Painter3D';
import { FOAM_COLORS, FOAM_GLSL, FOAM_TILE, loadFoam, rgb, smoothstep, waterShare } from './foam';

const SAMPLE_SPACING = 4; // world units a body moves between two points of its trail
const MAX_JUMP = 40; // world units: a body that moved farther between two points jumped, and its trail starts anew
const MIN_SPEED = 6; // world units per second: slower than this, a body leaves no wake
const FULL_SPEED = 100; // world units per second: the wake is at its strongest from this speed on
const TRAIL_POINTS = 160; // per body: WASH_LIFETIME at top speed, with room to spare
const WASH_LIFETIME = 4; // seconds the churned water behind the stern lasts
const ARM_LIFETIME = 3.2; // seconds a bow wave lasts
const WASH_WIDTH = 1; // half width of the wash at the stern, in half beams
const WASH_SPREAD = 4.5; // world units per second the wash widens on each side
// The bow waves run off at this angle to the course: the Kelvin wake, 19.5° behind any ship in deep water
const KELVIN_ANGLE = 19.5; // degrees
const BOW_PUSH = 1.1; // the bow throws the water this many half beams aside…
const BOW_LENGTH = 7; // …over about this many world units behind the stem
const ARM_WIDTH = 2.2; // half width of a bow wave's band as it leaves the bow, world units
const ARM_SPREAD = 2.6; // world units per second it widens on each side
const ARM_DRIFT = 6; // world units per second bow waves keep running off at after the ship has stopped
// Its crests: how far apart, and at what angle to the course they run off (35° in the Kelvin wake)
const CREST_SPACING = 7; // world units
const CREST_ANGLE = 35; // degrees
// Shares of the viewer's view range: a wake fades out between them, into the fog of war
const VIEW_EDGE = [1, 1.1] as const;

const TAN_KELVIN = Math.tan((KELVIN_ANGLE * Math.PI) / 180);
const CREST_COS = Math.cos((CREST_ANGLE * Math.PI) / 180);
// The texture coordinates along the course jump by whole tiles (see draw): the crests must repeat over a tile too,
// or they would jump with them
const CREST_WAVELENGTH = (FOAM_TILE * CREST_COS) / Math.max(1, Math.round((FOAM_TILE * CREST_COS) / CREST_SPACING));
const KIND_WASH = 0;
const KIND_ARM = 1;

const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUv;
in vec4 aShape;
in vec2 aOut;

out vec2 vUv;
out vec4 vShape;
out vec2 vOut;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUv = aUv;
  vShape = aShape;
  vOut = aOut;
}
`;

// Foam is dissolved by a threshold over the texture: the less foam, the higher the threshold, so thick foam thins out
// to a lace and then to threads instead of fading evenly. Colors are premultiplied
const FRAGMENT = /* glsl */ `
in vec2 vUv;    // foam texture: along the course, and outwards from it (tiles)
in vec4 vShape; // across the ribbon (-1..1), age (0..1), strength (0..1), kind (0 wash; 1 or -1 bow wave, by side)
in vec2 vOut;   // bow waves: the direction they run off in on the water, as long as the crest's half width

out vec4 finalColor;

uniform sampler2D uFoam;
uniform vec3 uSun;
uniform vec3 uView;
uniform vec3 uFoamColor;
uniform vec3 uChurnColor;
uniform vec4 uWave; // bow waves: tile (world units), wavelength, cos and sin of the angle the crests run off at
${FOAM_GLSL}
void main() {
  vec3 tex = texture(uFoam, vUv).rgb;
  float across = vShape.x;
  float age = vShape.y;
  float strength = vShape.z;
  vec4 color;
  if (abs(vShape.w) < 0.5) {
    // The wash behind the stern: churned, lighter water with foam, thickest in the middle and right behind the ship.
    // Its edges are frayed by the streaks, so it isn't a painted band
    float edge = abs(across) + (tex.b - 0.5) * 0.45 + (tex.g - 0.5) * 0.25;
    float core = 1.0 - smoothstep(0.05, 0.95, edge);
    float amount = strength * core * pow(1.0 - age, 2.2);
    // Young foam lies in patches drawn out along the course; old foam is a lace
    float pattern = mix(tex.r, 0.45 * tex.g + 0.55 * tex.b, clamp(amount * 1.6, 0.0, 1.0));
    float foam = dissolve(pattern, amount, 0.35) * 0.85;
    float churn = strength * (1.0 - smoothstep(0.0, 1.05, edge)) * pow(1.0 - age, 1.1) * (0.45 + 0.3 * tex.g);
    color = over(vec4(uFoamColor, 1.0) * foam, vec4(uChurnColor, 1.0) * churn);
  } else {
    // A bow wave: a band of short crests running off outwards at an angle (the Kelvin wake's "feathers"), lit on the
    // sides facing the sun and the sky, shaded on the others
    float side = sign(vShape.w);
    float halfWidth = length(vOut);
    vec2 outward = vOut / halfWidth;
    vec2 course = side * vec2(outward.y, -outward.x);
    float s = vUv.x * uWave.x;          // along the course, world units
    float a = across * halfWidth;       // across the band, world units, outwards positive
    float o = abs(vUv.y) * uWave.x;     // from the course line, world units
    float k = 6.2831853 / uWave.y;
    // Crests of uneven height, a little wavy: real ones are never a row of equal dashes
    float phase = (s * uWave.z + o * uWave.w) * k + (tex.b - 0.5) * 2.5;
    float envelope = exp(-across * across * 2.2) * (0.25 + 1.1 * tex.g);
    float crest = 0.5 + 0.5 * cos(phase);
    float dEnvelope = -4.4 * across / halfWidth * envelope;
    float dCrestS = -0.5 * sin(phase) * k * uWave.z;
    float dCrestA = -0.5 * sin(phase) * k * uWave.w;
    vec2 gradient = course * (envelope * dCrestS) + outward * (dEnvelope * crest + envelope * dCrestA);
    float fade = strength * pow(1.0 - age, 1.5);
    vec3 n = normalize(vec3(-gradient * 1.4 * fade, 1.0));
    float shade = (dot(n, uSun) - uSun.z) * 0.8 + (fresnel(n) - fresnel(vec3(0.0, 0.0, 1.0))) * 2.2;
    color = shade > 0.0 ? vec4(vec3(shade), shade) : vec4(0.0, 0.0, 0.0, -shade * 0.6);
    // Foam on the crests near the bow, breaking up as the wave runs off
    float amount = fade * envelope * (0.55 + 0.45 * crest) * (1.0 - smoothstep(0.0, 0.22, age)) * 0.65;
    float foam = dissolve(mix(tex.r, tex.g, 0.4), amount, 0.3);
    color = over(vec4(uFoamColor, 1.0) * foam * 0.85, color);
  }
  finalColor = color;
}
`;

function vec3(value: readonly number[] = [0, 0, 0]) {
  return { value: new Float32Array(value), type: 'vec3<f32>' as const };
}

/** A bigger array with the old one's contents at its start */
function resized<T extends Float32Array | Uint32Array>(old: T, array: T) {
  array.set(old.subarray(0, Math.min(old.length, array.length)));
  return array;
}

/** Where a body was: its position and heading, how fast it went, when, and how far along its course */
interface WakePoint {
  x: number;
  y: number;
  cos: number;
  sin: number;
  speed: number;
  born: number;
  along: number;
  /** Whether the ribbon joins it to the point before (older); not after a jump */
  joined: boolean;
}

function newPoint(): WakePoint {
  return { x: 0, y: 0, cos: 1, sin: 0, speed: 0, born: -Infinity, along: 0, joined: false };
}

/** The course of one body: a ring of points, newest at `head` */
class Trail {
  readonly points: WakePoint[] = Array.from({ length: TRAIL_POINTS }, newPoint);
  /** Where the body is now, joined to the newest point: so the wake reaches the hull */
  readonly live = newPoint();
  head = 0;
  count = 0;
  /** World units sailed, for the foam's texture coordinates along the course */
  along = 0;
  /** The body while it is in the game; null once it is gone, and the trail only fades */
  body: Body | null = null;

  record(body: Body, time: number) {
    const speed = Math.hypot(body.vx, body.vy);
    const newest = this.count > 0 ? this.points[this.head] : null;
    const moved = newest ? Math.hypot(body.x - newest.x, body.y - newest.y) : Infinity;
    const cos = Math.cos(body.heading);
    const sin = Math.sin(body.heading);
    const live = this.live;
    live.x = body.x;
    live.y = body.y;
    live.cos = cos;
    live.sin = sin;
    live.speed = speed;
    live.born = time;
    live.joined = moved <= MAX_JUMP;
    live.along = this.along + (live.joined ? moved : 0);
    if (speed < MIN_SPEED || moved < SAMPLE_SPACING) return;

    this.head = (this.head + 1) % TRAIL_POINTS;
    this.count = Math.min(this.count + 1, TRAIL_POINTS);
    const p = this.points[this.head];
    Object.assign(p, live);
    this.along = live.along;
  }

  /** Drops the points older than every part of the wake */
  expire(time: number) {
    const oldest = time - Math.max(WASH_LIFETIME, ARM_LIFETIME);
    while (this.count > 0 && this.points[(this.head - this.count + 1 + TRAIL_POINTS) % TRAIL_POINTS].born < oldest) {
      this.count--;
    }
  }

  /** The k-th point from the newest: 0 is the live one while the body sails, then the recorded ones */
  point(k: number) {
    return this.points[(this.head - k + TRAIL_POINTS) % TRAIL_POINTS];
  }
}

/** Who sees the wakes: they fade out into the fog of war beyond this ship's view */
export interface WakeViewer {
  readonly x: number;
  readonly y: number;
  readonly viewRange: number;
}

/**
 * Wakes of everything that sails (ships, the target boat): per body a trail of where it has been, drawn as ribbons of
 * one mesh by its own shader. Behind the stern, churned water with foam that spreads and dissolves into a lace; from
 * the bow, two waves running off at the Kelvin angle, lit and shaded like real crests. The trail follows the course,
 * so the wake curves with every turn and stays where the water was disturbed. WebGL only (Pixi's default renderer)
 */
export class Wake {
  readonly mesh: Mesh<Geometry, Shader>;
  private readonly trails = new Map<Body, Trail>();
  private readonly uniforms;
  private capacity = 0;
  private positions = new Float32Array(0);
  private uvs = new Float32Array(0);
  private shapes = new Float32Array(0);
  private outs = new Float32Array(0);
  private indices = new Uint32Array(0);
  private vertexCount = 0;
  private indexCount = 0;
  /** Index of the first vertex of the strip being built, −1 when none */
  private stripStart = -1;
  private loaded = false;
  /** Islands of this frame's draw */
  private islands: readonly Island[] = [];

  constructor() {
    this.allocate(4096);
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.positions, format: 'float32x2' },
        aUv: { buffer: this.uvs, format: 'float32x2' },
        aShape: { buffer: this.shapes, format: 'float32x4' },
        aOut: { buffer: this.outs, format: 'float32x2' },
      },
      indexBuffer: this.indices,
    });
    const group = new UniformGroup({
      uSun: vec3(LIGHT),
      uView: vec3(),
      uFoamColor: vec3(rgb(FOAM_COLORS.foam)),
      uChurnColor: vec3(rgb(FOAM_COLORS.churn)),
      uWave: {
        value: new Float32Array([FOAM_TILE, CREST_WAVELENGTH, CREST_COS, Math.sin((CREST_ANGLE * Math.PI) / 180)]),
        type: 'vec4<f32>',
      },
    });
    this.uniforms = group.uniforms;
    const shader = new Shader({
      // Texture coordinates along a long course need more than a medium float to stay sharp
      glProgram: new GlProgram({
        name: 'wake',
        vertex: VERTEX,
        fragment: FRAGMENT,
        preferredFragmentPrecision: 'highp',
      }),
      resources: { wakeUniforms: group, uFoam: Texture.WHITE.source },
    });
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.visible = false;
    loadFoam()
      .then((foam) => {
        shader.resources.uFoam = foam;
        this.loaded = true;
      })
      .catch((error) => console.warn('Foam texture failed to load', error));
  }

  /** Records where every body is. A body missing from the list is gone: its wake fades where it was */
  update(time: number, bodies: readonly Body[]) {
    for (const trail of this.trails.values()) trail.body = null;
    for (const body of bodies) {
      let trail = this.trails.get(body);
      if (!trail) {
        trail = new Trail();
        this.trails.set(body, trail);
      }
      trail.body = body;
      trail.record(body, time);
    }
    for (const [body, trail] of this.trails) {
      trail.expire(time);
      if (!trail.body && trail.count === 0) this.trails.delete(body);
    }
  }

  /** Builds the mesh for this frame; the camera must already be set. Wakes fade out at the islands' coasts */
  draw(camera: Camera3D, viewer: WakeViewer, time: number, islands: readonly Island[]) {
    this.islands = islands;
    this.vertexCount = 0;
    this.indexCount = 0;
    const view = [-camera.fwdX * camera.cosP, -camera.fwdY * camera.cosP, camera.sinP] as const;
    this.uniforms.uView.set(view);

    for (const [body, trail] of this.trails) {
      const sailing = trail.body !== null && trail.live.speed >= MIN_SPEED;
      const first = sailing ? 0 : 1;
      const points = trail.count + 1;
      // Texture coordinates along the course start from a whole number of tiles near its newest point, so they stay
      // small: far from 0 a float loses the precision to tell the texture's pixels apart
      const origin = Math.floor(trail.along / FOAM_TILE) * FOAM_TILE;
      const at = (k: number) => (k === 0 ? trail.live : trail.point(k - 1));
      const { hull } = body;
      const now = trail.body ? trail.live.along : trail.along;

      // Bow waves first: the wash is laid over them where they meet
      for (let side = -1; side <= 1; side += 2) {
        this.stripStart = -1;
        for (let k = first; k < points; k++) {
          const p = at(k);
          const age = time - p.born;
          if (age > ARM_LIFETIME) break;
          const strength = this.strength(p, viewer);
          // How far the bow has gone since, rather than time: when the ship stops, its bow waves stop spreading (but
          // for a slow drift) instead of standing out sideways from where it slowed down
          const sailed = Math.max(0, now - p.along) + ARM_DRIFT * age;
          const off = hull.halfBeam * BOW_PUSH * (1 - Math.exp(-sailed / BOW_LENGTH)) + sailed * TAN_KELVIN;
          const outX = -p.sin * side;
          const outY = p.cos * side;
          const x = p.x + p.cos * hull.bow + outX * off;
          const y = p.y + p.sin * hull.bow + outY * off;
          const w = ARM_WIDTH + ARM_SPREAD * age;
          const u = (p.along - origin) / FOAM_TILE;
          // The texture's second coordinate runs outwards on both sides, so the two waves mirror each other
          const v0 = (side * (off - w)) / FOAM_TILE;
          const v1 = (side * (off + w)) / FOAM_TILE;
          this.pair(camera, x, y, outX * w, outY * w, u, v0, v1, age / ARM_LIFETIME, strength, side * KIND_ARM);
          if (!p.joined) this.stripStart = -1;
        }
      }

      // The wash behind the stern
      this.stripStart = -1;
      for (let k = first; k < points; k++) {
        const p = at(k);
        const age = time - p.born;
        if (age > WASH_LIFETIME) break;
        const strength = this.strength(p, viewer);
        const half = hull.halfBeam * WASH_WIDTH + WASH_SPREAD * age;
        const sideX = -p.sin * half;
        const sideY = p.cos * half;
        const x = p.x + p.cos * hull.stern;
        const y = p.y + p.sin * hull.stern;
        const u = (p.along - origin) / FOAM_TILE;
        const v = half / FOAM_TILE;
        this.pair(camera, x, y, sideX, sideY, u, -v, v, age / WASH_LIFETIME, strength, KIND_WASH);
        if (!p.joined) this.stripStart = -1;
      }
    }

    // Only the part of the buffers this frame filled goes to the GPU, in bytes
    const geometry = this.mesh.geometry;
    const floats = this.vertexCount * Float32Array.BYTES_PER_ELEMENT;
    geometry.getBuffer('aPosition').update(floats * 2);
    geometry.getBuffer('aUv').update(floats * 2);
    geometry.getBuffer('aShape').update(floats * 4);
    geometry.getBuffer('aOut').update(floats * 2);
    geometry.indexBuffer.update(this.indexCount * Uint32Array.BYTES_PER_ELEMENT);
    geometry.indexCount = this.indexCount;
    // An index count of 0 would draw the whole buffer
    this.mesh.visible = this.loaded && this.indexCount > 0;
  }

  /** How strong the wake is at a point: by the speed it was made at, fading out into the fog beyond the viewer's view */
  private strength(p: WakePoint, viewer: WakeViewer) {
    const bySpeed = Math.min(Math.max((p.speed - MIN_SPEED) / (FULL_SPEED - MIN_SPEED), 0), 1);
    const distance = Math.hypot(p.x - viewer.x, p.y - viewer.y);
    return bySpeed * (1 - smoothstep(VIEW_EDGE[0] * viewer.viewRange, VIEW_EDGE[1] * viewer.viewRange, distance));
  }

  /**
   * Adds one cross-section of a ribbon: two vertices on the water, (x, y) ∓ (halfX, halfY), joined to the previous
   * cross-section of the strip. The half vector goes to the shader too: for a bow wave it is the way the wave runs off.
   * Runs for every point of every trail each frame, so it writes straight into the buffers and makes no objects
   */
  private pair(
    camera: Camera3D,
    x: number,
    y: number,
    halfX: number,
    halfY: number,
    u: number,
    v0: number,
    v1: number,
    age: number,
    strength: number,
    kind: number,
  ) {
    if (this.vertexCount + 2 > this.capacity) this.grow();
    const i = this.vertexCount;
    this.vertex(camera, i, x - halfX, y - halfY, u, v0, -1, age, strength, kind, halfX, halfY);
    this.vertex(camera, i + 1, x + halfX, y + halfY, u, v1, 1, age, strength, kind, halfX, halfY);
    if (this.stripStart >= 0) {
      const a = i - 2;
      const n = this.indexCount;
      const indices = this.indices;
      indices[n] = a;
      indices[n + 1] = a + 1;
      indices[n + 2] = i;
      indices[n + 3] = a + 1;
      indices[n + 4] = i + 1;
      indices[n + 5] = i;
      this.indexCount += 6;
    } else {
      this.stripStart = i;
    }
    this.vertexCount += 2;
  }

  private vertex(
    camera: Camera3D,
    i: number,
    x: number,
    y: number,
    u: number,
    v: number,
    across: number,
    age: number,
    strength: number,
    kind: number,
    outX: number,
    outY: number,
  ) {
    // The camera's projection of a point on the water (z = 0), without making an object for it
    const dx = x - camera.focusX;
    const dy = y - camera.focusY;
    this.positions[i * 2] = camera.originX + (dx * camera.rightX + dy * camera.rightY) * camera.zoom;
    this.positions[i * 2 + 1] = camera.originY - (dx * camera.fwdX + dy * camera.fwdY) * camera.sinP * camera.zoom;
    this.uvs[i * 2] = u;
    this.uvs[i * 2 + 1] = v;
    const s = i * 4;
    this.shapes[s] = across;
    this.shapes[s + 1] = age;
    this.shapes[s + 2] = strength > 0 ? strength * waterShare(x, y, this.islands) : 0;
    this.shapes[s + 3] = kind;
    this.outs[i * 2] = outX;
    this.outs[i * 2 + 1] = outY;
  }

  private allocate(vertices: number) {
    this.capacity = vertices;
    this.positions = resized(this.positions, new Float32Array(vertices * 2));
    this.uvs = resized(this.uvs, new Float32Array(vertices * 2));
    this.shapes = resized(this.shapes, new Float32Array(vertices * 4));
    this.outs = resized(this.outs, new Float32Array(vertices * 2));
    this.indices = resized(this.indices, new Uint32Array(vertices * 3));
  }

  /** More bodies than the buffers were made for: twice the room, handed to the geometry */
  private grow() {
    this.allocate(this.capacity * 2);
    const geometry = this.mesh.geometry;
    geometry.getBuffer('aPosition').data = this.positions;
    geometry.getBuffer('aUv').data = this.uvs;
    geometry.getBuffer('aShape').data = this.shapes;
    geometry.getBuffer('aOut').data = this.outs;
    geometry.indexBuffer.data = this.indices;
  }
}
