import { Container, type Rectangle, Text } from 'pixi.js';
import { storyFitting, storyTalk, type BotKindId, type GameState, type ShipClass, type ZoneId } from '../../game';
import type { Selection } from '../input/selection';
import type { Slot } from '../storage/Store';
import { Bestiary } from './Bestiary';
import { ButtonRow } from './ButtonRow';
import { ChatPanel } from './ChatPanel';
import type { MapAxes } from './chart';
import { ConfirmDialog } from './ConfirmDialog';
import { DialogueBox } from './DialogueBox';
import { HoldPanel } from './HoldPanel';
import { HudLayout } from './HudLayout';
import { LABEL_STYLE, hudItems, type HudActions, type HudItem, type HudWidget, type ViewStatus } from './hudItems';
import { LayoutEditor } from './LayoutEditor';
import { LoadoutPanel } from './LoadoutPanel';
import { FeatsPanel } from './FeatsPanel';
import { MasteryPanel } from './MasteryPanel';
import { TalentPanel } from './TalentPanel';
import { StatsPanel } from './StatsPanel';
import { Tips } from './Tips';
import { Minimap } from './Minimap';
import { PortScreen, type PortActions } from './PortScreen';
import { PortraitPicker } from './PortraitPicker';
import { Prologue } from './Prologue';
import { QuestTracker } from './QuestTracker';
import { SeaChart } from './SeaChart';
import { SettingsPanel } from './SettingsPanel';
import { SkillBar } from './SkillBar';
import { storyCue, type StoryCue } from './storyCue';
import { StoryGuide, type Guide, type GuideTarget } from './StoryGuide';
import { UnitFrames } from './UnitFrames';
import { WorldChart } from './WorldChart';
import { t } from '../i18n/i18n';

export type { MapAxes } from './chart';
export type { PortActions } from './PortScreen';
export type { HudActions, ViewStatus } from './hudItems';

const MARGIN = 16; // pixels from the screen's edge
const METRIC_GAP = 6; // pixels under a line of text
const ROW_GAP = 8; // pixels between the button rows
const LABEL_WIDTH = 84; // pixels: the button rows start after their labels, lined up
const FRAMES_GAP = 16; // pixels between the target's frame and the player's, and the tracker
const BAR_GAP = 30; // pixels above the skill bar (and its status line), for a part of the bottom that would overlap it
const DIALOGUE_GAP = 40; // pixels between the story's conversation and the skill bar's place under it
// What the story's guide says on the main screen, by what it asks the player to press (storyCue)
const GUIDE_SAYS = {
  talent: 'A talent waits: click here (K)',
  cannon: 'Take the cannons: click here (Q)',
  harpoon: 'Take the harpoon guns: click here (E)',
  repair: 'Repair the hull: click here (R)',
} as const;

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

/**
 * The story's guide clicking a button of the main screen, its note over it (or over `noteBy`), if the button is
 * there
 */
function clickGuide(target: GuideTarget | null, says: string, round = false, noteBy?: GuideTarget) {
  return target ? { guide: { kind: 'click', target, round, above: true, noteBy } as const, says } : null;
}

function saveShown(items: readonly HudItem[], ids: ReadonlySet<string>, kept: Slot) {
  kept.set({ shown: [...ids], known: items.map((item) => item.id) });
}

/**
 * Screen-space overlay: in the top left corner the plate of the player's ship with their captain's portrait (a click
 * on it opens the portraits to pick from), purse and hold (beside it a button lit while a talent waits to be picked,
 * then the frame of the unit they picked out), and under it the items picked in the settings panel; in the top right
 * corner the quest tracker, the quests and the Captain's path; at
 * the bottom the skill bar, the chat on its left (the combat log and the chat's channels, a tab each) and the minimap
 * on its right, ten buttons round its frame's top; and the loadout window, the talents, the hold, the captain's
 * mastery, the feats, the bestiary and the world chart (each opened by its button on the minimap's frame too, as the
 * settings are), the statistics and the sea chart over everything when open, and over them all a question before a
 * quest is given up. Those are the parts' default places: the layout editor, from the
 * settings, moves them where the player likes (`HudLayout`)
 */
