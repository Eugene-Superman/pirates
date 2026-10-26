import { Assets, Geometry, GlProgram, Mesh, Shader, Texture, type TextureSource, UniformGroup } from 'pixi.js';
import type { Camera3D } from '../../render/Camera3D';
import { LIGHT } from '../../render/Painter3D';
import { loadFoam } from './foam';
import { SEA_LOOK, SEA_MAPS, type PatchLayer, type SeaMap } from './seaLook';

const SEA_SPRITES = `${import.meta.env.BASE_URL}sprites/sea`;
// Sun glitter shows where the water reflects this direction: just above the mirror image of the camera, so it sparkles
// on slopes tilted a little towards the viewer
const GLINT_LIFT = 0.6;

// Every pixel of the screen is a spot on the water: the vertices carry theirs, and the layers' texture coordinates
// are computed from it, so the waves stay fixed to the water whatever the camera does. Two layers' coordinates share
// a vec4, to keep to the varyings every GPU has
const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aWorld;

out vec4 vWaves;      // the first two wave layers
out vec4 vRipples;    // the third wave layer, the chop
out vec4 vPatches;    // the depth, the clouds
out vec4 vGustFoam;   // the gusts, the whitecaps' foam
out vec4 vCaustics;   // the two layers of caustics

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

// Per layer: origin on the water (x, y), then cos and sin of its turn; then 1 / tile size of each layer
uniform vec4 uLayer1;
uniform vec4 uLayer2;
uniform vec4 uLayer3;
uniform vec4 uChopLayer;
uniform vec4 uDepthLayer;
uniform vec4 uCloudLayer;
uniform vec4 uGustLayer;
uniform vec4 uFoamLayer;
uniform vec4 uCaustic1;
uniform vec4 uCaustic2;
uniform vec4 uInvTile;   // the three wave layers, the chop
uniform vec4 uInvPatch;  // the depth, the clouds, the gusts, the foam
uniform vec2 uInvCaustic;

vec2 layerUv(vec4 layer, float invTile) {
  vec2 d = aWorld - layer.xy;
  return vec2(layer.z * d.x + layer.w * d.y, -layer.w * d.x + layer.z * d.y) * invTile;
}

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWaves = vec4(layerUv(uLayer1, uInvTile.x), layerUv(uLayer2, uInvTile.y));
  vRipples = vec4(layerUv(uLayer3, uInvTile.z), layerUv(uChopLayer, uInvTile.w));
  vPatches = vec4(layerUv(uDepthLayer, uInvPatch.x), layerUv(uCloudLayer, uInvPatch.y));
  vGustFoam = vec4(layerUv(uGustLayer, uInvPatch.z), layerUv(uFoamLayer, uInvPatch.w));
  vCaustics = vec4(layerUv(uCaustic1, uInvCaustic.x), layerUv(uCaustic2, uInvCaustic.y));
}
`;

const FRAGMENT = /* glsl */ `
in vec4 vWaves;
in vec4 vRipples;
in vec4 vPatches;
in vec4 vGustFoam;
in vec4 vCaustics;

out vec4 finalColor;

uniform sampler2D uMap1;
uniform sampler2D uMap2;
uniform sampler2D uMap3;
uniform sampler2D uChop;
uniform sampler2D uPatches;
uniform sampler2D uCausticMap;
uniform sampler2D uFoamMap;

uniform vec4 uTurns; // cos and sin of the first two wave layers' turns (the vertex shader's are separate: a uniform
                     // shared by both shaders must have the same precision in both)
uniform vec4 uTurns2; // the third wave layer's, the chop's
uniform vec4 uStrength; // the three wave layers, the chop in a full gust
uniform vec3 uGust;   // where the gusts start and are full, how much steeper the ripples are in a full one
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec2 uClouds; // the share of the sea in cloud shadow, how much they darken it
uniform vec3 uCrestColor;
uniform vec3 uSkyLow;
uniform vec3 uSkyHigh;
uniform vec3 uFoamColor;
uniform vec3 uCausticColor;
uniform vec3 uView;
uniform vec3 uSun;
uniform vec3 uGlint;
uniform vec4 uCrest;  // crest color from, to, amount; share of the second layer
uniform vec3 uFoam;   // whitecaps from, to, amount
uniform vec4 uLight;  // diffuse, reflection, glint, glint sharpness
uniform vec3 uSheen;  // sheen brightness, sharpness; caustics' brightness

