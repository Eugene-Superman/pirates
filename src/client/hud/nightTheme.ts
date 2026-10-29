import { Container, FillGradient, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { nightSky, ornament, type OrnamentId } from './ornaments';
import { PANEL_INSET, THEME, THEMED_WINDOW, TITLE_STYLE, drawHairline, panelFrame, subheading } from './theme';
import { Tile, type TileSkin, type TileState, type WindowLook } from './ui';
import { mixColor } from '../render/Painter3D';

/**
 * The night look, a window's alternative to the cabin's wood: a clear night at sea. Deep blue under the brass rim, the
 * stars and faint nebulae over it, gold corner pieces and dividers with a star or a crescent (painted, ornaments.ts),
 * boards of dark blue glass edged in gold. The captain's mastery wears it first; its buttons (moonButton) are every
 * window's, whatever its look
 */
export const NIGHT = {
  top: 0x15284d, // the panel's blue at its top
  bottom: 0x050b1a, // and at its bottom
  glass: 0x11233f, // a board's blue glass at its top
  glassDark: 0x08132a, // and at its bottom
  well: 0x040914, // under a picture or a passive: darker than any board
  rim: 0x02050c, // the dark line round a picture on a board
  dim: 0xa3b3cf, // text that says less, in the cold light
} as const;

const SKY_ALPHA = 0.9; // the stars over the panel's blue
const CORNER = 70; // pixels: a window's corner pieces, high
const CORNER_WIDTH = 55; // pixels: a corner piece's width, CORNER high (painted 116 × 148)
/** Pixels a window's corner pieces reach in from its sides: what a small window's text keeps clear of */
export const NIGHT_CORNER_REACH = PANEL_INSET + 1 + CORNER_WIDTH;
const STUD = 24; // pixels: the star at the middle of a window's top edge, high
/** A plaque's stars, one at each end: their height and their middles' distance in from its ends, in its height */
const PLAQUE_STAR = { size: 0.62, in: 0.62 } as const;
const GLASS_ALPHA = 0.8;
const WELL_SHADE_HEIGHT = 10; // pixels: the shade down a well's top
/** A HUD plate over the sea: its corners' radius (pixels), how solid its blue and sky are, its gold edge */
const PLATE = { radius: 10, alpha: 0.94, sky: 0.8, edge: 0.65 } as const;
const METER_WIDE = 10; // pixels: a meter this high or more keeps 2 pixels of its well round the fill, a thinner one 1
/** A button: its glass at rest, under the pointer, lit (pressed) and closed (disabled), at its top and bottom */
const BUTTON = {
  idle: [0x1d3a68, 0x081328],
  hover: [0x2a5191, 0x0c1d40],
  lit: [0x3d6cb8, 0x13306a],
  off: [0x1f2633, 0x0b0e15],
  point: 0.3, // its pointed ends, how far in, in its height
  star: 0.62, // the star on each point, high, in its height
  leastStar: 12, // pixels: the smallest a star is, on the smallest buttons
  starIn: 0.18, // how far in from its point a star's middle is, in the star's height: clear of a button beside it
  starWide: 0.75, // a star's width, in its height (the painted star4Small)
  starGlow: 0.95, // the moonlight round a star under the pointer, its radius in the star's height
  text: 0xf6eedb, // its label, moonlit cream
  edge: 0.17, // the dark edge round its label's letters, in the label's size
} as const;
const MOON_HALO = 0xa9c8ff; // the moonlight round a button under the pointer
const TAB_RADIUS = 8; // pixels: a card tab's rounded corners
/** The halo's rings, from the outermost in: pixels wide and how solid */
const HALO_RINGS: readonly (readonly [number, number])[] = [
  [18, 0.06],
  [12, 0.1],
  [7, 0.16],
  [3.5, 0.24],
];

function vertical(top: number, bottom: number) {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
    textureSpace: 'local',
  });
}

