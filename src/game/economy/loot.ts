import { BOT_KINDS, type BotKind, type BotKindId } from '../bots/botKinds';
import { findUnit } from '../combat/units';
import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import { hullReach } from '../physics/hull';
import { NO_BONUS, type BonusEffect, type ShipBonus } from '../ships/bonus';
import type { Ship } from '../ships/Ship';
import { SHIP_CLASSES } from '../ships/shipClasses';
import { gainXp, killXpShare, xpForKill, xpGiven, xpRoom, type KillXpShare } from '../ships/talents';
import { haulAboard, isEmpty, rollCargo, takeCargo, type Cargo } from './cargo';
import { earn, playerOf, shipOf, type Player } from './player';
import { bonusesFor, countKill, type RewardBonus } from './quests';

/** Seconds a chest floats before it sinks: a fight's loot is picked up right after it, or lost */
const CHEST_TIME = 15;
/** Seconds a player's lost cargo floats where their ship went down: time to sail back for it */
const LOST_CARGO_TIME = 300;
/** World units beyond a ship's hull from which a chest is hauled aboard as it sails by */
const CHEST_PICKUP = 12;
/** World units a second chest floats from the first (the captain's Lucky find), so both are seen */
const SECOND_CHEST_GAP = 14;
/** Pieces of moon glass the story's prey always leaves (bots/spawner.ts, stepPrey): what the story is about */
const PREY_GLASS = 1;
/**
 * World units round a boss where it sank: the players' ships within them were in its fight and share its chest. As
 * far as a bot fights a foe (bots/brain.ts, LEASH)
 */
const BOSS_FIGHT = 650;

/**
 * Loot floating where a ship sank: a bot's chest of gold and the goods its wreck left, or a player's own cargo lost
 * when their ship went down. The first player's ship to sail over it that may haul it (`mayHaul`) takes the gold and
 * what fits of the goods into its hold; goods that don't fit stay floating. A bot's sinks soon, unless it is kept:
 * the story's prey's, for the player it was brought in for, and a boss's, for the players in its fight, float till
 * they are emptied
 */
export interface Chest {
  /** Unique in the game, like the ships' */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  gold: number;
  readonly goods: Cargo;
  /** The ship whose cargo this was, when it went down; null for a bot's loot */
  readonly lostBy: number | null;
  /** The players' ships that may haul it aboard; null for anyone's */
  readonly takers: readonly number[] | null;
  /** Game time it was dropped into the sea */
  readonly droppedAt: number;
  /** Game time it sinks, unclaimed; null for a chest kept till it is emptied */
  readonly expiresAt: number | null;
  /** The ship last told its hold was full here, so it is told once, not every update */
  fullFor: number | null;
}

/** Whether a player's ship may haul a chest aboard: anyone's, or kept for it */
export function mayHaul(chest: Chest, shipId: number) {
  return chest.takers === null || chest.takers.includes(shipId);
}

/** What the passives of the captain's mastery and a ship's talents add to a part of a kill's spoils */
export interface RewardBoost {
  /** All of them together, as a share more: what they multiply the part by, less 1 */
  readonly share: number;
  /** Each of them, by name */
  readonly by: readonly RewardBonus[];
}

/** What sinking a bot of a kind would pay the player's ship now, and what adds to each part: for the bestiary */
export interface KillReward {
  readonly bounty: number;
  /** The XP the ship keeps: none beyond its class's last level */
  readonly xp: number;
  /** XP given beyond the ship's last level: lost */
  readonly xpLost: number;
  /** What the ship's tier and level against the bot's leave it of the kind's XP, and why */
  readonly xpShare: KillXpShare;
  /** The chance of a chest of gold, and the gold in one (at least, at most); 0 and none for a monster */
  readonly chestChance: number;
  readonly chestGold: readonly [number, number];
  /** The chance of a second chest by the first, when there is one (the captain's Lucky find) */
  readonly secondChest: number;
  /** How many times as likely each good its wreck may leave is */
  readonly goods: number;
  readonly boosts: Readonly<Record<'bounty' | 'xp' | 'chest' | 'chestGold' | 'secondChest' | 'goods', RewardBoost>>;
}

function isMonster(kind: BotKind) {
  return SHIP_CLASSES[kind.shipClass].nature === 'creature';
}

/**
 * What a ship's bonuses multiply a kill's bounty by: a Bounty hunter's and gold's, more for a monster to a captain
 * who hunts them (Leviathan hunter), and for a boss to one after prize money
 */
function bountyBoost(bonus: ShipBonus, kind: BotKind) {
  const monster = isMonster(kind) ? bonus.monsterLoot : 0;
  return (1 + bonus.bounty + bonus.gold + monster) * (kind.boss ? 1 + bonus.bossBounty : 1);
}

