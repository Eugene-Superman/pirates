import { masteryPassive } from '../account/mastery';
import { BOT_KINDS, kindId, type ArchetypeKey } from '../bots/botKinds';
import type { UnitKind } from '../combat/units';
import type { GameState } from '../GameState';
import type { BonusEffect, Effects } from '../ships/bonus';
import type { Ship } from '../ships/Ship';
import type { ShipClassId } from '../ships/shipClasses';
import { gainXp, talentOf, xpGiven, xpRoom } from '../ships/talents';
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

/**
 * A quest taken: by which of the player's ships, the only one whose kills count for it and that turns it in, so a
 * strong ship can't do a quest for a weak one to earn its XP; and how many of its kind that ship has sunk since
 */
export interface ActiveQuest {
  readonly id: QuestId;
  /** The class of the player's ship that took it: a player has one ship of each (economy/fleet.ts) */
  readonly ship: ShipClassId;
  kills: number;
}

/** What adds to a quest's reward: a passive of the captain's mastery or a talent of the ship, and the share it adds */
export interface RewardBonus {
  readonly source: 'captain' | 'talent';
  /** English, as the passive or the talent is named: a twig's steps, or a talent's ranks, as one */
  readonly name: string;
  readonly share: number;
}

/** What a quest pays the player's ship that turns it in now, and what adds to each part */
export interface QuestReward {
  readonly gold: number;
  /** The XP the ship keeps: none beyond its class's last level */
  readonly xp: number;
  /** XP given beyond the ship's last level: lost */
  readonly xpLost: number;
  readonly goldBonuses: readonly RewardBonus[];
  readonly xpBonuses: readonly RewardBonus[];
}

/** Quests each of a player's ships may have at once */
export const MAX_QUESTS = 3;

// Rewards worth a few kills' bounties, more for the dangerous ones; every quest can be taken again once turned in. The
// starting waters' experience is two and a half times the table's, as their bots' is (bots/botKinds.ts)
const STARTER_QUESTS: Readonly<Record<StarterQuestId, Quest>> = {
  fishers: {
    id: 'fishers',
    zone: START_ZONE,
    title: 'Empty nets',
    text: 'The fishing boats drag our reefs for glass and scare the fish off. Sink five of them.',
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
// The effects (ships/bonus.ts) that add to a quest's gold (questGold) and to its XP (talents.ts, xpGiven)
const GOLD_EFFECTS: readonly BonusEffect[] = ['questGold', 'gold'];
const XP_EFFECTS: readonly BonusEffect[] = ['xp', 'questXp'];

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

/** Quests each of the player's ships may have at once: MAX_QUESTS, more with the captain's Busy captain */
export function questLimit(state: GameState, player: Player) {
  return MAX_QUESTS + (shipOf(state, player)?.captain.quests ?? 0);
}

/** The quests of the ship the player sails; the other ships' wait for them, laid up in port */
export function shipQuests(state: GameState, player: Player): ActiveQuest[] {
  const ship = shipOf(state, player);
  return ship ? player.quests.filter((q) => q.ship === ship.shipClass.id) : [];
}

/** The quest of this id the ship the player sails has taken, if it has */
export function takenQuest(state: GameState, player: Player, id: QuestId) {
  return shipQuests(state, player).find((q) => q.id === id);
}

/**
 * Takes a quest at the tavern of its sea, for the ship the player sails: in port, not taken by it yet, and fewer than
 * questLimit on hand. False if it can't
 */
export function takeQuest(state: GameState, player: Player, id: QuestId) {
  const ship = shipOf(state, player);
  if (!ship || !docked(state, player) || shipQuests(state, player).length >= questLimit(state, player)) return false;
  if (!questOffered(player, id)) return false;
  if (QUESTS[id].zone !== state.world.zone) return false;
  if (takenQuest(state, player, id)) return false;
  player.quests.push({ id, ship: ship.shipClass.id, kills: 0 });
  return true;
}

/** Gives a quest of the ship the player sails up, with nothing for it */
export function dropQuest(state: GameState, player: Player, id: QuestId) {
  const quest = takenQuest(state, player, id);
  player.quests = player.quests.filter((q) => q !== quest);
}

/** A quest's gold for the ship that turns it in: more with its talents and the captain's mastery */
function questGold(ship: Ship | undefined, id: QuestId) {
  const share = ship ? 1 + ship.bonus.questGold + ship.bonus.gold : 1;
  return Math.round(QUESTS[id].reward * share);
}

/**
 * The passives of the player's mastery and the talents of their ship that give any of these effects, with what they
 * give of them together
 */
function bonusesFor(ship: Ship, player: Player, effects: readonly BonusEffect[]): RewardBonus[] {
  const of = (given: Effects) => effects.reduce((sum, effect) => sum + (given[effect] ?? 0), 0);
  const bonuses = new Map<string, RewardBonus>();
  const add = (source: RewardBonus['source'], name: string, share: number) => {
    if (share === 0) return;
    const key = `${source}:${name}`;
    bonuses.set(key, { source, name, share: (bonuses.get(key)?.share ?? 0) + share });
  };
  for (const id of player.mastery) {
    const passive = masteryPassive(id);
    if (passive) add('captain', passive.name, of(passive.effects));
  }
  for (const [id, rank] of ship.talentRanks()) {
    const talent = talentOf(id);
    if (talent.kind === 'branch') add('talent', talent.name, of(talent.effects) * rank);
  }
  return [...bonuses.values()];
}

/** What a quest would pay the player now, turned in by the ship they sail, and what adds to it: for the tavern */
export function questReward(state: GameState, player: Player, id: QuestId): QuestReward {
  const ship = shipOf(state, player);
  const gold = questGold(ship, id);
  if (!ship) return { gold, xp: 0, xpLost: 0, goldBonuses: [], xpBonuses: [] };
  const given = xpGiven(ship, QUESTS[id].xp, 'quest');
  const xp = Math.min(given, xpRoom(ship));
  return {
    gold,
    xp,
    xpLost: given - xp,
    goldBonuses: bonusesFor(ship, player, GOLD_EFFECTS),
    xpBonuses: bonusesFor(ship, player, XP_EFFECTS),
  };
}

/**
 * Turns a done quest in at a tavern (of any sea) for its reward and experience, more with the captain's mastery and
 * the ship's talents: by the ship that took it. False if it isn't done, or the ship isn't in port
 */
export function turnInQuest(state: GameState, player: Player, id: QuestId) {
  const quest = takenQuest(state, player, id);
  if (!quest || !docked(state, player) || quest.kills < QUESTS[id].count) return false;
  player.quests = player.quests.filter((q) => q !== quest);
  player.progress.questsDone++;
  const ship = shipOf(state, player);
  const at = ship ? { x: ship.x, y: ship.y, z: ship.height } : { x: 0, y: 0, z: 0 };
  earn(state, player, { amount: questGold(ship, id), reason: 'quest', kind: null, quest: id, at });
  if (ship) gainXp(state, ship, QUESTS[id].xp, 'quest', at);
  return true;
}

/**
 * A unit of this kind was sunk in a sea by the player's ship of this class: every quest that ship took of that sea
 * after that kind counts it
 */
export function countKill(player: Player, ship: ShipClassId, kind: UnitKind, zone: ZoneId) {
  for (const quest of player.quests) {
    const { target, count, zone: its } = QUESTS[quest.id];
    if (quest.ship === ship && target === kind && its === zone && quest.kills < count) quest.kills++;
  }
}

/** Whether a quest taken is done: ready to turn in */
export function questDone(quest: ActiveQuest) {
  return quest.kills >= QUESTS[quest.id].count;
}
