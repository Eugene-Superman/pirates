import { Container, Graphics, type Rectangle, Text } from 'pixi.js';
import type { GameState, ShipClass } from '../../game';
import type { Selection } from '../input/selection';
import type { Slot } from '../storage/Store';
import { ButtonRow } from './ButtonRow';
import { ChatPanel } from './ChatPanel';
import type { MapAxes } from './chart';
import { ConfirmDialog } from './ConfirmDialog';
import { HoldPanel } from './HoldPanel';
import { LABEL_STYLE, hudItems, type HudActions, type HudItem, type HudWidget, type ViewStatus } from './hudItems';
import { LoadoutPanel } from './LoadoutPanel';
import { MasteryPanel } from './MasteryPanel';
import { TalentButton } from './TalentButton';
import { TalentPanel } from './TalentPanel';
import { StatsPanel } from './StatsPanel';
import { Minimap } from './Minimap';
import { PortScreen, type PortActions } from './PortScreen';
import { QuestTracker } from './QuestTracker';
import { SeaChart } from './SeaChart';
import { SettingsPanel } from './SettingsPanel';
import { SkillBar } from './SkillBar';
import { UnitFrames } from './UnitFrames';
import { t } from '../i18n/i18n';

export type { MapAxes } from './chart';
export type { PortActions } from './PortScreen';
export type { HudActions, ViewStatus } from './hudItems';

const MARGIN = 16; // pixels from the screen's edge
const METRIC_GAP = 6; // pixels under a line of text
const ROW_GAP = 8; // pixels between the button rows
const LABEL_WIDTH = 84; // pixels: the button rows start after their labels, lined up
const FRAMES_GAP = 24; // pixels between the target's plate at the top and what is beside it
// Pixels: the column of items goes under the player's plate
const COLUMN_TOP = MARGIN + UnitFrames.OWN_HEIGHT + ROW_GAP;
const TALENT_GAP = 12; // pixels between the player's plate and the talent button beside it
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
 * Screen-space overlay: in the top left corner the plate of the player's ship with their purse and hold (beside it a
 * button lit while a talent waits to be picked), and under it the items picked in the settings panel; at the top the
 * plate of the unit they picked out; in the top right corner the quest tracker, the quests and the Captain's path; at
 * the bottom the skill bar, the chat on its left (the combat log and the chat's channels, a tab each) and the minimap
 * on its right, the settings and the full screen in its frame's top corners; and the loadout window, the talents, the
 * hold, the captain's mastery (the four of them opened by the buttons on the minimap's frame too), the statistics or
 * the sea chart over everything when open, and over them all a question before a quest is given up
 */
export class Hud {
  readonly container = new Container();
  private readonly items: readonly HudItem[];
  private readonly shownIds: Set<string>;
  /** Made the first time an item is shown, then only hidden */
  private readonly onScreen = new Map<string, Shown>();
  private readonly column = new Container();
  private readonly settings: SettingsPanel;
  /** The camera's zone, outlined across the screen behind the HUD's buttons */
  private readonly zoneOutline = new Graphics();
  private readonly frames: UnitFrames;
  private readonly skills: SkillBar;
  private readonly loadout: LoadoutPanel;
  /** Whether the skill bar is raised over the loadout */
  private barRaised = false;
  private readonly talents: TalentPanel;
  private readonly stats: StatsPanel;
  private readonly hold: HoldPanel;
  private readonly mastery: MasteryPanel;
  private readonly talentButton: TalentButton;
  /** The chat in the bottom left corner, the combat log one of its tabs */
  private readonly chat: ChatPanel;
  /** Where the items on the screen are kept between visits */
  private readonly keptItems: Slot;
  private readonly minimap: Minimap;
  private readonly chart: SeaChart;
  private readonly tracker: QuestTracker;
  /** Asks before what can't be undone: a quest given up, an item sold back in port */
  private readonly confirm: ConfirmDialog;
  private readonly port: PortScreen;
  private readonly screen: Rectangle;
  /** Height of the shown items when last laid out, and where the last of them ends on the screen */
  private columnHeight = 0;
  private columnBottom = 0;

