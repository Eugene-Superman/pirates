import { Assets, Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup } from 'pixi.js';
import type { Ship } from '../../../game';
import type { Camera3D } from '../../render/Camera3D';
import { WIND_X, WIND_Y } from './wind';

// A seamless tile of mist, made in Blender by blender-assets/effects/fog/build_fog.py
const WISPS_URL = `${import.meta.env.BASE_URL}sprites/fog/wisps.webp`;

const HAZE_COLOR = 0xdce6eb; // light sea haze
const HAZE_ALPHA = 0.22; // at full strength, past the edge
// Shares of the view range: the fog thickens from nothing to full strength between them, smoothly for every pixel. It
// starts a little inside the range, so what is about to drop out of sight is already faintly hazed
const EDGE = [0.92, 1.25] as const;
/** Two layers of mist lying on the water, drifting with the wind at different speeds for a little depth */
const MIST_LAYERS = [
  { tile: 700, drift: 3, alpha: 0.2, mirror: false }, // tile: world units one copy of the texture spans
  { tile: 430, drift: 5, alpha: 0.14, mirror: true },
] as const;
const SEGMENTS = 64; // of the ring the fog is drawn on
const MARGIN = 50; // world units the ring reaches past the screen's farthest corner

// The ring's vertices carry their screen position and their spot on the water. Everything per pixel is computed from
// the spot, so the edge is a smooth gradient and the mist stays fixed to the water whatever the camera does
const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aWorld;

out vec2 vFromShip;
out vec2 vWorld;
out vec2 vMist1;
out vec2 vMist2;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

uniform vec2 uShip;
uniform float uViewRange;
uniform vec4 uMist1;
uniform vec4 uMist2;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vFromShip = (aWorld - uShip) / uViewRange;
  vWorld = aWorld;
  vMist1 = (aWorld - uMist1.xy) * uMist1.zw;
  vMist2 = (aWorld - uMist2.xy) * uMist2.zw;
}
`;

const FRAGMENT = /* glsl */ `
in vec2 vFromShip;
in vec2 vWorld;
in vec2 vMist1;
in vec2 vMist2;

out vec4 finalColor;

uniform sampler2D uWisps;
uniform vec4 uHaze;
uniform vec2 uEdge;
uniform vec2 uMistAlpha;
uniform vec3 uSpot;

