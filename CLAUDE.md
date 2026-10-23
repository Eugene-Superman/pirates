# Pirate Game

Frontend of a browser naval game in the style of _Pirate Storm: Death or Glory_.
Click on the sea and the ship sails there, steering around islands.
Camera: classic 2:1 isometric pseudo-3D (no perspective) — the target look of the game.

Stack: TypeScript 7 (strict) + Pixi.js v8 + Vite 8, Prettier + Oxlint. No backend yet, no tests.

## Planned online part

An online part (server, other players) will be added later, with a **NestJS** backend in a **separate repository**.
This repo is the frontend only. How the shared logic reaches the backend (e.g. a private npm package) is decided
when the backend starts. Don't build networking or a server until asked, but keep the code ready for it:

- `src/game/` stays free of Pixi, DOM and browser APIs — this logic is the candidate to share with the server.
- The shared logic has no runtime dependencies and no framework code (no Pixi, no Nest decorators/DI) —
  the server will wrap it in its own services.
- Player actions reach the game only through game-logic methods (like `ship.setTarget`) — later they become commands sent to the server.
- Gameplay randomness is seeded and deterministic (`createRandom`). Cosmetics that don't affect gameplay
  (waves, foam) live in `src/client/` and may use `Math.random()`; in `src/game/` it is a lint error.
- If a change would make the future online part harder, say so explicitly.

## Commands

- `npm run dev` — Vite dev server, opens the browser automatically
- `npm run format` — Prettier rewrites files in place
- `npm run check` — `tsc` + Oxlint + `prettier --check`. **After every code change run `npm run format`, then `npm run check`**
- `npx tsc` / `npm run lint` — type check / Oxlint only
- `npm run build` — `tsc && vite build` into `dist/`

There are no automated tests. Visual changes are checked by a human in the browser — say what to look at.

## Architecture

The code is split by where it runs, then by domain inside each part:

