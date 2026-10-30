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
import { givePrizes, type Prize } from './prizes';

/** The starting waters' own quests */
type StarterQuestId =
  'fishers' | 'turtles' | 'merchants' | 'smugglers' | 'serpents' | 'jackals' | 'inkmother' | 'baron';
/** The kinds of bots (bots/botKinds.ts, ARCHETYPES) every other sea's tavern puts a bounty on */
type SeaQuestKey = Exclude<ArchetypeKey, 'raider'>;
/** A tavern's quest, by id: the starting waters' own (`turtles`…), and every other sea's (`coralCoast.pirate`) */
export type QuestId = StarterQuestId | `${OuterZoneId}.${SeaQuestKey}`;

/**
 * How hard a quest is, for the tavern to tell before it is taken: its prey neutral (easy) or out to sink the player
 * (hard), an elite or a mini-boss, a sea's boss (epic)
 */
export type QuestGrade = 'easy' | 'hard' | 'elite' | 'epic';

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
  readonly grade: QuestGrade;
  /** What it gives besides, the first time the player turns it in (none for the seas past the starting waters, yet) */
  readonly prizes: readonly Prize[];
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
  /** How many times the player has turned it in before */
  readonly times: number;
  /** The share of its gold and experience it pays this time (REPEAT_SHARES) */
  readonly share: number;
  /** Its prizes, this the first time; none after */
  readonly prizes: readonly Prize[];
}

/** Quests each of a player's ships may have at once */
export const MAX_QUESTS = 3;

