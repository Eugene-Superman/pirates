import type { GameState } from '../GameState';
import { SHIP_CLASSES, STARTER_SHIP, type PlayerLineId, type ShipClassId } from '../ships/shipClasses';
import { SHIP_LINES } from '../ships/shipLines';
import { levelOf } from '../ships/talents';
import { storyReached, type StoryStepId } from '../story/story';
import { shipOf, type Player } from './player';

/**
 * The Captain's path: what the shipyard asks of a player for the next ship. The starting waters' story first (it
 * teaches the game), then the shipwright's terms: a level, the price
 */
export type PathStepId = 'story' | 'level' | 'gold';

/**
 * The lines whose ships the shipyard sells for gold, tier by tier: the ladders a player climbs after the starter
 * sloop. Its first ship is one of tier 1 of any of them; each next one, the next of the line of the ship sailed
 */
export const LADDER_LINES: readonly PlayerLineId[] = ['european', 'eastern', 'pirate', 'northern'];

/**
 * What the shipyard asks for a ship of a tier, of whichever line: its price, the level of the ship sailed now, and how
 * far along the story
 */
export interface TierTerms {
  readonly tier: number;
  readonly price: number;
  readonly level: number;
  /** The step of the story the player must have got to; null: none asked */
  readonly story: StoryStepId | null;
}

// The ladder, the same for every line (the European one is the yardstick the others are balanced against). Tier 1 is
// the starting waters' goal: a couple of hours of play, the starter sloop at its last level (10) and its story told up
// to the Seam's seal (the Baron sunk); the gold is some 80 kills with their cargo, less the repairs. Each next tier asks
// for the one before it at its last level (the level is the ship's sailed now) and its gold, nothing more: the tavern's
// quests are for the XP and gold on the way, never asked for. Its gold is three times at tier 2, near three times again
// at tier 3, two and a half times at each tier after it
const TIER_TERMS: readonly TierTerms[] = [
  { tier: 1, price: 3000, level: 10, story: 'seal' },
  { tier: 2, price: 9000, level: 10, story: null },
  { tier: 3, price: 24000, level: 20, story: null },
  { tier: 4, price: 60000, level: 30, story: null },
  { tier: 5, price: 150000, level: 40, story: null },
  { tier: 6, price: 375000, level: 50, story: null },
];

/** The next ship a player works towards: a tier, of a line or of any (the first after the starter sloop), and its terms */
export interface ShipGoal {
  readonly tier: number;
  /** The line its ship is of; null: of any of the ladders (LADDER_LINES) */
  readonly line: PlayerLineId | null;
  readonly terms: TierTerms;
}

/** A step of the path, as the HUD shows it: done or not, and how far for a counted one */
export interface PathStep {
  readonly id: PathStepId;
  readonly text: string;
  readonly done: boolean;
  /** Where a counted step stands: levels, gold */
  readonly have: number | null;
  readonly need: number | null;
}

function isClass(id: unknown): id is ShipClassId {
  return typeof id === 'string' && Object.hasOwn(SHIP_CLASSES, id);
}

/** The line of a ladder a ship is of, if it is one the shipyard sells for gold */
function ladderOf(id: string): PlayerLineId | null {
  return LADDER_LINES.find((line) => SHIP_LINES[line].ships.some((ship) => ship === id)) ?? null;
}

/** Whether a ship of a line (built or planned) is one the shipyard sells for gold, by its tier's terms */
export function isLadderShip(id: string) {
  return ladderOf(id) !== null;
}

/** What the shipyard asks for a ship of a tier: its terms, or null past the last */
export function tierTerms(tier: number): TierTerms | null {
  return TIER_TERMS.find((terms) => terms.tier === tier) ?? null;
}

/** Whether a class is one a player can sail: the starter, or a built ship of a ladder */
export function isSailable(id: unknown): id is ShipClassId {
  return isClass(id) && (id === STARTER_SHIP || isLadderShip(id));
}

