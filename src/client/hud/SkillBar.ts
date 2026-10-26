import { Assets, Container, Graphics, Rectangle, Sprite, type Text, type Texture } from 'pixi.js';
import {
  AMMO,
  MILESTONES,
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
  UI,
  compact,
  drawBall,
  drawBroadside,
  drawHarpoon,
  drawSail,
  drawWrench,
  playTap,
  show,
  text,
  tierColor,
  tint,
  whole,
} from './ui';
import { THEME, glowFill } from './theme';
import { AMMO_ICONS, SKILL_ICONS, type SkillIconId } from './iconAtlas';
import { Tooltip, type TooltipText } from './Tooltip';
import { t } from '../i18n/i18n';

// Made by blender-assets/hud/build_skill_bar.py, which prints the figures in FRAME
const FRAME_URL = `${import.meta.env.BASE_URL}sprites/hud/skill_bar.webp`;
/** A well's box in the frame's picture: its left, top, width and height, in the picture's pixels */
type Box = readonly [number, number, number, number];
/**
 * The frame's picture, in its own pixels: its size, and its dark wells, where the buttons go: the ten quick slots on
 * top, left to right (their keys, 1…0, painted over their tops); the skills' four squares, row by row; the weapons'
 * plates, left to right; and the places for their ammo hanging under the plates, the first plate's two, then the
 * second's
 */
const FRAME = {
  width: 851,
  height: 225,
  quick: [
    [34.4, 22.4, 63.6, 59.2],
    [114.4, 22.4, 63.6, 59.2],
    [194.4, 22.4, 63.6, 59.2],
    [274.0, 22.4, 63.2, 59.2],
    [353.6, 22.0, 63.2, 59.6],
    [432.8, 22.0, 63.6, 59.6],
    [512.8, 22.4, 63.6, 59.2],
    [592.8, 22.4, 63.2, 59.2],
    [672.4, 22.4, 64.0, 59.2],
    [752.4, 22.4, 63.2, 59.2],
  ],
  skills: [
    [78.8, 102.8, 48.8, 44.4],
    [141.6, 102.4, 48.8, 44.8],
    [78.8, 160.4, 48.8, 45.2],
    [141.6, 160.4, 48.8, 45.2],
  ],
  plates: [
    [226.8, 108.4, 263.6, 42.4],
    [520.0, 108.4, 254.0, 42.0],
  ],
  ammo: [
    [294.4, 157.2, 52.8, 50.4],
    [362.8, 157.6, 52.4, 50.0],
    [586.8, 157.2, 52.8, 50.4],
    [655.2, 157.2, 52.4, 50.4],
  ],
} as const;
const BAR_WIDTH = 454; // pixels on the screen
const SCALE = BAR_WIDTH / FRAME.width;
const BAR_HEIGHT = Math.round(FRAME.height * SCALE);
const BOTTOM = 6; // pixels between the bar and the screen's bottom
const STATUS_GAP = 2; // pixels between the status line and the bar
const STATUS_HEIGHT = 20; // pixels: the status line's
const COLORS = {
  lit: 0xf3d58a, // the rim and glow of a well whose skill is at work, whose weapon is picked or ammo loaded
  drop: 0xffd447, // a place that takes the ammo dragged out of the loadout
  hover: 0xffffff,
  sweep: 0x000000, // the shade over a skill cooling down
  well: 0x0a2232, // a well, until the frame's picture has loaded
  rim: 0x1b1b1b, // the dark edge round the letters
} as const;
const SWEEP_ALPHA = 0.55;
const DISABLED_ALPHA = 0.45; // a dimmed well's content
const SKILL_ICON = 16; // pixels: a skill's drawn icon, until its picture has loaded or for one not painted yet
const AMMO_ICON = 20; // pixels: an ammo's painted picture
const RELOAD = { inset: 6, height: 2, bottom: 4 } as const; // pixels: the strip along the bottom of a weapon's plate
// Pixels: the letters' sizes: a weapon's name and key on its plate, a skill's countdown, a key in a well's corner, an
// ammo's count, the plus in an empty place
const FONT = { name: 11, plateKey: 9, countdown: 13, key: 8, count: 9, plus: 14 } as const;
// The keys that load the picked weapon's two kinds of ammo at hand (keyboardInput.ts), in their places' corners
const AMMO_KEYS = ['Z', 'X'] as const;
// The key that picks each weapon (keyboardInput.ts), shown on its plate
const WEAPON_KEYS: Readonly<Record<WeaponId, string>> = { cannon: 'Q', harpoon: 'E' };
const NATURE_NAMES = { creature: 'to creatures', object: 'to ships and objects' } as const;
// The level the ability's talents open at: the first milestone
const ABILITY_LEVEL = MILESTONES[0];

