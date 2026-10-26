import { WALL_THICKNESS, type HarbourWall, type Port } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import { footprint, shade, shadowPoint, type Painter3D } from '../../render/Painter3D';

const COLORS = {
  stone: 0xa39d90,
  stoneSide: 0x7d776b,
  quay: 0xb3ab9a,
  quaySide: 0x8a8273,
  wall: 0xe8dcc0,
  wallShade: 0xcbbd9c,
  tower: 0xf1ede2,
  band: 0xc0392b,
  lamp: 0xffd76a,
  pole: 0x6b4a2a,
  flag: 0xd63a2f,
};
const ROOFS = [0xb5452f, 0x3f6f9a, 0x8a5a2b, 0x9a4a3a, 0x5f7f4f]; // the tavern's, the shop's, the harbour master's…
const SHADOW_ALPHA = 0.18;

const WALL_HEIGHT = 6; // world units above the water
const WALL_STEP = 24; // world units: a wall is drawn in lengths about this long, each sorted with the other objects
const BLOCK_SHADE = 0.05; // how much one length's stones differ from the next's
const QUAY = { depth: 14, height: 3 }; // world units: the quay's stones on the beach, behind its edge
// The town's houses, in the harbour's frame: how far back from the back of the quay (world units: a row along the
// beach, two more up on the land), where along it (world units from the middle), their size (along the quay, across, wall
// height) and roof
const HOUSES = [
  { back: 24, at: -58, size: [20, 13, 9], roof: 0, onLand: false },
  { back: 23, at: 0, size: [16, 12, 8], roof: 1, onLand: false },
  { back: 24, at: 58, size: [18, 12, 10], roof: 2, onLand: false },
  { back: 95, at: -62, size: [15, 12, 8], roof: 3, onLand: true },
  { back: 98, at: 64, size: [14, 11, 7], roof: 4, onLand: true },
] as const;
const LIGHTHOUSE = { size: 9, height: 26, band: 5, lamp: 3.2 }; // world units, on the first wall's head
const FLAG = { pole: 22, width: 9, height: 5 }; // world units, on the second wall's head

/** Something the scene sorts by depth and draws: a piece of the port */
export interface PortPiece {
  readonly depth: number;
  draw(p: Painter3D): void;
}

/** A straight length of a wall or the quay */
interface Piece {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

/** A box of stones along a piece of wall, from under the water up to `height`; its shadow on the water first */
function drawStones(p: Painter3D, piece: Piece, across: number, height: number, top: number, side: number) {
  const dx = piece.to.x - piece.from.x;
  const dy = piece.to.y - piece.from.y;
  const x = (piece.from.x + piece.to.x) / 2;
  const y = (piece.from.y + piece.to.y) / 2;
  const angle = Math.atan2(dy, dx);
  // A little longer than the piece: the lengths overlap, so no seam shows between them
  const along = Math.hypot(dx, dy) + 0.4;
  const upper = footprint(x, y, height, along, across, angle);
  p.polygon(
    upper.map((q) => shadowPoint(q)),
    0x000000,
    SHADOW_ALPHA,
  );
  p.sides(footprint(x, y, -1, along, across, angle), upper, side);
  p.top(upper, top);
}

/** A line cut into straight lengths of about WALL_STEP: a long wall can't be sorted against a ship as one object */
function lengths(line: HarbourWall): Piece[] {
  const pieces: Piece[] = [];
  let from = line[0];
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    run += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
    if (run >= WALL_STEP || i === line.length - 1) {
      pieces.push({ from, to: line[i] });
      from = line[i];
      run = 0;
    }
  }
  return pieces;
}

function drawHouse(p: Painter3D, x: number, y: number, z: number, angle: number, house: (typeof HOUSES)[number]) {
  const [along, across, wall] = house.size;
  const base = footprint(x, y, z, along, across, angle);
  const eaves = footprint(x, y, z + wall, along, across, angle);
  p.polygon(
    eaves.map((q) => shadowPoint(q, z)),
    0x000000,
    SHADOW_ALPHA,
  );
  p.sides(base, eaves, COLORS.wall);
  // A pitched roof along the house: its ridge over the middle, overhanging the walls a little
  const roofBase = footprint(x, y, z + wall, along + 2, across + 3, angle);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const half = (along + 2) / 2;
  const ridgeZ = z + wall + across * 0.45;
  const ridge: Vec3[] = [
    [x - half * c, y - half * s, ridgeZ],
    [x + half * c, y + half * s, ridgeZ],
  ];
  const roof = ROOFS[house.roof];
  p.surface([roofBase[0], roofBase[1], ridge[1], ridge[0]], roof);
  p.surface([roofBase[3], roofBase[2], ridge[1], ridge[0]], roof);
  p.surface([eaves[0], eaves[3], ridge[0]], COLORS.wallShade);
  p.surface([eaves[1], eaves[2], ridge[1]], COLORS.wallShade);
}