  /**
   * shipClass: the player's ship's, for its share of the talent tree; axes: how the camera turns
   * the world, for the maps; port: what the port's menus do, and the port's name
   */
  constructor(
    actions: HudActions,
    screen: Rectangle,
    shipClass: ShipClass,
    axes: MapAxes,
    port: { readonly actions: PortActions; readonly name: string },
    kept: { readonly hud: Slot; readonly log: Slot; readonly tracker: Slot },
  ) {
    this.keptItems = kept.hud;
    this.chat = new ChatPanel(kept.log);
    this.screen = screen;
    this.items = hudItems(actions);
    this.shownIds = loadShown(this.items, kept.hud.get());
    // The windows hear Escape in the order they are made, each leaving alone one another has taken: so the one on
    // top (the last added below) is made first, and one press closes only it
    this.confirm = new ConfirmDialog(screen);
    this.chart = new SeaChart(axes, screen, port.name);
    this.stats = new StatsPanel(screen);
    this.mastery = new MasteryPanel(screen);
    this.hold = new HoldPanel(actions, screen);
    this.talents = new TalentPanel(actions, screen, shipClass.maxLevel);
    // Ammo dragged out of the loadout drops on the skill bar under it
    this.loadout = new LoadoutPanel(actions, screen, {
      placeAt: (x, y) => this.skills.ammoPlaceAt(x, y),
      showDrop: (weapon) => this.skills.showDrop(weapon),
    });
    // Made before the keyboard is bound: its Escape (leave port) goes before the one at sea
    this.port = new PortScreen(port.actions, screen, port.name, this.confirm);
    this.settings = new SettingsPanel(
      this.items,
      (id) => this.shownIds.has(id),
      (id) => this.toggle(id),
      screen,
    );
    this.frames = new UnitFrames(
      actions.toggleFire,
      () => this.toggleStats(),
      () => this.toggleHold(),
    );
    this.tracker = new QuestTracker(kept.tracker, {
      ask: (question, onYes) => this.confirm.ask(question, onYes),
      dropQuest: actions.dropQuest,
    });
    this.talentButton = new TalentButton(() => this.talents.toggle());
    this.minimap = new Minimap(axes, () => this.toggleMap(), {
      hold: () => this.toggleHold(),
      loadout: () => this.toggleLoadout(),
      talents: () => this.toggleTalents(),
      mastery: () => this.toggleMastery(),
      settings: () => this.settings.toggle(),
    });
    this.skills = new SkillBar({
      repair: actions.repair,
      useAbility: actions.useAbility,
      setWeapon: actions.setWeapon,
      loadAmmo: actions.loadAmmo,
      // The bar is over the open loadout: a click on it must not close it
      openLoadout: () => {
        if (!this.loadout.isOpen) this.toggleLoadout();
      },
    });
    this.container.addChild(
      this.zoneOutline,
      this.column,
      this.frames.container,
      this.talentButton.container,
      this.skills.container,
      this.chat.container,
      this.minimap.container,
      this.tracker.container,
      this.settings.container,
      this.port.container,
      this.loadout.container,
      this.talents.container,
      this.hold.container,
      this.mastery.container,
      this.stats.container,
      this.chart.container,
      this.confirm.container,
      this.loadout.dragLayer,
    );
    this.layout();
  }

  /** Opens or closes the talent tree */
  toggleTalents() {
    this.talents.toggle();
  }

  /** Opens or closes the statistics */
  toggleStats() {
    this.stats.toggle();
  }

  /** Opens or closes the hold */
  toggleHold() {
    this.hold.toggle();
  }

  /** Opens or closes the captain's mastery, the account's tree */
  toggleMastery() {
    this.mastery.toggle();
  }

  /** Opens or closes the loadout window */
  toggleLoadout() {
    this.loadout.toggle();
  }

  /**
   * The skill bar over the loadout's dim while the loadout is open, so ammo can be dragged onto it; back in its place
   * under the windows when it closes
   */
  private raiseBar(raised: boolean) {
    if (raised === this.barRaised) return;
    this.barRaised = raised;
    const bar = this.skills.container;
    this.container.removeChild(bar);
    const under = raised ? this.loadout.container : this.talentButton.container;
    this.container.addChildAt(bar, this.container.getChildIndex(under) + 1);
  }

  /** Keeps what the HUD keeps between visits that changes as the game goes on: the combat log */
  keep() {
    this.chat.keep();
  }

  /** Unfolds the chat on the combat log, or folds it when the log is already shown */
  toggleLog() {
    this.chat.toggleLog();
  }

  /** Opens or closes the sea chart */
  toggleMap() {
    this.chart.toggle();
  }

  update(state: GameState, frameMs: number, view: ViewStatus, selection: Selection) {
    const { screen } = this;
    const talentX = MARGIN + UnitFrames.WIDTH + TALENT_GAP;
    this.talentButton.update(
      state.ship,
      talentX,
      MARGIN + (UnitFrames.SHIP_HEIGHT - TalentButton.HEIGHT) / 2,
      frameMs / 1000,
    );
    // The target's plate keeps clear of the player's, of the column under it, of the talent button when it's lit,
    // and of the tracker on the right
    const ownWidth = this.talentButton.container.visible
      ? talentX - MARGIN + this.talentButton.width
      : UnitFrames.WIDTH;
    const left = MARGIN + Math.max(this.column.width, ownWidth) + FRAMES_GAP;
    this.frames.layout(screen.width, MARGIN, left, screen.width - MARGIN - QuestTracker.WIDTH - FRAMES_GAP);
    this.frames.update(state, selection);
    this.skills.update(state, screen.width, screen.height);
    // The unfolded chat stays under the column of items in the top left corner, and under the plates
    const top = Math.max(this.columnBottom, MARGIN + UnitFrames.TARGET_HEIGHT + ROW_GAP);
    this.chat.update(state, screen.width, screen.height, this.skills.box, top);
    this.minimap.update(state, selection, screen.width, screen.height, this.skills.box, {
      hold: this.hold.isOpen,
      loadout: this.loadout.isOpen,
      talents: this.talents.isOpen,
      mastery: this.mastery.isOpen,
      settings: this.settings.isOpen,
    });
    this.tracker.update(state, screen.width - MARGIN, MARGIN);
    this.port.update(state);
    this.loadout.update(state.ship, state.player);
    this.raiseBar(this.loadout.isOpen);
    this.talents.update(state.ship, state.player, frameMs / 1000);
    this.stats.update(state, frameMs / 1000);
    this.hold.update(state.ship);
    this.mastery.update();
    this.chart.update(state);
    this.confirm.update();
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

  /** Stacks the shown items under the player's plate: texts as they are, controls after their labels */
  private layout() {
    let y = COLUMN_TOP;
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
    const label = item.kind === 'control' ? new Text({ text: t(item.label), style: LABEL_STYLE }) : null;
    this.column.addChild(widget.container);
    if (label) this.column.addChild(label);
    const shown = { widget, label };
    this.onScreen.set(item.id, shown);
    return shown;
  }
}
