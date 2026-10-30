import {
  CanvasTextMetrics,
  Circle,
  Container,
  FillGradient,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type TextStyleOptions,
} from 'pixi.js';
import {
  BOT_KINDS,
  WRECK_TIME,
  cargoCount,
  findUnit,
  isHostile,
  talentsToPick,
  xpForLevel,
  type BotKindId,
  type GameState,
  type Player,
  type Ship,
  type ShipClassId,
} from '../../game';
import type { CursorId } from '../input/cursor';
import type { Selection } from '../input/selection';
import { HullPortrait } from '../scene/models/portrait';
import { CaptainPortrait } from './CaptainPortrait';
import { MINIMAP_BUTTONS } from './iconAtlas';
import {
  NIGHT,
  NIGHT_SPOT,
  drawNightMeter,
  drawPlateEdge,
  moonButton,
  moonButtonEnd,
  moonLabel,
  nightPlate,
} from './nightTheme';
import { BRASS_FILL, THEME, subheading } from './theme';
import { Tile, UI, clip, doubloon, goldCoin, playTap, show, text, tint, whole, xpStar } from './ui';
import { t } from '../i18n/i18n';

const NAME_SIZE = 12; // pixels: a frame's name, in the titles' gold serif
const NAME_GAP = 8; // pixels between the name and what is right of it
/** The moonlight round the player's portrait under the pointer: rings out from its ring, pixels wide and how solid */
const HALO: readonly (readonly [number, number])[] = [
  [10, 0.07],
  [6, 0.13],
  [3, 0.22],
];
const HALO_COLOR = 0xa9c8ff;
const COLORS = { gold: 0xffcf3f, doubloons: 0xffb877, xp: 0x5aa8ff } as const;

/**
 * The level's badge, a small medallion on the ring: a dark line round a bevelled brass rim (`rim` pixels of its
 * radius), domed glass inside, the night's blue at rest and gold while a talent waits; its glint, an ellipse of light
 * high on the glass (its middle, half width and half height, in the glass's radius, and how bright at rest and lit)
 */
const BADGE = {
  rim: 2.5,
  glint: { y: -0.48, width: 0.6, height: 0.32, rest: 0.14, lit: 0.34 },
  font: 1.1, // the level's size, in the badge's radius
} as const;
/** The gold light round the badge while a talent waits: rings out from its rim, pixels wide and how solid */
const BADGE_HALO: readonly (readonly [number, number])[] = [
  [9, 0.1],
  [5.5, 0.18],
  [2.5, 0.32],
];
const BADGE_GOLD = 0xffc94a;
// Lining figures: Georgia's old-style ones, the titles', sit up and down on a badge this small
const BADGE_FONT = '"Times New Roman", Times, serif';

