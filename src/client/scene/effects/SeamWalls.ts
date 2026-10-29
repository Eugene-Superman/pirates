import { Container, Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup, type TextureSource } from 'pixi.js';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { loadFoam, rgb } from './foam';

const COLORS = {
  deep: 0x0b3a57, // the wall's water low down, as deep as the storm at its foot
  body: 0x1f6f8f, // higher up
  lit: 0x4fb8c4, // the light coming through it where it thins under the crest
  sky: 0xcfe3ec, // the sky caught on its ripples
  spray: 0xeaf3f5, // whitewater and the spray blowing off its crest
};
// World units: how high the wall stands over the water, and how much its crest rises and falls, two swells along it
// (their lengths and radians a second); how long a column of its strip is along the edge
const WALL = { height: 200, swells: [0.12, 0.07], lengths: [330, 140], speeds: [0.55, -1.1], column: 100 } as const;
// Its face: the sea's ripples running up it, two layers (world units a copy of the map spans across and up, and world
// units a second it rises); streams of foam torn up it, its foam's streaks laid upright; whitewater at its foot,
// churning along it
const WAVES = [
  { across: 320, up: 90, rise: 34 },
  { across: 190, up: 60, rise: 21 },
] as const;
const STREAMS = { across: 320, up: 480, rise: 55 } as const;
const FOOT = { across: 70, up: 45, rise: 12 } as const;
// A wall between the camera and the ship lets it be seen: pixels round the ship's middle it clears (at the default
// zoom, scaled with it), and how much of the wall is left there
const CLEAR = { radius: 150, zoom: 1.4, left: 0.25 } as const;
// How much of the sea behind it a wall hides: one behind the sea, and one in front of it, a curtain of water the sea
// is seen through
const OPACITY = { back: 0.97, front: 0.7 } as const;
const VISIBLE = 2400; // world units from the camera's focus beyond which an edge's wall isn't drawn

// The wall's vertices carry their screen position and their place on it: along the edge and up (world units), and the
// crest's height there; the light on it is worked out per pixel from them
const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec3 aWall;

out vec3 vWall;
out vec2 vScreen;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWall = aWall;
  vScreen = aPosition;
}
`;

const FRAGMENT = /* glsl */ `
in vec3 vWall;
in vec2 vScreen;

out vec4 finalColor;

uniform sampler2D uRipples; // the sea's ripples: their slope (RG) and crests (B)
uniform sampler2D uFoamMap; // the foam: lace (R), patches (G), streaks along its x (B)
uniform vec4 uWave1;  // a layer on its face: 1 / a copy's span across and up, and the copies it has risen (w)
uniform vec4 uWave2;
uniform vec4 uStreams;
uniform vec4 uFoot;
uniform vec3 uDeep;
uniform vec3 uBody;
uniform vec3 uLit;
uniform vec3 uSky;
uniform vec3 uSpray;
uniform vec4 uClear;    // the ship's middle on the screen (pixels), how far round it the wall clears, how much is left
uniform float uOpacity; // how much of the sea behind it the wall hides

vec3 ripples(vec4 layer, float offset) {
  return texture(uRipples, vec2(vWall.x * layer.x + offset, vWall.y * layer.y - layer.w)).rgb;
}

