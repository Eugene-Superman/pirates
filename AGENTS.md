# Pirate Game

Frontend of a browser naval game in the style of _Pirate Storm: Death or Glory_.
Click on the sea and the ship sails there, steering around islands. Bots (ships and sea monsters, neutral or
aggressive) roam the sea; the player fights them with cannons and harpoons and repairs between fights (for gold).
Kills pay gold and experience (each ship's own level, 1–20, and talents: three branches and a signature talent every
five levels) and leave chests and goods to haul aboard; the port in the middle of the map, a picture of the harbour
with its buildings to click, has a tavern (bounty quests), a market for the goods, a workshop (the ship's outfit,
repair), a shipyard and an arsenal (guns, ammo); a guild hall and an auction house wait for the online part.
A boss, the Smuggler Baron, holds a corner of the sea. The Captain's path leads a new player to the next ship, the
Coastal Bark, the first of the European line, then to the Corsair, its tier 2; the shipyard shows every line's ships,
the rest planned for later.
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
  main.ts              entry point: asks what draws the game (in software: no smoothing, fewer pixels), creates the
                       Pixi Application and the Game, loads what the browser kept, starts GameClient
  game/                SHARED LOGIC — future package for the server: data, physics, math. No Pixi, DOM, Math.random
    index.ts           public API: everything outside game/ imports it only from here
    Game.ts            owns GameState, update(dt) advances the simulation in a fixed order
    GameState.ts       everything the client reads and draws
    save.ts            a player's progress as plain data (saveGame), and putting it back checked field by field
                       (loadGame): Game.save() / Game.load()
    world/World.ts     the world: the port's island and islands placed round it from a fixed seed, the painted ones
                       with their paintings' coasts (paintedCoasts.json, written by
                       blender-assets/islands/build_island_art.py), START (off the
                       port: where a player's ship comes in), islandOutline; map.ts (8 × 8 map squares of 1000
                       units: MAP_SQUARE, MAP_SQUARES, WORLD_WIDTH); islandShape.ts (every island's own shape, made
                       up from the seeded generator); port.ts (the port: its island, a bay with curved harbour walls
                       and the basin inside them; docking)
    ships/Ship.ts      anything that sails under a pilot (the player's ship, bots' ships, sea monsters): target and
                       route, steering, hull points, guns in slots, ammo and the two of each weapon at hand
                       (ammoBar), fire lock, combat time, repairs
    ships/shipClasses.ts  ship catalog: the classes built, with size, handling, gun slots (or a monster's jaws);
                       the bots' hulls too; STARTER_SHIP (the starter sloop)
    ships/shipLines.ts the lines players sail (the starter, five of six tiers each, the Forbidden Fleets four ships a
                       tier, and the masterworks bought with doubloons) and their ships, built (a class) or planned (a
                       name, a role, provisional figures and how it is got: SHIP_SOURCES), for the shipyard: lineShip
    ships/damage.ts    hull health scale (0–100 %) and the damage stages derived from it
    ships/repair.ts    the repair skill: 2 % of the hull a second out of combat, paid in gold (1 for 10 hull)
    ships/outfit.ts    the ship's outfit: sails, hull planking or plating, a rudder, a lookout's gear, a piece to a
                       slot, in three tiers, each with sidegrades; what they add to the class's speed, turning, hull
                       and sight (grownStats)
    ships/talents.ts   the ship's level from its XP (kills, quests), the talents (three branches of ranked
                       talents, a point a level; a signature talent at levels 5, 10, 15, 20), what they do over time
                       (stepTalents) and the ability (useAbility)
    combat/            weapons.ts (cannons, harpoons: how shots fly, what each is made for), arsenal.ts (20 guns and
                       14 ammo from the balance table, each gun with its own reach and reload; the damage dice),
                       barrage.ts (a boss's mortar: marked spots on the water its shells land on),
                       units.ts (anything that can be fired at, by id: ships for now), combat.ts (fire locks,
                       volleys of the guns loaded and in reach, homing projectiles, monsters' bites, damage)
    bots/              botKinds.ts (kinds of bots: hull, neutral or aggressive, how many to a map square, respawn
                       time, loot; a boss with its lair and escort), brain.ts (what a bot does: wander, attack, fight
                       back or run, give up, follow its boss; only bots near a player are awake), spawner.ts (the
                       first bots, and sunk ones replaced near where they sailed, where no player sees; a boss at its
                       lair with its escort)
    economy/           player.ts (a player's gold, the guns and outfit in their hold, fitting guns from it, their
                       progress), loot.ts (bounties for kills, chests and goods dropped and hauled aboard, a player's
                       cargo lost where their ship sank), cargo.ts (goods, the hold), quests.ts (the tavern's bounty
                       quests), shop.ts (guns, ammo, outfit and repairs bought in port, the outfit fitted there, goods
                       sold at the market, guns and ammo sold back to the arsenal for a quarter, ammo dealt in by any
                       count up to MAX_AMMO_DEAL; the prices),
                       shipyard.ts (the ships for sale and their terms: the Captain's path; tierMastered, a masterwork's
                       term), fleet.ts (a player's ships: buying one, taking the helm of one laid up in port),
                       currencies.ts (gold, and the currencies to come that the shipyard already prices ships in)
    navigation/        NavGrid.ts (open water as a grid with clearance from land; routes round islands, A*),
                       pilot.ts (steers each ship along its route, slows for turns, swerves round other ships)
    physics/           hull.ts (hulls as capsules, the Body interface), collisions.ts (ships pushed out of coasts
                       and each other, sliding instead of stopping)
    account/           mastery.ts (the captain's mastery: the account's own tree of passives, for every ship the player
                       sails, six branches round the captain out to their keystones; planned: its figures provisional,
                       nothing taken or done yet, the levels and points come with the online game)
    records/           stats.ts (what a player and each of their ships have done: kills by class, quests, gold
                       earned and spent, chests, the fight, the voyage; for the medals to come), tally.ts (stepStats:
                       counting them from the events)
    lib/               math.ts (clamp, normalizeAngle), geometry.ts (points, segments, polygons), random.ts (seeded createRandom)
  client/              BROWSER: Pixi, DOM, input. Reads GameState, never mutates it except through game methods
    GameClient.ts      wires Game + SceneView + Hud + Sounds + input, runs the frame loop, saves every few seconds
    storage/           Store.ts: the browser's memory until there is a server (IndexedDB, else localStorage): the
                       progress, the view's settings, the HUD's items, the quest tracker's folds, the sound, the combat
                       log, the language
    i18n/              i18n.ts: t(), the player's texts in the language picked in the settings (English, the
                       default, Ukrainian or Russian; a change reloads the page); uk.ts, ru.ts: the dictionaries,
                       keyed by the English text
    audio/             Sounds.ts: the game's sounds (Web Audio): what the game's events sound like (shots, hits, bites,
                       wrecks, gold, levels), the HUD's (taps, purchases, refusals), the sea and gulls; volume, mute
    input/             pointerInput.ts: mouse/touch → ship.setTarget; a click picks a unit out (selection.ts,
                       client state), a double click attacks it; keyboardInput.ts (by key code, any layout): Space
                       attacks the unit picked out, Escape stops firing or lets go of it, Q and E pick the cannons
                       or the harpoons, Z and X load the first or the second ammo at hand, R repairs, F uses the ship's ability, L the loadout, K the talents, J the
                       combat log, M the sea chart, I the statistics, H the hold, P the captain's mastery; a click on the port sails into it; cursor.ts (the game's own mouse pointer: an orange arrow, with a ring over
                       a neutral unit, a red sight over a hostile one, an orange hand over buttons); hover.ts (the unit
                       under the mouse: the cursor shows it, a click takes it)
    hud/               Hud.ts (screen-space overlay: the items picked in the settings, and these:)
                       UnitFrames.ts (plates in the theme: the player's ship in the top left corner, its hull, level
                       and experience, and the purse, gold and doubloons (none yet), and the hold, a click on which
                       opens it, a click on the rest the statistics; and the unit picked out at the top, its hull),
                       QuestTracker.ts (top right, in the theme: the quests taken, how far each has got, ✕ gives one
                       up once the player says yes, and the Captain's path to the next ship; each part folds by its
                       header, the browser keeps the folds), fullscreen.ts (the game on the whole screen and back),
                       SkillBar.ts (at the bottom, in a painted frame: ten quick slots, 1…0, waiting for what the
                       hold will carry; the skills, painted: the repair and the ability, locked till its talent is
                       picked, and two locks on those to come; each weapon's plate with its two ammo at hand, Z and X,
                       their counts in K and M; ammo dragged out of the loadout drops on them; a tooltip over a skill
                       or an ammo: all about it), Tooltip.ts (a small panel telling what is under the pointer), TalentPanel.ts (the talent tree, K:
                       the signature talents and the three branches on boards, each with its emblem; ranks as
                       diamonds, a glow on what can be taken now, the rows' gates lit as they open; pick, and forget
                       them in port),
                       StatsPanel.ts (the statistics, I: all the player's ships together and each one, a tab each with
                       its picture, the sections on boards),
                       HoldPanel.ts (the hold, H or a click on it, in the theme like the loadout: how full it is, the goods aboard, thrown overboard to make room),
                       goodIcons.ts (the goods' colours and pictures, drawn until they are painted, and a good's row
                       with its buttons: the hold's and the market's),
                       MasteryPanel.ts (the captain's mastery, P: the account's tree of passives round the captain,
                       dragged and brought nearer with the wheel, what a passive gives under the pointer; a look
                       ahead for now),
                       TalentButton.ts (lit beside the player's frame while a talent waits to be picked),
                       LoadoutPanel.ts (the loadout window, L: the ship's gun slots and ammo at hand, the guns and
                       ammo in the hold, as icons; a click or a drag fits a gun or puts ammo at hand, here or on the
                       skill bar),
                       PortScreen.ts (in port: the harbour's picture with a medallion per building, HarbourView.ts,
                       and the window each opens: the tavern's quests (a card each, a dial round how far it has
                       got), the market (laid out like the hold), the workshop's outfit (a tab a
                       slot) and repairs, the shipyard (the player's ships, a tab a line: its ships, built or planned,
                       and Buy: the masterworks), the arsenal's guns and ammo (bought and sold back); the shop's items as cards with their
                       icons, scrolled when they don't fit; the guild hall and the auction house closed for now; Set
                       sail), itemFaces.ts (what a card and the info window say of a gun, an ammo, a piece of outfit
                       or a ship, and what their button does),
                       ItemInfo.ts (an item up close, from its card's info button: its picture, every figure, its
                       legend, Buy, Fit or Take the helm, Sell; for ammo, how many), ConfirmDialog.ts (a question before what can't be
                       undone: selling an item back, giving a quest up; one for the whole HUD, over every window), iconAtlas.ts (the guns', the ammo's, the outfit's and the
                       ships' icons, the minimap's buttons and the skill bar's skills, each atlas loaded once), arsenalLore.ts, outfitLore.ts and shipLore.ts (each one's legend; a
                       line's look),
                       ChatPanel.ts (the chat in the bottom left corner, in the theme: a tab for the combat log,
                       combatLog.ts, every blow dealt and taken with all its dice, kills, repairs, totals, J unfolds it;
                       and the chat's channels, general, zone, group, guild, private, empty till the online game),
                       Minimap.ts (bottom right, in a painted frame of wood and brass: the sea round the ship, turned
                       like the screen, islands and the units in sight; the four slots on top of the frame are
                       buttons: the hold, the loadout, the talents, the captain's mastery, lit while open; two smaller
                       brass medallions in its top corners, the settings and the full screen), SeaChart.ts (the whole world in 8 × 8 squares A1…H8 with the islands drawn as
                       in the game and the ship, in the diamond opening of a painted frame and nothing else; the boss's
                       lair a medallion, its name and the port's under the pointer, the square under it named; the
                       minimap or M opens it, the button in the frame's corner closes it), chart.ts (what the two maps share: projection, colors),
                       hudItems.ts (every metric and control the settings can show, grouped), SettingsPanel.ts (dev
                       settings: all controls, and checkboxes for what is also on the screen), ui.ts (the HUD's
                       colors, clickable tiles and buttons, icons, HudWindow: a window over the game, in a look of
                       its choice), theme.ts (the windows' look: dark wood under a brass frame, gold serif titles,
                       rows on darker boards, brass buttons, icon slots, meters, wells (deep blue, for lines of text),
                       round brass medallions, THEMED_WINDOW: HudWindow's look in it; the port's windows, every
                       HudWindow, the chat and the top of the HUD (the plates, the tracker) wear it),
                       FpsMeter.ts, ButtonRow.ts (a row of HUD buttons),
                       Checkbox.ts, DamagePanel.ts (debug buttons that set hull health)
    render/            3D engine with no game knowledge
      Camera3D.ts      parallel projection world → camera → screen and back (screenToGround)
      Painter3D.ts     3D primitives on top of Pixi Graphics: projection, lighting, shadows
      gpu.ts           what draws the game (probeGpu, before the Application): the graphics card, or the processor in
                       software
    scene/
      SceneView.ts     isometric scene: draw order, redraws every frame; sceneObjects.ts (what it sorts by depth)
      cameraControl.ts how the camera keeps up with the ship: follow / dead zone / recenter
      models/          island3d.ts (low-poly islands, until their paintings load), port3d.ts
                       (the port's walls, quay, houses, lighthouse and flag, until
                       its pictures load; then its lamp and flags over them), botShip3d.ts
                       (the bots' ships as vector models, until their atlases load), serpent3d.ts and turtle3d.ts (sea monsters:
                       their water, the serpent's body bending as it swims, and their bodies until their atlases load),
                       projectile3d.ts (cannonball, harpoon), chest3d.ts (floating loot: a chest, crates of goods, lost
                       cargo) — 3D models; ShipSprite.ts — a ship from its Blender atlases, animated ones too (the player's,
                       and the bots' and the turtle's through BotSprites.ts: a sprite and its fire per bot in sight,
                       the turtle swimming and biting); SerpentSprite.ts — a sea serpent from its atlases: pieces laid
                       along its body, the head swimming and biting; ChestSprites.ts — the floating loot from its
                       atlases (dropped, bobbing, blinking before it sinks); PortSprites.ts — the port from its
                       pictures: the ground under the ships, the rest in slices sorted with them; IslandSprites.ts —
                       the islands from their paintings, each in slices sorted with the ships, its shallows under them
      effects/         client-only decorations with their own state: Wake.ts (wakes of everything that sails, one
                       shader), foam.ts (what the wakes, the wreck's water and the sea's whitecaps share),
                       targetMarker.ts (where the ship is heading, once the mouse lets go: a green light coming
                       up out of the water with a splash, then hanging there with ripples and sparks round it),
                       ShipFire.ts (fire and smoke of a damaged ship), Sinking.ts
                       (the sinking animation, and the water round the wreck: churn, ring waves, bubbles),
                       ShotEffects.ts (muzzle flashes, smoke, splashes, splinters, bites), DamageNumbers.ts (damage
                       and repairs floating up), Wrecks.ts (sunk bots going down), RepairEffect.ts (a ship under
                       repair), LevelUpEffect.ts (a level reached), BarrageMarks.ts (a boss's shells coming down),
                       Trails.ts (where each serpent swam, for its body), targetLock.ts (the rings round the target
                       fired at and the unit picked out), rangeRings.ts (how far the weapon picked reaches: its guns'
                       longest and shortest reach, dashed rings running round in its colour), wind.ts,
                       fogOfWar.ts (haze and mist beyond the ship's view range, one shader), FogClouds.ts (its puffs),
                       SkyClouds.ts (now and then a light cloud drifting over everything, and its shadow),
                       seaSurface.ts (the sea's surface, one shader), seaLook.ts (how it looks: one set of numbers)
public/sprites/ships/  ship atlases: <line>/<id>/[<look>/]<damage stage>.{webp,json}, rendered in Blender from a
                       source outside this repo — don't edit by hand
public/sprites/fog/    fog of war textures (puffs.webp/json, wisps.webp), made by blender-assets/effects/fog/build_fog.py
public/sprites/loot/   the floating loot's atlases (chest/<look>/intact.{webp,json}), rendered in Blender like the ships
public/sprites/port/   the port's pictures (ground.webp, raised_<n>.webp, port.json): a painting laid on the render of
                       blender-assets/port/build_port.py (on the port's geometry exported from port.ts) and cut like
                       it by build_port_art.py; and the harbour
                       view in port (harbour.webp, medallions.webp, harbour.json: where each building is on it),
                       made from painted art by blender-assets/port/build_harbour_art.py — don't edit by hand
public/sprites/islands/ the islands' paintings (island_NN.webp: one's slices, island_NN_shallows.webp: the light
                       water round it, islands.json: where each goes and is sorted by): painted over each island's
                       outline, laid on it unstretched and cut by
                       blender-assets/islands/build_island_art.py, which writes their coasts into
                       src/game/world/paintedCoasts.json with them — don't edit by hand
public/sprites/icons/  the guns', the ammo's, the outfit's and the ships' icons (guns.webp, ammo.webp, outfit.webp,
                       ships.webp; their .json: each one's tile), cut out of painted pictures by
                       blender-assets/icons/build_gun_icons.py, build_ammo_icons.py, build_outfit_icons.py and
                       build_ship_icons.py — don't edit by hand
public/sprites/hud/    the minimap's frame (minimap_frame.webp), made from a painted picture by
                       blender-assets/hud/build_minimap_frame.py, which prints its opening and slots for Minimap.ts's
                       FRAME; the buttons in the slots (minimap_buttons.webp/json), cut out of painted medallions by
                       build_minimap_buttons.py; the skill bar's frame (skill_bar.webp), made from a painted picture
                       by build_skill_bar.py, which prints its wells for SkillBar.ts's FRAME, and its skills
                       (skill_icons.webp/json), the inside of painted buttons cut by build_skill_icons.py; the sea
                       chart's frame (chart_frame.webp), from a painted picture by build_chart_frame.py, which prints
                       its diamond opening and close button's slot for SeaChart.ts's FRAME — don't edit by hand
public/sprites/sea/    sea wave maps (swell, ripples, chop), the caustics and its broad patches (depth, clouds,
                       gusts), made by blender-assets/effects/sea/build_sea.py (its wind map the game leaves out)
public/sprites/sky/    the sky's clouds (clouds.webp/json), made by blender-assets/effects/sky/build_clouds.py
public/sprites/foam/   foam for the wakes and the water round a wreck, made by blender-assets/effects/foam/build_foam.py
public/sounds/         the game's sounds (Sounds.ts lists them) made from CC0 recordings by
                       blender-assets/sounds/build_sounds.py; their sources are in CREDITS.md there and here
docs/ships.md          ship lines (planned factions and tiers), where a ship's files live, how to add a ship
```

Frame flow (`GameClient`): `game.update(dt)` → the selection is let go of if its unit sank or went into the fog →
`view.update(dt)` (updates the wake and effects, reading the game's `state.events` of this update, then draws) →
`sounds.update(...)` (plays the same events) → `hud.update(...)`.
`dt` is in seconds, capped at 0.05.

Core rule: **`game/` knows nothing about the client; the client changes game state only through game methods.**

Where new code goes:

- Gameplay (anything the server must agree on: movement, combat, damage, loot) → a domain folder in `game/`
  (`game/ships/`, `game/world/`, a new one like `game/combat/`), stepped from `Game.update`. Export what the client needs from `game/index.ts`.
- How a game object looks → `client/scene/models/<thing>3d.ts`, called from `SceneView`.
  A new ship → follow [docs/ships.md](docs/ships.md): its model and atlases, not code, decide how it looks.
- Visual-only things with their own state (particles, decorations) → `client/scene/effects/`.
- Screen-space UI → `client/hud/`; new controls → `client/input/`.
- A text a player reads → English in the code, shown through `t()` (`client/i18n/`), with its Ukrainian and Russian in
  `uk.ts` and `ru.ts` (see "Texts and languages" in `.claude/rules/rendering-3d.md`).
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
  (`CLAUDE.md`, `.claude/rules/`, skills) — whatever language the request is in. Players may read the HUD in
  Ukrainian or Russian too: the translations live only in `client/i18n/uk.ts` and `ru.ts`.
- `AGENTS.md` is a copy of this file for other coding agents: change `CLAUDE.md`, then copy it over.
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
- Before writing a new helper, check `game/lib/` and the exports of `client/render/Painter3D.ts` (`shade`, `shadowPoint`, `footprint`).

## Pixi.js v8 — don't mix up with v7

The project uses **Pixi v8**. Do not use v7 API (`beginFill`, `drawCircle`, `lineStyle`, `new Application({...})`).

- `await app.init({...})`, then `app.canvas`
- `Graphics`: shape first, then style — `g.circle(x, y, r).fill({ color, alpha })`, `g.poly(points).stroke({ width, color })`
- `new Text({ text, style })`

## Detailed rules

Separate files in `.claude/rules/` are loaded when working on the matching part of the code:

- [.claude/rules/game-logic.md](.claude/rules/game-logic.md) — `src/game/**`: units, map determinism, ship physics,
  combat, bots, repairs
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