const NIGHT_FILL = vertical(NIGHT.top, NIGHT.bottom);
const GLASS_FILL = vertical(NIGHT.glass, NIGHT.glassDark);
// A gold line fading out at both ends, under a divider's painted middle
const LINE_FADE = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
  colorStops: [
    { offset: 0, color: 'rgba(201,154,69,0)' },
    { offset: 0.5, color: 'rgba(243,213,138,0.8)' },
    { offset: 1, color: 'rgba(201,154,69,0)' },
  ],
  textureSpace: 'local',
});

/** Moonlight on glass from above its middle: a pale dome fading out down the button, `alpha` at its brightest */
function moonSheen(alpha: number) {
  const top = { x: 0.5, y: -0.15 };
  return new FillGradient({
    type: 'radial',
    center: top,
    innerRadius: 0,
    outerCenter: top,
    outerRadius: 0.85,
    colorStops: [
      { offset: 0, color: `rgba(214,230,255,${alpha})` },
      { offset: 0.55, color: `rgba(170,200,255,${alpha * 0.35})` },
      { offset: 1, color: 'rgba(170,200,255,0)' },
    ],
    textureSpace: 'local',
  });
}

const BUTTON_FILLS = {
  idle: vertical(...BUTTON.idle),
  hover: vertical(...BUTTON.hover),
  lit: vertical(...BUTTON.lit),
  off: vertical(...BUTTON.off),
};
const SHEENS = { idle: moonSheen(0.3), primary: moonSheen(0.4), hover: moonSheen(0.58), lit: moonSheen(0.78) };
// Fainter on a card tab: its lines of text lie under the moonlight, with no dark edge round their letters
const TAB_SHEENS = { hover: moonSheen(0.14), lit: moonSheen(0.24) };
// Moonlight gathered round a star on a button's point
const STAR_GLOW = new FillGradient({
  type: 'radial',
  center: { x: 0.5, y: 0.5 },
  innerRadius: 0,
  outerCenter: { x: 0.5, y: 0.5 },
  outerRadius: 0.5,
  colorStops: [
    { offset: 0, color: 'rgba(225,236,255,0.75)' },
    { offset: 0.4, color: 'rgba(170,200,255,0.28)' },
    { offset: 1, color: 'rgba(170,200,255,0)' },
  ],
  textureSpace: 'local',
});
// The shade a panel's edge casts down into a well, fading out
const WELL_SHADE = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  colorStops: [
    { offset: 0, color: 'rgba(0,0,0,0.5)' },
    { offset: 1, color: 'rgba(0,0,0,0)' },
  ],
  textureSpace: 'local',
});
// A silver line along a button's top edge, fading out at both ends: the moon catching it
const MOON_EDGE = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
  colorStops: [
    { offset: 0, color: 'rgba(220,235,255,0)' },
    { offset: 0.5, color: 'rgba(225,238,255,0.9)' },
    { offset: 1, color: 'rgba(220,235,255,0)' },
  ],
  textureSpace: 'local',
});

/**
 * A button's outline, `width` × `height` pixels with a point at each end, `inset` pixels in from its edge: flat
 * coordinates for `poly`
 */
function plaque(width: number, height: number, inset = 0) {
  const half = height / 2;
  const point = Math.min(height * BUTTON.point, width / 4);
  const slant = Math.hypot(half, point);
  const tip = (inset * slant) / half;
  const corner = (point * half + inset * slant - point * inset) / half;
  return [
    tip,
    half,
    corner,
    inset,
    width - corner,
    inset,
    width - tip,
    half,
    width - corner,
    height - inset,
    corner,
    height - inset,
  ];
}

/** A button's stars, high, and their middles' distance in from its ends, for a button `height` pixels high */
function buttonStars(height: number) {
  const size = Math.max(height * BUTTON.star, BUTTON.leastStar);
  return { size, x: size * BUTTON.starIn };
}

/**
 * The night look's button, drawn for a Tile: blue glass with pointed ends under a gold edge, moonlight on its top;
 * under the pointer brighter, a halo of moonlight round it; lit (pressed) brighter still; grey when closed. A primary
 * one (the Yes of a question) keeps a faint halo at rest
 */
