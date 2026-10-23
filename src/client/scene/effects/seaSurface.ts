import { Assets, Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup } from 'pixi.js';
import type { Camera3D } from '../../render/Camera3D';
import { LIGHT } from '../../render/Painter3D';
import { SEA_MAPS, type SeaMap, type SurfaceLook, type WaveLayer } from './seaStyles';

const SEA_SPRITES = `${import.meta.env.BASE_URL}sprites/sea`;
const CAUSTICS_DRIFT = [
  [3, -2],
  [-2.5, -3],
] as const; // world units per second, of the two layers of caustics
const CAUSTICS_SECOND_SCALE = 0.83; // the second layer is a little bigger, so the two never line up
const CAUSTICS_SECOND_TURN = 30; // degrees
// Sun glitter shows where the water reflects this direction: just above the mirror image of the camera, so it sparkles
// on slopes tilted a little towards the viewer
const GLINT_LIFT = 0.6;

// Every pixel of the screen is a spot on the water: the vertices carry theirs, and the layers' texture coordinates
// are computed from it, so the waves stay fixed to the water whatever the camera does
const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aWorld;

out vec2 vUv1;
out vec2 vUv2;
out vec2 vUv3;
out vec2 vUv4;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

// Per layer: origin on the water (x, y), then cos and sin of its turn; uInvTile: 1 / tile size of each layer
uniform vec4 uLayer1;
uniform vec4 uLayer2;
uniform vec4 uLayer3;
uniform vec4 uLayer4;
uniform vec4 uInvTile;

vec2 layerUv(vec4 layer, float invTile) {
  vec2 d = aWorld - layer.xy;
  return vec2(layer.z * d.x + layer.w * d.y, -layer.w * d.x + layer.z * d.y) * invTile;
}

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUv1 = layerUv(uLayer1, uInvTile.x);
  vUv2 = layerUv(uLayer2, uInvTile.y);
  vUv3 = layerUv(uLayer3, uInvTile.z);
  vUv4 = layerUv(uLayer4, uInvTile.w);
}
`;

const FRAGMENT = /* glsl */ `
in vec2 vUv1;
in vec2 vUv2;
in vec2 vUv3;
in vec2 vUv4;

out vec4 finalColor;

uniform sampler2D uMap1;
uniform sampler2D uMap2;
uniform sampler2D uCaustics;

uniform vec4 uTurns; // cos and sin of the two wave layers' turns (the vertex shader's are separate: a uniform shared
                     // by both shaders must have the same precision in both)
uniform vec2 uStrength;
uniform vec3 uDeep;
uniform vec3 uCrestColor;
uniform vec3 uSkyLow;
uniform vec3 uSkyHigh;
uniform vec3 uFoamColor;
uniform vec3 uCausticsColor;
uniform vec3 uView;
uniform vec3 uSun;
uniform vec3 uGlint;
uniform vec4 uCrest;  // crest color from, to, amount; share of the second layer
uniform vec4 uFoam;   // whitecaps from, to, amount; caustics amount
uniform vec4 uLight;  // diffuse, reflection, glint, glint sharpness
uniform vec3 uContour; // crest level of the outlines, their half width (in crest values), opacity

// A map's slope turned back from the layer's texture to the world
vec2 toWorld(vec2 s, vec2 turn) {
  return vec2(turn.x * s.x - turn.y * s.y, turn.y * s.x + turn.x * s.y);
}

