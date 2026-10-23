import { Container, Graphics, type Rectangle, Text } from 'pixi.js';
import type { GameState, ShipClass } from '../../game';
import type { Selection } from '../input/selection';
import type { Slot } from '../storage/Store';
import { ButtonRow } from './ButtonRow';
import type { MapAxes } from './chart';
import { CombatLogPanel } from './CombatLogPanel';
import { GoldPanel } from './GoldPanel';
import { LABEL_STYLE, hudItems, type HudActions, type HudItem, type HudWidget, type ViewStatus } from './hudItems';
import { LoadoutPanel } from './LoadoutPanel';
import { Minimap } from './Minimap';
import { PortScreen, type PortActions } from './PortScreen';
import { SeaChart } from './SeaChart';
import { SettingsPanel } from './SettingsPanel';
import { SkillBar } from './SkillBar';
import { UnitFrames } from './UnitFrames';

export type { MapAxes } from './chart';
export type { PortActions } from './PortScreen';
export type { HudActions, ViewStatus } from './hudItems';

const MARGIN = 16; // pixels from the screen's edge
const METRIC_GAP = 6; // pixels under a line of text
const ROW_GAP = 8; // pixels between the button rows
const LABEL_WIDTH = 84; // pixels: the button rows start after their labels, lined up
const FRAMES_GAP = 24; // pixels between the column and the frames at the top
const FRAMES_HEIGHT = 80; // pixels: the frames at the top, the target's the taller
const ZONE_COLOR = 0xffffff;
const ZONE_ALPHA = 0.55;
const ZONE_WIDTH = 2; // pixels

interface Shown {
  readonly widget: HudWidget;
  readonly label: Text | null;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : null;
}

/**
 * The items on the screen as last saved, plus items added to the game since (not among the saved `known` ones) that
 * are on the screen by default. An old save is a bare list of the shown ones
 */
function loadShown(items: readonly HudItem[], saved: unknown) {
  const defaults = items.filter((item) => item.onScreen).map((item) => item.id);
  const old = strings(saved);
  if (old) return new Set(old);
  if (typeof saved === 'object' && saved !== null && 'shown' in saved && 'known' in saved) {
    const shown = strings(saved.shown) ?? [];
    const known = new Set(strings(saved.known) ?? []);
    return new Set([...shown, ...defaults.filter((id) => !known.has(id))]);
  }
  return new Set(defaults);
}

function saveShown(items: readonly HudItem[], ids: ReadonlySet<string>, kept: Slot) {
  kept.set({ shown: [...ids], known: items.map((item) => item.id) });
}

/**
 * Screen-space overlay: in the top left corner the items picked in the settings panel, stacked under its button; at
 * the top the frames of the player's ship and the unit they picked out; at the bottom the skill bar, the combat log
 * on its left and the minimap on its right; and the loadout window or the sea chart over everything when open
 */
export class Hud {
  readonly container = new Container();
  private readonly items: readonly HudItem[];
  private readonly shownIds: Set<string>;
  /** Made the first time an item is shown, then only hidden */
  private readonly onScreen = new Map<string, Shown>();
  private readonly column = new Container();
  private readonly settingsButton: ButtonRow<null>;
  private readonly settings: SettingsPanel;
  /** The camera's zone, outlined across the screen behind the HUD's buttons */
  private readonly zoneOutline = new Graphics();
  private readonly frames: UnitFrames;
  private readonly skills: SkillBar;
  private readonly loadout: LoadoutPanel;
  private readonly log: CombatLogPanel;
  /** Where the items on the screen are kept between visits */
  private readonly keptItems: Slot;
  private readonly minimap: Minimap;
  private readonly chart: SeaChart;
  private readonly gold = new GoldPanel();
  private readonly port: PortScreen;
  private readonly screen: Rectangle;
  /** Height of the shown items when last laid out, and where the last of them ends on the screen */
  private columnHeight = 0;
  private columnBottom = 0;

