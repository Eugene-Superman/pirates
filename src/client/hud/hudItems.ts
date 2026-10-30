import { Container, Text, type TextStyleOptions } from 'pixi.js';
import { storyStep, type ActiveQuest, type GameState, type WeaponId } from '../../game';
import type { SoundSettings } from '../audio/Sounds';
import type { GpuInfo } from '../render/gpu';
import { NAV_DEBUG, type NavDebug } from '../scene/effects/navDebug';
import { ButtonRow } from './ButtonRow';
import { Checkbox } from './Checkbox';
import { DamagePanel, type DamageActions } from './DamagePanel';
import { FpsMeter } from './FpsMeter';
import type { FeatsActions } from './FeatsPanel';
import type { HoldActions } from './HoldPanel';
import type { LoadoutActions } from './LoadoutPanel';
import type { MasteryActions } from './MasteryPanel';
import { NIGHT } from './nightTheme';
import { Select } from './Select';
import type { TalentActions } from './TalentPanel';
import { show } from './ui';
import { LANGS, lang, t, type Lang } from '../i18n/i18n';

export const TEXT_STYLE = {
  fontFamily: 'Arial',
  fontSize: 16,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
};
/** What a control says beside its buttons in the settings: a value, a note */
const VALUE_STYLE: TextStyleOptions = { fontFamily: 'Arial', fontSize: 13, fill: NIGHT.dim };
/** Pixels across a control in the settings takes at most: its buttons wrap, and what it says beside them */
export const CONTROL_WIDTH = 600;
// Camera zoom levels, as multiples of the default zoom: farther out, as it is, nearer
const ZOOM_LEVELS: readonly number[] = [0.5, 1, 1.5];
const DEBUG_LABELS: Readonly<Record<NavDebug, string>> = { route: 'Route', hulls: 'Hulls and coasts' };
const WARNING_WIDTH = 360; // pixels: the warning under the FPS wraps, so the column leaves room for the frames at the top
const LANGUAGE_WIDTH = 200; // pixels: the language's field and its list
const DEBUG_GOLD: readonly number[] = [1000, 5000, 10000]; // gold each debug button gives
const DEBUG_DOUBLOONS: readonly number[] = [10, 100, 1000]; // doubloons each debug button gives
const KNOT = 10; // world units per second: the HUD shows speed in knots, a tenth of the game's units
const VIEW_STEP = 50; // world units, for the view range buttons
const PART_GAP = 10; // pixels between a control's parts: a checkbox, its buttons, what it says
const LEAST_NOTE = 120; // pixels: what a control says beside its buttons wraps no narrower than this
const WARNING_COLOR = 0xffb347;
const SOFTWARE_WARNING =
  "No graphics acceleration: the processor draws the game, at a lower resolution. Turn it on in the browser's settings";

export interface HudActions
  extends DamageActions, FeatsActions, HoldActions, LoadoutActions, MasteryActions, TalentActions {
  /** Uses the ship's ability in a slot: 0 its level 5 talent (F), 1 its level 25 one (G), 2 its level 50 one (T) */
  useAbility: (slot: number) => void;
  /** Fires at the unit the player picked out, or stops if the ship already does */
  toggleFire: () => void;
  /** Orders the crew to repair, for gold, or to stop */
  repair: () => void;
  /** Gives a quest of one of the player's ships up, done or not, from the quest tracker (the player has said yes) */
  dropQuest: (quest: ActiveQuest) => void;
  /** Puts up the captain's portrait of that number */
  choosePortrait: (portrait: number) => void;
  /** Camera zoom as a multiple of the default one */
  setZoom: (level: number) => void;
  setWeapon: (weapon: WeaponId) => void;
  /** Shows or hides the range rings of the weapon picked */
  toggleRanges: () => void;
  /** Shows or hides a debug drawing of the navigation */
  toggleDebug: (kind: NavDebug) => void;
  /** Turns all sound on or off */
  toggleSound: () => void;
  /** Changes the volume by steps (−1 one step down, +1 one up) */
  changeVolume: (steps: number) => void;
  /** Changes the ship's top speed when intact / when nearly wrecked, world units per second. Tuning, like the damage buttons */
  changeMaxSpeed: (delta: number) => void;
  changeMinSpeed: (delta: number) => void;
  /** Changes how far the ship sees (the fog of war's edge), world units. Tuning now, an upgrade later */
  changeViewRange: (delta: number) => void;
  /** Gold for testing the shop */
  addGold: (amount: number) => void;
  /** Doubloons for testing what they buy, until they can be bought */
  addDoubloons: (amount: number) => void;
  /** Levels up or down for testing the talents and the shipyard, within the ship's first and last */
  changeLevel: (delta: number) => void;
  /** The story's step done at once, for testing a later one */
  skipStory: () => void;
  /** A conversation of the story heard out (or skipped), by its key */
  tellStory: (key: string) => void;
  /** The prologue seen (or skipped) */
  seePrologue: () => void;
  /** Forgets everything kept in this browser and starts again */
  newGame: () => void;
  /** Leaves the game for the landing, the progress kept (the minimap's last button) */
  logOut: () => void;
  /** Picks the language of the game's texts: the page reloads in it */
  setLanguage: (lang: Lang) => void;
  /** Opens the layout editor: the parts of the main screen dragged where the player likes them, then saved */
  editLayout: () => void;
}

