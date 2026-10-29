import { abilityTarget, bombard, dropKeg } from '../combat/ordnance';
import type { GameState } from '../GameState';
import type { Ship } from './Ship';
import { PERKS, abilityCooldown, abilityUsed } from './talents';

/**
 * Uses the ship's ability in a slot (0: its level 5 talent, F; 1: its level 25 one, G; 2: its level 50 one, T) if it
 * has one and it has cooled down, not in port or going down: a `talent` event for the client, and what any ability
 * used gives (abilityUsed). A Broadside is loaded for the next volley and cools down from it (combat.ts), not from
 * now: a player who waits for a target would have it back sooner; used again before the volley it is put away, its
 * cooldown not started, and its event and what an ability gives come with the volley, so loading it over and over
 * gives nothing. A rocket needs `target` (the unit attacked or picked out) in its range and sight, and flies at the
 * next update, with the game's dice (combat/ordnance.ts); a powder keg is dropped at once; a bombardment's shells are
 * marked at once along the course of its `target`, in its range and sight; a Royal standard is raised at once. False
 * if it can't. Here, not in talents.ts, which ordnance.ts reads: no module imports one that imports it back
 */
export function useAbility(state: GameState, ship: Ship, slot = 0, target: number | null = null) {
  const ability = ship.abilityIn(slot);
  if (!ability || ship.isSinking || ship.docked || state.time < (ship.abilityReadyAt[slot] ?? 0)) return false;
  const ready = state.time + abilityCooldown(ship, slot);
  const at = { x: ship.x, y: ship.y, z: ship.height };
  switch (ability) {
    case 'broadside':
      ship.broadsideArmed = !ship.broadsideArmed;
      return true;
    case 'fullSail':
      ship.fullSailUntil = state.time + PERKS.fullSail.time;
      ship.abilityReadyAt[slot] = ready;
      break;
    case 'rocket':
      if (ship.rocketAt !== null || !abilityTarget(state, ship, 'rocket', target)) return false;
      ship.rocketAt = target;
      ship.abilityReadyAt[slot] = ready;
      break;
    case 'powderKeg':
      if (!dropKeg(state, ship)) return false;
      ship.abilityReadyAt[slot] = ready;
      break;
    case 'bombardment': {
      const aimed = abilityTarget(state, ship, 'bombardment', target);
      if (!aimed || !bombard(state, ship, aimed)) return false;
      ship.abilityReadyAt[slot] = ready;
      break;
    }
    case 'royalStandard':
      ship.standardUntil = state.time + PERKS.royalStandard.time;
      ship.abilityReadyAt[slot] = ready;
      break;
    default:
      return false;
  }
  state.events.push({ type: 'talent', shipId: ship.id, talent: ability, amount: 0, at });
  abilityUsed(state, ship);
  return true;
}
