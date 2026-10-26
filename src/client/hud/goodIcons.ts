import { Container, Graphics } from 'pixi.js';
import { GOODS, type GoodId } from '../../game';
import { t } from '../i18n/i18n';
import { THEME, brassButton, drawCard, iconSlot } from './theme';
import { text } from './ui';

/**
 * The goods' list in the hold and at the market, pixels: the board with the places taken and its meter, the heading
 * over the goods, a good's row and its slot, between two rows, and the board saying the hold is empty
 */
export const GOODS_LIST = { board: 66, meter: 14, heading: 30, row: 60, slot: 46, gap: 8, empty: 64 } as const;
const BUTTON = { width: 104, height: 30, gap: 8 } as const; // pixels: a row's buttons, at its right end
const GOLD = 0xffcf3f; // what the goods fetch

/** Each good's colour: its slot's glow and the stripe down its row, in the hold and at the market */
export const GOOD_COLORS: Readonly<Record<GoodId, number>> = {
  fish: 0x7fb6d6,
  cloth: 0xd9705f,
  spices: 0xe0913f,
  rum: 0xc98a45,
  contraband: 0xa3ab72,
  turtleShell: 0x8fc25c,
  serpentScale: 0x45c4ab,
  baronsStrongbox: 0xffd34d,
};

/**
 * A good's picture round (0, 0), `size` pixels across, until the goods have painted icons: a fish, folded cloth, a
 * sack of spices, a bottle of rum, a roped bundle under a seal, a turtle's shell, a serpent's scales, a strongbox
 */
export function drawGood(g: Graphics, good: GoodId, size: number) {
  const k = size / 32;
  const dark = 0x1a120a;
  switch (good) {
    case 'fish':
      g.poly([6 * k, 0, 14 * k, -7 * k, 14 * k, 7 * k]).fill({ color: 0x6f9fb8 });
      g.poly([-4 * k, -5 * k, 1 * k, -10 * k, 3 * k, -5 * k]).fill({ color: 0x6f9fb8 });
      g.ellipse(-3 * k, 0, 11 * k, 6 * k)
        .fill({ color: 0x9cc6d9 })
        .stroke({ width: k, color: 0x3d6378 });
      g.ellipse(-4 * k, 2.5 * k, 8 * k, 2.2 * k).fill({ color: 0xe6f2f7, alpha: 0.6 });
      g.circle(-9 * k, -1.5 * k, 1.4 * k).fill({ color: dark });
      break;
    case 'cloth':
      [0x3f73b5, 0xd9b45a, 0xc0463c].forEach((color, i) => {
        g.roundRect(-13 * k, (4 - i * 7) * k, 26 * k, 7 * k, 3 * k)
          .fill({ color })
          .stroke({ width: k, color: dark, alpha: 0.6 });
        g.moveTo(-10 * k, (5.5 - i * 7) * k)
          .lineTo(10 * k, (5.5 - i * 7) * k)
          .stroke({ width: k, color: 0xffffff, alpha: 0.3 });
      });
      break;
    case 'spices':
      g.roundRect(-11 * k, -4 * k, 22 * k, 17 * k, 7 * k)
        .fill({ color: 0xb08a55 })
        .stroke({ width: k, color: 0x5a4120 });
      g.poly([-6 * k, -3 * k, 6 * k, -3 * k, 8 * k, -10 * k, -8 * k, -10 * k]).fill({ color: 0xc39c62 });
      g.ellipse(0, -10 * k, 8 * k, 2.6 * k).fill({ color: 0xd2552b });
      g.rect(-6 * k, -5 * k, 12 * k, 2.5 * k).fill({ color: 0x6b4a26 });
      g.ellipse(-12 * k, 13 * k, 4 * k, 1.5 * k).fill({ color: 0xd2552b });
      break;
    case 'rum':
      g.rect(-2.5 * k, -14 * k, 5 * k, 3.5 * k).fill({ color: 0xc9a26b });
      g.rect(-2.5 * k, -11 * k, 5 * k, 9 * k).fill({ color: 0x6e3f16 });
      g.roundRect(-7 * k, -3 * k, 14 * k, 17 * k, 3.5 * k)
        .fill({ color: 0x7a4a1a })
        .stroke({ width: k, color: 0x2e1a08 });
      g.rect(-7 * k, 3 * k, 14 * k, 6 * k).fill({ color: 0xe8d6a8 });
      g.rect(-5 * k, -1 * k, 2 * k, 13 * k).fill({ color: 0xffffff, alpha: 0.25 });
      break;
    case 'contraband':
      g.roundRect(-13 * k, -9 * k, 26 * k, 18 * k, 3 * k)
        .fill({ color: 0x4f553d })
        .stroke({ width: k, color: dark });
      g.moveTo(0, -9 * k)
        .lineTo(0, 9 * k)
        .moveTo(-13 * k, 0)
        .lineTo(13 * k, 0)
        .stroke({ width: 2 * k, color: 0xc9a777 });
      g.circle(0, 0, 3.8 * k)
        .fill({ color: 0xb3262b })
        .stroke({ width: k, color: 0x5e0f12 });
      break;
    case 'turtleShell': {
      g.ellipse(0, 0, 14 * k, 11 * k)
        .fill({ color: 0x5d7a3a })
        .stroke({ width: 1.5 * k, color: 0x2f3f1c });
      const hex: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        hex.push(Math.cos(a) * 5 * k, Math.sin(a) * 4.5 * k);
        g.moveTo(Math.cos(a) * 5 * k, Math.sin(a) * 4.5 * k)
          .lineTo(Math.cos(a) * 13 * k, Math.sin(a) * 10 * k)
          .stroke({ width: k, color: 0x2f3f1c });
      }
      g.poly(hex).fill({ color: 0x86a552 }).stroke({ width: k, color: 0x2f3f1c });
      break;
    }
    case 'serpentScale':
      // Rows from the top down, each overlapping the one above
      for (const [y, xs] of [
        [-7, [-8, 0, 8]],
        [-2, [-12, -4, 4, 12]],
        [3, [-8, 0, 8]],
        [8, [-4, 4]],
      ] as const) {
        for (const x of xs) {
          g.circle(x * k, y * k, 4.8 * k)
            .fill({ color: 0x2fa38f })
            .stroke({ width: k, color: 0x10473f });
          g.arc(x * k, y * k, 3 * k, Math.PI * 1.1, Math.PI * 1.6).stroke({ width: k, color: 0xa8f0e0, alpha: 0.7 });
        }
      }
      break;
    case 'baronsStrongbox':
      g.roundRect(-13 * k, -2 * k, 26 * k, 13 * k, 2 * k)
        .fill({ color: 0x7a4a22 })
        .stroke({ width: k, color: dark });
      g.roundRect(-13 * k, -11 * k, 26 * k, 9 * k, 4 * k)
        .fill({ color: 0x925f2e })
        .stroke({ width: k, color: dark });
      g.rect(-9 * k, -11 * k, 3 * k, 22 * k).fill({ color: 0xe0b040 });
      g.rect(6 * k, -11 * k, 3 * k, 22 * k).fill({ color: 0xe0b040 });
      g.rect(-3.5 * k, -5 * k, 7 * k, 8 * k)
        .fill({ color: 0xf0c85a })
        .stroke({ width: k, color: 0x7a5410 });
      g.circle(0, -1.5 * k, 1.3 * k).fill({ color: dark });
      break;
  }
  return g;
}

