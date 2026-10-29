import { SHIP_CLASSES, ZONES, goalShips, type GameState, type Quest, type ShipGoal } from '../../game';
import { t } from '../i18n/i18n';

/** A name to start a sentence with */
function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * What a quest's texts name, translated: its target, its sea, how many. A sea's quests are made from its bots
 * (economy/quests.ts), their texts with these in them; the starting waters' name nothing
 */
function names(quest: Quest) {
  const target = t(SHIP_CLASSES[quest.target].name);
  const zone = t(ZONES[quest.zone].name);
  return { target, Target: capital(target), zone, Zone: capital(zone), count: quest.count };
}

/** A quest's title, as the player reads it */
export function questTitle(quest: Quest) {
  return t(quest.title, names(quest));
}

/** What the tavern keeper says of a quest, as the player reads it */
export function questText(quest: Quest) {
  return t(quest.text, names(quest));
}

/**
 * The ship the player works towards, in the tracker's header: the next of their line by its name, or the first after
 * the starter sloop, of any line, by its tier
 */
export function goalTitle(state: GameState, goal: ShipGoal) {
  const [ship] = goalShips(state, state.player, goal);
  return goal.line && ship
    ? t('Goal: the {ship}', { ship: t(SHIP_CLASSES[ship].name) })
    : t('Goal: a tier {tier} ship', { tier: goal.tier });
}
