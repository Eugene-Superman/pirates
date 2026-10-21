import type { Ship } from '../game/Ship';
import type { Vec3 } from './Camera3D';
import { shadowPoint, type Painter3D } from './Painter3D';

// Ship coordinates: x towards the bow, y towards starboard, z up from the water
const DECK_Z = 10;
const BAND_Z = 7;
// prettier-ignore
const DECK: [number, number][] = [
  [42, 0], [30, 8], [12, 13], [-10, 13], [-30, 11], [-36, 8],
  [-36, -8], [-30, -11], [-10, -13], [12, -13], [30, -8],
];
// The hull narrows towards the bottom
const WATERLINE = DECK.map(([x, y]): [number, number] => [x * 0.92, y * 0.78]);
const BAND = DECK.map(([x, y], i): [number, number] => {
  const [wx, wy] = WATERLINE[i];
  const t = BAND_Z / DECK_Z;
  return [wx + (x - wx) * t, wy + (y - wy) * t];
});

interface Sail {
  bottom: number;
  top: number;
  halfWidth: number;
}

interface Mast {
  x: number;
  height: number;
  flag: boolean;
  sails: Sail[];
}

const MASTS: Mast[] = [
  {
    x: 14,
    height: 56,
    flag: false,
    sails: [
      { bottom: 12, top: 32, halfWidth: 15 },
      { bottom: 34, top: 48, halfWidth: 11 },
    ],
  },
  {
    x: -8,
    height: 64,
    flag: true,
    sails: [
      { bottom: 14, top: 38, halfWidth: 18 },
      { bottom: 40, top: 56, halfWidth: 13 },
    ],
  },
];

const SAIL_BRACE = 0.25; // yards are turned slightly so the sails are visible from the side too
const SAIL_BULGE = 7;
const SAIL_COLUMNS = 6;
const SAIL_ROWS = 3;
const SHADOW_ALPHA = 0.18;

const COLORS = {
  hull: 0x6b4423,
  band: 0xb8863b,
  deck: 0xa8743f,
  plank: 0x8a5a2e,
  castle: 0x7a4e29,
  mast: 0x4a2f17,
  sail: 0xf2ecd9,
  port: 0x1d1209,
  flag: 0x151515,
};

type ShipPoint = (x: number, y: number, z: number) => Vec3;

// Converts ship coordinates to world ones, with bobbing on the waves and heeling in turns
function shipTransform(ship: Ship, time: number): ShipPoint {
  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  const roll = Math.sin(time * 1.3) * 0.04 - ship.turnRate * (ship.speed / ship.maxSpeed) * 0.12;
  const rollCos = Math.cos(roll);
  const rollSin = Math.sin(roll);
  const bob = Math.sin(time * 2.1) * 0.8;

  return (lx, ly, lz) => {
    const y = ly * rollCos - lz * rollSin;
    const z = ly * rollSin + lz * rollCos + bob;
    return [ship.x + lx * cos - y * sin, ship.y + lx * sin + y * cos, z];
  };
}

export function drawShipShadow(p: Painter3D, ship: Ship, time: number) {
  const point = shipTransform(ship, time);
  const shadow = (x: number, y: number, z: number) => shadowPoint(point(x, y, z));

  p.polygon(
    DECK.map(([x, y]) => shadow(x, y, DECK_Z)),
    0x000000,
    SHADOW_ALPHA,
  );
  for (const mast of MASTS) {
    p.line(shadow(mast.x, 0, DECK_Z), shadow(mast.x, 0, DECK_Z + mast.height), 2.5, 0x000000, SHADOW_ALPHA);
    for (const sail of mast.sails) {
      p.polygon(
        sailOutline(mast, sail).map(([x, y, z]) => shadow(x, y, z)),
        0x000000,
        SHADOW_ALPHA,
      );
    }
  }
}

export function drawShip(p: Painter3D, ship: Ship, time: number) {
  const point = shipTransform(ship, time);
  const deck = DECK.map(([x, y]) => point(x, y, DECK_Z));

  p.sides(
    WATERLINE.map(([x, y]) => point(x, y, 0)),
    BAND.map(([x, y]) => point(x, y, BAND_Z)),
    COLORS.hull,
  );
  p.sides(
    BAND.map(([x, y]) => point(x, y, BAND_Z)),
    deck,
    COLORS.band,
  );
  drawGunports(p, point);
  p.top(deck, COLORS.deck);
  for (const y of [-5, 0, 5]) {
    p.line(point(-32, y, DECK_Z), point(30, y, DECK_Z), 0.6, COLORS.plank);
  }

  // Everything above the deck is drawn from far to near
  const parts = [
    { depth: p.depth(point(-28, 0, DECK_Z + 3)), draw: () => drawCastle(p, point) },
    { depth: p.depth(point(38, 0, DECK_Z + 15)), draw: () => drawJib(p, point) },
  ];
  for (const mast of MASTS) {
    parts.push({
      depth: p.depth(point(mast.x, 0, DECK_Z + mast.height / 2)),
      draw: () => drawMast(p, point, mast, time),
    });
    for (const sail of mast.sails) {
      const [cx, cy, cz] = sailPoint(mast, sail, SAIL_COLUMNS / 2, SAIL_ROWS / 2);
      parts.push({ depth: p.depth(point(cx, cy, cz)), draw: () => drawSail(p, point, mast, sail) });
    }
  }

  parts.sort((a, b) => b.depth - a.depth);
  for (const part of parts) part.draw();
}