void main() {
  float h = clamp(vWall.y / vWall.z, 0.0, 1.0);
  vec3 w1 = ripples(uWave1, 0.0);
  vec3 w2 = ripples(uWave2, 0.37);
  vec2 slope = (w1.rg * 2.0 - 1.0) * 0.6 + (w2.rg * 2.0 - 1.0) * 0.4;
  float crest = w1.b * 0.55 + w2.b * 0.45;
  // Deep water low down, the light coming through it higher, where it thins under the crest
  vec3 color = mix(uDeep, uBody, smoothstep(0.0, 0.8, h));
  color = mix(color, uLit, smoothstep(0.5, 0.95, h) * 0.55);
  // Its ripples lit from above and the side, their crests lighter, the sky caught on those turned up
  color *= 0.75 + 0.5 * clamp(0.5 + 0.6 * slope.y + 0.3 * slope.x, 0.0, 1.0);
  color = mix(color, uLit, smoothstep(0.55, 0.95, crest) * 0.3);
  color = mix(color, uSky, pow(clamp(0.5 + 0.5 * slope.y, 0.0, 1.0), 6.0) * 0.4);
  // Streams of foam torn up it from its foot, few, fading as they rise; whitewater churning at its foot
  float streams = texture(uFoamMap, vec2(vWall.y * uStreams.y - uStreams.w, vWall.x * uStreams.x)).b;
  vec4 churn = texture(uFoamMap, vec2(vWall.x * uFoot.x + uFoot.w, vWall.y * uFoot.y));
  float torn = smoothstep(0.66, 0.95, streams) * (1.0 - 0.75 * h) * 0.35;
  float foot = (1.0 - smoothstep(0.0, 0.2, h + (churn.g - 0.5) * 0.12)) * smoothstep(0.2, 0.55, churn.r);
  color = mix(color, uSpray, max(torn, foot));
  // Its crest a lip of white water, torn into spray along its top, ragged, blowing off into nothing
  float ragged = h + (churn.g - 0.5) * 0.12 + (w1.b - 0.5) * 0.16;
  color = mix(color, uSpray, smoothstep(0.7, 0.86, ragged));
  float alpha = (1.0 - smoothstep(0.9, 1.06, ragged)) * uOpacity;
  // A wall in front of the ship lets it be seen through
  if (uClear.z > 0.0) {
    alpha *= mix(uClear.w, 1.0, smoothstep(0.55, 1.0, distance(vScreen, uClear.xy) / uClear.z));
  }
  finalColor = vec4(color * alpha, alpha);
}
`;

/** One edge of the sea's map: where its wall starts, the way along it, and the way out of the sea */
interface Edge {
  readonly from: readonly [number, number];
  readonly along: readonly [number, number];
  readonly out: readonly [number, number];
  readonly length: number;
}

const EDGES: readonly Edge[] = [
  { from: [0, 0], along: [1, 0], out: [0, -1], length: WORLD_WIDTH },
  { from: [WORLD_WIDTH, 0], along: [0, 1], out: [1, 0], length: WORLD_HEIGHT },
  { from: [0, WORLD_HEIGHT], along: [1, 0], out: [0, 1], length: WORLD_WIDTH },
  { from: [0, 0], along: [0, 1], out: [-1, 0], length: WORLD_HEIGHT },
];

interface Wall {
  readonly edge: Edge;
  readonly mesh: Mesh<Geometry, Shader>;
  readonly shader: Shader;
  readonly uniforms: ReturnType<typeof wallUniforms>['uniforms'];
  readonly columns: number;
}

function vec3(color: number) {
  return { value: new Float32Array(rgb(color)), type: 'vec3<f32>' as const };
}

function vec4() {
  return { value: new Float32Array(4), type: 'vec4<f32>' as const };
}

function wallUniforms() {
  return new UniformGroup({
    uWave1: vec4(),
    uWave2: vec4(),
    uStreams: vec4(),
    uFoot: vec4(),
    uDeep: vec3(COLORS.deep),
    uBody: vec3(COLORS.body),
    uLit: vec3(COLORS.lit),
    uSky: vec3(COLORS.sky),
    uSpray: vec3(COLORS.spray),
    uClear: vec4(),
    uOpacity: { value: 1, type: 'f32' as const },
  });
}

/** A layer of the wall's face as the shader takes it: its tiles and how far it has risen (or drifted, `along`) */
function layer(target: Float32Array, of: { across: number; up: number; rise: number }, time: number, along = false) {
  // Kept to whole copies: a float of many seconds would lose the precision a smooth flow needs
  const moved = ((time * of.rise) / (along ? of.across : of.up)) % 1;
  target.set([1 / of.across, 1 / of.up, 0, moved]);
}

/**
 * The Seams (docs/story.md: walls of storm between the seas) at the sea's map's edges: a wall of water standing over
 * the sea along each, the sea's own ripples running up its face and the light coming through it under its crest,
 * streams of foam torn up it, whitewater churning at its foot and its crest blowing off into spray, rising and falling
 * in swells along it; the storm in the water at its foot is the sea's shader's. Meshes of their own, one shader: the
 * walls the camera looks towards in `back`, under everything on the water, those between it and the sea in `front`,
 * over it, a curtain the sea is seen through, clearer round the player's ship. Hidden until the foam and the sea's
 * ripples have loaded
 */
export class SeamWalls {
  readonly back = new Container();
  readonly front = new Container();
  private readonly walls: Wall[];
  private foam: TextureSource | null = null;
  private ripples: TextureSource | null = null;

  constructor() {
    const empty = Texture.WHITE.source;
    this.walls = EDGES.map((edge) => {
      const columns = Math.ceil(edge.length / WALL.column) + 1;
      const indices: number[] = [];
      for (let i = 0; i + 1 < columns; i++) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
      const geometry = new Geometry({
        attributes: {
          aPosition: { buffer: new Float32Array(columns * 4), format: 'float32x2' },
          aWall: { buffer: new Float32Array(columns * 6), format: 'float32x3' },
        },
        indexBuffer: new Uint32Array(indices),
      });
      const group = wallUniforms();
      const shader = new Shader({
        // The ripples and foam are sampled along the edge, up to the map's width in world units: a medium float
        // (16 bits on most phones) would step them in blocks over the wall's far half
        glProgram: new GlProgram({
          name: 'seam-wall',
          vertex: VERTEX,
          fragment: FRAGMENT,
          preferredFragmentPrecision: 'highp',
        }),
        resources: { wallUniforms: group, uFoamMap: empty, uRipples: empty },
      });
      const mesh = new Mesh({ geometry, shader });
      mesh.visible = false;
      return { edge, mesh, shader, uniforms: group.uniforms, columns };
    });
    loadFoam()
      .then((foam) => {
        this.foam = foam;
        for (const wall of this.walls) wall.shader.resources.uFoamMap = foam;
      })
      .catch((error) => console.warn("The Seam's foam failed to load", error));
  }

  /**
   * ship: the player's ship, whose middle a wall in front of it lets be seen; ripples: the sea's map of them, once
   * loaded (seaSurface.ts). The camera must be set for this frame
   */
  update(camera: Camera3D, ship: { x: number; y: number }, time: number, ripples: Texture | undefined) {
    if (ripples && ripples.source !== this.ripples) {
      this.ripples = ripples.source;
      for (const wall of this.walls) wall.shader.resources.uRipples = ripples.source;
    }
    const at = camera.project(ship.x, ship.y, 0);
    const clear = CLEAR.radius * (camera.zoom / CLEAR.zoom);
    for (const wall of this.walls) {
      const { edge, mesh, uniforms } = wall;
      const [fx, fy] = edge.from;
      const [ox, oy] = edge.out;
      // How far the camera's focus is in from the edge
      const inside = -((camera.focusX - fx) * ox + (camera.focusY - fy) * oy);
      mesh.visible = this.foam !== null && this.ripples !== null && inside < VISIBLE;
      if (!mesh.visible) continue;
      // The camera looks towards it: it stands behind the sea; else between the camera and the sea
      const behind = ox * camera.fwdX + oy * camera.fwdY > 0;
      const parent = behind ? this.back : this.front;
      if (mesh.parent !== parent) parent.addChild(mesh);
      this.place(wall, camera, time);
      layer(uniforms.uWave1, WAVES[0], time);
      layer(uniforms.uWave2, WAVES[1], time);
      layer(uniforms.uStreams, STREAMS, time);
      layer(uniforms.uFoot, FOOT, time, true);
      uniforms.uClear.set([at.x, at.y, behind ? 0 : clear, CLEAR.left]);
      uniforms.uOpacity = behind ? OPACITY.back : OPACITY.front;
    }
  }

  /** The wall's strip on the screen: a column every so far along its edge, from the water up to its crest there */
  private place({ edge, mesh, columns }: Wall, camera: Camera3D, time: number) {
    const positions = mesh.geometry.getBuffer('aPosition');
    const places = mesh.geometry.getBuffer('aWall');
    const [fx, fy] = edge.from;
    const [ax, ay] = edge.along;
    for (let i = 0; i < columns; i++) {
      const s = Math.min(edge.length, i * WALL.column);
      const x = fx + ax * s;
      const y = fy + ay * s;
      let top = WALL.height;
      for (let k = 0; k < WALL.swells.length; k++) {
        top += WALL.height * WALL.swells[k] * Math.sin(s / WALL.lengths[k] + time * WALL.speeds[k] + k * 1.7);
      }
      const foot = camera.project(x, y, 0);
      const crest = camera.project(x, y, top);
      positions.data.set([foot.x, foot.y, crest.x, crest.y], i * 4);
      places.data.set([s, 0, top, s, top, top], i * 6);
    }
    positions.update();
    places.update();
  }
}