/** A box of the frame's picture on the screen, in whole pixels from the bar's top left corner */
function onScreen(box: Box) {
  const x = Math.round(box[0] * SCALE);
  const y = Math.round(box[1] * SCALE);
  return { x, y, width: Math.round((box[0] + box[2]) * SCALE) - x, height: Math.round((box[1] + box[3]) * SCALE) - y };
}

/** Letters over a well's dark blue, edged so they read over a picture too */
function label(value: string, size: number, color: number) {
  return text(value, size, color, { fontWeight: 'bold', stroke: { color: COLORS.rim, width: size < 12 ? 2 : 3 } });
}

export interface SkillBarActions {
  repair: () => void;
  /** Uses the ship's ability (its level 5 talent) */
  useAbility: () => void;
  setWeapon: (weapon: WeaponId) => void;
  loadAmmo: (ammo: AmmoId) => void;
  /** Opens the loadout, where the ammo at hand is picked (a click on an empty place); open, it stays open */
  openLoadout: () => void;
}

/**
 * How a well looks: lit (its skill at work, its weapon picked, its ammo loaded) in a colour; dimmed (it can't be used
 * now); or locked (a skill not open yet: as it is, but it takes no clicks)
 */
interface WellLook {
  readonly lit?: boolean;
  readonly color?: number;
  readonly disabled?: boolean;
  readonly locked?: boolean;
}

/** What the tooltip over a well says, as the game is now; null for nothing */
type Hint = (state: GameState) => TooltipText | null;

/**
 * A button in one of the frame's painted wells: the well is its face, so it adds only what changes, a light under the
 * pointer, and when lit a glow under whatever the owner puts in `content` and a rim over it (a skill's picture would
 * hide the glow). Clicks never reach the stage, which would steer the ship
 */
class Well {
  readonly container = new Container();
  readonly content = new Container();
  readonly width: number;
  readonly height: number;
  /** What the tooltip says while the pointer is over it */
  readonly hint: Hint;
  private readonly glow = new Graphics();
  private readonly over = new Graphics();
  private hovered = false;
  private look: WellLook = {};
  /** As last painted, to repaint only on change */
  private painted = '';

  constructor(box: Box, onTap: (() => void) | null, hint: Hint) {
    const { x, y, width, height } = onScreen(box);
    this.width = width;
    this.height = height;
    this.hint = hint;
    this.container.position.set(x, y);
    this.container.addChild(this.glow, this.content, this.over);
    this.container.eventMode = 'static';
    this.container.hitArea = new Rectangle(0, 0, width, height);
    this.container.on('pointerdown', (e) => e.stopPropagation());
    this.container.on('pointertap', () => {
      if (!onTap || this.look.disabled || this.look.locked) return;
      playTap();
      onTap();
    });
    this.container.on('pointerover', () => {
      this.hovered = true;
      this.paint();
    });
    this.container.on('pointerout', () => {
      this.hovered = false;
      this.paint();
    });
    // Nothing to do on a click: a skill to come
    if (!onTap) this.look = { locked: true };
    this.paint();
  }

  /** Whether the pointer is over it */
  get isHovered() {
    return this.hovered;
  }

  setLook(look: WellLook) {
    this.look = look;
    this.paint();
  }

  /** Whether a point on the screen is in the well: its content may not fill it */
  contains(x: number, y: number) {
    const local = this.container.toLocal({ x, y });
    return local.x >= 0 && local.y >= 0 && local.x < this.width && local.y < this.height;
  }

