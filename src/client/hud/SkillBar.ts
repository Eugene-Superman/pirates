import { Container, Graphics, type Text } from 'pixi.js';
import {
  AMMO,
  AMMO_IDS,
  OFF_TARGET_SHARE,
  REPAIR_RATE,
  REPAIR_TICK,
  WEAPONS,
  WEAPON_IDS,
  findUnit,
  type AmmoId,
  type GameState,
  type HoldReason,
  type Ship,
  type WeaponId,
} from '../../game';
import { AMMO_LABELS, Tile, UI, drawAnchor, drawBall, drawHarpoon, drawWrench, show, text, tint } from './ui';

const SKILL = 56; // pixels: a skill's square
const CHIP = { width: 52, height: 32 };
const HEADER = { width: 112, height: 20 };
const GROUP_GAP = 14;
const PAD = 8; // inside the bar
const BOTTOM = 14; // pixels between the bar and the screen's bottom
const STATUS_GAP = 6; // between the status line and the bar
const NATURE_NAMES = { creature: 'creatures', object: 'ships and objects' } as const;

export interface SkillBarActions {
  repair: () => void;
  setWeapon: (weapon: WeaponId) => void;
  loadAmmo: (ammo: AmmoId) => void;
  toggleLoadout: () => void;
}

/** What the player is told when the ship holds fire, and what to do about it */
const HOLD_MESSAGES: Readonly<Record<HoldReason, (ship: Ship) => string>> = {
  noGuns: (ship) => `No ${WEAPONS[ship.weapon].name.toLowerCase()} fitted: fit some in the loadout (L)`,
  noAmmo: (ship) => `Out of ${AMMO[ship.loaded[ship.weapon]].name}: pick other ammo below, or add some in the loadout`,
  sight: () => 'Target hidden in the fog: sail closer',
  range: (ship) =>
    `Target beyond your ${WEAPONS[ship.weapon].name.toLowerCase()}' reach (${ship.range()}): sail closer`,
};

/** A weapon's part of the bar: a header to pick the weapon (lit when picked), and a chip per ammo in the hold */
interface Group {
  readonly weapon: WeaponId;
  readonly container: Container;
  readonly header: Tile;
  readonly headerText: Text;
  readonly reload: Graphics;
  readonly chips: Map<AmmoId, { tile: Tile; label: Text; count: Text }>;
  /** The ammo the chips were made for, to rebuild them only when it changes */
  shown: string;
}

/**
 * The bar at the bottom of the screen: the repair skill (R), then each weapon with the ammo in the hold (the loaded
 * one lit; a click loads another, a click on the weapon's name picks it), then the loadout (L). Over it, a line about
 * what is going on: why the ship holds fire, that its weapon is the wrong one for the target, the repair
 */
