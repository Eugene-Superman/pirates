import { islandOutline, type Island, type Palm } from '../game/World';
import type { Vec3 } from './Camera3D';
import { shadowPoint, type Painter3D } from './Painter3D';

const PALM_HEIGHT = 26;
const SHADOW_ALPHA = 0.18;

const COLORS = {
  shallow: 0x6fd0e0,
  sand: 0xe8d18f,
  cliff: 0xb08a55,
  grass: 0x4f9a3a,
  hill: 0x3f8a30,
  hillTop: 0x56a843,
  trunk: 0x7a5a32,
  palm: 0x2f6b25,
  palmLight: 0x4c8f3a,
};

function outline(island: Island, scale: number, z: number): Vec3[] {
  return islandOutline(island, scale).map((pt): Vec3 => [pt.x, pt.y, z]);
}

/** Flat parts of the island (shallows, beach, cliff shadow). Drawn together with the sea */
export function drawIslandGround(p: Painter3D, island: Island) {
  p.polygon(outline(island, 1.35, 0), COLORS.shallow, 0.4);
  p.polygon(outline(island, 1, 0), COLORS.sand);
  p.polygon(outline(island, 0.7, island.height).map((q) => shadowPoint(q)), 0x000000, SHADOW_ALPHA);
}

/** Raised parts: cliff, plateau, hill, palms */
export function drawIslandRaised(p: Painter3D, island: Island, time: number) {
  const plateau = outline(island, 0.7, island.height);
  p.sides(outline(island, 0.78, 0), plateau, COLORS.cliff);
  p.top(plateau, COLORS.grass);

  const parts: { depth: number; draw: () => void }[] = [];

  if (island.hillHeight > 0) {
    const hillTop = outline(island, 0.22, island.height + island.hillHeight);
    p.polygon(hillTop.map((q) => shadowPoint(q, island.height)), 0x000000, SHADOW_ALPHA);
    parts.push({
      depth: p.depth([island.x, island.y, island.height]),
      draw: () => {
        p.sides(outline(island, 0.42, island.height), hillTop, COLORS.hill);
        p.top(hillTop, COLORS.hillTop);
      },
    });
  }

  for (const palm of island.palms) {
    const top = palmTop(palm, island.height, time);
    p.polygon(leaves(shadowPoint(top, island.height), 12, 4, 0), 0x000000, SHADOW_ALPHA);
    parts.push({ depth: p.depth(top), draw: () => drawPalm(p, palm, island.height, top) });
  }

  parts.sort((a, b) => b.depth - a.depth);
  for (const part of parts) part.draw();
}

function palmTop(palm: Palm, groundZ: number, time: number): Vec3 {
  const sway = Math.sin(time * 1.5 + palm.x * 0.1) * 1.2;
  return [palm.x + palm.leanX + sway, palm.y + palm.leanY, groundZ + PALM_HEIGHT];
}

function drawPalm(p: Painter3D, palm: Palm, groundZ: number, top: Vec3) {
  p.line([palm.x, palm.y, groundZ], top, 2.6, COLORS.trunk);
  p.polygon(leaves(top, 13, 4, 5), COLORS.palm);
  p.polygon(leaves([top[0], top[1], top[2] + 1], 7, 3, 2), COLORS.palmLight);
}

// Star-shaped crown: leaf tips hang down by droop
function leaves(center: Vec3, outer: number, inner: number, droop: number): Vec3[] {
  const points: Vec3[] = [];
  for (let k = 0; k < 12; k++) {
    const angle = (k * Math.PI) / 6;
    const tip = k % 2 === 0;
    const r = tip ? outer : inner;
    points.push([center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r, center[2] - (tip ? droop : 0)]);
  }
  return points;
}