/**
 * A good's row, `width` pixels wide, in the hold or at the market: its picture with how many there are, its name,
 * what they fetch, and its buttons at the right end, in the order given
 */
export function goodRow(
  id: GoodId,
  count: number,
  width: number,
  buttons: readonly { readonly label: string; readonly onTap: () => void }[],
) {
  const { row: height, slot: size } = GOODS_LIST;
  const row = new Container();
  const { name, price } = GOODS[id];
  const slot = iconSlot(size, GOOD_COLORS[id], `${count}`, false);
  const glyph = drawGood(new Graphics(), id, size - 14);
  glyph.position.set(size / 2, size / 2);
  slot.container.addChildAt(glyph, 1);
  slot.container.position.set(12, (height - size) / 2);
  const title = text(t(name), 15, THEME.text, { fontWeight: 'bold' });
  title.position.set(12 + size + 14, 11);
  const worth = text(`${t('{n} gold each', { n: price })} · ${t('{n} gold', { n: price * count })}`, 12, GOLD, {
    fontWeight: 'bold',
  });
  worth.position.set(title.x, 33);
  row.addChild(drawCard(new Graphics(), width, height, GOOD_COLORS[id]), slot.container, title, worth);
  buttons.forEach(({ label, onTap }, i) => {
    const button = brassButton(BUTTON.width, BUTTON.height, label, onTap, 13);
    const fromEnd = buttons.length - i;
    const x = width - 12 - fromEnd * BUTTON.width - (fromEnd - 1) * BUTTON.gap;
    button.tile.container.position.set(x, (height - BUTTON.height) / 2);
    row.addChild(button.tile.container);
  });
  return row;
}
