import { Container, Text } from 'pixi.js';
import {
  AMMO,
  AMMO_IDS,
  GUNS,
  GUN_IDS,
  OFF_TARGET_SHARE,
  WEAPONS,
  WEAPON_IDS,
  gunDamage,
  type AmmoId,
  type GameState,
  type GunId,
  type HoldReason,
  type Ship,
  type ShipClass,
  type Target,
  type TargetKind,
  type WeaponId,
} from '../../game';
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
const NOTE_STYLE = { ...LABEL_STYLE, fill: 0xb8dcef };
// Camera zoom levels, as multiples of the default zoom
const ZOOM_LEVELS: readonly number[] = [1, 1.5, 2, 3];
const CAMERA_LABELS: Readonly<Record<CameraMode, string>> = {
  follow: 'Follow',
  deadZone: 'Dead zone',
  recenter: 'Recenter',
};
const FOG_LABELS: Readonly<Record<FogLayer, string>> = { mist: 'Mist', clouds: 'Clouds' };
const DEBUG_LABELS: Readonly<Record<NavDebug, string>> = { route: 'Route', hulls: 'Hulls and coasts' };
const TARGET_NAMES: Readonly<Record<TargetKind, string>> = { barrel: 'Barrel', boat: 'Boat', serpent: 'Sea serpent' };
// Gun and ammo levels on the loadout buttons
const LEVELS = ['I', 'II', 'III', 'IV', 'V'];
const AMMO_STEP = 10; // shots the loadout's + button puts in the hold
const SLOT_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannon', harpoon: 'Harpoon gun' };
const AMMO_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannonballs', harpoon: 'Harpoons' };
const KIND_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'cannon', harpoon: 'harpoon' };
const NATURE_NAMES = { creature: 'creatures', object: 'ships and objects' } as const;
const KNOT = 10; // world units per second: the HUD shows speed in knots, a tenth of the game's units
const VIEW_STEP = 50; // world units, for the view range buttons
const VALUE_GAP = 10; // pixels between a row's buttons and what comes after them

