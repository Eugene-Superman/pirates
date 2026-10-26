import type { GameState } from '../GameState';
import { SHIP_CLASSES, STARTER_SHIP, type ShipClassId } from '../ships/shipClasses';
import { levelOf } from '../ships/talents';
import { shipOf, type Player } from './player';

/**
 * The Captain's path: what a new player does in the starting waters, step by step, to earn the next ship. The first
 * steps teach the game (a kill, a talent, a repair at sea, a sale at the market), the rest are the shipyard's terms
 */
export type PathStepId = 'sink' | 'talent' | 'repair' | 'sell' | 'quests' | 'level' | 'baron' | 'gold';

/** A ship the port's shipyard sells, and its terms: the level of the ship sailed now, quests turned in, the boss sunk */
export interface ShipOffer {
  readonly shipClass: ShipClassId;
  readonly price: number;
  readonly level: number;
  readonly quests: number;
  readonly baron: boolean;
}

// The goal of the starting waters: a couple of hours of play. The level is about where the starting bots stop
// paying full XP (ships/talents.ts, xpForKill); the gold is some 80 kills with their cargo, less the repairs
export const SHIP_OFFERS: readonly ShipOffer[] = [
  { shipClass: 'coastalBark', price: 3000, level: 7, quests: 5, baron: true },
];

/** A step of the path, as the HUD shows it: done or not, and how far for a counted one */
export interface PathStep {
  readonly id: PathStepId;
  readonly text: string;
  readonly done: boolean;
  /** Where a counted step stands: quests, levels, gold */
  readonly have: number | null;
  readonly need: number | null;
}

/** Whether a class is one a player can sail: the starter, or one the shipyard sells */
export function isSailable(id: unknown): id is ShipClassId {
  return id === STARTER_SHIP || SHIP_OFFERS.some((offer) => offer.shipClass === id);
}

/** Whether the player owns a ship of this class: the one they sail, or one laid up in port (economy/fleet.ts) */
function ownsClass(state: GameState, player: Player, id: ShipClassId) {
  const sailed = shipOf(state, player);
  return sailed?.shipClass.id === id || player.fleet.some((laidUp) => laidUp.shipClass === id);
}

/** The next ship the player works towards: the first offer they don't own yet; null once they own them all */
export function goalOffer(state: GameState, player: Player): ShipOffer | null {
  return SHIP_OFFERS.find((offer) => !ownsClass(state, player, offer.shipClass)) ?? null;
}

function step(id: PathStepId, text: string, done: boolean, have: number | null = null, need: number | null = null) {
  return { id, text, done, have, need };
}

/** Every step of the Captain's path towards the next ship, in order, with what is done; none without a goal */
export function captainsPath(state: GameState, player: Player): PathStep[] {
  const offer = goalOffer(state, player);
  if (!offer) return [];
  const ship = shipOf(state, player);
  const level = ship?.level ?? 1;
  const marked = (id: PathStepId) => player.progress.steps.includes(id);
  const { questsDone } = player.progress;
  return [
    step('sink', 'Sink a ship or a sea monster', marked('sink')),
    step('talent', 'Take a talent (K)', marked('talent')),
    step('repair', 'Repair your hull at sea (R)', marked('repair')),
    step('sell', 'Sell cargo at the port market', marked('sell')),
    step(
      'quests',
      'Turn in tavern quests',
      questsDone >= offer.quests,
      Math.min(questsDone, offer.quests),
      offer.quests,
    ),
    step('level', 'Reach level', level >= offer.level, Math.min(level, offer.level), offer.level),
    ...(offer.baron ? [step('baron', 'Sink the Smuggler Baron', marked('baron'))] : []),
    step('gold', 'Save gold', player.gold >= offer.price, Math.min(player.gold, offer.price), offer.price),
  ];
}

/** Whether every term of the goal's offer is met: all the steps of the path done */
export function termsMet(state: GameState, player: Player) {
  return goalOffer(state, player) !== null && captainsPath(state, player).every((s) => s.done);
}

/**
 * Whether the player has mastered a tier: has a ship of it at its class's last level, sailed or laid up, of a line
 * other than the masterworks (the starter's sloop counts for tier 1). A masterwork of the tier asks for it before it
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

/** The offer's ship's name, for the HUD */
export function offerName(offer: ShipOffer) {
  return SHIP_CLASSES[offer.shipClass].name;
}
