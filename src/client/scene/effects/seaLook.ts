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
  /** The Moon's light from below: the moon glass on the seabed glowing up through the water */
  readonly glass: GlassLook;
  /** Where the story sends the player: a gold light in the water */
  readonly mark: MarkLook;
  /** Round a boss that fights the player: a red light in the water, pulsing faster */
  readonly boss: MarkLook;
  /** Round a unit picked out, fired at, or that the story asks the player to sink: the same, in its aura's colour */
  readonly aura: AuraWaterLook;
  /** A monster's ink: where it will come up from a dive, and its clouds */
  readonly ink: InkLook;
  /** The Seam's storm at the map's edges, and a gate's whirlpool */
  readonly seam: SeamLook;
  readonly vortex: VortexLook;
}

/**
 * Moon glass on the seabed (docs/story.md: the Moon fell into the sea, and its shards glow there): a shard in some of
 * the cells of a grid over the water, each its own size and breath, its light spread round it and sparks over it
 */
export interface GlassLook {
  /** World units a side of a cell: a shard keeps to its middle half, its light to half of it */
  readonly cell: number;
  /** The share of cells with a shard */
  readonly share: number;
  /** How far a shard's light reaches, in cells (half a cell at most) */
  readonly reach: number;
  /** How bright it is, and how much of it is left where the sea is deepest (0..1) */
  readonly amount: number;
  readonly deep: number;
  /** A shard's own light, and the light it spreads through the water round it */
  readonly color: number;
  readonly halo: number;
  /** Radians a second: how fast a shard breathes, and the sparks over it twinkle */
  readonly breath: number;
  readonly twinkle: number;
  /** The sparks: how bright, the share of the fine cells that have one, and fine cells a side of a cell */
  readonly sparks: number;
  readonly sparkShare: number;
  readonly sparkCells: number;
}

/**
 * A light in the water, the story's mark's (storyMark3d.ts) or a boss's: a pool of it, breathing, and rings of it
 * spreading out of its middle one after another, all bent by the waves over it, glints on the ripples; its pillar of
 * light is drawn over the sea (Beacon). Distances in its radii
 */
export interface MarkLook {
  readonly color: number;
  /** How much it turns the water its colour, and how much it lightens it over the sky the water reflects (which hides
   * the most of what is under it) */
  readonly under: number;
  readonly over: number;
  /** How far the waves bend it: radii a unit of their slope */
  readonly bend: number;
  /** How tight the pool is: its light falls off as e^(-pool · r²) */
  readonly pool: number;
  /** A ring's width, how far it spreads, and seconds it takes to */
  readonly ringWidth: number;
  readonly ringReach: number;
  readonly ringPeriod: number;
  /** Radians a second the pool breathes at */
  readonly breath: number;
  /** The glints on the ripples over the pool: brightness and sharpness, as the sun's glitter */
  readonly glints: number;
  readonly glintSharpness: number;
}

/**
 * A unit's aura (Auras.ts): a light in the water round it as the mark's, with no pillar; its colour is the aura's, by
 * what the unit is to the player, and its rings spread quicker round the target fired at
 */
export interface AuraWaterLook extends Omit<MarkLook, 'color'> {
  /** Seconds a ring takes to spread round the target the ship fires at */
  readonly firingPeriod: number;
}

/**
 * A monster's ink (combat/monsterSkills.ts): the spot it will come up at from a dive, lit as a boss's shell's spot
 * (its shape and bend) in the ink's own dark light; and its clouds on the water, the sea gone dark under them, with
 * the Moon's light faint deep in them (docs/story.md: the Inkmother swallowed a shard of it)
 */
export interface InkLook {
  /** The spot's light, how much it turns the water its colour and lightens it over the sky, its glints' brightness
   * and sharpness */
  readonly glow: number;
  readonly under: number;
  readonly over: number;
  readonly glints: number;
  readonly glintSharpness: number;
  /** The clouds: the ink's colour, how much of the sea it hides at its thickest (0..1), how frayed its edge is (its
   * radii), and world units a copy of the foam's lace that frays it spans */
  readonly color: number;
  readonly dark: number;
  readonly fray: number;
  readonly laceTile: number;
  /** The light deep in it, playing with the caustics, and how bright */
  readonly lightColor: number;
  readonly light: number;
}

/**
 * The Seam (docs/story.md: the walls of storm between the seas) at the sea's map's edges, its foot in the water: the
 * waves rougher and darker towards it, whitewater churning where its wall stands (SeamWalls.ts), broken foam beyond.
 * World units
 */
export interface SeamLook {
  /** How far in from the edge the storm reaches, and how wide the whitewater at the wall's foot is */
  readonly reach: number;
  readonly foot: number;
  /** How much steeper the waves are at the edge (1: twice) */
  readonly rough: number;
  /** The storm's water, and how much of it there is at the edge */
  readonly color: number;
  readonly dark: number;
  /** The whitewater: its foam, world units a copy of the foam spans, and world units a second it churns along */
  readonly foam: number;
  readonly foamTile: number;
  readonly churn: number;
}

/** A set of a whirlpool's arms: how many (whole), and radians a second they turn on with the water (back if less than 0) */
export interface VortexArms {
  readonly count: number;
  readonly drift: number;
}

/**
 * A gate to another sea (world/gates.ts) in the water: a whirlpool, its water running in along log spirals to a dark
 * funnel, faster nearer its middle, arms of foam on them, whitewater round the funnel's lip, its eye lit with the Seam's
 * light and that light spiralling down into it. Distances in the gate's radii
 */
