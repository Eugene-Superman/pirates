import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import { UI, drawCoin, playTap, show } from './ui';
import { t } from '../i18n/i18n';

// The port from its roadstead, and the medallions: made by blender-assets/port/build_harbour_art.py from painted art (or
// rendered in Blender by build_harbour.py from the port's scene)
const ART = `${import.meta.env.BASE_URL}sprites/port`;

/** The port's buildings, each opening a window of its own (PortScreen) */
export type BuildingId = 'tavern' | 'market' | 'workshop' | 'shipyard' | 'arsenal' | 'guild' | 'auction';

export interface Building {
  readonly id: BuildingId;
  readonly name: string;
  /** What it is for, in a few words: under its name when the pointer is over it, and in its window */
  readonly about: string;
}

export const BUILDINGS: readonly Building[] = [
  { id: 'tavern', name: 'Tavern', about: 'Bounties: sink what they ask and come back for the gold' },
  { id: 'market', name: 'Market', about: 'Buys the goods in your hold' },
  { id: 'workshop', name: 'Workshop', about: 'Sails, planking, rudders and lookouts for your ship, and hull repairs' },
  { id: 'shipyard', name: 'Shipyard', about: 'New ships, and your ships laid up in port' },
  { id: 'arsenal', name: 'Arsenal', about: 'Cannons, harpoon guns and their ammo' },
  { id: 'guild', name: 'Guild hall', about: 'Where captains band together' },
  { id: 'auction', name: 'Auction house', about: 'Where captains trade with one another' },
];

/** harbour.json, written by the script that made the picture */
interface HarbourArt {
  readonly picture: { readonly file: string; readonly w: number; readonly h: number };
  readonly medallions: { readonly file: string; readonly size: number };
  /** Where each building stands on the picture (shares of its width and height), and its medallion's place in the row */
  readonly buildings: Readonly<Record<string, { readonly at: readonly [number, number]; readonly medallion: number }>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// harbour.json is plain JSON, so it is checked rather than trusted
function isHarbourArt(value: unknown): value is HarbourArt {
  if (!isRecord(value) || !isRecord(value.picture) || !isRecord(value.medallions) || !isRecord(value.buildings))
    return false;
  const { picture, medallions, buildings } = value;
  return (
    typeof picture.file === 'string' &&
    typeof picture.w === 'number' &&
    typeof picture.h === 'number' &&
    typeof medallions.file === 'string' &&
    typeof medallions.size === 'number' &&
    BUILDINGS.every(({ id }) => {
      const spot = buildings[id];
      return (
        isRecord(spot) &&
        Array.isArray(spot.at) &&
        spot.at.length === 2 &&
        spot.at.every((n) => typeof n === 'number') &&
        typeof spot.medallion === 'number'
      );
    })
  );
}

// What the view is laid out in, then scaled to fit the screen: the picture is stretched to this width, keeping its shape,
// whatever its own pixels, so the medallions and the texts are the same size on any picture. Its height until it loads
const PICTURE = { width: 2048, height: 1280 };
// Where the medallions stand until the picture's own spots have loaded (or if it fails to): a row across the middle
const FALLBACK: Readonly<Record<BuildingId, readonly [number, number]>> = {
  auction: [0.14, 0.5],
  workshop: [0.28, 0.5],
  market: [0.42, 0.5],
  tavern: [0.56, 0.5],
  guild: [0.5, 0.25],
  arsenal: [0.72, 0.7],
  shipyard: [0.86, 0.5],
};
const MARGIN = 14; // screen pixels between the frame and the screen's edge, at least
const MAX_SCALE = 1.25; // the picture isn't blown up more than this on a big screen
const FRAME = { wood: 16, gold: 3, outer: 2 }; // picture pixels: the frame's wooden border and gold lines
const COLORS = {
  sea: 0x123f57, // behind the picture until it loads
  wood: 0x3a2412,
  gold: 0xd9a441,
  goldDark: 0x7a5a22,
  plaque: 0xf1e2bd,
  plaqueText: 0x3a2412,
  label: 0xffc54d,
  labelHover: 0xfff2c4,
  labelStroke: 0x1d1206,
  sail: 0x2e7d3a,
  sailHover: 0x3a9a48,
  badge: 0xd8402b,
};
const MEDALLION = 124; // picture pixels across
const HOVER_SCALE = 1.12;
const EASE = 14; // how fast a medallion grows and shrinks under the pointer, per second
const GLOW = { alpha: 0.32, pulse: 0.1, speed: 2.4 }; // the light behind a medallion: under the pointer, and breathing
const LABEL_SIZE = 27; // picture pixels
const ABOUT = { size: 19, width: 380, pad: 10 }; // picture pixels: what a building is for, under its name
const PLAQUE = { width: 520, height: 70, size: 34 };
const SAIL = { width: 330, height: 70, size: 28 };
const GOLD_PILL = { height: 50, size: 26, pad: 18 };

const LABEL_STYLE: TextStyleOptions = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontWeight: 'bold',
  fontSize: LABEL_SIZE,
  fill: COLORS.label,
  stroke: { color: COLORS.labelStroke, width: 6, join: 'round' },
  dropShadow: { color: 0x000000, alpha: 0.6, blur: 4, distance: 2, angle: Math.PI / 2 },
};

