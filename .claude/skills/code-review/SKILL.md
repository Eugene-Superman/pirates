---
name: code-review
description: Review the current changes in this repo for bugs, performance, best practices and code quality/architecture, checked against CLAUDE.md and .claude/rules. Use when asked to review changes, before committing, and as the first step of /git-push.
argument-hint: '[base-branch | file paths]'
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git show *) Bash(npx tsc *) Bash(npm run check *)
---

# Code review

Review the changes in this repository. This is a **read-only** task: do not edit, stage or commit anything.

## 1. Collect the changes

Pick the scope:

- `$ARGUMENTS` names files or folders → review those files in full.
- `$ARGUMENTS` names a branch → review `git diff <branch>...HEAD` plus any uncommitted changes.
- No arguments:
  - uncommitted work exists → `git diff HEAD` plus untracked files from `git status --short` (read each new file in full);
  - the working tree is clean → the commits of the current branch that are not in `main` (`git diff main...HEAD`).

If there is nothing to review, say so and stop.

Read every changed file in full, not only the diff hunks — most architecture and performance problems are only visible in context.

## 2. Load the project rules

Read `CLAUDE.md` and the files in `.claude/rules/` whose `paths` match the changed files. They are the source of truth for
layer boundaries, folder structure, conventions and the planned online part. Breaking an explicit rule is at least a "Should fix".

## 3. Run the checks

Run `npm run check` (type check, Oxlint, Prettier check). Every type error and lint error is a "Must fix";
files Prettier would change are one "Should fix" (fixed with `npm run format`).

## 4. Review

Report only real problems in the changed code. Keep it proportionate: no micro-optimizations for code that runs once.

### Correctness

- Logic bugs, wrong edge cases, off-by-one, angle wrap-around (use `normalizeAngle`), division by zero, NaN.
- Time handling: everything frame-dependent must scale with `dt` (seconds).
- Event listeners, timers and Pixi objects that are created repeatedly or never cleaned up.

### Architecture

- Layer rules from `CLAUDE.md`: the game-logic layer has no Pixi, DOM or browser APIs; rendering never mutates game state;
  player actions reach the game only through game-logic methods; gameplay randomness is seeded.
- Readiness for the online part (separate NestJS backend): logic the server will need lives in the logic layer and is framework-free.
- New code sits in the right folder ("Where new code goes" in `CLAUDE.md`); each file does one thing; no circular imports.
- Reuse existing helpers (`game/lib/`, `Painter3D` exports) instead of writing duplicates.
- No speculative abstractions (interfaces with one implementation "for later", unused parameters/options) — and no copy-paste either.

### Performance

The hot path is everything that runs every frame: the `app.ticker` callback, `update(dt)` of `Game`, `SceneView` and effects, model and effect `draw*` functions, `Painter3D` methods.

- Allocations inside large per-frame loops (every ship at sea: about 145 on the 8 × 8 map): new arrays, objects or closures per item, `filter`/`map` chains on big arrays.
- O(n²) loops, sorting more than needed, work that could be done once in a constructor or cached.
- Drawing invisible things: big loops must cull with `painter.isVisible` first.
- Shape count: model detail (coastline segments) or particle pools and spawn rates (`ShipFire`, `Wake`) raised without need.
- Pixi: `Text.text` assigned every frame (re-renders a texture — update only on change), new `Graphics` per frame instead of `clear()`,
  textures/graphics never destroyed.

### Code quality and best practices

- TypeScript: no `any`, no `!` or `as` without a reason, `import type` for type-only imports, `readonly` where it applies.
- Pixi v8 API only (no v7 `beginFill`, `drawCircle`, `lineStyle`, `new Application({...})`).
- Naming is clear and matches the surrounding code; magic numbers are `UPPER_CASE` constants with a units comment.
- Comments are in English and explain "why"; comments made outdated by the change are updated.
- `oxlint-disable` / `prettier-ignore` comments and rules turned off in `.oxlintrc.json` have a reason; a real problem isn't silenced.
- Dead code left behind: unused functions, exports, constants, CSS.

### Docs

If behavior, commands, folder structure or conventions changed, `CLAUDE.md`, `.claude/rules/` and `README.md` are updated to match.

## 5. Report

Group findings by severity and number them continuously so they can be referred to ("fix 1 and 3"):

- **Must fix** — bugs, type errors, broken `CLAUDE.md` rules, things that will block the online part.
- **Should fix** — performance problems on the hot path, best-practice and architecture issues, duplication, missing docs updates.
- **Nit** — style and naming; optional.

Each finding: `file:line` — the problem — why it matters — a concrete fix (a short snippet when it helps).

Problems in code the change didn't touch go into a short "Outside this change" list at the end. They are not findings and don't affect the verdict.

If there are no findings, say what was checked in one or two lines.

End the report with exactly one line:

- `VERDICT: CLEAN` — no Must fix and no Should fix (nits are allowed)
- `VERDICT: CHANGES REQUESTED` — at least one Must fix or Should fix
