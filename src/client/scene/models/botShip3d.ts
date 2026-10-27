import type { Mount, ShipClassId } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';

/** Where a ship is and how it moves, as much as its model needs: a bot's ship, or the wreck of one */
export interface ShipPose {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  /** World units per second: it heels and its flag streams a little more when fast */
  readonly speed: number;
}

interface ShipLook {
  /** Deck outline seen from above, ship coordinates (x to the bow, y to starboard), world units */
  readonly outline: readonly (readonly [number, number])[];
  /** World units above the water */
  readonly deckZ: number;
  readonly colors: {
    readonly hull: number;
    readonly deck: number;
    readonly stripe: number;
    readonly mast: number;
    readonly sail: number;
    /** The sail's edges, so a dark sail still reads against the sea */
    readonly trim: number;
    readonly flag: number | null;
    /** A mark on the flag: a pirate's skull */
    readonly flagMark: number | null;
  };
  readonly mastX: number;
  readonly mastHeight: number;
  /** A square sail across the ship, or a triangular one along it (a fishing boat's) */
  readonly sail: 'square' | 'lateen';
  readonly sailWidth: number;
  /** A second mast before the main one, with a sail of its own (a brig's) */
  readonly foremast?: { readonly x: number; readonly height: number; readonly sailWidth: number };
  /** Cargo on deck: crates (a merchant's) or net floats (a fisher's) */
  readonly deckLoad: 'crates' | 'nets' | null;
}

