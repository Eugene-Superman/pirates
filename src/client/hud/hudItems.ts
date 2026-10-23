import { Container, Text, type TextStyleOptions } from 'pixi.js';
import { WEAPONS, WEAPON_IDS, type GameState, type WeaponId } from '../../game';
import type { SoundSettings } from '../audio/Sounds';
import { CAMERA_MODES, type CameraMode } from '../scene/cameraControl';
import { FOG_LAYERS, type FogLayer } from '../scene/effects/fogOfWar';
import { NAV_DEBUG, type NavDebug } from '../scene/effects/navDebug';
import { SEA_STYLES } from '../scene/effects/seaStyles';
import { ISLAND_LOOKS } from '../scene/models/IslandSprites';
import { ButtonRow } from './ButtonRow';
import { Checkbox } from './Checkbox';
import { DamagePanel, type DamageActions } from './DamagePanel';
import { FpsMeter } from './FpsMeter';
import type { LoadoutActions } from './LoadoutPanel';
import { show } from './ui';

export const TEXT_STYLE = {
  fontFamily: 'Arial',
  fontSize: 16,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
};
export const LABEL_STYLE = { ...TEXT_STYLE, fontSize: 14 };
// Camera zoom levels, as multiples of the default zoom
const ZOOM_LEVELS: readonly number[] = [1, 1.5, 2, 3];
const CAMERA_LABELS: Readonly<Record<CameraMode, string>> = {
  follow: 'Follow',
  deadZone: 'Dead zone',
  recenter: 'Recenter',
};
const FOG_LABELS: Readonly<Record<FogLayer, string>> = { mist: 'Mist', clouds: 'Clouds' };
const DEBUG_LABELS: Readonly<Record<NavDebug, string>> = { route: 'Route', hulls: 'Hulls and coasts' };
const HELP_WIDTH = 360; // pixels: the help wraps, so the column leaves room for the frames at the top
const KNOT = 10; // world units per second: the HUD shows speed in knots, a tenth of the game's units
const VIEW_STEP = 50; // world units, for the view range buttons
const VALUE_GAP = 10; // pixels between a row's buttons and what comes after them

