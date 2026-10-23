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
  The order: clear `state.events` → bring back destroyed targets whose time is up, move the targets → for each ship,
  the pilot picks a helm, then the ship steers and collides in sub-steps of at most `MAX_STEP` world units (round
  targets that are afloat only) → combat (reloads, volleys at attack targets, projectiles landing).
- `state.events` (shots, impacts, damage, destroyed targets) live for one update: the client reads them in
  `view.update` right after it.

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

- Clicking a target calls `ship.attack`: the ship fires a volley every time its selected weapon is loaded, until
  `ceaseFire` (the target clicked again, Escape, the HUD's button) or the target is destroyed. While it can't fire,
  combat sets `ship.holdReason` every update: no guns of the weapon fitted, out of the loaded ammo, the target hidden
  in the fog of war (`ship.canSee`), or beyond the weapon's range. The HUD tells the player.
- A ship class has gun `slots` per weapon; `ship.guns` holds the gun fitted in each (`fitGun`), one of `GUNS` in
  `arsenal.ts`. A volley fires every fitted gun of the selected weapon that has a shot of the loaded ammo
  (`loadAmmo`, `ship.ammo`), one projectile each. Cannons fire from the side facing the target.
- Damage is rolled when a volley is fired (`rollVolley`), with the game's own seeded generator (`COMBAT_SEED` in
  `Game`, so shooting never shifts the map's random numbers): each gun rolls 1…its die, a 1 misses, the top is a
  critical hit (twice the die plus the ammo's bonus), anything else is the roll plus the bonus. A weapon does full
  damage to what it is made for (`against`: cannons objects, harpoons creatures) and `OFF_TARGET_SHARE` to the rest.
- Projectiles always hit: they home in on the target, and a volley's all land together after `distance / weapon.speed`.
  The first to land does the volley's damage (a `damage` event). A target at 0 hit points is destroyed (a `destroyed`
  event): it can't be seen, shot at or bumped into, shots still flying at it fall into the sea, and after
  `RESPAWN_TIME` it comes back whole.
- Targets (`targets.ts`) follow fixed paths computed from the game time alone (`pathPoint`: a circle or a figure of
  eight), so the server and clients agree on where they are. Nothing damages ships yet.

## Hull health (`ships/damage.ts`)

- A ship has hull points: `hp`, whole, out of `maxHp` (its class's `hp`). They change only through `ship.setHealth`
  (in percent, for the HUD's debug buttons) and `ship.takeDamage` (for combat, once something hits ships), both clamped.
- `health` is derived from them: hull integrity in percent, `0`–`MAX_HEALTH` (100). Damage stages and speed go by it.
- `damageStage(health)` maps it to one of `DAMAGE_STAGES`: `intact` → `minor` → `heavy` → `burning` → `sinking`.
  The order matters: the client falls back along it when a stage has no sprite.
- At 0 the ship is sinking (`isSinking`): its target and attack target are cleared, `setTarget` and `attack` are
  ignored, and it coasts to a stop.
  How it goes down and disappears is a client animation for now; nothing in the game removes a sunk ship yet.