/** Glass domed under light from above: brightest high on it, darkening out to its edge */
function dome(stops: readonly (readonly [number, number])[]) {
  const light = { x: 0.5, y: 0.25 };
  return new FillGradient({
    type: 'radial',
    center: light,
    innerRadius: 0,
    outerCenter: light,
    outerRadius: 0.8,
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
}
const BADGE_GLASS = {
  rest: dome([
    [0, 0x3d6cb8],
    [0.55, 0x13306a],
    [1, 0x050b1a],
  ]),
  lit: dome([
    [0, 0xfff8dc],
    [0.35, 0xffd76e],
    [0.75, 0xd0922c],
    [1, 0x7a4a10],
  ]),
};

/** The level's letters: the titles' gold, edged dark, at rest; engraved dark into the gold glass while lit */
function levelStyle(radius: number, lit: boolean): TextStyleOptions {
  const font = { fontFamily: BADGE_FONT, fontWeight: 'bold', fontSize: Math.round(radius * BADGE.font) } as const;
  return lit
    ? {
        ...font,
        fill: THEME.darkText,
        dropShadow: { color: 0xfff3cf, alpha: 0.6, blur: 0, distance: 1, angle: Math.PI / 2 },
      }
    : { ...font, fill: THEME.title, stroke: { color: 0x120a03, width: 3, join: 'round' } };
}

/** The badge round (0, 0), `radius` pixels to its brass rim's edge, its halo out beyond that while lit */
function drawBadge(g: Graphics, radius: number, lit: boolean) {
  if (lit) {
    for (const [width, alpha] of BADGE_HALO) {
      g.circle(0, 0, radius + width / 2).stroke({ width, color: BADGE_GOLD, alpha });
    }
  }
  const glass = radius - BADGE.rim;
  const { glint } = BADGE;
  return g
    .circle(0, 0, radius)
    .stroke({ width: 3, color: NIGHT.rim, alpha: 0.85 })
    .circle(0, 0, radius)
    .fill(BRASS_FILL)
    .stroke({ width: 1, color: lit ? THEME.brassLight : THEME.brassDark })
    .circle(0, 0, glass)
    .fill(lit ? BADGE_GLASS.lit : BADGE_GLASS.rest)
    .stroke({ width: 1, color: NIGHT.rim, alpha: 0.7 })
    .ellipse(0, glass * glint.y, glass * glint.width, glass * glint.height)
    .fill({ color: 0xffffff, alpha: lit ? glint.lit : glint.rest });
}

/**
 * Where a frame's parts are, in pixels from its top left corner: the picture in a gold ring (its middle, its
 * radius, the ring's width) over the end of the plate beside it, the level's badge on the ring's lower right, what is
 * on the plate between `left` and `right`, its name along the top and the hull's meter under it
 */
interface FrameBox {
  readonly ring: { readonly x: number; readonly y: number; readonly radius: number; readonly width: number };
  readonly badge: { readonly x: number; readonly y: number; readonly radius: number };
  readonly plate: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly left: number;
  readonly right: number;
  readonly nameY: number;
  readonly hull: { readonly y: number; readonly height: number };
}

/** The player's frame: their captain's portrait, big */
const OWN: FrameBox = {
  ring: { x: 39, y: 39, radius: 34, width: 4 },
  badge: { x: 64, y: 63, radius: 11 },
  plate: { x: 39, y: 5, width: 253, height: 68 },
  left: 87,
  right: 280,
  nameY: 9,
  hull: { y: 29, height: 13 },
};
// The experience's thin meter, and room on its right for the XP to the next level after the star
const XP = { y: 46, height: 5, room: 78, star: 5 } as const;
const PURSE_Y = 62; // pixels: the middle of the gold's and the doubloons' line, the status at its right end
const COIN = 6; // pixels: their coins' radius
// Pixels: the hold's spot at the top right, its painted icon (the minimap's button) and the count after it
const HOLD = { width: 60, height: 18, icon: 18 } as const;

/**
 * The unit picked out's frame is the player's (the two side by side, alike): its hull's picture in the ring, its tier
 * where the player's hold is, its temper under the hull's meter and the Fire button beside it
 */
const TARGET = OWN;
/**
 * Pixels: the Fire button at the bottom right, its top; at its narrowest, wider for a longer label with `pad` more on
 * each side of it. Its label is smaller than the windows' buttons' to leave the temper room beside it
 */
const FIRE = { y: 48, width: 100, height: 22, label: 10, pad: 2 } as const;

function frameWidth(box: FrameBox) {
  return box.plate.x + box.plate.width;
}

function frameHeight(box: FrameBox) {
  return Math.max(box.plate.y + box.plate.height, box.badge.y + box.badge.radius) + 2;
}

/**
 * A frame in the night look, the player's or the unit picked out's: a picture in a gold ring over the end of a plate,
 * the level on a badge on the ring, a name along the plate's top (cut short where it would meet what its owner puts
 * right of it), the hull's meter with its points on it, and the plate's edge lit
 */
class Frame {
  readonly container = new Container();
  /** In the ring, its middle at (0, 0), cut round: the owner puts the picture in it */
  readonly picture = new Container();
  /** The ring with the picture and the badge */
  readonly ring = new Container();
  private readonly box: FrameBox;
  private readonly name = subheading('', NAME_SIZE);
  private readonly meter = new Graphics();
  private readonly value = text('', 11, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } });
  private readonly badge = new Graphics();
  private readonly level: Text;
  /** Whether the badge was drawn lit; null before the first frame */
  private badgeLit: boolean | null = null;
  /** Over the plain edge: gold while a talent waits (the player's), red round a hostile unit (a target's) */
  private readonly lit = new Graphics();
  private litColor = -1;
  /** The name as last cut to its room */
  private named = '';
  private painted = '';

  constructor(box: FrameBox) {
    this.box = box;
    const { plate, ring, badge, hull } = box;
    this.name.anchor.set(0, 0.5);
    this.name.position.set(box.left, box.nameY + NAME_SIZE * 0.6);
    this.meter.position.set(box.left, hull.y);
    this.value.anchor.set(0.5, 0.5);
    this.value.position.set((box.left + box.right) / 2, hull.y + hull.height / 2);
    const board = nightPlate(plate.width, plate.height);
    board.position.set(plate.x, plate.y);
    this.lit.position.set(plate.x, plate.y);
    this.lit.visible = false;

    this.ring.position.set(ring.x, ring.y);
    const outer = ring.radius + ring.width;
    const gold = new Graphics()
      .circle(0, 0, outer)
      .fill({ color: THEME.brass })
      .stroke({ width: 1, color: THEME.brassDark })
      .circle(0, 0, ring.radius + 0.5)
      .fill({ color: NIGHT.well })
      .stroke({ width: 1.5, color: NIGHT.rim });
    const cut = new Graphics().circle(0, 0, ring.radius).fill(0xffffff);
    this.picture.mask = cut;
    this.badge.position.set(badge.x - ring.x, badge.y - ring.y);
    this.level = new Text({ text: '', style: levelStyle(badge.radius, false) });
    this.level.anchor.set(0.5);
    this.level.position.copyFrom(this.badge.position);
    this.ring.addChild(gold, this.picture, cut, this.badge, this.level);

    this.container.addChild(board, this.lit, this.meter, this.name, this.value, this.ring);
    this.container.eventMode = 'static';
    // A click on the frame must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
  }

  /** The name, cut short to leave `taken` pixels at the plate's right end */
  setName(name: string, taken: number) {
    const room = this.box.right - this.box.left - (taken > 0 ? taken + NAME_GAP : 0);
    const named = `${name}|${room}`;
    if (named === this.named) return;
    this.named = named;
    this.name.text = name;
    clip(this.name, room);
  }

  /** lit: the plate's edge's colour, or null for the plain one */
  setHull(hp: number, maxHp: number, lit: number | null) {
    const { box } = this;
    show(this.value, `${hp} / ${maxHp}`);
    this.lit.visible = lit !== null;
    if (lit !== null && lit !== this.litColor) {
      this.litColor = lit;
      drawPlateEdge(this.lit.clear(), box.plate.width, box.plate.height, lit);
    }
    const share = maxHp > 0 ? hp / maxHp : 0;
    const key = share.toFixed(3);
    if (key === this.painted) return;
    this.painted = key;
    const color = share > 0.5 ? UI.good : share > 0.25 ? UI.warn : UI.bad;
    drawNightMeter(this.meter.clear(), box.right - box.left, box.hull.height, share, color);
  }

  /** The level on the badge: gold while a talent waits to be picked */
  setLevel(level: number, lit: boolean) {
    show(this.level, `${level}`);
    if (lit === this.badgeLit) return;
    this.badgeLit = lit;
    const { radius } = this.box.badge;
    this.level.style = levelStyle(radius, lit);
    drawBadge(this.badge.clear(), radius, lit);
  }
}

