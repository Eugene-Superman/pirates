import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import {
  MAX_QUESTS,
  QUESTS,
  captainsPath,
  goalOffer,
  offerName,
  questDone,
  type ActiveQuest,
  type GameState,
  type PathStepId,
  type QuestId,
} from '../../game';
import type { Slot } from '../storage/Store';
import type { Question } from './ConfirmDialog';
import {
  BRASS,
  THEME,
  drawCard,
  drawChevron,
  drawDivider,
  drawHairline,
  drawMeter,
  subheading,
  themedPanel,
} from './theme';
import { Tooltip, type TooltipText } from './Tooltip';
import { Tile, UI, playTap, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 290; // pixels
const INSET = 15; // pixels from the panel's edge to what is in it, clear of its brass rim and gold hairline
const INNER = WIDTH - INSET * 2;
const BRACKETS = 0.6; // its corner brackets, in a window's
const HEADER = { height: 24, chevron: 9, count: 22 } as const; // pixels: a section's header, its chevron and count
const QUEST = { height: 42, gap: 5, pad: 10 } as const; // pixels: a quest's board
const METER = { y: 27, height: 6 } as const; // pixels: a quest's meter on its board
const ABANDON = { size: 20, cross: 3.5 } as const; // pixels: the button that abandons a quest, half its cross
const STEP_GAP = 3; // pixels under each step of the path
const SECTION_GAP = 9; // pixels above and below the divider between the sections
const LIT_TIME = 4; // seconds a step just done stays lit
const GOLD = 0xffcf3f;

/** The tracker's two parts, each folded by a click on its header */
const SECTIONS = ['quests', 'goal'] as const;
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
}

/** A quest's board: its title and count, a meter of how far it has got (or a word that it is done), and ✕ */
interface QuestRow {
  readonly container: Container;
  readonly board: Graphics;
  readonly title: Text;
  readonly count: Text;
  readonly meter: Graphics;
  readonly done: Text;
  readonly abandon: Tile;
  /** The quest it shows now */
  quest: ActiveQuest | null;
  /** What its board and meter were drawn for */
  painted: string;
}

/** What the player is asked before a quest is given up: the tavern and the tracker ask the same */
export function abandonQuestion(quest: ActiveQuest): Question {
  const { title, count } = QUESTS[quest.id];
  return {
    title: t('Abandon the quest?'),
    text: t('"{title}": {kills} of {count} so far. The count is lost, but the tavern will offer the quest again.', {
      title: t(title),
      kills: quest.kills,
      count,
    }),
    yes: t('Abandon'),
  };
}

function loadFolded(saved: unknown): Record<Section, boolean> {
  const folded = { quests: false, goal: false };
  if (typeof saved !== 'object' || saved === null) return folded;
  for (const section of SECTIONS) folded[section] = Reflect.get(saved, section) === true;
  return folded;
}

/**
 * The tracker in the top right corner, dark wood under a brass frame like the windows: the quests taken, each on a
 * board with how far it has got (a done one in green, to turn in at the tavern) and a button to give it up, asked
 * first; and the Captain's path, the ship the starting waters lead to and every step towards it, a step just done lit
 * for a moment. A click on a section's header folds it to that line; the browser keeps which are folded
 */
export class QuestTracker {
  static readonly WIDTH = WIDTH;
  readonly container = new Container();
  private panel = new Container();
  private panelHeight = 0;
  /** The gold hairline while a step of the path is lit */
  private readonly lit = new Graphics();
  private litFor = '';
  private readonly quests: Header;
  private readonly goal: Header;
  private readonly rows: readonly QuestRow[];
  private readonly empty = text('', 12, THEME.dim, { fontStyle: 'italic', wordWrap: true, wordWrapWidth: INNER });
  private readonly divider = drawDivider(new Graphics(), 0, 0, INNER);
  private readonly steps: Text[] = [];
  private readonly list = new Container();
  private readonly tooltip = new Tooltip();
  private readonly abandonHint: TooltipText;
  /** The row whose ✕ is under the pointer */
  private hovered: QuestRow | null = null;
  private readonly folded: Record<Section, boolean>;
  private readonly kept: Slot;
  private readonly actions: TrackerActions;
  /** Game time each step was done, while it is lit */
  private readonly litSteps = new Map<PathStepId, number>();

