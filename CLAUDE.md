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
- Gameplay randomness is seeded and deterministic; `Math.random()` only for cosmetics.
- If a change would make the future online part harder, say so explicitly.

## Commands

- `npm run dev` — Vite dev server, opens the browser automatically
- `npm run format` — Prettier rewrites files in place
- `npm run check` — `tsc` + Oxlint + `prettier --check`. **After every code change run `npm run format`, then `npm run check`**
- `npx tsc` / `npm run lint` — type check / Oxlint only
- `npm run build` — `tsc && vite build` into `dist/`

There are no automated tests. Visual changes are checked by a human in the browser — say what to look at.

## Architecture

```
src/
  main.ts          entry point: Pixi Application, HUD, mouse controls, game loop
  game/            LOGIC: data and math only, no Pixi
    GameState.ts   GameState: everything the view reads and draws
    World.ts       map generation (islands, waves) from a fixed seed
    Ship.ts        ship movement towards target, island collisions
    Wake.ts        foam wake (particle pool)
    math.ts        clamp, normalizeAngle
  views/           RENDERING: read GameState and draw it
    ProjectedView.ts isometric view: redraws the scene every frame via Camera3D + Painter3D
    Camera3D.ts    parallel projection world → camera → screen and back (screenToGround)
    Painter3D.ts   3D primitives on top of Pixi Graphics: projection, lighting, shadows
    ship3d.ts, island3d.ts  3D models of the ship and islands
```

Frame flow (`main.ts`): `ship.update(dt, islands)` → `wake.update(dt, ship)` → `view.update(dt)`.
`dt` is in seconds, capped at 0.05.

Core rule: **`game/` knows nothing about rendering, `views/` never mutate game state.**

Camera settings are the `CAMERA` constant in [src/views/ProjectedView.ts](src/views/ProjectedView.ts)
(pitch 30°, yaw 45°, zoom 1.4). Don't add perspective, sky or other camera modes unless asked —
they were tried and removed (commit `2c8125f` still has them).

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
- Oxlint enforces the `src/game/` boundary: no `pixi.js` or `views/` imports, no `window` / `document`.
- Colors are `0xRRGGBB` numbers; a model's colors live in a `COLORS` object at the top of the file.
- Magic numbers go into `UPPER_CASE` constants with a comment about units.
- Before writing a new helper, check `game/math.ts` and the exports of `Painter3D.ts` (`shade`, `shadowPoint`).

## Pixi.js v8 — don't mix up with v7

The project uses **Pixi v8**. Do not use v7 API (`beginFill`, `drawCircle`, `lineStyle`, `new Application({...})`).

- `await app.init({...})`, then `app.canvas`
- `Graphics`: shape first, then style — `g.circle(x, y, r).fill({ color, alpha })`, `g.poly(points).stroke({ width, color })`
- `new Text({ text, style })`

## Detailed rules

Separate files in `.claude/rules/` are loaded when working on the matching part of the code:

- [.claude/rules/game-logic.md](.claude/rules/game-logic.md) — `src/game/**`: units, map determinism, ship physics
- [.claude/rules/rendering-3d.md](.claude/rules/rendering-3d.md) — `src/views/**`: coordinate systems, draw order, performance

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
