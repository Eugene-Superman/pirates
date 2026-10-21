---
paths:
  - 'src/game/**'
---

# Game logic (`src/game/`)

## Layer boundaries

- No imports from `pixi.js` or `views/`, and no DOM/browser APIs (`window`, `document`, `location`).
  Only data, physics and math live here — this code should be able to run on a future game server.
- How things look is decided by the view. If a view lacks data (as happened with `turnRate` for heeling) — add a field to the model, not drawing logic here.

## Units and coordinates

- World is `WORLD_WIDTH × WORLD_HEIGHT` = 4000 × 4000 units (on screen 1 unit = `zoom` = 1.4 px).
- `x` points east, `y` points south, as on a map seen from above (the isometric camera shows it rotated 45°). Heights (`height`, `hillHeight`) are `z` up from the water.
- Angles are in **radians**; `rotation = 0` means the bow points to +x. Normalize angles with `normalizeAngle` → `[-π, π]`.
- Speeds are in units per second, `dt` in seconds. The HUD shows knots as `speed / 10`.

## Deterministic map

- `createWorld()` uses `createRandom(seed)` (mulberry32): islands use seed `42`, waves use seed `1`.
- The map is identical on every run. **Any change to the number or order of `random()` calls in `createIslands`
  changes the whole map** — unless that is the goal, append new random parameters at the end or use a separate generator with its own seed.
- `Math.random()` is allowed only for cosmetics that don't affect gameplay (like foam jitter in `Wake`).
- The ship starts at the world center; islands are never generated closer than `radius + 400` to it.

## Ship (`Ship.ts`)

- Movement towards `target`: turns no faster than `turnSpeed`, slows down near the target (`arriveFactor`) and on sharp turns (`turnFactor`).
- The target is cleared once closer than `ARRIVE_DISTANCE`. `setTarget` clamps the target to world bounds.
- Collisions: an island is a circle of `island.radius`, the ship is a circle of `ship.radius`. On collision the ship is pushed out
  and its speed drops to 25% of max. Physics ignores the coastline shape (`shape`).
- `turnRate` (rad/s) exists only for visual heeling in views.

## Foam wake (`Wake.ts`)

- Fixed pool of `POOL_SIZE` particles reused round-robin. No new objects are created during gameplay.
- A particle is "dead" when `life >= WAKE_LIFETIME`; animation progress is `foamProgress(p)` from 0 to 1.