/** What the HUD shows of the view (not the game): set by SceneView */
export interface ViewStatus {
  zoom: number;
  /** Whether the range rings are shown */
  ranges: boolean;
  debug: Readonly<Record<NavDebug, boolean>>;
  sound: SoundSettings;
  /** What draws the picture: the graphics card, or the processor in software */
  renderer: GpuInfo;
}

/** Everything a HUD item may show in one frame */
export interface HudFrame {
  readonly state: GameState;
  readonly view: ViewStatus;
  /** Real time of the frame, milliseconds */
  readonly frameMs: number;
}

export interface HudWidget {
  readonly container: Container;
  update(frame: HudFrame): void;
  /** A widget that unfolds over what lies under it (a list to pick from): folds it, and says whether it was unfolded */
  fold?(): boolean;
}

/**
 * The settings' groups of controls: the player's, then the developer's tools (tuning the ship, and the debug
 * buttons), on a board of their own at the bottom
 */
export const HUD_GROUPS = ['Game', 'Ship tuning', 'Debug'] as const;
export type HudGroup = (typeof HUD_GROUPS)[number];
/** The groups for the developer, not the player */
export const DEV_GROUPS: readonly HudGroup[] = ['Ship tuning', 'Debug'];

/**
 * A text the HUD can show on the screen, in the column under the player's plate: the settings tick it on or off. Made
 * the first time it is shown
 */
export interface HudMetric {
  readonly id: string;
  readonly label: string;
  /** On the screen until the settings say otherwise */
  readonly onScreen: boolean;
  readonly create: () => HudWidget;
}

/** A control in the settings: a row of buttons, a switch, a list to pick from */
export interface HudControl {
  readonly id: string;
  readonly group: HudGroup;
  readonly label: string;
  readonly create: () => HudWidget;
}

function knots(speed: number) {
  return (speed / KNOT).toFixed(1).replace(/\.0$/, '');
}

function metric(style: TextStyleOptions, value: (frame: HudFrame) => string): () => HudWidget {
  return () => {
    const text = new Text({ text: '', style });
    return { container: text, update: (frame) => show(text, value(frame)) };
  };
}

/**
 * A control's parts side by side (a checkbox, a row of buttons), their first line's middles lined up, maybe followed
 * by what it says (a value, a note), wrapped to what is left of the control's width
 */
function control(
  parts: readonly { readonly container: Container }[],
  note: Text | null,
  update: (frame: HudFrame) => void,
): HudWidget {
  const container = new Container();
  let x = 0;
  for (const { container: part } of parts) {
    part.position.set(x, Math.max(0, (ButtonRow.HEIGHT - part.height) / 2));
    container.addChild(part);
    x += part.width + PART_GAP;
  }
  if (note) {
    note.style.wordWrap = true;
    note.style.wordWrapWidth = Math.max(LEAST_NOTE, CONTROL_WIDTH - x);
    note.position.set(x, Math.max(0, (ButtonRow.HEIGHT - note.height) / 2));
    container.addChild(note);
  }
  return { container, update };
}