export class Hud {
  readonly container = new Container();
  private readonly items: readonly HudItem[];
  private readonly shownIds: Set<string>;
  /** Made the first time an item is shown, then only hidden */
  private readonly onScreen = new Map<string, Shown>();
  private readonly column = new Container();
  private readonly settings: SettingsPanel;
  private readonly frames: UnitFrames;
  /** The captain's portraits to pick from (a click on the portrait on the player's plate) */
  private readonly portraits: PortraitPicker;
  private readonly skills: SkillBar;
  private readonly loadout: LoadoutPanel;
  /** The window the skill bar is raised over (the loadout or the hold), null in its place under them */
  private barOver: Container | null = null;
  private readonly talents: TalentPanel;
  private readonly stats: StatsPanel;
  private readonly hold: HoldPanel;
  private readonly mastery: MasteryPanel;
  /** The captain's feats (a cup in laurels on the minimap's frame) */
  private readonly feats: FeatsPanel;
  /** The chat in the bottom left corner, the combat log one of its tabs */
  private readonly chat: ChatPanel;
  /** Where the items on the screen are kept between visits */
  private readonly keptItems: Slot;
  private readonly minimap: Minimap;
  private readonly chart: SeaChart;
  /** Every sea (N, or the sea chart's button) */
  private readonly world: WorldChart;
  /** Every kind of bot of every sea (B, the Seas row's button, or a click on a bot's plate) */
  private readonly bestiary: Bestiary;
  private readonly tracker: QuestTracker;
  /**
   * Asks before what can't be undone: a quest given up, an item sold back in port, a passive of the captain's mastery or
   * a talent taken, either forgotten
   */
  private readonly confirm: ConfirmDialog;
  /** The story's prologue, over everything, the first thing a new player sees */
  private readonly prologue: Prologue;
  /** The story's conversations, at the bottom of the screen, and the bosun's tips in their box */
  private readonly dialogue: DialogueBox;
  private readonly tips: Tips;
  private readonly port: PortScreen;
  /**
   * On the main screen, under the windows: the button the story asks a new player to press (a talent's, a weapon's,
   * the repair's), lit, the gold pointer clicking it
   */
  private readonly guide: StoryGuide;
  private readonly guideSays: Readonly<Record<keyof typeof GUIDE_SAYS, string>>;
  /** Where the parts of the main screen go, and the editor that moves them */
  private readonly layout: HudLayout;
  private readonly editor: LayoutEditor;
  private readonly screen: Rectangle;
  /** Height of the shown items when last laid out, and where the last of them ends, pixels down the column */
  private columnHeight = 0;
  private columnEnd = 0;