/** What a click on the frames does */
export interface FrameActions {
  /** Fires at the unit picked out, or stops */
  readonly toggleFire: () => void;
  /** The statistics, by a click on the player's frame */
  readonly openStats: () => void;
  /** The hold, by a click on its icon */
  readonly openHold: () => void;
  /** The portraits to pick the captain's from, by a click on it */
  readonly openPortraits: () => void;
  /** The bestiary on a bot's kind, by a click on its frame */
  readonly openBestiary: (kind: BotKindId) => void;
}

/**
 * Two frames in the night look, alike: the player's in the top left corner, their captain's portrait in a gold ring
 * (a click on it picks another), the ship's level on a badge on the ring (gold while a talent waits), its name, the
 * hold's icon and count at the top right (a click opens the hold), its hull and experience, the gold and the doubloons
 * and whether it is repairing, in combat, in port or sunk (a click on the rest opens the statistics); and at the top
 * the unit they picked out with a click, in a frame like it: its hull's picture, its level, name and tier, its hull,
 * its temper and a button to fire at it (a click on the rest of a bot's opens the bestiary on its kind)
 */
export class UnitFrames {
  static readonly WIDTH = frameWidth(OWN);
  /** Pixels: the player's frame, which the HUD's column goes under */
  static readonly OWN_HEIGHT = frameHeight(OWN);
  /** Pixels: the target's frame at the top */
  static readonly TARGET_WIDTH = frameWidth(TARGET);
  static readonly TARGET_HEIGHT = frameHeight(TARGET);
  readonly container = new Container();
  private readonly own = new Frame(OWN);
  private readonly portrait = new CaptainPortrait(OWN.ring.radius * 2, true);
  private readonly xpBar = new Graphics();
  private readonly xpText = text('', 10, NIGHT.dim, { fontWeight: 'bold' });
  /** Before the XP, in place of the word */
  private readonly xpStar = xpStar(XP.star);
  /** What the experience bar was drawn for */
  private xpDrawn = -1;
  private readonly gold = text('', 12, COLORS.gold, { fontWeight: 'bold' });
  private readonly doubloonMark = doubloon(COIN);
  private readonly doubloons = text('', 12, COLORS.doubloons, { fontWeight: 'bold' });
  private readonly status = text('', 11, UI.dim, { fontWeight: 'bold' });
  private readonly holdIcon = new Sprite();
  private readonly holdCount = text('', 11, THEME.text, { fontWeight: 'bold' });
  private readonly target = new Frame(TARGET);
  private readonly tier = text('', 11, NIGHT.dim, { fontWeight: 'bold' });
  private readonly temper = text('', 11, NIGHT.dim, { fontWeight: 'bold' });
  private readonly fire: { readonly tile: Tile; readonly text: Text };
  /** The hulls' pictures made for the units picked out so far, by class: each waits for its art once */
  private readonly hulls = new Map<ShipClassId, HullPortrait>();
  private hull: HullPortrait | null = null;
  /** The kind of the bot picked out, for the bestiary; null for none, or another player's ship */
  private targetKind: BotKindId | null = null;