// A dozen or so of a kind, not a few: a quest is an outing of its own, not a minute's errand. Its gold is about what its
// kills' bounties pay, its experience most of what they bring (the starting waters' two and a half times the table's,
// as their bots' is, bots/botKinds.ts); every quest can be taken again once turned in, paying less from its third
// time (REPEAT_SHARES). The first time, prizes besides, worth more up the grades: a piece of outfit or a gun of the
// arsenal's and some of the Golden Galleon's items, a gun of the next tier from the mini-boss and the Baron, doubloons
const STARTER_QUESTS: Readonly<Record<StarterQuestId, Quest>> = {
  fishers: {
    id: 'fishers',
    zone: START_ZONE,
    title: 'Empty nets',
    text: 'The fishing boats drag our reefs for glass and scare the fish off. Sink {count} of them.',
    target: 'fishingBoat',
    count: 12,
    reward: 80,
    xp: 250,
    after: 0,
    grade: 'easy',
    prizes: [
      { kind: 'outfit', id: 'spyglass', count: 1 },
      { kind: 'item', id: 'fishingNets', count: 2 },
      { kind: 'item', id: 'canvasPatch', count: 2 },
    ],
  },
  turtles: {
    id: 'turtles',
    zone: START_ZONE,
    title: 'Turtle soup',
    text: 'The cook wants turtle meat, a barrel of it. Hunt {count} sea turtles; mind their jaws.',
    target: 'seaTurtle',
    count: 10,
    reward: 150,
    xp: 400,
    after: 0,
    grade: 'easy',
    prizes: [
      { kind: 'outfit', id: 'oakPlanking', count: 1 },
      { kind: 'ammo', id: 'barbedHarpoon', count: 100 },
      { kind: 'item', id: 'cabinBoysScroll', count: 2 },
    ],
  },
  merchants: {
    id: 'merchants',
    zone: START_ZONE,
    title: 'Raid the trade',
    text: 'Merchant sloops sail past without paying their dues. Sink {count} of them.',
    target: 'merchantSloop',
    count: 10,
    reward: 180,
    xp: 600,
    after: 0,
    grade: 'easy',
    prizes: [
      { kind: 'outfit', id: 'canvasSails', count: 1 },
      { kind: 'item', id: 'luckyCoin', count: 1 },
      { kind: 'item', id: 'fireworks', count: 3 },
    ],
  },
  smugglers: {
    id: 'smugglers',
    zone: START_ZONE,
    title: 'Smugglers wanted',
    text: 'Smugglers attack anyone who comes near. The harbour master pays for {count} of them sunk.',
    target: 'smugglerSloop',
    count: 10,
    reward: 250,
    xp: 800,
    after: 0,
    grade: 'hard',
    prizes: [
      { kind: 'outfit', id: 'tiller', count: 1 },
      { kind: 'ammo', id: 'chainShot', count: 100 },
      { kind: 'item', id: 'smokePots', count: 2 },
    ],
  },
  serpents: {
    id: 'serpents',
    zone: START_ZONE,
    title: "Serpent's bane",
    text: 'Sea serpents drag our boats under. Kill {count}, and keep your harpoons sharp.',
    target: 'seaSerpent',
    count: 8,
    reward: 220,
    xp: 700,
    after: 0,
    grade: 'hard',
    prizes: [
      { kind: 'gun', id: 'deckCrossbow', count: 1 },
      { kind: 'item', id: 'whaleboneNet', count: 2 },
      { kind: 'item', id: 'navigatorsScroll', count: 1 },
    ],
  },
  // A pack of the far waters (bots/botKinds.ts, `jackals`): four at once, the first fight against many, an elite's.
  // Paid more than its four bounties, as the Inkmother is: the fight is hard and a pack is far to find. Its prizes are
  // for the next pack: sails quick into a turn, a horn that slows their reloads, timbers to mend the hull in the fight
  jackals: {
    id: 'jackals',
    zone: START_ZONE,
    title: 'The jackal pack',
    text: 'Cutters hunt the far waters in packs of four and fall on lone ships together, like jackals. Sink a whole pack, all {count}. Come with your hull whole, sink the nearest first, and never let them circle you.',
    target: 'jackalCutter',
    count: 4,
    reward: 200,
    xp: 450,
    after: 1,
    grade: 'elite',
    prizes: [
      { kind: 'outfit', id: 'patchedJib', count: 1 },
      { kind: 'item', id: 'hornOfDread', count: 2 },
      { kind: 'item', id: 'spareTimbers', count: 2 },
    ],
  },
  // The mini-boss (bots/botKinds.ts, `inkmother`), once the player has the harpoons' measure: before the Baron
  inkmother: {
    id: 'inkmother',
    zone: START_ZONE,
    title: 'The Inkmother',
    text: 'Something with arms longer than a mast drags boats under in the south-west. Fishermen call it the Inkmother. Kill it, and mind its arms.',
    target: 'inkmother',
    count: 1,
    reward: 220,
    xp: 500,
    after: 1,
    grade: 'elite',
    prizes: [
      { kind: 'gun', id: 'harpoonGun2', count: 1 },
      { kind: 'item', id: 'jellyfishVenom', count: 2 },
      { kind: 'doubloons', count: 5 },
    ],
  },
  // The starting waters' last bounty: the boss (bots/botKinds.ts, `baron`), once the player knows the sea
  baron: {
    id: 'baron',
    zone: START_ZONE,
    title: 'The Smuggler Baron',
    text: 'The Baron and his smugglers hold the north-east. Sink his brig, and watch for his mortar: get out of the circles.',
    target: 'baronBrig',
    count: 1,
    reward: 320,
    xp: 1000,
    after: 2,
    grade: 'epic',
    prizes: [
      { kind: 'gun', id: 'cannon2', count: 2 },
      { kind: 'item', id: 'captainsBanner', count: 1 },
      { kind: 'doubloons', count: 10 },
    ],
  },
};

