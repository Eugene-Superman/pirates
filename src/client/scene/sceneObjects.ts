import type { Container } from 'pixi.js';
import type { Painter3D } from '../render/Painter3D';

/**
 * Something volumetric in the scene (an island's raised part, a ship, a monster, a chest, a shot in flight), sorted
 * with the rest by its depth, far to near, before it is drawn: vector-drawn with a painter, or sprites (a ship's, with
 * its water mask and its fire over it; a serpent's pieces), which get a place of their own between the layers the
 * rest are drawn into: `layers`, bottom to top
 */
export type SceneObject =
  | { readonly depth: number; readonly draw: (p: Painter3D) => void }
  | { readonly depth: number; readonly layers: readonly Container[] };