  constructor(actions: FrameActions) {
    const own = this.own.container;
    own.cursor = 'pointer';
    own.on('pointertap', actions.openStats);
    this.xpBar.position.set(OWN.left, XP.y);
    this.xpText.anchor.set(1, 0.5);
    this.xpText.position.set(OWN.right, XP.y + XP.height / 2);
    this.status.anchor.set(1, 0.5);
    this.status.position.set(OWN.right, PURSE_Y);
    own.addChild(this.xpBar, this.xpText, this.xpStar, ...this.purse(), this.status, this.holdSpot(actions.openHold));
    this.portrait.container.position.set(-OWN.ring.radius, -OWN.ring.radius);
    this.own.picture.addChild(this.portrait.container);
    this.portraitButton(actions.openPortraits);

    const target = this.target.container;
    // As wide as the longer of its two labels in the language picked: they swap as it fires and stops
    const labels = [t('Fire  (Space)'), t('Cease fire  (Esc)')];
    const style = new TextStyle(moonLabel(FIRE.label));
    const widest = Math.max(...labels.map((label) => CanvasTextMetrics.measureText(label, style).width));
    const fireWidth = Math.max(FIRE.width, Math.ceil(widest) + (moonButtonEnd(FIRE.height) + FIRE.pad) * 2);
    this.fire = moonButton(fireWidth, FIRE.height, labels[0], actions.toggleFire, FIRE.label);
    this.fire.tile.container.position.set(TARGET.right + 2 - fireWidth, FIRE.y);
    // The frame under it opens the bestiary: not on this click
    this.fire.tile.container.on('pointertap', (e) => e.stopPropagation());
    target.on('pointertap', () => {
      if (this.targetKind) actions.openBestiary(this.targetKind);
    });
    this.tier.anchor.set(1, 0.5);
    this.tier.position.set(TARGET.right, TARGET.nameY + NAME_SIZE * 0.6);
    this.temper.anchor.set(0, 0.5);
    this.temper.position.set(TARGET.left, FIRE.y + FIRE.height / 2);
    target.addChild(this.tier, this.temper, this.fire.tile.container);
    this.container.addChild(own, target);
  }