// The other seas' quests, made from their bots (bots/botKinds.ts): so many of an archetype's kind sunk, as many as the
// starting waters ask, for a share of what the kills pay in gold and experience: together, about a quarter of the
// experience a ship earns in its sea. No prizes yet
const SEA_QUESTS: readonly {
  readonly key: SeaQuestKey;
  readonly count: number;
  readonly grade: QuestGrade;
  readonly title: string;
  readonly text: string;
}[] = [
  {
    key: 'trader',
    count: 10,
    grade: 'easy',
    title: 'Bounty: {target}',
    text: 'The harbour master of {zone} pays for {count} of them sunk.',
  },
  {
    key: 'grazer',
    count: 8,
    grade: 'easy',
    title: 'Hunt: {target}',
    text: 'The cook of {zone} wants {count} of them, and mind their jaws.',
  },
  {
    key: 'pirate',
    count: 10,
    grade: 'hard',
    title: 'Bounty: {target}',
    text: 'The harbour master of {zone} pays for {count} of them sunk.',
  },
  {
    key: 'hunter',
    count: 8,
    grade: 'hard',
    title: 'Hunt: {target}',
    text: '{count} of them prey on the ships of {zone}. Hunt them down.',
  },
  {
    key: 'pack',
    count: 4,
    grade: 'elite',
    title: 'The pack: {target}',
    text: 'They hunt {zone} in packs and fall on lone ships together. Sink a whole pack, all {count}.',
  },
  {
    key: 'elite',
    count: 1,
    grade: 'elite',
    title: 'Wanted: {target}',
    text: 'One {target} rules the sea lanes of {zone}. Sink it.',
  },
  {
    key: 'boss',
    count: 1,
    grade: 'epic',
    title: 'The terror of {zone}',
    text: 'Sink the {target} at its lair, and its escort scatters.',
  },
];
/**
 * The share of a quest's gold and experience it pays by the times the player turned it in before: in full twice, then
 * less, the last share from then on, so a player goes round the tavern's quests rather than doing one over and over
 */
export const REPEAT_SHARES: readonly number[] = [1, 1, 0.5, 0.25];
const QUEST_GOLD = 0.8; // a quest's gold, as a share of what its kills' bounties pay
const QUEST_XP = 0.6; // and its experience, of what its kills bring
// The effects (ships/bonus.ts) that add to a quest's gold (questGold) and to its XP (talents.ts, xpGiven)
const GOLD_EFFECTS: readonly BonusEffect[] = ['questGold', 'gold'];
const XP_EFFECTS: readonly BonusEffect[] = ['xp', 'questXp'];

