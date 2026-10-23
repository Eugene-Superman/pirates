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
  The order: clear `state.events` → bots farther than `WAKE_RANGE` from every player are stopped, the awake ones think
  (`thinkBots`: pick a foe, a course, an attack) → for each awake ship, the pilot picks a helm (a sinking ship gets
  none and coasts), then the ship steers and collides in sub-steps of at most `MAX_STEP` world units (only islands and
  ships within `WAKE_RANGE + MEET_RANGE` of a player are looked at) → combat (reloads, volleys and bites at attack
  targets, projectiles landing) → loot (`stepLoot`: bounties, quest kills, chests dropped) → repairs → chests sunk or
  hauled aboard (`stepChests`) → bots sunk this update taken out, due ones spawned (`stepSpawns`) → players' ships at
  the mooring docked (`stepDocking`) → a player's wreck brought back once `WRECK_TIME` is up.
- `state.events` (shots, impacts, bites, damage, destroyed units, repair steps, gold paid) live for one update: the
  client reads them in `view.update` right after it.
- Every ship and chest has an `id`, unique in the game (`state.nextId` hands them out): attacks, events and the
  client's selection refer to units by it.

## Units and coordinates

- World is `WORLD_WIDTH × WORLD_HEIGHT` = 8000 × 8000 units: `MAP_SQUARES × MAP_SQUARES` squares of `MAP_SQUARE` = 1000
  (`world/map.ts`), named A1…H8 on the client's maps (on screen 1 unit = `zoom` = 1.4 px at the default zoom).
- `x` points east, `y` points south, as on a map seen from above (the isometric camera shows it rotated 45°). Heights (`height`, `hillHeight`) are `z` up from the water.
- Angles are in **radians**; `rotation = 0` means the bow points to +x. Normalize angles with `normalizeAngle` → `[-π, π]`.
- Speeds are in units per second, `dt` in seconds. The HUD shows knots as `speed / 10`.

## Deterministic map

- `createWorld()` uses `createRandom(seed)` from `lib/random.ts` (mulberry32); islands use seed `42`.
- The map is identical on every run. **Any change to the number or order of `random()` calls in `createIslands`
  changes the whole map** — unless that is the goal, append new random parameters at the end or use a separate generator with its own seed.
- Every island has its own shape, made up by `randomIslandShape` (`world/islandShape.ts`) from the map's generator: a
  size, a long axis, bays and capes, a jagged coast (`coastShape`), its land's height and maybe a hill. Its `coast`
  polygon and `reach` (farthest coast point from the centre) are computed once in `createIslands`.
- The port's island comes first in `world.islands`: a fixed shape of its own (`world/port.ts`, a stream of the map's
  seed) in the middle of the world. The other islands keep `ISLAND_GAP` clear of it and of each other.
- A player's ship starts at `START` (`world/World.ts`: the port's roadstead) and comes back there after it was sunk;
  islands are never generated closer than `reach + 400` to it.
- The game's other generators don't shift the map. `new Game(seed)` takes the match's own seed (the client picks one
  per game; online, the server will) and makes each generator from a stream of it (`streamSeed`): the dice
  (`COMBAT_STREAM`), the bots (`BOT_STREAM`: where they spawn and wander) and the chests (`LOOT_STREAM`).

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
  other ships (velocity obstacles, starboard first) — but a monster never swerves round its prey. The
  target is cleared within `ARRIVE_DISTANCE` of the last waypoint, or after `STUCK_TIME` without the route left to sail
  getting shorter; a target with no way to it keeps that count running, so the ship gives up instead of replanning forever.

## Physics (`physics/`)

- Every hull is a capsule along its heading (`Hull`: `bow`, `stern`, `halfBeam`); islands are their
  `coast` polygons. `collideShip` pushes a ship out of whatever it overlaps and takes away only the part of its speed
  that went into it, so it slides along coasts and hulls. Ships push each other apart by their hulls' area.

## Combat (`combat/`)

