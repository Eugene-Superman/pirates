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

## Units and coordinates

- World is `WORLD_WIDTH × WORLD_HEIGHT` = 4000 × 4000 units (on screen 1 unit = `zoom` = 1.4 px at the default zoom).
- `x` points east, `y` points south, as on a map seen from above (the isometric camera shows it rotated 45°). Heights (`height`, `hillHeight`) are `z` up from the water.
- Angles are in **radians**; `rotation = 0` means the bow points to +x. Normalize angles with `normalizeAngle` → `[-π, π]`.
- Speeds are in units per second, `dt` in seconds. The HUD shows knots as `speed / 10`.

## Deterministic map

- `createWorld()` uses `createRandom(seed)` from `lib/random.ts` (mulberry32); islands use seed `42`.
- The map is identical on every run. **Any change to the number or order of `random()` calls in `createIslands`
  changes the whole map** — unless that is the goal, append new random parameters at the end or use a separate generator with its own seed.
- The ship starts at the world center (set in `Game`); islands are never generated closer than `radius + 400` to it.

## Ship (`ships/Ship.ts`)

- Every ship has a `ShipClass` from `SHIP_CLASSES` (`ships/shipClasses.ts`): size and handling are copied from it into
  readonly fields at construction. Class ids are unique across lines; how to add a class is in `docs/ships.md`.
- Movement towards `target`: turns no faster than `turnSpeed`, slows down near the target (`arriveFactor`) and on sharp turns (`turnFactor`).
- The target is cleared once closer than `ARRIVE_DISTANCE`. `setTarget` clamps the target to world bounds.
- Collisions: an island is a circle of `island.radius`, the ship is a circle of `ship.radius`. On collision the ship is pushed out
  and its speed drops to 25% of max. Physics ignores the coastline shape (`shape`).

## Hull health (`ships/damage.ts`)

- `health` is hull integrity in percent, `0`–`MAX_HEALTH` (100), changed only through `ship.setHealth` (clamped).
  For now only the HUD's debug buttons call it; combat will.
- `damageStage(health)` maps it to one of `DAMAGE_STAGES`: `intact` → `minor` → `heavy` → `burning` → `sinking`.
  The order matters: the client falls back along it when a stage has no sprite.
- At 0 the ship is sinking (`isSinking`): `setHealth` clears its target, `setTarget` is ignored, and it coasts to a stop.
  How it goes down and disappears is a client animation for now; nothing in the game removes a sunk ship yet.
