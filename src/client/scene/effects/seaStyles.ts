/** Wave maps in public/sprites/sea/, made by blender-assets/effects/sea/build_sea.py */
export const SEA_MAPS = ['swell', 'wind', 'chop', 'ripples'] as const;
export type SeaMap = (typeof SEA_MAPS)[number];

/** One layer of waves: a wave map tiled over the water and drifting */
export interface WaveLayer {
  readonly map: SeaMap;
  /** World units one copy of the map spans */
  readonly tile: number;
  /** Degrees the map is turned by, so two layers of one map don't line up */
  readonly turn: number;
  /** World units per second the layer drifts, along x and y */
  readonly drift: readonly [number, number];
  /** How steep its waves look: multiplies the slopes stored in the map */
  readonly strength: number;
}

/** How the shader paints the water. Colors are 0xRRGGBB, ranges are of the maps' "crest" value (0.5 = mean level) */
export interface SurfaceLook {
  readonly layers: readonly [WaveLayer, WaveLayer];
  /** Water seen straight through: in the troughs, and on crests lit from within */
  readonly deep: number;
  readonly crest: number;
  /** Where the crest color starts and is full, and how much of it there is at most */
  readonly crestRange: readonly [number, number];
  readonly crestAmount: number;
  /** How much the second layer adds to the crest value of the first */
  readonly crestShare: number;
  /** Reflected sky: near the horizon and high up */
  readonly skyLow: number;
  readonly skyHigh: number;
  /** Multiplies how much sky the water reflects (1 is physical) */
  readonly reflect: number;
  /** How much the sun's angle lightens or darkens the slopes */
  readonly diffuse: number;
  /** Sun glitter: brightness and sharpness (higher = smaller sparkles) */
  readonly glint: number;
  readonly glintSharpness: number;
  readonly foam: number;
  /** Crest values where whitecaps start and are solid, and their strongest opacity */
  readonly foamRange: readonly [number, number];
  readonly foamAmount: number;
  /** Light network of the caustics (sunlight focused onto a shallow floor), 0 for none */
  readonly caustics: number;
  readonly causticsColor: number;
  readonly causticsTile: number;
  /** Outlines in the foam color where the crest value crosses outlineLevel: opacity (0 for none) and half width */
  readonly outline: number;
  readonly outlineLevel: number;
  readonly outlineWidth: number;
}

export interface SeaStyle {
  readonly name: string;
  /** Flat color of the sea: the whole look of a style without a surface, and what shows before its maps load */
  readonly color: number;
  readonly surface: SurfaceLook | null;
  /** The little white wave strokes (waves.ts), or null for none */
  readonly arcs: { readonly color: number; readonly alpha: number } | null;
}

// What a look has unless it says otherwise: realistic water, whose waves show mostly by the sky they reflect
const BASE: Omit<SurfaceLook, 'layers' | 'deep' | 'crest' | 'skyLow' | 'skyHigh'> = {
  crestRange: [0.3, 1],
  crestAmount: 0.3,
  crestShare: 0.5,
  reflect: 1.6,
  diffuse: 0.4,
  glint: 0.5,
  glintSharpness: 1500,
  foam: 0xeef5f7,
  foamRange: [0.9, 1],
  foamAmount: 0.3,
  caustics: 0,
  causticsColor: 0xffffff,
  causticsTile: 200,
  outline: 0,
  outlineLevel: 0.7,
  outlineWidth: 0.03,
};

