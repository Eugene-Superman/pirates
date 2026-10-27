import { BOT_KINDS, kindId, type ArchetypeKey } from '../bots/botKinds';
import type { UnitKind } from '../combat/units';
import type { GameState } from '../GameState';
import { gainXp } from '../ships/talents';
import { START_ZONE, ZONE_IDS, type OuterZoneId, type ZoneId } from '../world/zones';
import { earn, shipOf, type Player } from './player';

/** The starting waters' own quests */
type StarterQuestId = 'fishers' | 'turtles' | 'merchants' | 'smugglers' | 'serpents' | 'baron';
/** The kinds of bots (bots/botKinds.ts, ARCHETYPES) every other sea's tavern puts a bounty on */
type SeaQuestKey = Exclude<ArchetypeKey, 'raider'>;
/** A tavern's quest, by id: the starting waters' own (`turtles`…), and every other sea's (`coralCoast.pirate`) */
export type QuestId = StarterQuestId | `${OuterZoneId}.${SeaQuestKey}`;

/** A bounty the tavern offers: sink (or kill) so many of one kind, then come back for the reward */
export interface Quest {
  readonly id: QuestId;
  /** The sea whose tavern offers it, and where its kills count */
  readonly zone: ZoneId;
  /** English; may name {target}, {zone} and {count}, filled in where it is shown */
  readonly title: string;
  /** What the tavern keeper says about it, like the title */
  readonly text: string;
  /** The hull class to sink */
  readonly target: UnitKind;
  readonly count: number;
  /** Gold, on top of each kill's bounty */
  readonly reward: number;
  /** Experience for the ship that turns it in, on top of each kill's */
  readonly xp: number;
  /** Quests the player must have turned in before the tavern offers this one */
  readonly after: number;
}

/** A quest taken: how many of its kind the player has sunk since */
export interface ActiveQuest {
  readonly id: QuestId;
  kills: number;
}

/** Quests a player may have at once */
export const MAX_QUESTS = 3;

// Rewards worth a few kills' bounties, more for the dangerous ones; every quest can be taken again once turned in. The
// starting waters' experience is two and a half times the table's, as their bots' is (bots/botKinds.ts)
const STARTER_QUESTS: Readonly<Record<StarterQuestId, Quest>> = {
  fishers: {
    id: 'fishers',
    zone: START_ZONE,
    title: 'Empty nets',
    text: 'The fishing boats are scaring the fish off our reefs. Sink five of them.',
    target: 'fishingBoat',
    count: 5,
    reward: 50,
    xp: 100,
    after: 0,
  },
  turtles: {
    id: 'turtles',
    zone: START_ZONE,
    title: 'Turtle soup',
    text: 'The cook wants turtle meat. Hunt five sea turtles; mind their jaws.',
    target: 'seaTurtle',
    count: 5,
    reward: 120,
    xp: 225,
    after: 0,
  },
  merchants: {
    id: 'merchants',
    zone: START_ZONE,
    title: 'Raid the trade',
    text: 'Merchant sloops sail past without paying their dues. Sink three.',
    target: 'merchantSloop',
    count: 3,
    reward: 120,
    xp: 250,
    after: 0,
  },
  smugglers: {
    id: 'smugglers',
    zone: START_ZONE,
    title: 'Smugglers wanted',
    text: 'Smugglers attack anyone who comes near. The harbour master pays for three sunk.',
    target: 'smugglerSloop',
    count: 3,
    reward: 160,
    xp: 325,
    after: 0,
  },
  serpents: {
    id: 'serpents',
    zone: START_ZONE,
    title: "Serpent's bane",
    text: 'Sea serpents drag our boats under. Kill three, and keep your harpoons sharp.',
    target: 'seaSerpent',
    count: 3,
    reward: 180,
    xp: 375,
    after: 0,
  },
  // The starting waters' last bounty: the boss (bots/botKinds.ts, `baron`), once the player knows the sea
  baron: {
    id: 'baron',
    zone: START_ZONE,
    title: 'The Smuggler Baron',
    text: 'The Baron and his smugglers hold the north-east. Sink his brig, and watch for his mortar: get out of the circles.',
    target: 'baronBrig',
    count: 1,
    reward: 300,
    xp: 750,
    after: 3,
  },
};

