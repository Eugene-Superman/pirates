import { Assets, Container, Graphics, Rectangle, Sprite, type Point, type Text, type Texture } from 'pixi.js';
import {
  ABILITY_LEVELS,
  AMMO,
  OFF_TARGET_SHARE,
  PERKS,
  REPAIR_HP_PER_GOLD,
  REPAIR_TICK,
  SIGNATURES,
  WEAPONS,
  WEAPON_IDS,
  abilityCooldown,
  abilityTarget,
  canPayRepair,
  findUnit,
  reloadShare,
  repairStep,
  talentOf,
  type AmmoId,
  type GameState,
  type HoldReason,
  type ItemId,
  type Player,
  type Ship,
  type SignatureId,
  type WeaponId,
} from '../../game';
import {
  UI,
  compact,
  drawBall,
  drawBroadside,
  drawHarpoon,
  drawSail,
  drawStar,
  drawWrench,
  playTap,
  show,
  text,
  tierColor,
  tint,
  whole,
  type ScreenEdges,
} from './ui';
import { THEME, glowFill } from './theme';
import { AMMO_ICONS, ITEM_ICONS, SKILL_ICONS, type SkillIconId } from './iconAtlas';
import { QUICK_KEYS, itemColor, itemHint } from './itemLook';
import type { GuideTarget } from './StoryGuide';
import { Tooltip, type TooltipText } from './Tooltip';
import { t } from '../i18n/i18n';

// Made by blender-assets/hud/build_skill_bar.py, which prints the figures in FRAME: the frame, and each weapon painted
// on it as it looks picked, glowing
const FRAME_URL = `${import.meta.env.BASE_URL}sprites/hud/skill_bar.webp`;
const litUrl = (weapon: WeaponId) => `${import.meta.env.BASE_URL}sprites/hud/skill_bar_${weapon}.webp`;
/** A well's box in the frame's picture: its left, top, width and height, in the picture's pixels */
type Box = readonly [number, number, number, number];
/**
 * The frame's picture, in its own pixels: its size, and its dark wells, where the buttons go: the ten quick slots on
 * top, left to right (their keys, 1…0, painted over their tops); the skills' four squares, row by row; each weapon
 * painted with its key, left to right (the weapon itself, its glow left out) and its lit picture, laid over it while it
 * is picked; and the places for their ammo under them, the first weapon's two, then the second's
 */
const FRAME = {
  width: 864,
  height: 268,
  quick: [
    [45.6, 69.2, 60.4, 60.4],
    [121.6, 69.2, 62.0, 60.4],
    [199.2, 69.2, 63.6, 60.4],
    [279.6, 69.2, 62.8, 60.0],
    [358.8, 69.2, 63.6, 60.4],
    [439.6, 69.2, 63.2, 60.4],
    [519.2, 69.2, 64.4, 60.4],
    [600.0, 69.2, 63.2, 60.4],
    [680.0, 69.2, 60.8, 60.4],
    [756.4, 69.2, 60.8, 60.4],
  ],
  skills: [
    [81.2, 178.0, 60.8, 60.0],
    [157.6, 178.0, 60.0, 60.0],
    [233.6, 178.0, 61.2, 60.0],
    [311.6, 178.0, 61.2, 60.0],
  ],
  weapons: [
    [424.3, 129.8, 89.2, 41.0],
    [623.1, 137.3, 154.0, 32.9],
  ],
  lit: [
    [418.7, 125.5, 99.0, 50.0],
    [617.7, 132.0, 165.0, 43.0],
  ],
  ammo: [
    [427.2, 178.0, 62.0, 60.0],
    [504.8, 178.0, 61.6, 60.0],
    [620.8, 178.0, 71.6, 60.0],
    [710.0, 178.0, 72.0, 60.0],
  ],
} as const;
const BAR_WIDTH = 454; // pixels on the screen
const SCALE = BAR_WIDTH / FRAME.width;
const BAR_HEIGHT = Math.round(FRAME.height * SCALE);
const BOTTOM = 6; // pixels between the bar and the screen's bottom
const STATUS_GAP = 2; // pixels between the status line and the bar
const STATUS_HEIGHT = 20; // pixels: the status line's
const STATUS_EDGE = 4; // pixels the status line keeps from the screen's sides, the bar moved to one of them
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
const LIT_HOVER_ALPHA = 0.5; // a weapon's lit picture under the pointer, while the weapon isn't picked
// Pixels and seconds: the light round an ability loaded for the next volley, rings out from the well, breathing
const ARMED = { rings: 3, pad: 3, step: 4, swell: 3, width: 3, glow: 10, corner: 4, alpha: 1, speed: 5 } as const;
const ARMED_COLOR = 0xfff1b8; // brighter than the lit rim's gold, to stand out on the frame's brass
const SKILL_ICON = 16; // pixels: a skill's drawn icon, until its picture has loaded or for one not painted yet
const AMMO_ICON = 20; // pixels: an ammo's painted picture
const ITEM_INSET = 2; // pixels between an item's painted picture and its quick slot's sides
const ITEM_DOT = 6; // pixels: the radius of the dot in its grade's colour that stands for an item until its icons load
// Pixels a press on an item in a quick slot moves before it is a drag; the picture that follows the pointer, and how
// clear it is
const DRAG = { threshold: 5, size: 44, alpha: 0.85 } as const;
// Pixels: the strip under a weapon's two places for ammo, on the frame's bottom board: how far under their wells, and
// its height
const RELOAD = { below: 5, height: 2 } as const;
// Pixels: the letters' sizes: a skill's countdown, a key in a well's corner, an ammo's count, the plus in an empty place
const FONT = { countdown: 13, key: 8, count: 9, plus: 14 } as const;
// The keys that load the picked weapon's two kinds of ammo at hand (keyboardInput.ts), in their places' corners
const AMMO_KEYS = ['Z', 'X'] as const;
// The key that picks each weapon (keyboardInput.ts), painted by it
const WEAPON_KEYS: Readonly<Record<WeaponId, string>> = { cannon: 'Q', harpoon: 'E' };
const NATURE_NAMES = { creature: 'to creatures', object: 'to ships and objects' } as const;
// The keys that use the ship's abilities, by their slot (keyboardInput.ts), in their wells' corners
const ABILITY_KEYS = ['F', 'G', 'T'] as const;

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
  /** Uses the ship's ability in a slot: 0 its level 5 talent (F), 1 its level 25 one (G), 2 its level 50 one (T) */
  useAbility: (slot: number) => void;
  setWeapon: (weapon: WeaponId) => void;
  loadAmmo: (ammo: AmmoId) => void;
  /**
   * Opens the loadout on a weapon's tab, where its ammo at hand is picked (a click on an empty place of that weapon's);
   * open, it stays open and turns to that tab
   */
  openLoadout: (weapon: WeaponId) => void;
  /** Empties a quick slot: its item dragged back into the hold */
  clearQuickSlot: (slot: number) => void;
  /** Moves the item in one quick slot to another, the two swapping */
  swapQuickSlots: (from: number, to: number) => void;
  /** Whether a point on the screen is over the open hold: an item dragged off the bar is put back there, and only there */
  overHold: (x: number, y: number) => boolean;
  /** Lights the hold while an item is dragged off the bar, where it can go back; false when the drag ends */
  showTakeBack: (on: boolean) => void;
}

