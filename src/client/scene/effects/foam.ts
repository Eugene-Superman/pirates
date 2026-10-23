import { Assets, type Texture } from 'pixi.js';
import { signedDistanceToPolygon, type Island } from '../../../game';

// What the wake (Wake.ts) and the water round a wreck (Sinking.ts) share: one foam texture and its colors, the shader
// functions that light and dissolve it, and the fade at the coasts

export const FOAM_TILE = 40; // world units one copy of the foam texture spans
export const FOAM_COLORS = { foam: 0xf4fbff, churn: 0xa8e2e0 };
// A seamless tile of foam, made by blender-assets/effects/foam/build_foam.py: R lace, G patches, B streaks along x
const FOAM_URL = `${import.meta.env.BASE_URL}sprites/foam/foam.webp`;
// World units from the coast over which wakes and the water round a wreck fade out: they never lie on a beach
const COAST_FADE = 10;

/**
 * GLSL functions for a foam shader; it must declare `uniform vec3 uView` (towards the camera) before them.
 * Colors are premultiplied
 */
export const FOAM_GLSL = /* glsl */ `
float fresnel(vec3 n) {
  return 0.02 + 0.98 * pow(1.0 - max(dot(n, uView), 0.0), 5.0);
}

vec4 over(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}

// Foam where the pattern is above the threshold, with a soft edge (a hard one shimmers as the camera moves); none at all
// where the amount is 0
float dissolve(float pattern, float amount, float soft) {
  return smoothstep(1.0 - amount, 1.0 - amount + soft, pattern);
}
`;

/** The foam texture, tiling across the water. Pixi loads it once for everyone who asks */
export async function loadFoam() {
  const texture = await Assets.load<Texture>({ src: FOAM_URL, data: { autoGenerateMipmaps: true } });
  texture.source.addressMode = 'repeat';
  return texture.source;
}

/** A color as the three floats of a shader's vec3 */
export function rgb(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * How much a point is open water: 0 on land, rising to 1 COAST_FADE out from the coast. Wakes and the water round a
 * wreck are drawn on the water above the islands' ground pictures, so they fade out with it
 */
export function waterShare(x: number, y: number, islands: readonly Island[]) {
  let share = 1;
  for (const island of islands) {
    const dx = x - island.x;
    const dy = y - island.y;
    const r = island.reach + COAST_FADE;
    if (dx * dx + dy * dy > r * r) continue;
    share = Math.min(share, smoothstep(0, COAST_FADE, signedDistanceToPolygon(x, y, island.coast)));
  }
  return share;
}
