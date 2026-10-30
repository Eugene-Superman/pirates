import type { Chest } from '../../../game';
import { footprint, type Painter3D } from '../../render/Painter3D';

const COLORS = {
  wood: 0x8a5a2b,
  lid: 0xa86f36,
  band: 0xe0b23a,
  glint: 0xffe27a,
  foam: 0xffffff,
  crate: 0x9b7447,
  crateTop: 0xb48a58,
  pole: 0x5e4126,
  flag: 0xff8a2a,
  lostGlint: 0xffb067,
};
// World units: the goods' crates, where each floats from the middle, and the lost cargo's marker
const CRATE = 3.6;
const CRATES = [
  [-2.6, -1.2, 0.3],
  [2.4, 1.4, -0.4],
  [0.2, 3.4, 0.9],
] as const;
const MARKER = { height: 9, flag: 3.4 } as const;
const SIZE = { along: 8, across: 6, height: 4.2, lid: 1.8 }; // world units
const BOB = { height: 0.6, speed: 2.2, rock: 0.12 }; // world units, radians per second, radians
/** Seconds before a chest sinks, when it starts to blink */
const CHEST_BLINK = 4;
// A chest just dropped throws up a ring of foam that spreads and fades: seconds, world units
const SPLASH = { time: 1.2, from: 4, to: 16, width: 1.4 };

/** Seconds since a chest was dropped into the sea */
export function chestAge(chest: Chest, time: number) {
  return time - chest.droppedAt;
}

/** Whether a chest is blinked out now: it blinks in its last seconds before it sinks, never while kept for someone */
export function blinkedOut(chest: Chest, time: number) {
  return chest.expiresAt !== null && chest.expiresAt - time < CHEST_BLINK && Math.sin(time * 10) < 0;
}

/** A ring of foam where the chest floats, and a splash spreading from where it fell. Drawn with the sea */
export function drawChestWater(p: Painter3D, chest: Chest, time: number) {
  const r = 5 + Math.sin(time * BOB.speed + chest.id) * 0.6;
  p.ring(chest.x, chest.y, 0, r, 0.8, COLORS.foam, 0.5);
  const t = chestAge(chest, time) / SPLASH.time;
  if (t < 1) {
    const eased = 1 - (1 - t) * (1 - t);
    p.ring(
      chest.x,
      chest.y,
      0,
      SPLASH.from + (SPLASH.to - SPLASH.from) * eased,
      SPLASH.width,
      COLORS.foam,
      0.7 * (1 - t),
    );
  }
}

/**
 * Loot floating on the waves, with a glint over it so it is seen from afar: a wooden chest bound in gold when there is
 * gold in it, crates of goods when there are only goods, and a player's own lost cargo with an orange flag over it.
 * It blinks in its last seconds before it sinks
 */
export function drawChest(p: Painter3D, chest: Chest, time: number) {
  if (blinkedOut(chest, time)) return;
  if (chest.gold === 0) {
    drawCrates(p, chest, time);
    return;
  }
  const z = Math.sin(time * BOB.speed + chest.id) * BOB.height - 0.8;
  const angle = chest.id * 1.3 + Math.sin(time * 0.9 + chest.id) * BOB.rock;
  const { along, across, height, lid } = SIZE;
  const bottom = footprint(chest.x, chest.y, z, along, across, angle);
  const top = footprint(chest.x, chest.y, z + height, along, across, angle);
  p.sides(bottom, top, COLORS.wood);
  const lidTop = footprint(chest.x, chest.y, z + height + lid, along * 0.92, across * 0.7, angle);
  p.sides(top, lidTop, COLORS.lid);
  p.top(lidTop, COLORS.lid);
  // The gold band round the middle and over the lid
  p.sides(
    footprint(chest.x, chest.y, z + height * 0.45, along + 0.2, across + 0.2, angle),
    footprint(chest.x, chest.y, z + height * 0.65, along + 0.2, across + 0.2, angle),
    COLORS.band,
  );
  p.line(top[0], lidTop[0], 0.6, COLORS.band);
  p.line(top[1], lidTop[1], 0.6, COLORS.band);
  const pulse = 0.5 + 0.5 * Math.sin(time * 4 + chest.id);
  p.ball([chest.x, chest.y, z + height + lid + 4], 1.2 + pulse, COLORS.glint, 0.35 + 0.4 * pulse);
}

/** Crates of goods bobbing apart, and over a player's lost cargo a flag on a pole */
function drawCrates(p: Painter3D, chest: Chest, time: number) {
  const lost = chest.lostBy !== null;
  let top = 0;
  for (const [dx, dy, phase] of CRATES) {
    const z = Math.sin(time * BOB.speed + chest.id + phase) * BOB.height - 1;
    const angle = chest.id * 0.7 + phase + Math.sin(time * 0.8 + phase) * BOB.rock;
    const x = chest.x + dx;
    const y = chest.y + dy;
    const bottom = footprint(x, y, z, CRATE, CRATE, angle);
    const lid = footprint(x, y, z + CRATE * 0.8, CRATE, CRATE, angle);
    p.sides(bottom, lid, COLORS.crate);
    p.top(lid, COLORS.crateTop);
    top = Math.max(top, z + CRATE * 0.8);
  }
  const pulse = 0.5 + 0.5 * Math.sin(time * 4 + chest.id);
  if (lost) {
    const foot: readonly [number, number, number] = [chest.x, chest.y, top];
    const head: readonly [number, number, number] = [chest.x, chest.y, top + MARKER.height];
    p.line(foot, head, 0.5, COLORS.pole);
    const wave = Math.sin(time * 5 + chest.id) * 0.6;
    p.surface(
      [
        head,
        [chest.x + MARKER.flag, chest.y + wave, top + MARKER.height - 1],
        [chest.x, chest.y, top + MARKER.height - 2.2],
      ],
      COLORS.flag,
    );
  }
  p.ball(
    [chest.x, chest.y, top + (lost ? MARKER.height + 3 : 4)],
    1.1 + pulse,
    lost ? COLORS.lostGlint : COLORS.glint,
    0.3 + 0.4 * pulse,
  );
}