/** A building's medallion on the picture: lights up and grows under the pointer, opens the building when clicked */
class Medallion {
  readonly container = new Container();
  /** What grows under the pointer: the medallion, its glow and its badge (not its name) */
  private readonly face = new Container();
  private readonly sprite = new Sprite();
  private readonly glow = new Graphics();
  private readonly fallback = new Graphics();
  private readonly label: Text;
  private readonly about = new Container();
  private readonly badge = new Container();
  private readonly badgeText: Text;
  private grow = 0;
  hovered = false;

  constructor(building: Building, onTap: () => void) {
    const r = MEDALLION / 2;
    this.glow.circle(0, 0, r * 1.32).fill({ color: COLORS.gold });
    this.glow.alpha = 0;
    const shadow = new Graphics().circle(3, 6, r * 1.02).fill({ color: 0x000000, alpha: 0.4 });
    // Until the medallions' picture loads: a plain one, so the building can be opened all the same
    this.fallback.circle(0, 0, r).fill({ color: UI.panel }).stroke({ width: 6, color: COLORS.gold });
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
    // A count or a mark on the top right: something waits there (a bounty to turn in, a ship to buy)
    this.badgeText = new Text({
      text: '',
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: 22, fill: UI.text },
    });
    this.badgeText.anchor.set(0.5);
    const dot = new Graphics().circle(0, 0, 17).fill({ color: COLORS.badge }).stroke({ width: 3, color: UI.text });
    this.badge.addChild(dot, this.badgeText);
    this.badge.position.set(r * 0.72, -r * 0.72);
    this.badge.visible = false;
    this.face.addChild(this.glow, shadow, this.fallback, this.sprite, this.badge);

    this.label = new Text({ text: t(building.name), style: LABEL_STYLE });
    this.label.anchor.set(0.5, 0);
    this.label.position.set(0, r + 2);
    const about = new Text({
      text: t(building.about),
      style: {
        fontFamily: 'Arial',
        fontSize: ABOUT.size,
        fill: UI.text,
        wordWrap: true,
        wordWrapWidth: ABOUT.width,
        align: 'center',
      },
    });
    about.anchor.set(0.5, 0);
    const box = new Graphics()
      .roundRect(-about.width / 2 - ABOUT.pad, -ABOUT.pad / 2, about.width + ABOUT.pad * 2, about.height + ABOUT.pad, 8)
      .fill({ color: 0x000000, alpha: 0.72 });
    this.about.addChild(box, about);
    this.about.position.set(0, this.label.y + this.label.height + 6);
    this.about.visible = false;
    this.container.addChild(this.face, this.label, this.about);

