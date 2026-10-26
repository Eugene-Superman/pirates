import { Container, FillGradient, Graphics, Sprite, Text, Texture, TilingSprite, type TextStyleOptions } from 'pixi.js';
import { Tile, type TileStyle, type WindowLook } from './ui';

/**
 * The windows' look: a captain's cabin at night. Dark wood with its grain under a brass frame (corner brackets and
 * rivets, a gold hairline inside), gold serif titles, rows laid on darker boards with their tier's colour down the
 * left edge, brass-edged buttons that light up gold when pressed. The port's buildings wear it first
 */
export const THEME = {
  wood: 0x1f1710, // the panel, at its top
  woodDark: 0x0c0907, // and at its bottom
  gap: 0x0d0905, // between the brass rim and the wood
  card: 0x261c14, // a row's board, at its top
  cardDark: 0x1a130d, // and at its bottom
  brass: 0xc99a45,
  brassLight: 0xf3d58a,
  brassDark: 0x5a3e15,
  text: 0xf2e8d2,
  dim: 0xb4a385,
  title: 0xf0c66a,
  darkText: 0x22160a,
  button: 0x2b2017,
  buttonHover: 0x3d2d1f,
  well: 0x0c2233, // a well sunk into the wood, deep blue as the skill bar's painted ones
} as const;

const SERIF = 'Georgia, "Times New Roman", serif';
const RIM = 3; // pixels of brass round the panel
const GAP = 2; // pixels of dark between the brass and the wood
const BRACKET = { arm: 44, width: 9, rivet: 4.5 } as const; // pixels: the brass corner brackets
const SHADOW = { steps: 4, spread: 4, drop: 8, alpha: 0.1 } as const; // the panel's soft shadow under it
const WINDOW_CLOSE = { width: 96, height: 28 } as const; // pixels: a window's Close button
const WINDOW_DIM = 0.55; // how dark the game gets behind a window
const METER_NOTCH = 6; // pixels: the closest a meter's notches come
const MEDALLION_WELL = 0.74; // a medallion's blue well, in its radii: the rest is its brass ring
// An icon's slot: its glow (how bright in its middle and halfway out, and how far below the slot's middle its brightest
// point sits, a share of the slot), and the chip in its corner (pixels)
const SLOT = { glow: { middle: 0.42, half: 0.16, drop: 0.04 }, chip: { width: 26, height: 15, size: 10 } } as const;
const GLOWS = new Map<number, FillGradient>();

/** A soft light from the middle of a shape out to its edge, in `color`: one gradient a colour, shared */
export function glowFill(color: number) {
  let fill = GLOWS.get(color);
  if (!fill) {
    const rgb = `${(color >> 16) & 255},${(color >> 8) & 255},${color & 255}`;
    const middle = { x: 0.5, y: 0.5 + SLOT.glow.drop };
    fill = new FillGradient({
      type: 'radial',
      center: middle,
      innerRadius: 0,
      outerCenter: middle,
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: `rgba(${rgb},${SLOT.glow.middle})` },
        { offset: 0.5, color: `rgba(${rgb},${SLOT.glow.half})` },
        { offset: 1, color: `rgba(${rgb},0)` },
      ],
      textureSpace: 'local',
    });
    GLOWS.set(color, fill);
  }
  return fill;
}
// The wood's texture, tiled (pixels): its size, a board's width, how often the streaks along it change, the grain's
// profile samples a pixel; how light the grain and how dark the seams make the wood, and the grain's colour
const GRAIN = {
  width: 1024,
  height: 512,
  plank: 64,
  streak: 16,
  fine: 4,
  light: 0.1,
  dark: 0.24,
  color: [255, 214, 160],
} as const;

/** A title in the window's header: gold serif letters, engraved */
export const TITLE_STYLE: TextStyleOptions = {
  fontFamily: SERIF,
  fontWeight: 'bold',
  fill: THEME.title,
  stroke: { color: 0x120a03, width: 4, join: 'round' },
  dropShadow: { color: 0x000000, alpha: 0.7, blur: 3, distance: 2, angle: Math.PI / 2 },
};