  /** The gold and the doubloons, a coin before each, the doubloons after the gold whatever its length */
  private purse() {
    const coin = goldCoin(COIN);
    coin.position.set(OWN.left + COIN, PURSE_Y);
    this.gold.anchor.set(0, 0.5);
    this.gold.position.set(OWN.left + COIN * 2 + 5, PURSE_Y);
    this.doubloonMark.y = PURSE_Y;
    this.doubloons.anchor.set(0, 0.5);
    this.doubloons.y = PURSE_Y;
    return [coin, this.gold, this.doubloonMark, this.doubloons];
  }

  /** The hold's icon, the minimap's button painted small, and its count at the top right: a click opens the hold */
  private holdSpot(openHold: () => void) {
    const tile = new Tile(HOLD.width, HOLD.height, openHold, 0, NIGHT_SPOT);
    const nameMiddle = OWN.nameY + NAME_SIZE * 0.6;
    tile.container.position.set(OWN.right + 4 - HOLD.width, Math.round(nameMiddle - HOLD.height / 2));
    // The frame under it opens the statistics: not on this click
    tile.container.on('pointertap', (e) => e.stopPropagation());
    this.holdIcon.anchor.set(0.5);
    this.holdIcon.position.set(3 + HOLD.icon / 2, HOLD.height / 2);
    MINIMAP_BUTTONS.load(() => {
      const texture = MINIMAP_BUTTONS.get('hold');
      if (!texture) return;
      this.holdIcon.texture = texture;
      this.holdIcon.setSize(HOLD.icon, HOLD.icon);
    });
    this.holdCount.anchor.set(1, 0.5);
    this.holdCount.position.set(HOLD.width - 7, HOLD.height / 2);
    tile.content.addChild(this.holdIcon, this.holdCount);
    return tile.container;
  }

  /** The captain's portrait as a button: moonlight round its ring under the pointer, a click picks another */
  private portraitButton(openPortraits: () => void) {
    const { ring } = this.own;
    const outer = OWN.ring.radius + OWN.ring.width;
    const halo = new Graphics();
    for (const [width, alpha] of HALO) {
      halo.circle(0, 0, outer + width / 2).stroke({ width, color: HALO_COLOR, alpha });
    }
    halo.visible = false;
    ring.addChildAt(halo, 0);
    ring.eventMode = 'static';
    ring.cursor = 'pointer';
    ring.hitArea = new Circle(0, 0, outer);
    ring.on('pointerover', () => (halo.visible = true));
    ring.on('pointerout', () => (halo.visible = false));
    ring.on('pointertap', (e) => {
      // The frame under it opens the statistics: not on this click
      e.stopPropagation();
      playTap();
      openPortraits();
    });
  }

  /** The experience to the next level, its thin meter and the XP */
  private updateXp(ship: Ship) {
    const { level, xp } = ship;
    const max = level >= ship.shipClass.maxLevel;
    const start = xpForLevel(level);
    const share = max ? 1 : (xp - start) / (xpForLevel(level + 1) - start);
    show(this.xpText, max ? t('Max level') : `${xp - start} / ${xpForLevel(level + 1) - start}`);
    this.xpStar.position.set(OWN.right - this.xpText.width - 3 - XP.star, XP.y + XP.height / 2);
    const width = OWN.right - OWN.left - XP.room;
    const drawn = Math.round(share * width);
    if (drawn === this.xpDrawn) return;
    this.xpDrawn = drawn;
    drawNightMeter(this.xpBar.clear(), width, XP.height, drawn / width, COLORS.xp);
  }

