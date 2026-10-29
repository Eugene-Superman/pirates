import type { Graphics } from 'pixi.js';
import type { StoryMark, Unit } from '../../../game';
import type { ArrowId, IconSprites } from '../../hud/iconAtlas';
import type { Camera3D } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = {
  glow: 0xffd36b, // the lighthouse's gold: the story's colour
  buoy: 0xe8dcc0,
  band: 0xc0392b,
  post: 0x3a2a1c,
  lamp: 0xfff1b8,
  edge: 0x3a2400, // the dark edge round the chevron and the pointer, to stand out on bright water
};
// World units: the buoy in the middle, its post and the lamp on it; a placeholder till a buoy is modelled
const BUOY = { radius: 3.2, post: 9, lamp: 1.6 } as const;
// A unit the story asks the player to sink: a gold ring on the water round it (world units beyond its size), and a
// gold arrow over its hit point bar pointing down at it (pixels: the painted one's size; the one drawn till it loads,
// across and high; how far over the unit's top its tip is, its bob and how fast)
const TARGET_RING = { pad: 8, width: 1.6, alpha: 0.75 } as const;
const CHEVRON = { size: 11, width: 6, height: 4, lift: 14, bob: 2, period: 1.1 } as const;
// Pixels: the pointer round the player's ship towards where the story sends them when it is off the screen (how far
// in from the screen's edge counts as on it), how far from the ship it goes round, its painted arrow's size, the one
// drawn till it loads (long and wide), and its bob towards it. Round the ship, not at the screen's edge, where the
// HUD's plates would hide it
const POINTER = { margin: 40, orbit: 70, size: 14, length: 8, width: 8, bob: 3, period: 0.9 } as const;
// The painted arrows: the pointer's points up, turned to the goal; the one over the prey points down
const ARROW_IDS = { pointer: 'upGold', chevron: 'downGold' } as const satisfies Readonly<Record<string, ArrowId>>;

/**
 * Where the story sends the player (story/story.ts): a buoy there with its lamp lit (not in the harbour, which has its
 * quay). Drawn with the sea; its light, in the water and a pillar over it, is effects/Beacon.ts's
 */
export function drawStoryMark(p: Painter3D, mark: StoryMark, time: number) {
  if (mark.id === 'port') return;
  const { x, y } = mark;
  const bob = 0.4 * Math.sin(time * 1.8);
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  p.line([x, y, 0], [x, y, BUOY.post + bob], 0.8, COLORS.post);
  p.ball([x, y, BUOY.radius + bob], BUOY.radius, COLORS.buoy);
  p.ball([x, y, BUOY.radius * 1.5 + bob], BUOY.radius * 0.7, COLORS.band);
  p.ball([x, y, BUOY.post + bob], BUOY.lamp * (1 + 0.3 * pulse), COLORS.lamp);
}

/** The gold ring on the water round a unit the story asks the player to sink, breathing */
export function drawStoryTargetWater(p: Painter3D, unit: Unit, time: number) {
  const pulse = 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / CHEVRON.period);
  const radius = unit.hull.bow + TARGET_RING.pad;
  p.ring(unit.x, unit.y, 0, radius, TARGET_RING.width, COLORS.glow, TARGET_RING.alpha * (0.55 + 0.45 * pulse));
}

/**
 * The gold arrow over such a unit, pointing down at it, painted (`arrows`; a chevron drawn on `g` till they load):
 * `top`, the screen point over its hit point bar
 */
export function drawStoryChevron(
  g: Graphics,
  arrows: IconSprites<ArrowId>,
  top: { x: number; y: number },
  time: number,
) {
  const bob = CHEVRON.bob * Math.sin((time * Math.PI * 2) / CHEVRON.period);
  const y = top.y - CHEVRON.lift + bob;
  if (arrows.put(ARROW_IDS.chevron, top.x, y - CHEVRON.size / 2, CHEVRON.size)) return;
  const { width, height } = CHEVRON;
  g.poly([top.x - width / 2, y - height, top.x + width / 2, y - height, top.x, y])
    .fill({ color: COLORS.glow })
    .stroke({ width: 1, color: COLORS.edge, alpha: 0.8 });
}

/**
 * Round the player's ship (`ship`), a gold arrow towards where the story sends them (`goal`, a point on the water),
 * painted (`arrows`; drawn on `g` till they load),
 * while it is off the screen, or `hidden` on it (prey in the fog, which nothing else shows); nothing while it is seen on
 * it. width, height: the screen's, pixels
 */
export function drawStoryPointer(
  g: Graphics,
  arrows: IconSprites<ArrowId>,
  camera: Camera3D,
  ship: { x: number; y: number },
  goal: { x: number; y: number },
  width: number,
  height: number,
  time: number,
  hidden: boolean,
) {
  const s = camera.project(goal.x, goal.y, 0);
  const { margin } = POINTER;
  if (!hidden && s.x >= margin && s.x <= width - margin && s.y >= margin && s.y <= height - margin) return;
  const at = camera.project(ship.x, ship.y, 0);
  const angle = Math.atan2(s.y - at.y, s.x - at.x);
  const bob = POINTER.bob * (0.5 + 0.5 * Math.sin((time * Math.PI * 2) / POINTER.period));
  // The painted arrow, its middle half its size out from the orbit, turned from up to the goal; on the bare water
  const middle = POINTER.orbit + POINTER.size / 2 + bob;
  const x = at.x + Math.cos(angle) * middle;
  const y = at.y + Math.sin(angle) * middle;
  if (arrows.put(ARROW_IDS.pointer, x, y, POINTER.size, 1, angle + Math.PI / 2)) return;
  const reach = POINTER.orbit + POINTER.length + bob;
  const tipX = at.x + Math.cos(angle) * reach;
  const tipY = at.y + Math.sin(angle) * reach;
  const backX = tipX - Math.cos(angle) * POINTER.length;
  const backY = tipY - Math.sin(angle) * POINTER.length;
  const side = POINTER.width / 2;
  const nx = -Math.sin(angle) * side;
  const ny = Math.cos(angle) * side;
  g.poly([tipX, tipY, backX + nx, backY + ny, backX - nx, backY - ny])
    .fill({ color: COLORS.glow })
    .stroke({ width: 1, color: COLORS.edge, alpha: 0.85 });
}
