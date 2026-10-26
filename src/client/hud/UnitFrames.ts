import { Container, Graphics, type Text } from 'pixi.js';
import {
  WEAPONS,
  WRECK_TIME,
  cargoCount,
  findUnit,
  isHostile,
  talentsToPick,
  xpForLevel,
  type GameState,
  type Player,
  type Ship,
} from '../../game';
import type { Selection } from '../input/selection';
import { BRASS, THEME, brassButton, drawDivider, drawHairline, drawMeter, subheading, themedPanel } from './theme';
import { Tile, UI, drawCoin, drawCrate, drawDoubloon, show, text, tint, type TileStyle } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 300; // pixels, each plate
const INSET = 15; // pixels from a plate's edge to what is on it, clear of its brass rim and gold hairline
const INNER = WIDTH - INSET * 2;
const BRACKETS = 0.6; // the plates' corner brackets, in a window's
const NAME_Y = 13; // pixels: the name along the top, its tag on the right
const HULL = { y: 40, height: 16 } as const; // pixels: the hull's meter
const XP = { y: 66, height: 8, label: 44, right: 112 } as const; // the experience meter, its level left, its XP right
const DIVIDER_Y = 87; // pixels: the line between the ship and the purse
const PURSE_Y = 104; // pixels: the middle of the gold's and the doubloons' line
const COIN = 7; // pixels: their coins' radius
const HOLD = { y: 117, height: 24, crate: 12, meter: 8, count: 46 } as const; // the hold's row, its crate and meter
const OWN_HEIGHT = HOLD.y + HOLD.height + 12;
const TARGET_HEIGHT = 104;
const FIRE = { width: 124, height: 24, y: 64 } as const;
const COLORS = { gold: 0xffcf3f, doubloons: 0xffb877, xp: 0x5aa8ff } as const;
/** Doubloons the player has: none until the currency comes in, bought (the online game) */
const DOUBLOONS = 0;
/** The hold's row: a darker board that lights up under the pointer, like a button */
const ROW_STYLE: TileStyle = { ...BRASS, idle: THEME.cardDark, hover: THEME.buttonHover, borderAlpha: 0.35 };

/** One plate of dark wood under a brass frame: a name with a tag beside it, the hull's meter, a lit hairline */
class Plate {
  readonly container = new Container();
  private readonly name = subheading('', 16);
  private readonly tag = text('', 12, UI.dim, { fontWeight: 'bold' });
  private readonly meter = new Graphics();
  private readonly value = text('', 12, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } });
  /** Over the plain hairline: gold while a talent waits (the player's), red round a hostile unit (a target's) */
  private readonly lit = new Graphics();
  private litColor = -1;
  private painted = '';

  constructor(height: number) {
    this.name.position.set(INSET, NAME_Y);
    this.tag.anchor.set(1, 0);
    this.tag.position.set(WIDTH - INSET, NAME_Y + 4);
    this.meter.position.set(INSET, HULL.y);
    this.value.anchor.set(0.5, 0.5);
    this.value.position.set(WIDTH / 2, HULL.y + HULL.height / 2);
    this.container.addChild(
      themedPanel(WIDTH, height, BRACKETS),
      this.lit,
      this.meter,
      this.name,
      this.tag,
      this.value,
    );
    this.lit.visible = false;
    this.container.eventMode = 'static';
    // A click on the plate must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
  }

  /** lit: the hairline's colour, or null for the plain one */
  set(name: string, tag: string, tagColor: number, hp: number, maxHp: number, lit: number | null, height: number) {
    show(this.name, name);
    show(this.tag, tag);
    tint(this.tag, tagColor);
    show(this.value, `${hp} / ${maxHp}`);
    this.lit.visible = lit !== null;
    if (lit !== null && lit !== this.litColor) {
      this.litColor = lit;
      drawHairline(this.lit.clear(), WIDTH, height, lit, 0.95);
    }
    const share = maxHp > 0 ? hp / maxHp : 0;
    const key = share.toFixed(3);
    if (key === this.painted) return;
    this.painted = key;
    const color = share > 0.5 ? UI.good : share > 0.25 ? UI.warn : UI.bad;
    drawMeter(this.meter.clear(), INNER, HULL.height, share, color);
  }
}

/**
 * Two plates in the windows' theme: the player's in the top left corner (the ship's hull, whether it is repairing, in
 * combat or sunk, its level and experience; under them the purse, gold and doubloons, and the hold, a click on which
 * opens it; a click on the rest opens the statistics), and at the top the unit they picked out with a click (its
 * hull, whether it attacks them, what hurts it, and a button to fire at it)
 */