// The other seas' quests, made from their bots (bots/botKinds.ts): so many of an archetype's kind sunk, for a share of
// what the kills pay in gold and experience: together, about a quarter of the experience a ship earns in its sea
const SEA_QUESTS: readonly {
  readonly key: SeaQuestKey;
  readonly count: number;
  readonly title: string;
  readonly text: string;
}[] = [
  {
    key: 'trader',
    count: 5,
    title: 'Bounty: {target}',
    text: 'The harbour master of {zone} pays for {count} of them sunk.',
  },
  {
    key: 'grazer',
    count: 4,
    title: 'Hunt: {target}',
    text: 'The cook of {zone} wants {count} of them, and mind their jaws.',
  },
  {
    key: 'pirate',
    count: 5,
    title: 'Bounty: {target}',
    text: 'The harbour master of {zone} pays for {count} of them sunk.',
  },
  {
    key: 'hunter',
    count: 4,
    title: 'Hunt: {target}',
    text: '{count} of them prey on the ships of {zone}. Hunt them down.',
  },
  { key: 'elite', count: 1, title: 'Wanted: {target}', text: 'One {target} rules the sea lanes of {zone}. Sink it.' },
  {
    key: 'boss',
    count: 1,
    title: 'The terror of {zone}',
    text: 'Sink the {target} at its lair, and its escort scatters.',
  },
];
const QUEST_GOLD = 0.8; // a quest's gold, as a share of what its kills' bounties pay
const QUEST_XP = 0.6; // and its experience, of what its kills bring

function seaQuests(zone: OuterZoneId): Quest[] {
  return SEA_QUESTS.map(({ key, count, title, text }) => {
    const kind = BOT_KINDS[kindId(zone, key)];
    return {
      id: `${zone}.${key}` as const,
      zone,
      title,
      text,
      target: kind.shipClass,
      count,
      reward: Math.round(count * kind.bounty * QUEST_GOLD),
      xp: Math.round(count * kind.xp * QUEST_XP),
      after: 0,
    };
  });
}

// Every tavern's quests, the starting waters' first, each sea's in its tavern's order
const ALL_QUESTS: readonly Quest[] = [
  ...Object.values(STARTER_QUESTS),
  ...ZONE_IDS.flatMap((zone) => (zone === START_ZONE ? [] : seaQuests(zone))),
];

/**
 * Every tavern's quests of every sea, by id: every QuestId has its quest (the starting waters' own, every sea's on
 * each of its kinds), but a table made from a list is keyed by any string
 */
export const QUESTS: Readonly<Record<string, Quest>> = Object.fromEntries(ALL_QUESTS.map((quest) => [quest.id, quest]));

export const QUEST_IDS: readonly QuestId[] = ALL_QUESTS.map((quest) => quest.id);

/** The quests the tavern of a sea offers, in order */
export function zoneQuests(zone: ZoneId): readonly QuestId[] {
  return QUEST_IDS.filter((id) => QUESTS[id].zone === zone);
}

function docked(state: GameState, player: Player) {
  return state.ships.some((ship) => ship.id === player.shipId && ship.docked);
}

/** Whether the tavern offers a quest to this player yet: some wait till others have been turned in */
export function questOffered(player: Player, id: QuestId) {
  return player.progress.questsDone >= QUESTS[id].after;
}

/**
 * Takes a quest at the tavern of its sea: in port, not taken yet, and fewer than MAX_QUESTS on hand. False if it can't
 */
export function takeQuest(state: GameState, player: Player, id: QuestId) {
  if (!docked(state, player) || player.quests.length >= MAX_QUESTS || !questOffered(player, id)) return false;
  if (QUESTS[id].zone !== state.world.zone) return false;
  if (player.quests.some((q) => q.id === id)) return false;
  player.quests.push({ id, kills: 0 });
  return true;
}

/** Gives a quest up, with nothing for it */
export function dropQuest(player: Player, id: QuestId) {
  player.quests = player.quests.filter((q) => q.id !== id);
}

/**
 * Turns a done quest in at a tavern (of any sea) for its reward and experience. False if it isn't done, or the ship
 * isn't in port
 */
export function turnInQuest(state: GameState, player: Player, id: QuestId) {
  const quest = player.quests.find((q) => q.id === id);
  if (!quest || !docked(state, player) || quest.kills < QUESTS[id].count) return false;
  player.quests = player.quests.filter((q) => q !== quest);
  player.progress.questsDone++;
  const ship = shipOf(state, player);
  const at = ship ? { x: ship.x, y: ship.y, z: ship.height } : { x: 0, y: 0, z: 0 };
  earn(state, player, { amount: QUESTS[id].reward, reason: 'quest', kind: null, quest: id, at });
  if (ship) gainXp(state, ship, QUESTS[id].xp, 'quest', at);
  return true;
}

/** A unit of this kind was sunk by the player in a sea: every quest of that sea after that kind counts it */
export function countKill(player: Player, kind: UnitKind, zone: ZoneId) {
  for (const quest of player.quests) {
    const { target, count, zone: its } = QUESTS[quest.id];
    if (target === kind && its === zone && quest.kills < count) quest.kills++;
  }
}

/** Whether a quest taken is done: ready to turn in */
export function questDone(quest: ActiveQuest) {
  return quest.kills >= QUESTS[quest.id].count;
}