  private paint() {
    const { lit = false, color = COLORS.lit, disabled = false, locked = false } = this.look;
    const hovered = this.hovered && !disabled && !locked;
    const key = `${lit}${color}${disabled}${locked}${hovered}`;
    if (key === this.painted) return;
    this.painted = key;
    const { width, height } = this;
    this.glow.clear();
    const over = this.over.clear();
    if (lit) {
      this.glow.rect(0, 0, width, height).fill(glowFill(color));
      over
        .rect(1, 1, width - 2, height - 2)
        .stroke({ width: 2, color, alpha: 0.95 })
        .rect(-1, -1, width + 2, height + 2)
        .stroke({ width: 2, color, alpha: 0.35 });
    }
    if (hovered) {
      over
        .rect(0, 0, width, height)
        .fill({ color: COLORS.hover, alpha: 0.08 })
        .rect(0.5, 0.5, width - 1, height - 1)
        .stroke({ width: 1, color: COLORS.hover, alpha: 0.35 });
    }
    this.container.cursor = locked ? 'default' : 'pointer';
    this.content.alpha = disabled ? DISABLED_ALPHA : 1;
  }
}

/** A skill's well with its face: its painted picture, or a drawn icon until the pictures have loaded */
interface SkillWell {
  readonly well: Well;
  readonly picture: Sprite;
  readonly drawn: Graphics;
}

/** Draws a skill's icon round (0, 0), `size` pixels, in `color` (ui.ts's drawWrench, drawSail, drawBroadside) */
type DrawIcon = (g: Graphics, size: number, color: number) => void;

/** One of a weapon's two places for ammo, in a well under its plate */
interface AmmoPlace {
  readonly well: Well;
  /** The ammo in it, as last shown: a click loads it, or opens the loadout when there is none */
  ammo: AmmoId | null;
  /** The key that loads it */
  readonly letter: string;
  readonly key: Text;
  /** Its count, while there is an ammo in it */
  count: Text | null;
}

