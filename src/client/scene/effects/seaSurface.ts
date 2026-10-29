import { Assets, Geometry, GlProgram, Mesh, Shader, Texture, type TextureSource, UniformGroup } from 'pixi.js';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { LIGHT } from '../../render/Painter3D';
import { loadFoam } from './foam';
import { SEA_LOOK, SEA_MAPS, type PatchLayer, type SeaMap } from './seaLook';

const SEA_SPRITES = `${import.meta.env.BASE_URL}sprites/sea`;
// Sun glitter shows where the water reflects this direction: just above the mirror image of the camera, so it sparkles
// on slopes tilted a little towards the viewer
const GLINT_LIFT = 0.6;
// The spots a boss's shells are to land on that the water lights at once (Beacon.ts): it fires four or five a barrage,
// one barrage at a time
export const SHELL_LIGHTS = 6;

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
out vec4 vGlow;       // the moon glass's grid, in its cells counted from uGlassOrigin; the story's mark, in its radii
out vec2 vPlace;      // the spot on the water, world units: the Seam's storm at the edges, a gate's whirlpool

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
uniform vec3 uGlassOrigin; // a corner of the glass's grid near the camera (x, y), 1 / its cell's size
uniform vec3 uMarkOrigin;  // the story's mark's middle (x, y), 1 / its radius

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
  vGlow = vec4((aWorld - uGlassOrigin.xy) * uGlassOrigin.z, (aWorld - uMarkOrigin.xy) * uMarkOrigin.z);
  vPlace = aWorld;
}
`;

const FRAGMENT = /* glsl */ `
in vec4 vWaves;
in vec4 vRipples;
in vec4 vPatches;
in vec4 vGustFoam;
in vec4 vCaustics;
in vec4 vGlow;
in vec2 vPlace;

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
uniform vec2 uGlassCell;   // the whole cells vGlow.xy is counted from: a shard's cell keeps its id wherever the camera is
uniform vec4 uGlass;       // the share of cells with a shard, its light's reach (cells), brightness, in deep water
uniform vec3 uGlassColor;  // a shard's own light, where it lies
uniform vec3 uGlassHalo;   // its light spread through the water round it
uniform vec4 uGlassSpark;  // the sparks over it: brightness, the share of fine cells with one, fine cells a cell
uniform vec2 uGlassClock;  // radians: how far the shards' breath has got, and the sparks' twinkle
uniform vec4 uMark;        // the story's mark's light: how far the waves bend it (radii a unit of slope), how tight its
                           // pool is, its rings' width and how far they spread (radii)
uniform vec4 uMarkLight;   // its brightness in the water and over the reflected sky, its glints' and their sharpness
uniform vec3 uMarkColor;
uniform vec3 uMarkNow;     // how much of it shows (0: none), how far its rings have spread (0..1), its breath (radians)
uniform vec3 uBossOrigin;  // a boss's light round it while it fights the player: its middle (x, y), 1 / its radius;
uniform vec4 uBoss;        // the rest of it as the mark's
uniform vec4 uBossLight;
uniform vec3 uBossColor;
uniform vec3 uBossNow;
uniform vec4 uShells[${SHELL_LIGHTS}]; // the same on the spots its shells are to land on: middle, 1 / radius, how much shows
uniform vec4 uSeam;       // the sea's map: its width and height; how far in from its edge the Seam's storm reaches, and
                           // how wide the whitewater at the wall's foot is (world units)
uniform vec4 uSeamWater;   // the storm: how much steeper its waves, how much of its colour, its whitewater's foam,
                           // 1 / its foam's tile
uniform vec3 uSeamColor;
uniform vec2 uSeamChurn;   // world units the whitewater's foam has drifted, kept to its tile
uniform vec4 uGate;        // the gate nearest the camera: its middle (x, y), 1 / its radius, how much of it shows (0: none)
uniform vec4 uVortex;      // its whirlpool, in the gate's radii: how far it turns the water, how far its funnel reaches;
                           // how much darker the funnel's water is, how steep it looks
uniform vec4 uVortexArms;  // its arms of foam: how many, how tightly they wind (radians an e-fold of the radius); copies
                           // of the foam an arm's turn, and an e-fold of the radius
uniform vec4 uVortexNow;   // radians the arms have turned; how far the foam has drawn in (0..1); radians the waves curl
                           // round it at its edge; the eye's size (radii)