/**
 * How a well looks: lit (its skill at work, its weapon picked, its ammo loaded) in a colour; dimmed (it can't be used
 * now; cooling, the pointer an hourglass over it); or locked (a skill not open yet: as it is, but it takes no clicks).
 * One that takes no clicks may still be dragged from (`grab`: a quick slot with an item)
 */
interface WellLook {
  readonly lit?: boolean;
  readonly color?: number;
  readonly disabled?: boolean;
  readonly cooling?: boolean;
  readonly locked?: boolean;
  readonly grab?: boolean;
}

/** What the tooltip over a well says, as the game is now; null for nothing */
type Hint = (state: GameState) => TooltipText | null;

/**
 * A button in one of the frame's painted wells, or on a weapon painted on it: the frame is its face, so it adds only
 * what changes, a light under the pointer, and when lit a glow under whatever the owner puts in `content` and a rim
 * over it (a skill's picture would hide the glow), or a lit picture of its own (`wearLit`). Clicks never reach the
 * stage, which would steer the ship
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
  /** Its face lit, painted, once loaded: shown in place of the glow and rim drawn */
  private litPicture: Sprite | null = null;
  private hovered = false;
  private look: WellLook = {};
  /** Whether a click does anything: an empty slot's, waiting for a skill to come, never does */
  private readonly tappable: boolean;
  /** As last painted, to repaint only on change */
  private painted = '';

  constructor(box: Box, onTap: (() => void) | null, hint: Hint) {
    const { x, y, width, height } = onScreen(box);
    this.width = width;
    this.height = height;
    this.hint = hint;
    this.tappable = onTap !== null;
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

  /**
   * Lights it with a painted picture (`box`: where it goes, in the frame's picture's pixels) in place of the glow and
   * rim drawn; under the pointer, the picture shows faintly
   */
  wearLit(texture: Texture, box: Box) {
    const picture = new Sprite(texture);
    picture.position.set(box[0] * SCALE - this.container.x, box[1] * SCALE - this.container.y);
    picture.setSize(box[2] * SCALE, box[3] * SCALE);
    this.container.addChildAt(picture, 0);
    this.litPicture = picture;
    this.painted = '';
    this.paint();
  }

  /** Whether a point on the screen is in the well: its content may not fill it */
  contains(x: number, y: number) {
    const local = this.container.toLocal({ x, y });
    return local.x >= 0 && local.y >= 0 && local.x < this.width && local.y < this.height;
  }

  private paint() {
    const {
      lit = false,
      color = COLORS.lit,
      disabled = false,
      cooling = false,
      locked = false,
      grab = false,
    } = this.look;
    const hovered = this.hovered && !disabled && !locked;
    const key = `${lit}${color}${disabled}${cooling}${locked}${grab}${hovered}`;
    if (key === this.painted) return;
    this.painted = key;
    const { width, height, litPicture } = this;
    this.glow.clear();
    const over = this.over.clear();
    if (litPicture) {
      litPicture.visible = lit || hovered;
      litPicture.alpha = lit ? 1 : LIT_HOVER_ALPHA;
    } else if (lit) {
      this.glow.rect(0, 0, width, height).fill(glowFill(color));
      over
        .rect(1, 1, width - 2, height - 2)
        .stroke({ width: 2, color, alpha: 0.95 })
        .rect(-1, -1, width + 2, height + 2)
        .stroke({ width: 2, color, alpha: 0.35 });
    }
    if (hovered && !litPicture) {
      over
        .rect(0, 0, width, height)
        .fill({ color: COLORS.hover, alpha: 0.08 })
        .rect(0.5, 0.5, width - 1, height - 1)
        .stroke({ width: 1, color: COLORS.hover, alpha: 0.35 });
    }
    this.container.cursor = !this.tappable
      ? grab
        ? 'pointer'
        : 'default'
      : cooling
        ? 'wait'
        : disabled || locked
          ? 'not-allowed'
          : 'pointer';
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

/**
 * An ability's well (`slot`: 0 the first, F; 1 the second, G; 2 the third, T): the seconds till it is ready, a shade
 * going round
 */
interface AbilityWell extends SkillWell {
  readonly slot: number;
  readonly sweep: Graphics;
  readonly count: Text;
  /** A light breathing round it while it waits to go off (a Broadside loaded for the next volley) */
  readonly halo: Graphics;
}

/** Each ability's painted picture, and its icon drawn until the pictures have loaded */
const ABILITY_FACES: Partial<Readonly<Record<SignatureId, { readonly icon: SkillIconId; readonly draw: DrawIcon }>>> = {
  broadside: { icon: 'broadside', draw: drawBroadside },
  fullSail: { icon: 'fullSail', draw: drawSail },
  rocket: { icon: 'rocket', draw: drawHarpoon },
  powderKeg: { icon: 'powderKeg', draw: drawBall },
  bombardment: { icon: 'bombardment', draw: drawBall },
  royalStandard: { icon: 'royalStandard', draw: (g, size, color) => drawStar(g, size * 0.45, color) },
};

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

/** One of the ten quick slots on the bar's top, keys 1…0: an item of the hold, put there from the hold's window */
interface QuickSlot {
  readonly index: number;
  readonly well: Well;
  /** The item in it, as last shown */
  item: ItemId | null;
  /** How many of it are in the hold, while it has one */
  count: Text | null;
}

/** A press on a quick slot's item: where it started, and the picture following the pointer once it is a drag */
interface QuickPress {
  readonly slot: QuickSlot;
  readonly from: { readonly x: number; readonly y: number };
  ghost: Sprite | Graphics | null;
}

/** What the player is told when the ship holds fire, and what to do about it */
const HOLD_MESSAGES: Readonly<Record<HoldReason, (ship: Ship) => string>> = {
  noGuns: (ship) => t('No {weapon} fitted: fit some in the loadout (L)', weaponNames(ship.weapon)),
  // The loaded ammo is aboard but off the bar: bought again after it ran out, while another may be at hand
  notAtHand: (ship) =>
    ship.ammoBar[ship.weapon].some((id) => id !== null)
      ? t('{ammo} is not at hand: put it on the bar in the loadout (L), or load the other below (Z, X)', {
          ammo: t(AMMO[ship.loaded[ship.weapon]].name),
        })
      : t('No ammo at hand for your {weapon}: put some on the bar in the loadout (L)', weaponNames(ship.weapon)),
  noAmmo: (ship) =>
    t('Out of {ammo}: load the other ammo below (Z, X), or put another at hand in the loadout (L)', {
      ammo: t(AMMO[ship.loaded[ship.weapon]].name),
    }),
  sight: () => t('Target hidden in the fog: sail closer'),
  ink: () => t('Ink hides the target: sail out of it'),
  deep: () => t('The target dived: get out of the dark glow where it comes up'),
  range: (ship) =>
    t("Target beyond your {weapon}' reach ({range}): sail closer", {
      ...weaponNames(ship.weapon),
      range: Math.round(ship.range()),
    }),
};

/** A weapon's name for a sentence: `weapon` lower case, `Weapon` as it starts one */
function weaponNames(weapon: WeaponId) {
  const name = t(WEAPONS[weapon].name);
  return { weapon: name.toLowerCase(), Weapon: name };
}

/**
 * A weapon's part of the bar: the weapon painted on the frame, which picks it (lit when picked), its two kinds of ammo
 * at hand below, and under them its reload
 */
interface Group {
  readonly weapon: WeaponId;
  readonly button: Well;
  /** The reload's strip, under the places for ammo, and its width in pixels */
  readonly reload: Graphics;
  readonly strip: number;
  readonly places: readonly AmmoPlace[];
  /** The ammo the places were filled for, to fill them again only when it changes */
  shown: string;
}

/**
 * The bar at the bottom of the screen, in a painted frame of wood and brass (`FRAME`). On top, ten quick slots, keys
 * 1…0, for the items of the hold (player.quickSlots): each its painted picture and how many are in the hold, dragged
 * there from the hold's window (`quickSlotAt`); dragged from one slot to another they swap, and only dropped back into
 * the open hold does one leave the bar, so a slip of the mouse never empties a slot. Using them comes with an update:
 * a click or their key does nothing yet. Under them on the left, the skills, painted: the repair (R),
 * the ship's ability (F; a lock until its talent is picked at level 5), its second (G; from tier 3, picked at level
 * 25: a rocket, dimmed while nothing it could fly at is attacked or picked out, or a powder keg) and its third (T; from
 * tier 5, picked at level 50: a bombardment, dimmed as the rocket is, or a Royal standard; a ship of a lower tier has
 * neither of the last two: they say which tier brings them); on the
 * right, each weapon painted with its key (a click on it, or its key, Q or E, picks it; picked, its lit picture glows
 * over it, faintly under the pointer) with its two kinds of ammo at hand under it (Ship.ammoBar, put there in the
 * loadout: their counts, the loaded one lit, a click or Z or X loads the other; an empty place, as one whose ammo has
 * run out is, shows a plus that opens the loadout), and under them how far its soonest gun has reloaded. Ammo dragged
 * out of the loadout drops on its places (`ammoPlaceAt`). The pointer over a weapon, a skill or an ammo shows all about
 * it in a tooltip. Over the bar, a line about what is going on: why the ship holds fire, that its weapon is the wrong
 * one for the target, the repair. Until the frame's picture has loaded, its wells are drawn plain
 */
export class SkillBar {
  static readonly WIDTH = BAR_WIDTH;
  static readonly HEIGHT = BAR_HEIGHT;
  /** Pixels between the bar and the screen's bottom, where the HUD lays it out */
  static readonly BOTTOM = BOTTOM;
  readonly container = new Container();
  /** Over everything: the picture of an item dragged off a quick slot */
  readonly dragLayer = new Container();
  private readonly status = text('', 14, UI.text, { fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } });
  /** Whether its line is under it: the bar is at the screen's top, with no room above */
  private statusUnder = false;
  private readonly tooltip: Tooltip;
  /** The screen it is on: its tooltips and its line stay inside it */
  private readonly screen: { readonly width: number };
  private readonly repair: SkillWell;
  private readonly repairArc = new Graphics();
  private readonly repairCount = label('', FONT.countdown, THEME.text);
  /** The ship's abilities, F, G and T: each its picture, the seconds till it is ready again, its cooling as a shade */
  private readonly abilities: readonly AbilityWell[];
  /** The abilities the skills' faces were laid for, '' to lay them again (the pictures have loaded) */
  private facesFor = '';
  private readonly groups: Group[];
  private readonly actions: SkillBarActions;
  /** The weapon whose ammo is being dragged out of the loadout: its places are lit to take it */
  private dropFor: WeaponId | null = null;
  private readonly quick: readonly QuickSlot[];
  /** Every well with a button in it, or an item */
  private readonly wells: readonly Well[];
  /** The items the quick slots were filled for, to fill them again only when they change ('' once the icons load) */
  private quickShown = '';
  /** Whether an item is being dragged out of the hold's window: every quick slot is lit to take it */
  private itemDrop = false;
  private press: QuickPress | null = null;

  constructor(screen: { readonly width: number }, actions: SkillBarActions) {
    this.screen = screen;
    this.actions = actions;
    this.tooltip = new Tooltip(screen);
    this.status.anchor.set(0.5, 1);
    this.status.position.set(BAR_WIDTH / 2, -STATUS_GAP);

    // No click: an item's use comes later. A well that takes none still lights under the pointer, unlocked
    this.quick = FRAME.quick.map((box, index): QuickSlot => {
      const slot: QuickSlot = {
        index,
        well: new Well(box, null, ({ player }) => quickHint(player, slot)),
        item: null,
        count: null,
      };
      this.grabbable(slot);
      return slot;
    });
    ITEM_ICONS.load(() => (this.quickShown = ''));
    this.dragLayer.eventMode = 'none';

    this.repair = skillWell(FRAME.skills[0], actions.repair, repairHint);
    this.repair.well.content.addChild(this.repairArc, this.repairCount, keyLabel('R', this.repair.well));
    centre(this.repairCount, this.repair.well);
    this.abilities = ABILITY_KEYS.map((key, slot): AbilityWell => {
      const skill = skillWell(FRAME.skills[slot + 1], () => actions.useAbility(slot), abilityHint(slot));
      const sweep = new Graphics();
      const count = label('', FONT.countdown, THEME.text);
      centre(count, skill.well);
      skill.well.content.addChild(sweep, count, keyLabel(key, skill.well));
      const halo = new Graphics();
      halo.position.set(skill.well.container.x, skill.well.container.y);
      return { ...skill, slot, sweep, count, halo };
    });
    SKILL_ICONS.load(() => (this.facesFor = ''));

    this.groups = WEAPON_IDS.map((weapon, w) => this.group(weapon, w));
    this.wells = [
      ...this.quick.map((slot) => slot.well),
      ...[this.repair, ...this.abilities].map((skill) => skill.well),
      ...this.groups.flatMap((g) => [g.button, ...g.places.map((p) => p.well)]),
    ];
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
      ...this.groups.map((group) => group.reload),
      ...this.wells.map((well) => well.container),
      ...this.abilities.map((skill) => skill.halo),
      this.tooltip.container,
    );
  }

  /** Where the bar is on the screen */
  get box() {
    return new Rectangle(this.container.x, this.container.y, BAR_WIDTH, BAR_HEIGHT);
  }

  /**
   * What the bar and its line take of a screen `screenHeight` pixels high: what a window over it leaves clear (the
   * loadout), at the top when the bar is in the screen's upper half, else at the bottom
   */
  edges(screenHeight: number): ScreenEdges {
    const { y } = this.container;
    const line = STATUS_GAP + STATUS_HEIGHT;
    const top = this.statusUnder ? y : y - line;
    const bottom = this.statusUnder ? y + BAR_HEIGHT + line : y + BAR_HEIGHT;
    if (y + BAR_HEIGHT / 2 < screenHeight / 2) return { top: Math.max(0, bottom), bottom: 0 };
    return { top: 0, bottom: Math.max(0, screenHeight - top) };
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

  /** The quick slot under a point on the screen, if there is one there: for an item dragged out of the hold */
  quickSlotAt(x: number, y: number): number | null {
    return this.quick.find(({ well }) => well.contains(x, y))?.index ?? null;
  }

  /** Lights every quick slot while an item is dragged out of the hold, to take it; false when the drag ends */
  showItemDrop(on: boolean) {
    this.itemDrop = on;
  }

  /**
   * x, y: the bar's top left corner on the screen; its line goes under it when it has no room above. picked: the unit
   * the player picked out, which a rocket flies at when the ship attacks nothing (and shells fall round)
   */
  update(state: GameState, x: number, y: number, picked: number | null) {
    this.container.position.set(x, y);
    this.statusUnder = y < STATUS_GAP + STATUS_HEIGHT;
    this.status.anchor.set(0.5, this.statusUnder ? 0 : 1);
    this.status.y = this.statusUnder ? BAR_HEIGHT + STATUS_GAP : -STATUS_GAP;
    for (const group of this.groups) this.updateGroup(group, state.ship);
    this.updateQuick(state);
    this.updateFaces(state.ship);
    this.updateRepair(state);
    for (const skill of this.abilities) this.updateAbility(state, skill, picked);
    this.updateStatus(state);
    // Over the bar's middle, but kept on the screen: the bar moved to its side, a long line would run off it
    const half = this.status.width / 2 + STATUS_EDGE;
    const middle = x + BAR_WIDTH / 2;
    this.status.x = BAR_WIDTH / 2 + Math.max(half, Math.min(middle, this.screen.width - half)) - middle;
    // Not while ammo or an item is dragged: the places lit say where it goes
    const dragging = this.dropFor !== null || this.itemDrop || this.press?.ghost;
    const hovered = dragging ? undefined : this.wells.find((well) => well.isHovered);
    if (hovered) {
      const { container, width, height } = hovered;
      this.tooltip.point(hovered.hint(state), container.x + width / 2, container.y, { under: container.y + height });
    } else this.tooltip.point(null, 0, 0);
  }

  /**
   * The whole bar and the room of its line over it, for the story's guide's note to keep clear of: over them, not over
   * the slots or the line
   */
  get frame(): GuideTarget {
    const line = STATUS_GAP + STATUS_HEIGHT;
    return { container: this.container, box: { x: 0, y: -line, width: BAR_WIDTH, height: BAR_HEIGHT + line } };
  }

  /** The repair's well, or a weapon's painted on the frame, for the story's guide to point at */
  target(what: 'repair' | WeaponId): GuideTarget | null {
    const well = what === 'repair' ? this.repair.well : this.groups.find((g) => g.weapon === what)?.button;
    return well ? { container: well.container, box: { x: 0, y: 0, width: well.width, height: well.height } } : null;
  }

  /**
   * The quick slots: filled again with their items when they change, each lit while an item dragged (out of the hold,
   * or off another slot) can go there, and how many of its item the hold has
   */
  private updateQuick({ player }: GameState) {
    const key = player.quickSlots.join();
    if (key !== this.quickShown) {
      this.quickShown = key;
      for (const slot of this.quick) fillQuick(slot, player.quickSlots[slot.index] ?? null);
    }
    const from = this.press?.ghost ? this.press.slot : null;
    for (const slot of this.quick) {
      const lit = this.itemDrop || (from !== null && slot !== from);
      slot.well.setLook({ lit, color: COLORS.drop, grab: slot.item !== null });
      if (slot.count && slot.item) show(slot.count, compact(player.items[slot.item] ?? 0));
    }
  }

  /**
   * What a press on a quick slot's item does: past a few pixels it is a drag, its picture following the pointer; let go
   * over another slot, the two swap; over the open hold, the slot is emptied; anywhere else, nothing
   */
  private grabbable(slot: QuickSlot) {
    const { container } = slot.well;
    container.on('pointerdown', (e) => {
      if (slot.item) this.press = { slot, from: { x: e.global.x, y: e.global.y }, ghost: null };
    });
    container.on('globalpointermove', (e) => this.drag(slot, e.global));
    container.on('pointerup', (e) => this.drop(slot, e.global));
    container.on('pointerupoutside', (e) => this.drop(slot, e.global));
  }

  private drag(slot: QuickSlot, point: Point) {
    const press = this.press;
    if (press?.slot !== slot || !slot.item) return;
    if (!press.ghost) {
      if (Math.hypot(point.x - press.from.x, point.y - press.from.y) < DRAG.threshold) return;
      press.ghost = itemGhost(slot.item);
      this.dragLayer.addChild(press.ghost);
      this.actions.showTakeBack(true);
    }
    press.ghost.position.set(point.x, point.y);
  }

  private drop(slot: QuickSlot, point: Point) {
    const press = this.press;
    if (press?.slot !== slot) return;
    this.press = null;
    if (!press.ghost) return;
    press.ghost.destroy();
    this.actions.showTakeBack(false);
    const to = this.quickSlotAt(point.x, point.y);
    if (to !== null) {
      if (to !== slot.index) this.actions.swapQuickSlots(slot.index, to);
    } else if (this.actions.overHold(point.x, point.y)) {
      this.actions.clearQuickSlot(slot.index);
    }
  }

  /**
   * A weapon painted on the frame, lit by its own picture once loaded, its two places for ammo under it and its reload
   * under them (`w`: its order)
   */
  private group(weapon: WeaponId, w: number): Group {
    const button = new Well(FRAME.weapons[w], () => this.actions.setWeapon(weapon), weaponHint(weapon));
    Assets.load<Texture>({ src: litUrl(weapon), data: { autoGenerateMipmaps: true } })
      .then((texture) => button.wearLit(texture, FRAME.lit[w]))
      .catch((error) => console.warn(`The skill bar's lit ${weapon} failed to load`, error));
    const places = AMMO_KEYS.map((letter, i): AmmoPlace => {
      const place: AmmoPlace = {
        well: new Well(
          FRAME.ammo[w * AMMO_KEYS.length + i],
          () => (place.ammo ? this.actions.loadAmmo(place.ammo) : this.actions.openLoadout(weapon)),
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
    const first = places[0].well;
    const last = places[places.length - 1].well;
    const reload = new Graphics();
    reload.position.set(first.container.x, first.container.y + first.height + RELOAD.below);
    return { weapon, button, reload, strip: last.container.x + last.width - reload.x, places, shown: '' };
  }

  /** The skills' faces: the repair's and the abilities' (painted, drawn or a lock) */
  private updateFaces(ship: Ship) {
    const key = this.abilities.map(({ slot }) => ship.abilityIn(slot)).join();
    if (key === this.facesFor) return;
    this.facesFor = key;
    setFace(this.repair, 'repair', drawWrench);
    for (const skill of this.abilities) {
      const ability = ship.abilityIn(skill.slot);
      const face = ability === null ? undefined : ABILITY_FACES[ability];
      if (face) setFace(skill, face.icon, face.draw);
      else setFace(skill, 'locked', null);
    }
  }

  /**
   * An ability's well: lit while it works (Broadside loaded, Full sail or a Royal standard up); dim, shaded and
   * counting down while it cools; dim while a rocket or a bombardment has nothing to aim at (the unit attacked, or else
   * the one picked out, in its range and sight); locked till its talent is picked
   */
  private updateAbility(state: GameState, skill: AbilityWell, picked: number | null) {
    const { ship, time } = state;
    const ability = ship.abilityIn(skill.slot);
    const working =
      ability === 'broadside'
        ? ship.broadsideArmed
        : (ability === 'fullSail' && time < ship.fullSailUntil) ||
          (ability === 'royalStandard' && time < ship.standardUntil);
    const wait = (ship.abilityReadyAt[skill.slot] ?? 0) - time;
    const cooling = ability !== null && !working && wait > 0;
    const aimless =
      (ability === 'rocket' || ability === 'bombardment') &&
      !abilityTarget(state, ship, ability, ship.attackTarget ?? picked);
    skill.well.setLook({
      lit: working,
      locked: ability === null,
      disabled: ability !== null && !working && (wait > 0 || ship.isSinking || ship.docked || aimless),
      cooling,
    });
    show(skill.count, cooling ? `${Math.ceil(wait)}` : '');
    const sweep = skill.sweep.clear();
    const { width, height } = skill.well;
    if (cooling) drawSweep(sweep, width, height, wait / abilityCooldown(ship, skill.slot));
    // Loaded for the next volley: a light breathing round the well, so it isn't missed in a fight
    const halo = skill.halo.clear();
    if (ability === 'broadside' && working) {
      const breath = 0.5 + 0.5 * Math.sin(time * ARMED.speed);
      // A soft glow under the rings, then the rings out from the well, fainter outwards
      const glow = ARMED.pad + ARMED.glow / 2;
      halo.roundRect(-glow, -glow, width + glow * 2, height + glow * 2, ARMED.corner + glow).stroke({
        width: ARMED.glow,
        color: ARMED_COLOR,
        alpha: 0.15 + 0.2 * breath,
      });
      for (let ring = 0; ring < ARMED.rings; ring++) {
        const pad = ARMED.pad + ring * ARMED.step + breath * ARMED.swell;
        halo.roundRect(-pad, -pad, width + pad * 2, height + pad * 2, ARMED.corner + pad).stroke({
          width: ARMED.width,
          color: ARMED_COLOR,
          alpha: ARMED.alpha * (1 - ring / ARMED.rings) * (0.5 + 0.5 * breath),
        });
      }
    }
  }

  private updateRepair(state: GameState) {
    const { ship, time } = state;
    const combat = ship.inCombat(time);
    const mended = ship.hp >= ship.maxHp;
    // In combat: the seconds till a repair can start, over the dimmed icon
    const waiting = combat && !ship.repairing && !mended;
    this.repair.well.setLook({
      lit: ship.repairing,
      color: UI.heal,
      disabled: !ship.repairing && (ship.isSinking || mended || combat || !canPayRepair(state, ship)),
      cooling: waiting && !ship.isSinking,
    });
    show(this.repairCount, waiting ? `${Math.ceil(ship.combatUntil - time)}` : '');
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
      message = t('{talent}: your guns wait for each other, then fire as one for ×{n} damage', {
        talent: t(SIGNATURES.broadside.name),
        n: PERKS.broadside,
      });
      color = UI.active;
    } else if (time < ship.fullSailUntil) {
      message = t('{talent}: {n} s', { talent: t(SIGNATURES.fullSail.name), n: Math.ceil(ship.fullSailUntil - time) });
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
    const { weapon, strip } = group;
    group.button.setLook({ lit: ship.weapon === weapon });
    // How far the soonest gun is reloaded: full and green when one is ready
    const reloads = ship.reloads[weapon];
    const share = reloadShare(ship, weapon);
    const progress = ship
      .fittedGuns(weapon)
      .reduce((best, { gun, slot }) => Math.max(best, 1 - reloads[slot] / (gun.reload * share)), 0);
    group.reload
      .clear()
      .rect(0, 0, strip, RELOAD.height)
      .fill({ color: 0x000000, alpha: 0.45 })
      .rect(0, 0, strip * progress, RELOAD.height)
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
    for (const box of [...FRAME.quick, ...FRAME.skills, ...FRAME.weapons, ...FRAME.ammo]) {
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
 * A skill's face: its painted picture (`icon`) as big as the well lets it, unstretched, in its middle; or until the
 * pictures have loaded (or for a skill not painted yet, no `icon`) its icon drawn by `draw`; nothing for a lock that
 * hasn't loaded
 */
function setFace(skill: SkillWell, icon: SkillIconId | null, draw: DrawIcon | null) {
  const { well, picture, drawn } = skill;
  const texture = icon ? SKILL_ICONS.get(icon) : null;
  picture.visible = texture !== null;
  if (texture) {
    const side = Math.min(well.width, well.height);
    picture.texture = texture;
    picture.setSize(side, side);
    picture.position.set((well.width - side) / 2, (well.height - side) / 2);
  }
  drawn.clear();
  if (!texture && draw) draw(drawn, SKILL_ICON, THEME.text);
}

/** A countdown in the middle of a well */
function centre(count: Text, well: Well) {
  count.anchor.set(0.5);
  count.position.set(well.width / 2, well.height / 2);
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

/** The repair's tooltip: what it mends and for how much; while the crew repairs, that it stops them */
function repairHint({ ship }: GameState): TooltipText {
  if (ship.repairing)
    return {
      title: t('Stop the repair (R)'),
      lines: [t('The step under way is lost, and nothing is paid for it')],
    };
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

/**
 * An ability's tooltip (`slot`: 0 the first, 1 the second, 2 the third): its talent and what it does, how it opens,
 * or on a ship of a lower tier the tier that brings it
 */
function abilityHint(slot: number): Hint {
  return ({ ship }) => {
    const key = ABILITY_KEYS[slot];
    if (slot >= ship.shipClass.abilities) {
      const [title, line] =
        slot === 1
          ? [t('Second ability ({key})', { key }), t('Ships of tier 3 and up have it')]
          : [t('Third ability ({key})', { key }), t('Ships of tier 5 and up have it')];
      return { title, color: THEME.dim, lines: [line] };
    }
    const ability = ship.abilityIn(slot);
    if (ability === null) {
      const level = ABILITY_LEVELS[slot];
      return {
        title: t('Ability ({key})', { key }),
        color: THEME.dim,
        lines: [t('Opens with a signature talent at level {level}: pick it in the talents (K)', { level })],
      };
    }
    const talent = talentOf(ability);
    const lines = [t(talent.text, talent.figures)];
    if (ability === 'broadside') {
      lines.push(
        ship.broadsideArmed
          ? t('Loaded: the next volley fires it. Press {key} again to put it away, its cooldown not started', { key })
          : t('Press {key} to load it for the next volley, again to put it away', { key }),
      );
    }
    return { title: t(talent.name), lines };
  };
}

/**
 * A weapon's tooltip: its name and key, how many of its guns are fitted, what it does full damage to, and how to pick
 * it while it isn't picked
 */
function weaponHint(weapon: WeaponId): Hint {
  return ({ ship }) => {
    const key = WEAPON_KEYS[weapon];
    const guns = ship.guns[weapon];
    const fitted = guns.filter((gun) => gun !== null).length;
    const { name, against } = WEAPONS[weapon];
    return {
      title: `${t(name)} (${key})`,
      lines: [
        fitted === 0
          ? t('No {weapon} fitted: fit some in the loadout (L)', weaponNames(weapon))
          : t('{n} of {slots} fitted', { n: fitted, slots: guns.length }),
        t('Full damage {targets}, {share}% to the rest', {
          targets: t(NATURE_NAMES[against]),
          share: OFF_TARGET_SHARE * 100,
        }),
        ...(ship.weapon === weapon ? [] : [t('Click or {key}: pick them', { key })]),
      ],
    };
  };
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

/** A quick slot's tooltip: its item, all about it and how it leaves the bar; or how one is put there */
function quickHint(player: Player, slot: QuickSlot): TooltipText {
  const key = QUICK_KEYS[slot.index];
  if (!slot.item) {
    return {
      title: t('Quick slot {key}', { key }),
      color: THEME.dim,
      lines: [t('Open the hold (H) and drag an item here from its Items')],
    };
  }
  return itemHint(player, slot.item, [
    t('Quick slot {key}', { key }),
    t('Drag it onto another quick slot to swap them, or back into the open hold (H) to take it off the bar'),
  ]);
}

/**
 * A quick slot's content for an item (`id`): its painted picture as big as the well lets it, unstretched (a dot in its
 * grade's colour until the icons load), and how many are in the hold (set each frame); nothing for none
 */
function fillQuick(slot: QuickSlot, id: ItemId | null) {
  const { well } = slot;
  for (const child of well.content.removeChildren()) child.destroy({ children: true });
  slot.item = id;
  slot.count = null;
  if (!id) return;
  const texture = ITEM_ICONS.get(id);
  if (texture) {
    const side = Math.min(well.width, well.height) - ITEM_INSET * 2;
    const picture = new Sprite({ texture, anchor: 0.5 });
    picture.setSize(side, side);
    picture.position.set(well.width / 2, well.height / 2);
    well.content.addChild(picture);
  } else {
    well.content.addChild(new Graphics().circle(well.width / 2, well.height / 2, ITEM_DOT).fill(itemColor(id)));
  }
  const count = label('', FONT.count, THEME.text);
  count.anchor.set(1, 1);
  count.position.set(well.width - 2, well.height);
  well.content.addChild(count);
  slot.count = count;
}

/** The picture of an item that follows the pointer while it is dragged off its quick slot */
function itemGhost(id: ItemId) {
  const texture = ITEM_ICONS.get(id);
  const ghost = texture
    ? new Sprite({ texture, anchor: 0.5 })
    : new Graphics().circle(0, 0, DRAG.size / 3).fill(itemColor(id));
  ghost.width = ghost.height = DRAG.size;
  ghost.alpha = DRAG.alpha;
  return ghost;
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