/** What the player is told when the ship holds fire, and what to do about it */
const HOLD_MESSAGES: Readonly<Record<HoldReason, (ship: Ship) => string>> = {
  noGuns: (ship) => t('No {weapon} fitted: fit some in the loadout (L)', weaponNames(ship.weapon)),
  notAtHand: (ship) =>
    t('No ammo at hand for your {weapon}: put some on the bar in the loadout (L)', weaponNames(ship.weapon)),
  noAmmo: (ship) =>
    t('Out of {ammo}: load the other ammo below (Z, X), or put another at hand in the loadout (L)', {
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

/** A weapon's part of the bar: its plate, which picks it (lit when picked), and its two kinds of ammo at hand below */
interface Group {
  readonly weapon: WeaponId;
  readonly plate: Well;
  readonly name: Text;
  readonly reload: Graphics;
  readonly places: readonly AmmoPlace[];
  /** The ammo the places were filled for, to fill them again only when it changes */
  shown: string;
}

/**
 * The bar at the bottom of the screen, in a painted frame of wood and brass (`FRAME`). On top, ten quick slots, keys
 * 1…0, waiting for what the hold will carry to use at sea. Under them on the left, the skills, painted: the repair (R)
 * and the ship's ability (F; a lock until its talent is picked at level 5), and two locks on skills to come; on the
 * right, each weapon's plate (a click on it, or its key, Q or E, picks it) with its two kinds of ammo at hand under it
 * (Ship.ammoBar, put there in the loadout: their counts, the loaded one lit, a click or Z or X loads the other; an
 * empty place, as one whose ammo has run out is, shows a plus that opens the loadout). Ammo dragged out of the loadout
 * drops on its places (`ammoPlaceAt`). The
 * pointer over a skill or an ammo shows all about it in a tooltip. Over the bar, a line about what is going on: why the
 * ship holds fire, that its weapon is the wrong one for the target, the repair. Until the frame's picture has loaded,
 * its wells are drawn plain
 */
export class SkillBar {
  /** Pixels at the bottom of the screen the bar and its line take: what a window over it leaves clear (the loadout) */
  static readonly ROOM = BOTTOM + BAR_HEIGHT + STATUS_GAP + STATUS_HEIGHT;
  readonly container = new Container();
  private readonly status = text('', 14, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } });
  private readonly tooltip = new Tooltip();
  private readonly repair: SkillWell;
  private readonly repairArc = new Graphics();
  private readonly repairCount = label('', FONT.countdown, THEME.text);
  /** The ship's ability: its picture, the seconds till it is ready again, its cooling down as a shade going round */
  private readonly ability: SkillWell;
  private readonly abilitySweep = new Graphics();
  private readonly abilityCount = label('', FONT.countdown, THEME.text);
  /** The wells of the skills to come, locked */
  private readonly toCome: readonly SkillWell[];
  /** The ability the skills' faces were laid for, '' to lay them again (the pictures have loaded) */
  private facesFor = '';
  private readonly groups: Group[];
  private readonly actions: SkillBarActions;
  /** The weapon whose ammo is being dragged out of the loadout: its places are lit to take it */
  private dropFor: WeaponId | null = null;

  constructor(actions: SkillBarActions) {
    this.actions = actions;
    this.status.anchor.set(0.5, 1);
    this.status.position.set(BAR_WIDTH / 2, -STATUS_GAP);

    this.repair = skillWell(FRAME.skills[0], actions.repair, repairHint);
    this.ability = skillWell(FRAME.skills[1], actions.useAbility, abilityHint);
    this.toCome = [FRAME.skills[2], FRAME.skills[3]].map((box) => skillWell(box, null, lockedHint));
    this.repair.well.content.addChild(this.repairArc, this.repairCount, keyLabel('R', this.repair.well));
    this.ability.well.content.addChild(this.abilitySweep, this.abilityCount, keyLabel('F', this.ability.well));
    for (const [{ well }, count] of [
      [this.repair, this.repairCount],
      [this.ability, this.abilityCount],
    ] as const) {
      count.anchor.set(0.5);
      count.position.set(well.width / 2, well.height / 2);
    }
    SKILL_ICONS.load(() => (this.facesFor = ''));

    this.groups = WEAPON_IDS.map((weapon, w) => this.group(weapon, w));
    // The painted icons, as the arsenal's: the places are filled again with them once they are there
    AMMO_ICONS.load(() => {
      for (const group of this.groups) group.shown = '';
    });

    const plain = this.plainFrame();
    const frame = new Sprite();
    frame.visible = false;
    Assets.load<Texture>({ src: FRAME_URL, data: { autoGenerateMipmaps: true } })
      .then((texture) => {
        frame.texture = texture;
        frame.setSize(BAR_WIDTH, BAR_HEIGHT);
        frame.visible = true;
        plain.visible = false;
      })
      .catch((error) => console.warn("The skill bar's frame failed to load", error));
    // Clicks between the buttons mustn't steer the ship either
    this.container.eventMode = 'static';
    this.container.hitArea = new Rectangle(0, 0, BAR_WIDTH, BAR_HEIGHT);
    this.container.on('pointerdown', (e) => e.stopPropagation());
    this.container.addChild(
      plain,
      frame,
      this.status,
      ...this.wells().map((well) => well.container),
      this.tooltip.container,
    );
  }

  /** Where the bar is on the screen */
  get box() {
    return new Rectangle(this.container.x, this.container.y, BAR_WIDTH, BAR_HEIGHT);
  }

  /** The place for ammo under a point on the screen, if there is one there: for ammo dragged out of the loadout */
  ammoPlaceAt(x: number, y: number): { readonly weapon: WeaponId; readonly index: number } | null {
    for (const group of this.groups) {
      const index = group.places.findIndex(({ well }) => well.contains(x, y));
      if (index >= 0) return { weapon: group.weapon, index };
    }
    return null;
  }

  /** Lights the places that take a weapon's ammo while it is dragged out of the loadout; null when the drag ends */
  showDrop(weapon: WeaponId | null) {
    this.dropFor = weapon;
  }

  update(state: GameState, screenWidth: number, screenHeight: number) {
    this.container.position.set(Math.round((screenWidth - BAR_WIDTH) / 2), screenHeight - BOTTOM - BAR_HEIGHT);
    for (const group of this.groups) this.updateGroup(group, state.ship);
    this.updateFaces(state.ship);
    this.updateRepair(state);
    this.updateAbility(state);
    this.updateStatus(state);
    // Not while ammo is dragged out of the loadout: the places lit say where it goes
    const hovered = this.dropFor === null ? this.wells().find((well) => well.isHovered) : undefined;
    if (hovered) this.tooltip.point(hovered.hint(state), hovered.container.x + hovered.width / 2, hovered.container.y);
    else this.tooltip.point(null, 0, 0);
  }

  /** Every well with a button in it */
  private wells() {
    return [
      ...[this.repair, this.ability, ...this.toCome].map((skill) => skill.well),
      ...this.groups.flatMap((g) => [g.plate, ...g.places.map((p) => p.well)]),
    ];
  }

  /** A weapon's plate with its name, key and reload, and its two places for ammo under it (`w`: its order) */
  private group(weapon: WeaponId, w: number): Group {
    const plate = new Well(
      FRAME.plates[w],
      () => this.actions.setWeapon(weapon),
      () => null,
    );
    const name = label('', FONT.name, THEME.text);
    name.anchor.set(0, 0.5);
    name.position.set(RELOAD.inset + 2, (plate.height - RELOAD.bottom) / 2);
    const key = label(WEAPON_KEYS[weapon], FONT.plateKey, THEME.dim);
    key.anchor.set(1, 0.5);
    key.position.set(plate.width - RELOAD.inset - 2, (plate.height - RELOAD.bottom) / 2);
    const reload = new Graphics();
    plate.content.addChild(name, key, reload);
    const places = AMMO_KEYS.map((letter, i): AmmoPlace => {
      const place: AmmoPlace = {
        well: new Well(
          FRAME.ammo[w * AMMO_KEYS.length + i],
          () => (place.ammo ? this.actions.loadAmmo(place.ammo) : this.actions.openLoadout()),
          (state) => ammoHint(state.ship, place),
        ),
        ammo: null,
        letter,
        key: label(letter, FONT.key, THEME.dim),
        count: null,
      };
      place.key.position.set(2, 0);
      return place;
    });
    return { weapon, plate, name, reload, places, shown: '' };
  }

  /** The skills' faces: the repair's, the ability's (painted, drawn or a lock) and the locks on the skills to come */
  private updateFaces(ship: Ship) {
    const { ability } = ship;
    const key = `${ability}`;
    if (key === this.facesFor) return;
    this.facesFor = key;
    setFace(this.repair, 'repair', drawWrench);
    if (ability === 'fullSail') setFace(this.ability, 'fullSail', drawSail);
    else if (ability === 'broadside') setFace(this.ability, null, drawBroadside);
    else setFace(this.ability, 'locked', null);
    for (const skill of this.toCome) setFace(skill, 'locked', null);
  }

  /**
   * Lit while it works (Broadside loaded, Full sail up); dim, shaded and counting down while it cools; locked till its
   * talent is picked
   */
  private updateAbility(state: GameState) {
    const { ship, time } = state;
    const { ability } = ship;
    const working = ship.broadsideArmed || time < ship.fullSailUntil;
    const wait = ship.abilityReadyAt - time;
    const cooling = ability !== null && !working && wait > 0;
    this.ability.well.setLook({
      lit: working,
      locked: ability === null,
      disabled: ability !== null && !working && (wait > 0 || ship.isSinking || ship.docked),
    });
    show(this.abilityCount, cooling ? `${Math.ceil(wait)}` : '');
    const sweep = this.abilitySweep.clear();
    const { width, height } = this.ability.well;
    if (cooling) drawSweep(sweep, width, height, wait / abilityCooldown(ship));
  }

  private updateRepair(state: GameState) {
    const { ship, time } = state;
    const combat = ship.inCombat(time);
    const mended = ship.hp >= ship.maxHp;
    this.repair.well.setLook({
      lit: ship.repairing,
      color: UI.heal,
      disabled: !ship.repairing && (ship.isSinking || mended || combat || !canPayRepair(state, ship)),
    });
    // In combat: the seconds till a repair can start, over the dimmed icon
    show(this.repairCount, combat && !ship.repairing && !mended ? `${Math.ceil(ship.combatUntil - time)}` : '');
    const arc = this.repairArc.clear();
    if (ship.repairing) {
      const { width, height } = this.repair.well;
      const share = Math.min(1, ship.repairClock / REPAIR_TICK);
      arc
        .arc(width / 2, height / 2, Math.min(width, height) / 2 - 2, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2)
        .stroke({ width: 2, color: UI.heal, alpha: 0.9 });
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

  /** Lights the picked weapon and loaded ammo, counts the ammo, and fills the places again if their ammo changed */
  private updateGroup(group: Group, ship: Ship) {
    const { weapon, plate } = group;
    const fitted = ship.fittedGuns(weapon);
    const selected = ship.weapon === weapon;
    plate.setLook({ lit: selected });
    tint(group.name, selected ? THEME.text : THEME.dim);
    show(group.name, `${t(WEAPONS[weapon].name)} ×${fitted.length}`);
    // How far the soonest gun is reloaded: full and green when one is ready
    const reloads = ship.reloads[weapon];
    const share = reloadShare(ship, weapon);
    const progress = fitted.reduce(
      (best, { gun, slot }) => Math.max(best, 1 - reloads[slot] / (gun.reload * share)),
      0,
    );
    const strip = plate.width - RELOAD.inset * 2;
    const y = plate.height - RELOAD.bottom;
    group.reload
      .clear()
      .rect(RELOAD.inset, y, strip, RELOAD.height)
      .fill({ color: 0x000000, alpha: 0.45 })
      .rect(RELOAD.inset, y, strip * progress, RELOAD.height)
      .fill({ color: progress >= 1 ? UI.good : UI.warn });

    const loaded = ship.loaded[weapon];
    const bar = ship.ammoBar[weapon];
    const key = bar.join();
    if (key !== group.shown) {
      group.shown = key;
      group.places.forEach((place, i) => fillPlace(place, bar[i]));
    }
    const dropping = this.dropFor === weapon;
    for (const place of group.places) {
      const id = place.ammo;
      const on = id !== null && id === loaded;
      place.well.setLook({ lit: on || dropping, color: dropping ? COLORS.drop : COLORS.lit });
      if (place.count && id) show(place.count, compact(ship.ammo[id]));
      tint(place.key, on ? THEME.text : THEME.dim);
    }
  }

  /** The bar's wells drawn plain on a dark panel, until the frame's picture has loaded */
  private plainFrame() {
    const g = new Graphics().roundRect(0, 0, BAR_WIDTH, BAR_HEIGHT, 10).fill({ color: UI.panel, alpha: UI.panelAlpha });
    for (const box of [...FRAME.quick, ...FRAME.skills, ...FRAME.plates, ...FRAME.ammo]) {
      const { x, y, width, height } = onScreen(box);
      g.rect(x, y, width, height).fill({ color: COLORS.well }).stroke({ width: 1, color: THEME.brass, alpha: 0.6 });
    }
    return g;
  }
}

/** A skill's well, its face empty until `setFace` */
function skillWell(box: Box, onTap: (() => void) | null, hint: Hint): SkillWell {
  const well = new Well(box, onTap, hint);
  const picture = new Sprite();
  const drawn = new Graphics();
  drawn.position.set(well.width / 2, well.height / 2);
  well.content.addChild(picture, drawn);
  return { well, picture, drawn };
}

/**
 * A skill's face: its painted picture (`icon`) stretched over the well, or until the pictures have loaded (or for a
 * skill not painted yet, no `icon`) its icon drawn by `draw`; nothing for a lock that hasn't loaded
 */
function setFace(skill: SkillWell, icon: SkillIconId | null, draw: DrawIcon | null) {
  const { well, picture, drawn } = skill;
  const texture = icon ? SKILL_ICONS.get(icon) : null;
  picture.visible = texture !== null;
  if (texture) {
    picture.texture = texture;
    picture.setSize(well.width, well.height);
  }
  drawn.clear();
  if (!texture && draw) draw(drawn, SKILL_ICON, THEME.text);
}

/** The key that works the button too, small in its bottom right corner */
function keyLabel(key: string, well: Well) {
  const letter = label(key, FONT.key, THEME.dim);
  letter.anchor.set(1, 1);
  letter.position.set(well.width - 2, well.height);
  return letter;
}

/**
 * A shade over a `width` × `height` well for what is left of a wait (`left`, 1 at its start): what has passed shows
 * clear, from the top round clockwise, as a clock's hand sweeps
 */
function drawSweep(g: Graphics, width: number, height: number, left: number) {
  const cx = width / 2;
  const cy = height / 2;
  const start = -Math.PI / 2 + (1 - left) * Math.PI * 2;
  // Where a ray from the middle at `start` leaves the box
  const dx = Math.cos(start);
  const dy = Math.sin(start);
  const reach = Math.min(cx / Math.max(Math.abs(dx), 1e-6), cy / Math.max(Math.abs(dy), 1e-6));
  const points = [cx, cy, cx + dx * reach, cy + dy * reach];
  // The corners still to come clockwise, then back at the top's middle
  const corner = Math.atan2(cy, cx);
  for (const [angle, x, y] of [
    [-corner, width, 0],
    [corner, width, height],
    [Math.PI - corner, 0, height],
    [Math.PI + corner, 0, 0],
  ] as const) {
    if (angle > start) points.push(x, y);
  }
  points.push(cx, 0);
  g.poly(points).fill({ color: COLORS.sweep, alpha: SWEEP_ALPHA });
}

/** The repair's tooltip: what it mends and for how much */
function repairHint({ ship }: GameState): TooltipText {
  return {
    title: t('Repair your hull at sea (R)'),
    lines: [
      t('+{hp} hull every second out of combat, 1 gold for every {per}', {
        hp: repairStep(ship),
        per: REPAIR_HP_PER_GOLD,
      }),
    ],
  };
}

/** The ability's tooltip: its talent and what it does, or how it opens */
function abilityHint({ ship }: GameState): TooltipText {
  const { ability } = ship;
  if (ability === null) {
    return {
      title: t('Ability (F)'),
      color: THEME.dim,
      lines: [
        t('Opens with a signature talent at level {level}: pick it in the talents (K)', { level: ABILITY_LEVEL }),
      ],
    };
  }
  return { title: t(TALENTS[ability].name), lines: [t(TALENTS[ability].text)] };
}

/** A skill to come's tooltip */
function lockedHint(): TooltipText {
  return { title: t('Locked'), color: THEME.dim, lines: [t('A skill still to come')] };
}

/**
 * An ammo place's tooltip: the ammo's name in its tier's colour, what it is, what it adds, how many are aboard (every
 * one, not 1.2K), and how to load it
 */
function ammoHint(ship: Ship, place: AmmoPlace): TooltipText {
  const id = place.ammo;
  if (!id)
    return { title: t('No ammo at hand'), color: THEME.dim, lines: [t('Click to put some here in the loadout (L)')] };
  const { name, tier, weapon, bonus } = AMMO[id];
  const loaded = ship.loaded[weapon] === id;
  const n = whole(ship.ammo[id]);
  return {
    title: t(name),
    color: tierColor(tier),
    lines: [
      t(weapon === 'cannon' ? 'Tier {tier} cannon ammo' : 'Tier {tier} harpoon ammo', { tier }),
      t('+{n} to every hit', { n: bonus }),
      loaded ? t('{n} aboard · loaded', { n }) : t('{n} aboard', { n }),
      ...(loaded ? [] : [t('Click or {key}: load it', { key: place.letter })]),
    ],
  };
}

/**
 * A place's content for an ammo (`id`): its painted picture and its count (set each frame, in K and M from a
 * thousand); or a plus where there is none. Its key stays
 */
function fillPlace(place: AmmoPlace, id: AmmoId | null) {
  const { well, key } = place;
  for (const child of well.content.removeChildren()) if (child !== key) child.destroy({ children: true });
  place.ammo = id;
  place.count = null;
  if (!id) {
    const plus = label('+', FONT.plus, THEME.dim);
    plus.anchor.set(0.5);
    plus.position.set(well.width / 2, well.height / 2);
    well.content.addChild(plus, key);
    return;
  }
  const count = label('', FONT.count, THEME.text);
  count.anchor.set(1, 1);
  count.position.set(well.width - 2, well.height);
  well.content.addChild(ammoIcon(id, well), count, key);
  place.count = count;
}

/**
 * An ammo's painted picture (the arsenal's) in the middle of its well, or until the icons have loaded a drawn ball or
 * harpoon in its tier
 */
function ammoIcon(id: AmmoId, well: Well) {
  const texture = AMMO_ICONS.get(id);
  if (texture) {
    const picture = new Sprite({ texture, anchor: 0.5 });
    picture.width = picture.height = AMMO_ICON;
    picture.position.set(well.width / 2, well.height / 2);
    return picture;
  }
  const { weapon, tier } = AMMO[id];
  const drawn = new Graphics();
  if (weapon === 'cannon') drawBall(drawn, 5, tier);
  else drawHarpoon(drawn, 13, tier);
  drawn.position.set(well.width / 2, well.height / 2);
  return drawn;
}
