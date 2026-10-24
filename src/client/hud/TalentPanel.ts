import type { Container, Rectangle, Text } from 'pixi.js';
import {
  BRANCHES,
  BRANCH_IDS,
  MAX_LEVEL,
  MILESTONES,
  ROW_POINTS,
  TALENTS,
  branchTalents,
  pointsSpent,
  respecPrice,
  signatureChoices,
  talentBlock,
  talentPoints,
  xpForLevel,
  type BranchId,
  type Player,
  type Ship,
  type TalentId,
} from '../../game';
import { HudWindow, Tile, UI, show, text, tint } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1000; // pixels, before scaling down to fit the screen
const HEIGHT = 660;
const PAD = 18;
const TOP = 98; // where the columns start
const SIGNATURE = { width: 330, height: 44, gap: 4, label: 20, block: 6 } as const;
const BRANCH_X = PAD + SIGNATURE.width + 26;
const BRANCH_GAP = 12;
const BRANCH_WIDTH = (WIDTH - BRANCH_X - PAD - BRANCH_GAP * 2) / 3;
const CARD = { height: 52, gap: 5 } as const;
const ROW_LABEL = 17; // pixels: a branch row's "3 points" line
const RESET = { width: 220, height: 28 };

export interface TalentActions {
  /** Takes a talent (a rank of a branch talent, or a signature talent); false if it can't */
  learnTalent: (id: TalentId) => boolean;
  /** Forgets every talent at the shipwright's, for gold; false if not in port or short of it */
  resetTalents: () => boolean;
}

interface Card {
  readonly id: TalentId;
  readonly tile: Tile;
  readonly name: Text;
  readonly rank: Text;
  readonly about: Text;
}

/**
 * The talent tree (K). On the left the signature talents: at levels 5, 10, 15 and 20 one of two. On the right the
 * three branches: every other level from 2 gives a point, spent a rank at a time; a branch's next row opens with
 * ROW_POINTS more points spent in it. What can be taken now is lit, what is taken shows its rank, the rest is dim.
 * Only what the ship's class can reach is shown: the starter sloop, up to level 10, has the milestones 5 and 10 and
 * the rows its points open. The shipwright forgets them all for gold, in port. Closed by Close, Escape, K or a click
 * beside it
 */