export class UnitFrames {
  static readonly WIDTH = WIDTH;
  /** Pixels: the player's plate, which the HUD's column goes under */
  static readonly OWN_HEIGHT = OWN_HEIGHT;
  /** Pixels: the target's plate at the top */
  static readonly TARGET_HEIGHT = TARGET_HEIGHT;
  /** Pixels: the top of the player's plate, the ship's part over the purse, that the talent button goes beside */
  static readonly SHIP_HEIGHT = DIVIDER_Y;
  readonly container = new Container();
  private readonly own = new Plate(OWN_HEIGHT);
  private readonly level = text('', 12, UI.text, { fontWeight: 'bold' });
  private readonly xpBar = new Graphics();
  private readonly xpText = text('', 11, UI.dim, { fontWeight: 'bold' });
  /** What the experience bar was drawn for */
  private xpDrawn = -1;
  private readonly gold = text('', 14, COLORS.gold, { fontWeight: 'bold' });
  private readonly doubloons = text('', 14, COLORS.doubloons, { fontWeight: 'bold' });
  private readonly holdCount = text('', 12, THEME.text, { fontWeight: 'bold' });
  private readonly holdMeter = new Graphics();
  /** The hold as its meter was drawn for */
  private holdDrawn = '';
  private readonly target = new Plate(TARGET_HEIGHT);
  private readonly note = text('', 11, UI.dim, { wordWrap: true, wordWrapWidth: INNER - FIRE.width - 8 });
  private readonly fire: { readonly tile: Tile; readonly text: Text };

  /**
   * toggleFire: fires at the unit picked out, or stops; openStats: the statistics, by a click on the player's plate;
   * openHold: the hold, by a click on its row
   */
  constructor(toggleFire: () => void, openStats: () => void, openHold: () => void) {
    this.own.container.cursor = 'pointer';
    this.own.container.on('pointertap', openStats);
    this.level.position.set(INSET, XP.y - 5);
    this.xpBar.position.set(INSET + XP.label, XP.y);
    this.xpText.anchor.set(1, 0);
    this.xpText.position.set(WIDTH - INSET, XP.y - 5);
    const divider = drawDivider(new Graphics(), INSET, DIVIDER_Y, INNER);
    this.own.container.addChild(this.xpBar, this.level, this.xpText, divider, ...this.purse(), this.holdRow(openHold));

    this.fire = brassButton(FIRE.width, FIRE.height, t('Fire  (Space)'), toggleFire, 12);
    this.fire.tile.container.position.set(WIDTH - INSET - FIRE.width, FIRE.y);
    this.note.position.set(INSET, FIRE.y);
    this.target.container.addChild(this.note, this.fire.tile.container);
    this.container.addChild(this.own.container, this.target.container);
  }

  /** The gold and the doubloons, a coin before each, side by side */
  private purse() {
    const coin = new Graphics();
    drawCoin(coin, COIN);
    coin.position.set(INSET + COIN, PURSE_Y);
    this.gold.anchor.set(0, 0.5);
    this.gold.position.set(INSET + COIN * 2 + 6, PURSE_Y);
    const doubloon = new Graphics();
    drawDoubloon(doubloon, COIN);
    doubloon.position.set(WIDTH / 2 + 8 + COIN, PURSE_Y);
    this.doubloons.anchor.set(0, 0.5);
    this.doubloons.position.set(doubloon.x + COIN + 6, PURSE_Y);
    return [coin, this.gold, doubloon, this.doubloons];
  }

  /** The hold's row: a crate, how full it is as a meter notched by its places, and the count; a click opens it */
  private holdRow(openHold: () => void) {
    const tile = new Tile(INNER + 8, HOLD.height, openHold, 5, ROW_STYLE);
    tile.container.position.set(INSET - 4, HOLD.y);
    // The plate under it opens the statistics: not on this click
    tile.container.on('pointertap', (e) => e.stopPropagation());
    const crate = new Graphics();
    drawCrate(crate, HOLD.crate);
    crate.position.set(4 + COIN, HOLD.height / 2);
    const label = text(t('Hold'), 12, THEME.text, { fontWeight: 'bold' });
    label.anchor.set(0, 0.5);
    label.position.set(4 + COIN * 2 + 6, HOLD.height / 2);
    this.holdMeter.position.set(label.x + label.width + 10, (HOLD.height - HOLD.meter) / 2);
    this.holdCount.anchor.set(1, 0.5);
    this.holdCount.position.set(tile.width - 8, HOLD.height / 2);
    tile.content.addChild(crate, label, this.holdMeter, this.holdCount);
    return tile.container;
  }