```
src/
  main.ts              entry point: creates the Pixi Application and starts GameClient
  game/                SHARED LOGIC — future package for the server: data, physics, math. No Pixi, DOM, Math.random
    index.ts           public API: everything outside game/ imports it only from here
    Game.ts            owns GameState, update(dt) advances the simulation in a fixed order
    GameState.ts       everything the client reads and draws
    world/World.ts     world size, islands placed from a fixed seed, each one of ten shapes (islandShapes.json,
                       written by blender-assets/islands/build_islands.py with their pictures), islandOutline
    ships/Ship.ts      a ship's state: target and route, steering, hull points, guns in slots, ammo, fire lock
    ships/shipClasses.ts  ship catalog: lines and classes with size and handling; STARTER_SHIP (the starter sloop)
    ships/damage.ts    hull health scale (0–100 %) and the damage stages derived from it
    combat/            weapons.ts (cannons, harpoons: range, speed, reload, what each is made for), arsenal.ts
                       (guns and ammo by level, the damage dice), targets.ts (practice targets with hit points: a
                       barrel, a boat and a sea serpent), combat.ts (fire locks, volleys, homing projectiles, damage)
    navigation/        NavGrid.ts (open water as a grid with clearance from land; routes round islands, A*),
                       pilot.ts (steers each ship along its route, slows for turns, swerves round ships and targets)
    physics/           hull.ts (hulls as capsules, the Body interface), collisions.ts (ships pushed out of coasts,
                       targets and each other, sliding instead of stopping)
    lib/               math.ts (clamp, normalizeAngle), geometry.ts (points, segments, polygons), random.ts (seeded createRandom)
  client/              BROWSER: Pixi, DOM, input. Reads GameState, never mutates it except through game methods
    GameClient.ts      wires Game + SceneView + Hud + input, runs the frame loop
    input/             pointerInput.ts: mouse/touch → ship.setTarget, or ship.attack / ceaseFire on a target;
                       keyboardInput.ts: Escape → ceaseFire
    hud/               Hud.ts (screen-space overlay: the items picked in the settings, a Settings button),
                       hudItems.ts (every metric and control the HUD can show, grouped; Loadout is the test menu for
                       guns and ammo), SettingsPanel.ts (dev settings:
                       all controls, and checkboxes for what is also on the screen), FpsMeter.ts,
                       ButtonRow.ts (a row of HUD buttons), Checkbox.ts, DamagePanel.ts (debug buttons that set hull health)
    render/            3D engine with no game knowledge
      Camera3D.ts      parallel projection world → camera → screen and back (screenToGround)
      Painter3D.ts     3D primitives on top of Pixi Graphics: projection, lighting, shadows
    scene/
      SceneView.ts     isometric scene: draw order, redraws every frame
      cameraControl.ts how the camera keeps up with the ship: follow / dead zone / recenter
      models/          island3d.ts (low-poly islands), barrel3d.ts, targetBoat3d.ts, serpent3d.ts (the sea
                       serpent), projectile3d.ts (cannonball, harpoon) — 3D models; IslandSprites.ts — textured islands from their Blender pictures;
                       ShipSprite.ts — ships from their Blender atlases
      effects/         client-only decorations with their own state: Wake.ts (wakes of everything that sails, one
                       shader), foam.ts (what the wakes and the wreck's water share), waves.ts, targetMarker.ts,
                       ShipFire.ts (fire and smoke of a damaged ship), Sinking.ts
                       (the sinking animation, and the water round the wreck: churn, ring waves, bubbles),
                       ShotEffects.ts (muzzle flashes, smoke, splashes, splinters), DamageNumbers.ts (damage
                       floating up over a target), targetLock.ts (the ring round the target fired at), rangeRings.ts, wind.ts,
                       fogOfWar.ts (haze and mist beyond the ship's view range, one shader), FogClouds.ts (its puffs),
                       seaSurface.ts (the sea's surface, one shader), seaStyles.ts (its looks, switched by the HUD)
public/sprites/ships/  ship atlases: <line>/<id>/<damage stage>.{webp,json}, rendered in Blender from a source
                       outside this repo — don't edit by hand
public/sprites/fog/    fog of war textures (puffs.webp/json, wisps.webp), made by blender-assets/effects/fog/build_fog.py
public/sprites/sea/    sea wave maps and caustics, made by blender-assets/effects/sea/build_sea.py
public/sprites/foam/   foam for the wakes and the water round a wreck, made by blender-assets/effects/foam/build_foam.py
public/sprites/islands/ island pictures: <look>/<shape>_ground|_raised.webp + islands.json, made by build_islands.py
docs/ships.md          ship lines (planned factions and tiers), where a ship's files live, how to add a ship
```

Frame flow (`GameClient`): `game.update(dt)` → `view.update(dt)` (updates the wake and effects, reading the game's
`state.events` of this update, then draws) → `hud.update(...)`.
`dt` is in seconds, capped at 0.05.

Core rule: **`game/` knows nothing about the client; the client changes game state only through game methods.**

Where new code goes:

- Gameplay (anything the server must agree on: movement, combat, damage, loot) → a domain folder in `game/`
  (`game/ships/`, `game/world/`, a new one like `game/combat/`), stepped from `Game.update`. Export what the client needs from `game/index.ts`.
- How a game object looks → `client/scene/models/<thing>3d.ts`, called from `SceneView`.
  A new ship → follow [docs/ships.md](docs/ships.md): its model and atlases, not code, decide how it looks.
- Visual-only things with their own state (particles, decorations) → `client/scene/effects/`.
- Screen-space UI → `client/hud/`; new controls → `client/input/`.
- A domain folder appears when its first file does; a file grows into a folder when it gets a second file.

