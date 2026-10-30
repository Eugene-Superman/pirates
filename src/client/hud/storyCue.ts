import {
  START_ZONE,
  canPayRepair,
  marketValue,
  milestonesToPick,
  objectiveNeed,
  pointsToSpend,
  questsToTurnIn,
  shipQuests,
  storyFitting,
  storyStep,
  storyTalk,
  termsMet,
  type GameState,
  type Objective,
  type WeaponId,
} from '../../game';

/**
 * What the story asks a new player to press now, for the HUD to light it with its gold pointer (StoryGuide), so one
 * who reads none of it still gets through the starting waters: the guns in the hold fitted (`fit`: the loadout shows
 * how), out of port to do the step at sea (`setSail`, till they first leave it), the goods sold at the market (`sell`), a
 * bounty taken at the tavern (`takeQuest`) and turned in there once done (`turnInQuest`), the workshop's cheapest outfit
 * bought and fitted (`outfit`), a talent taken (`talent`), a weapon picked (`weapon`), the hull mended (`repair`), the
 * shipyard's new ship bought (`buyShip`)
 */
export type StoryCue =
  | {
      readonly kind:
        'fit' | 'setSail' | 'sell' | 'takeQuest' | 'turnInQuest' | 'outfit' | 'talent' | 'repair' | 'buyShip';
    }
  | { readonly kind: 'weapon'; readonly weapon: WeaponId };

/**
 * The story's cue now, if any: none while a conversation is to be heard out, outside the starting waters, or with
 * nothing the player can press for it yet (no goods to sell, no point for a talent, the hull whole, a fight on)
 */
export function storyCue(state: GameState): StoryCue | null {
  const { player, ship } = state;
  const step = storyStep(player);
  const { told, counts, closing } = player.story;
  if (!step || !told || closing !== null || state.world.zone !== START_ZONE || ship.isSinking) return null;
  if (storyTalk(state, player)) return null;
  if (storyFitting(state, player)) return { kind: 'fit' };
  const unmet = step.objectives.filter((objective, i) => (counts[i] ?? 0) < objectiveNeed(objective));
  const asks = (kind: Objective['kind']) => unmet.some((objective) => objective.kind === kind);
  if (ship.docked) {
    if (asks('sell') && marketValue(ship) > 0) return { kind: 'sell' };
    if (asks('ship')) return termsMet(state, player) ? { kind: 'buyShip' } : null;
    const quests = shipQuests(state, player);
    if (asks('turnInQuest') && questsToTurnIn(state, player).length > 0) return { kind: 'turnInQuest' };
    // One to take, or another once the one taken was given up
    if (asks('takeQuest') || (asks('turnInQuest') && quests.length === 0)) return { kind: 'takeQuest' };
    if (asks('outfit')) return { kind: 'outfit' };
    // Whatever else is left is done at sea: a mark, a hunt, goods to haul for the market, a talent once a point comes.
    // Lit only till the player first leaves port (a new one starts in it): from then on they know the way out
    if (player.stats.timeAtSea > 0) return null;
    return unmet.some((objective) => objective.kind !== 'fit') ? { kind: 'setSail' } : null;
  }
  if (asks('talent') && pointsToSpend(ship) + milestonesToPick(ship) > 0) return { kind: 'talent' };
  for (const objective of unmet) {
    if (objective.kind === 'weapon' && ship.weapon !== objective.weapon) {
      return { kind: 'weapon', weapon: objective.weapon };
    }
  }
  const mendable = ship.hp < ship.maxHp && !ship.inCombat(state.time) && canPayRepair(state, ship);
  if (asks('repair') && !ship.repairing && mendable) return { kind: 'repair' };
  return null;
}