  /**
   * shipClass: the player's ship's, for its share of the talent tree; axes: how the camera turns
   * the world, for the maps; port: what the port's menus do, and the port's name; zone: the sea the game is in;
   * travel: takes the player to another sea from the world chart
   */
  constructor(
    actions: HudActions,
    screen: Rectangle,
    shipClass: ShipClass,
    axes: MapAxes,
    port: { readonly actions: PortActions; readonly name: string },
    kept: {
      readonly hud: Slot;
      readonly layout: Slot;
      readonly log: Slot;
      readonly tracker: Slot;
      readonly tips: Slot;
    },
    zone: ZoneId,
    travel: (zone: ZoneId) => void,
  ) {
    this.keptItems = kept.hud;
    this.chat = new ChatPanel(kept.log, screen);
    this.screen = screen;
    this.items = hudItems(actions);
    this.shownIds = loadShown(this.items, kept.hud.get());
    // The windows hear Escape in the order they are made, each leaving alone one another has taken: so the one on
    // top (the last added below) is made first, and one press closes only it. The prologue over them all: once it is
    // seen, a new player picks their captain's face, then the story starts
    this.prologue = new Prologue(screen, () => {
      actions.seePrologue();
      if (!this.portraits.isOpen) this.portraits.toggle();
    });
    this.confirm = new ConfirmDialog(screen);
    this.tips = new Tips(kept.tips);
    // A tip heard is the HUD's own; the story's conversations move the story on
    this.dialogue = new DialogueBox(screen, (key) => {
      if (!this.tips.heard(key)) actions.tellStory(key);
    });
    this.world = new WorldChart(screen, travel);
    this.bestiary = new Bestiary(screen);
    this.chart = new SeaChart(axes, screen, port.name, zone, () => this.toggleWorld());
    this.portraits = new PortraitPicker(screen, actions.choosePortrait);
    this.stats = new StatsPanel(screen);
    this.feats = new FeatsPanel(screen);
    this.mastery = new MasteryPanel(actions, screen, (question, onYes) => this.confirm.ask(question, onYes));
    // Items dragged out of the hold drop on the skill bar's quick slots, wherever the player put the bar
    this.hold = new HoldPanel(actions, screen, {
      quickSlotAt: (x, y) => this.skills.quickSlotAt(x, y),
      showDrop: (on) => this.skills.showItemDrop(on),
      edges: () => this.skills.edges(screen.height),
    });
    this.talents = new TalentPanel(actions, screen, shipClass, (question, onYes) => this.confirm.ask(question, onYes));
    // Ammo dragged out of the loadout drops on the skill bar beside it, wherever the player put the bar
    this.loadout = new LoadoutPanel(actions, screen, {
      placeAt: (x, y) => this.skills.ammoPlaceAt(x, y),
      showDrop: (weapon) => this.skills.showDrop(weapon),
      edges: () => this.skills.edges(screen.height),
    });
    // Made before the keyboard is bound: its Escape (leave port) goes before the one at sea
    this.port = new PortScreen(port.actions, screen, port.name, this.confirm, zone, () => this.loadout.open());
    this.settings = new SettingsPanel(
      this.items,
      (id) => this.shownIds.has(id),
      (id) => this.toggle(id),
      screen,
    );
    // Under the settings it is opened from
    this.layout = new HudLayout(kept.layout, screen);
    this.editor = new LayoutEditor(this.layout, screen);
    this.frames = new UnitFrames({
      toggleFire: actions.toggleFire,
      openStats: () => this.toggleStats(),
      openHold: () => this.toggleHold(),
      openPortraits: () => this.portraits.toggle(),
      openBestiary: (kind) => this.openBestiary(kind),
    });
    this.tracker = new QuestTracker(kept.tracker, screen, {
      ask: (question, onYes) => this.confirm.ask(question, onYes),
      dropQuest: actions.dropQuest,
    });
    this.minimap = new Minimap(axes, () => this.toggleMap(), {
      settings: () => this.settings.toggle(),
      feats: () => this.feats.toggle(),
      hold: () => this.toggleHold(),
      loadout: () => this.toggleLoadout(),
      talents: () => this.toggleTalents(),
      mastery: () => this.toggleMastery(),
      bestiary: () => this.toggleBestiary(),
      world: () => this.toggleWorld(),
      logout: actions.logOut,
    });
    this.skills = new SkillBar(screen, {
      repair: actions.repair,
      useAbility: actions.useAbility,
      setWeapon: actions.setWeapon,
      loadAmmo: actions.loadAmmo,
      // The bar is over the open loadout: a click on it must not close it, only turn it to the weapon's tab
      openLoadout: (weapon) => this.loadout.open(weapon),
      // An item leaves the bar only dragged back into the open hold
      clearQuickSlot: (slot) => actions.setQuickSlot(slot, null),
      swapQuickSlots: actions.swapQuickSlots,
      overHold: (x, y) => this.hold.takesBack(x, y),
      showTakeBack: (on) => this.hold.showTakeBack(on),
    });
    this.guide = new StoryGuide(screen);
    this.guideSays = {
      talent: t(GUIDE_SAYS.talent),
      cannon: t(GUIDE_SAYS.cannon),
      harpoon: t(GUIDE_SAYS.harpoon),
      repair: t(GUIDE_SAYS.repair),
    };
    this.container.addChild(
      this.column,
      this.frames.container,
      this.skills.container,
      this.chat.container,
      this.minimap.container,
      this.tracker.container,
      this.guide.container,
      this.editor.container,
      this.settings.container,
      this.port.container,
      this.loadout.container,
      this.talents.container,
      this.hold.container,
      this.mastery.container,
      this.feats.container,
      this.stats.container,
      this.portraits.container,
      this.chart.container,
      this.bestiary.container,
      this.world.container,
      this.dialogue.container,
      this.confirm.container,
      this.loadout.dragLayer,
      this.hold.dragLayer,
      this.skills.dragLayer,
      this.prologue.container,
    );
    this.layoutColumn();
  }