  /** The level, lit while a talent waits to be picked (the talent button beside the plate), and the XP to the next */
  private updateXp(ship: Ship, pending: boolean) {
    const { level, xp } = ship;
    const max = level >= ship.shipClass.maxLevel;
    const start = xpForLevel(level);
    const share = max ? 1 : (xp - start) / (xpForLevel(level + 1) - start);
    show(this.level, t('Lv {level}', { level }));
    tint(this.level, pending ? UI.active : UI.text);
    show(
      this.xpText,
      max ? t('Max level') : t('{xp} / {need} XP', { xp: xp - start, need: xpForLevel(level + 1) - start }),
    );
    const width = INNER - XP.label - XP.right;
    const drawn = Math.round(share * width);
    if (drawn === this.xpDrawn) return;
    this.xpDrawn = drawn;
    drawMeter(this.xpBar.clear(), width, XP.height, drawn / width, COLORS.xp);
  }

  /** The gold, the doubloons and how full the hold is: the meter red when it is */
  private updatePurse(player: Player, ship: Ship) {
    show(this.gold, t('{n} gold', { n: player.gold }));
    show(this.doubloons, t('{n} doubloon|{n} doubloons', { n: DOUBLOONS }));
    const cargo = cargoCount(ship.cargo);
    const full = cargo >= ship.holdSize;
    show(this.holdCount, `${cargo}/${ship.holdSize}`);
    tint(this.holdCount, full ? UI.warn : THEME.text);
    const key = `${cargo}/${ship.holdSize}`;
    if (key === this.holdDrawn) return;
    this.holdDrawn = key;
    const width = INNER + 8 - this.holdMeter.x - HOLD.count;
    const share = ship.holdSize > 0 ? cargo / ship.holdSize : 0;
    drawMeter(this.holdMeter.clear(), width, HOLD.meter, share, full ? UI.bad : THEME.brass, ship.holdSize);
  }

  /**
   * The player's plate in the top left corner, `margin` from the edges; the target's at the top, centred, but clear
   * of `left` pixels taken by the player's plate and the HUD's column under it, and of what is right of `right`
   */
  layout(screenWidth: number, margin: number, left: number, right: number) {
    this.own.container.position.set(margin, margin);
    const centred = (screenWidth - WIDTH) / 2;
    this.target.container.position.set(Math.round(Math.max(left, Math.min(centred, right - WIDTH))), margin);
  }

  update(state: GameState, selection: Selection) {
    const { ship, time } = state;
    let status = '';
    let statusColor: number = UI.dim;
    if (ship.isSinking) {
      const back = Math.max(0, Math.ceil(WRECK_TIME - (time - (ship.wreckedAt ?? time))));
      status = t('Sunk: back at the harbour in {n} s', { n: back });
      statusColor = UI.bad;
    } else if (ship.docked) {
      status = t('In port');
      statusColor = UI.active;
    } else if (ship.repairing) {
      status = t('Repairing');
      statusColor = UI.heal;
    } else if (ship.inCombat(time)) {
      status = t('In combat');
      statusColor = UI.warn;
    }
    const pending = talentsToPick(ship) > 0;
    const lit = pending ? THEME.title : null;
    this.own.set(t(ship.shipClass.name), status, statusColor, ship.hp, ship.maxHp, lit, OWN_HEIGHT);
    this.updateXp(ship, pending);
    this.updatePurse(state.player, ship);

    const unit = selection.id === null ? undefined : findUnit(state, selection.id);
    this.target.container.visible = unit !== undefined;
    if (!unit) return;
    // Another player's ship: no bot's temper to show
    let tag = t('Player');
    let tagColor: number = UI.dim;
    let alarm: number | null = null;
    if (unit.bot) {
      const hostile = isHostile(unit, ship.id);
      tag = unit.bot.foe === ship.id ? t('Attacking you') : hostile ? t('Aggressive') : t('Neutral');
      tagColor = hostile ? UI.hostile : UI.good;
      alarm = hostile ? UI.hostile : null;
    }
    this.target.set(t(unit.shipClass.name), tag, tagColor, unit.hp, unit.maxHp, alarm, TARGET_HEIGHT);
    const best = unit.nature === 'creature' ? WEAPONS.harpoon : WEAPONS.cannon;
    const what = unit.nature === 'creature' ? 'Creature' : 'Ship';
    show(this.note, t('{what}: {weapon} do full damage', { what: t(what), weapon: t(best.name).toLowerCase() }));
    const firing = ship.attackTarget === unit.id;
    this.fire.tile.setLook({ pressed: firing });
    show(this.fire.text, firing ? t('Cease fire  (Esc)') : t('Fire  (Space)'));
    tint(this.fire.text, firing ? THEME.darkText : THEME.text);
  }
}