function moonSkin(primary: boolean): TileSkin {
  return (g: Graphics, width: number, height: number, { hovered, pressed, disabled, border }: TileState) => {
    const outline = plaque(width, height);
    const state = disabled ? 'off' : pressed ? 'lit' : hovered ? 'hover' : 'idle';
    const glow = state === 'lit' || state === 'hover' ? 1 : primary && state === 'idle' ? 0.5 : 0;
    if (glow > 0) {
      for (const [ring, alpha] of HALO_RINGS) {
        g.poly(outline).stroke({ width: ring, color: MOON_HALO, alpha: alpha * glow, join: 'round' });
      }
    }
    if (glow > 0) {
      const stars = buttonStars(height);
      for (const x of [stars.x, width - stars.x]) {
        g.circle(x, height / 2, stars.size * BUTTON.starGlow).fill({ fill: STAR_GLOW, alpha: glow });
      }
    }
    g.poly(outline).stroke({ width: 3, color: NIGHT.rim, alpha: 0.85, join: 'round' });
    g.poly(outline).fill(BUTTON_FILLS[state]);
    if (state !== 'off') {
      g.poly(outline).fill(state === 'idle' && primary ? SHEENS.primary : SHEENS[state]);
      const point = Math.min(height * BUTTON.point, width / 4);
      g.rect(point, 1.5, width - point * 2, 1).fill(MOON_EDGE);
    }
    g.poly(plaque(width, height, 3.5)).stroke({
      width: 1,
      color: THEME.brass,
      alpha: state === 'off' ? 0.15 : state === 'idle' ? 0.3 : 0.5,
      join: 'round',
    });
    g.poly(outline).stroke({
      width: state === 'lit' ? 2 : 1.5,
      color: state === 'off' ? THEME.brassDark : (border ?? (state === 'idle' ? THEME.brass : THEME.brassLight)),
      alpha: state === 'off' ? 0.9 : 1,
      join: 'round',
    });
  };
}

/** A button's label, `size` pixels: moonlit cream serif, edged dark so it reads over the moonlight */
export function moonLabel(size: number): TextStyleOptions {
  return {
    fontFamily: TITLE_STYLE.fontFamily,
    fontSize: size,
    fontWeight: 'bold',
    fill: BUTTON.text,
    stroke: { color: NIGHT.rim, width: Math.max(2, size * BUTTON.edge), join: 'round' },
  };
}

const MOON_SKIN = moonSkin(false);
const MOON_PRIMARY = moonSkin(true);

/**
 * A button in the night look, every window's: blue glass with pointed ends under a gold edge, a gold star on each
 * point, its label in the middle in moonlit cream; moonlight gathers round it under the pointer. size: the label's,
 * in pixels; onTap null: one that does nothing yet, shown closed; primary: the one a question wants (Yes, Buy), a
 * faint halo round it at rest. `resize` makes it another width, its stars and label kept in their places (a tab
 * squeezed into a narrower row)
 */
export function moonButton(
  width: number,
  height: number,
  label: string,
  onTap: (() => void) | null,
  size = 12,
  primary = false,
) {
  const tile = new Tile(width, height, onTap, 0, primary ? MOON_PRIMARY : MOON_SKIN);
  const stars = buttonStars(height);
  const [left, right] = [0, 1].map(() => {
    const star = ornament('star4Small', { height: stars.size });
    star.y = height / 2;
    tile.content.addChild(star);
    return star;
  });
  left.x = stars.x;
  const caption = new Text({ text: label, style: moonLabel(size) });
  caption.anchor.set(0.5);
  caption.y = height / 2;
  tile.content.addChild(caption);
  const resize = (to: number) => {
    tile.resize(to, height);
    right.x = to - stars.x;
    caption.x = to / 2;
  };
  resize(width);
  if (!onTap) tile.setLook({ disabled: true });
  return { tile, text: caption, resize };
}

/**
 * The room a moon button's label keeps from each of its ends, pixels, on a button `height` pixels high: clear of the
 * star on its point
 */
export function moonButtonEnd(height: number) {
  const stars = buttonStars(height);
  return Math.ceil(stars.x + (stars.size * BUTTON.starWide) / 2);
}

/**
 * Painted corner pieces on the four corners of a box `width` × `height` pixels, `inset` in from its edges, each
 * `size` pixels high: the piece is painted for the top left corner and mirrored for the others
 */
