import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import {
  AMMO,
  AMMO_IDS,
  OFF_TARGET_SHARE,
  PERKS,
  REPAIR_HP_PER_GOLD,
  REPAIR_TICK,
  TALENTS,
  WEAPONS,
  WEAPON_IDS,
  abilityCooldown,
  canPayRepair,
  findUnit,
  reloadShare,
  repairStep,
  type AmmoId,
  type GameState,
  type HoldReason,
  type Ship,
  type WeaponId,
} from '../../game';
import {
  AMMO_LABELS,
  Tile,
  UI,
  drawAnchor,
  drawBall,
  drawBroadside,
  drawHarpoon,
  drawSail,
  drawWrench,
  show,
  text,
  tint,
} from './ui';
import { t } from '../i18n/i18n';

const SKILL = 56; // pixels: a skill's square
const SKILL_GAP = 6; // pixels between the repair and the ability
const CHIP = { width: 52, height: 32 };
const HEADER = { width: 112, height: 20 };
const GROUP_GAP = 14;
const PAD = 8; // inside the bar
const BOTTOM = 14; // pixels between the bar and the screen's bottom
const STATUS_GAP = 6; // between the status line and the bar
const NATURE_NAMES = { creature: 'to creatures', object: 'to ships and objects' } as const;
// The key that picks each weapon (keyboardInput.ts), shown on its header
const WEAPON_KEYS: Readonly<Record<WeaponId, string>> = { cannon: 'Q', harpoon: 'E' };

export interface SkillBarActions {
  repair: () => void;
  /** Uses the ship's ability (its level 5 talent) */
  useAbility: () => void;
  setWeapon: (weapon: WeaponId) => void;
  loadAmmo: (ammo: AmmoId) => void;
  toggleLoadout: () => void;
}

/** What the player is told when the ship holds fire, and what to do about it */
const HOLD_MESSAGES: Readonly<Record<HoldReason, (ship: Ship) => string>> = {
  noGuns: (ship) => t('No {weapon} fitted: fit some in the loadout (L)', weaponNames(ship.weapon)),
  noAmmo: (ship) =>
    t('Out of {ammo}: pick other ammo below, or add some in the loadout', {
      ammo: t(AMMO[ship.loaded[ship.weapon]].name),
    }),
  sight: () => t('Target hidden in the fog: sail closer'),
  range: (ship) =>
    t("Target beyond your {weapon}' reach ({range}): sail closer", {
      ...weaponNames(ship.weapon),
      range: ship.range(),
    }),
};

/** A weapon's name for a sentence: `weapon` lower case, `Weapon` as it starts one */
function weaponNames(weapon: WeaponId) {
  const name = t(WEAPONS[weapon].name);
  return { weapon: name.toLowerCase(), Weapon: name };
}

/** A weapon's part of the bar: a header to pick the weapon (lit when picked), and a chip per ammo in the hold */
interface Group {
  readonly weapon: WeaponId;
  readonly container: Container;
  readonly header: Tile;
  readonly headerText: Text;
  /** The key that picks it */
  readonly keyText: Text;
  readonly reload: Graphics;
  readonly chips: Map<AmmoId, { tile: Tile; label: Text; count: Text }>;
  /** The ammo the chips were made for, to rebuild them only when it changes */
  shown: string;
}