  /** The gold, the doubloons and how full the hold is: its count in warning yellow when it is */
  private updatePurse(player: Player, ship: Ship) {
    show(this.gold, whole(player.gold));
    show(this.doubloons, whole(player.doubloons));
    this.doubloonMark.x = Math.round(this.gold.x + this.gold.width + 12 + COIN);
    this.doubloons.x = this.doubloonMark.x + COIN + 5;
    const cargo = cargoCount(ship.cargo);
    show(this.holdCount, `${cargo}/${ship.holdSize}`);
    tint(this.holdCount, cargo >= ship.holdSize ? UI.warn : THEME.text);
  }

  /** Whether the ship is repairing, in combat, in port or sunk (how long till it is back), at the purse's end */
  private updateStatus(state: GameState) {
    const { ship, time } = state;
    let status = '';
    let color: number = UI.dim;
    if (ship.isSinking) {
      const back = Math.max(0, Math.ceil(WRECK_TIME - (time - (ship.wreckedAt ?? time))));
      status = t('Sunk: back in {n} s', { n: back });
      color = UI.bad;
    } else if (ship.docked) {
      status = t('In port');
      color = UI.active;
    } else if (ship.repairing) {
      status = t('Repairing');
      color = UI.heal;
    } else if (ship.inCombat(time)) {
      status = t('In combat');
      color = UI.warn;
    }
    show(this.status, status);
    tint(this.status, color);
  }

  /** The hull's picture of the unit picked out's class in the target's ring, made the first time it is picked */
  private showHull(classId: ShipClassId) {
    let hull = this.hulls.get(classId);
    if (!hull) {
      hull = new HullPortrait(classId, TARGET.ring.radius * 2);
      hull.container.position.set(-TARGET.ring.radius, -TARGET.ring.radius);
      this.hulls.set(classId, hull);
    }
    if (hull !== this.hull) {
      this.target.picture.removeChildren();
      this.target.picture.addChild(hull.container);
      this.hull = hull;
    }
    hull.update();
  }

  /** Puts the player's frame and the target's with their top left corners there, on the screen */
  layout(own: { readonly x: number; readonly y: number }, target: { readonly x: number; readonly y: number }) {
    this.own.container.position.set(own.x, own.y);
    this.target.container.position.set(target.x, target.y);
  }

  update(state: GameState, selection: Selection) {
    const { ship } = state;
    const pending = talentsToPick(ship) > 0;
    this.own.setName(t(ship.shipClass.name), HOLD.width - 4);
    this.own.setHull(ship.hp, ship.maxHp, pending ? THEME.title : null);
    this.own.setLevel(ship.level, pending);
    this.portrait.set(state.player.portrait);
    this.updateXp(ship);
    this.updatePurse(state.player, ship);
    this.updateStatus(state);

    const unit = selection.id === null ? undefined : findUnit(state, selection.id);
    this.target.container.visible = unit !== undefined;
    this.targetKind = unit?.bot?.kind ?? null;
    this.target.container.cursor = this.targetKind ? ('magnifier' satisfies CursorId) : 'default';
    if (!unit) return;
    // Another player's ship: no bot's temper or tier to show
    let temper = t('Player');
    let temperColor: number = NIGHT.dim;
    let tier = '';
    let alarm: number | null = null;
    let level = unit.level;
    if (unit.bot) {
      const hostile = isHostile(unit, ship.id);
      temper = unit.bot.foe === ship.id ? t('Attacking you') : hostile ? t('Aggressive') : t('Neutral');
      // Its tier beside its name: a ship of a higher tier earns little for it
      const kind = BOT_KINDS[unit.bot.kind];
      tier = t('Tier {tier}', { tier: kind.tier });
      level = kind.level;
      temperColor = hostile ? UI.hostile : UI.good;
      alarm = hostile ? UI.hostile : null;
    }
    show(this.temper, temper);
    tint(this.temper, temperColor);
    show(this.tier, tier);
    this.target.setName(t(unit.shipClass.name), Math.ceil(this.tier.width));
    this.target.setHull(unit.hp, unit.maxHp, alarm);
    this.target.setLevel(level, false);
    this.showHull(unit.shipClass.id);
    const firing = ship.attackTarget === unit.id;
    this.fire.tile.setLook({ pressed: firing });
    show(this.fire.text, firing ? t('Cease fire  (Esc)') : t('Fire  (Space)'));
  }
}
