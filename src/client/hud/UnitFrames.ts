import { Container, Graphics } from 'pixi.js';
import { WEAPONS, WRECK_TIME, findUnit, isHostile, type GameState } from '../../game';
import type { Selection } from '../input/selection';
import { Tile, UI, show, text, tint } from './ui';

const WIDTH = 270; // pixels, each frame
const PAD = 10;
const BAR_HEIGHT = 14;
const OWN_HEIGHT = 56;
const TARGET_HEIGHT = 78;
const FIRE = { width: 112, height: 22 };

/** One frame: a name with a tag beside it, a bar of hit points, maybe a note under it */
class Frame {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly bar = new Graphics();
  private readonly name = text('', 15, UI.text, { fontWeight: 'bold' });
  private readonly tag = text('', 12, UI.dim, { fontWeight: 'bold' });
  private readonly value = text('', 12, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } });
  readonly note = text('', 12, UI.dim);
  private painted = '';
  private readonly height: number;

  constructor(height: number) {
    this.height = height;
    this.name.position.set(PAD, 6);
    this.tag.anchor.set(1, 0);
    this.tag.position.set(WIDTH - PAD, 8);
    this.value.anchor.set(0.5, 0.5);
    this.value.position.set(WIDTH / 2, 28 + BAR_HEIGHT / 2);
    this.note.position.set(PAD, 28 + BAR_HEIGHT + 6);
    this.container.addChild(this.background, this.bar, this.name, this.tag, this.value, this.note);
    this.container.eventMode = 'static';
    // A click on the frame must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
  }

  set(name: string, tag: string, tagColor: number, hp: number, maxHp: number, border: number) {
    show(this.name, name);
    show(this.tag, tag);
    tint(this.tag, tagColor);
    show(this.value, `${hp} / ${maxHp}`);
    const share = maxHp > 0 ? hp / maxHp : 0;
    const key = `${share.toFixed(3)}${border}`;
    if (key === this.painted) return;
    this.painted = key;
    this.background
      .clear()
      .roundRect(0, 0, WIDTH, this.height, 8)
      .fill({ color: UI.panel, alpha: UI.panelAlpha })
      .stroke({ width: 1.5, color: border, alpha: 0.7 });
    const color = share > 0.5 ? UI.good : share > 0.25 ? UI.warn : UI.bad;
    const width = WIDTH - PAD * 2;
    this.bar
      .clear()
      .roundRect(PAD, 28, width, BAR_HEIGHT, 4)
      .fill({ color: 0x06121a })
      .roundRect(PAD, 28, Math.max(0, width * share), BAR_HEIGHT, 4)
      .fill({ color });
  }
}

/**
 * Two frames: the player's ship in the top left corner (hull, and whether it is repairing, in combat or sunk), and at
 * the top the unit they picked out with a click (its hull, whether it attacks them, what hurts it, and a button to
 * fire at it)
 */
export class UnitFrames {
  static readonly WIDTH = WIDTH;
  /** Pixels: the player's frame, which the HUD's column goes under */
  static readonly OWN_HEIGHT = OWN_HEIGHT;
  readonly container = new Container();
  private readonly own = new Frame(OWN_HEIGHT);
  private readonly target = new Frame(TARGET_HEIGHT);
  private readonly fire: Tile;
  private readonly fireLabel = text('Fire  (Space)', 12, UI.text, { fontWeight: 'bold' });

  /** toggleFire: fires at the unit picked out, or stops */
  constructor(toggleFire: () => void) {
    this.fire = new Tile(FIRE.width, FIRE.height, toggleFire, 5);
    this.fireLabel.anchor.set(0.5);
    this.fireLabel.position.set(FIRE.width / 2, FIRE.height / 2);
    this.fire.content.addChild(this.fireLabel);
    this.fire.container.position.set(WIDTH - PAD - FIRE.width, TARGET_HEIGHT - FIRE.height - 7);
    this.target.container.addChild(this.fire.container);
    this.target.note.style.wordWrap = true;
    this.target.note.style.wordWrapWidth = WIDTH - PAD * 3 - FIRE.width;
    this.container.addChild(this.own.container, this.target.container);
  }

  /**
   * The player's frame in the top left corner, `margin` from the edges; the target's at the top, centred, but clear
   * of `left` pixels taken by the player's frame and the HUD's column under it
   */
  layout(screenWidth: number, margin: number, left: number) {
    this.own.container.position.set(margin, margin);
    this.target.container.position.set(Math.max(left, (screenWidth - WIDTH) / 2), margin);
  }

  update(state: GameState, selection: Selection) {
    const { ship, time } = state;
    let status = '';
    let statusColor: number = UI.dim;
    if (ship.isSinking) {
      const back = Math.max(0, Math.ceil(WRECK_TIME - (time - (ship.wreckedAt ?? time))));
      status = `Sunk: back at the harbour in ${back} s`;
      statusColor = UI.bad;
    } else if (ship.docked) {
      status = 'In port';
      statusColor = UI.active;
    } else if (ship.repairing) {
      status = 'Repairing';
      statusColor = UI.heal;
    } else if (ship.inCombat(time)) {
      status = 'In combat';
      statusColor = UI.warn;
    }
    this.own.set(ship.shipClass.name, status, statusColor, ship.hp, ship.maxHp, UI.border);

    const unit = selection.id === null ? undefined : findUnit(state, selection.id);
    this.target.container.visible = unit !== undefined;
    if (!unit) return;
    // Another player's ship: no bot's temper to show
    let tag = 'Player';
    let tagColor: number = UI.dim;
    let border: number = UI.border;
    if (unit.bot) {
      const hostile = isHostile(unit, ship.id);
      tag = unit.bot.foe === ship.id ? 'Attacking you' : hostile ? 'Aggressive' : 'Neutral';
      tagColor = hostile ? UI.hostile : UI.good;
      border = hostile ? UI.hostile : UI.border;
    }
    this.target.set(unit.shipClass.name, tag, tagColor, unit.hp, unit.maxHp, border);
    const best = unit.nature === 'creature' ? WEAPONS.harpoon : WEAPONS.cannon;
    const what = unit.nature === 'creature' ? 'Creature' : 'Ship';
    show(this.target.note, `${what}: ${best.name.toLowerCase()} do full damage`);
    this.fire.setLook({ pressed: ship.attackTarget === unit.id });
    show(this.fireLabel, ship.attackTarget === unit.id ? 'Cease fire  (Esc)' : 'Fire  (Space)');
    tint(this.fireLabel, ship.attackTarget === unit.id ? UI.darkText : UI.text);
  }
}