    // The medallion and its name open it
    const half = Math.max(r, this.label.width / 2);
    this.container.hitArea = new Rectangle(-half, -r, half * 2, r * 2 + this.label.height + 4);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.on('pointerdown', (e) => e.stopPropagation());
    this.container.on('pointertap', () => {
      playTap();
      onTap();
    });
    this.container.on('pointerover', () => (this.hovered = true));
    this.container.on('pointerout', () => (this.hovered = false));
  }

  setTexture(texture: Texture) {
    this.sprite.texture = texture;
    this.sprite.width = this.sprite.height = MEDALLION * 1.04;
    this.sprite.visible = true;
    this.fallback.visible = false;
  }

  /** A mark over it, or none (empty) */
  setBadge(mark: string) {
    this.badge.visible = mark !== '';
    show(this.badgeText, mark);
  }

  update(dt: number, time: number) {
    this.grow += ((this.hovered ? 1 : 0) - this.grow) * Math.min(1, dt * EASE);
    this.face.scale.set(1 + (HOVER_SCALE - 1) * this.grow);
    // Breathing faintly, so the eye finds them; lit under the pointer
    this.glow.alpha = GLOW.alpha * this.grow + GLOW.pulse * (0.5 + 0.5 * Math.sin(time * GLOW.speed));
    const fill = this.hovered ? COLORS.labelHover : COLORS.label;
    if (this.label.style.fill !== fill) this.label.style.fill = fill;
    this.about.visible = this.hovered;
  }
}

/**
 * The port seen from its roadstead, in a frame over the game while the ship is in port: a picture of the harbour with a
 * medallion over each building (opening its window), the port's name on a plaque, the player's gold
 * and Set sail. The picture loads the first time the ship comes into port; until then (or if it fails) the
 * medallions stand on the sea's colour
 */
export class HarbourView {
  readonly container = new Container();
  private readonly dim = new Graphics();
  private readonly frame = new Container();
  private readonly picture = new Sprite();
  private readonly backdrop = new Graphics();
  private readonly frameLines = new Graphics();
  /** The medallions, in a layer of their own: the one under the pointer is raised over the others */
  private readonly spots = new Container();
  private readonly medallions = new Map<BuildingId, Medallion>();
  private readonly gold: Text;
  private readonly coin = new Graphics();
  private readonly goldPill = new Container();
  private readonly goldBack = new Graphics();
  private readonly plaque: Container;
  private readonly sail: Container;
  private readonly screen: Rectangle;
  private size = { ...PICTURE };
  private textures = new Map<BuildingId, Texture>();
  private loading: Promise<void> | null = null;
  /** The screen size and picture size the frame was fitted to */
  private fittedTo = '';
  private time = 0;

  constructor(screen: Rectangle, portName: string, onEnter: (id: BuildingId) => void, onSetSail: () => void) {
    this.screen = screen;
    // Clicks round the picture must not reach the stage, which would steer the ship
    this.dim.eventMode = 'static';
    this.dim.on('pointerdown', (e) => e.stopPropagation());
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointerdown', (e) => e.stopPropagation());
    for (const building of BUILDINGS) {
      const medallion = new Medallion(building, () => onEnter(building.id));
      this.medallions.set(building.id, medallion);
      this.spots.addChild(medallion.container);
    }
    this.gold = new Text({ text: '', style: { ...LABEL_STYLE, fontSize: GOLD_PILL.size, fill: 0xffd75a } });
    this.gold.anchor.set(1, 0.5);
    drawCoin(this.coin, 14);
    this.coin.scale.set(1.3);
    this.goldPill.addChild(this.goldBack, this.coin, this.gold);
    this.plaque = this.makePlaque(t(portName));
    this.sail = this.sailButton(onSetSail);
    this.frame.addChild(
      this.backdrop,
      this.picture,
      this.frameLines,
      this.spots,
      this.goldPill,
      this.plaque,
      this.sail,
    );
    this.container.addChild(this.dim, this.frame);
    this.container.visible = false;
    this.layout();
  }

  get isOpen() {
    return this.container.visible;
  }