/** A heading inside a window (a section of its rows): gold serif letters, smaller than the title */
export function subheading(label: string, size = 16) {
  return new Text({
    text: label,
    style: { ...TITLE_STYLE, fontSize: size, stroke: { color: 0x120a03, width: 3, join: 'round' } },
  });
}

// Gradients over a shape's own bounds (0..1), shared by every shape that uses them
const vertical = (stops: readonly (readonly [number, number])[]) =>
  new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
const BRASS_FILL = vertical([
  [0, THEME.brassLight],
  [0.45, THEME.brass],
  [1, THEME.brassDark],
]);
const WOOD_FILL = vertical([
  [0, THEME.wood],
  [1, THEME.woodDark],
]);
const CARD_FILL = vertical([
  [0, THEME.card],
  [1, THEME.cardDark],
]);
const PRESSED_FILL = vertical([
  [0, 0xf6d98f],
  [0.5, 0xd9a94c],
  [1, 0x9c6f26],
]);
// The shade the wood's edge casts down into a well, fading out
const WELL_SHADE = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  colorStops: [
    { offset: 0, color: 'rgba(0,0,0,0.55)' },
    { offset: 1, color: 'rgba(0,0,0,0)' },
  ],
  textureSpace: 'local',
});
const WELL_SHADE_HEIGHT = 10; // pixels

/** Brass-edged buttons and tabs, lit gold when pressed (their labels then THEME.darkText) */
export const BRASS: TileStyle = {
  idle: THEME.button,
  hover: THEME.buttonHover,
  pressed: PRESSED_FILL,
  alpha: 0.96,
  border: THEME.brass,
  borderAlpha: 0.7,
  pressedBorder: THEME.brassLight,
  bevel: true,
};

/**
 * A button in the theme: a brass-edged tile with its label in the middle. size: the label's, in pixels; onTap null:
 * one that does nothing yet, shown disabled
 */
export function brassButton(width: number, height: number, label: string, onTap: (() => void) | null, size = 12) {
  const tile = new Tile(width, height, onTap, 5, BRASS);
  const caption = new Text({
    text: label,
    style: { fontFamily: 'Arial', fontSize: size, fill: THEME.text, fontWeight: 'bold' },
  });
  caption.anchor.set(0.5);
  caption.position.set(width / 2, height / 2);
  tile.content.addChild(caption);
  if (!onTap) tile.setLook({ disabled: true });
  return { tile, text: caption };
}

let grainTexture: Texture | null = null;