// Every bot ship is drawn from its atlases (BotSprites); its look here draws it until they have loaded, and gives its
// height for its hit point bar (botShipTop)
// prettier-ignore
const LOOKS: Readonly<Partial<Record<ShipClassId, ShipLook>>> = {
  fishingBoat: {
    outline: [[10, 0], [7, 3.2], [1.5, 4.1], [-5.5, 3.8], [-8.8, 2.7], [-8.8, -2.7], [-5.5, -3.8], [1.5, -4.1], [7, -3.2]],
    deckZ: 2.2,
    colors: { hull: 0x8f5d35, deck: 0xb0814f, stripe: 0xe8dcc0, mast: 0x5e4126, sail: 0xd8c49a, trim: 0xa88e60, flag: null, flagMark: null },
    mastX: 2,
    mastHeight: 12,
    sail: 'lateen',
    sailWidth: 8,
    deckLoad: 'nets',
  },
  merchantSloop: {
    outline: [[14.5, 0], [10.5, 4.4], [3.5, 5.6], [-6.5, 5.4], [-12.5, 4.1], [-13.8, 2.3], [-13.8, -2.3], [-12.5, -4.1], [-6.5, -5.4], [3.5, -5.6], [10.5, -4.4]],
    deckZ: 3.1,
    colors: { hull: 0x9a6b3f, deck: 0xc49a64, stripe: 0x2e5f8a, mast: 0x5e4126, sail: 0xf2ead8, trim: 0xb9ad92, flag: 0x2e7bd6, flagMark: null },
    mastX: 1.5,
    mastHeight: 20,
    sail: 'square',
    sailWidth: 14,
    deckLoad: 'crates',
  },
  smugglerSloop: {
    outline: [[15.5, 0], [11, 4.5], [3.4, 5.8], [-6.6, 5.6], [-12.8, 4.2], [-14.5, 2.4], [-14.5, -2.4], [-12.8, -4.2], [-6.6, -5.6], [3.4, -5.8], [11, -4.5]],
    deckZ: 3.2,
    colors: { hull: 0x3b2a20, deck: 0x6e5238, stripe: 0xb03a2e, mast: 0x2e2018, sail: 0x2b2b30, trim: 0x77777f, flag: 0x111111, flagMark: 0xf2f2f2 },
    mastX: 1,
    mastHeight: 21,
    sail: 'square',
    sailWidth: 15,
    deckLoad: null,
  },
  // The Smuggler Baron's: a long black hull with a red stripe, two masts of dark sails, his flag on the main. Its
  // atlases (the smuggler's ship made bigger, with red sails) reach higher: this mast puts the hit point bar over them
  baronBrig: {
    outline: [[22, 0], [16.5, 5.6], [6, 7.6], [-8, 7.4], [-17.5, 6], [-20.5, 3.4], [-20.5, -3.4], [-17.5, -6], [-8, -7.4], [6, -7.6], [16.5, -5.6]],
    deckZ: 4.2,
    colors: { hull: 0x241a16, deck: 0x5b4330, stripe: 0xc0392b, mast: 0x2e2018, sail: 0x1f1f26, trim: 0x8a2a22, flag: 0x8a1a12, flagMark: 0xf2d24b },
    mastX: -3,
    mastHeight: 29.5,
    sail: 'square',
    sailWidth: 19,
    deckLoad: 'crates',
    foremast: { x: 9, height: 23, sailWidth: 16 },
  },
  // The seas' new ships, drawn only from these looks until they are modelled: a pirate brig with a gold stripe and
  // brown sails; a warship, a sea's elite, under white sails and a red flag; a pirate flagship, a sea's boss, under
  // blood-red sails
  pirateBrig: {
    outline: [[19, 0], [14, 5.1], [4, 6.6], [-8, 6.4], [-15.5, 4.9], [-18, 2.8], [-18, -2.8], [-15.5, -4.9], [-8, -6.4], [4, -6.6], [14, -5.1]],
    deckZ: 3.8,
    colors: { hull: 0x2d2420, deck: 0x6a4d33, stripe: 0xd4a23a, mast: 0x2e2018, sail: 0x5a4636, trim: 0x8a7a66, flag: 0x111111, flagMark: 0xf2f2f2 },
    mastX: -2,
    mastHeight: 25,
    sail: 'square',
    sailWidth: 17,
    deckLoad: null,
    foremast: { x: 8, height: 20, sailWidth: 14 },
  },
  warship: {
    outline: [[27, 0], [20, 6.6], [7, 8.6], [-10, 8.4], [-21, 6.8], [-25, 3.8], [-25, -3.8], [-21, -6.8], [-10, -8.4], [7, -8.6], [20, -6.6]],
    deckZ: 5,
    colors: { hull: 0x3b2f2a, deck: 0x7a5a3a, stripe: 0xe8dcc0, mast: 0x3a2a1c, sail: 0xece4d0, trim: 0xa89a80, flag: 0x8a1c14, flagMark: 0x111111 },
    mastX: -2,
    mastHeight: 32,
    sail: 'square',
    sailWidth: 21,
    deckLoad: null,
    foremast: { x: 11, height: 26, sailWidth: 17 },
  },
  flagship: {
    outline: [[31, 0], [23, 7.6], [8, 10], [-12, 9.8], [-24, 8], [-29, 4.4], [-29, -4.4], [-24, -8], [-12, -9.8], [8, -10], [23, -7.6]],
    deckZ: 5.8,
    colors: { hull: 0x1c1414, deck: 0x5a3e2a, stripe: 0xc9a227, mast: 0x241810, sail: 0x6a1616, trim: 0x2a0a0a, flag: 0x111111, flagMark: 0xf2d24b },
    mastX: -4,
    mastHeight: 36,
    sail: 'square',
    sailWidth: 23,
    deckLoad: 'crates',
    foremast: { x: 12, height: 29, sailWidth: 19 },
  },
};

const KEEL_SHARE = 0.75; // the hull narrows to this share of the deck at the waterline
const STRIPE_SHARE = 0.68; // height of the painted stripe, as a share of the deck's
const ROCK = 0.05; // radians it rolls on the waves
const SHAKE = 0.3; // radians it rolls when hit, dying out over the shake
const BOB = 0.35; // world units
const HEEL = 0.0006; // radians of heel per world unit per second of speed
const SINK_ROLL = 0.05; // radians of roll per world unit it has gone down: a wreck keels over
const GUN = { color: 0x2a2a2a, width: 0.9, out: 1.6 }; // barrels run out over the rail, world units
const CRATE = { color: 0x9b7447, size: 2.2 };
const FLOAT = { color: 0xe85c3a, radius: 0.55 };

