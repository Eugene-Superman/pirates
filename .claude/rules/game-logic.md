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
  The order: clear `state.events` → move the targets → for each ship, the pilot picks a helm, then the ship steers and
  collides in sub-steps of at most `MAX_STEP` world units → combat (reloads, fire orders, projectiles).
- `state.events` (shots, impacts, held fire) live for one update: the client reads them in `view.update` right after it.

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
- The ship starts at the world center (set in `Game`); islands are never generated closer than `reach + 400` to it.

## Ship (`ships/Ship.ts`)

- Every ship has a `ShipClass` from `SHIP_CLASSES` (`ships/shipClasses.ts`): size and handling are copied from it into
  fields at construction. Class ids are unique across lines; how to add a class is in `docs/ships.md`.
  `maxSpeed`, `minSpeed` and `viewRange` stay writable for tuning (`setSpeeds`, `setViewRange`); damage lowers the top
  speed from `maxSpeed` towards `minSpeed` (`topSpeed`).
- `setTarget` clamps the target to world bounds; `ship.steer(dt, helm)` turns no faster than `turnSpeed` and speeds up
  or slows down towards the helm's speed. The helm comes from the pilot.

## Navigation (`navigation/`)

- `NavGrid` is built once from the world: a grid of 16-unit cells, each with its clearance (distance to the nearest
  coast or world edge). `findRoute` goes straight when it can, otherwise A* round the land, pulled tight to few legs.
  The search is deterministic (ties break in insertion order), so the server finds the same routes.
- `pilot` follows the route leg by leg, slows near the last waypoint and for turns it couldn't make at speed, and swerves
  round other ships and targets (velocity obstacles, starboard first). The target is cleared within `ARRIVE_DISTANCE` of
  the last waypoint, or after `STUCK_TIME` without the route left to sail getting shorter.

## Physics (`physics/`)

- Every hull (ships, targets) is a capsule along its heading (`Hull`: `bow`, `stern`, `halfBeam`); islands are their
  `coast` polygons. `collideShip` pushes a ship out of whatever it overlaps and takes away only the part of its speed
  that went into it, so it slides along coasts and hulls. Ships push each other apart by their hulls' area.

## Combat (`combat/`)

- Clicking a target calls `ship.orderFire`; the order fires as soon as the selected weapon is loaded, or the ship holds
  fire (a `holdFire` event) when the target is out of range or hidden in the fog of war (`ship.canSee`).
- Projectiles always hit: they home in on the target and land after `distance / weapon.speed` seconds. Hits are counted
  on the target; nothing damages ships yet.

## Hull health (`ships/damage.ts`)

- `health` is hull integrity in percent, `0`–`MAX_HEALTH` (100), changed only through `ship.setHealth` (clamped).
  For now only the HUD's debug buttons call it; combat will.
- `damageStage(health)` maps it to one of `DAMAGE_STAGES`: `intact` → `minor` → `heavy` → `burning` → `sinking`.
  The order matters: the client falls back along it when a stage has no sprite.
- At 0 the ship is sinking (`isSinking`): `setHealth` clears its target, `setTarget` is ignored, and it coasts to a stop.
  How it goes down and disappears is a client animation for now; nothing in the game removes a sunk ship yet.
