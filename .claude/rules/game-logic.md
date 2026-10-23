---
paths:
  - 'src/game/**'
---

# Game logic (`src/game/`)

## Layer boundaries

- No imports from `pixi.js` or `client/`, no DOM/browser APIs (`window`, `document`, `location`), no `Math.random`.
  Only data, physics and math live here — this code should be able to run on a future game server.
- How things look is decided by the client. If the client lacks data (as with `damageStage`, which picks the ship's sprite) — add a field to the model, not drawing logic here.
- Decorations that don't affect gameplay (waves, foam) belong to `client/scene/effects/`, not here.
- `index.ts` is the public API. Inside `game/` import modules directly (`./ships/Ship`), never through `index.ts` (avoids import cycles).
  When the client needs something new, export it from `index.ts`.
- `Game.update(dt)` is the only place that steps the simulation and fixes the order of updates. New systems are stepped from there.
  The order: clear `state.events` → bring back destroyed targets whose time is up → the bots think (`thinkBots`: pick
  a foe, a course, an attack) → for each ship, the pilot picks a helm (a sinking ship gets none and coasts), then the
  ship steers and collides in sub-steps of at most `MAX_STEP` world units (round targets that are afloat only) → combat
  (reloads, volleys and bites at attack targets, projectiles landing) → repairs → bots sunk this update taken out,
  due ones spawned (`stepSpawns`) → a player's wreck brought back once `WRECK_TIME` is up.
- `state.events` (shots, impacts, bites, damage, destroyed units, repair steps) live for one update: the client reads
  them in `view.update` right after it.
- Every ship and target has an `id`, unique in the game (`state.nextId` hands them out): attacks, events and the
  client's selection refer to units by it.

## Units and coordinates

- World is `WORLD_WIDTH × WORLD_HEIGHT` = 4000 × 4000 units (on screen 1 unit = `zoom` = 1.4 px at the default zoom).
- `x` points east, `y` points south, as on a map seen from above (the isometric camera shows it rotated 45°). Heights (`height`, `hillHeight`) are `z` up from the water.
- Angles are in **radians**; `rotation = 0` means the bow points to +x. Normalize angles with `normalizeAngle` → `[-π, π]`.
- Speeds are in units per second, `dt` in seconds. The HUD shows knots as `speed / 10`.

## Deterministic map

- `createWorld()` uses `createRandom(seed)` from `lib/random.ts` (mulberry32); islands use seed `42`.
- The map is identical on every run. **Any change to the number or order of `random()` calls in `createIslands`
  changes the whole map** — unless that is the goal, append new random parameters at the end or use a separate generator with its own seed.
- Every island is one of the shapes in `world/islandShapes.json` (written by `build_islands.py` together with the island
  pictures — don't edit it by hand), scaled ×0.85–1.15. Its `coast` polygon and `reach` (farthest coast point from the
  centre) are computed once in `createIslands`.
- A player's ship starts at `START` (`world/World.ts`, the world center) and comes back there after it was sunk;
  islands are never generated closer than `reach + 400` to it.
- The game's other generators are separate, so neither shifts the map: `COMBAT_SEED` (the dice) and `BOT_SEED` (where
  bots spawn, where they wander), both in `Game`.

## Ship (`ships/Ship.ts`)

