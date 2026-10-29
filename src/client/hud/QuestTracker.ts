import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import {
  MAX_QUESTS,
  mostOf,
  questLimit,
  QUESTS,
  SPEAKERS,
  STORY_CHAPTERS,
  captainsPath,
  objectiveNeed,
  objectivesMet,
  questDone,
  shipGoal,
  shipQuests,
  storyStep,
  type ActiveQuest,
  type GameState,
  type PathStepId,
  type QuestId,
  type StoryStep,
} from '../../game';
import type { Slot } from '../storage/Store';
import type { Question } from './ConfirmDialog';
import { NIGHT, NIGHT_SPOT, drawNightMeter, drawPlateEdge, nightDivider, nightPlate } from './nightTheme';
import { THEME, drawChevron, subheading } from './theme';
import { goalTitle, questTitle } from './questText';
import { Tooltip, type TooltipText } from './Tooltip';
import { Tile, UI, clip, playTap, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 260; // pixels
const INSET = 14; // pixels from the plate's edge to what is on it
const INNER = WIDTH - INSET * 2;
// Pixels: a section's header, its chevron and count; its title's size, the least it shrinks to, the gap to the count
const HEADER = { height: 22, chevron: 9, count: 22, title: 14, leastTitle: 11, titleGap: 8 } as const;
const QUEST = { height: 27, gap: 5 } as const; // pixels: a quest's line and meter, and the gap under it
const METER = { y: 18, height: 4 } as const; // pixels: a quest's thin meter, under its title
const DONE_Y = 15; // pixels: the word that a quest is done, in place of its meter
const ABANDON = { size: 16, cross: 3 } as const; // pixels: the button that abandons a quest, half its cross
const STEP_GAP = 3; // pixels under each step of the path
const SECTION_GAP = 9; // pixels above and below the divider between the sections
const DIVIDER_MIDDLE = 64; // pixels: the divider's painted star, across
const LIT_TIME = 4; // seconds a step or an objective just done stays lit, before it folds away
const STORY_TITLE = { size: 12, gap: 3 } as const; // pixels: the story's step's title, and the gap under it
const GOLD = 0xffcf3f;

/** The tracker's parts, each folded by a click on its header */
const SECTIONS = ['story', 'quests', 'goal'] as const;
type Section = (typeof SECTIONS)[number];

/** What the tracker asks the HUD to do */
export interface TrackerActions {
  /** Asks the player a question before what can't be undone; `onYes` runs if they agree */
  readonly ask: (question: Question, onYes: () => void) => void;
  /** Gives a quest up */
  readonly dropQuest: (id: QuestId) => void;
}

/** A section's header: its title, a count, and a chevron at the right end, down while it is unfolded */
interface Header {
  readonly container: Container;
  readonly title: Text;
  readonly count: Text;
  readonly chevron: Graphics;
  /** Whether the chevron was drawn unfolded; null before the first frame */
  drawnOpen: boolean | null;
  /** The title as last fitted to its room */
  fitted: string;
}

/** A quest's line: its title and count, a thin meter of how far it has got (or a word that it is done), and ✕ */
interface QuestRow {
  readonly container: Container;
  readonly title: Text;
  readonly count: Text;
  readonly meter: Graphics;
  readonly done: Text;
  readonly abandon: Tile;
  /** The quest it shows now */
  quest: ActiveQuest | null;
  /** What its title and meter were drawn for */
  painted: string;
}

/** What the player is asked before a quest is given up: the tavern and the tracker ask the same */
export function abandonQuestion(quest: ActiveQuest): Question {
  const { count } = QUESTS[quest.id];
  return {
    title: t('Abandon the quest?'),
    text: t('"{title}": {kills} of {count} so far. The count is lost, but the tavern will offer the quest again.', {
      title: questTitle(QUESTS[quest.id]),
      kills: quest.kills,
      count,
    }),
    yes: t('Abandon'),
  };
}

function loadFolded(saved: unknown): Record<Section, boolean> {
  const folded = { story: false, quests: false, goal: false };
  if (typeof saved !== 'object' || saved === null) return folded;
  for (const section of SECTIONS) folded[section] = Reflect.get(saved, section) === true;
  return folded;
}

/** A line of the story's section: an objective, or the word to come back to port, and its colour */
interface StoryLine {
  readonly text: string;
  readonly color: number;
}

/**
 * The tracker in the top right corner, a plate in the night look: the story, its chapter in the header, the step the
 * player is on and its objectives (one just met lit a moment), or the word to come back to port where someone waits;
 * the quests the ship sailed has taken, each a line with a thin meter of how far it has got (a done one in green, to
 * turn in at the tavern) and a button to give it up, asked first, and how many the other ships have; and the Captain's
 * path, the ship the player works towards and the steps still to do towards it, how many are done in its header (a
 * step just done stays a moment, lit, then folds away). A click on a section's header folds it to that line; the
 * browser keeps which are folded
 */
export class QuestTracker {
  static readonly WIDTH = WIDTH;
  readonly container = new Container();
  private panel = new Container();
  private panelHeight = 0;
  /** The gold edge while a step of the path or an objective of the story is lit */
  private readonly lit = new Graphics();
  private litFor = '';
  private readonly story: Header;
  /** The story's step, under its chapter */
  private readonly storyTitle = text('', STORY_TITLE.size, THEME.title, {
    fontWeight: 'bold',
    wordWrap: true,
    wordWrapWidth: INNER - 4,
  });
  private readonly storyLines: Text[] = [];
  private readonly storyDivider = nightDivider(INNER, DIVIDER_MIDDLE);
  private readonly quests: Header;
  private readonly questsTitle: string;
  private readonly goal: Header;
  private readonly rows: readonly QuestRow[];
  private readonly empty = text('', 11, NIGHT.dim, { fontStyle: 'italic', wordWrap: true, wordWrapWidth: INNER });
  /** How many quests the player's other ships have taken: they wait for those ships */
  private readonly elsewhere = text('', 11, NIGHT.dim, { fontStyle: 'italic', wordWrap: true, wordWrapWidth: INNER });
  private readonly divider = nightDivider(INNER, DIVIDER_MIDDLE);
  private readonly steps: Text[] = [];
  private readonly list = new Container();
  private readonly tooltip: Tooltip;
  private readonly abandonHint: TooltipText;
  /** The row whose ✕ is under the pointer */
  private hovered: QuestRow | null = null;
  private readonly folded: Record<Section, boolean>;
  private readonly kept: Slot;
  private readonly actions: TrackerActions;
  /** Game time each step of the path was done, while it is lit */
  private readonly litSteps = new Map<PathStepId, number>();
  /** The steps of the path done as of the last frame (null before the first): one done since is lit */
  private pathDone: Set<PathStepId> | null = null;
  /** Game time each objective of the story was met (`step:objective`), while it is lit */
  private readonly litObjectives = new Map<string, number>();

  /** kept: where the browser keeps which sections are folded; screen: the screen its tooltip stays inside */
  constructor(kept: Slot, screen: { readonly width: number }, actions: TrackerActions) {
    this.kept = kept;
    this.tooltip = new Tooltip(screen);
    this.actions = actions;
    this.folded = loadFolded(kept.get());
    this.abandonHint = { title: t('Abandon the quest'), lines: [] };
    this.story = this.header('story');
    this.quests = this.header('quests');
    this.goal = this.header('goal');
    this.questsTitle = t('Quests');
    show(this.empty, t('No quests: take bounties at the tavern in port'));
    this.rows = Array.from({ length: MAX_QUESTS + mostOf('quests') }, () => this.row());
    this.storyTitle.x = 2;
    this.list.position.set(INSET, 0);
    this.list.addChild(this.story.container, this.storyTitle, this.storyDivider);
    this.list.addChild(this.quests.container, ...this.rows.map((r) => r.container), this.empty, this.elsewhere);
    this.list.addChild(this.divider, this.goal.container);
    this.lit.visible = false;
    this.container.addChild(this.panel, this.lit, this.list, this.tooltip.container);
    this.container.eventMode = 'static';
    // A click on it must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
  }

  /** Pixels: its plate's height, as last laid out */
  get height() {
    return this.panelHeight;
  }

  /** Lays it out; the HUD puts it where it goes, by its `height` */
  update(state: GameState) {
    const { player } = state;
    for (const event of state.events) {
      if (event.type === 'story' && event.shipId === state.ship.id && event.objective !== null) {
        this.litObjectives.set(`${event.step}:${event.objective}`, state.time);
      }
    }

    let y = this.layStory(state, INSET - 5);
    this.quests.container.y = y;
    // The ship sailed's: each ship does and turns in its own
    const quests = shipQuests(state, player);
    show(this.quests.count, `${quests.length}/${questLimit(state, player)}`);
    this.fitTitle(this.quests, this.questsTitle);
    this.paintHeader(this.quests, !this.folded.quests);
    y += HEADER.height + 3;
    const questsOpen = !this.folded.quests;
    this.rows.forEach((row, i) => {
      const quest = questsOpen ? quests[i] : undefined;
      row.quest = quest ?? null;
      row.container.visible = quest !== undefined;
      if (!quest) return;
      row.container.y = y;
      this.fill(row, quest);
      y += QUEST.height + QUEST.gap;
    });
    if (this.hovered && !this.hovered.quest) this.hovered = null;
    this.empty.visible = questsOpen && quests.length === 0;
    if (this.empty.visible) {
      this.empty.y = y;
      y += this.empty.height + QUEST.gap;
    }
    const elsewhere = player.quests.length - quests.length;
    this.elsewhere.visible = questsOpen && elsewhere > 0;
    if (this.elsewhere.visible) {
      show(this.elsewhere, t('Quests of your other ships: {n}', { n: elsewhere }));
      this.elsewhere.y = y;
      y += this.elsewhere.height + QUEST.gap;
    }

    // With no ship to buy next (the last of a line, a masterwork) there is no goal: only the quests are left
    const goal = shipGoal(state, player);
    this.divider.visible = goal !== null;
    this.goal.container.visible = goal !== null;
    const path = goal ? captainsPath(state, player) : [];
    // A step done since the last frame is lit; on the first, what is done is only noted
    const done = new Set(path.filter((step) => step.done).map((step) => step.id));
    for (const id of done) if (this.pathDone && !this.pathDone.has(id)) this.litSteps.set(id, state.time);
    this.pathDone = done;
    if (goal) {
      y += SECTION_GAP - (questsOpen ? QUEST.gap : 0);
      this.divider.y = y;
      y += SECTION_GAP;
      this.goal.container.y = y;
      show(this.goal.count, `${done.size}/${path.length}`);
      this.fitTitle(this.goal, goalTitle(state, goal));
      this.paintHeader(this.goal, !this.folded.goal);
      y += HEADER.height + 2;
    }
    while (this.steps.length < path.length) {
      const line = text('', 11, THEME.text, { wordWrap: true, wordWrapWidth: INNER - 4 });
      line.x = 2;
      this.steps.push(line);
      this.list.addChild(line);
    }
    let anyLit = [...this.litObjectives.values()].some((at) => state.time - at < LIT_TIME);
    this.steps.forEach((line, i) => {
      const step = path[i];
      const litAt = step ? this.litSteps.get(step.id) : undefined;
      const lit = litAt !== undefined && state.time - litAt < LIT_TIME;
      // The steps still to do; one just done stays while it is lit
      line.visible = step !== undefined && !this.folded.goal && (!step.done || lit);
      if (!line.visible) return;
      const count = step.need === null ? '' : ` ${step.have}/${step.need}`;
      show(line, `${step.done ? '✓' : '○'} ${t(step.text)}${count}`);
      anyLit ||= lit;
      tint(line, lit ? GOLD : THEME.text);
      line.y = y;
      y += line.height + STEP_GAP;
    });

    this.resize(Math.ceil(y + INSET - 6), anyLit);
    const { hovered } = this;
    const at = hovered?.abandon.container;
    const top = (hovered?.container.y ?? 0) + (at?.y ?? 0);
    this.tooltip.point(hovered ? this.abandonHint : null, INSET + (at?.x ?? 0) + ABANDON.size / 2, top, {
      under: top + ABANDON.size,
    });
    // Centred over the ✕ it would run past the screen's edge, so it ends where the plate does
    const tip = this.tooltip.container;
    tip.x = Math.min(tip.x, WIDTH - tip.width);
  }

  /**
   * The story's section from `top` down, while there is a step to do: its chapter in the header and how many of its
   * objectives are met, the step's title, each objective not met yet (one just met stays a moment, lit), or the word to
   * come back to port. Returns where the next section starts
   */
  private layStory(state: GameState, top: number) {
    const { player } = state;
    const step = storyStep(player);
    const open = step !== null && !this.folded.story;
    this.story.container.visible = step !== null;
    this.storyDivider.visible = step !== null;
    this.storyTitle.visible = open;
    const lines = step && open ? this.storyLinesOf(state, step) : [];
    while (this.storyLines.length < lines.length) {
      const line = text('', 11, THEME.text, { wordWrap: true, wordWrapWidth: INNER - 4 });
      line.x = 2;
      this.storyLines.push(line);
      this.list.addChild(line);
    }
    let y = top;
    if (step) {
      this.story.container.y = y;
      const { counts, told } = player.story;
      const met = step.objectives.filter((o, i) => told && (counts[i] ?? 0) >= objectiveNeed(o)).length;
      show(this.story.count, `${met}/${step.objectives.length}`);
      this.fitTitle(this.story, t(STORY_CHAPTERS[step.chapter]));
      this.paintHeader(this.story, open);
      y += HEADER.height + 2;
    }
    if (open) {
      show(this.storyTitle, t(step.title));
      this.storyTitle.y = y;
      y += this.storyTitle.height + STORY_TITLE.gap;
    }
    this.storyLines.forEach((line, i) => {
      const shown = lines[i];
      line.visible = shown !== undefined;
      if (!shown) return;
      show(line, shown.text);
      tint(line, shown.color);
      line.y = y;
      y += line.height + STEP_GAP;
    });
    if (!step) return y;
    y += SECTION_GAP - STEP_GAP;
    this.storyDivider.y = y;
    return y + SECTION_GAP;
  }

  /** What the story's section says under the step's title, as the player stands now */
  private storyLinesOf(state: GameState, step: StoryStep): StoryLine[] {
    const { player } = state;
    const { counts, told } = player.story;
    // Not told yet: its opening is on its way, at the bottom of the screen
    if (!told) {
      const { name } = SPEAKERS[step.opening[0]?.speaker ?? 'keeper'];
      return [{ text: t('{name} has something to tell you', { name: t(name) }), color: NIGHT.dim }];
    }
    if (step.turnIn === 'port' && objectivesMet(player)) {
      const { name } = SPEAKERS[step.closing[0]?.speaker ?? 'keeper'];
      return [{ text: t('Come back to port: {name} is waiting', { name: t(name) }), color: UI.good }];
    }
    return step.objectives.flatMap((objective, i) => {
      const need = objectiveNeed(objective);
      const have = counts[i] ?? 0;
      const litAt = this.litObjectives.get(`${step.id}:${i}`);
      const lit = litAt !== undefined && state.time - litAt < LIT_TIME;
      // Met, it folds away once it has been lit a moment
      if (have >= need && !lit) return [];
      const count = need > 1 ? ` ${have}/${need}` : '';
      return [{ text: `${have >= need ? '✓' : '○'} ${t(objective.text)}${count}`, color: lit ? GOLD : THEME.text }];
    });
  }

  /** A section's header, a click on which folds or unfolds it */
  private header(section: Section): Header {
    const container = new Container();
    const title = subheading('', HEADER.title);
    title.anchor.set(0, 0.5);
    title.position.set(0, HEADER.height / 2);
    const count = text('', 11, NIGHT.dim, { fontWeight: 'bold' });
    count.anchor.set(1, 0.5);
    count.position.set(INNER - HEADER.chevron - HEADER.count / 2, HEADER.height / 2);
    const chevron = new Graphics();
    chevron.position.set(INNER - HEADER.chevron / 2 - 2, HEADER.height / 2);
    container.addChild(title, count, chevron);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.hitArea = new Rectangle(0, 0, INNER, HEADER.height);
    container.on('pointertap', () => {
      playTap();
      this.folded[section] = !this.folded[section];
      this.kept.set({ ...this.folded });
    });
    return { container, title, count, chevron, drawnOpen: null, fitted: '' };
  }

  /**
   * A header's title, in its full size where it fits left of the count, smaller where it doesn't (a long ship's name, a
   * longer language), and cut short only past the smallest
   */
  private fitTitle(header: Header, title: string) {
    const room = Math.floor(header.count.x - header.count.width - HEADER.titleGap);
    const key = `${title}|${room}`;
    if (key === header.fitted) return;
    header.fitted = key;
    header.title.text = title;
    header.title.style.fontSize = HEADER.title;
    if (header.title.width > room) {
      const size = Math.floor((HEADER.title * room) / header.title.width);
      header.title.style.fontSize = Math.max(HEADER.leastTitle, size);
    }
    clip(header.title, room);
  }

  private paintHeader(header: Header, open: boolean) {
    if (header.drawnOpen === open) return;
    header.drawnOpen = open;
    drawChevron(header.chevron.clear(), HEADER.chevron, open);
  }

  /** A quest's line, filled by `fill` with the quest it shows */
  private row(): QuestRow {
    const container = new Container();
    const title = text('', 12, THEME.text, { fontWeight: 'bold' });
    title.position.set(2, 0);
    const count = text('', 11, NIGHT.dim, { fontWeight: 'bold' });
    count.anchor.set(1, 0);
    count.position.set(INNER - ABANDON.size - 8, 1);
    const meter = new Graphics();
    meter.position.set(2, METER.y);
    const done = text(t('Done: turn it in at the tavern'), 10, UI.good, { fontWeight: 'bold' });
    done.position.set(2, DONE_Y);
    const row: QuestRow = {
      container,
      title,
      count,
      meter,
      done,
      abandon: new Tile(ABANDON.size, ABANDON.size, () => this.abandon(row), 0, NIGHT_SPOT),
      quest: null,
      painted: '',
    };
    const { abandon } = row;
    const c = ABANDON.cross;
    const cross = new Graphics()
      .moveTo(-c, -c)
      .lineTo(c, c)
      .moveTo(c, -c)
      .lineTo(-c, c)
      .stroke({ width: 1.5, color: THEME.text, cap: 'round' });
    cross.position.set(ABANDON.size / 2, ABANDON.size / 2);
    abandon.content.addChild(cross);
    abandon.container.position.set(INNER - ABANDON.size, (QUEST.height - ABANDON.size) / 2);
    abandon.container.on('pointerover', () => (this.hovered = row));
    abandon.container.on('pointerout', () => {
      if (this.hovered === row) this.hovered = null;
    });
    container.addChild(title, count, meter, done, abandon.container);
    return row;
  }

  /** A row as its quest stands now */
  private fill(row: QuestRow, quest: ActiveQuest) {
    const { count } = QUESTS[quest.id];
    const done = questDone(quest);
    show(row.count, `${quest.kills}/${count}`);
    tint(row.count, done ? UI.good : NIGHT.dim);
    row.meter.visible = !done;
    row.done.visible = done;
    // Done, it is turned in at the tavern, not given up
    row.abandon.container.visible = !done;
    const key = `${quest.id}:${quest.kills}`;
    if (key === row.painted) return;
    row.painted = key;
    row.title.text = questTitle(QUESTS[quest.id]);
    clip(row.title, row.count.x - Math.ceil(row.count.width) - 8 - row.title.x);
    tint(row.title, done ? UI.good : THEME.text);
    const width = INNER - ABANDON.size - 10;
    drawNightMeter(row.meter.clear(), width, METER.height, quest.kills / count, THEME.brass);
  }

  /** Asks first; gives the quest up if the player agrees */
  private abandon(row: QuestRow) {
    const { quest } = row;
    if (!quest) return;
    this.actions.ask(abandonQuestion(quest), () => this.actions.dropQuest(quest.id));
  }

  /** The plate made again at a new height; its edge lit gold while a step is lit */
  private resize(height: number, lit: boolean) {
    if (height !== this.panelHeight) {
      this.panelHeight = height;
      const panel = nightPlate(WIDTH, height);
      this.container.addChildAt(panel, 0);
      this.panel.destroy({ children: true });
      this.panel = panel;
    }
    this.lit.visible = lit;
    const key = `${height}`;
    if (!lit || key === this.litFor) return;
    this.litFor = key;
    drawPlateEdge(this.lit.clear(), WIDTH, height, GOLD);
  }
}
