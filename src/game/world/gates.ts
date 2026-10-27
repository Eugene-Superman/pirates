import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import type { NavGrid } from '../navigation/NavGrid';
import { playerOf } from '../economy/player';
import type { GatePlace } from './World';
import { ZONES, type Zone, type ZoneId } from './zones';

/** World units: a gate's circle on the water, sailed into to go to the sea beyond it */
export const GATE_RADIUS = 90;
const GATE_CLEARANCE = GATE_RADIUS + 30; // world units of open water round a gate's middle
// World units a ship coming through a gate lands off it, towards the port: out of it, so it doesn't go back at once
const ARRIVAL_OFFSET = 220;
// World units round a gate where no bot comes into the game or wanders, as round the harbour: a ship coming in isn't
// fired at as it arrives, nor kept from leaving by a fight
const GATE_CLEAR = 700;

/** Whether a point is too near one of the sea's gates for a bot to spawn or wander there */
export function nearGate(gates: readonly GatePlace[], x: number, y: number) {
  return gates.some((gate) => Math.hypot(x - gate.x, y - gate.y) < GATE_CLEAR);
}

/**
 * A sea's gates on its map: each moved to the nearest open water to its place (world/zones.ts), once the sea's
 * routes are known. A gate with no water round it is left out
 */
export function placeGates(zone: Zone, nav: NavGrid): GatePlace[] {
  return zone.gates.flatMap(({ to, at }) => {
    const spot = nav.nearestOpen(at.x, at.y, GATE_CLEARANCE);
    return spot ? [{ to, x: spot.x, y: spot.y, radius: GATE_RADIUS }] : [];
  });
}

/**
 * Where a ship that came from the sea `from` comes into this one: off the gate back to it, towards the port, on open
 * water with `clearance` round it. Null if this sea has no gate to that one (the world chart's jump, for now)
 */
export function arrivalPoint(state: GameState, nav: NavGrid, from: ZoneId, clearance: number): Point | null {
  const gate = state.world.gates.find((g) => g.to === from);
  if (!gate) return null;
  const { x, y } = state.world.port.island;
  const length = Math.hypot(x - gate.x, y - gate.y) || 1;
  const reach = gate.radius + ARRIVAL_OFFSET;
  return nav.nearestOpen(gate.x + ((x - gate.x) / length) * reach, gate.y + ((y - gate.y) / length) * reach, clearance);
}

/**
 * A player's ship in a gate leaves for the sea beyond it (`player.departure`: the client takes them there,
 * Game.travel), once the gate lets it through: not into a sea of a higher tier than its ship's, not in combat (a
 * `gateClosed` event, once a time it sails in; a ship that waits in the gate till its fight is over goes then). Bots
 * never pass gates. Stepped from Game.update after the ships sailed
 */
export function stepGates(state: GameState) {
  for (const ship of state.ships) {
    if (ship.bot) continue;
    const gate =
      ship.isSinking || ship.docked
        ? undefined
        : state.world.gates.find((g) => Math.hypot(ship.x - g.x, ship.y - g.y) < g.radius);
    const entered = gate !== undefined && gate.to !== ship.gate;
    ship.gate = gate?.to ?? null;
    const player = playerOf(state, ship.id);
    if (!gate || !player || player.departure) continue;
    const { tier } = ZONES[gate.to];
    const reason = tier > ship.shipClass.tier ? 'tier' : ship.inCombat(state.time) ? 'combat' : null;
    if (!reason) player.departure = gate.to;
    else if (entered) {
      const at = { x: ship.x, y: ship.y, z: ship.height };
      state.events.push({ type: 'gateClosed', shipId: ship.id, to: gate.to, reason, tier, at });
    }
  }
}