void main() {
  float fog = smoothstep(uEdge.x, uEdge.y, length(vFromShip));
  // The spot the crew watches far off (the story's spyglass) clears as the ship's own view does; none at radius 0
  if (uSpot.z > 0.0) fog = min(fog, smoothstep(uEdge.x, uEdge.y, length(vWorld - uSpot.xy) / uSpot.z));
  vec4 far = texture(uWisps, vMist1) * uMistAlpha.x;
  vec4 near = texture(uWisps, vMist2) * uMistAlpha.y;
  // Premultiplied colors, layered "over" each other: haze, then the two layers of mist
  vec4 color = far + uHaze * (1.0 - far.a);
  color = near + color * (1.0 - near.a);
  finalColor = color * fog;
}
`;

function fogUniforms() {
  const r = ((HAZE_COLOR >> 16) & 0xff) / 255;
  const g = ((HAZE_COLOR >> 8) & 0xff) / 255;
  const b = (HAZE_COLOR & 0xff) / 255;
  return new UniformGroup({
    uShip: { value: new Float32Array(2), type: 'vec2<f32>' },
    uViewRange: { value: 1, type: 'f32' },
    // x, y and radius of the spot the crew watches far off (Ship.spotted); radius 0 for none
    uSpot: { value: new Float32Array(3), type: 'vec3<f32>' },
    uMist1: { value: new Float32Array(4), type: 'vec4<f32>' },
    uMist2: { value: new Float32Array(4), type: 'vec4<f32>' },
    uHaze: { value: new Float32Array([r * HAZE_ALPHA, g * HAZE_ALPHA, b * HAZE_ALPHA, HAZE_ALPHA]), type: 'vec4<f32>' },
    uEdge: { value: new Float32Array(EDGE), type: 'vec2<f32>' },
    // No mist until its texture has loaded: the haze shows alone
    uMistAlpha: { value: new Float32Array(2), type: 'vec2<f32>' },
  });
}

/** Parts of the fog the HUD shows or hides: the mist (with its haze, this file) and the clouds (FogClouds) */
export const FOG_LAYERS = ['mist', 'clouds'] as const;
export type FogLayer = (typeof FOG_LAYERS)[number];

export interface FogOfWar {
  /** Goes over everything on the water (islands, the port, ships), so beyond the view they are hazed like the sea */
  readonly mesh: Mesh<Geometry, Shader>;
  readonly uniforms: ReturnType<typeof fogUniforms>['uniforms'];
}

/**
 * The fog of war's haze and mist (its puffs are FogClouds): one mesh, a ring from the edge of the ship's view out past
 * the screen, drawn in one pass by its own shader; until the mist's texture loads, the haze shows alone.
 * It replaced stacked translucent bands, which made the edge stripy, and big Graphics shapes rebuilt every frame,
 * which cost more than the rest of the scene. WebGL only (Pixi's default renderer)
 */
export function createFogOfWar(): FogOfWar {
  const indices = new Uint32Array(SEGMENTS * 6);
  for (let k = 0; k < SEGMENTS; k++) {
    const a = k * 2;
    const b = ((k + 1) % SEGMENTS) * 2;
    indices.set([a, a + 1, b + 1, a, b + 1, b], k * 6);
  }
  const geometry = new Geometry({
    attributes: {
      aPosition: { buffer: new Float32Array(SEGMENTS * 4), format: 'float32x2' },
      aWorld: { buffer: new Float32Array(SEGMENTS * 4), format: 'float32x2' },
    },
    indexBuffer: indices,
  });
  const group = fogUniforms();
  const shader = new Shader({
    glProgram: new GlProgram({ name: 'fog-of-war', vertex: VERTEX, fragment: FRAGMENT }),
    resources: { fogUniforms: group, uWisps: Texture.WHITE.source },
  });
  Assets.load<Texture>(WISPS_URL)
    .then((texture) => {
      // The mist's texture coordinates run far beyond 0..1
      texture.source.addressMode = 'repeat';
      shader.resources.uWisps = texture.source;
      group.uniforms.uMistAlpha.set(MIST_LAYERS.map((layer) => layer.alpha));
    })
    .catch((error) => console.warn('Fog mist failed to load', error));
  return { mesh: new Mesh({ geometry, shader }), uniforms: group.uniforms };
}

/** screenWidth/Height: pixels; the camera must already be set for this frame */
export function updateFogOfWar(
  fog: FogOfWar,
  camera: Camera3D,
  ship: Ship,
  time: number,
  screenWidth: number,
  screenHeight: number,
) {
  const u = fog.uniforms;
  u.uShip.set([ship.x, ship.y]);
  u.uViewRange = ship.viewRange;
  const { spotted } = ship;
  u.uSpot.set(spotted ? [spotted.x, spotted.y, spotted.radius] : [0, 0, 0]);
  MIST_LAYERS.forEach((layer, i) => {
    // The texture's origin drifts with the wind. It is moved by whole tiles to near the ship, which keeps the
    // texture coordinates small: far from 0 a float loses the precision to tell the texture's pixels apart
    const driftX = WIND_X * layer.drift * time;
    const driftY = WIND_Y * layer.drift * time;
    const originX = driftX + Math.floor((ship.x - driftX) / layer.tile) * layer.tile;
    const originY = driftY + Math.floor((ship.y - driftY) / layer.tile) * layer.tile;
    const scaleX = (layer.mirror ? -1 : 1) / layer.tile;
    (i === 0 ? u.uMist1 : u.uMist2).set([originX, originY, scaleX, 1 / layer.tile]);
  });

  // The ring starts where the fog does and ends past the screen's farthest corner
  let far = 0;
  for (const [sx, sy] of [
    [0, 0],
    [screenWidth, 0],
    [0, screenHeight],
    [screenWidth, screenHeight],
  ]) {
    const p = camera.screenToGround(sx, sy);
    far = Math.max(far, Math.hypot(p.x - ship.x, p.y - ship.y));
  }
  const inner = ship.viewRange * EDGE[0];
  fog.mesh.visible = far > inner;
  if (!fog.mesh.visible) return;
  const outer = far + MARGIN;

  const positions = fog.mesh.geometry.getBuffer('aPosition');
  const world = fog.mesh.geometry.getBuffer('aWorld');
  for (let k = 0; k < SEGMENTS; k++) {
    const a = (k / SEGMENTS) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let side = 0; side < 2; side++) {
      const radius = side === 0 ? inner : outer;
      const x = ship.x + cos * radius;
      const y = ship.y + sin * radius;
      const s = camera.project(x, y, 0);
      const v = (k * 2 + side) * 2;
      positions.data[v] = s.x;
      positions.data[v + 1] = s.y;
      world.data[v] = x;
      world.data[v + 1] = y;
    }
  }
  positions.update();
  world.update();
}
