import type { Chest } from '../../../game';
import { footprint, type Painter3D } from '../../render/Painter3D';

const COLORS = { wood: 0x8a5a2b, lid: 0xa86f36, band: 0xe0b23a, glint: 0xffe27a, foam: 0xffffff };
const SIZE = { along: 8, across: 6, height: 4.2, lid: 1.8 }; // world units
const BOB = { height: 0.6, speed: 2.2, rock: 0.12 }; // world units, radians per second, radians
const BLINK_TIME = 10; // seconds before it sinks, when it starts to blink

/** A ring of foam where the chest floats. Drawn with the sea */
export function drawChestWater(p: Painter3D, chest: Chest, time: number) {
  const r = 5 + Math.sin(time * BOB.speed + chest.id) * 0.6;
  p.ring(chest.x, chest.y, 0, r, 0.8, COLORS.foam, 0.5);
}

/**
 * A wooden chest bound in gold, bobbing on the waves, with a glint over it so it is seen from afar. It blinks in its
 * last seconds before it sinks
 */
export function drawChest(p: Painter3D, chest: Chest, time: number) {
  const left = chest.expiresAt - time;
  if (left < BLINK_TIME && Math.sin(time * 10) < 0) return;
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