/** − and + buttons that change a value by a step, then the value */
function stepper(change: (delta: number) => void, step: number, value: (frame: HudFrame) => string) {
  return () => {
    // Not empty: the row centres it by its height
    const text = new Text({ text: ' ', style: VALUE_STYLE });
    const row = new ButtonRow([
      { label: '−', key: null, onTap: () => change(-step) },
      { label: '+', key: null, onTap: () => change(step) },
    ]);
    return control([row], text, (frame) => show(text, value(frame)));
  };
}

/** Buttons, then what they say beside them, changing with the game */
function buttons(row: { readonly container: Container }, value: (frame: HudFrame) => string): HudWidget {
  const text = new Text({ text: ' ', style: VALUE_STYLE });
  return control([row], text, (frame) => show(text, value(frame)));
}

/** The frame rate, and under it a warning while the processor draws the game: the usual reason for a low one */
function fps(): HudWidget {
  const container = new Container();
  const text = new Text({ text: 'FPS: …', style: TEXT_STYLE });
  const warning = new Text({
    text: t(SOFTWARE_WARNING),
    style: { ...TEXT_STYLE, fontSize: 13, fill: WARNING_COLOR, wordWrap: true, wordWrapWidth: WARNING_WIDTH },
  });
  warning.y = text.height;
  warning.visible = false;
  container.addChild(text, warning);
  const meter = new FpsMeter(text);
  return {
    container,
    update: ({ frameMs, view }) => {
      meter.update(frameMs);
      warning.visible = view.renderer.software;
    },
  };
}

/** What the HUD can show on the screen, in the order it is shown there */
export function hudMetrics(): readonly HudMetric[] {
  return [
    {
      id: 'speed',
      label: 'Speed',
      onScreen: true,
      // Whole knots for the current speed: it changes every frame while the ship speeds up
      create: metric(TEXT_STYLE, ({ state: { ship } }) => {
        return t('Speed: {speed} kn (top now {top})', {
          speed: Math.round(ship.speed / KNOT),
          top: knots(ship.topSpeed),
        });
      }),
    },
    { id: 'fps', label: 'FPS', onScreen: true, create: fps },
  ];
}