function seaQuests(zone: OuterZoneId): Quest[] {
  return SEA_QUESTS.map(({ key, count, grade, title, text }) => {
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
      grade,
      prizes: [],
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

export function isQuest(value: unknown): value is QuestId {
  return typeof value === 'string' && Object.hasOwn(QUESTS, value);
}

/** The quests the tavern of a sea offers, in order */
export function zoneQuests(zone: ZoneId): readonly QuestId[] {
  return QUEST_IDS.filter((id) => QUESTS[id].zone === zone);
}

function docked(state: GameState, player: Player) {
  return state.ships.some((ship) => ship.id === player.shipId && ship.docked);
}

/** How many times the player has turned a quest in, by any of their ships */
export function timesTurnedIn(player: Player, id: QuestId) {
  return player.progress.turnedIn[id] ?? 0;
}

/** The share of a quest's gold and experience it pays the player this time (REPEAT_SHARES) */
function repeatShare(player: Player, id: QuestId) {
  return REPEAT_SHARES[Math.min(timesTurnedIn(player, id), REPEAT_SHARES.length - 1)];
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
  // Checked first: online the id is a player's
  if (!isQuest(id)) return false;
  const ship = shipOf(state, player);
  if (!ship || !docked(state, player) || shipQuests(state, player).length >= questLimit(state, player)) return false;
  if (!questOffered(player, id)) return false;
  if (QUESTS[id].zone !== state.world.zone) return false;
  if (takenQuest(state, player, id)) return false;
  player.quests.push({ id, ship: ship.shipClass.id, kills: 0 });
  return true;
}

/**
 * Gives a quest of any of the player's ships up, with nothing for it, done or not: anywhere, from any ship, so a
 * player needn't take the helm of a ship laid up in port and sail back to the sea of its quest only to let it go.
 * False if that ship has no such quest
 */
export function dropQuest(player: Player, ship: ShipClassId, id: QuestId) {
  const quest = player.quests.find((q) => q.ship === ship && q.id === id);
  if (!quest) return false;
  player.quests = player.quests.filter((q) => q !== quest);
  return true;
}

/**
 * The quests the ship the player sails has done in this sea: those its tavern takes in, and the port's marks count.
 * Another ship's wait till the player takes its helm, another sea's till they sail back there
 */
export function questsToTurnIn(state: GameState, player: Player) {
  return shipQuests(state, player).filter((q) => questDone(q) && QUESTS[q.id].zone === state.world.zone);
}

/**
 * A quest's gold for the ship that turns it in: more with its talents and the captain's mastery, `repeat` of it this
 * time (repeatShare)
 */
function questGold(ship: Ship | undefined, id: QuestId, repeat: number) {
  const share = ship ? 1 + ship.bonus.questGold + ship.bonus.gold : 1;
  return Math.round(QUESTS[id].reward * repeat * share);
}

/** A quest's experience before the bonuses: `repeat` of it this time (repeatShare) */
function questXp(id: QuestId, repeat: number) {
  return Math.round(QUESTS[id].xp * repeat);
}

/**
 * The passives of the player's mastery and the talents of their ship that give any of these effects, with what they
 * give of them together: what the tavern and the bestiary (economy/loot.ts, killReward) list under a reward
 */
export function bonusesFor(ship: Ship, player: Player, effects: readonly BonusEffect[]): RewardBonus[] {
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

/**
 * What a quest would pay the player now, turned in by the ship they sail, and what adds to it or takes from it: for the
 * tavern
 */
export function questReward(state: GameState, player: Player, id: QuestId): QuestReward {
  const ship = shipOf(state, player);
  const times = timesTurnedIn(player, id);
  const share = repeatShare(player, id);
  const gold = questGold(ship, id, share);
  const prizes = times === 0 ? QUESTS[id].prizes : [];
  if (!ship) return { gold, xp: 0, xpLost: 0, goldBonuses: [], xpBonuses: [], times, share, prizes };
  const given = xpGiven(ship, questXp(id, share), 'quest');
  const xp = Math.min(given, xpRoom(ship));
  return {
    gold,
    xp,
    xpLost: given - xp,
    goldBonuses: bonusesFor(ship, player, GOLD_EFFECTS),
    xpBonuses: bonusesFor(ship, player, XP_EFFECTS),
    times,
    share,
    prizes,
  };
}

/**
 * Turns a done quest in at the tavern of its sea for its reward and experience, more with the captain's mastery and
 * the ship's talents, less from its third time; its prizes besides the first time (a `prizes` event): by the ship
 * that took it. False if it isn't done, or the ship isn't in port of the quest's sea
 */
export function turnInQuest(state: GameState, player: Player, id: QuestId) {
  const quest = takenQuest(state, player, id);
  if (!quest || !docked(state, player) || quest.kills < QUESTS[id].count) return false;
  if (QUESTS[id].zone !== state.world.zone) return false;
  const times = timesTurnedIn(player, id);
  const share = repeatShare(player, id);
  player.quests = player.quests.filter((q) => q !== quest);
  player.progress.questsDone++;
  player.progress.turnedIn[id] = times + 1;
  const ship = shipOf(state, player);
  const at = ship ? { x: ship.x, y: ship.y, z: ship.height } : { x: 0, y: 0, z: 0 };
  earn(state, player, { amount: questGold(ship, id, share), reason: 'quest', kind: null, quest: id, at });
  if (ship) gainXp(state, ship, questXp(id, share), 'quest', at);
  const { prizes } = QUESTS[id];
  if (times === 0 && prizes.length > 0) {
    givePrizes(player, ship, prizes);
    state.events.push({ type: 'prizes', shipId: player.shipId, quest: id, prizes, at });
  }
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
