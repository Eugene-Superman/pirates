/**
 * Wave maps, the caustics and the broad patches in public/sprites/sea/, made by blender-assets/effects/sea/build_sea.py
 */
export const SEA_MAPS = ['swell', 'ripples', 'chop', 'caustics', 'patches'] as const;
export type SeaMap = (typeof SEA_MAPS)[number];

/** One layer of waves: a wave map tiled over the water and drifting */
export interface WaveLayer {
  readonly map: SeaMap;
  /** World units one copy of the map spans */
  readonly tile: number;
  /** Degrees the map is turned by, so two layers don't line up */
  readonly turn: number;
  /** World units per second the layer drifts, along x and y */
  readonly drift: readonly [number, number];
  /** How steep its waves look: multiplies the slopes stored in the map */
  readonly strength: number;
}

/** The broad patches (patches.webp) stretched over the sea: where it is deeper or shallower, cloud shadows, gusts */
export interface PatchLayer {
  /** World units one copy of the map spans */
  readonly tile: number;
  readonly turn: number;
  /** World units per second it drifts: the clouds with the wind; the depth stays put */
  readonly drift: readonly [number, number];
}

/** How the shader paints the water. Colors are 0xRRGGBB, ranges are of the maps' "crest" value (0.5 = mean level) */
export interface SurfaceLook {
  /** A long swell, ripples over it, and a second set of ripples crossing them: as the two run different ways the
   * surface keeps changing instead of sliding along like one picture */
  readonly layers: readonly [WaveLayer, WaveLayer, WaveLayer];
  /** Water seen straight through: in the troughs, and on crests lit from within. `deep` where the sea is deepest,
   * `shallow` where it is lightest; the depth patches lie between them */
  readonly deep: number;
  readonly shallow: number;
  readonly depth: PatchLayer;
  /** Cloud shadows: their layer, how much of the sea they cover (0..1) and how much they darken it */
  readonly clouds: PatchLayer;
  readonly cloudCover: number;
  readonly cloudShadow: number;
  /** Where the wind blows harder: the ripples steeper, a chop over them and whitecaps breaking on it. `gustRange` is
   * where in the patches' gusts (spread evenly over 0..1) they go from none to full */
  readonly gusts: PatchLayer;
  readonly gustRange: readonly [number, number];
  /** How much steeper the ripples are in a full gust (1: no steeper) */
  readonly gustRipples: number;
  /** The chop: a wave layer seen only in the gusts, at its strength in a full one */
  readonly chop: WaveLayer;
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
  /** A soft sheen: wider, fainter glints of the sun, where the sea is calm. Brightness and sharpness, as the glint's */
  readonly sheen: number;
  readonly sheenSharpness: number;
  readonly foam: number;
  /** The chop's crest values where whitecaps start and are solid, and their strongest opacity (0: none). They break
   * only in the gusts, frayed by the foam texture (foam.ts), one copy of which spans `foamTile` world units */
  readonly foamRange: readonly [number, number];
  readonly foamAmount: number;
  readonly foamTile: number;
  /** Light the ripples focus on a shallow floor, seen through the water where the sea is shallowest: two layers of the
   * caustics map, drifting different ways (the light is where both are bright), its color and brightness */
  readonly caustics: readonly [PatchLayer, PatchLayer];
  readonly causticColor: number;
  readonly causticAmount: number;
}

/** Flat color of the sea: the screen behind the scene, seen until the wave maps have loaded */
export const SEA_COLOR = 0x1e6a8c;

/**
 * The sea's look, picked from the ten that were tried ("Glassy calm"): calm water, a long swell under fine ripples,
 * mirroring the sky strongly, with small sharp sun glitter. Livened up since: ripples running two ways, deeper and
 * shallower patches, cloud shadows drifting over it, gusts of rougher water with whitecaps, a soft sheen on the calm
 * and light playing on the floor of the shallows
 */
export const SEA_LOOK: SurfaceLook = {
  layers: [
    { map: 'swell', tile: 1200, turn: 10, drift: [6, -4], strength: 0.5 },
    { map: 'ripples', tile: 260, turn: 0, drift: [5, -3], strength: 0.18 },
    { map: 'ripples', tile: 340, turn: 57, drift: [-4, 5], strength: 0.14 },
  ],
  deep: 0x115072,
  shallow: 0x217f9b,
  depth: { tile: 3200, turn: 23, drift: [0, 0] },
  clouds: { tile: 2400, turn: -14, drift: [16, 9] },
  cloudCover: 0.3,
  cloudShadow: 0.12,
  gusts: { tile: 2000, turn: 61, drift: [12, -8] },
  gustRange: [0.62, 0.92],
  gustRipples: 1.8,
  chop: { map: 'chop', tile: 300, turn: 33, drift: [9, -6], strength: 0.2 },
  crest: 0x2f84a3,
  crestRange: [0.3, 1],
  crestAmount: 0.2,
  crestShare: 0.5,
  skyLow: 0xe7f1f5,
  skyHigh: 0x7fb2d2,
  reflect: 3,
  diffuse: 0.4,
  glint: 1,
  glintSharpness: 3000,
  sheen: 0.12,
  sheenSharpness: 220,
  foam: 0xeef5f7,
  foamRange: [0.72, 0.88],
  foamAmount: 0.6,
  foamTile: 60,
  caustics: [
    { tile: 170, turn: 0, drift: [4, 2.5] },
    { tile: 230, turn: 41, drift: [-3, 3.5] },
  ],
  causticColor: 0x9fe8e0,
  causticAmount: 0.14,
};