/** The settings' controls, in the order they are shown, each in its group */
export function hudControls(actions: HudActions): readonly HudControl[] {
  return [
    {
      id: 'language',
      group: 'Game',
      label: 'Language',
      create: () => {
        const select = new Select(
          LANGS.map(({ id, name }) => ({ key: id, label: name })),
          LANGUAGE_WIDTH,
          actions.setLanguage,
        );
        return { container: select.container, update: () => select.show(lang()), fold: () => select.fold() };
      },
    },
    {
      id: 'layout',
      group: 'Game',
      label: 'Layout',
      create: () => {
        const note = new Text({
          text: t('drag the panels on the screen where you like, then save'),
          style: VALUE_STYLE,
        });
        const row = new ButtonRow([{ label: t('Edit'), key: null, onTap: actions.editLayout }]);
        return control([row], note, () => {});
      },
    },
    {
      id: 'sound',
      group: 'Game',
      label: 'Sound',
      // On or off, then the volume down and up
      create: () => {
        const on = new Checkbox(t('On'), actions.toggleSound);
        const row = new ButtonRow([
          { label: '−', key: null, onTap: () => actions.changeVolume(-1) },
          { label: '+', key: null, onTap: () => actions.changeVolume(1) },
        ]);
        const volume = new Text({ text: ' ', style: VALUE_STYLE });
        return control([on, row], volume, ({ view: { sound } }) => {
          on.setChecked(sound.enabled);
          show(volume, sound.enabled ? t('Volume {volume}%', { volume: Math.round(sound.volume * 100) }) : t('Muted'));
        });
      },
    },
    {
      id: 'zoom',
      group: 'Game',
      label: 'Zoom',
      create: () => {
        const row = new ButtonRow(
          ZOOM_LEVELS.map((level) => ({ label: `×${level}`, key: level, onTap: () => actions.setZoom(level) })),
        );
        return control([row], null, ({ view }) => row.setActive(view.zoom));
      },
    },
    {
      id: 'range',
      group: 'Game',
      label: 'Range',
      // The rings follow the weapon picked, in its colour
      create: () => {
        const box = new Checkbox(t('Show'), actions.toggleRanges);
        return control([box], null, ({ view }) => box.setChecked(view.ranges));
      },
    },
    {
      id: 'damage',
      group: 'Ship tuning',
      label: 'Damage',
      create: () => {
        const panel = new DamagePanel(actions, CONTROL_WIDTH);
        return control([panel], null, ({ state }) => panel.update(state.ship.damageStage));
      },
    },
    {
      id: 'maxSpeed',
      group: 'Ship tuning',
      label: 'Max speed',
      create: stepper(actions.changeMaxSpeed, KNOT, ({ state }) =>
        t('{speed} kn, intact', { speed: knots(state.ship.maxSpeed) }),
      ),
    },
    {
      id: 'minSpeed',
      group: 'Ship tuning',
      label: 'Min speed',
      create: stepper(actions.changeMinSpeed, KNOT, ({ state }) =>
        t('{speed} kn, nearly wrecked', { speed: knots(state.ship.minSpeed) }),
      ),
    },
    {
      id: 'view',
      group: 'Ship tuning',
      label: 'View',
      create: stepper(actions.changeViewRange, VIEW_STEP, ({ state }) =>
        t('{range}, fog beyond', { range: Math.round(state.ship.viewRange) }),
      ),
    },
    {
      id: 'gold',
      group: 'Debug',
      label: 'Gold',
      create: () =>
        buttons(
          new ButtonRow(
            DEBUG_GOLD.map((amount) => ({ label: `+${amount}`, key: null, onTap: () => actions.addGold(amount) })),
          ),
          ({ state }) => t('{gold}, for testing the shop', { gold: state.player.gold }),
        ),
    },
    {
      id: 'doubloons',
      group: 'Debug',
      label: 'Doubloons',
      create: () =>
        buttons(
          new ButtonRow(
            DEBUG_DOUBLOONS.map((amount) => ({
              label: `+${amount}`,
              key: null,
              onTap: () => actions.addDoubloons(amount),
            })),
          ),
          ({ state }) => t('{n}, for testing the mastery', { n: state.player.doubloons }),
        ),
    },
    {
      id: 'level',
      group: 'Debug',
      label: 'Level',
      create: () =>
        buttons(
          new ButtonRow([
            { label: '−1', key: null, onTap: () => actions.changeLevel(-1) },
            { label: '+1', key: null, onTap: () => actions.changeLevel(1) },
          ]),
          ({ state: { ship } }) => t('{level} of {max}', { level: ship.level, max: ship.shipClass.maxLevel }),
        ),
    },
    {
      id: 'story',
      group: 'Debug',
      label: 'Story',
      create: () =>
        buttons(new ButtonRow([{ label: t('Skip step'), key: null, onTap: actions.skipStory }]), ({ state }) => {
          const step = storyStep(state.player);
          return step ? t(step.title) : t('told to its end');
        }),
    },
    {
      id: 'newGame',
      group: 'Debug',
      label: 'Progress',
      create: () => {
        const note = new Text({ text: t('forgets the gold, guns, quests and settings'), style: VALUE_STYLE });
        const row = new ButtonRow([{ label: t('New game'), key: null, onTap: actions.newGame }]);
        return control([row], note, () => {});
      },
    },
    {
      id: 'navDebug',
      group: 'Debug',
      label: 'Navigation',
      create: () => {
        const row = new ButtonRow(
          NAV_DEBUG.map((kind) => ({
            label: t(DEBUG_LABELS[kind]),
            key: kind,
            onTap: () => actions.toggleDebug(kind),
          })),
        );
        return control([row], null, ({ view }) => row.setPressed((kind) => view.debug[kind]));
      },
    },
  ];
}