export function nightCorners(width: number, height: number, size: number, id: OrnamentId = 'corner1', inset = 0) {
  const corners = new Container();
  for (const [right, bottom] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const) {
    const piece = ornament(id, { height: size, flipX: right, flipY: bottom, anchor: [0, 0] });
    piece.position.set(right ? width - inset : inset, bottom ? height - inset : inset);
    corners.addChild(piece);
  }
  return corners;
}

/**
 * A divider `width` pixels long, its left end at (0, 0): a gold line fading out at both ends under a painted middle
 * (a star, or a crescent), `middle` pixels wide
 */
export function nightDivider(width: number, middle = Math.min(width, 240), id: OrnamentId = 'dividerStar') {
  const divider = new Container();
  const line = new Graphics().rect(0, -0.75, width, 1.5).fill(LINE_FADE);
  const piece = ornament(id, { width: middle });
  piece.position.set(width / 2, 0);
  divider.addChild(line, piece);
  return divider;
}

/**
 * The colours of what the two trees are for, a ship's talents and the captain's mastery alike: the guns, the sea, the
 * hull (green, as the repairs are in the game), the harpoons, the officers and the gold; and the mastery's own,
 * exploration and survival. A branch or specialization's medallions, names, lit lines and light
 */
export const TREE_COLORS = {
  guns: 0xe8743a,
  sea: 0x5aa9ff,
  hull: 0x6fbf73,
  harpoons: 0x3fbfae,
  command: 0xb57cff,
  gold: 0xf0c66a,
  exploration: 0x7fd36a,
  survival: 0xc98b4a,
} as const;

/** A painted icon's tint in a tree while it can't be taken: short of points, not open yet, or shut by the other of two */
export const DIM_TINT = { short: 0xd0d0d0, locked: 0x9a9a9a, shut: 0x707070 } as const;

const TAKEN_HOT = 0.3; // the share of white in what is taken's light, at its frame
const TAKEN_GLOWS = new Map<string, FillGradient>();