/** What a ship's bonuses multiply the gold in a bot's chest by */
function chestGoldBoost(bonus: ShipBonus) {
  return 1 + bonus.chestGold + bonus.gold;
}

/**
 * The XP a kill earns a ship before its bonuses (gainXp adds them): the kind's, as the ship's tier and level against
 * the bot's leave it, more for a monster to a Leviathan hunter
 */
function killXp(kind: BotKind, ship: Ship) {
  const monster = isMonster(kind) ? ship.bonus.monsterLoot : 0;
  return Math.round(xpForKill(kind.xp, kind, { tier: ship.shipClass.tier, level: ship.level }) * (1 + monster));
}

/** What sinking a bot of this kind would pay the ship the player sails now, worked out as stepLoot pays it */
export function killReward(state: GameState, player: Player, id: BotKindId): KillReward | null {
  const ship = shipOf(state, player);
  if (!ship) return null;
  const kind = BOT_KINDS[id];
  const { bonus } = ship;
  const monster = isMonster(kind);
  const boost = (share: number, effects: readonly BonusEffect[]): RewardBoost => ({
    share,
    by: bonusesFor(ship, player, effects),
  });
  const bountyEffects: BonusEffect[] = ['bounty', 'gold'];
  if (monster) bountyEffects.push('monsterLoot');
  if (kind.boss) bountyEffects.push('bossBounty');
  const given = xpGiven(ship, killXp(kind, ship), 'kill');
  const xp = Math.min(given, xpRoom(ship));
  const { chest } = kind;
  const gold = chestGoldBoost(bonus);
  return {
    bounty: Math.round(kind.bounty * bountyBoost(bonus, kind)),
    xp,
    xpLost: given - xp,
    xpShare: killXpShare(kind, { tier: ship.shipClass.tier, level: ship.level }),
    chestChance: chest ? Math.min(1, chest.chance * (1 + bonus.chestChance)) : 0,
    chestGold: chest ? [Math.round(chest.gold[0] * gold), Math.round(chest.gold[1] * gold)] : [0, 0],
    secondChest: chest ? bonus.secondChest : 0,
    goods: 1 + bonus.wreckGoods,
    boosts: {
      bounty: boost(bountyBoost(bonus, kind) - 1, bountyEffects),
      xp: boost((1 + (monster ? bonus.monsterLoot : 0)) * (1 + bonus.xp) - 1, monster ? ['xp', 'monsterLoot'] : ['xp']),
      chest: boost(bonus.chestChance, ['chestChance']),
      chestGold: boost(gold - 1, ['chestGold', 'gold']),
      secondChest: boost(bonus.secondChest, ['secondChest']),
      goods: boost(bonus.wreckGoods, ['wreckGoods']),
    },
  };
}

/**
 * The spoils of this update's kills: the player who sank a bot is paid its bounty (more for a Bounty hunter and with
 * the captain's mastery), counts it for their quests and their ship earns its experience; the bot may leave a chest
 * floating where it went down, with gold (a ship's only; more often for a Treasure hunter) and its goods, and with the
 * captain's Lucky find a second one (both kept like the bot's: `keptFor`). A player's ship that went down leaves its
 * cargo floating (all of it stays aboard with a Hidden hold or Insured cargo). `random` is the game's loot generator,
 * seeded like the dice. Stepped from Game.update right after combat, which made the `destroyed` events
 */
export function stepLoot(state: GameState, random: () => number) {
  // Only the events there were: paying a bounty adds a `gold` event to the list
  const count = state.events.length;
  for (let i = 0; i < count; i++) {
    const event = state.events[i];
    if (event.type !== 'destroyed') continue;
    // The wreck is still in state.ships: the spawner takes sunk bots out later in this update
    const wreck = findUnit(state, event.targetId);
    const mind = wreck?.bot;
    if (wreck && !mind) {
      spillCargo(state, wreck);
      continue;
    }
    if (!mind) continue;
    const kind = BOT_KINDS[mind.kind];
    const player = playerOf(state, event.attackerId);
    const killer = player ? findUnit(state, event.attackerId) : undefined;
    const bonus = killer?.bonus ?? NO_BONUS;
    if (player && killer) {
      const bounty = Math.round(kind.bounty * bountyBoost(bonus, kind));
      earn(state, player, { amount: bounty, reason: 'bounty', kind: event.kind, quest: null, at: event.at });
      countKill(player, killer.shipClass.id, event.kind, state.world.zone);
      gainXp(state, killer, killXp(kind, killer), 'kill', event.at);
    }
    let gold = 0;
    const { chest } = kind;
    const chestGold = () => {
      if (!chest) return 0;
      const [least, most] = chest.gold;
      return Math.round((least + Math.floor(random() * (most - least + 1))) * chestGoldBoost(bonus));
    };
    if (chest) {
      const chance = chest.chance * (1 + bonus.chestChance);
      if (random() < chance) gold = chestGold();
    }
    const goods = rollCargo(kind.cargo, random, 1 + bonus.wreckGoods);
    if (mind.prey !== null) goods.moonGlass = (goods.moonGlass ?? 0) + PREY_GLASS;
    const takers = keptFor(state, mind.prey, kind.boss !== null, event.at, player ? event.attackerId : null);
    const keep = { takers, expiresAt: takers ? null : state.time + CHEST_TIME * (1 + bonus.chestTime) };
    if (gold > 0 || !isEmpty(goods)) dropChest(state, event.at.x, event.at.y, gold, goods, keep);
    // A second chest by the first, never one in its place: not a better chance of a chest
    if (gold > 0 && bonus.secondChest > 0 && random() < bonus.secondChest) {
      dropChest(state, event.at.x + SECOND_CHEST_GAP, event.at.y, chestGold(), {}, keep);
    }
  }
}