  /** Shows the view, loading its pictures the first time */
  open() {
    this.container.visible = true;
    this.loading ??= this.load().catch((error) => console.warn('The harbour picture failed to load', error));
  }

  close() {
    this.container.visible = false;
  }

  /** Lets go of the medallion under the pointer: a window opened over it, so the pointer never leaves it */
  unhover() {
    for (const medallion of this.medallions.values()) medallion.hovered = false;
  }

  /** A building's medallion, for its window's title; null until the medallions have loaded */
  medallion(id: BuildingId): Texture | null {
    return this.textures.get(id) ?? null;
  }

  /** Every frame while open. badges: a mark over a building's medallion (a count, "!"), none if missing */
  update(dt: number, gold: number, badges: Partial<Record<BuildingId, string>>) {
    if (!this.isOpen) return;
    this.time += dt;
    const { width, height } = this.screen;
    const fit = `${width}x${height}:${this.size.width}x${this.size.height}`;
    if (fit !== this.fittedTo) {
      this.fittedTo = fit;
      this.fit(width, height);
    }
    show(this.gold, t('{n} gold', { n: gold }));
    this.layoutGold();
    for (const [id, medallion] of this.medallions) {
      medallion.setBadge(badges[id] ?? '');
      medallion.update(dt, this.time);
      // The one under the pointer over the others: its name and note aren't hidden by a neighbour's medallion
      const top = this.spots.children.length - 1;
      if (medallion.hovered && this.spots.getChildIndex(medallion.container) !== top)
        this.spots.setChildIndex(medallion.container, top);
    }
  }

  private async load() {
    const art = await Assets.load<unknown>(`${ART}/harbour.json`);
    if (!isHarbourArt(art)) throw new Error('harbour.json is not what the game expects');
    const [picture, sheet] = await Promise.all([
      Assets.load<Texture>({ src: `${ART}/${art.picture.file}`, data: { autoGenerateMipmaps: true } }),
      Assets.load<Texture>({ src: `${ART}/${art.medallions.file}`, data: { autoGenerateMipmaps: true } }),
    ]);
    this.picture.texture = picture;
    this.size = { width: PICTURE.width, height: Math.round((PICTURE.width * art.picture.h) / art.picture.w) };
    const { size } = art.medallions;
    for (const { id } of BUILDINGS) {
      const spot = art.buildings[id];
      const texture = new Texture({
        source: sheet.source,
        frame: new Rectangle(spot.medallion * size, 0, size, size),
      });
      this.textures.set(id, texture);
      this.medallions.get(id)?.setTexture(texture);
    }
    this.layout(art);
  }

  /** The medallions where their buildings stand on the picture, kept inside it with their names */
  private layout(art?: HarbourArt) {
    const { width, height } = this.size;
    this.backdrop.clear().rect(0, 0, width, height).fill({ color: COLORS.sea });
    this.drawFrame();
    this.plaque.position.set(width / 2, 0);
    this.sail.position.set(width / 2, height);
    this.picture.width = width;
    this.picture.height = height;
    const r = MEDALLION / 2;
    for (const [id, medallion] of this.medallions) {
      const [sx, sy] = art?.buildings[id]?.at ?? FALLBACK[id];
      const x = Math.min(Math.max(sx * width, r + 20), width - r - 20);
      const y = Math.min(Math.max(sy * height, r + PLAQUE.height), height - r - LABEL_SIZE * 2 - SAIL.height / 2);
      medallion.container.position.set(x, y);
    }
    this.fittedTo = '';
  }