uniform vec4 uVortexEye;   // the eye's light (rgb), and how bright, breathing
uniform float uVortexFoam; // the arms' foam

// A number in 0..1 for a cell of a grid, the same every frame (a hash without sine: no float error on big ids)
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Moon glass on the seabed: in some cells of a coarse grid a shard, its light coming up through the water, each of its
// own size, breathing at its own pace. A shard keeps to its cell's middle half and its light to half a cell, so the
// four cells round the nearest corner hold every one that reaches here. core: the shards' own bright light
float glassLight(out float core) {
  vec2 corner = floor(vGlow.xy + 0.5);
  float light = 0.0;
  core = 0.0;
  for (int j = -1; j <= 0; j++) {
    for (int i = -1; i <= 0; i++) {
      vec2 cell = corner + vec2(float(i), float(j));
      vec2 id = cell + uGlassCell;
      float h = hash(id);
      if (h > uGlass.x) continue;
      vec2 at = cell + 0.25 + 0.5 * vec2(hash(id + 7.13), hash(id + 3.71));
      float size = 0.55 + 0.45 * hash(id + 1.9);
      float d = length(vGlow.xy - at) / (uGlass.y * size);
      float breath = 0.6 + 0.4 * sin(uGlassClock.x * (0.7 + 0.6 * hash(id + 5.3)) + h * 97.0);
      float halo = max(0.0, 1.0 - d);
      light += halo * halo * breath * size;
      core += exp(-d * d * 90.0) * breath;
    }
  }
  return light;
}

// Where the story sends the player, or round a boss that fights them: a pool of light in the water and rings of it
// spreading out of its middle one after another, all bent by the waves over it, as light seen through moving water is.
// at: here, in its radii; shape and now: its uMark and uMarkNow; pool: the pool alone, for the glints on the ripples
// over it
float waterLight(vec2 at, vec4 shape, vec3 now, vec2 slope, out float pool) {
  pool = 0.0;
  if (now.x <= 0.0) return 0.0;
  float r = length(at + slope * shape.x);
  pool = exp(-r * r * shape.y) * (0.8 + 0.2 * sin(now.z));
  float rings = 0.0;
  for (int i = 0; i < 3; i++) {
    float k = fract(now.y + float(i) / 3.0);
    float w = (r - k * shape.w) / shape.z;
    rings += exp(-w * w) * (1.0 - k) * (1.0 - k) * smoothstep(0.0, 0.25, k);
  }
  float light = (pool + rings * 0.7) * now.x;
  pool *= now.x;
  return light;
}

// A gate to another sea: a whirlpool round its middle. The waves' slope turned round it, more the nearer its middle,
// and tilted down into its funnel, so the light on the water shows its hollow; its arms of foam, log spirals winding in
// to its middle and turning, the foam's lace laid along them and drawn in. funnel: how deep in it is (1 at its
// middle); eye: its light. Returns the arms' foam
float whirlpool(inout vec2 slope, out float funnel, out float eye) {
  funnel = 0.0;
  eye = 0.0;
  if (uGate.w <= 0.0) return 0.0;
  vec2 p = (vPlace - uGate.xy) * uGate.z;
  float r = length(p);
  if (r >= uVortex.x) return 0.0;
  float reach = (1.0 - smoothstep(0.45 * uVortex.x, uVortex.x, r)) * uGate.w;
  funnel = pow(1.0 - smoothstep(0.0, uVortex.y, r), 1.5) * uGate.w;
  float curl = uVortexNow.z * reach * (1.0 + 2.0 * funnel);
  float c = cos(curl);
  float s = sin(curl);
  slope = vec2(c * slope.x - s * slope.y, s * slope.x + c * slope.y) + p / max(r, 0.04) * uVortex.w * funnel;

  float rr = max(r, 0.02);
  float lnr = log(rr);
  float wind = lnr * uVortexArms.y + uVortexNow.x;
  float inward = lnr * uVortexArms.w + uVortexNow.y;
  // The angle round it cut on its -x side, and again on its +x side
  float pi = 3.14159265359;
  float left = atan(p.y, p.x + 1e-5);
  float right = atan(-p.y, -p.x - 1e-5) + pi;
  float arms = pow(0.5 + 0.5 * cos(left * uVortexArms.x + wind), 3.0);
  // A turn round it moves the lace by whole copies (the arms times the copies an arm's), so the two cuts give the same
  // lace; each is taken away from its cut, where the texture's own blur across the jump would show as a seam
  float copies = uVortexArms.z / (2.0 * pi);
  float lace1 = texture(uFoamMap, vec2((left * uVortexArms.x + wind) * copies, inward)).r;
  float lace2 = texture(uFoamMap, vec2((right * uVortexArms.x + wind) * copies, inward)).r;
  float lace = mix(lace2, lace1, 0.5 + 0.5 * p.x / rr);
  eye = exp(-r * r / (uVortexNow.w * uVortexNow.w)) * uGate.w;
  // Thinning down the funnel's walls, none in the eye: the water falls away there
  return arms * smoothstep(0.25, 0.6, lace) * reach * smoothstep(0.15, 0.5, r) * uVortexFoam;
}