  /** Closes the settings and opens the layout editor over the main screen */
  editLayout() {
    this.settings.hide();
    this.editor.open();
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
   * The skill bar over the dim of the loadout or the hold while one is open (the hold's, the upper, when both are), so
   * ammo and items can be dragged onto it and off it; back in its place under the windows when they close
   */
  private raiseBar() {
    const over = this.hold.isOpen ? this.hold.container : this.loadout.isOpen ? this.loadout.container : null;
    if (over === this.barOver) return;
    this.barOver = over;
    const bar = this.skills.container;
    this.container.removeChild(bar);
    this.container.addChildAt(bar, this.container.getChildIndex(over ?? this.frames.container) + 1);
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

  /** Opens or closes the world chart: every sea */
  toggleWorld() {
    this.world.toggle();
  }

  /** Opens or closes the bestiary */
  toggleBestiary() {
    this.bestiary.toggle();
  }

  /** Opens the bestiary on a kind of bot */
  openBestiary(kind: BotKindId) {
    this.bestiary.open(kind);
  }

  update(state: GameState, frameMs: number, view: ViewStatus, selection: Selection) {
    const { screen, layout } = this;
    const frame = { state, view, frameMs };
    // The column's items first: where the column ends bounds the chat
    let column = 0;
    let columnWidth = 0;
    for (const [id, { widget }] of this.onScreen) {
      if (!this.shownIds.has(id)) continue;
      widget.update(frame);
      column += widget.container.height;
      columnWidth = Math.max(columnWidth, widget.container.x + widget.container.width);
    }
    // A text that grew a line (or lost one) moves what is under it
    if (column !== this.columnHeight) {
      this.columnHeight = column;
      this.layoutColumn();
    }

    // The player's frame, and the target's beside it, clear of the tracker
    const own = layout.place('player', UnitFrames.WIDTH, UnitFrames.OWN_HEIGHT, { x: MARGIN, y: MARGIN });
    const targetEnd = screen.width - MARGIN - QuestTracker.WIDTH - FRAMES_GAP;
    const target = layout.place('target', UnitFrames.TARGET_WIDTH, UnitFrames.TARGET_HEIGHT, {
      x: Math.max(MARGIN, Math.min(own.x + UnitFrames.WIDTH + FRAMES_GAP, targetEnd - UnitFrames.TARGET_WIDTH)),
      y: own.y,
    });
    this.frames.layout(own, target);
    this.frames.update(state, selection);
    // The column of items under the player's frame, or over it when the frame is in the screen's lower half
    const below = own.y + UnitFrames.OWN_HEIGHT / 2 < screen.height / 2;
    const columnAt = layout.place('column', Math.ceil(columnWidth), this.columnEnd, {
      x: own.x,
      y: below ? own.y + UnitFrames.OWN_HEIGHT + ROW_GAP : own.y - ROW_GAP - this.columnEnd,
    });
    this.column.position.set(columnAt.x, columnAt.y);

    const barAt = layout.place('skills', SkillBar.WIDTH, SkillBar.HEIGHT, {
      x: (screen.width - SkillBar.WIDTH) / 2,
      y: screen.height - SkillBar.BOTTOM - SkillBar.HEIGHT,
    });
    this.skills.update(state, barAt.x, barAt.y, selection.id);
    const bar = this.skills.box;
    // The chat in the bottom left corner: unfolded, it stays under the plates, and under the column of items over it
    const chatWidth = this.chat.widthOn(screen.width);
    const chatBottom = this.bottomBeside(MARGIN, chatWidth, ChatPanel.FOLDED_HEIGHT, bar);
    let chatTop = MARGIN + UnitFrames.TARGET_HEIGHT + ROW_GAP;
    if (this.columnEnd > 0 && columnAt.x < MARGIN + chatWidth && columnAt.y < chatBottom) {
      chatTop = Math.max(chatTop, columnAt.y + this.columnEnd + METRIC_GAP);
    }
    this.chat.update(state, screen.width, layout.room('chat') ?? chatBottom - chatTop, layout.growsDown('chat'));
    const chatAt = layout.place('chat', this.chat.width, this.chat.height, {
      x: MARGIN,
      y: chatBottom - this.chat.height,
    });
    this.chat.container.position.set(chatAt.x, chatAt.y);
    const mapLeft = screen.width - MARGIN - Minimap.WIDTH;
    const mapAt = layout.place('minimap', Minimap.WIDTH, Minimap.HEIGHT, {
      x: mapLeft,
      y: this.bottomBeside(mapLeft, Minimap.WIDTH, Minimap.HEIGHT, bar) - Minimap.HEIGHT,
    });
    this.minimap.update(
      state,
      selection,
      mapAt.x,
      mapAt.y,
      screen.width,
      {
        settings: this.settings.isOpen,
        feats: this.feats.isOpen,
        hold: this.hold.isOpen,
        loadout: this.loadout.isOpen,
        talents: this.talents.isOpen,
        mastery: this.mastery.isOpen,
        bestiary: this.bestiary.isOpen,
        world: this.world.isOpen,
      },
      frameMs / 1000,
    );
    this.tracker.update(state);
    const trackerAt = layout.place('tracker', QuestTracker.WIDTH, this.tracker.height, {
      x: screen.width - MARGIN - QuestTracker.WIDTH,
      y: MARGIN,
    });
    this.tracker.container.position.set(trackerAt.x, trackerAt.y);
    this.editor.update();
    const cue = storyCue(state);
    this.port.update(state, cue);
    this.loadout.update(state.ship, state.player, storyFitting(state, state.player), frameMs / 1000);
    this.hold.update(state);
    this.raiseBar();
    this.talents.update(state.ship, state.player, frameMs / 1000, cue?.kind === 'talent');
    const guide = this.guideFor(cue);
    this.guide.update(guide?.guide ?? null, guide?.says ?? '', frameMs / 1000);
    this.stats.update(state, frameMs / 1000);
    this.portraits.update(state);
    this.mastery.update(state, frameMs / 1000);
    this.feats.update(state);
    this.chart.update(state);
    this.world.update(state);
    this.bestiary.update(state);
    this.confirm.update(frameMs / 1000);
    this.settings.update(frame);
    this.prologue.update(!state.player.story.prologue, frameMs / 1000);
    // The story's conversation over the skill bar's place, in port too; not under the captain's faces to pick from.
    // A tip of the bosun's in its box when the story has nothing to say
    const covered = this.prologue.isOpen || this.portraits.isOpen;
    const talk = storyTalk(state, state.player);
    this.dialogue.update(talk ?? this.tips.update(state, talk !== null || covered), covered, frameMs / 1000);
    this.dialogue.place(
      (screen.width - this.dialogue.width) / 2,
      screen.height -
        SkillBar.BOTTOM -
        SkillBar.HEIGHT -
        DIALOGUE_GAP -
        DialogueBox.HEIGHT * this.dialogue.container.scale.y,
    );
  }

  /**
   * Where the story's guide points on the main screen: the talents' button on the minimap's frame (in the open tree, the
   * talent itself: TalentPanel), a weapon on the skill bar, the repair. Not while the skill bar is raised over a window
   */
  private guideFor(cue: StoryCue | null): { readonly guide: Guide; readonly says: string } | null {
    if (!cue || this.barOver !== null) return null;
    if (cue.kind === 'talent' && !this.talents.isOpen) {
      return clickGuide(this.minimap.target('talents'), this.guideSays.talent, true);
    }
    // A skill's note over the whole bar, clear of its slots and of the line over it
    const bar = this.skills.frame;
    if (cue.kind === 'weapon')
      return clickGuide(this.skills.target(cue.weapon), this.guideSays[cue.weapon], false, bar);
    if (cue.kind === 'repair') return clickGuide(this.skills.target('repair'), this.guideSays.repair, false, bar);
    return null;
  }

  private toggle(id: string) {
    if (!this.shownIds.delete(id)) this.shownIds.add(id);
    saveShown(this.items, this.shownIds, this.keptItems);
    this.layoutColumn();
  }

  /**
   * The bottom of a part laid out at the bottom of the screen, `left` to `left + width` across and `height` high:
   * above the skill bar where the bar is in its way
   */
  private bottomBeside(left: number, width: number, height: number, bar: Rectangle) {
    const bottom = this.screen.height - MARGIN;
    const across = left < bar.x + bar.width && left + width > bar.x;
    return across && bar.y + bar.height > bottom - height ? bar.y - BAR_GAP : bottom;
  }

  /** Stacks the shown items down the column: texts as they are, controls after their labels */
  private layoutColumn() {
    let y = 0;
    let end = 0;
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
        label.position.set(0, y + (ButtonRow.HEIGHT - label.height) / 2);
        widget.container.position.set(LABEL_WIDTH, y);
        end = y + ButtonRow.HEIGHT;
        y = end + ROW_GAP;
      } else {
        widget.container.position.set(0, y);
        end = y + widget.container.height;
        y = end + METRIC_GAP;
      }
    }
    this.columnEnd = end;
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