  private fit(width: number, height: number) {
    const w = this.size.width + (FRAME.wood + FRAME.outer) * 2;
    // The plaque and Set sail stand out of the frame by half their height, above and below
    const h = this.size.height + (FRAME.wood + FRAME.outer) * 2 + (PLAQUE.height + SAIL.height) / 2;
    const scale = Math.min(MAX_SCALE, (width - MARGIN * 2) / w, (height - MARGIN * 2) / h);
    this.frame.scale.set(scale);
    this.frame.position.set(
      Math.round((width - this.size.width * scale) / 2),
      Math.round((height - this.size.height * scale) / 2),
    );
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.55 });
  }

  /** The gold in the top right corner of the picture, its pill as wide as the number */
  private layoutGold() {
    const w = this.gold.width + GOLD_PILL.pad * 3 + 36;
    this.goldBack
      .clear()
      .roundRect(-w, -GOLD_PILL.height / 2, w, GOLD_PILL.height, GOLD_PILL.height / 2)
      .fill({ color: 0x000000, alpha: 0.55 })
      .stroke({ width: 2, color: COLORS.gold, alpha: 0.8 });
    this.gold.position.set(-GOLD_PILL.pad, 0);
    this.coin.position.set(-w + GOLD_PILL.pad + 18, 0);
    this.goldPill.position.set(this.size.width - 26, 26 + GOLD_PILL.height / 2);
  }

  /** The frame round the picture: a dark wooden border between two gold lines */
  private drawFrame() {
    const g = this.frameLines.clear();
    const { width, height } = this.size;
    const wood = FRAME.wood;
    g.rect(-wood / 2, -wood / 2, width + wood, height + wood).stroke({ width: wood, color: COLORS.wood });
    g.rect(-FRAME.gold / 2, -FRAME.gold / 2, width + FRAME.gold, height + FRAME.gold).stroke({
      width: FRAME.gold,
      color: COLORS.gold,
    });
    g.rect(-wood, -wood, width + wood * 2, height + wood * 2).stroke({ width: FRAME.outer, color: COLORS.goldDark });
  }

  /** The port's name on a parchment plaque, over the frame's top edge */
  private makePlaque(name: string) {
    const plaque = new Container();
    const label = new Text({
      text: name,
      style: { fontFamily: LABEL_STYLE.fontFamily, fontWeight: 'bold', fontSize: PLAQUE.size, fill: COLORS.plaqueText },
    });
    label.anchor.set(0.5);
    const width = Math.max(PLAQUE.width, label.width + 90);
    const back = new Graphics()
      .roundRect(-width / 2 + 4, -PLAQUE.height / 2 + 6, width, PLAQUE.height, PLAQUE.height / 2)
      .fill({ color: 0x000000, alpha: 0.4 })
      .roundRect(-width / 2, -PLAQUE.height / 2, width, PLAQUE.height, PLAQUE.height / 2)
      .fill({ color: COLORS.plaque })
      .stroke({ width: 5, color: COLORS.gold })
      .roundRect(-width / 2 + 9, -PLAQUE.height / 2 + 9, width - 18, PLAQUE.height - 18, (PLAQUE.height - 18) / 2)
      .stroke({ width: 1.5, color: COLORS.goldDark, alpha: 0.7 });
    plaque.addChild(back, label);
    return plaque;
  }

  /** Set sail: leaves port. Green, over the frame's bottom edge */
  private sailButton(onSetSail: () => void) {
    const button = new Container();
    const back = new Graphics();
    const label = new Text({
      text: t('Set sail  (Esc)'),
      style: { ...LABEL_STYLE, fontSize: SAIL.size, fill: UI.text },
    });
    label.anchor.set(0.5);
    const width = Math.max(SAIL.width, label.width + 70);
    const paint = (hovered: boolean) =>
      back
        .clear()
        .roundRect(-width / 2 + 4, -SAIL.height / 2 + 6, width, SAIL.height, SAIL.height / 2)
        .fill({ color: 0x000000, alpha: 0.4 })
        .roundRect(-width / 2, -SAIL.height / 2, width, SAIL.height, SAIL.height / 2)
        .fill({ color: hovered ? COLORS.sailHover : COLORS.sail })
        .stroke({ width: 5, color: COLORS.gold });
    paint(false);
    button.addChild(back, label);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.on('pointerdown', (e) => e.stopPropagation());
    button.on('pointerover', () => paint(true));
    button.on('pointerout', () => paint(false));
    button.on('pointertap', () => {
      playTap();
      onSetSail();
    });
    return button;
  }
}
