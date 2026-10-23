import { coastAt, type Port } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import { footprint, shadowPoint, type Painter3D } from '../../render/Painter3D';

const COLORS = {
  plank: 0xa77b4f,
  plankSide: 0x7a5534,
  post: 0x5b3e24,
  wall: 0xe8dcc0,
  wallShade: 0xcbbd9c,
  door: 0x5b3e24,
  pole: 0x6b4a2a,
  flag: 0xd63a2f,
};
const ROOFS = [0xb5452f, 0x3f6f9a, 0x8a5a2b]; // the tavern's, the shop's, the harbour master's
const SHADOW_ALPHA = 0.18;

const PIER = { width: 7, height: 2.6, segments: 4, postEvery: 12 }; // world units
// The town's houses: where they stand (turned off the harbour's direction, radians, and a share of the coast's
// radius there out from the island's centre: the land's edge is at 0.7), their size (along, across, wall height,
// world units) and roof
const HOUSES = [
  { turn: 0, out: 0.42, size: [18, 14, 9], roof: 0 },
  { turn: 0.45, out: 0.45, size: [14, 12, 8], roof: 1 },
  { turn: -0.45, out: 0.45, size: [13, 11, 7], roof: 2 },
] as const;
const FLAG = { pole: 22, width: 9, height: 5 }; // world units

/** Something the scene sorts by depth and draws: a piece of the port */
export interface PortPiece {
  readonly depth: number;
  draw(p: Painter3D): void;
}

function at(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
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
  const ridge = [at(x - half * c, y - half * s, ridgeZ), at(x + half * c, y + half * s, ridgeZ)];
  const roof = ROOFS[house.roof];
  p.surface([roofBase[0], roofBase[1], ridge[1], ridge[0]], roof);
  p.surface([roofBase[3], roofBase[2], ridge[1], ridge[0]], roof);
  p.surface([eaves[0], eaves[3], ridge[0]], COLORS.wallShade);
  p.surface([eaves[1], eaves[2], ridge[1]], COLORS.wallShade);
}

/**
 * The port's pier and town, as pieces for the scene to sort with everything else: the pier in a few lengths (a ship
 * lies alongside its end), each house, the flag at the head of the pier. The island under them is an island
 */
export function portPieces(p: Painter3D, port: Port, time: number): PortPiece[] {
  const pieces: PortPiece[] = [];
  const { pierRoot, pierEnd, island, harbour } = port;
  const dx = (pierEnd.x - pierRoot.x) / PIER.segments;
  const dy = (pierEnd.y - pierRoot.y) / PIER.segments;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  for (let k = 0; k < PIER.segments; k++) {
    const x = pierRoot.x + dx * (k + 0.5);
    const y = pierRoot.y + dy * (k + 0.5);
    pieces.push({
      depth: p.depth([x, y, PIER.height]),
      draw: (painter) => {
        const deck = footprint(x, y, PIER.height, length + 0.4, PIER.width, angle);
        painter.polygon(
          deck.map((q) => [q[0], q[1], 0]),
          0x000000,
          SHADOW_ALPHA,
        );
        for (let t = 0; t <= length; t += PIER.postEvery) {
          for (const side of [-1, 1]) {
            const u = -length / 2 + t;
            const v = (side * PIER.width) / 2;
            const px = x + u * Math.cos(angle) - v * Math.sin(angle);
            const py = y + u * Math.sin(angle) + v * Math.cos(angle);
            painter.line([px, py, -1], [px, py, PIER.height], 1.6, COLORS.post);
          }
        }
        painter.sides(footprint(x, y, PIER.height - 0.8, length + 0.4, PIER.width, angle), deck, COLORS.plankSide);
        painter.top(deck, COLORS.plank);
      },
    });
  }

  for (const house of HOUSES) {
    const turn = harbour + house.turn;
    const out = island.radius * coastAt(island.shape, turn) * house.out;
    const x = island.x + Math.cos(turn) * out;
    const y = island.y + Math.sin(turn) * out;
    pieces.push({
      depth: p.depth([x, y, island.height + house.size[2] / 2]),
      draw: (painter) => drawHouse(painter, x, y, island.height, turn + Math.PI / 2, house),
    });
  }

  // A flag on the beach at the head of the pier, waving
  const base: Vec3 = [pierRoot.x, pierRoot.y, 0];
  const top: Vec3 = [base[0], base[1], base[2] + FLAG.pole];
  pieces.push({
    depth: p.depth([base[0], base[1], base[2] + FLAG.pole / 2]),
    draw: (painter) => {
      painter.line(base, top, 1.2, COLORS.pole);
      const wave = Math.sin(time * 3) * 1.5;
      const fly = harbour + Math.PI / 2;
      const fx = Math.cos(fly) * FLAG.width;
      const fy = Math.sin(fly) * FLAG.width;
      painter.surface(
        [
          top,
          [top[0] + fx, top[1] + fy, top[2] + wave * 0.3],
          [top[0] + fx, top[1] + fy, top[2] - FLAG.height + wave * 0.3],
          [top[0], top[1], top[2] - FLAG.height],
        ],
        COLORS.flag,
      );
    },
  });
  return pieces;
}