void main() {
  vec3 a = texture(uMap1, vUv1).rgb;
  vec3 b = texture(uMap2, vUv2).rgb;
  vec2 slope = toWorld((a.rg * 2.0 - 1.0) * uStrength.x, uTurns.xy) + toWorld((b.rg * 2.0 - 1.0) * uStrength.y, uTurns.zw);
  float crest = a.b + (b.b - 0.5) * uCrest.w;
  vec3 n = normalize(vec3(-slope, 1.0));

  // Light inside the water: brighter on the crests, and on slopes turned to the sun
  float inner = smoothstep(uCrest.x, uCrest.y, crest) * uCrest.z;
  float sun = 1.0 + uLight.x * (dot(n, uSun) - uSun.z);
  vec3 color = mix(uDeep, uCrestColor, inner) * sun;

  // The sky, reflected more where the water turns away from the camera (Fresnel)
  float facing = max(dot(n, uView), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 r = reflect(-uView, n);
  vec3 sky = mix(uSkyLow, uSkyHigh, clamp((r.z - 0.2) / 0.8, 0.0, 1.0));
  color = mix(color, sky, clamp(fresnel * uLight.y, 0.0, 1.0));
  color += pow(max(dot(r, uGlint), 0.0), uLight.w) * uLight.z;

  if (uFoam.w > 0.0) {
    float caustics = min(texture(uCaustics, vUv3).r, texture(uCaustics, vUv4).r);
    color += uCausticsColor * caustics * uFoam.w;
  }

  // Whitecaps, broken up by the second layer's waves so they don't look like blots
  float foam = smoothstep(uFoam.x, uFoam.y, crest) * smoothstep(0.3, 0.7, b.b) * uFoam.z;
  // Outlines along one crest level, drawn in the foam color: squiggly lines of a painted sea
  float outline = (1.0 - smoothstep(uContour.y * 0.5, uContour.y, abs(crest - uContour.x))) * uContour.z;
  finalColor = vec4(mix(color, uFoamColor, max(foam, outline)), 1.0);
}
`;

function rgb(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

function vec3() {
  return { value: new Float32Array(3), type: 'vec3<f32>' as const };
}

function vec4() {
  return { value: new Float32Array(4), type: 'vec4<f32>' as const };
}

function seaUniforms() {
  return new UniformGroup({
    uLayer1: vec4(),
    uLayer2: vec4(),
    uLayer3: vec4(),
    uLayer4: vec4(),
    uInvTile: vec4(),
    uTurns: vec4(),
    uStrength: { value: new Float32Array(2), type: 'vec2<f32>' },
    uDeep: vec3(),
    uCrestColor: vec3(),
    uSkyLow: vec3(),
    uSkyHigh: vec3(),
    uFoamColor: vec3(),
    uCausticsColor: vec3(),
    uView: vec3(),
    uSun: { value: new Float32Array(LIGHT), type: 'vec3<f32>' },
    uGlint: vec3(),
    uCrest: vec4(),
    uFoam: vec4(),
    uLight: vec4(),
    uContour: vec3(),
  });
}

type SeaTexture = SeaMap | 'caustics';

export interface SeaSurface {
  /** The bottom of the scene: under the wave strokes, the fog and everything else */
  readonly mesh: Mesh<Geometry, Shader>;
  readonly uniforms: ReturnType<typeof seaUniforms>['uniforms'];
  readonly shader: Shader;
  readonly textures: Partial<Record<SeaTexture, Texture>>;
  look: SurfaceLook | null;
}

/**
 * The sea's surface: a mesh over the whole screen, painted by its own shader from tiles of ocean waves (two layers,
 * drifting and turned against each other), with light inside the water, reflected sky, sun glitter, whitecaps and
 * caustics. Each look of the sea is a set of numbers (seaStyles.ts). WebGL only (Pixi's default renderer)
 */
export function createSeaSurface(): SeaSurface {
  const geometry = new Geometry({
    attributes: {
      aPosition: { buffer: new Float32Array(8), format: 'float32x2' },
      aWorld: { buffer: new Float32Array(8), format: 'float32x2' },
    },
    indexBuffer: new Uint32Array([0, 1, 2, 1, 3, 2]),
  });
  const group = seaUniforms();
  const empty = Texture.WHITE.source;
  const shader = new Shader({
    glProgram: new GlProgram({ name: 'sea-surface', vertex: VERTEX, fragment: FRAGMENT }),
    resources: { seaUniforms: group, uMap1: empty, uMap2: empty, uCaustics: empty },
  });
  const sea: SeaSurface = {
    mesh: new Mesh({ geometry, shader }),
    uniforms: group.uniforms,
    shader,
    textures: {},
    look: null,
  };
  sea.mesh.visible = false;

  for (const name of [...SEA_MAPS, 'caustics'] as const) {
    Assets.load<Texture>({ src: `${SEA_SPRITES}/${name}.webp`, data: { autoGenerateMipmaps: true } })
      .then((texture) => {
        // Texture coordinates run far beyond 0..1: the tiles repeat
        texture.source.addressMode = 'repeat';
        sea.textures[name] = texture;
        setSeaLook(sea, sea.look);
      })
      .catch((error) => console.warn(`Sea texture ${name} failed to load`, error));
  }
  return sea;
}

/** Switches the look; null hides the surface (the flat background color shows) */
export function setSeaLook(sea: SeaSurface, look: SurfaceLook | null) {
  sea.look = look;
  const maps = look && [sea.textures[look.layers[0].map], sea.textures[look.layers[1].map], sea.textures.caustics];
  // Until its maps have loaded, the style's flat color shows
  if (!look || !maps || maps.some((texture) => !texture)) {
    sea.mesh.visible = false;
    return;
  }
  sea.mesh.visible = true;
  const [first, second, caustics] = maps;
  sea.shader.resources.uMap1 = first?.source;
  sea.shader.resources.uMap2 = second?.source;
  sea.shader.resources.uCaustics = caustics?.source;

  const u = sea.uniforms;
  u.uStrength.set([look.layers[0].strength, look.layers[1].strength]);
  const [a, b] = look.layers.map((layer) => (layer.turn * Math.PI) / 180);
  u.uTurns.set([Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)]);
  u.uDeep.set(rgb(look.deep));
  u.uCrestColor.set(rgb(look.crest));
  u.uSkyLow.set(rgb(look.skyLow));
  u.uSkyHigh.set(rgb(look.skyHigh));
  u.uFoamColor.set(rgb(look.foam));
  u.uCausticsColor.set(rgb(look.causticsColor));
  u.uCrest.set([look.crestRange[0], look.crestRange[1], look.crestAmount, look.crestShare]);
  u.uFoam.set([look.foamRange[0], look.foamRange[1], look.foamAmount, look.caustics]);
  u.uLight.set([look.diffuse, look.reflect, look.glint, look.glintSharpness]);
  u.uContour.set([look.outlineLevel, look.outlineWidth, look.outline]);
  u.uInvTile.set([
    1 / look.layers[0].tile,
    1 / look.layers[1].tile,
    1 / look.causticsTile,
    1 / (look.causticsTile / CAUSTICS_SECOND_SCALE),
  ]);
}

/** screenWidth/Height: pixels; the camera must already be set for this frame */
export function updateSeaSurface(
  sea: SeaSurface,
  camera: Camera3D,
  time: number,
  screenWidth: number,
  screenHeight: number,
) {
  const { look } = sea;
  if (!look || !sea.mesh.visible) return;
  const u = sea.uniforms;

  // From the water towards the camera, and the direction the sun glitters in
  const view = [-camera.fwdX * camera.cosP, -camera.fwdY * camera.cosP, camera.sinP] as const;
  u.uView.set(view);
  const lift = Math.hypot(view[0], view[1], view[2] + GLINT_LIFT);
  u.uGlint.set([-view[0] / lift, -view[1] / lift, (view[2] + GLINT_LIFT) / lift]);

  const [first, second] = look.layers;
  setLayer(u.uLayer1, first, camera, time);
  setLayer(u.uLayer2, second, camera, time);
  const tile = look.causticsTile;
  setLayer(u.uLayer3, { tile, turn: 0, drift: CAUSTICS_DRIFT[0] }, camera, time);
  setLayer(
    u.uLayer4,
    { tile: tile / CAUSTICS_SECOND_SCALE, turn: CAUSTICS_SECOND_TURN, drift: CAUSTICS_DRIFT[1] },
    camera,
    time,
  );

  const positions = sea.mesh.geometry.getBuffer('aPosition');
  const world = sea.mesh.geometry.getBuffer('aWorld');
  const corners = [
    [0, 0],
    [screenWidth, 0],
    [0, screenHeight],
    [screenWidth, screenHeight],
  ] as const;
  corners.forEach(([sx, sy], i) => {
    const p = camera.screenToGround(sx, sy);
    positions.data[i * 2] = sx;
    positions.data[i * 2 + 1] = sy;
    world.data[i * 2] = p.x;
    world.data[i * 2 + 1] = p.y;
  });
  positions.update();
  world.update();
}

/**
 * A layer's origin and turn. The origin drifts with the layer and is moved by whole tiles to near the camera, which
 * keeps the texture coordinates small: far from 0 a float loses the precision to tell the texture's pixels apart
 */
function setLayer(
  target: Float32Array,
  layer: Pick<WaveLayer, 'tile' | 'turn' | 'drift'>,
  camera: Camera3D,
  time: number,
) {
  const angle = (layer.turn * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const baseX = layer.drift[0] * time;
  const baseY = layer.drift[1] * time;
  // The camera's focus in the layer's texture coordinates, in whole tiles
  const dx = camera.focusX - baseX;
  const dy = camera.focusY - baseY;
  const u = Math.floor((cos * dx + sin * dy) / layer.tile);
  const v = Math.floor((-sin * dx + cos * dy) / layer.tile);
  // Back to the water: the turn's inverse
  target.set([baseX + (cos * u - sin * v) * layer.tile, baseY + (sin * u + cos * v) * layer.tile, cos, sin]);
}