/** Whether the player owns a ship of this class: the one they sail, or one laid up in port (economy/fleet.ts) */
function ownsClass(state: GameState, player: Player, id: ShipClassId) {
  const sailed = shipOf(state, player);
  return sailed?.shipClass.id === id || player.fleet.some((laidUp) => laidUp.shipClass === id);
}

/** The ships a goal may be bought as: built, of its tier and line (any ladder's, for none), not owned yet */
export function goalShips(state: GameState, player: Player, goal: ShipGoal): ShipClassId[] {
  const lines = goal.line ? [goal.line] : LADDER_LINES;
  return lines.flatMap((line) => {
    const id = SHIP_LINES[line].ships.find((ship) => isClass(ship) && SHIP_CLASSES[ship].tier === goal.tier);
    return isClass(id) && !ownsClass(state, player, id) ? [id] : [];
  });
}

/**
 * The next ship the player works towards, by the ship they sail: after the starter sloop a tier 1 ship of any ladder,
 * after a ladder's ship the next of its line. Null when there is none to buy: a ship of the last tier or of no ladder
 * (a masterwork), or every ship it may be built and owned already (or not built yet)
 */
export function shipGoal(state: GameState, player: Player): ShipGoal | null {
  const sailed = shipOf(state, player)?.shipClass;
  if (!sailed) return null;
  const starter = sailed.id === STARTER_SHIP;
  const line = starter ? null : ladderOf(sailed.id);
  const terms = tierTerms(starter ? 1 : sailed.tier + 1);
  if (!terms || (!starter && !line)) return null;
  const goal = { tier: terms.tier, line, terms };
  return goalShips(state, player, goal).length > 0 ? goal : null;
}

/** Whether a ship is one the player works towards now: one the shipyard sells them once every term is met */
export function isGoalShip(state: GameState, player: Player, id: string) {
  const goal = shipGoal(state, player);
  return goal !== null && goalShips(state, player, goal).some((ship) => ship === id);
}

function step(id: PathStepId, text: string, done: boolean, have: number | null = null, need: number | null = null) {
  return { id, text, done, have, need };
}

/** Every step of the Captain's path towards the next ship, in order, with what is done; none without a goal */
export function captainsPath(state: GameState, player: Player): PathStep[] {
  const goal = shipGoal(state, player);
  if (!goal) return [];
  const { terms } = goal;
  const level = shipOf(state, player)?.level ?? 1;
  const steps: PathStep[] = [];
  if (terms.story) {
    steps.push(step('story', 'Follow the story of the starting waters', storyReached(player, terms.story)));
  }
  steps.push(
    step('level', 'Reach level', level >= terms.level, Math.min(level, terms.level), terms.level),
    step('gold', 'Save gold', player.gold >= terms.price, Math.min(player.gold, terms.price), terms.price),
  );
  return steps;
}

/** Whether every term of the goal is met: all the steps of the path done */
export function termsMet(state: GameState, player: Player) {
  return shipGoal(state, player) !== null && captainsPath(state, player).every((s) => s.done);
}

/**
 * Whether the player has mastered a tier: has a ship of it at its class's last level, sailed or laid up, of a line
 * other than the masterworks (the starter sloop is tier 0: it opens none). A masterwork of the tier asks for it before it
 * is sold (ships/shipLines.ts)
 */
export function tierMastered(state: GameState, player: Player, tier: number) {
  const sailed = shipOf(state, player);
  const owned = player.fleet.map((kept) => ({ id: kept.shipClass, xp: kept.xp }));
  if (sailed) owned.push({ id: sailed.shipClass.id, xp: sailed.xp });
  return owned.some(({ id, xp }) => {
    const { line, tier: its, maxLevel } = SHIP_CLASSES[id];
    return line !== 'premium' && its === tier && levelOf(xp, maxLevel) >= maxLevel;
  });
}
