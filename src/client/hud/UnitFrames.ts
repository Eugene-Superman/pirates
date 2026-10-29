import { Circle, Container, Graphics, Sprite, type Text } from 'pixi.js';
import {
  BOT_KINDS,
  WEAPONS,
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
import { NIGHT, NIGHT_SPOT, drawNightMeter, drawPlateEdge, moonButton, nightPlate } from './nightTheme';
import { THEME, subheading } from './theme';
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

/** The unit picked out: its hull's picture small, the plate wider for the hint and the Fire button */
const TARGET: FrameBox = {
  ring: { x: 28, y: 36, radius: 24, width: 3 },
  badge: { x: 46, y: 54, radius: 9 },
  plate: { x: 28, y: 4, width: 302, height: 64 },
  left: 64,
  right: 318,
  nameY: 8,
  hull: { y: 26, height: 12 },
};
const HINT_Y = 43; // pixels: the top of the hint and of the Fire button beside it
const FIRE = { width: 100, height: 22, label: 11 } as const;

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
  private readonly level = text('', 11, THEME.text, { fontWeight: 'bold' });
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
    tint(this.level, lit ? THEME.darkText : THEME.text);
    this.badge
      .clear()
      .circle(0, 0, this.box.badge.radius)
      .fill({ color: lit ? THEME.title : NIGHT.glassDark })
      .stroke({ width: 1.5, color: lit ? THEME.brassLight : THEME.brass });
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
 * the unit they picked out with a click, smaller: its hull's picture, its level, name, temper and tier, its hull, what
 * hurts it, and a button to fire at it (a click on the rest of a bot's opens the bestiary on its kind)
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
  private readonly tag = text('', 11, NIGHT.dim, { fontWeight: 'bold' });
  private readonly note = text('', 10, NIGHT.dim, {
    wordWrap: true,
    wordWrapWidth: TARGET.right - TARGET.left - FIRE.width - 8,
  });
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
    this.fire = moonButton(FIRE.width, FIRE.height, t('Fire  (Space)'), actions.toggleFire, FIRE.label);
    this.fire.tile.container.position.set(TARGET.right + 2 - FIRE.width, HINT_Y);
    // The frame under it opens the bestiary: not on this click
    this.fire.tile.container.on('pointertap', (e) => e.stopPropagation());
    target.on('pointertap', () => {
      if (this.targetKind) actions.openBestiary(this.targetKind);
    });
    this.tag.anchor.set(1, 0.5);
    this.tag.position.set(TARGET.right, TARGET.nameY + NAME_SIZE * 0.6);
    this.note.position.set(TARGET.left, HINT_Y + 1);
    target.addChild(this.tag, this.note, this.fire.tile.container);
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
    // Another player's ship: no bot's temper to show
    let tag = t('Player');
    let tagColor: number = NIGHT.dim;
    let alarm: number | null = null;
    let level = unit.level;
    if (unit.bot) {
      const hostile = isHostile(unit, ship.id);
      tag = unit.bot.foe === ship.id ? t('Attacking you') : hostile ? t('Aggressive') : t('Neutral');
      // Its tier beside its temper: a ship of a higher tier earns little for it
      const kind = BOT_KINDS[unit.bot.kind];
      tag = `${tag} · ${t('Tier {tier}', { tier: kind.tier })}`;
      level = kind.level;
      tagColor = hostile ? UI.hostile : UI.good;
      alarm = hostile ? UI.hostile : null;
    }
    show(this.tag, tag);
    tint(this.tag, tagColor);
    this.target.setName(t(unit.shipClass.name), Math.ceil(this.tag.width));
    this.target.setHull(unit.hp, unit.maxHp, alarm);
    this.target.setLevel(level, false);
    this.showHull(unit.shipClass.id);
    const best = unit.nature === 'creature' ? WEAPONS.harpoon : WEAPONS.cannon;
    const what = unit.nature === 'creature' ? 'Creature' : 'Ship';
    show(this.note, t('{what}: {weapon} do full damage', { what: t(what), weapon: t(best.name).toLowerCase() }));
    const firing = ship.attackTarget === unit.id;
    this.fire.tile.setLook({ pressed: firing });
    show(this.fire.text, firing ? t('Cease fire  (Esc)') : t('Fire  (Space)'));
  }
}