  /** kept: where the browser keeps which sections are folded */
  constructor(kept: Slot, actions: TrackerActions) {
    this.kept = kept;
    this.actions = actions;
    this.folded = loadFolded(kept.get());
    this.abandonHint = { title: t('Abandon the quest'), lines: [] };
    this.quests = this.header('quests');
    this.goal = this.header('goal');
    show(this.quests.title, t('Quests'));
    show(this.empty, t('No quests: take bounties at the tavern in port'));
    this.empty.x = 2;
    this.rows = Array.from({ length: MAX_QUESTS }, () => this.row());
    this.list.position.set(INSET, 0);
    this.list.addChild(this.quests.container, ...this.rows.map((r) => r.container), this.empty);
    this.list.addChild(this.divider, this.goal.container);
    this.container.addChild(this.panel, this.lit, this.list, this.tooltip.container);
    this.container.eventMode = 'static';
    // A click on it must not steer the ship
    this.container.on('pointerdown', (e) => e.stopPropagation());
  }

  /** right, top: where its top right corner goes */
  update(state: GameState, right: number, top: number) {
    this.container.position.set(right - WIDTH, top);
    const { player } = state;
    for (const event of state.events) {
      if (event.type === 'pathStep' && event.shipId === state.ship.id) this.litSteps.set(event.step, state.time);
    }

    let y = INSET - 3;
    this.quests.container.y = y;
    show(this.quests.count, `${player.quests.length}/${MAX_QUESTS}`);
    this.paintHeader(this.quests, !this.folded.quests);
    y += HEADER.height + 2;
    const questsOpen = !this.folded.quests;
    this.rows.forEach((row, i) => {
      const quest = questsOpen ? player.quests[i] : undefined;
      row.quest = quest ?? null;
      row.container.visible = quest !== undefined;
      if (!quest) return;
      row.container.y = y;
      this.fill(row, quest);
      y += QUEST.height + QUEST.gap;
    });
    if (this.hovered && !this.hovered.quest) this.hovered = null;
    this.empty.visible = questsOpen && player.quests.length === 0;
    if (this.empty.visible) {
      this.empty.y = y;
      y += this.empty.height + QUEST.gap;
    }

    // Once the player owns every ship the shipyard sells there is no goal: only the quests are left
    const offer = goalOffer(state, player);
    this.divider.visible = offer !== null;
    this.goal.container.visible = offer !== null;
    const path = offer ? captainsPath(state, player) : [];
    if (offer) {
      y += SECTION_GAP - (questsOpen ? QUEST.gap : 0);
      this.divider.y = y;
      y += SECTION_GAP;
      this.goal.container.y = y;
      show(this.goal.title, t('Goal: the {ship}', { ship: t(offerName(offer)) }));
      show(this.goal.count, `${path.filter((step) => step.done).length}/${path.length}`);
      this.paintHeader(this.goal, !this.folded.goal);
      y += HEADER.height + 2;
    }
    while (this.steps.length < path.length) {
      const line = text('', 12, THEME.text, { wordWrap: true, wordWrapWidth: INNER - 4 });
      line.x = 2;
      this.steps.push(line);
      this.list.addChild(line);
    }
    let anyLit = false;
    this.steps.forEach((line, i) => {
      const step = path[i];
      line.visible = step !== undefined && !this.folded.goal;
      if (!line.visible) return;
      const count = step.need === null ? '' : ` ${step.have}/${step.need}`;
      show(line, `${step.done ? '✓' : '○'} ${t(step.text)}${count}`);
      const litAt = this.litSteps.get(step.id);
      const lit = litAt !== undefined && state.time - litAt < LIT_TIME;
      anyLit ||= lit;
      tint(line, lit ? GOLD : step.done ? UI.good : THEME.text);
      line.y = y;
      y += line.height + STEP_GAP;
    });

    this.resize(Math.ceil(y + INSET - 4), anyLit);
    const { hovered } = this;
    const at = hovered?.abandon.container;
    this.tooltip.point(
      hovered ? this.abandonHint : null,
      INSET + (at?.x ?? 0) + ABANDON.size / 2,
      (hovered?.container.y ?? 0) + (at?.y ?? 0),
    );
    // Centred over the ✕ it would run past the screen's edge, so it ends where the panel does
    const tip = this.tooltip.container;
    tip.x = Math.min(tip.x, WIDTH - tip.width);
  }