/** How high a ship's model reaches (the top of its mast), world units; undefined for a class without a model here */
export function botShipTop(classId: ShipClassId) {
  const look = LOOKS[classId];
  return look && look.deckZ + look.mastHeight;
}

/**
 * A bot's ship: a hull with a painted stripe, a mast with its sail and flag, its guns run out over the rail and what
 * it carries on deck. Vector-drawn from its class's look. shake: 1 right after a hit, then 0; sink:
 * world units a wreck has gone down (0 afloat): what is under the water is pressed flat onto it, then not drawn
 */
export function drawBotShip(
  p: Painter3D,
  ship: ShipPose,
  classId: ShipClassId,
  guns: readonly Mount[],
  time: number,
  shake: number,
  sink = 0,
) {
  const look = LOOKS[classId];
  if (!look) return;
  const { x, y, heading } = ship;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const roll =
    ROCK * Math.sin(time * 1.4 + ship.id) + SHAKE * shake * Math.sin(shake * 16) + HEEL * ship.speed + SINK_ROLL * sink;
  const lift = BOB * Math.sin(time * 1.9 + ship.id) - sink;
  // Ship coordinates → world: roll around the keel line, turn by heading, bob, and nothing below the water
  const at = (lx: number, ly: number, lz: number): Vec3 => {
    const ry = ly - lz * roll;
    return [x + lx * cos - ry * sin, y + lx * sin + ry * cos, Math.max(0, lz + ly * roll + lift)];
  };
  const outline = (scale: number, z: number) => look.outline.map(([lx, ly]) => at(lx * scale, ly * scale, z));
  const { colors, deckZ } = look;

  if (sink < deckZ) {
    const stripe = deckZ * STRIPE_SHARE;
    const deck = outline(1, deckZ);
    p.sides(outline(KEEL_SHARE, -0.2), outline(0.93, stripe), colors.hull);
    p.sides(outline(0.93, stripe), outline(0.97, stripe + 0.3), colors.stripe);
    p.sides(outline(0.97, stripe + 0.3), deck, colors.hull);
    p.top(deck, colors.deck);
    drawGuns(p, guns, at, deckZ);
    drawDeckLoad(p, look, at);
  }
  drawRig(p, look, at, time + ship.id, ship.speed);
}

type At = (lx: number, ly: number, lz: number) => Vec3;

/** Every gun slot's barrel run out on both sides: a bot fires from whichever faces its target */
function drawGuns(p: Painter3D, guns: readonly Mount[], at: At, deckZ: number) {
  for (const gun of guns) {
    const side = Math.abs(gun.y);
    for (const s of [1, -1]) {
      p.line(
        at(gun.x, s * (side - 0.6), deckZ + 0.8),
        at(gun.x, s * (side + GUN.out), deckZ + 0.9),
        GUN.width,
        GUN.color,
      );
    }
  }
}

function drawDeckLoad(p: Painter3D, look: ShipLook, at: At) {
  const z = look.deckZ;
  if (look.deckLoad === 'crates') {
    for (const [cx, cy] of [
      [-5, 1.6],
      [-5, -1.4],
      [6, 0],
    ] as const) {
      const h = CRATE.size / 2;
      const ring = (lz: number) => [
        at(cx - h, cy - h, lz),
        at(cx + h, cy - h, lz),
        at(cx + h, cy + h, lz),
        at(cx - h, cy + h, lz),
      ];
      p.sides(ring(z), ring(z + CRATE.size), CRATE.color);
      p.top(ring(z + CRATE.size), CRATE.color);
    }
  } else if (look.deckLoad === 'nets') {
    for (let i = 0; i < 6; i++) {
      const lx = -7.5 + i * 1.3;
      p.ball(at(lx, i % 2 === 0 ? 2.6 : -2.6, z + 0.4), FLOAT.radius, FLOAT.color);
    }
  }
}