const rgba = (color: number, alpha: number) =>
  `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;

/**
 * The light round what is taken in a tree (a talent, a passive), in its colour, round a frame `frame` pixels round and
 * `spread` pixels beyond it: white-hot at the frame, fading out. Fill a circle `frame + spread` round with it; one
 * gradient a colour and size
 */
export function takenGlow(color: number, frame: number, spread: number) {
  const key = `${color}:${frame}:${spread}`;
  let fill = TAKEN_GLOWS.get(key);
  if (!fill) {
    const hot = mixColor(color, 0xffffff, TAKEN_HOT);
    const edge = frame / (frame + spread);
    fill = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: rgba(hot, 0.9) },
        { offset: edge, color: rgba(hot, 0.75) },
        { offset: edge + (1 - edge) * 0.4, color: rgba(color, 0.3) },
        { offset: 1, color: rgba(color, 0) },
      ],
      textureSpace: 'local',
    });
    TAKEN_GLOWS.set(key, fill);
  }
  return fill;
}

/**
 * A night window's header, pixels from the panel's padding (its top left corner, `pad` in): the painted piece before
 * the title (high, its middle across and down), the title's left, top (a little over the padding: the serif's ascent)
 * and size, the divider under them (down) and its painted middle's width
 */
export const NIGHT_HEADER = {
  piece: 40,
  pieceX: 32,
  middle: 14,
  titleX: 62,
  titleY: -6,
  size: 28,
  rule: 48,
  star: 240,
};

/** Where a window moves the parts of its header from NIGHT_HEADER's places, and the piece it paints before its title */
interface HeaderFit {
  readonly piece?: OrnamentId;
  readonly pieceHeight?: number;
  readonly pieceX?: number;
  readonly titleX?: number;
  readonly rule?: number;
  readonly star?: number;
}

/**
 * A night window's header, in a panel `width` pixels wide `pad` in from its edges: a painted piece (a star unless `fit`
 * names another) before its gold title (the text, or a Text of the window's own that it changes later), and the gold
 * divider under them; laid as NIGHT_HEADER says, but for what `fit` moves
 */
export function nightHeader(width: number, pad: number, title: string | Text, fit: HeaderFit = {}) {
  const container = new Container();
  const piece = ornament(fit.piece ?? 'star8', { height: fit.pieceHeight ?? NIGHT_HEADER.piece });
  piece.position.set(pad + (fit.pieceX ?? NIGHT_HEADER.pieceX), pad + NIGHT_HEADER.middle);
  const heading =
    typeof title === 'string'
      ? new Text({ text: title, style: { ...TITLE_STYLE, fontSize: NIGHT_HEADER.size } })
      : title;
  heading.position.set(pad + (fit.titleX ?? NIGHT_HEADER.titleX), pad + NIGHT_HEADER.titleY);
  const divider = nightDivider(width - pad * 2, fit.star ?? NIGHT_HEADER.star);
  divider.position.set(pad, pad + (fit.rule ?? NIGHT_HEADER.rule));
  container.addChild(piece, heading, divider);
  return { container, title: heading };
}

/** A board's emblem round (0, 0), `radius` pixels: what `inside` holds (a painted picture, a drawn sign) in a dark well under a brass ring */
export function nightEmblem(radius: number, inside?: Container) {
  const emblem = new Container();
  emblem.addChild(new Graphics().circle(0, 0, radius).fill({ color: NIGHT.well }));
  if (inside) emblem.addChild(inside);
  emblem.addChild(new Graphics().circle(0, 0, radius).stroke({ width: 1.5, color: THEME.brass }));
  return emblem;
}

/**
 * How a window lays its boards, pixels: what is kept in from a board's sides, its corner pieces' height, its emblem's
 * radius, and its heading's top and size
 */
export interface NightBoardLayout {
  readonly pad: number;
  readonly corner: number;
  readonly emblem: number;
  readonly heading: { readonly y: number; readonly size: number };
}

const EMBLEM_DROP = 11; // pixels: a board's emblem's middle under its heading's top

/**
 * A board of blue glass, `width` × `height` pixels: its corner pieces, its emblem (`nightEmblem`) in its top left
 * corner and its heading beside it (`title`, changed by a window that tells something there). What it holds is added
 * to `container`; `card` is its glass, for a window to draw on (shaded rows)
 */
export function nightBoard(width: number, height: number, layout: NightBoardLayout, emblem: Container, heading = '') {
  const container = new Container();
  const card = drawNightCard(new Graphics(), width, height);
  const title = subheading(heading, layout.heading.size);
  layBoardHead(layout, emblem, title);
  container.addChild(card, nightCorners(width, height, layout.corner, 'corner1', 2), emblem, title);
  return { container, card, title };
}

/** A board's emblem and heading in their places in its top left corner, as `layout` lays them */
export function layBoardHead(layout: NightBoardLayout, emblem: Container, heading: Container) {
  emblem.position.set(layout.pad + layout.emblem, emblemMiddle(layout));
  heading.position.set(layout.pad + layout.emblem * 2 + 10, layout.heading.y);
}

/** Pixels: the middle of a board's emblem, down the board: what is told on its heading's line is centred on it */
export function emblemMiddle(layout: NightBoardLayout) {
  return layout.heading.y + EMBLEM_DROP;
}

/**
 * A board of dark blue glass, `width` × `height` pixels: a faint gold edge (or a bright one, `outline`: the row
 * picked or done), starlight along its top, and a stripe of `accent` down its left edge (a good's colour)
 */
export function drawNightCard(g: Graphics, width: number, height: number, outline?: number, accent?: number) {
  g.roundRect(0, 0, width, height, 6)
    .fill({ fill: GLASS_FILL, alpha: GLASS_ALPHA })
    .stroke(
      outline === undefined
        ? { width: 1, color: THEME.brass, alpha: 0.42 }
        : { width: 1.5, color: outline, alpha: 0.95 },
    );
  g.moveTo(6, 1.5)
    .lineTo(width - 6, 1.5)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.07 });
  if (accent !== undefined) g.roundRect(0, 3, 3, height - 6, 1.5).fill({ color: accent });
  return g;
}

/**
 * A well sunk into a night panel, `width` × `height` pixels at (x, y), darker than any board: lines of text read on it
 * (the chat's). A dark line round a faint gold edge, and the shade of the panel's edge down its top
 */
export function drawNightWell(g: Graphics, x: number, y: number, width: number, height: number) {
  g.roundRect(x - 1.5, y - 1.5, width + 3, height + 3, 7.5).stroke({ width: 1, color: NIGHT.rim, alpha: 0.8 });
  g.roundRect(x, y, width, height, 6)
    .fill({ color: NIGHT.well, alpha: 0.88 })
    .stroke({ width: 1, color: THEME.brass, alpha: 0.55 });
  g.rect(x + 4, y + 1.5, width - 8, Math.min(WELL_SHADE_HEIGHT, height / 2)).fill(WELL_SHADE);
  return g;
}

/**
 * A night panel's back, `width` × `height` pixels: its shadow and brass rim, the deep blue under the night sky, kept
 * inside the rim's rounded corners
 */
function nightBack(width: number, height: number) {
  const back = new Container();
  const inset = PANEL_INSET;
  const sky = nightSky(width - inset * 2, height - inset * 2);
  sky.position.set(inset, inset);
  sky.alpha = SKY_ALPHA;
  // The sky's tiles are square: kept inside the rim's rounded corners
  const round = new Graphics().roundRect(inset, inset, width - inset * 2, height - inset * 2, 10).fill(0xffffff);
  sky.mask = round;
  back.addChild(panelFrame(width, height, NIGHT_FILL), sky, round);
  return back;
}

/** A window's painted corner pieces, as its night panel lays them on a panel `width` × `height` pixels */
export function nightWindowCorners(width: number, height: number) {
  return nightCorners(width, height, CORNER, 'corner4', PANEL_INSET + 1);
}

/**
 * A window's panel in the night look, `width` × `height` pixels: its shadow and brass rim, the deep blue under the
 * night sky, a gold hairline inside, painted corner pieces and a star at the middle of its top edge
 */
export function nightPanel(width: number, height: number) {
  const panel = new Container();
  const stud = ornament('star4', { height: STUD });
  stud.position.set(width / 2, PANEL_INSET);
  panel.addChild(
    nightBack(width, height),
    drawHairline(new Graphics(), width, height, THEME.brass, 0.4),
    nightWindowCorners(width, height),
    stud,
  );
  return panel;
}

/**
 * A plaque in the night look, `width` × `height` pixels, for a name over a picture (the port's over the harbour): a
 * window's brass rim round the deep blue and the sky, a gold hairline inside, a star at each end. Its name is its
 * owner's to put in its middle
 */
export function nightPlaque(width: number, height: number) {
  const sign = new Container();
  sign.addChild(nightBack(width, height), drawHairline(new Graphics(), width, height, THEME.brass, 0.5));
  const ends = height * PLAQUE_STAR.in;
  for (const x of [ends, width - ends]) {
    const star = ornament('star4', { height: height * PLAQUE_STAR.size });
    star.position.set(x, height / 2);
    sign.addChild(star);
  }
  return sign;
}

/** A HudWindow in the night look: the night panel, the theme's brass Close button, the game a little darker behind */
export const NIGHT_WINDOW: WindowLook = { ...THEMED_WINDOW, panel: nightPanel };

/**
 * A plate of the HUD over the sea in the night look, `width` × `height` pixels, plainer than a window's panel and with
 * no shadow: the deep blue under the night sky, a fine gold edge and starlight along its top
 */
export function nightPlate(width: number, height: number) {
  const plate = new Container();
  const under = new Graphics()
    .roundRect(0, 0, width, height, PLATE.radius)
    .fill({ fill: NIGHT_FILL, alpha: PLATE.alpha });
  const sky = nightSky(width, height);
  sky.alpha = PLATE.sky;
  const round = new Graphics().roundRect(0, 0, width, height, PLATE.radius).fill(0xffffff);
  sky.mask = round;
  const edge = new Graphics()
    .roundRect(0.5, 0.5, width - 1, height - 1, PLATE.radius)
    .stroke({ width: 1, color: THEME.brass, alpha: PLATE.edge })
    .moveTo(PLATE.radius, 2)
    .lineTo(width - PLATE.radius, 2)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.08 });
  plate.addChild(under, sky, round, edge);
  return plate;
}

/** A plate's edge lit in `color` (a talent waiting, a hostile unit), drawn over `nightPlate`'s */
export function drawPlateEdge(g: Graphics, width: number, height: number, color: number) {
  return g.roundRect(0.5, 0.5, width - 1, height - 1, PLATE.radius).stroke({ width: 1.5, color, alpha: 0.95 });
}

/**
 * A meter in the night look, `width` × `height` pixels, a thin one too: a dark well under a faint gold edge, filled
 * `share` of the way in `color`, its upper half catching the light
 */
export function drawNightMeter(g: Graphics, width: number, height: number, share: number, color: number) {
  g.roundRect(0, 0, width, height, Math.min(4, height / 2))
    .fill({ color: NIGHT.well, alpha: 0.9 })
    .stroke({ width: 1, color: THEME.brass, alpha: 0.5 });
  const inset = height >= METER_WIDE ? 2 : 1;
  const inner = height - inset * 2;
  const filled = (width - inset * 2) * Math.min(1, Math.max(0, share));
  if (filled <= 0 || inner <= 0) return g;
  g.roundRect(inset, inset, filled, inner, Math.min(3, inner / 2)).fill({ color });
  g.rect(inset + 1, inset, Math.max(0, filled - 2), inner / 2).fill({ color: 0xffffff, alpha: 0.2 });
  return g;
}

/**
 * A card that is a tab, with a picture and lines of its own (a ship's, in the statistics), drawn for a Tile: blue glass
 * under a faint gold edge like a board; under the pointer a brighter blue, moonlight on it and round it; lit (pressed)
 * while its page shows, the moonlight brighter and its edge gold
 */
export const NIGHT_TAB: TileSkin = (g, width, height, { hovered, pressed }) => {
  const glow = pressed ? 1 : hovered ? 0.6 : 0;
  if (glow > 0) {
    for (const [ring, alpha] of HALO_RINGS) {
      g.roundRect(0, 0, width, height, TAB_RADIUS).stroke({ width: ring, color: MOON_HALO, alpha: alpha * glow });
    }
  }
  g.roundRect(0, 0, width, height, TAB_RADIUS).stroke({ width: 3, color: NIGHT.rim, alpha: 0.6 });
  if (glow === 0) {
    g.roundRect(0, 0, width, height, TAB_RADIUS).fill({ fill: GLASS_FILL, alpha: GLASS_ALPHA });
    g.rect(TAB_RADIUS, 1.5, width - TAB_RADIUS * 2, 1).fill({ color: 0xffffff, alpha: 0.07 });
  } else {
    g.roundRect(0, 0, width, height, TAB_RADIUS).fill(pressed ? BUTTON_FILLS.hover : BUTTON_FILLS.idle);
    g.roundRect(0, 0, width, height, TAB_RADIUS).fill(pressed ? TAB_SHEENS.lit : TAB_SHEENS.hover);
    g.rect(TAB_RADIUS, 1.5, width - TAB_RADIUS * 2, 1).fill(MOON_EDGE);
  }
  g.roundRect(0, 0, width, height, TAB_RADIUS).stroke(
    pressed
      ? { width: 1.5, color: THEME.title }
      : { width: 1, color: hovered ? THEME.brassLight : THEME.brass, alpha: hovered ? 0.85 : 0.42 },
  );
};

/**
 * A small clickable spot on a night plate (the hold, a quest's ✕), drawn for a Tile: faint glass at rest, brighter
 * under a gold edge under the pointer
 */
export const NIGHT_SPOT: TileSkin = (g, width, height, { hovered, pressed }) => {
  const lit = hovered || pressed;
  g.roundRect(0, 0, width, height, Math.min(6, height / 2))
    .fill({ fill: lit ? BUTTON_FILLS.hover : BUTTON_FILLS.idle, alpha: lit ? 0.95 : 0.35 })
    .stroke({ width: 1, color: lit ? THEME.brassLight : THEME.brass, alpha: lit ? 0.85 : 0.3 });
};