/** A bot's loot floating where it went down: kept for its takers, or sinking when its time is up */
function dropChest(
  state: GameState,
  x: number,
  y: number,
  gold: number,
  goods: Cargo,
  keep: Pick<Chest, 'takers' | 'expiresAt'>,
) {
  state.chests.push({
    id: state.nextId++,
    x,
    y,
    gold,
    goods,
    lostBy: null,
    ...keep,
    droppedAt: state.time,
    fullFor: null,
  });
}

/**
 * Whose a bot's loot is kept for, till they haul it all aboard: the story's prey's for the player's ship it was
 * brought in for (`prey`: the glass their story asks for), a boss's for every player's ship afloat in its fight as it
 * sank, and the one that sank it; null for the rest's, anyone's while it floats
 */
function keptFor(state: GameState, prey: number | null, boss: boolean, at: Point, killer: number | null) {
  if (prey !== null) return [prey];
  if (!boss) return null;
  const takers = state.ships
    .filter((ship) => !ship.bot && !ship.isSinking && Math.hypot(ship.x - at.x, ship.y - at.y) <= BOSS_FIGHT)
    .map((ship) => ship.id);
  if (killer !== null && !takers.includes(killer)) takers.push(killer);
  return takers;
}

/**
 * A player's ship went down: its cargo floats where it sank, but for what a Hidden hold keeps aboard; all of it stays
 * with the captain's Insured cargo
 */
function spillCargo(state: GameState, ship: GameState['ships'][number]) {
  if (ship.bonus.insured > 0) return;
  const goods = takeCargo(ship, 1 - Math.min(1, ship.bonus.hiddenHold));
  if (isEmpty(goods)) return;
  const at = { x: ship.x, y: ship.y, z: 0 };
  state.chests.push({
    id: state.nextId++,
    x: ship.x,
    y: ship.y,
    gold: 0,
    goods,
    lostBy: ship.id,
    takers: null,
    droppedAt: state.time,
    expiresAt: state.time + LOST_CARGO_TIME,
    fullFor: null,
  });
  state.events.push({ type: 'cargoLost', shipId: ship.id, goods, at });
}

/**
 * Chests sink when their time is up, and a kept one once none it is kept for is in the sea (online: gone home, or to
 * another sea); a player's ship that may haul one and sails over it takes its gold and what fits of its goods, and it
 * is gone once nothing is left in it. Stepped after the ships moved
 */
export function stepChests(state: GameState) {
  state.chests = state.chests.filter((chest) => {
    if (chest.expiresAt !== null && state.time >= chest.expiresAt) return false;
    const { takers } = chest;
    if (takers && !state.ships.some((ship) => takers.includes(ship.id))) return false;
    for (const ship of state.ships) {
      if (ship.bot || ship.isSinking || !mayHaul(chest, ship.id)) continue;
      const reach = hullReach(ship.hull) + CHEST_PICKUP * (1 + ship.bonus.chestReach);
      if (Math.hypot(ship.x - chest.x, ship.y - chest.y) > reach) continue;
      const player = playerOf(state, ship.id);
      if (!player) continue;
      const at = { x: chest.x, y: chest.y, z: ship.height };
      if (chest.gold > 0) {
        earn(state, player, { amount: chest.gold, reason: 'chest', kind: null, quest: null, at });
        chest.gold = 0;
      }
      const taken = haulAboard(ship, chest.goods);
      if (!isEmpty(taken)) {
        const reason = chest.lostBy === null ? 'loot' : 'salvage';
        state.events.push({ type: 'cargo', shipId: ship.id, goods: taken, reason, at });
      }
      if (isEmpty(chest.goods)) return false;
      if (chest.fullFor !== ship.id) {
        chest.fullFor = ship.id;
        state.events.push({ type: 'holdFull', shipId: ship.id, at });
      }
    }
    return true;
  });
}