/** The masts, their sails and the flag on the main one, sorted against each other so the nearer is drawn last */
function drawRig(p: Painter3D, look: ShipLook, at: At, phase: number, speed: number) {
  const { colors, deckZ, mastX, mastHeight } = look;
  const top = deckZ + mastHeight;
  const parts: { depth: number; draw: () => void }[] = [];
  mastParts(p, look, at, parts, mastX, mastHeight, look.sailWidth);
  if (look.foremast) mastParts(p, look, at, parts, look.foremast.x, look.foremast.height, look.foremast.sailWidth);

  if (colors.flag !== null) {
    const { flag, flagMark } = colors;
    const head = at(mastX, 0, top);
    const wave = Math.sin(phase * 6) * 0.6;
    const stream = 3.4 + Math.min(speed / 60, 1);
    parts.push({
      depth: p.depth(head) - 1,
      draw: () => {
        p.surface([at(mastX, 0, top + 0.2), at(mastX - stream, wave, top - 0.9), at(mastX, 0, top - 2.2)], flag);
        if (flagMark !== null) p.ball(at(mastX - stream * 0.35, wave * 0.35, top - 1), 0.45, flagMark);
      },
    });
  }
  parts.sort((a, b) => b.depth - a.depth);
  for (const part of parts) part.draw();
}

/** A mast at `mastX` along the ship, `mastHeight` over the deck, and its sail, `sailWidth` across */
function mastParts(
  p: Painter3D,
  look: ShipLook,
  at: At,
  parts: { depth: number; draw: () => void }[],
  mastX: number,
  mastHeight: number,
  sailWidth: number,
) {
  const { colors, deckZ } = look;
  const top = deckZ + mastHeight;
  const foot = at(mastX, 0, deckZ);
  const head = at(mastX, 0, top);
  parts.push({
    depth: p.depth(at(mastX, 0, deckZ + mastHeight / 2)),
    draw: () => p.line(foot, head, 0.7, colors.mast),
  });

  if (look.sail === 'square') {
    // Across the ship, bellied forward by the wind
    const yard = top - 2;
    const hem = deckZ + mastHeight * 0.3;
    const belly = 1.6;
    const half = sailWidth / 2;
    const middle = (yard + hem) / 2;
    const upper = [
      at(mastX, -half, yard),
      at(mastX, half, yard),
      at(mastX + belly, half * 0.95, middle),
      at(mastX + belly, -half * 0.95, middle),
    ];
    const lower = [
      at(mastX + belly, -half * 0.95, middle),
      at(mastX + belly, half * 0.95, middle),
      at(mastX + belly * 0.4, half * 0.9, hem),
      at(mastX + belly * 0.4, -half * 0.9, hem),
    ];
    parts.push({
      depth: p.depth(at(mastX + belly, 0, middle)),
      draw: () => {
        p.surface(upper, colors.sail);
        p.surface(lower, colors.sail);
        // Its edges: the leeches down the sides, through the belly's corner, and the foot
        for (const [peak, corner, clew] of [
          [upper[1], upper[2], lower[2]],
          [upper[0], upper[3], lower[3]],
        ]) {
          p.curve(peak, through(peak, corner, clew), clew, 0.35, colors.trim);
        }
        p.line(lower[2], lower[3], 0.35, colors.trim);
        p.line(at(mastX, -half - 0.5, yard), at(mastX, half + 0.5, yard), 0.45, colors.mast);
      },
    });
  } else {
    // A lateen sail: a triangle along the ship from the masthead back to the boom's end
    const sail = [at(mastX, 0, top - 0.5), at(mastX - sailWidth, 0.6, deckZ + 1.6), at(mastX - 0.3, 0.2, deckZ + 1.4)];
    parts.push({
      depth: p.depth(at(mastX - sailWidth / 3, 0.3, deckZ + mastHeight / 2)),
      draw: () => p.surface(sail, colors.sail),
    });
  }
}

/** The control point of a quadratic curve from a to b that passes through m halfway */
function through(a: Vec3, m: Vec3, b: Vec3): Vec3 {
  return [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2, 2 * m[2] - (a[2] + b[2]) / 2];
}