/** A number between lo and hi: the wood's looks (cosmetic, so Math.random will do) */
function random(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

/**
 * The wood, made once in a canvas: boards GRAIN.plank pixels wide, each a shade of its own, their grain fine lines
 * wavering along them with streaks across, a joint where two boards meet end to end, and the seams between them. It
 * repeats seamlessly both ways (every wave fits the canvas a whole number of times), so it tiles any panel. Drawn over
 * the panel's dark gradient: light where the grain is, dark at the seams and joints
 */
function grain() {
  if (grainTexture) return grainTexture;
  const { width, height, plank } = GRAIN;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Texture.EMPTY;
  const image = context.createImageData(width, height);
  const { data } = image;
  const columns = width / GRAIN.streak;
  for (let top = 0; top < height; top += plank) {
    // How far the grain bends up or down along this board, pixels
    const bends = Array.from({ length: 4 }, (_, m) => ({
      k: m + 1,
      size: random(1.5, 4) / (m + 1),
      phase: random(0, 7),
    }));
    const bend = Float32Array.from({ length: width }, (_, x) =>
      bends.reduce((sum, b) => sum + b.size * Math.sin((2 * Math.PI * b.k * x) / width + b.phase), 0),
    );
    // The grain across the board, as a profile sampled GRAIN.fine times a pixel: lines of many widths
    const waves = Array.from({ length: 14 }, () => {
      const k = Math.floor(random(18, 110));
      return { k, size: random(0.3, 1) / (1 + k / 40), phase: random(0, 7) };
    });
    const profile = Float32Array.from({ length: height * GRAIN.fine }, (_, i) =>
      waves.reduce((sum, w) => sum + w.size * Math.sin((2 * Math.PI * w.k * i) / (height * GRAIN.fine) + w.phase), 0),
    );
    const peak = profile.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-6);
    const streaks = Float32Array.from({ length: plank * columns }, () => random(-1, 1));
    const shade = random(-0.25, 0.25);
    const joint = Math.floor(random(40, width - 40));
    for (let y = top; y < top + plank; y++) {
      const row = (y - top) * columns;
      for (let x = 0; x < width; x++) {
        let at = Math.round((y + bend[x]) * GRAIN.fine) % profile.length;
        if (at < 0) at += profile.length;
        // Streaks along the board: a random value every GRAIN.streak pixels, eased between (wrapping round)
        const u = x / GRAIN.streak;
        const c = Math.floor(u);
        const t = u - c;
        const streak = streaks[row + c] * (1 - t) + streaks[row + ((c + 1) % columns)] * t;
        let light = (0.55 * profile[at]) / peak + 0.35 * streak + shade;
        if (y === top || x === joint)
          light = -2.4; // a seam, a joint
        else if (y === top + 1 || x === (joint + 1) % width) light = 0.7; // the board's edge, catching the light
        const i = (y * width + x) * 4;
        if (light > 0) {
          data[i] = GRAIN.color[0];
          data[i + 1] = GRAIN.color[1];
          data[i + 2] = GRAIN.color[2];
          data[i + 3] = Math.min(255, light * GRAIN.light * 255);
        } else {
          data[i + 3] = Math.min(255, -light * GRAIN.dark * 255);
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
  grainTexture = Texture.from(canvas);
  return grainTexture;
}

/**
 * A brass bracket over a corner of the frame, its arms along the two edges, a rivet where they meet; `k` times
 * BRACKET's size
 */
function bracket(g: Graphics, x: number, y: number, sx: number, sy: number, k: number) {
  const arm = BRACKET.arm * k;
  const width = BRACKET.width * k;
  const bevel = 4 * k;
  // The corner's L, drawn for the top left corner and mirrored by sx, sy
  const p = (dx: number, dy: number) => [x + dx * sx, y + dy * sy];
  g.poly([
    ...p(0, 0),
    ...p(arm, 0),
    ...p(arm - bevel, width),
    ...p(width, width),
    ...p(width, arm - bevel),
    ...p(0, arm),
  ])
    .fill(BRASS_FILL)
    .stroke({ width: 1, color: THEME.brassDark, alpha: 0.9 });
  const [cx, cy] = p(width / 2 + 2 * k, width / 2 + 2 * k);
  const rivet = BRACKET.rivet * k;
  g.circle(cx, cy, rivet).fill({ color: THEME.brassDark }).stroke({ width: 1, color: THEME.brassLight, alpha: 0.8 });
  g.circle(cx - k, cy - k, rivet * 0.35).fill({ color: THEME.brassLight, alpha: 0.9 });
}

/**
 * The gold hairline inside a panel `width` × `height` pixels, in `color`: a lit one over a HUD plate (the player's,
 * when a talent waits; a hostile target's, red) goes where the plain one is
 */
export function drawHairline(g: Graphics, width: number, height: number, color: number = THEME.brass, alpha = 0.35) {
  const inset = RIM + GAP + 6;
  return g
    .roundRect(inset, inset, width - inset * 2, height - inset * 2, 6)
    .stroke({ width: alpha < 0.5 ? 1 : 1.5, color, alpha });
}

/**
 * A window's panel, `width` × `height` pixels: its shadow, the brass rim, the wood with its grain, a gold hairline
 * inside, brackets on its corners and a stud at the middle of its top edge. Put it first, under the window's content.
 * brackets: their size, BRACKET's times this (a HUD plate's are smaller: a window's would meet on its short sides)
 */
export function themedPanel(width: number, height: number, brackets = 1) {
  const panel = new Container();
  const under = new Graphics();
  for (let k = SHADOW.steps; k > 0; k--) {
    const s = k * SHADOW.spread;
    under.roundRect(-s, -s + SHADOW.drop, width + s * 2, height + s * 2, 14 + s).fill({
      color: 0x000000,
      alpha: SHADOW.alpha,
    });
  }
  const inset = RIM + GAP;
  under
    .roundRect(0, 0, width, height, 14)
    .fill(BRASS_FILL)
    .roundRect(RIM, RIM, width - RIM * 2, height - RIM * 2, 12)
    .fill({ color: THEME.gap })
    .roundRect(inset, inset, width - inset * 2, height - inset * 2, 10)
    .fill(WOOD_FILL);
  // The grain over the wood (its square corners are under the brackets)
  const wood = new TilingSprite({ texture: grain(), width: width - inset * 2, height: height - inset * 2 });
  wood.position.set(inset, inset);
  const over = drawHairline(new Graphics(), width, height);
  bracket(over, 0, 0, 1, 1, brackets);
  bracket(over, width, 0, -1, 1, brackets);
  bracket(over, 0, height, 1, -1, brackets);
  bracket(over, width, height, -1, -1, brackets);
  diamond(over, width / 2, RIM / 2, 9);
  panel.addChild(under, wood, over);
  return panel;
}

/** A HudWindow in the theme: the wooden panel and a brass Close button, the game a little darker behind it */
export const THEMED_WINDOW: WindowLook = {
  panel: themedPanel,
  close: (label, onTap) => brassButton(WINDOW_CLOSE.width, WINDOW_CLOSE.height, label, onTap, 13),
  dim: WINDOW_DIM,
};

/**
 * A round brass button of `radius` pixels round (0, 0), deep blue inside like the painted slots on the minimap's
 * frame: what it does is drawn over it, in THEME.brassLight
 */
export function drawMedallion(g: Graphics, radius: number) {
  g.circle(0, 1.5, radius + 1).fill({ color: 0x000000, alpha: 0.45 });
  g.circle(0, 0, radius).fill(BRASS_FILL).stroke({ width: 1, color: THEME.brassDark });
  const well = radius * MEDALLION_WELL;
  g.circle(0, 0, well).fill({ color: THEME.well }).stroke({ width: 1.5, color: THEME.brassDark });
  // The light on the well's upper left edge
  g.arc(0, 0, well - 1.5, Math.PI * 1.05, Math.PI * 1.55).stroke({ width: 1, color: 0xffffff, alpha: 0.18 });
  return g;
}

/** A chevron round (0, 0), `size` pixels wide, pointing down (a section unfolded) or right (folded) */
export function drawChevron(g: Graphics, size: number, open: boolean, color: number = THEME.brassLight) {
  const h = size / 2;
  const points = open ? [-h, -h / 2, 0, h / 2, h, -h / 2] : [-h / 2, -h, h / 2, 0, -h / 2, h];
  return g.poly(points, false).stroke({ width: 2, color, cap: 'round', join: 'round' });
}

/** A small brass diamond round (x, y), `size` pixels across: a stud on the frame, the middle of a divider */
function diamond(g: Graphics, x: number, y: number, size: number) {
  const h = size / 2;
  g.poly([x, y - h, x + h, y, x, y + h, x - h, y])
    .fill(BRASS_FILL)
    .stroke({ width: 1, color: THEME.brassDark });
}

/** A gold line across the header, fading out at both ends, a diamond in its middle */
export function drawDivider(g: Graphics, x: number, y: number, width: number) {
  const fade = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: 'rgba(201,154,69,0)' },
      { offset: 0.5, color: 'rgba(243,213,138,0.85)' },
      { offset: 1, color: 'rgba(201,154,69,0)' },
    ],
    textureSpace: 'local',
  });
  g.rect(x, y - 0.75, width, 1.5).fill(fade);
  diamond(g, x + width / 2, y, 10);
  return g;
}