export interface HudActions extends DamageActions, LoadoutActions {
  /** Stops firing at the target */
  ceaseFire: () => void;
  /** Fires at the unit the player picked out, or stops if the ship already does */
  toggleFire: () => void;
  /** Starts the repair skill */
  repair: () => void;
  /** Camera zoom as a multiple of the default one */
  setZoom: (level: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setWeapon: (weapon: WeaponId) => void;
  /** Shows or hides a weapon's range ring */
  toggleRange: (weapon: WeaponId) => void;
  /** Shows or hides the outline of the camera's zone */
  toggleZone: () => void;
  /** Shows or hides a part of the fog of war; the ship sees as far either way */
  toggleFog: (layer: FogLayer) => void;
  /** Picks the look of the sea: an index in SEA_STYLES */
  setSeaStyle: (index: number) => void;
  /** Picks the look of the islands: 0 low-poly, 1… a textured one of ISLAND_LOOKS */
  setIslandLook: (index: number) => void;
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
}

/** What the HUD shows of the view (not the game): set by SceneView */
export interface ViewStatus {
  zoom: number;
  cameraMode: CameraMode;
  ranges: Readonly<Record<WeaponId, boolean>>;
  zoneShown: boolean;
  /** The camera's zone on the screen, pixels; null when the camera mode has none */
  zoneBox: { x: number; y: number; width: number; height: number } | null;
  fog: Readonly<Record<FogLayer, boolean>>;
  seaStyle: number;
  islandLook: number;
  debug: Readonly<Record<NavDebug, boolean>>;
  sound: SoundSettings;
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
}

export const HUD_GROUPS = ['Info', 'Sound', 'Camera', 'World', 'Combat', 'Ship tuning', 'Debug'] as const;
export type HudGroup = (typeof HUD_GROUPS)[number];

/**
 * One thing the HUD can show: a metric (text) or a control (a row of buttons). Each is defined once here and made as
 * many times as it is shown: on the screen, and as a control in the settings panel too
 */
export interface HudItem {
  readonly id: string;
  readonly group: HudGroup;
  readonly label: string;
  readonly kind: 'metric' | 'control';
  /** On the screen until the settings say otherwise */
  readonly onScreen: boolean;
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

/** A row of buttons, maybe followed by something: a value, a checkbox */
function control(row: { readonly container: Container }, after: Container | null, update: (frame: HudFrame) => void) {
  const container = new Container();
  container.addChild(row.container);
  if (after) {
    after.position.set(row.container.width + VALUE_GAP, (ButtonRow.HEIGHT - after.height) / 2);
    container.addChild(after);
  }
  return { container, update };
}

/** − and + buttons that change a value by a step, then the value */
function stepper(change: (delta: number) => void, step: number, value: (frame: HudFrame) => string) {
  return () => {
    // Not empty: the row centres it by its height
    const text = new Text({ text: ' ', style: LABEL_STYLE });
    const row = new ButtonRow([
      { label: '−', key: null, onTap: () => change(-step) },
      { label: '+', key: null, onTap: () => change(step) },
    ]);
    return control(row, text, (frame) => show(text, value(frame)));
  };
}

function fps(): HudWidget {
  const text = new Text({ text: 'FPS: …', style: TEXT_STYLE });
  const meter = new FpsMeter(text);
  return { container: text, update: ({ frameMs }) => meter.update(frameMs) };
}

/** Everything the HUD can show, in the order it is shown on the screen; the settings panel groups them */
export function hudItems(actions: HudActions): readonly HudItem[] {
  return [
    {
      id: 'help',
      group: 'Info',
      label: 'Help',
      kind: 'metric',
      onScreen: true,
      create: metric(
        { ...TEXT_STYLE, fontSize: 13, wordWrap: true, wordWrapWidth: HELP_WIDTH },
        () =>
          'Click the sea to sail · click a ship or a monster to pick it, double-click or Space to fire, Esc to stop',
      ),
    },
    {
      id: 'speed',
      group: 'Info',
      label: 'Speed',
      kind: 'metric',
      onScreen: true,
      // Whole knots for the current speed: it changes every frame while the ship speeds up
      create: metric(TEXT_STYLE, ({ state: { ship } }) => {
        return `Speed: ${Math.round(ship.speed / KNOT)} kn (top now ${knots(ship.topSpeed)})`;
      }),
    },
    {
      id: 'hull',
      group: 'Info',
      label: 'Hull',
      kind: 'metric',
      // The frame at the top shows it
      onScreen: false,
      create: metric(TEXT_STYLE, ({ state: { ship } }) => {
        return `Hull: ${ship.hp}/${ship.maxHp} (${Math.round(ship.health)}%, ${ship.damageStage})`;
      }),
    },
    { id: 'fps', group: 'Info', label: 'FPS', kind: 'metric', onScreen: true, create: fps },
    {
      id: 'sound',
      group: 'Sound',
      label: 'Sound',
      kind: 'control',
      onScreen: true,
      // On/off (lit while on), then the volume down and up
      create: () => {
        const row = new ButtonRow<'on'>([
          { label: 'On', key: 'on', onTap: actions.toggleSound },
          { label: '−', key: null, onTap: () => actions.changeVolume(-1) },
          { label: '+', key: null, onTap: () => actions.changeVolume(1) },
        ]);
        const volume = new Text({ text: ' ', style: LABEL_STYLE });
        return control(row, volume, ({ view: { sound } }) => {
          row.setActive(sound.enabled ? 'on' : null);
          show(volume, sound.enabled ? `Volume ${Math.round(sound.volume * 100)}%` : 'Muted');
        });
      },
    },
    {
      id: 'zoom',
      group: 'Camera',
      label: 'Zoom',
      kind: 'control',
      onScreen: false,
      create: () => {
        const row = new ButtonRow(
          ZOOM_LEVELS.map((level) => ({ label: `×${level}`, key: level, onTap: () => actions.setZoom(level) })),
        );
        return control(row, null, ({ view }) => row.setActive(view.zoom));
      },
    },
    {
      id: 'camera',
      group: 'Camera',
      label: 'Camera',
      kind: 'control',
      onScreen: false,
      create: () => {
        const row = new ButtonRow(
          CAMERA_MODES.map((mode) => ({
            label: CAMERA_LABELS[mode],
            key: mode,
            onTap: () => actions.setCameraMode(mode),
          })),
        );
        const zone = new Checkbox('Show zone', actions.toggleZone);
        return control(row, zone.container, ({ view }) => {
          row.setActive(view.cameraMode);
          zone.setChecked(view.zoneShown);
        });
      },
    },
    {
      id: 'sea',
      group: 'World',
      label: 'Sea',
      kind: 'control',
      onScreen: false,
      create: () => {
        const row = new ButtonRow(
          SEA_STYLES.map((_, index) => ({
            label: `${index + 1}`,
            key: index,
            onTap: () => actions.setSeaStyle(index),
          })),
        );
        const name = new Text({ text: ' ', style: LABEL_STYLE });
        return control(row, name, ({ view }) => {
          row.setActive(view.seaStyle);
          show(name, SEA_STYLES[view.seaStyle]?.name ?? '');
        });
      },
    },
    {
      id: 'islands',
      group: 'World',
      label: 'Islands',
      kind: 'control',
      onScreen: false,
      create: () => {
        const looks = ['Low poly', ...ISLAND_LOOKS.map((look) => look.name)];
        const row = new ButtonRow(
          looks.map((name, index) => ({
            label: index === 0 ? name : `${index}`,
            key: index,
            onTap: () => actions.setIslandLook(index),
          })),
        );
        const name = new Text({ text: ' ', style: LABEL_STYLE });
        return control(row, name, ({ view }) => {
          row.setActive(view.islandLook);
          show(name, view.islandLook > 0 ? (looks[view.islandLook] ?? '') : '');
        });
      },
    },
    {
      id: 'fog',
      group: 'World',
      label: 'Fog',
      kind: 'control',
      onScreen: false,
      create: () => {
        const row = new ButtonRow(
          FOG_LAYERS.map((layer) => ({ label: FOG_LABELS[layer], key: layer, onTap: () => actions.toggleFog(layer) })),
        );
        return control(row, null, ({ view }) => row.setPressed((layer) => view.fog[layer]));
      },
    },
    {
      id: 'weapon',
      group: 'Combat',
      label: 'Weapon',
      kind: 'control',
      // The skill bar picks the weapon too
      onScreen: false,
      // The weapon to fire, and a button to stop firing (lit while the ship has a target)
      create: () => {
        const row = new ButtonRow<WeaponId | 'fire'>([
          ...WEAPON_IDS.map((id) => ({ label: WEAPONS[id].name, key: id, onTap: () => actions.setWeapon(id) })),
          { label: 'Cease fire', key: 'fire', onTap: actions.ceaseFire },
        ]);
        return control(row, null, ({ state: { ship } }) => {
          row.setPressed((key) => key === ship.weapon || (key === 'fire' && ship.attackTarget !== null));
        });
      },
    },
    {
      id: 'range',
      group: 'Combat',
      label: 'Range',
      kind: 'control',
      onScreen: false,
      create: () => {
        const row = new ButtonRow(
          WEAPON_IDS.map((id) => ({ label: WEAPONS[id].name, key: id, onTap: () => actions.toggleRange(id) })),
        );
        return control(row, null, ({ view }) => row.setPressed((id) => view.ranges[id]));
      },
    },
    {
      id: 'damage',
      group: 'Ship tuning',
      label: 'Damage',
      kind: 'control',
      onScreen: false,
      create: () => {
        const panel = new DamagePanel(actions);
        return control(panel, null, ({ state }) => panel.update(state.ship.damageStage));
      },
    },
    {
      id: 'maxSpeed',
      group: 'Ship tuning',
      label: 'Max speed',
      kind: 'control',
      onScreen: false,
      create: stepper(actions.changeMaxSpeed, KNOT, ({ state }) => `${knots(state.ship.maxSpeed)} kn, intact`),
    },
    {
      id: 'minSpeed',
      group: 'Ship tuning',
      label: 'Min speed',
      kind: 'control',
      onScreen: false,
      create: stepper(actions.changeMinSpeed, KNOT, ({ state }) => `${knots(state.ship.minSpeed)} kn, nearly wrecked`),
    },
    {
      id: 'view',
      group: 'Ship tuning',
      label: 'View',
      kind: 'control',
      onScreen: false,
      create: stepper(
        actions.changeViewRange,
        VIEW_STEP,
        ({ state }) => `${Math.round(state.ship.viewRange)}, fog beyond`,
      ),
    },
    {
      id: 'navDebug',
      group: 'Debug',
      label: 'Navigation',
      kind: 'control',
      onScreen: false,
      create: () => {
        const row = new ButtonRow(
          NAV_DEBUG.map((kind) => ({ label: DEBUG_LABELS[kind], key: kind, onTap: () => actions.toggleDebug(kind) })),
        );
        return control(row, null, ({ view }) => row.setPressed((kind) => view.debug[kind]));
      },
    },
  ];
}