/**
 * The bar at the bottom of the screen: the repair skill (R) and the ship's ability (F, from level 5), then each weapon with the ammo in the hold (the loaded
 * one lit; a click loads another, a click on the weapon's name or its key, Q or E, picks it), then the loadout (L). Over it, a line about
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
  /** The ship's ability: its icon, the seconds till it is ready again, its cooling down as an arc */
  private readonly ability: Tile;
  private readonly abilityIcon = new Graphics();
  private readonly abilityArc = new Graphics();
  private readonly abilityCount = text('', 22, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } });
  private readonly abilityLocked = text(t('Lv {level}', { level: 5 }), 13, UI.dim, { fontWeight: 'bold' });
  /** The ability the icon was drawn for */
  private abilityDrawn: string | null = null;
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

    this.ability = new Tile(SKILL, SKILL, actions.useAbility, 8);
    this.abilityIcon.position.set(SKILL / 2, SKILL / 2 - 2);
    this.abilityCount.anchor.set(0.5);
    this.abilityCount.position.set(SKILL / 2, SKILL / 2);
    this.abilityLocked.anchor.set(0.5);
    this.abilityLocked.position.set(SKILL / 2, SKILL / 2 - 2);
    this.ability.content.addChild(
      this.abilityIcon,
      this.abilityArc,
      this.abilityCount,
      this.abilityLocked,
      keyLabel('F', SKILL),
    );

    this.loadout = new Tile(SKILL, SKILL, actions.toggleLoadout, 8);
    const anchor = new Graphics();
    drawAnchor(anchor, 30, UI.text);
    anchor.position.set(SKILL / 2, SKILL / 2);
    this.loadout.content.addChild(anchor, keyLabel('L', SKILL));

    this.groups = WEAPON_IDS.map((weapon) => {
      const container = new Container();
      const header = new Tile(HEADER.width, HEADER.height, () => actions.setWeapon(weapon), 4);
      const headerText = text(t(WEAPONS[weapon].name), 12, UI.text, { fontWeight: 'bold' });
      headerText.position.set(6, (HEADER.height - headerText.height) / 2 - 1);
      const reload = new Graphics();
      const keyText = text(WEAPON_KEYS[weapon], 11, UI.dim, { fontWeight: 'bold' });
      keyText.anchor.set(1, 0.5);
      keyText.position.set(HEADER.width - 6, HEADER.height / 2 - 1);
      header.content.addChild(headerText, keyText, reload);
      container.addChild(header.container);
      return { weapon, container, header, headerText, keyText, reload, chips: new Map(), shown: '' };
    });
    this.container.addChild(
      this.background,
      this.status,
      this.repair.container,
      this.ability.container,
      ...this.groups.map((g) => g.container),
      this.loadout.container,
    );
  }

  /** Where the bar is on the screen */
  get box() {
    return new Rectangle(this.container.x, this.container.y, this.width, SKILL + PAD * 2);
  }

  update(state: GameState, screenWidth: number, screenHeight: number) {
    const { ship } = state;
    let rebuilt = false;
    for (const group of this.groups) rebuilt = this.updateGroup(group, ship) || rebuilt;
    if (rebuilt || this.width === 0) this.layout();
    this.container.position.set(Math.round((screenWidth - this.width) / 2), screenHeight - BOTTOM - SKILL - PAD * 2);
    this.updateRepair(state);
    this.updateAbility(state);
    this.updateStatus(state);
  }

  /** Its icon, lit while it works (Broadside loaded, Full sail up); dim and counting down while it cools */
  private updateAbility(state: GameState) {
    const { ship, time } = state;
    const { ability } = ship;
    if (ability !== this.abilityDrawn) {
      this.abilityDrawn = ability;
      const icon = this.abilityIcon.clear();
      if (ability === 'broadside') drawBroadside(icon, 32, UI.text);
      else if (ability === 'fullSail') drawSail(icon, 30, UI.text);
      this.abilityLocked.visible = ability === null;
    }
    const working = ship.broadsideArmed || time < ship.fullSailUntil;
    const wait = ship.abilityReadyAt - time;
    this.ability.setLook({
      pressed: working,
      disabled: ability === null || (!working && (wait > 0 || ship.isSinking || ship.docked)),
      border: working ? UI.active : UI.border,
    });
    this.abilityIcon.tint = working ? UI.darkText : UI.text;
    show(this.abilityCount, !working && wait > 0 ? `${Math.ceil(wait)}` : '');
    const arc = this.abilityArc.clear();
    if (ability !== null && !working && wait > 0) {
      const share = 1 - wait / abilityCooldown(ship);
      arc
        .arc(SKILL / 2, SKILL / 2, SKILL / 2 - 4, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2)
        .stroke({ width: 3, color: UI.active, alpha: 0.8 });
    }
  }

  private updateRepair(state: GameState) {
    const { ship, time } = state;
    const combat = ship.inCombat(time);
    const whole = ship.hp >= ship.maxHp;
    this.repair.setLook({
      pressed: ship.repairing,
      disabled: !ship.repairing && (ship.isSinking || whole || combat || !canPayRepair(state, ship)),
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
      message = t('Your ship went down');
      color = UI.bad;
    } else if (target && ship.holdReason) {
      message = HOLD_MESSAGES[ship.holdReason](ship);
      color = UI.warn;
    } else if (target && WEAPONS[ship.weapon].against !== target.nature) {
      const better = WEAPON_IDS.find((id) => WEAPONS[id].against === target.nature) ?? ship.weapon;
      message = t('{Weapon} do {share}% {targets}: {better} do it all', {
        ...weaponNames(ship.weapon),
        share: OFF_TARGET_SHARE * 100,
        targets: t(NATURE_NAMES[target.nature]),
        better: weaponNames(better).weapon,
      });
      color = UI.dim;
    } else if (ship.broadsideArmed) {
      message = t('{talent}: your next volley does ×{n} damage', {
        talent: t(TALENTS.broadside.name),
        n: PERKS.broadside,
      });
      color = UI.active;
    } else if (time < ship.fullSailUntil) {
      message = t('{talent}: {n} s', { talent: t(TALENTS.fullSail.name), n: Math.ceil(ship.fullSailUntil - time) });
      color = UI.active;
    } else if (ship.repairing) {
      message = t('Repairing: +{hp} hull every second, 1 gold for every {per}', {
        hp: repairStep(ship),
        per: REPAIR_HP_PER_GOLD,
      });
      color = UI.heal;
    } else if (ship.inCombat(time) && ship.hp < ship.maxHp && ship.attackTarget === null) {
      message = t('In combat: you can repair in {n} s, once nobody fires at you', {
        n: Math.ceil(ship.combatUntil - time),
      });
      color = UI.warn;
    } else if (ship.hp < ship.maxHp && !ship.docked && !canPayRepair(state, ship)) {
      message = t('No gold to pay the crew for repairs: 1 gold for every {per} hull', { per: REPAIR_HP_PER_GOLD });
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
    tint(group.keyText, selected ? UI.darkText : UI.dim);
    show(group.headerText, `${t(WEAPONS[weapon].name)} ×${fitted.length}`);
    // How far the soonest gun is reloaded: full and green when one is ready
    const reloads = ship.reloads[weapon];
    const share = reloadShare(ship, weapon);
    const progress = fitted.reduce(
      (best, { gun, slot }) => Math.max(best, 1 - reloads[slot] / (gun.reload * share)),
      0,
    );
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
      const label = text(t(AMMO_LABELS[id]), 10, UI.dim, { fontWeight: 'bold' });
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
    x += SKILL + SKILL_GAP;
    this.ability.container.position.set(x, PAD);
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