  /** A section's header, a click on which folds or unfolds it */
  private header(section: Section): Header {
    const container = new Container();
    const title = subheading('', 15);
    title.position.set(0, 1);
    const count = text('', 12, THEME.dim, { fontWeight: 'bold' });
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
    return { container, title, count, chevron, drawnOpen: null };
  }

  private paintHeader(header: Header, open: boolean) {
    if (header.drawnOpen === open) return;
    header.drawnOpen = open;
    drawChevron(header.chevron.clear(), HEADER.chevron, open);
  }

  /** A quest's board, filled by `fill` with the quest it shows */
  private row(): QuestRow {
    const container = new Container();
    const board = new Graphics();
    const title = text('', 12, THEME.text, { fontWeight: 'bold' });
    title.position.set(QUEST.pad, 6);
    const count = text('', 12, THEME.text, { fontWeight: 'bold' });
    count.anchor.set(1, 0);
    count.position.set(INNER - QUEST.pad - ABANDON.size - 8, 6);
    const meter = new Graphics();
    meter.position.set(QUEST.pad, METER.y);
    const done = text(t('Done: turn it in at the tavern'), 11, UI.good, { fontWeight: 'bold' });
    done.position.set(QUEST.pad, METER.y - 5);
    const row: QuestRow = {
      container,
      board,
      title,
      count,
      meter,
      done,
      abandon: new Tile(ABANDON.size, ABANDON.size, () => this.abandon(row), 4, BRASS),
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
      .stroke({ width: 2, color: THEME.text, cap: 'round' });
    cross.position.set(ABANDON.size / 2, ABANDON.size / 2);
    abandon.content.addChild(cross);
    abandon.container.position.set(INNER - QUEST.pad - ABANDON.size + 4, (QUEST.height - ABANDON.size) / 2);
    abandon.container.on('pointerover', () => (this.hovered = row));
    abandon.container.on('pointerout', () => {
      if (this.hovered === row) this.hovered = null;
    });
    container.addChild(board, title, count, meter, done, abandon.container);
    return row;
  }

  /** A row as its quest stands now */
  private fill(row: QuestRow, quest: ActiveQuest) {
    const { title, count } = QUESTS[quest.id];
    const done = questDone(quest);
    show(row.title, t(title));
    tint(row.title, done ? UI.good : THEME.text);
    show(row.count, `${quest.kills}/${count}`);
    tint(row.count, done ? UI.good : THEME.dim);
    row.meter.visible = !done;
    row.done.visible = done;
    // Done, it is turned in at the tavern, not given up
    row.abandon.container.visible = !done;
    const key = `${quest.id}:${quest.kills}`;
    if (key === row.painted) return;
    row.painted = key;
    drawCard(row.board.clear(), INNER, QUEST.height, done ? UI.good : THEME.brass);
    const width = INNER - QUEST.pad * 2 - ABANDON.size - 8;
    drawMeter(row.meter.clear(), width, METER.height, quest.kills / count, THEME.brass, count);
  }

  /** Asks first; gives the quest up if the player agrees */
  private abandon(row: QuestRow) {
    const { quest } = row;
    if (!quest) return;
    this.actions.ask(abandonQuestion(quest), () => this.actions.dropQuest(quest.id));
  }

  /** The panel made again at a new height; the gold hairline over it while a step is lit */
  private resize(height: number, lit: boolean) {
    if (height !== this.panelHeight) {
      this.panelHeight = height;
      const panel = themedPanel(WIDTH, height, BRACKETS);
      this.container.addChildAt(panel, 0);
      this.panel.destroy({ children: true });
      this.panel = panel;
    }
    this.lit.visible = lit;
    const key = `${height}`;
    if (!lit || key === this.litFor) return;
    this.litFor = key;
    drawHairline(this.lit.clear(), WIDTH, height, GOLD, 0.95);
  }
}