function drawGunports(p: Painter3D, point: ShipPoint) {
  const center = point(0, 0, 5);
  const ports = [
    { x: -20, halfWidth: 12 },
    { x: -6, halfWidth: 13 },
    { x: 8, halfWidth: 13 },
  ];

  for (const side of [-1, 1]) {
    for (const { x, halfWidth } of ports) {
      // The side widens from the waterline (0.78 of the width) up to the deck
      const y = (z: number) => side * (halfWidth * (0.78 + (0.22 * z) / DECK_Z) + 0.3);
      const quad = [point(x - 2.5, y(3), 3), point(x + 2.5, y(3), 3), point(x + 2.5, y(6), 6), point(x - 2.5, y(6), 6)];
      if (p.facesCamera(quad, center)) p.polygon(quad, COLORS.port);
    }
  }
}

function drawCastle(p: Painter3D, point: ShipPoint) {
  const rect: [number, number][] = [
    [-35, -9],
    [-21, -9],
    [-21, 9],
    [-35, 9],
  ];
  const top = rect.map(([x, y]) => point(x, y, DECK_Z + 7));
  p.sides(
    rect.map(([x, y]) => point(x, y, DECK_Z)),
    top,
    COLORS.castle,
  );
  p.top(top, COLORS.deck);
}

function drawJib(p: Painter3D, point: ShipPoint) {
  p.line(point(36, 0, DECK_Z), point(56, 0, DECK_Z + 9), 2, COLORS.mast);
  p.surface([point(54, 0, DECK_Z + 8), point(24, 0, DECK_Z + 38), point(34, 0, DECK_Z + 2)], COLORS.sail, 0.85, 0.2);
}

function drawMast(p: Painter3D, point: ShipPoint, mast: Mast, time: number) {
  const top = DECK_Z + mast.height;
  p.line(point(mast.x, 0, DECK_Z), point(mast.x, 0, top), 2.6, COLORS.mast);

  if (mast.flag) {
    // The flag streams backwards
    const near = Math.sin(time * 7) * 1.5;
    const far = Math.sin(time * 7 - 1) * 2.5;
    p.surface(
      [
        point(mast.x, 0, top),
        point(mast.x - 7, near, top - 0.5),
        point(mast.x - 14, far, top - 1),
        point(mast.x - 14, far, top - 7),
        point(mast.x - 7, near, top - 6.5),
        point(mast.x, 0, top - 6),
      ],
      COLORS.flag,
    );
  }
}

// Sail grid point: i across (0..COLUMNS), j bottom to top (0..ROWS)
function sailPoint(mast: Mast, sail: Sail, i: number, j: number): Vec3 {
  const s = (i / SAIL_COLUMNS) * 2 - 1;
  const v = (j / SAIL_ROWS) * 2 - 1;
  const across = s * sail.halfWidth;
  const bulge = SAIL_BULGE * (1 - s * s) * (1 - 0.4 * v * v);
  return [
    mast.x + bulge * Math.cos(SAIL_BRACE) - across * Math.sin(SAIL_BRACE),
    bulge * Math.sin(SAIL_BRACE) + across * Math.cos(SAIL_BRACE),
    DECK_Z + sail.bottom + ((sail.top - sail.bottom) * j) / SAIL_ROWS,
  ];
}

function sailOutline(mast: Mast, sail: Sail): Vec3[] {
  const outline: Vec3[] = [];
  for (let i = 0; i <= SAIL_COLUMNS; i++) outline.push(sailPoint(mast, sail, i, SAIL_ROWS));
  for (let i = SAIL_COLUMNS; i >= 0; i--) outline.push(sailPoint(mast, sail, i, 0));
  return outline;
}

function drawSail(p: Painter3D, point: ShipPoint, mast: Mast, sail: Sail) {
  const grid: Vec3[][] = [];
  for (let j = 0; j <= SAIL_ROWS; j++) {
    const row: Vec3[] = [];
    for (let i = 0; i <= SAIL_COLUMNS; i++) {
      const [x, y, z] = sailPoint(mast, sail, i, j);
      row.push(point(x, y, z));
    }
    grid.push(row);
  }

  // The sail is curved, so its patches are depth-sorted too
  const quads: { points: Vec3[]; depth: number }[] = [];
  for (let j = 0; j < SAIL_ROWS; j++) {
    for (let i = 0; i < SAIL_COLUMNS; i++) {
      const points = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
      quads.push({ points, depth: p.averageDepth(points) });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  // Cloth lets light through, so sails are lighter and more softly shaded than wood
  for (const quad of quads) p.surface(quad.points, COLORS.sail, 0.85, 0.2);

  // Yard along the top edge
  const yard = sail.halfWidth + 2;
  const top = DECK_Z + sail.top;
  p.line(
    point(mast.x + yard * Math.sin(SAIL_BRACE), -yard * Math.cos(SAIL_BRACE), top),
    point(mast.x - yard * Math.sin(SAIL_BRACE), yard * Math.cos(SAIL_BRACE), top),
    1.6,
    COLORS.mast,
  );
}
