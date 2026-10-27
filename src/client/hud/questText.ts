import { SHIP_CLASSES, ZONES, type Quest } from '../../game';
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
