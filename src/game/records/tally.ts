import type { GameState } from '../GameState';
import { cargoCount } from '../economy/cargo';
import { playerOf } from '../economy/player';
import { findUnit } from '../combat/units';
import { TALENTS } from '../ships/talents';
import type { Stats } from './stats';

/**
 * Counts what this update's events tell about the players' ships, for them and their players, and the time and way
 * they sailed. Stepped last in Game.update, when every event of the update is in: each is read once
 */
export function stepStats(state: GameState, dt: number) {
  for (const ship of state.ships) {
    if (ship.bot) continue;
    const player = playerOf(state, ship.id);
    for (const stats of player ? [ship.stats, player.stats] : [ship.stats]) {
      if (ship.docked) stats.timeInPort += dt;
      else {
        stats.timeAtSea += dt;
        if (!ship.isSinking) stats.distance += Math.abs(ship.speed) * dt;
      }
    }
  }
  // A chest hauled aboard pays its gold and brings in its goods in the same update: one chest
  const chestPaid = new Set<number>();
  for (const event of state.events) {
    if (event.type === 'gold' && event.reason === 'chest') chestPaid.add(event.shipId);
  }
  for (const event of state.events) {
    switch (event.type) {
      case 'shot':
        record(state, event.shooterId, (s) => s.volleys[event.weapon]++);
        break;
      case 'damage':
        record(state, event.attackerId, (s) => {
          s.damageDealt += event.amount;
          s.crits += event.crits;
        });
        record(state, event.targetId, (s) => {
          s.damageTaken += event.amount;
          if (event.source === 'bite') s.bitesTaken++;
        });
        break;
      case 'destroyed':
        // A player's ship went down; anything else sunk (a bot's ship, a monster) is a kill for whoever struck
        if (playerOf(state, event.targetId)) record(state, event.targetId, (s) => s.sunk++);
        else record(state, event.attackerId, (s) => (s.kills[event.kind] = (s.kills[event.kind] ?? 0) + 1));
        break;
      case 'gold':
        record(state, event.shipId, (s) => {
          s.goldEarned[event.reason] += event.amount;
          if (event.reason === 'quest') s.questsDone++;
          if (event.reason === 'chest') s.chests++;
        });
        break;
      case 'cargo':
        record(state, event.shipId, (s) => {
          s.goods += cargoCount(event.goods);
          if (event.reason === 'loot' && !chestPaid.has(event.shipId)) s.chests++;
        });
        break;
      case 'repair':
        record(state, event.shipId, (s) => (s.repaired += event.amount));
        break;
      case 'talent': {
        const talent = TALENTS[event.talent];
        if (talent.kind === 'signature' && talent.active) record(state, event.shipId, (s) => s.abilities++);
        break;
      }
      default:
        break;
    }
  }
}

/** A change to the stats of a player's ship and its player; nothing for a bot's */
function record(state: GameState, shipId: number, change: (stats: Stats) => void) {
  const player = playerOf(state, shipId);
  if (!player) return;
  const ship = findUnit(state, shipId);
  if (ship) change(ship.stats);
  change(player.stats);
}