// A map's slope turned back from the layer's texture to the world
vec2 toWorld(vec2 s, vec2 turn) {
  return vec2(turn.x * s.x - turn.y * s.y, turn.y * s.x + turn.x * s.y);
}

void main() {
  // Towards the sea's edge, the Seam's storm (its wall stands at the edge): a gust everywhere, and steeper still,
  // darker beyond it
  vec2 inside = min(vPlace, uSeam.xy - vPlace);
  float edge = min(inside.x, inside.y);
  float storm = 1.0 - smoothstep(0.0, uSeam.z, edge);
  float beyond = 1.0 - step(0.0, edge);
  // Where the wind blows harder: steeper ripples and a chop over them
  float gust = max(smoothstep(uGust.x, uGust.y, texture(uPatches, vGustFoam.xy).b), storm * 0.7);
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
  slope *= 1.0 + uSeamWater.x * storm;
  float funnel;
  float eye;
  float swirl = whirlpool(slope, funnel, eye);
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
  // The storm's dark water, and the whirlpool's funnel darker still, the gate's light deep in it
  color = mix(color, uSeamColor * sun, min(1.0, storm * uSeamWater.y + beyond * 0.25));
  color *= 1.0 - uVortex.z * funnel;
  color = mix(color, uVortexEye.rgb * 0.45, funnel * funnel * 0.5);

  // Where the sea is shallowest, the floor shows through: light the ripples focus on it, playing where the two
  // drifting layers of the caustics are both bright; rough water and cloud shadows break it up. It is under the
  // surface, so the sky reflected below hides it
  float caustic = min(texture(uCausticMap, vCaustics.xy).r, texture(uCausticMap, vCaustics.zw).r);
  color += uCausticColor * caustic * smoothstep(0.7, 1.0, shallows) * uSheen.z * (1.0 - 0.6 * gust) * (1.0 - 0.7 * shade);

  // The Moon's light, from below now: the glass on the seabed glowing up through the water, dimmer where it is deep,
  // bent by the ripples as the sun's caustics are; the sky reflected over it hides it as it hides the floor
  float core;
  float glass = glassLight(core) * mix(uGlass.w, 1.0, depth);
  float bent = 0.5 + 1.2 * caustic;
  color += (uGlassHalo * glass * bent + uGlassColor * core * 0.7 * mix(uGlass.w, 1.0, depth)) * uGlass.z;
  // The story's mark's, and a boss's, the caustics playing in them: the water turned gold or red, not lightened, which
  // would whiten its blue
  float pool;
  float mark = waterLight(vGlow.zw, uMark, uMarkNow, slope, pool);
  color = mix(color, uMarkColor * (0.75 + 0.9 * caustic), clamp(mark * uMarkLight.x, 0.0, 1.0));
  float bossPool;
  float boss = waterLight((vPlace - uBossOrigin.xy) * uBossOrigin.z, uBoss, uBossNow, slope, bossPool);
  for (int i = 0; i < ${SHELL_LIGHTS}; i++) {
    vec4 shell = uShells[i];
    float shellPool;
    boss += waterLight((vPlace - shell.xy) * shell.z, uBoss, vec3(shell.w, uBossNow.yz), slope, shellPool);
    bossPool += shellPool;
  }
  color = mix(color, uBossColor * (0.75 + 0.9 * caustic), clamp(boss * uBossLight.x, 0.0, 1.0));

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
  // Their light again over the sky, which would hide the most of it, and its glitter on the ripples over it
  color += uMarkColor * (mark * uMarkLight.y + pow(toSun, uMarkLight.w) * pool * uMarkLight.z);
  color += uBossColor * (boss * uBossLight.y + pow(toSun, uBossLight.w) * bossPool * uBossLight.z);

  // Sparks of moonlight over the glass, here and there, twinkling: on top of the reflected sky, as glitter is
  vec2 fine = vGlow.xy * uGlassSpark.z;
  float s = hash(floor(fine) + uGlassCell * uGlassSpark.z);
  float twinkle = pow(max(0.0, sin(uGlassClock.y + s * 60.0)), 14.0);
  float speck = smoothstep(0.32, 0.0, length(fract(fine) - 0.5));
  color += uGlassColor * step(1.0 - uGlassSpark.y, s) * twinkle * speck * min(1.0, glass * 2.5) * uGlassSpark.x;

  // The whirlpool's hollow dark under the sky too, and the gate's eye lit deep in it
  color *= 1.0 - uVortex.z * 0.8 * funnel * funnel;
  color += uVortexEye.rgb * eye * uVortexEye.a;

  // Whitecaps on the chop's crests in the gusts, frayed by the foam's lace and thinned in its patches
  vec4 lace = texture(uFoamMap, vGustFoam.zw);
  float foam = smoothstep(uFoam.x, uFoam.y, d.b) * gust * smoothstep(0.3, 0.75, lace.r) * smoothstep(0.1, 0.5, lace.g);
  // Whitewater churning at the Seam's foot
  float foot = 1.0 - smoothstep(0.0, uSeam.w, abs(edge));
  vec4 churn = texture(uFoamMap, (vPlace + uSeamChurn) * uSeamWater.w);
  float white = foot * smoothstep(0.3, 0.65, churn.r) * uSeamWater.z;
  finalColor = vec4(mix(color, uFoamColor, max(max(foam * uFoam.z, white), swirl)), 1.0);
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
    uGlassOrigin: vec3(),
    uGlassCell: vec2(),
    uGlass: vec4(),
    uGlassColor: vec3(),
    uGlassHalo: vec3(),
    uGlassSpark: vec4(),
    uGlassClock: vec2(),
    uMarkOrigin: vec3(),
    uMark: vec4(),
    uMarkLight: vec4(),
    uMarkColor: vec3(),
    uMarkNow: vec3(),
    uBossOrigin: vec3(),
    uBoss: vec4(),
    uBossLight: vec4(),
    uBossColor: vec3(),
    uBossNow: vec3(),
    uShells: { value: new Float32Array(4 * SHELL_LIGHTS), type: 'vec4<f32>' as const, size: SHELL_LIGHTS },
    uSeam: vec4(),
    uSeamWater: vec4(),
    uSeamColor: vec3(),
    uSeamChurn: vec2(),
    uGate: vec4(),
    uVortex: vec4(),
    uVortexArms: vec4(),
    uVortexNow: vec4(),
    uVortexEye: vec4(),
    uVortexFoam: { value: 0, type: 'f32' as const },
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

/** A gate to another sea in the water, world units: its whirlpool's eye lit as `open` to the ship's tier or not */
export interface WaterGate {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly open: boolean;
}

/** A light in the water: the story's mark's or a boss's (Beacon.ts), world units; `shown` 0..1 as it fades */
export interface WaterLight {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly shown: number;
}

/** The whitecaps' foam drifts with the chop it breaks on */
const FOAM_LAYER: PatchLayer = { tile: SEA_LOOK.foamTile, turn: SEA_LOOK.chop.turn, drift: SEA_LOOK.chop.drift };

/**
 * The sea's surface: a mesh over the whole screen, painted by its own shader from tiles of ocean waves (three layers,
 * drifting different ways and turned against each other, and a chop where gusts blow), with light inside the water,
 * deeper and shallower patches, light playing on the floor of the shallows, cloud shadows drifting over it, reflected
 * sky, sun glitter and sheen, whitecaps in the gusts, and the Moon's light from below: moon glass glowing up from the
 * seabed here and there, breathing, with sparks of moonlight over it (made up in the shader, no map); and where the
 * story sends the player, a pool of gold light in the water with rings of it spreading, bent by the waves, and a red
 * one round a boss that fights them; towards the map's edges the Seam's storm, whitewater at the foot of its wall
 * (SeamWalls.ts); and at a gate to another sea a whirlpool, arms of foam winding in to a dark funnel, its eye lit. How
 * it looks is a set of numbers (SEA_LOOK, seaLook.ts).
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
  const { glass } = look;
  u.uGlass.set([glass.share, glass.reach, glass.amount, glass.deep]);
  u.uGlassColor.set(rgb(glass.color));
  u.uGlassHalo.set(rgb(glass.halo));
  u.uGlassSpark.set([glass.sparks, glass.sparkShare, glass.sparkCells, 0]);
  const { mark, boss } = look;
  u.uMark.set([mark.bend, mark.pool, mark.ringWidth, mark.ringReach]);
  u.uMarkLight.set([mark.under, mark.over, mark.glints, mark.glintSharpness]);
  u.uMarkColor.set(rgb(mark.color));
  u.uBoss.set([boss.bend, boss.pool, boss.ringWidth, boss.ringReach]);
  u.uBossLight.set([boss.under, boss.over, boss.glints, boss.glintSharpness]);
  u.uBossColor.set(rgb(boss.color));
  const { seam, vortex } = look;
  u.uSeam.set([WORLD_WIDTH, WORLD_HEIGHT, seam.reach, seam.foot]);
  u.uSeamWater.set([seam.rough, seam.dark, seam.foam, 1 / seam.foamTile]);
  u.uSeamColor.set(rgb(seam.color));
  u.uVortex.set([vortex.reach, vortex.funnel, vortex.dark, vortex.slope]);
  u.uVortexArms.set([vortex.arms, vortex.twist, vortex.laceRound, vortex.laceIn]);
  u.uVortexFoam = vortex.foam;
}

/**
 * screenWidth/Height: pixels; the camera must already be set for this frame. light: the story's mark's, if any;
 * bossLight: round a boss that fights the player, if any; shellLights: on the spots its shells are to land on, null
 * where none shows (SHELL_LIGHTS at most); gate: the gate nearest the camera, if any
 */
export function updateSeaSurface(
  sea: SeaSurface,
  camera: Camera3D,
  time: number,
  screenWidth: number,
  screenHeight: number,
  light: WaterLight | null,
  bossLight: WaterLight | null,
  shellLights: readonly (WaterLight | null)[],
  gate: WaterGate | null,
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
  // The glass's grid from the whole cell under the camera, which the shader adds to a cell's place for its id
  const { glass } = SEA_LOOK;
  const cellX = Math.floor(camera.focusX / glass.cell);
  const cellY = Math.floor(camera.focusY / glass.cell);
  u.uGlassOrigin.set([cellX * glass.cell, cellY * glass.cell, 1 / glass.cell]);
  u.uGlassCell.set([cellX, cellY]);
  // Kept to a turn: a float of many seconds would lose the precision a smooth breath needs
  const turn = Math.PI * 2;
  u.uGlassClock.set([(time * glass.breath) % turn, (time * glass.twinkle) % turn]);
  const { mark } = SEA_LOOK;
  if (light) u.uMarkOrigin.set([light.x, light.y, 1 / light.radius]);
  u.uMarkNow.set([light?.shown ?? 0, (time / mark.ringPeriod) % 1, (time * mark.breath) % turn]);
  const { boss } = SEA_LOOK;
  if (bossLight) u.uBossOrigin.set([bossLight.x, bossLight.y, 1 / bossLight.radius]);
  u.uBossNow.set([bossLight?.shown ?? 0, (time / boss.ringPeriod) % 1, (time * boss.breath) % turn]);
  for (let i = 0; i < SHELL_LIGHTS; i++) {
    const shell = shellLights[i];
    if (shell) u.uShells.set([shell.x, shell.y, 1 / shell.radius, shell.shown], i * 4);
    else u.uShells[i * 4 + 3] = 0;
  }
  const { seam, vortex } = SEA_LOOK;
  const churn = (time * seam.churn) % seam.foamTile;
  u.uSeamChurn.set([churn, churn * 0.6]);
  if (gate) u.uGate.set([gate.x, gate.y, 1 / gate.radius, 1]);
  else u.uGate[3] = 0;
  u.uVortexNow.set([(time * vortex.spin) % turn, (time * vortex.flow) % 1, vortex.curl, vortex.eye]);
  const breath = 1 - vortex.breathe + vortex.breathe * Math.sin(time * vortex.breath);
  u.uVortexEye.set([...rgb(gate?.open === false ? vortex.shut : vortex.glow), vortex.bright * breath]);

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