/**
 * A row's board, `width` × `height` pixels: a darker plank under the wood, a faint brass edge (or a bright one,
 * `outline`: the row picked, fitted or done), and a stripe of `accent` down its left edge (a tier's colour)
 */
export function drawCard(g: Graphics, width: number, height: number, accent?: number, outline?: number) {
  g.roundRect(0, 0, width, height, 6)
    .fill({ fill: CARD_FILL, alpha: 0.92 })
    .stroke(
      outline === undefined
        ? { width: 1, color: THEME.brass, alpha: 0.22 }
        : { width: 1.5, color: outline, alpha: 0.95 },
    );
  g.moveTo(6, 1.5)
    .lineTo(width - 6, 1.5)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
  if (accent !== undefined) g.roundRect(0, 3, 3, height - 6, 1.5).fill({ color: accent });
  return g;
}

/**
 * A well sunk into the wood, `width` × `height` pixels at (x, y), as the skill bar's painted ones: deep blue in a
 * brass edge, a dark line round it and the wood's shade down its top. What it holds (lines of text) reads light on it
 */
export function drawWell(g: Graphics, x: number, y: number, width: number, height: number) {
  g.roundRect(x - 1.5, y - 1.5, width + 3, height + 3, 7.5).stroke({ width: 1, color: 0x000000, alpha: 0.55 });
  g.roundRect(x, y, width, height, 6)
    .fill({ color: THEME.well, alpha: 0.97 })
    .stroke({ width: 1.5, color: THEME.brass, alpha: 0.85 });
  g.rect(x + 4, y + 1.5, width - 8, Math.min(WELL_SHADE_HEIGHT, height / 2)).fill(WELL_SHADE);
  return g;
}