/** Looks of the sea the HUD switches between. The first is the game's original flat sea */
export const SEA_STYLES: readonly SeaStyle[] = [
  { name: 'Classic', color: 0x1b6f93, surface: null, arcs: { color: 0x5fb3d6, alpha: 0.45 } },
  {
    name: 'Deep ocean',
    color: 0x0f3f5f,
    surface: {
      ...BASE,
      layers: [
        { map: 'swell', tile: 900, turn: 0, drift: [6, -3], strength: 0.7 },
        { map: 'wind', tile: 420, turn: 70, drift: [-4, -7], strength: 0.5 },
      ],
      deep: 0x0b3554,
      crest: 0x2a7f9e,
      skyLow: 0xc9dde6,
      skyHigh: 0x5d8fb5,
    },
    arcs: null,
  },
  {
    name: 'Lagoon',
    color: 0x1aa0b0,
    surface: {
      ...BASE,
      layers: [
        { map: 'ripples', tile: 300, turn: 0, drift: [3, -2], strength: 0.45 },
        { map: 'swell', tile: 700, turn: 55, drift: [-2, -3], strength: 0.3 },
      ],
      deep: 0x168fa3,
      crest: 0x5fd3d6,
      crestAmount: 0.35,
      skyLow: 0xe2f3f6,
      skyHigh: 0x9fd4e6,
      reflect: 1.1,
      foamAmount: 0,
      caustics: 0.22,
      causticsColor: 0xd8fbff,
      causticsTile: 220,
    },
    arcs: null,
  },
  {
    name: 'Fresh breeze',
    color: 0x1d5f88,
    surface: {
      ...BASE,
      layers: [
        { map: 'wind', tile: 520, turn: 0, drift: [8, -5], strength: 0.9 },
        { map: 'chop', tile: 330, turn: 40, drift: [10, -2], strength: 0.6 },
      ],
      deep: 0x174f75,
      crest: 0x3a8db0,
      crestShare: 0.6,
      skyLow: 0xd5e6ee,
      skyHigh: 0x6a9cc0,
      reflect: 2,
      foamRange: [0.86, 0.98],
      foamAmount: 0.55,
    },
    arcs: null,
  },
  {
    name: 'Storm',
    color: 0x26434b,
    surface: {
      ...BASE,
      layers: [
        { map: 'chop', tile: 380, turn: 0, drift: [14, -8], strength: 1.3 },
        { map: 'wind', tile: 560, turn: 25, drift: [10, -6], strength: 1 },
      ],
      deep: 0x1d363e,
      crest: 0x4e7a7c,
      crestAmount: 0.5,
      crestShare: 0.8,
      skyLow: 0xa7b4b8,
      skyHigh: 0x6b7c84,
      reflect: 1.6,
      diffuse: 0.6,
      glint: 0,
      foam: 0xdfe6e6,
      foamRange: [0.84, 0.99],
      foamAmount: 0.5,
    },
    arcs: null,
  },
  {
    name: 'Glassy calm',
    color: 0x1e6a8c,
    surface: {
      ...BASE,
      layers: [
        { map: 'swell', tile: 1200, turn: 10, drift: [3, -2], strength: 0.5 },
        { map: 'ripples', tile: 260, turn: 0, drift: [1, -1], strength: 0.2 },
      ],
      deep: 0x175e80,
      crest: 0x2f84a3,
      crestAmount: 0.2,
      skyLow: 0xe7f1f5,
      skyHigh: 0x7fb2d2,
      reflect: 3,
      glint: 1,
      glintSharpness: 3000,
      foamAmount: 0,
    },
    arcs: null,
  },
  {
    name: 'Cartoon',
    color: 0x2a8fcf,
    surface: {
      ...BASE,
      layers: [
        { map: 'swell', tile: 600, turn: 0, drift: [6, -4], strength: 0.6 },
        { map: 'wind', tile: 400, turn: 60, drift: [-3, -6], strength: 0.4 },
      ],
      deep: 0x2582c2,
      crest: 0x3c9ed8,
      crestShare: 0.3,
      skyLow: 0xd4ecf8,
      skyHigh: 0x8fcbef,
      reflect: 0,
      diffuse: 0,
      glint: 0,
      foam: 0xe6f6ff,
      foamAmount: 0,
      // White squiggles around the crests instead of shading: a painted sea
      outline: 0.85,
      outlineLevel: 0.78,
      outlineWidth: 0.025,
    },
    arcs: null,
  },
  {
    name: 'Classic+',
    color: 0x1b6f93,
    surface: {
      ...BASE,
      layers: [
        { map: 'wind', tile: 480, turn: 0, drift: [5, -3], strength: 0.6 },
        { map: 'ripples', tile: 220, turn: 45, drift: [-2, -3], strength: 0.3 },
      ],
      deep: 0x1a6a8d,
      crest: 0x2f8db2,
      skyLow: 0xd0e5ee,
      skyHigh: 0x6aa6c8,
      reflect: 1.2,
      glint: 0.3,
      foamAmount: 0,
    },
    arcs: { color: 0x5fb3d6, alpha: 0.45 },
  },
  {
    name: 'Cold sea',
    color: 0x2c4d5f,
    surface: {
      ...BASE,
      layers: [
        { map: 'swell', tile: 800, turn: 0, drift: [5, -4], strength: 0.9 },
        { map: 'wind', tile: 400, turn: 50, drift: [6, -2], strength: 0.6 },
      ],
      deep: 0x263f4e,
      crest: 0x4b6f80,
      skyLow: 0xc3ccd2,
      skyHigh: 0x8095a3,
      glint: 0.2,
      foam: 0xe4eaee,
      foamRange: [0.88, 0.99],
      foamAmount: 0.4,
    },
    arcs: null,
  },
  {
    name: 'Emerald',
    color: 0x137a74,
    surface: {
      ...BASE,
      layers: [
        { map: 'wind', tile: 440, turn: 0, drift: [4, -3], strength: 0.6 },
        { map: 'ripples', tile: 220, turn: 35, drift: [-2, -2], strength: 0.35 },
      ],
      deep: 0x106b68,
      crest: 0x3fae9c,
      skyLow: 0xdcefea,
      skyHigh: 0x8cc6c0,
      reflect: 1.3,
      foam: 0xf3fbf8,
      foamAmount: 0.2,
      caustics: 0.12,
      causticsColor: 0xc8f5e6,
      causticsTile: 240,
    },
    arcs: { color: 0x7fd8c8, alpha: 0.35 },
  },
];