// A map's slope turned back from the layer's texture to the world
vec2 toWorld(vec2 s, vec2 turn) {
  return vec2(turn.x * s.x - turn.y * s.y, turn.y * s.x + turn.x * s.y);
}

void main() {
  // Where the wind blows harder: steeper ripples and a chop over them
  float gust = smoothstep(uGust.x, uGust.y, texture(uPatches, vGustFoam.xy).b);
  float ripples = mix(1.0, uGust.z, gust);

  vec3 a = texture(uMap1, vWaves.xy).rgb;
  vec3 b = texture(uMap2, vWaves.zw).rgb;
  vec3 c = texture(uMap3, vRipples.xy).rgb;
  vec3 d = texture(uChop, vRipples.zw).rgb;
  vec2 slope = toWorld((a.rg * 2.0 - 1.0) * uStrength.x, uTurns.xy)
    + toWorld((b.rg * 2.0 - 1.0) * uStrength.y * ripples, uTurns.zw)
    + toWorld((c.rg * 2.0 - 1.0) * uStrength.z * ripples, uTurns2.xy)
    + toWorld((d.rg * 2.0 - 1.0) * uStrength.w * gust, uTurns2.zw);
  float crest = a.b + (b.b + c.b - 1.0) * uCrest.w + (d.b - 0.5) * gust;
  vec3 n = normalize(vec3(-slope, 1.0));

  // Deeper and shallower water in broad patches, and the shadows of clouds drifting over it
  float shallows = texture(uPatches, vPatches.xy).r;
  float depth = smoothstep(0.1, 0.9, shallows);
  float shade = smoothstep(1.0 - uClouds.x - 0.1, 1.0 - uClouds.x + 0.25, texture(uPatches, vPatches.zw).g);
  vec3 body = mix(uDeep, uShallow, depth);

  // Light inside the water: brighter on the crests, and on slopes turned to the sun; less of it in a cloud's shadow
  float inner = smoothstep(uCrest.x, uCrest.y, crest) * uCrest.z;
  float sun = (1.0 + uLight.x * (dot(n, uSun) - uSun.z)) * (1.0 - uClouds.y * shade);
  vec3 color = mix(body, uCrestColor + (uShallow - uDeep) * depth * 0.5, inner) * sun;

  // Where the sea is shallowest, the floor shows through: light the ripples focus on it, playing where the two
  // drifting layers of the caustics are both bright; rough water and cloud shadows break it up. It is under the
  // surface, so the sky reflected below hides it
  float caustic = min(texture(uCausticMap, vCaustics.xy).r, texture(uCausticMap, vCaustics.zw).r);
  color += uCausticColor * caustic * smoothstep(0.7, 1.0, shallows) * uSheen.z * (1.0 - 0.6 * gust) * (1.0 - 0.7 * shade);

  // The sky, reflected more where the water turns away from the camera (Fresnel)
  float facing = max(dot(n, uView), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 r = reflect(-uView, n);
  vec3 sky = mix(uSkyLow, uSkyHigh, clamp((r.z - 0.2) / 0.8, 0.0, 1.0));
  color = mix(color, sky, clamp(fresnel * uLight.y, 0.0, 1.0));
  // Sun glitter, more of it on rough water, and a soft sheen on the calm
  float toSun = max(dot(r, uGlint), 0.0);
  color += pow(toSun, uLight.w) * uLight.z * (1.0 + gust) * (1.0 - shade);
  color += pow(toSun, uSheen.y) * uSheen.x * (1.0 - gust) * (1.0 - shade);
  color *= 1.0 - 0.5 * uClouds.y * shade;

  // Whitecaps on the chop's crests in the gusts, frayed by the foam's lace and thinned in its patches
  vec4 lace = texture(uFoamMap, vGustFoam.zw);
  float foam = smoothstep(uFoam.x, uFoam.y, d.b) * gust * smoothstep(0.3, 0.75, lace.r) * smoothstep(0.1, 0.5, lace.g);
  finalColor = vec4(mix(color, uFoamColor, foam * uFoam.z), 1.0);
}
`;

function rgb(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

function vec2() {
  return { value: new Float32Array(2), type: 'vec2<f32>' as const };
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
    uChopLayer: vec4(),
    uDepthLayer: vec4(),
    uCloudLayer: vec4(),
    uGustLayer: vec4(),
    uFoamLayer: vec4(),
    uCaustic1: vec4(),
    uCaustic2: vec4(),
    uInvTile: vec4(),
    uInvPatch: vec4(),
    uInvCaustic: vec2(),
    uTurns: vec4(),
    uTurns2: vec4(),
    uStrength: vec4(),
    uGust: vec3(),
    uDeep: vec3(),
    uShallow: vec3(),
    uClouds: vec2(),
    uCrestColor: vec3(),
    uSkyLow: vec3(),
    uSkyHigh: vec3(),
    uFoamColor: vec3(),
    uCausticColor: vec3(),
    uView: vec3(),
    uSun: { value: new Float32Array(LIGHT), type: 'vec3<f32>' },
    uGlint: vec3(),
    uCrest: vec4(),
    uFoam: vec3(),
    uLight: vec4(),
    uSheen: vec3(),
  });
}

export interface SeaSurface {
  /** The bottom of the scene: under the fog and everything else */
  readonly mesh: Mesh<Geometry, Shader>;
  readonly uniforms: ReturnType<typeof seaUniforms>['uniforms'];
  readonly shader: Shader;
  readonly textures: Partial<Record<SeaMap, Texture>>;
  /** The foam the whitecaps are frayed by, the wakes' (foam.ts) */
  foam: TextureSource | null;
}

/** The whitecaps' foam drifts with the chop it breaks on */
const FOAM_LAYER: PatchLayer = { tile: SEA_LOOK.foamTile, turn: SEA_LOOK.chop.turn, drift: SEA_LOOK.chop.drift };

/**
 * The sea's surface: a mesh over the whole screen, painted by its own shader from tiles of ocean waves (three layers,
 * drifting different ways and turned against each other, and a chop where gusts blow), with light inside the water,
 * deeper and shallower patches, light playing on the floor of the shallows, cloud shadows drifting over it, reflected
 * sky, sun glitter and sheen, and whitecaps in the gusts. How it looks is a set of numbers (SEA_LOOK, seaLook.ts).
 * Hidden until its maps have loaded: the flat sea color shows till then. WebGL only (Pixi's default renderer)
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
    // The whitecaps' small foam tile repeats many times across the screen: a medium float would make it blocky
    glProgram: new GlProgram({
      name: 'sea-surface',
      vertex: VERTEX,
      fragment: FRAGMENT,
      preferredFragmentPrecision: 'highp',
    }),
    resources: {
      seaUniforms: group,
      uMap1: empty,
      uMap2: empty,
      uMap3: empty,
      uChop: empty,
      uPatches: empty,
      uCausticMap: empty,
      uFoamMap: empty,
    },
  });
  const sea: SeaSurface = {
    mesh: new Mesh({ geometry, shader }),
    uniforms: group.uniforms,
    shader,
    textures: {},
    foam: null,
  };
  sea.mesh.visible = false;

  for (const name of SEA_MAPS) {
    Assets.load<Texture>({ src: `${SEA_SPRITES}/${name}.webp`, data: { autoGenerateMipmaps: true } })
      .then((texture) => {
        // Texture coordinates run far beyond 0..1: the tiles repeat
        texture.source.addressMode = 'repeat';
        sea.textures[name] = texture;
        applyLook(sea);
      })
      .catch((error) => console.warn(`Sea texture ${name} failed to load`, error));
  }
  loadFoam()
    .then((foam) => {
      sea.foam = foam;
      applyLook(sea);
    })
    .catch((error) => console.warn('Sea foam failed to load', error));
  return sea;
}

/** Paints the water with SEA_LOOK once all of its maps have loaded */
function applyLook(sea: SeaSurface) {
  const look = SEA_LOOK;
  const [first, second, third] = look.layers.map((layer) => sea.textures[layer.map]);
  const { chop, caustics, patches } = sea.textures;
  if (!first || !second || !third || !chop || !caustics || !patches || !sea.foam) return;
  sea.mesh.visible = true;
  const { resources } = sea.shader;
  resources.uMap1 = first.source;
  resources.uMap2 = second.source;
  resources.uMap3 = third.source;
  resources.uChop = chop.source;
  resources.uPatches = patches.source;
  resources.uCausticMap = caustics.source;
  resources.uFoamMap = sea.foam;

  const u = sea.uniforms;
  const waves = [...look.layers, look.chop];
  u.uStrength.set(waves.map((layer) => layer.strength));
  const [a, b, c, d] = waves.map((layer) => (layer.turn * Math.PI) / 180);
  u.uTurns.set([Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)]);
  u.uTurns2.set([Math.cos(c), Math.sin(c), Math.cos(d), Math.sin(d)]);
  u.uGust.set([look.gustRange[0], look.gustRange[1], look.gustRipples]);
  u.uDeep.set(rgb(look.deep));
  u.uShallow.set(rgb(look.shallow));
  u.uClouds.set([look.cloudCover, look.cloudShadow]);
  u.uCrestColor.set(rgb(look.crest));
  u.uSkyLow.set(rgb(look.skyLow));
  u.uSkyHigh.set(rgb(look.skyHigh));
  u.uFoamColor.set(rgb(look.foam));
  u.uCausticColor.set(rgb(look.causticColor));
  u.uCrest.set([look.crestRange[0], look.crestRange[1], look.crestAmount, look.crestShare]);
  u.uFoam.set([look.foamRange[0], look.foamRange[1], look.foamAmount]);
  u.uLight.set([look.diffuse, look.reflect, look.glint, look.glintSharpness]);
  u.uSheen.set([look.sheen, look.sheenSharpness, look.causticAmount]);
  u.uInvTile.set(waves.map((layer) => 1 / layer.tile));
  u.uInvPatch.set([look.depth, look.clouds, look.gusts, FOAM_LAYER].map((layer) => 1 / layer.tile));
  u.uInvCaustic.set(look.caustics.map((layer) => 1 / layer.tile));
}

/** screenWidth/Height: pixels; the camera must already be set for this frame */
export function updateSeaSurface(
  sea: SeaSurface,
  camera: Camera3D,
  time: number,
  screenWidth: number,
  screenHeight: number,
) {
  if (!sea.mesh.visible) return;
  const u = sea.uniforms;

  // From the water towards the camera, and the direction the sun glitters in
  const view = [-camera.fwdX * camera.cosP, -camera.fwdY * camera.cosP, camera.sinP] as const;
  u.uView.set(view);
  const lift = Math.hypot(view[0], view[1], view[2] + GLINT_LIFT);
  u.uGlint.set([-view[0] / lift, -view[1] / lift, (view[2] + GLINT_LIFT) / lift]);

  const [first, second, third] = SEA_LOOK.layers;
  setLayer(u.uLayer1, first, camera, time);
  setLayer(u.uLayer2, second, camera, time);
  setLayer(u.uLayer3, third, camera, time);
  setLayer(u.uChopLayer, SEA_LOOK.chop, camera, time);
  setLayer(u.uDepthLayer, SEA_LOOK.depth, camera, time);
  setLayer(u.uCloudLayer, SEA_LOOK.clouds, camera, time);
  setLayer(u.uGustLayer, SEA_LOOK.gusts, camera, time);
  setLayer(u.uFoamLayer, FOAM_LAYER, camera, time);
  setLayer(u.uCaustic1, SEA_LOOK.caustics[0], camera, time);
  setLayer(u.uCaustic2, SEA_LOOK.caustics[1], camera, time);

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
function setLayer(target: Float32Array, layer: PatchLayer, camera: Camera3D, time: number) {
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