export class SkillBar {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly status = text('', 14, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } });
  private readonly repair: Tile;
  private readonly repairIcon = new Graphics();
  private readonly repairArc = new Graphics();
  private readonly repairCount = text('', 22, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } });
  private readonly loadout: Tile;
  private readonly groups: Group[];
  private readonly actions: SkillBarActions;
  private width = 0;

  constructor(actions: SkillBarActions) {
    this.actions = actions;
    this.status.anchor.set(0.5, 1);
    this.repair = new Tile(SKILL, SKILL, actions.repair, 8);
    drawWrench(this.repairIcon, 30, UI.text);
    this.repairIcon.position.set(SKILL / 2, SKILL / 2 - 2);
    this.repairCount.anchor.set(0.5);
    this.repairCount.position.set(SKILL / 2, SKILL / 2);
    this.repair.content.addChild(this.repairIcon, this.repairArc, this.repairCount, keyLabel('R', SKILL));

    this.loadout = new Tile(SKILL, SKILL, actions.toggleLoadout, 8);
    const anchor = new Graphics();
    drawAnchor(anchor, 30, UI.text);
    anchor.position.set(SKILL / 2, SKILL / 2);
    this.loadout.content.addChild(anchor, keyLabel('L', SKILL));

    this.groups = WEAPON_IDS.map((weapon) => {
      const container = new Container();
      const header = new Tile(HEADER.width, HEADER.height, () => actions.setWeapon(weapon), 4);
      const headerText = text(WEAPONS[weapon].name, 12, UI.text, { fontWeight: 'bold' });
      headerText.position.set(6, (HEADER.height - headerText.height) / 2 - 1);
      const reload = new Graphics();
      header.content.addChild(headerText, reload);
      container.addChild(header.container);
      return { weapon, container, header, headerText, reload, chips: new Map(), shown: '' };
    });
    this.container.addChild(
      this.background,
      this.status,
      this.repair.container,
      ...this.groups.map((g) => g.container),
      this.loadout.container,
    );
  }

  update(state: GameState, screenWidth: number, screenHeight: number) {
    const { ship } = state;
    let rebuilt = false;
    for (const group of this.groups) rebuilt = this.updateGroup(group, ship) || rebuilt;
    if (rebuilt || this.width === 0) this.layout();
    this.container.position.set(Math.round((screenWidth - this.width) / 2), screenHeight - BOTTOM - SKILL - PAD * 2);
    this.updateRepair(state);
    this.updateStatus(state);
  }

  private updateRepair(state: GameState) {
    const { ship, time } = state;
    const combat = ship.inCombat(time);
    const whole = ship.hp >= ship.maxHp;
    this.repair.setLook({
      pressed: ship.repairing,
      disabled: !ship.repairing && (ship.isSinking || whole || combat),
      border: ship.repairing ? UI.heal : UI.border,
    });
    this.repairIcon.tint = ship.repairing ? UI.darkText : UI.text;
    // In combat: the seconds till a repair can start, over the dimmed icon
    show(this.repairCount, combat && !ship.repairing && !whole ? `${Math.ceil(ship.combatUntil - time)}` : '');
    const arc = this.repairArc.clear();
    if (ship.repairing) {
      const share = Math.min(1, ship.repairClock / REPAIR_TICK);
      arc
        .arc(SKILL / 2, SKILL / 2, SKILL / 2 - 4, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2)
        .stroke({ width: 3, color: 0x0f6b25 });
    }
  }

  private updateStatus(state: GameState) {
    const { ship, time } = state;
    let message = '';
    let color: number = UI.text;
    const target = ship.attackTarget === null ? undefined : findUnit(state, ship.attackTarget);
    if (ship.isSinking) {
      message = 'Your ship went down';
      color = UI.bad;
    } else if (target && ship.holdReason) {
      message = HOLD_MESSAGES[ship.holdReason](ship);
      color = UI.warn;
    } else if (target && WEAPONS[ship.weapon].against !== target.nature) {
      const better = WEAPON_IDS.find((id) => WEAPONS[id].against === target.nature) ?? ship.weapon;
      message = `${WEAPONS[ship.weapon].name} do ${OFF_TARGET_SHARE * 100}% to ${NATURE_NAMES[target.nature]}: ${WEAPONS[better].name.toLowerCase()} do it all`;
      color = UI.dim;
    } else if (ship.repairing) {
      const step = Math.max(1, Math.round(ship.maxHp * REPAIR_RATE * REPAIR_TICK));
      message = `Repairing: +${step} hull every second`;
      color = UI.heal;
    } else if (ship.inCombat(time) && ship.hp < ship.maxHp && ship.attackTarget === null) {
      message = `In combat: you can repair in ${Math.ceil(ship.combatUntil - time)} s, once nobody fires at you`;
      color = UI.warn;
    }
    show(this.status, message);
    tint(this.status, color);
  }

  /** Lights the picked weapon and loaded ammo, counts the ammo, and rebuilds the chips if the ammo in the hold changed */
  private updateGroup(group: Group, ship: Ship) {
    const { weapon } = group;
    const fitted = ship.fittedGuns(weapon);
    const selected = ship.weapon === weapon;
    group.header.setLook({ pressed: selected });
    tint(group.headerText, selected ? UI.darkText : UI.text);
    show(group.headerText, `${WEAPONS[weapon].name} ×${fitted.length}`);
    // How far the soonest gun is reloaded: full and green when one is ready
    const reloads = ship.reloads[weapon];
    const progress = fitted.reduce((best, { gun, slot }) => Math.max(best, 1 - reloads[slot] / gun.reload), 0);
    const strip = HEADER.width - 12;
    group.reload
      .clear()
      .rect(6, HEADER.height - 4, strip, 2)
      .fill({ color: 0x000000, alpha: 0.35 })
      .rect(6, HEADER.height - 4, strip * progress, 2)
      .fill({ color: progress >= 1 ? UI.good : UI.warn });

    const loaded = ship.loaded[weapon];
    const ids = AMMO_IDS[weapon].filter((id) => ship.ammo[id] > 0 || id === loaded);
    const key = ids.join();
    let rebuilt = false;
    if (key !== group.shown) {
      group.shown = key;
      this.buildChips(group, ids);
      rebuilt = true;
    }
    for (const [id, chip] of group.chips) {
      chip.tile.setLook({
        pressed: id === loaded,
        disabled: ship.ammo[id] <= 0,
        border: id === loaded ? UI.active : UI.border,
      });
      show(chip.count, `${ship.ammo[id]}`);
      tint(chip.count, id === loaded ? UI.darkText : UI.text);
      tint(chip.label, id === loaded ? UI.darkText : UI.dim);
    }
    return rebuilt;
  }

  private buildChips(group: Group, ids: readonly AmmoId[]) {
    for (const chip of group.chips.values()) chip.tile.container.destroy({ children: true });
    group.chips.clear();
    ids.forEach((id, i) => {
      const ammo = AMMO[id];
      const tile = new Tile(CHIP.width, CHIP.height, () => this.actions.loadAmmo(id), 5);
      const icon = new Graphics();
      if (ammo.weapon === 'cannon') drawBall(icon, 6, ammo.tier);
      else drawHarpoon(icon, 16, ammo.tier);
      icon.position.set(12, CHIP.height / 2);
      const label = text(AMMO_LABELS[id], 10, UI.dim, { fontWeight: 'bold' });
      label.anchor.set(1, 0);
      label.position.set(CHIP.width - 4, 2);
      const count = text('0', 13, UI.text, { fontWeight: 'bold' });
      count.anchor.set(1, 1);
      count.position.set(CHIP.width - 4, CHIP.height - 1);
      tile.content.addChild(icon, label, count);
      tile.container.position.set(i * (CHIP.width + 4), HEADER.height + 4);
      group.container.addChild(tile.container);
      group.chips.set(id, { tile, label, count });
    });
  }

  /** Lays the bar out from the left: the skill, the weapons' groups, the loadout; its background round them */
  private layout() {
    let x = PAD;
    this.repair.container.position.set(x, PAD);
    x += SKILL + GROUP_GAP;
    for (const group of this.groups) {
      group.container.position.set(x, PAD);
      const chips = group.chips.size * (CHIP.width + 4) - 4;
      x += Math.max(HEADER.width, chips) + GROUP_GAP;
    }
    this.loadout.container.position.set(x, PAD);
    x += SKILL + PAD;
    this.width = x;
    this.background
      .clear()
      .roundRect(0, 0, x, SKILL + PAD * 2, 10)
      .fill({ color: UI.panel, alpha: UI.panelAlpha })
      .stroke({ width: 1, color: UI.border, alpha: 0.35 });
    this.background.eventMode = 'static';
    this.background.removeAllListeners('pointerdown');
    // Clicks between the buttons mustn't steer the ship either
    this.background.on('pointerdown', (e) => e.stopPropagation());
    this.status.position.set(x / 2, -STATUS_GAP);
  }
}

/** The key that works the button too, small in its corner */
function keyLabel(key: string, size: number) {
  const label = text(key, 11, UI.dim, { fontWeight: 'bold' });
  label.anchor.set(1, 1);
  label.position.set(size - 4, size - 2);
  return label;
}