- A unit (`units.ts`) is anything that can be fired at: only a `Ship` for now. `findUnit` finds one by id;
  `isAfloat` is false for a wreck going down.
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
- Damage is rolled when a volley is fired (`rollVolley`), with the game's own seeded generator (the dice): each
  gun rolls 1…its `die`; `missOn` or lower misses, `critFrom` or higher is a critical hit (`critMultiplier` × the die
  plus the ammo's bonus), anything else is the roll plus the bonus. A weapon does full damage to what it is made for
  (`against`: cannons objects, harpoons creatures) and `OFF_TARGET_SHARE` to the rest. Every die rolled travels with
  the volley as its `Strike` (attacker, ammo, bonus, share, each die) into the `damage` event, for the combat log.
- Projectiles always hit: a volley homes in on the target and lands after `distance / weapon.speed`, doing its damage
  (a `damage` event). A sea monster has jaws (`shipClass.bite`) instead of gun slots: once they are ready and its head
  (the hull's bow) is within `reach` of the victim's hull, it bites — a `bite` event, full damage at once, no projectile.
- Firing, or being fired at or bitten, puts a ship in combat for `COMBAT_TIME` (`enterCombat`): no repairs till then.
  A ship that is hit remembers who hit it (`lastHitBy`), so a bot fights back.
- A unit at 0 hit points is destroyed (a `destroyed` event with its kind, heading and who struck, for the client's
  wreck and for the loot): it can't be seen, shot at or bumped into, and shots still flying at it fall into the sea.
  Ships go down (see Hull health).
- A ship in port (`docked`) is out of the fight: nobody fires at it, and shots still flying at it fall into the sea.

## Bots (`bots/`)

- `botKinds.ts`: each kind of bot sails a class of the `bots` or `monsters` line, is `neutral` or `aggressive`, has
  the ammo its guns fire, an `aggroRange`, a `cruise` throttle, how many sail each map square on average
  (`perSquare`), its `respawnTime`, the `bounty` its killer is paid and the `chest` it may leave.
- `brain.ts` (`thinkBots`, before the ships steer): a bot picks a foe — the player who hit it, or for an aggressive
  one the nearest player within its aggro range — and fights it: a monster goes for the hull, a gunship closes to
  `FIGHT_SHARE` of its guns' reach and circles there, a bot with no weapon runs. It gives the foe up after `LOSE_TIME`
  beyond `LEASH`, then wanders round its home at its cruise throttle. Bots never fight bots, and leave a player in port
  be. `isHostile` tells the client whether a bot threatens a player.
- Only bots within `WAKE_RANGE` of a player's ship are awake (`isAwake`): the rest wait where they are, stopped, so a
  big sea full of bots costs only those round the players. `WAKE_RANGE` stays well beyond a player's view range and
  `LEASH`, so a bot wakes before it can be seen and gives up a fight before it falls asleep.
- `spawner.ts`: `populate` puts every kind's bots on open water when the game starts (aggressive ones no nearer than
  `SAFE_RADIUS` to `START`). A sunk bot is taken out of `state.ships` in the update it sinks (the client animates the
  wreck) and replaced `respawnTime` later near where it sailed (within `RESPAWN_SPREAD` of its home), where no player
  can see it; a spawn that finds no room tries again later.

## Economy (`economy/`), the port (`world/port.ts`) and saves (`save.ts`)

- `state.player` (`player.ts`) is what belongs to the player rather than to their ship: `gold`, the `hold` of guns not
  fitted, the quests taken. One player for now; online there will be one per player's ship (`playerOf`). Gold comes
  in only through `earn` (a `gold` event for the client) and goes out through the shop; `giveGold` is the HUD's debug button.
- `loot.ts`: `stepLoot` reads this update's `destroyed` events: the player who sank a bot is paid its kind's `bounty`
  and counts it for their quests (`countKill`), and the bot may leave a `Chest` (chance and gold from `BOT_KINDS`, the
  loot generator). `stepChests`: a chest sinks after `CHEST_TIME`; a player's ship sailing over it hauls it aboard.
- `quests.ts`: the tavern's `QUESTS` (sink `count` of a hull class for a `reward`); at most `MAX_QUESTS` taken at once,
  taken and turned in only in port. `shop.ts`: guns into the hold, packs of `AMMO_PACK` shots, the shipwright's full
  repair, priced by tier, only in port. A gun is fitted from the hold anywhere (`fitFromHold`).
- The port (`PORT`, made once, the same on every run): a player's ship within `DOCK_RADIUS` of its `mooring` docks
  (`stepDocking`, `ship.dock`): stopped, `setTarget` and `attack` ignored, out of the fight. `leavePort` sails it out
  to the `roadstead`; `mayDock` keeps it from docking again until it has sailed `UNDOCK_MARGIN` away.
- `save.ts`: `saveGame` makes plain `SaveData` of a player's progress (the purse, the hold, quests, and the ship: its
  class, place, hull, guns, ammo, weapon, whether it is in port); `loadGame` checks every field and keeps only the
  valid ones (a ship on land or off the map comes back at `START`). No bots, chests or time: the sea is made afresh.
  Bump `SAVE_VERSION` when the shape changes. The client keeps the save until there is a server.

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