/**
 * A meter, `width` × `height` pixels: a dark well under a brass edge, `share` of it (0…1) filled in `color` with a
 * light along the fill's top; notched between `places` (the hold's places), every few of them where a place is
 * narrower than METER_NOTCH
 */
export function drawMeter(g: Graphics, width: number, height: number, share: number, color: number, places = 0) {
  g.roundRect(0, 0, width, height, 4).fill({ color: 0x0a0705 }).stroke({ width: 1, color: THEME.brass, alpha: 0.7 });
  const filled = (width - 4) * Math.min(1, Math.max(0, share));
  if (filled > 0) {
    g.roundRect(2, 2, filled, height - 4, Math.min(3, (height - 4) / 2)).fill({ color });
    g.rect(3, 3, Math.max(0, filled - 2), (height - 6) / 2).fill({ color: 0xffffff, alpha: 0.2 });
  }
  if (places <= 1) return g;
  const place = (width - 4) / places;
  const every = Math.ceil(METER_NOTCH / place);
  for (let i = every; i < places; i += every) {
    g.rect(2 + i * place - 0.5, 2, 1, height - 4).fill({ color: 0x000000, alpha: 0.5 });
  }
  return g;
}

/**
 * A framed slot for an icon, `size` pixels square: a brass frame round a dark well lit from within in `glow` (a tier's
 * colour), and a chip with `chip` in its bottom right corner (the tier). It shows a picture (`show`), or the chip's
 * text in big letters in its middle while there is none (an icon still loading, or a gun without one); without
 * `letters` the well stays empty instead (a ship, whose picture is to come)
 */
export function iconSlot(size: number, glow: number, chip: string, letters = true) {
  const container = new Container();
  const frame = new Graphics()
    .roundRect(0, 0, size, size, 8)
    .fill(BRASS_FILL)
    .stroke({ width: 1, color: THEME.brassDark })
    .roundRect(2, 2, size - 4, size - 4, 6)
    .fill({ color: 0x0a0705 });
  const c = size / 2;
  frame
    .roundRect(2, 2, size - 4, size - 4, 6)
    .fill(glowFill(glow))
    .roundRect(4, 4, size - 8, size - 8, 5)
    .stroke({ width: 1.5, color: glow, alpha: 0.8 });
  const picture = new Sprite();
  picture.anchor.set(0.5);
  picture.position.set(c, c);
  const big = new Text({ text: chip, style: { ...TITLE_STYLE, fontSize: Math.round(size * 0.32), fill: glow } });
  big.anchor.set(0.5);
  big.position.set(c, c);
  const { width, height, size: font } = SLOT.chip;
  const tag = new Graphics()
    .roundRect(size - width - 3, size - height - 3, width, height, 4)
    .fill({ color: glow })
    .stroke({ width: 1, color: THEME.brassDark });
  const tagText = new Text({
    text: chip,
    style: { fontFamily: 'Arial', fontSize: font, fontWeight: 'bold', fill: THEME.darkText },
  });
  tagText.anchor.set(0.5);
  tagText.position.set(size - width / 2 - 3, size - height / 2 - 3);
  container.addChild(frame, picture, big, tag, tagText);
  const show = (texture: Texture | null) => {
    picture.visible = texture !== null;
    big.visible = letters && texture === null;
    if (texture) {
      picture.texture = texture;
      picture.width = picture.height = size - 6;
    }
  };
  show(null);
  return { container, show };
}