/** A white tower with a red band at the top, and a lamp that glows brighter and dimmer */
function drawLighthouse(p: Painter3D, x: number, y: number, z: number, time: number) {
  const { size, height, band, lamp } = LIGHTHOUSE;
  const turn = Math.PI / 4;
  // No shadow: it would fall off the wall's head onto the water, where a flat one drawn at the wall's height floats
  const top = footprint(x, y, z + height, size * 0.8, size * 0.8, turn);
  const below = footprint(x, y, z + height - band, size * 0.84, size * 0.84, turn);
  p.sides(footprint(x, y, z, size, size, turn), below, COLORS.tower);
  p.sides(below, top, COLORS.band);
  p.top(top, COLORS.band);
  drawLampGlow(p, [x, y, z + height + lamp], time);
}

/** The lighthouse's lamp, glowing brighter and dimmer: on the vector lighthouse, and on the port's pictures */
export function drawLampGlow(p: Painter3D, light: Vec3, time: number) {
  const { lamp } = LIGHTHOUSE;
  const glow = 0.55 + 0.45 * Math.sin(time * 2.4);
  p.ball(light, lamp * 1.9, COLORS.lamp, 0.25 * glow);
  p.ball(light, lamp, COLORS.lamp, 0.6 + 0.4 * glow);
}

function drawFlag(p: Painter3D, x: number, y: number, z: number, fly: number, time: number) {
  const top: Vec3 = [x, y, z + FLAG.pole];
  p.line([x, y, z], top, 1.2, COLORS.pole);
  drawPennant(p, top, fly, time);
}

/** A flag flying from the top of its staff, `fly` radians on the map, waving: on the vector port and its pictures */
export function drawPennant(p: Painter3D, top: Vec3, fly: number, time: number) {
  const wave = Math.sin(time * 3) * 1.5;
  const fx = Math.cos(fly) * FLAG.width;
  const fy = Math.sin(fly) * FLAG.width;
  p.surface(
    [
      top,
      [top[0] + fx, top[1] + fy, top[2] + wave * 0.3],
      [top[0] + fx, top[1] + fy, top[2] - FLAG.height + wave * 0.3],
      [top[0], top[1], top[2] - FLAG.height],
    ],
    COLORS.flag,
  );
}

/**
 * The port's harbour and town, as pieces for the scene to sort with everything else: the two walls in lengths (ships
 * sail in between them), their heads with a lighthouse and a flag, the quay round the back of the bay, the houses
 * behind it and up on the land. The island under them is an island, its coast running round the walls
 */
export function portPieces(p: Painter3D, port: Port, time: number): PortPiece[] {
  const pieces: PortPiece[] = [];
  const { island, harbour, walls, quay } = port;
  const out = { x: Math.cos(harbour), y: Math.sin(harbour) };
  const side = { x: -out.y, y: out.x };
  // How far out from the island's centre the back of the quay is; a point of the town, `back` from it and `at` along it
  const edge = Math.min(...quay.map((q) => (q.x - island.x) * out.x + (q.y - island.y) * out.y));
  const town = (back: number, at: number) => ({
    x: island.x + out.x * (edge - back) + side.x * at,
    y: island.y + out.y * (edge - back) + side.y * at,
  });

  const stones = (piece: Piece, k: number, across: number, height: number, top: number, sides: number) => {
    const x = (piece.from.x + piece.to.x) / 2;
    const y = (piece.from.y + piece.to.y) / 2;
    const block = shade(top, k % 2 === 0 ? 1 - BLOCK_SHADE : 1 + BLOCK_SHADE);
    pieces.push({
      depth: p.depth([x, y, height / 2]),
      draw: (painter) => drawStones(painter, piece, across, height, block, sides),
    });
  };
  for (const wall of walls) {
    lengths(wall).forEach((piece, k) => stones(piece, k, WALL_THICKNESS, WALL_HEIGHT, COLORS.stone, COLORS.stoneSide));
  }
  // The quay: stones laid on the shore behind its edge, from one wall to the other
  const inland = (q: { x: number; y: number }) => {
    const length = Math.hypot(island.x - q.x, island.y - q.y);
    return {
      x: q.x + ((island.x - q.x) / length) * (QUAY.depth / 2),
      y: q.y + ((island.y - q.y) / length) * (QUAY.depth / 2),
    };
  };
  lengths(quay).forEach((piece, k) =>
    stones(
      { from: inland(piece.from), to: inland(piece.to) },
      k,
      QUAY.depth,
      QUAY.height,
      COLORS.quay,
      COLORS.quaySide,
    ),
  );

  for (const house of HOUSES) {
    const { x, y } = town(house.back, house.at);
    const z = house.onLand ? island.height : 0;
    pieces.push({
      depth: p.depth([x, y, z + house.size[2] / 2]),
      draw: (painter) => drawHouse(painter, x, y, z, harbour + Math.PI / 2, house),
    });
  }

  const light = walls[0][walls[0].length - 1];
  pieces.push({
    depth: p.depth([light.x, light.y, WALL_HEIGHT + LIGHTHOUSE.height / 2]),
    draw: (painter) => drawLighthouse(painter, light.x, light.y, WALL_HEIGHT, time),
  });
  const flag = walls[1][walls[1].length - 1];
  pieces.push({
    depth: p.depth([flag.x, flag.y, WALL_HEIGHT + FLAG.pole / 2]),
    draw: (painter) => drawFlag(painter, flag.x, flag.y, WALL_HEIGHT, harbour + Math.PI / 2, time),
  });
  return pieces;
}