  /**
   * shipClass: the player's ship's, for its gun slots; axes: how the camera turns the world, for the maps; port: what
   * the port's menus do, and the port's name
   */
  constructor(
    actions: HudActions,
    screen: Rectangle,
    shipClass: ShipClass,
    axes: MapAxes,
    port: { readonly actions: PortActions; readonly name: string },
    kept: { readonly hud: Slot; readonly log: Slot },
  ) {
    this.keptItems = kept.hud;
    this.log = new CombatLogPanel(kept.log);
    this.screen = screen;
    this.items = hudItems(actions);
    this.shownIds = loadShown(this.items, kept.hud.get());
    this.settings = new SettingsPanel(
      this.items,
      (id) => this.shownIds.has(id),
      (id) => this.toggle(id),
      screen,
    );
    this.settingsButton = new ButtonRow([{ label: 'Settings', key: null, onTap: () => this.settings.toggle() }]);
    this.settingsButton.container.position.set(MARGIN, MARGIN);
    this.frames = new UnitFrames(actions.toggleFire);
    this.loadout = new LoadoutPanel(actions, screen, shipClass);
    this.chart = new SeaChart(axes, screen);
    // Made before the keyboard is bound: its Escape (leave port) goes before the one at sea
    this.port = new PortScreen(port.actions, screen, port.name);
    this.minimap = new Minimap(axes, () => this.toggleMap());
    this.skills = new SkillBar({
      repair: actions.repair,
      setWeapon: actions.setWeapon,
      loadAmmo: actions.loadAmmo,
      toggleLoadout: () => this.toggleLoadout(),
    });
    this.container.addChild(
      this.zoneOutline,
      this.column,
      this.frames.container,
      this.skills.container,
      this.log.container,
      this.minimap.container,
      this.gold.container,
      this.settingsButton.container,
      this.settings.container,
      this.port.container,
      this.loadout.container,
      this.chart.container,
    );
    this.layout();
  }

  /** Opens or closes the loadout window */
  toggleLoadout() {
    this.loadout.toggle();
  }

  /** Keeps what the HUD keeps between visits that changes as the game goes on: the combat log */
  keep() {
    this.log.keep();
  }

  /** Opens or closes the combat log */
  toggleLog() {
    this.log.toggle();
  }

  /** Opens or closes the sea chart */
  toggleMap() {
    this.chart.toggle();
  }

  update(state: GameState, frameMs: number, view: ViewStatus, selection: Selection) {
    const { screen } = this;
    this.frames.layout(screen.width, MARGIN + this.column.width + FRAMES_GAP, MARGIN);
    this.frames.update(state, selection);
    this.skills.update(state, screen.width, screen.height);
    // The open log stays under the column of items in the top left corner, and under the frames
    const top = Math.max(this.columnBottom, MARGIN + FRAMES_HEIGHT + ROW_GAP);
    this.log.update(state, screen.width, screen.height, this.skills.box, top);
    this.minimap.update(state, selection, screen.width, screen.height, this.skills.box);
    this.gold.update(state.player, screen.width);
    this.port.update(state);
    this.loadout.update(state.ship, state.player);
    this.chart.update(state);
    const frame = { state, view, frameMs };
    let column = 0;
    for (const [id, { widget }] of this.onScreen) {
      if (!this.shownIds.has(id)) continue;
      widget.update(frame);
      column += widget.container.height;
    }
    // A text that grew a line (or lost one) moves what is under it
    if (column !== this.columnHeight) {
      this.columnHeight = column;
      this.layout();
    }
    this.settings.update(frame);

    this.zoneOutline.clear();
    if (view.zoneShown && view.zoneBox) {
      const { x, y, width, height } = view.zoneBox;
      this.zoneOutline.rect(x, y, width, height).stroke({ width: ZONE_WIDTH, color: ZONE_COLOR, alpha: ZONE_ALPHA });
    }
  }

  private toggle(id: string) {
    if (!this.shownIds.delete(id)) this.shownIds.add(id);
    saveShown(this.items, this.shownIds, this.keptItems);
    this.layout();
  }

  /** Stacks the shown items under the Settings button: texts as they are, controls after their labels */
  private layout() {
    let y = MARGIN + ButtonRow.HEIGHT + ROW_GAP;
    for (const item of this.items) {
      const shown = this.shownIds.has(item.id);
      const existing = this.onScreen.get(item.id);
      if (!shown) {
        if (existing) {
          existing.widget.container.visible = false;
          if (existing.label) existing.label.visible = false;
        }
        continue;
      }
      const { widget, label } = existing ?? this.show(item);
      widget.container.visible = true;
      if (label) {
        label.visible = true;
        label.position.set(MARGIN, y + (ButtonRow.HEIGHT - label.height) / 2);
        widget.container.position.set(MARGIN + LABEL_WIDTH, y);
        y += ButtonRow.HEIGHT + ROW_GAP;
      } else {
        widget.container.position.set(MARGIN, y);
        y += widget.container.height + METRIC_GAP;
      }
    }
    this.columnBottom = y;
  }

  private show(item: HudItem): Shown {
    const widget = item.create();
    const label = item.kind === 'control' ? new Text({ text: item.label, style: LABEL_STYLE }) : null;
    this.column.addChild(widget.container);
    if (label) this.column.addChild(label);
    const shown = { widget, label };
    this.onScreen.set(item.id, shown);
    return shown;
  }
}