export interface VortexLook {
  /** How far out it turns the water, and how far its funnel reaches */
  readonly reach: number;
  readonly funnel: number;
  /** How much darker the funnel's water is, and how steep its walls look: slope units at their steepest */
  readonly dark: number;
  readonly steep: number;
  /** Radians the waves curl round it at its edge (three times that at its middle) */
  readonly curl: number;
  /** How tightly its spirals wind: radians round it an e-fold of the radius */
  readonly twist: number;
  /** Radians a second its water goes round at the gate's radius; how much faster nearer the middle: as 1 / r to this
   * (a real whirlpool's is 2), the water's speed along a spiral as r to 1 less it */
  readonly spin: number;
  readonly pull: number;
  /** Its arms: two sets of different counts on the same spirals, so the arms are of every width, merging and parting as
   * the sets turn on at their own paces (slowly: the water itself runs along them); how high the ridges they ride on
   * are, which the light catches */
  readonly arms: readonly [VortexArms, VortexArms];
  readonly ridges: number;
  /** The foam on them: copies of its texture round the spirals (whole) and along them, a unit of r to the pull; how
   * much foam */
  readonly laceRound: number;
  readonly laceAlong: number;
  readonly foam: number;
  /** The whitewater round the funnel's lip: its radius and width; within `throat`, the foam is gone down the hole */
  readonly rim: number;
  readonly rimWidth: number;
  readonly throat: number;
  /** The eye's light: an open gate's, one shut to the ship's tier; its size (radii), brightness, how much of it
   * breathes and radians a second it does */
  readonly glow: number;
  readonly shut: number;
  readonly eye: number;
  readonly bright: number;
  readonly breathe: number;
  readonly breath: number;
  /** Its light spiralling down into the eye: how bright (of the eye's), how many arms (whole), how tightly they wind
   * (radians an e-fold of the radius) and radians a second they turn */
  readonly spiral: number;
  readonly spiralArms: number;
  readonly spiralTwist: number;
  readonly spiralSpin: number;
}

/** Flat color of the sea: the screen behind the scene, seen until the wave maps have loaded */
export const SEA_COLOR = 0x1e6a8c;

/**
 * The sea's look, picked from the ten that were tried ("Glassy calm"): calm water, a long swell under fine ripples,
 * mirroring the sky strongly, with small sharp sun glitter. Livened up since: ripples running two ways, deeper and
 * shallower patches, cloud shadows drifting over it, gusts of rougher water with whitecaps, a soft sheen on the calm
 * and light playing on the floor of the shallows; and, for the story's sea, the Moon's light coming up from its glass
 * on the seabed, cold silver among the warm blues
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
  glass: {
    cell: 520,
    share: 0.4,
    reach: 0.5,
    amount: 0.65,
    deep: 0.4,
    color: 0xeaf6ff,
    halo: 0x9cc4ff,
    breath: 0.9,
    twinkle: 2.4,
    sparks: 0.8,
    sparkShare: 0.07,
    sparkCells: 22,
  },
  mark: {
    color: 0xffb547,
    under: 0.7,
    over: 0.25,
    bend: 0.14,
    pool: 4,
    ringWidth: 0.07,
    ringReach: 1.1,
    ringPeriod: 3.4,
    breath: 2.2,
    glints: 1.6,
    glintSharpness: 260,
  },
  boss: {
    color: 0xff3b2e,
    under: 0.6,
    over: 0.3,
    bend: 0.14,
    pool: 4,
    ringWidth: 0.07,
    ringReach: 1.1,
    ringPeriod: 2.2,
    breath: 3.4,
    glints: 1.6,
    glintSharpness: 260,
  },
  aura: {
    under: 0.7,
    over: 0.3,
    bend: 0.14,
    pool: 4.5,
    ringWidth: 0.11,
    ringReach: 1.2,
    ringPeriod: 2.6,
    firingPeriod: 1.1,
    breath: 2.6,
    glints: 1.6,
    glintSharpness: 260,
  },
  ink: {
    glow: 0x5a30d8,
    under: 0.75,
    over: 0.35,
    glints: 1.4,
    glintSharpness: 260,
    color: 0x0c0718,
    dark: 0.9,
    fray: 0.35,
    laceTile: 90,
    lightColor: 0x7d5cff,
    light: 0.22,
  },
  seam: {
    reach: 520,
    foot: 28,
    rough: 1.6,
    color: 0x0b3047,
    dark: 0.55,
    foam: 0.9,
    foamTile: 70,
    churn: 18,
  },
  vortex: {
    reach: 2.2,
    funnel: 0.8,
    dark: 0.72,
    steep: 0.45,
    curl: 1,
    twist: 2.6,
    spin: 0.8,
    pull: 1.5,
    arms: [
      { count: 7, drift: -0.12 },
      { count: 11, drift: 0.07 },
    ],
    ridges: 0.12,
    laceRound: 2,
    laceAlong: 1.3,
    foam: 0.9,
    rim: 0.5,
    rimWidth: 0.12,
    throat: 0.17,
    glow: 0xa66bff,
    shut: 0xff7055,
    eye: 0.15,
    bright: 0.7,
    breathe: 0.25,
    breath: 2,
    spiral: 0.8,
    spiralArms: 3,
    spiralTwist: 2,
    spiralSpin: 2.5,
  },
};