- A `Ship` is anything that sails under a pilot: the player's ship, the bots' ships and sea monsters. Every ship has a
  `ShipClass` from `SHIP_CLASSES` (`ships/shipClasses.ts`): size, handling, `nature` (`object` for ships, `creature`
  for monsters), `height`, gun `slots` or a monster's `bite` are copied from it or read from it. Class ids are unique
  across lines; how to add a class (and a bot's hull) is in `docs/ships.md`.
  `maxSpeed`, `minSpeed` and `viewRange` stay writable for tuning (`setSpeeds`, `setViewRange`); damage lowers the top
  speed from `maxSpeed` towards `minSpeed` (`topSpeed`).
- `setTarget` clamps the target to world bounds; `ship.steer(dt, helm)` turns no faster than `turnSpeed` and speeds up
  or slows down towards the helm's speed. The helm comes from the pilot.
- `ship.bot` is the bot's mind (`bots/brain.ts`), `null` for a player's ship. A bot's ammo never runs out (`infiniteAmmo`).

## Navigation (`navigation/`)

- `NavGrid` is built once from the world: a grid of 16-unit cells, each with its clearance (distance to the nearest
  coast or world edge). `findRoute` goes straight when it can, otherwise A* round the land, pulled tight to few legs.
  The search is deterministic (ties break in insertion order), so the server finds the same routes. The start and
  goal cells may lack the clearance at their centres (a ship scraping a coast, a goal that fits off its cell's middle).
- `pilot` follows the route leg by leg at `topSpeed × ship.throttle` (bots cruise slower), slows near the last waypoint
  (not while `ship.pursuing`: a chase's target moves on) and for turns it couldn't make at speed, and swerves round
  other ships and targets (velocity obstacles, starboard first) — but a monster never swerves round its prey. The
  target is cleared within `ARRIVE_DISTANCE` of the last waypoint, or after `STUCK_TIME` without the route left to sail
  getting shorter; a target with no way to it keeps that count running, so the ship gives up instead of replanning forever.

## Physics (`physics/`)

- Every hull (ships, targets) is a capsule along its heading (`Hull`: `bow`, `stern`, `halfBeam`); islands are their
  `coast` polygons. `collideShip` pushes a ship out of whatever it overlaps and takes away only the part of its speed
  that went into it, so it slides along coasts and hulls. Ships push each other apart by their hulls' area.

## Combat (`combat/`)

- A unit (`units.ts`) is anything that can be fired at: a `Ship` or a practice `Target`. `findUnit` finds one by id;
  `isAfloat` is false for a wreck going down or a target waiting to respawn.
- `ship.attack(id)` makes the ship fire at a unit every time a gun of its selected weapon is loaded, until `ceaseFire`
  or the unit is gone. The player attacks with a double click, Space or the Fire button on the unit picked out (the
  pick itself is client state); bots attack from their brain. While it can't fire, combat sets `ship.holdReason` every
  update: no guns of the weapon fitted, out of the loaded ammo, the target hidden in the fog of war (`ship.canSee`),
  or beyond every fitted gun's reach. The HUD tells the player.
- A ship class has gun `slots` per weapon; `ship.guns` holds the gun fitted in each (`fitGun`), one of `GUNS` in
  `arsenal.ts`. Every gun has its own `range` and `reload` (`ship.reloads[weapon][slot]`). A volley fires every fitted
  gun of the selected weapon that is loaded, within reach of the target and has a shot of the loaded ammo (`loadAmmo`,
  `ship.ammo`), as one projectile from the middle of them; the `shot` event lists every muzzle. Cannons fire from the
  side facing the target.
- Damage is rolled when a volley is fired (`rollVolley`), with the game's own seeded generator (`COMBAT_SEED`): each
  gun rolls 1…its `die`; `missOn` or lower misses, `critFrom` or higher is a critical hit (`critMultiplier` × the die
  plus the ammo's bonus), anything else is the roll plus the bonus. A weapon does full damage to what it is made for
  (`against`: cannons objects, harpoons creatures) and `OFF_TARGET_SHARE` to the rest.
- Projectiles always hit: a volley homes in on the target and lands after `distance / weapon.speed`, doing its damage
  (a `damage` event). A sea monster has jaws (`shipClass.bite`) instead of gun slots: once they are ready and its head
  (the hull's bow) is within `reach` of the victim's hull, it bites — a `bite` event, full damage at once, no projectile.
- Firing, or being fired at or bitten, puts a ship in combat for `COMBAT_TIME` (`enterCombat`): no repairs till then.
  A ship that is hit remembers who hit it (`lastHitBy`), so a bot fights back.
- A unit at 0 hit points is destroyed (a `destroyed` event with its kind and heading, for the client's wreck): it
  can't be seen, shot at or bumped into, and shots still flying at it fall into the sea. A practice target comes back
  whole after `RESPAWN_TIME`; ships go down (see Hull health).
- Targets (`targets.ts`) are practice targets that stay where they are and never fire back: a barrel near the start.

## Bots (`bots/`)

- `botKinds.ts`: each kind of bot sails a class of the `bots` or `monsters` line, is `neutral` or `aggressive`, has
  the ammo its guns fire, an `aggroRange`, a `cruise` throttle, how many sail at once (`count`) and its `respawnTime`.
- `brain.ts` (`thinkBots`, before the ships steer): a bot picks a foe — the player who hit it, or for an aggressive
  one the nearest player within its aggro range — and fights it: a monster goes for the hull, a gunship closes to
  `FIGHT_SHARE` of its guns' reach and circles there, a bot with no weapon runs. It gives the foe up after `LOSE_TIME`
  beyond `LEASH`, then wanders round its home at its cruise throttle. Bots never fight bots. `isHostile` tells the
  client whether a bot threatens a player.
- `spawner.ts`: `populate` puts every kind's bots on open water when the game starts (aggressive ones no nearer than
  `SAFE_RADIUS` to `START`). A sunk bot is taken out of `state.ships` in the update it sinks (the client animates the
  wreck) and replaced `respawnTime` later where no player can see it; a spawn that finds no room tries again later.

## Hull health (`ships/damage.ts`) and repairs (`ships/repair.ts`)

- A ship has hull points: `hp`, whole, out of `maxHp` (its class's `hp`). They change only through `ship.setHealth`
  (in percent, for the HUD's debug buttons), `ship.takeDamage` (combat), `ship.heal` (repairs), all clamped, and
  `ship.respawn`.
- `health` is derived from them: hull integrity in percent, `0`–`MAX_HEALTH` (100). Damage stages and speed go by it.
- `damageStage(health)` maps it to one of `DAMAGE_STAGES`: `intact` → `minor` → `heavy` → `burning` → `sinking`.
  The order matters: the client falls back along it when a stage has no sprite.
- At 0 the ship is sinking (`isSinking`): its target, attack target and repair are cleared, `setTarget` and `attack`
  are ignored, and it coasts to a stop. A bot's ship is then taken out of the game (Bots); a player's ship comes back
  whole at `START` `WRECK_TIME` after it went down (`Game`, `ship.wreckedAt`), with its guns and ammo.
- The repair skill: `startRepair` sets the crew to work, and `stepRepairs` mends `REPAIR_RATE` of the hull a second in
  steps every `REPAIR_TICK` (a `repair` event each). It stops when the hull is whole, the ship sinks, or the ship is in
  combat — so it can't be started in combat either.