Camera settings are the `CAMERA` constant in [src/client/scene/SceneView.ts](src/client/scene/SceneView.ts)
(pitch 30°, yaw 45°, zoom 1.4); the HUD's zoom buttons scale the zoom ×1–×3 at runtime (`SceneView.setZoom`). Don't add perspective, sky or other projections unless asked —
they were tried and removed (commit `2c8125f` still has them). How the camera follows the ship is a separate, switchable
choice (`scene/cameraControl.ts`, the HUD's Camera buttons). The ship atlases are rendered for this pitch and yaw:
changing them means re-rendering them with `CAM_PITCH` / `CAM_YAW` updated in `render_sprites.py`. The Blender source
lives outside this repo, in a `blender-assets` folder next to it (`ships/<line>/<id>/` + `render_sprites.py`,
`render_stages.py`; see its README); a separate art repository is planned.

## Code style

- Everything is in **English**: code comments, HUD texts, and Claude context files
  (`CLAUDE.md`, `.claude/rules/`, skills) — whatever language the request is in.
- A comment explains "why", not what the code does.
- `verbatimModuleSyntax`: type-only imports must use `import type` / inline `type X` inside `{}`.
- `noUnusedLocals` / `noUnusedParameters` are on — unused code will not compile.
- Formatting is Prettier's job (`.prettierrc.json`: single quotes, width 120) — don't format by hand.
  `// prettier-ignore` only for data tables such as model vertices.
- Lint rules live in `.oxlintrc.json`. Linting is Oxlint, not ESLint: typescript-eslint doesn't support TypeScript 7.
  Fix a lint error instead of silencing it; if a rule is wrong for this project, turn it off in the config with a comment why.
- Oxlint enforces the boundaries: `src/game/` has no `pixi.js` or `client/` imports, no `window` / `document`,
  no `Math.random`; `src/client/` and `src/*.ts` import game logic only from `game/index.ts`.
- File names follow the main export: PascalCase for a class (`Ship.ts`, `SceneView.ts`), camelCase for functions (`island3d.ts`, `pointerInput.ts`).
- Colors are `0xRRGGBB` numbers; a model's colors live in a `COLORS` object at the top of the file.
- Magic numbers go into `UPPER_CASE` constants with a comment about units.
- Before writing a new helper, check `game/lib/` and the exports of `client/render/Painter3D.ts` (`shade`, `shadowPoint`).

## Pixi.js v8 — don't mix up with v7

The project uses **Pixi v8**. Do not use v7 API (`beginFill`, `drawCircle`, `lineStyle`, `new Application({...})`).

- `await app.init({...})`, then `app.canvas`
- `Graphics`: shape first, then style — `g.circle(x, y, r).fill({ color, alpha })`, `g.poly(points).stroke({ width, color })`
- `new Text({ text, style })`

## Detailed rules

Separate files in `.claude/rules/` are loaded when working on the matching part of the code:

- [.claude/rules/game-logic.md](.claude/rules/game-logic.md) — `src/game/**`: units, map determinism, ship physics
- [.claude/rules/rendering-3d.md](.claude/rules/rendering-3d.md) — `src/client/**`: coordinate systems, draw order, effects, performance

## Git

- Changes reach `main` only through pull requests: one branch per logical change, never commit or push to `main` directly.
- Commit message and PR title: `[TYPE]: short description` in English, where TYPE is `FEATURE`, `FIX`, `REFACTOR`, `DOCS` or `CHORE`.
  Branch: `feature/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…` in kebab-case, e.g. `feature/cannon-fire`.
- Commit only when asked. Running `/git-push` counts as asking.
- No AI attribution in commits and PRs: no `Co-Authored-By: Claude`, no "Generated with Claude Code", no session links.
  Also turned off in `.claude/settings.json` (`attribution`).

## Skills

- `/code-review` — reviews the current changes: bugs, performance, best practices, architecture against this file and `.claude/rules/`.
- `/git-push` — runs the code review, offers fixes, then branch → commit → push → pull request.