export interface HudActions extends DamageActions {
  /** Stops firing at the target */
  ceaseFire: () => void;
  /** Fits a gun into one of its weapon's slots, or empties the slot (null). For testing; bought later */
  fitGun: (weapon: WeaponId, slot: number, gun: GunId | null) => void;
  /** Picks the ammo its weapon fires */
  loadAmmo: (ammo: AmmoId) => void;
  /** Puts ammo in the hold. For testing; bought later */
  addAmmo: (ammo: AmmoId, count: number) => void;
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

export const HUD_GROUPS = ['Info', 'Camera', 'World', 'Combat', 'Loadout', 'Ship tuning', 'Debug'] as const;
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

/** What the player is told when the ship holds fire, and what to do about it */
const HOLD_MESSAGES: Readonly<Record<HoldReason, (ship: Ship) => string>> = {
  noGuns: (ship) => `No ${WEAPONS[ship.weapon].name.toLowerCase()} fitted: fit some in Settings → Loadout`,
  noAmmo: (ship) => `Out of ${AMMO[ship.loaded[ship.weapon]].name}: load other ammo or add some in Settings → Loadout`,
  sight: () => 'Target hidden in the fog: sail closer',
  range: (ship) => `Target beyond ${KIND_NAMES[ship.weapon]} range: sail closer`,
};

function attacked(state: GameState): Target | undefined {
  const { ship } = state;
  return ship.attackTarget === null ? undefined : state.targets.find((t) => t.id === ship.attackTarget);
}

/** The selected weapon's guns, ammo and reload; why the ship isn't firing, or that it does little to this target */
function weaponStatus(): HudWidget {
  const container = new Container();
  const status = new Text({ text: '', style: LABEL_STYLE });
  const alert = new Text({ text: '', style: ALERT_STYLE });
  const note = new Text({ text: '', style: NOTE_STYLE });
  alert.y = 22;
  note.y = 22;
  container.addChild(status, alert, note);
  return {
    container,
    update: ({ state }) => {
      const { ship } = state;
      const weapon = WEAPONS[ship.weapon];
      const guns = ship.guns[ship.weapon].filter((gun) => gun !== null).length;
      const ammo = AMMO[ship.loaded[ship.weapon]];
      const reload = ship.reloads[ship.weapon];
      const loaded = reload > 0 ? `reloading ${reload.toFixed(1)} s` : 'ready';
      const target = attacked(state);
      const aim = target ? `   Firing at: ${TARGET_NAMES[target.kind]} ${target.hp}/${target.maxHp}` : '';
      show(status, `${weapon.name} ×${guns}, ${ammo.name} ×${ship.ammo[ammo.id]}: ${loaded}${aim}`);
      show(alert, target && ship.holdReason ? HOLD_MESSAGES[ship.holdReason](ship) : '');
      // Firing, but with the wrong weapon for it: the player should know it does a fraction of the damage
      const weak = target && !ship.holdReason && weapon.against !== target.nature;
      const better = WEAPON_IDS.find((id) => target && WEAPONS[id].against === target.nature);
      show(
        note,
        weak && better
          ? `${weapon.name} do ${OFF_TARGET_SHARE * 100}% to ${NATURE_NAMES[target.nature]}: ${WEAPONS[better].name} do it all`
          : '',
      );
    },
  };
}

/** What one gun does a shot with this ammo: nothing on a 1, roll + bonus, or a critical hit on the die's top */
function gunSpread(gun: GunId, ammo: AmmoId) {
  const { die } = GUNS[gun];
  const { bonus } = AMMO[ammo];
  return `0 · ${gunDamage(2, die, bonus)}–${gunDamage(die - 1, die, bonus)} · crit ${gunDamage(die, die, bonus)}`;
}

/** The loadout's controls for one weapon: a row per slot (with what its gun does a shot), then the ammo */
function loadoutItems(actions: HudActions, shipClass: ShipClass): HudItem[] {
  return WEAPON_IDS.flatMap((weapon): HudItem[] => {
    const slots = shipClass.slots[weapon].map((_, slot): HudItem => ({
      id: `slot-${weapon}-${slot}`,
      group: 'Loadout',
      label: `${SLOT_NAMES[weapon]} ${slot + 1}`,
      kind: 'control',
      onScreen: false,
      create: () => {
        const row = new ButtonRow<GunId | 'empty'>([
          { label: 'Empty', key: 'empty', onTap: () => actions.fitGun(weapon, slot, null) },
          ...GUN_IDS[weapon].map((gun) => ({
            label: LEVELS[GUNS[gun].level - 1],
            key: gun,
            onTap: () => actions.fitGun(weapon, slot, gun),
          })),
        ]);
        const name = new Text({ text: ' ', style: LABEL_STYLE });
        return control(row, name, ({ state: { ship } }) => {
          const gun = ship.guns[weapon][slot] ?? null;
          row.setActive(gun ?? 'empty');
          show(name, gun ? `${GUNS[gun].name} (1–${GUNS[gun].die}): ${gunSpread(gun, ship.loaded[weapon])}` : 'empty');
        });
      },
    }));
    const ammo: HudItem = {
      id: `ammo-${weapon}`,
      group: 'Loadout',
      label: AMMO_NAMES[weapon],
      kind: 'control',
      onScreen: false,
      create: () => {
        // Holds the loaded ammo's id for the + button, set every frame from the ship
        let current: AmmoId = AMMO_IDS[weapon][0];
        const row = new ButtonRow<AmmoId>([
          ...AMMO_IDS[weapon].map((id) => ({
            label: LEVELS[AMMO[id].level - 1],
            key: id,
            onTap: () => actions.loadAmmo(id),
          })),
          { label: `+${AMMO_STEP}`, key: null, onTap: () => actions.addAmmo(current, AMMO_STEP) },
        ]);
        const stock = new Text({ text: ' ', style: LABEL_STYLE });
        return control(row, stock, ({ state: { ship } }) => {
          current = ship.loaded[weapon];
          row.setActive(current);
          const counts = AMMO_IDS[weapon].map((id) => `${LEVELS[AMMO[id].level - 1]} ×${ship.ammo[id]}`);
          show(stock, `${counts.join('  ')}   (+${AMMO[current].bonus} each)`);
        });
      },
    };
    return [...slots, ammo];
  });
}

function fps(): HudWidget {
  const text = new Text({ text: 'FPS: …', style: TEXT_STYLE });
  const meter = new FpsMeter(text);
  return { container: text, update: ({ frameMs }) => meter.update(frameMs) };
}

/** Everything the HUD can show, in the order it is shown on the screen; the settings panel groups them */
export function hudItems(actions: HudActions, shipClass: ShipClass): readonly HudItem[] {
  return [
    {
      id: 'help',
      group: 'Info',
      label: 'Help',
      kind: 'metric',
      onScreen: true,
      create: metric(
        { ...TEXT_STYLE, fontSize: 13 },
        () => 'Click on the sea to sail. Click a target to fire at it; click it again or press Esc to stop',
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
      onScreen: true,
      create: metric(TEXT_STYLE, ({ state: { ship } }) => {
        return `Hull: ${ship.hp}/${ship.maxHp} (${Math.round(ship.health)}%, ${ship.damageStage})`;
      }),
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
    ...loadoutItems(actions, shipClass),
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
      label: 'Weapon status',
      kind: 'metric',
      onScreen: true,
      create: weaponStatus,
    },
  ];
}