export class TalentPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly panel: Container;
  private readonly progress = text('', 14, UI.text, { fontWeight: 'bold' });
  private readonly points = text('', 14, UI.active, { fontWeight: 'bold' });
  private readonly milestones: { readonly level: number; readonly label: Text }[] = [];
  private readonly branchHeads: { readonly id: BranchId; readonly label: Text }[] = [];
  private readonly rowLocks: { readonly branch: BranchId; readonly row: number; readonly label: Text }[] = [];
  private readonly cards: Card[] = [];
  private readonly reset: Tile;
  private readonly resetText = text('', 12, UI.text, { fontWeight: 'bold' });
  private readonly message = text('', 12, UI.dim);
  /** The message is the last reset's: it stays up till the panel is closed */
  private said = false;
  private readonly actions: TalentActions;

  /** maxLevel: the ship's class's last level, which sets how much of the tree it has */
  constructor(actions: TalentActions, screen: Rectangle, maxLevel: number) {
    this.actions = actions;
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide());
    this.container = this.window.container;
    this.panel = this.window.panel;
    const milestones = MILESTONES.filter((m) => m <= maxLevel);
    // A branch's rows that the points of the class's last level can open
    const rows = Math.floor(talentPoints(maxLevel) / ROW_POINTS) + 1;
    const title = text(t('Talents'), 20, UI.active, { fontWeight: 'bold' });
    title.position.set(PAD, PAD);
    this.progress.position.set(PAD + title.width + 18, PAD + 4);
    const note = text(
      t('A point at every level from 2 for the branches; at levels {levels} a signature talent instead', {
        levels: milestones.join(', '),
      }),
      12,
      UI.dim,
    );
    note.position.set(PAD, PAD + 30);
    this.points.anchor.set(1, 0);
    this.points.position.set(WIDTH - PAD - 84, PAD + 4);
    this.panel.addChild(title, this.progress, this.points, note);

    const signaturesEnd = this.buildSignatures(milestones);
    BRANCH_IDS.forEach((id, i) => this.buildBranch(id, BRANCH_X + i * (BRANCH_WIDTH + BRANCH_GAP), rows));
    if (maxLevel < MAX_LEVEL) {
      const more = text(
        t('This ship goes up to level {level}: the rest of the tree comes with a ship of a higher tier', {
          level: maxLevel,
        }),
        12,
        UI.dim,
        { wordWrap: true, wordWrapWidth: SIGNATURE.width },
      );
      more.position.set(PAD, signaturesEnd + 6);
      this.panel.addChild(more);
    }

    this.reset = new Tile(RESET.width, RESET.height, () => this.forget(), 6);
    this.resetText.anchor.set(0.5);
    this.resetText.position.set(RESET.width / 2, RESET.height / 2);
    this.reset.content.addChild(this.resetText);
    const bottom = HEIGHT - PAD - RESET.height;
    this.reset.container.position.set(PAD, bottom);
    this.message.position.set(PAD + RESET.width + 14, bottom + (RESET.height - 14) / 2);
    this.panel.addChild(this.reset.container, this.message);
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    this.container.visible = !this.container.visible;
    this.said = false;
  }

  hide() {
    this.container.visible = false;
    this.said = false;
  }

  update(ship: Ship, player: Player) {
    if (!this.isOpen) return;
    this.window.fit();

    const { level, xp } = ship;
    show(
      this.progress,
      level >= ship.shipClass.maxLevel
        ? t('Level {level} · the highest for this ship', { level })
        : t('Level {level} · {xp} / {need} XP to the next', {
            level,
            xp: xp - xpForLevel(level),
            need: xpForLevel(level + 1) - xpForLevel(level),
          }),
    );
    const left = talentPoints(level) - pointsSpent(ship);
    show(this.points, left > 0 ? t('{n} point to spend|{n} points to spend', { n: left }) : '');

    for (const { level: at, label } of this.milestones) {
      const picked = signatureChoices(at).some((s) => ship.hasTalent(s.id));
      tint(label, at > level ? UI.dim : picked ? UI.text : UI.active);
    }
    for (const { id, label } of this.branchHeads) {
      show(label, `${t(BRANCHES[id].name)} · ${pointsSpent(ship, id)}`);
    }
    for (const { branch, row, label } of this.rowLocks) {
      tint(label, pointsSpent(ship, branch) >= row * ROW_POINTS ? UI.good : UI.dim);
    }
    for (const card of this.cards) {
      const talent = TALENTS[card.id];
      const rank = ship.rank(card.id);
      const max = talent.kind === 'branch' ? talent.maxRank : 1;
      const open = talentBlock(ship, card.id) === null;
      const full = rank >= max;
      card.tile.setLook({
        pressed: full,
        disabled: rank === 0 && !open,
        border: full || open || rank > 0 ? UI.active : UI.border,
      });
      show(card.rank, talent.kind === 'branch' ? `${rank}/${max}` : '');
      tint(card.name, full ? UI.darkText : UI.text);
      tint(card.rank, full ? UI.darkText : rank > 0 ? UI.active : UI.dim);
      tint(card.about, full ? UI.darkText : UI.dim);
    }
    const price = respecPrice(ship);
    show(this.resetText, price > 0 ? t('Forget them all: {n} gold', { n: price }) : t('Nothing to forget'));
    this.reset.setLook({ disabled: !ship.docked || price === 0 || player.gold < price });
    if (this.said) return;
    show(this.message, ship.docked ? t('The shipwright retrains the crew') : t('Only in port, at the shipwright'));
    tint(this.message, UI.dim);
  }

  /** The milestones down the left: a level's label over its two signature talents. Returns where they end */
  private buildSignatures(milestones: readonly number[]) {
    const heading = text(t('Signature talents'), 15, UI.text, { fontWeight: 'bold' });
    heading.position.set(PAD, TOP - 24);
    this.panel.addChild(heading);
    let y = TOP;
    for (const level of milestones) {
      const label = text(t('Level {level}: one of two', { level }), 13, UI.dim, { fontWeight: 'bold' });
      label.position.set(PAD, y);
      this.panel.addChild(label);
      this.milestones.push({ level, label });
      y += SIGNATURE.label;
      for (const talent of signatureChoices(level)) {
        const card = this.card(talent.id, SIGNATURE.width, SIGNATURE.height);
        card.tile.container.position.set(PAD, y);
        this.panel.addChild(card.tile.container);
        y += SIGNATURE.height + SIGNATURE.gap;
      }
      y += SIGNATURE.block;
    }
    return y;
  }

  /**
   * A branch's column: its name and points, then row by row its talents, each row with the points that open it.
   * rows: how many of its rows the ship's class can open
   */
  private buildBranch(id: BranchId, x: number, rows: number) {
    const head = text('', 15, UI.text, { fontWeight: 'bold' });
    head.position.set(x, TOP - 24);
    const about = text(t(BRANCHES[id].text), 11, UI.dim);
    about.position.set(x, TOP - 6);
    this.panel.addChild(head, about);
    this.branchHeads.push({ id, label: head });
    const talents = branchTalents(id);
    let y = TOP + 14;
    const last = Math.min(rows, Math.max(...talents.map((b) => b.row)) + 1);
    for (let row = 0; row < last; row++) {
      if (row > 0) {
        const lock = text(t('{n} point in the branch|{n} points in the branch', { n: row * ROW_POINTS }), 11, UI.dim);
        lock.position.set(x, y);
        this.panel.addChild(lock);
        this.rowLocks.push({ branch: id, row, label: lock });
        y += ROW_LABEL;
      }
      for (const talent of talents.filter((b) => b.row === row)) {
        const card = this.card(talent.id, BRANCH_WIDTH, CARD.height);
        card.tile.container.position.set(x, y);
        this.panel.addChild(card.tile.container);
        y += CARD.height + CARD.gap;
      }
      y += 4;
    }
  }

  private card(id: TalentId, width: number, height: number): Card {
    const { name, text: about } = TALENTS[id];
    const tile = new Tile(width, height, () => this.actions.learnTalent(id), 6);
    const title = text(t(name), 13, UI.text, { fontWeight: 'bold' });
    title.position.set(9, 4);
    const rank = text('', 12, UI.dim, { fontWeight: 'bold' });
    rank.anchor.set(1, 0);
    rank.position.set(width - 8, 4);
    const line = text(t(about), 11, UI.dim, { wordWrap: true, wordWrapWidth: width - 18 });
    line.position.set(9, 21);
    tile.content.addChild(title, rank, line);
    const card = { id, tile, name: title, rank, about: line };
    this.cards.push(card);
    return card;
  }

  private forget() {
    if (this.actions.resetTalents()) {
      show(this.message, t('Forgotten: pick again'));
      tint(this.message, UI.good);
      this.said = true;
    }
  }
}
