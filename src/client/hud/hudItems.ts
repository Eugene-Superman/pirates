import { Container, Text } from 'pixi.js';
import { WEAPONS, WEAPON_IDS, type GameState, type TargetKind, type WeaponId } from '../../game';
import { CAMERA_MODES, type CameraMode } from '../scene/cameraControl';
import { FOG_LAYERS, type FogLayer } from '../scene/effects/fogOfWar';
import { NAV_DEBUG, type NavDebug } from '../scene/effects/navDebug';
import { SEA_STYLES } from '../scene/effects/seaStyles';
import { ISLAND_LOOKS } from '../scene/models/IslandSprites';
import { ButtonRow } from './ButtonRow';
import { Checkbox } from './Checkbox';
import { DamagePanel, type DamageActions } from './DamagePanel';
import { FpsMeter } from './FpsMeter';

export const TEXT_STYLE = {
  fontFamily: 'Arial',
  fontSize: 16,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
};
export const LABEL_STYLE = { ...TEXT_STYLE, fontSize: 14 };
const ALERT_STYLE = { ...LABEL_STYLE, fill: 0xffb347 };
// Camera zoom levels, as multiples of the default zoom
const ZOOM_LEVELS: readonly number[] = [1, 1.5, 2, 3];
const CAMERA_LABELS: Readonly<Record<CameraMode, string>> = {
  follow: 'Follow',
  deadZone: 'Dead zone',
  recenter: 'Recenter',
};
const FOG_LABELS: Readonly<Record<FogLayer, string>> = { mist: 'Mist', clouds: 'Clouds' };
const DEBUG_LABELS: Readonly<Record<NavDebug, string>> = { route: 'Route', hulls: 'Hulls and coasts' };
const TARGET_LABELS: Readonly<Record<TargetKind, string>> = { barrel: 'barrel', boat: 'boat' };
const KNOT = 10; // world units per second: the HUD shows speed in knots, a tenth of the game's units
const VIEW_STEP = 50; // world units, for the view range buttons
const ALERT_TIME = 1.5; // seconds the "held fire" warning stays up
const VALUE_GAP = 10; // pixels between a row's buttons and what comes after them

export interface HudActions extends DamageActions {
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

export const HUD_GROUPS = ['Info', 'Camera', 'World', 'Combat', 'Ship tuning', 'Debug'] as const;
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

/** Assigning Text.text re-renders its texture, so only on change */
function show(text: Text, value: string) {
  if (text.text !== value) text.text = value;
}

function knots(speed: number) {
  return (speed / KNOT).toFixed(1).replace(/\.0$/, '');
}

function metric(style: typeof TEXT_STYLE, value: (frame: HudFrame) => string): () => HudWidget {
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

function weaponStatus(): HudWidget {
  const container = new Container();
  const status = new Text({ text: '', style: LABEL_STYLE });
  const alert = new Text({ text: '', style: ALERT_STYLE });
  alert.y = 22;
  container.addChild(status, alert);
  /** Game time until which the "held fire" warning is shown, and the warning */
  let alertUntil = -Infinity;
  let message = '';
  return {
    container,
    update: ({ state }) => {
      const { ship } = state;
      const reload = ship.reloads[ship.weapon];
      const loaded = reload > 0 ? `reloading ${reload.toFixed(1)} s` : 'ready';
      const hits = state.targets.map((t) => `${TARGET_LABELS[t.kind]} ${t.hits}`).join(', ');
      show(status, `${WEAPONS[ship.weapon].name}: ${loaded}   Hits: ${hits}`);
      for (const e of state.events) {
        if (e.type !== 'holdFire') continue;
        message = e.reason === 'range' ? 'Target out of range' : 'Target hidden in the fog';
        alertUntil = state.time + ALERT_TIME;
      }
      show(alert, state.time < alertUntil ? message : '');
    },
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
      create: metric({ ...TEXT_STYLE, fontSize: 13 }, () => 'Click on the sea to sail, click a target to fire'),
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
      onScreen: true,
      create: metric(TEXT_STYLE, ({ state: { ship } }) => `Hull: ${Math.round(ship.health)}% (${ship.damageStage})`),
    },
    { id: 'fps', group: 'Info', label: 'FPS', kind: 'metric', onScreen: true, create: fps },
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
      onScreen: true,
      create: () => {
        const row = new ButtonRow(
          WEAPON_IDS.map((id) => ({ label: WEAPONS[id].name, key: id, onTap: () => actions.setWeapon(id) })),
        );
        return control(row, null, ({ state }) => row.setActive(state.ship.weapon));
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
    // Last on the screen: under the controls, where the warning about held fire shows
    {
      id: 'weaponStatus',
      group: 'Info',
      label: 'Weapon and hits',
      kind: 'metric',
      onScreen: true,
      create: weaponStatus,
    },
  ];
}
