import type { UnitKind } from '../combat/units';
import type { GameState } from '../GameState';
import { gainXp } from '../ships/talents';
import { earn, shipOf, type Player } from './player';

export type QuestId = 'turtles' | 'serpents' | 'smugglers' | 'merchants' | 'fishers' | 'baron';

/** A bounty the tavern offers: sink (or kill) so many of one kind, then come back for the reward */
export interface Quest {
  readonly id: QuestId;
  readonly title: string;
  /** What the tavern keeper says about it */
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

// Rewards worth a few kills' bounties, more for the dangerous ones; every quest can be taken again once turned in
export const QUESTS: Readonly<Record<QuestId, Quest>> = {
  fishers: {
    id: 'fishers',
    title: 'Empty nets',
    text: 'The fishing boats are scaring the fish off our reefs. Sink five of them.',
    target: 'fishingBoat',
    count: 5,
    reward: 50,
    xp: 40,
    after: 0,
  },
  turtles: {
    id: 'turtles',
    title: 'Turtle soup',
    text: 'The cook wants turtle meat. Hunt five sea turtles; mind their jaws.',
    target: 'seaTurtle',
    count: 5,
    reward: 120,
    xp: 90,
    after: 0,
  },
  merchants: {
    id: 'merchants',
    title: 'Raid the trade',
    text: 'Merchant sloops sail past without paying their dues. Sink three.',
    target: 'merchantSloop',
    count: 3,
    reward: 120,
    xp: 100,
    after: 0,
  },
  smugglers: {
    id: 'smugglers',
    title: 'Smugglers wanted',
    text: 'Smugglers attack anyone who comes near. The harbour master pays for three sunk.',
    target: 'smugglerSloop',
    count: 3,
    reward: 160,
    xp: 130,
    after: 0,
  },
  serpents: {
    id: 'serpents',
    title: "Serpent's bane",
    text: 'Sea serpents drag our boats under. Kill three, and keep your harpoons sharp.',
    target: 'seaSerpent',
    count: 3,
    reward: 180,
    xp: 150,
    after: 0,
  },
  // The starting waters' last bounty: the boss (bots/botKinds.ts, `baron`), once the player knows the sea
  baron: {
    id: 'baron',
    title: 'The Smuggler Baron',
    text: 'The Baron and his smugglers hold the north-east. Sink his brig, and watch for his mortar: get out of the circles.',
    target: 'baronBrig',
    count: 1,
    reward: 300,
    xp: 300,
    after: 3,
  },
};

export const QUEST_IDS: readonly QuestId[] = ['fishers', 'turtles', 'merchants', 'smugglers', 'serpents', 'baron'];

function docked(state: GameState, player: Player) {
  return state.ships.some((ship) => ship.id === player.shipId && ship.docked);
}

/** Whether the tavern offers a quest to this player yet: some wait till others have been turned in */
export function questOffered(player: Player, id: QuestId) {
  return player.progress.questsDone >= QUESTS[id].after;
}

/** Takes a quest at the tavern: in port, not taken yet, and fewer than MAX_QUESTS on hand. False if it can't */
export function takeQuest(state: GameState, player: Player, id: QuestId) {
  if (!docked(state, player) || player.quests.length >= MAX_QUESTS || !questOffered(player, id)) return false;
  if (player.quests.some((q) => q.id === id)) return false;
  player.quests.push({ id, kills: 0 });
  return true;
}

/** Gives a quest up, with nothing for it */
export function dropQuest(player: Player, id: QuestId) {
  player.quests = player.quests.filter((q) => q.id !== id);
}

/** Turns a done quest in at the tavern for its reward and experience. False if it isn't done, or the ship isn't in port */
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

/** A unit of this kind was sunk by the player: every quest after that kind counts it */
export function countKill(player: Player, kind: UnitKind) {
  for (const quest of player.quests) {
    const { target, count } = QUESTS[quest.id];
    if (target === kind && quest.kills < count) quest.kills++;
  }
}

/** Whether a quest taken is done: ready to turn in */
export function questDone(quest: ActiveQuest) {
  return quest.kills >= QUESTS[quest.id].count;
}
