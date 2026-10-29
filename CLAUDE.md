# Moonwreck

Frontend of a browser naval game in the style of _Pirate Storm: Death or Glory_.
Click on the sea and the ship sails there, steering around islands. Bots (ships and sea monsters, neutral or
aggressive) roam the sea; the player fights them with cannons and harpoons and repairs between fights (for gold).
Kills pay gold and experience (each ship's own level, up to ten a tier, 60 at tier 6, and talents: each ship its own tree,
longer and more tangled up a line, and a signature talent every five levels to 60, from 25 a second ability, a rocket or a powder keg, from 50 a third, a bombardment or a Royal standard) and leave chests and goods to haul aboard; the port in the middle of the map, a picture of the harbour
with its buildings to click, has a tavern (bounty quests), a market (the goods sold, and items bought for doubloons
only: scrolls, charms, flags, put on the skill bar's quick slots, what they do still to come: docs/items.md), a workshop
(the ship's outfit, repair), a shipyard and an arsenal (guns, ammo); a guild hall and an auction house wait for the
online part.
A boss, the Smuggler Baron, holds a corner of the sea. Past the starting waters lie fourteen more seas, one to three a
tier of ship (each its own map, bots and boss, reached through gates at its edges; a world chart shows them all), some
65 hours from the starter sloop to a tier 6 ship at level 60. A new player sees a prologue (the Moon fell into the sea:
docs/story.md), picks their captain's face and is led by the story through the starting waters (the sloop's guns in
the hold to fit first, the ship kept in port till they are and the loadout showing how), conversations and steps that
teach the game, where it sends them always in gold on the minimap and the sea chart, what they are to sink marked gold
and brought in near them, the bosun's tips the first few times something goes wrong, to a tier 1 ship of any line, the story's end
there; only the European line's, the Royal
Herald, is built yet. Then the Captain's path leads to the next of its line: the Salamander, tier 2, the Peregrine,
tier 3, the Crowned Lion, tier 4, the Black Eagle, tier 5, and the Sovereign of the Seas, tier 6 and last; the shipyard
shows every line's ships, the rest planned for later. The European line is the yardstick the others are balanced against:
each tier beats two ships of the tier below. Over all their ships, a captain grows their mastery: passives for every
ship they sail, in seven specializations, paid with points from every tenth level of every ship and from feats.
Camera: classic 2:1 isometric pseudo-3D (no perspective) — the target look of the game.
The site opens on a landing (the game's calling card for search engines, with an email and password sign-in that for
now lets anyone aboard); the game itself is at `/play/`.

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

- `npm run dev` — Vite dev server, opens the browser automatically on the landing; the game is at `/play/`
- `npm run format` — Prettier rewrites files in place
- `npm run check` — `tsc` + Oxlint + `prettier --check`. **After every code change run `npm run format`, then `npm run check`**
- `npx tsc` / `npm run lint` — type check / Oxlint only
- `npm run build` — `tsc && vite build` into `dist/`

There are no automated tests. Visual changes are checked by a human in the browser — say what to look at.

## Architecture

The code is split by where it runs, then by domain inside each part:

```
index.html             the landing, at the site's root (see "Landing" below); uk/index.html and ru/index.html: the same
                       in Ukrainian and Russian
play/index.html        the game's page (/play/), noindex
vite.config.ts         the pages as the build's inputs; robots.txt and sitemap.xml (the landing in its three languages)
                       written for the build
.env                   VITE_SITE_URL: the site's public address, which the landing's SEO tags and those files name
src/
  main.ts              entry point: asks what draws the game (in software: no smoothing, fewer pixels), creates the
                       Pixi Application and the Game, loads what the browser kept, starts GameClient
  landing/             the landing's style (landing.css, the game's night look) and its sign-in (landing.ts: checks the
                       fields, says what is wrong under each in the page's language, goes to the game in it:
                       play/?lang=uk); no game code, no Pixi
  game/                SHARED LOGIC — future package for the server: data, physics, math. No Pixi, DOM, Math.random
    index.ts           public API: everything outside game/ imports it only from here
    Game.ts            owns GameState, update(dt) advances the simulation in a fixed order
    GameState.ts       everything the client reads and draws
    save.ts            a player's progress as plain data (saveGame), and putting it back checked field by field
                       (loadGame): Game.save() / Game.load()
    story/story.ts     the story (docs/story.md): its speakers, the prologue's cards, the chapters and the steps (STORY),
                       each with its objectives, opening and closing lines, how it is turned in and its reward; a
                       player's progress along it (player.story); what is to be told now (storyTalk) and told
                       (tellStory, seePrologue: the player's actions); the objectives counted from the update's
                       events (stepStory); its places on the map (StoryMark: placed on open water like the gates, no
                       bot near them; the harbour while it asks the player home, or to sell its goods there); what
                       it asks them to sink (storyTargets) and the prey brought in for it (storyPrey); where it sends
                       them now, its mark
                       or the nearest of its prey (storyGoal); the guns it asks for that wait in the hold
                       (storyFitting), the ship kept in port till they are fitted (setSail: leaving port through the
                       story); the Baron watched through the fog
                       while the bosun tells of him, the ship left alone meanwhile (storyWatch: Ship.spotted, parley)
    world/zones.ts     the seas (ZONES): each one's tier, levels, islands' seed, boss's lair, description, its gates to
                       the sea before and after it, its place on the world chart; START_ZONE (the starting waters)
    world/gates.ts     the gates on a sea's map: placed on open water, sailed into to leave for the sea beyond
                       (stepGates, player.departure), closed to a ship of a lower tier (seaOpenTo) or in combat; where a ship coming
                       in arrives; no bot spawns or wanders near one
    world/World.ts     the world of a sea: the port's island and islands placed round it from the sea's seed, the painted ones
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
                       what a line's ship has by its tier (lineTier: its last level, its abilities); a ship bought at
                       the shipyard comes with no guns (UNARMED); the bots' hulls too; STARTER_SHIP (the starter sloop)
    ships/shipLines.ts the lines players sail (the starter, five of six tiers each, the Forbidden Fleets four ships a
                       tier, and the masterworks bought with doubloons) and their ships, built (a class) or planned (a
                       name, a role, provisional figures and how it is got: SHIP_SOURCES), for the shipyard: lineShip
    ships/damage.ts    hull health scale (0–100 %) and the damage stages derived from it
    ships/repair.ts    the repair skill: 2 % of the hull a second out of combat, paid in gold (1 for 10 hull)
    ships/outfit.ts    the ship's outfit: sails, hull planking or plating, a rudder, a lookout's gear, a piece to a
                       slot, in three tiers, each with sidegrades; what they add to the class's speed, turning, hull
                       and sight (grownStats)
    ships/talents.ts   the ship's level from its XP (kills, quests), the talents (its tree's ranked talents, a point a
                       level, the rules: talentBlock; a signature talent every fifth level to 60, every ship's), what
                       they do over time (stepTalents), the abilities' cooldowns and what any of them gives
                       (abilityUsed); the levels a ship's abilities open at (ABILITY_LEVELS)
    ships/abilities.ts the abilities used (useAbility: F the level 5 one, G the level 25 one, a rocket or a powder
                       keg, T the level 50 one, a bombardment or a Royal standard)
    ships/talentTrees.ts  every ship's own talent tree: one to four branches, longer and more tangled up a line (a
                       row opened by points in its branch, the last by the whole branch before it, one of two, a
                       talent needing one of another branch: from tier 4, one a tree); more
                       than a ship's points at its last level, so two ships at it differ (a tier 1 to 3
                       ship's three branches of all its points each, one of them taken to its end; from tier 4 four
                       of half its points each less one, two of them and the point the link needs; the starter
                       sloop's one branch is all of them)
    ships/bonus.ts     what the captain's mastery and a ship's talents give it, in the same effects (ShipBonus;
                       ship.bonus: both together, what combat, loot, repairs and the shop read)
    combat/            weapons.ts (cannons, harpoons: how shots fly, what each is made for), arsenal.ts (20 guns and
                       14 ammo from the balance table, each gun with its own reach and reload; the damage dice),
                       barrage.ts (a boss's mortar: marked spots on the water its shells land on; a
                       player's bombardment's land with them),
                       ordnance.ts (the level 25 and 50 abilities, as hard as a volley of every cannon fitted: a rocket
                       at the target, slowing it; a powder keg dropped astern, blowing up round the foe that comes
                       near; a bombardment's shells along the target's course),
                       units.ts (anything that can be fired at, by id: ships for now), combat.ts (fire locks,
                       volleys of the guns loaded and in reach, homing projectiles, monsters' bites, damage)
    bots/              botKinds.ts (kinds of bots: hull, neutral or aggressive, how many to a map square, respawn
                       time, loot; a boss with its lair and escort; the starting waters' own, and every other sea's
                       made from archetypes scaled to its tier and levels: hull, power (damage ×), XP, gold: zoneKinds; how many sail a sea: botsInSea), brain.ts (what a bot does: wander, attack, fight
                       back or run, give up, follow its boss; only bots near a player are awake), spawner.ts (the
                       first bots, and sunk ones replaced near where they sailed, where no player sees; a boss at its
                       lair with its escort; the story's prey, stepPrey: what the player's step asks them to sink,
                       brought in near them out of sight, weaker than its kind, a player's own)
    items/             items.ts (the market's items, for doubloons only: eighty of them in ten groups, each its name,
                       what it is to do in its text and figures and its price; none works yet: docs/items.md),
                       quickSlots.ts (the skill bar's ten quick slots, the player's: an item of the hold in each, one
                       slot an item, put there, swapped or emptied)
    economy/           player.ts (a player's gold, the guns, outfit and items in their hold, the quick slots, fitting
                       guns from the hold, their progress; a new player's guns in the hold, STARTING_HOLD), loot.ts (bounties for kills, chests and goods dropped and hauled aboard, a player's
                       cargo lost where their ship sank; the story's prey's shard of moon glass), cargo.ts (goods,
                       moon glass among them, the hold), quests.ts (the tavern's bounty
                       quests, each sea's own, kills counted in their sea; a quest the ship's that took it, its kills
                       alone counting, turned in by it alone), shop.ts (guns, ammo, outfit and repairs bought in port, the outfit fitted there, goods
                       sold at the market, items bought there for doubloons by any count (buyItem), guns and ammo sold back to the arsenal for a quarter, ammo dealt in by any
                       count, as many as the gold pays for; the prices),
                       shipyard.ts (the ships for sale and their terms, by tier, the same for every line (TIER_TERMS):
                       the goal (shipGoal: after the starter sloop a tier 1 ship of any line, LADDER_LINES, then the
                       next of the line sailed), the Captain's path (the story, a level, the price);
                       tierMastered, a masterwork's term), fleet.ts (a player's ships: buying the one picked of the
                       goal's, taking the helm of one laid up in port; neither of a ship below the sea's tier: fitsSea),
                       currencies.ts (gold, doubloons, spent on forgetting the mastery or a ship's talents, and the currencies to come
                       that the shipyard already prices ships in)
    navigation/        NavGrid.ts (open water as a grid with clearance from land; routes round islands, A*),
                       pilot.ts (steers each ship along its route, slows for turns, swerves round other ships)
    physics/           hull.ts (hulls as capsules, the Body interface), collisions.ts (ships pushed out of coasts
                       and each other, sliding instead of stopping)
    account/           mastery.ts (the captain's mastery: the account's own passives, for every ship the player sails,
                       seven specializations of a trunk, three twigs of five steps each ending in a special, and two
                       legendaries; their costs by tier; points from every tenth level of every ship and from feats;
                       what is taken, added up, is the ship's `captain` (a ShipBonus, ships/bonus.ts), read with
                       its talents'; forgotten in port for doubloons; the debug buttons' levels, giveLevels, here for they
                       take the passives again), feats.ts (the captain's feats: ladders of rungs counted
                       from the player's stats, each rung giving points), portrait.ts (the captain's portrait, picked
                       from PORTRAITS by number and kept with the progress: others will see it online)
    records/           stats.ts (what a player and each of their ships have done: kills by class, quests, gold
                       earned and spent, chests, the fight, the voyage; for the medals to come), tally.ts (stepStats:
                       counting them from the events)
    lib/               math.ts (clamp, normalizeAngle), geometry.ts (points, segments, polygons), random.ts (seeded createRandom)
  client/              BROWSER: Pixi, DOM, input. Reads GameState, never mutates it except through game methods
    GameClient.ts      wires Game + SceneView + Hud + Sounds + input, runs the frame loop, saves every few seconds;
                       takes the player to another sea (Game.travel: the save for it, then a reload in it)
    storage/           Store.ts: the browser's memory until there is a server (IndexedDB, else localStorage): the
                       progress, the view's settings, the HUD's items, the main screen's layout, the quest tracker's
                       folds, the tips given, the sound, the combat log, the language
    i18n/              i18n.ts: t(), the player's texts in the language picked in the settings (English, the
                       default, Ukrainian or Russian; a change reloads the page), or the landing's, read in it (the
                       game's address names it: play/?lang=uk); uk.ts, ru.ts: the dictionaries, keyed by the English
                       text
    audio/             Sounds.ts: the game's sounds (Web Audio): what the game's events sound like (shots, hits, bites,
                       wrecks, gold, levels), the HUD's (taps, purchases, refusals), the sea and gulls; volume, mute
    input/             pointerInput.ts: mouse/touch → ship.setTarget; a click picks a unit out (selection.ts,
                       client state), a double click attacks it; keyboardInput.ts (by key code, any layout): Space
                       attacks the unit picked out, Escape stops firing or lets go of it, Q and E pick the cannons
                       or the harpoons, Z and X load the first or the second ammo at hand, R repairs, F, G and T use the ship's abilities, L the loadout, K the talents, J the
                       combat log, M the sea chart, N the world chart, B the bestiary, I the statistics, H the hold, P the captain's mastery; a click on the port sails into it; cursor.ts (the game's own mouse pointers, painted, CSS cursors of 32
                       pixels at the screen's density: an arrow over the sea, a ship's wheel while steering, an anchor
                       over the port, a vortex over a gate (crossed out, shut to the ship's tier), a chest over loot, a
                       magnifier over a neutral unit, a sight or a harpoon (the weapon picked) over a hostile one,
                       crossed out with no gun of it; the HUD's elements pick theirs by name (CursorId, or the CSS
                       pointer, not-allowed, wait, help): a gold arrow over buttons); hover.ts (the unit
                       under the mouse: the cursor shows it, a click takes it)
    hud/               Hud.ts (screen-space overlay: the items picked in the settings, and these, each where
                       HudLayout.ts puts it: its default place, or where the player moved it in the layout editor
                       (LayoutEditor.ts, Edit in the settings: every part outlined and named, dragged, snapped to the
                       margins, the middle or its own place, a double click puts it back; Save, Default, Cancel),
                       kept in the browser by the edge of the screen it was put nearest, growing away from it (a chat
                       at the top unfolds down); a window leaves the skill bar clear wherever it is:)
                       UnitFrames.ts (two frames in the night look, alike, with no shadow: a picture in a gold ring over
                       the end of a plate, the level on a badge on the ring. The player's in the top left corner: the
                       captain's portrait (CaptainPortrait.ts: round on the face, or the whole bust; a click on it opens
                       PortraitPicker.ts, the ten to pick from), the badge gold while a talent waits, the ship's name,
                       the hold's icon (the minimap's button) and count at the top right, a click on which opens it,
                       the hull and experience, the purse, gold and doubloons (only the debug buttons give them yet),
                       and the status; a click on the rest the statistics. Beside it the unit
                       picked out, smaller: its hull's picture (the bestiary's HullPortrait), name, temper and tier,
                       hull, what hurts it and the Fire button; a click on a bot's opens the bestiary on its kind),
                       QuestTracker.ts (top right, a plate in the night look: the story, its chapter, step and objectives
                       not met yet (one just met lit a moment), or the word to come back to port; the quests the ship
                       sailed has taken, a line
                       and a thin meter each, ✕ gives one up once the player says yes, how many the other ships have, and the
                       Captain's path to the next ship, the steps still to do (one just done lit a moment, then gone); each part folds by its
                       header, the browser keeps the folds), Prologue.ts (a new player's first sight, over everything:
                       the night sky and four cards of what happened, a painted picture each,
                       Next, Skip; then the captain's faces to pick from), DialogueBox.ts (the story's conversations at
                       the bottom of the screen, over the sea or the harbour, the game going on under them: the
                       speaker's painted portrait in a gold ring (SPEAKER_ICONS; their initial till it loads), name
                       and role, each line written
                       out, Next (Enter) and Skip), Tips.ts (the bosun's tips in that box, when the story has nothing
                       to say: the first three times the player fires the wrong weapon at a target, has no guns or
                       ammo at hand, runs out of ammo or low, or fills the hold; each going by itself after a while),
                       storyCue.ts (what the story asks a new player to press now in the starting waters: the guns
                       fitted, Set sail, the market's Sell, a talent, a weapon, the repair, the new ship's Buy; none
                       while a conversation is told or there is nothing to press for it yet), StoryGuide.ts (the
                       story showing them: the game's gold pointer clicking that button, a light breathing round it
                       and rings of it going out at each click, a note over or under it; the first talent spotlit
                       in the tree, all else dimmed; Yes lit in the question it asks; and in the loadout, a gun
                       carried from the hold onto its slot), fullscreen.ts (the game on the whole screen and back),
                       SkillBar.ts (at the bottom, in a painted frame: ten quick slots, 1…0, the items put there from
                       the hold, each with its count: dragged from slot to slot they swap, and only dropped back into
                       the open hold does one leave the bar; a click or its key does nothing yet; the skills, painted: the repair and the three abilities (F, G, T), locked
                       till their talents are picked (a rocket or a bombardment dimmed while nothing it could aim at is
                       attacked or picked out; on a ship of a lower tier, the tier that brings them); each weapon
                       painted with its key, Q or E, its lit picture glowing over it while picked (faintly under the
                       pointer), its two ammo at hand under it, Z and X,
                       their counts in K and M, and under them its reload; ammo dragged out of the loadout drops on
                       them; a tooltip over a weapon, a skill or an ammo: all about it), Tooltip.ts (a small panel telling what is under the pointer), TalentPanel.ts (the ship's own talent
                       tree, K, in the night look, as wide as its boards (a narrow tree's made wider): the milestones to
                       pick and the points to spend counted apart beside Close; the signature talents (the Milestones
                       board) and its one to four
                       branches on boards of blue glass, each with its emblem (painted, every board's of every ship)
                       and its name, one size on
                       every board, on two lines where it needs; down each a mast its talents hang on as
                       medallions with their painted icons (their branch's sign till they load),
                       filling with the points spent in the branch (the
                       signatures' with the level), the rows' gates marks on it lit as they open; "or" between one of
                       two, a chain on one needing a talent of another branch and a rope to it under the pointer;
                       ranks on a chip, a glow on what can be taken now, a light in its branch's colour on what is
                       taken in full; a card beside the talent or gate under the pointer tells all about it; taller than
                       the screen, the boards scroll under the header (the wheel, a bar); a click
                       picks, forget them all in port for doubloons, each once the player says yes),
                       StatsPanel.ts (the statistics, I, in the night look like the hold: all the player's ships
                       together and each one, a tab each with its picture (a card lit while its page shows,
                       NIGHT_TAB), the sections on boards of blue glass under painted emblems),
                       HoldPanel.ts (the hold, H or a click on it, in the night look like the loadout, a tab each:
                       the cargo, on boards of blue glass how full it is and the goods aboard, thrown overboard to make
                       room; the items, a cell each with its count and its quick slot's key, dragged onto a quick slot
                       of the skill bar or clicked into the first empty one; the bar raised over it, so an item dragged
                       off the bar back into it leaves the bar), itemLook.ts (what the HUD shows of an item: its
                       grade's colour by its price, its text, its tooltip, the quick slots' keys),
                       goodIcons.ts (the goods' colours and pictures, drawn until they are painted, and a good's row
                       with its buttons: the hold's and the market's),
                       MasteryPanel.ts (the captain's mastery, P, in the night look: a tree growing up from the
                       captain on a compass rose, the moon and a constellation low in the sky behind it, its seven
                       specializations side by side in columns on boards of blue glass, each a trunk forking into twigs, the
                       legendaries at the top, joined by straight lines in moonlight, lit as they are taken; each
                       passive its painted icon in a frame of its tier, plainer to richer up a twig; a click
                       on what glows asks and takes it, dragged and brought nearer with the wheel, what a passive
                       gives under the pointer; forget all in port),
                       FeatsPanel.ts (the captain's feats, in the night look, from the cup on the minimap's frame:
                       a row a ladder, its next goal, a meter, its rungs and the points they gave, those points
                       together in the header),
                       LoadoutPanel.ts (the loadout window, L, in the night look and of one size: a tab a weapon,
                       and that weapon's boards: its gun slots (a picture each), its two ammo at hand and what waits
                       in the hold (a card each with its figures), each with a line of how; the slots and the hold
                       scroll on their own (ScrollPane.ts: a part of a window that scrolls, the wheel or a bar; its
                       ScrollBar is every scroll bar's, the talent tree's band and the port's lists too); a
                       click or a drag fits a gun or puts ammo at hand, here or on the skill bar, a gun fitted with a
                       click picking the next empty slot; while the story's guns wait in the hold, StoryGuide.ts
                       shows how: the game's gold pointer carrying a gun from the hold onto the empty slot lit for
                       it, again and again, a note over it, then the next weapon's tab lit),
                       PortScreen.ts (in port: the harbour's picture with a medallion per building, HarbourView.ts,
                       in a frame of the night look with the port's name on a plaque, and the window each opens, in
                       the night look like the hold, closed by its gold cross: the tavern's quests (a card each, a dial round how far it has
                       got, its reward with the bonuses in brackets, what adds to it under the pointer), the market
                       (Sell, laid out like the hold; Buy, the items, group by group, for doubloons, the purse in the
                       header in them), the workshop's outfit (a tab a
                       slot) and repairs, the shipyard (the player's ships, a tab a line: its ships, built or planned,
                       and Buy: the masterworks), the arsenal's guns and ammo (bought and sold back); the shop's items as cards with their
                       icons, scrolled when they don't fit; the guild hall and the auction house closed for now; the
                       player's ship over the sloop at the quay, a medallion opening the loadout (a "!" and a call
                       while the story's guns wait in the hold, Set sail dimmed under a note till they are fitted); Set
                       sail), itemFaces.ts (what a card and the info window say of a gun, an ammo, a piece of outfit,
                       a ship or an item of the market's, and what their button does),
                       ItemInfo.ts (an item up close, from its card's info button, in the night look: its picture,
                       every figure, its legend, Buy, Fit or Take the helm, Sell; for ammo, how many),
                       ConfirmDialog.ts (a question before what can't be undone: selling an item back, giving a quest
                       up, a passive of the mastery or a talent taken; as high as its text; one for the whole HUD, in
                       the night look, over every window), iconAtlas.ts (the guns', the ammo's, the outfit's, the
                       ships', the items', the mastery's passives' and the talents' icons, the minimap's buttons, the skill bar's skills, the gold coin, the doubloon and the XP star (ui.ts's goldCoin, doubloon, xpStar),
                       the captains' portraits, the maps' markers, the arrows, the painted mouse pointers as
                       pictures, each atlas loaded once; IconSprites: an atlas's icons as a pool of sprites laid out
                       every frame), arsenalLore.ts, outfitLore.ts and shipLore.ts (each one's legend; a
                       line's look),
                       ChatPanel.ts (the chat in the bottom left corner, a plate in the night look like the frames at
                       the top, its lines in a dark well (drawNightWell): a tab for the combat log,
                       combatLog.ts, every blow dealt and taken with all its dice, kills, repairs, J unfolds it;
                       and the chat's channels, general, zone, group, guild, private, empty till the online game),
                       Minimap.ts (bottom right, in a painted frame of wood and brass: the sea round the ship, turned
                       like the screen, islands drawn as on the sea chart, and the units in sight, each a painted
                       marker (the story's prey gold, a bounty's silver, a boss crowned, hostile red, the rest green,
                       the one fired at in a sight); the boss's lair, the harbour (its lighthouse silver while a
                       bounty waits there), and where the story sends the player in breathing gold, on the rim the way
                       to steer while it is far off; the ten slots round
                       the frame's top are buttons, left to right: the settings, the full screen, the feats, the hold,
                       the loadout, the talents, the captain's mastery (painted medallions, these four), the bestiary,
                       the world chart and logging out (back to the landing, the progress kept), lit while open; while a talent waits to be
                       picked, a breathing "!" on the talents' button, its hint telling the points and milestones, and
                       one on the captain's mastery's while a point waits to be spent, and on the loadout's while the
                       story's guns wait in the hold), SeaChart.ts (the whole world in 8 × 8 squares A1…H8 with the islands drawn as
                       in the game and the ship, in the diamond opening of a painted frame and nothing else; the boss's
                       lair under its crown (a medallion till the markers load), its name and the port's under the
                       pointer, the harbour's marker, where the story sends the player in breathing gold under a gold
                       arrow and every one of the prey it brought in, the square under it named; the
                       minimap or M opens it, the button in the frame's corner closes it; the sea's gates, a painted
                       vortex each (faint while shut to the ship's tier, as on the minimap), named under the pointer, and a
                       button to the world chart), WorldChart.ts (every sea, N or the Seas button: a column a tier,
                       the gates between them, the one picked's description, gates and bots; a gold arrow over the sea
                       the player is in, an ivory one over the next if their ship's tier opens it; for now a button jumps
                       there, for the developer), Bestiary.ts (every kind of bot of every sea, B, the Seas button or a
                       click on a bot's plate: the seas, a sea's bots with their portraits, and the one picked: its
                       legend (bestiaryLore.ts), hull, temper, spoils, its guns or jaws (how many, their dice, crits,
                       misses, reach, reload, the damage they do in its sea), a boss's mortar and escort), questText.ts (a quest's title and text with its target and sea
                       filled in), chart.ts (what the two maps share: projection, colors, the islands, the gates, the story's mark,
                       which painted marker a unit gets, the bob of a chart's arrow),
                       hudItems.ts (every metric and control the settings can show, grouped), SettingsPanel.ts (dev
                       settings: all controls, the layout editor's too, and checkboxes for what is also on the
                       screen), ui.ts (the HUD's
                       colors, clickable tiles and buttons, icons, HudWindow: a window over the game, in a look of
                       its choice), theme.ts (the windows' look: dark wood under a brass frame, gold serif titles,
                       rows on darker boards, brass tabs, icon slots, meters, the painted
                       gold cross every window closes with (crossButton: the HudWindows', the settings', the sea
                       chart's), THEMED_WINDOW: HudWindow's look in it; the bestiary and the world chart wear it),
                       nightTheme.ts
                       (the night look, the alternative for a window: deep blue and the night sky under the brass rim,
                       painted gold corner pieces and dividers, boards of blue glass, a window's header and a board's
                       emblem and heading (nightHeader, nightBoard), the two trees' colours and light (TREE_COLORS,
                       takenGlow); NIGHT_WINDOW; the captain's
                       mastery, the talent tree, the feats, the loadout, the hold, the statistics, the portraits, the
                       port's windows and the question before what can't be undone wear it, the harbour's frame too (nightPanel
                       drawn larger round the picture, the port's name on a nightPlaque); and the plates, the tracker
                       at the top and the chat, plainer: nightPlate, a fine gold edge, thin meters (drawNightMeter),
                       a well for lines of text (drawNightWell); and the buttons of every window, whatever its look,
                       and the harbour's Set sail, the tabs too: moonButton, blue glass with pointed ends under a gold
                       edge, a painted star on each point, a halo of moonlight under the pointer), ornaments.ts (its painted pieces by name, stars, moons, constellations,
                       corners, dividers, swatches, the windows' close cross, and the night sky to tile a panel with, loaded once, a sprite
                       dressed in its piece when it comes, scaled alike both ways),
                       FpsMeter.ts, ButtonRow.ts (a row of HUD buttons),
                       Checkbox.ts, DamagePanel.ts (debug buttons that set hull health)
    render/            3D engine with no game knowledge
      Camera3D.ts      parallel projection world → camera → screen and back (screenToGround)
      Painter3D.ts     3D primitives on top of Pixi Graphics: projection, lighting, shadows
      gpu.ts           what draws the game (probeGpu, before the Application): the graphics card, or the processor in
                       software
    scene/
      SceneView.ts     isometric scene: draw order, redraws every frame; sceneObjects.ts (what it sorts by depth)
      cameraControl.ts how the camera keeps up with the ship: it glides after it, the ship in the middle of the
                       screen; turned to what the story shows (the Baron scouted), then back
      models/          island3d.ts (low-poly islands, until their paintings load), port3d.ts
                       (the port's walls, quay, houses, lighthouse and flag, until
                       its pictures load; then its lamp and flags over them), botShip3d.ts
                       (the bots' ships as vector models, until their atlases load; the seas' pirate brig, warship
                       and flagship only so, for now), monster3d.ts (the seas' crab, shark and kraken, vector-drawn,
                       until they are modelled), gate3d.ts (a gate to another sea on the water, till the sea's
                       maps load: then it is the sea's whirlpool), storyMark3d.ts (where the story sends the player: a
                       buoy with its lamp, its light Beacon.ts's; what it asks them to sink, a gold ring and a painted gold arrow over it; a painted
                       gold arrow round the ship, turned towards the one off the screen, or the prey hidden in the fog;
                       drawn till the arrows load), serpent3d.ts and turtle3d.ts (sea monsters:
                       their water, the serpent's body bending as it swims, and their bodies until their atlases load),
                       projectile3d.ts (cannonball, harpoon, rocket), keg3d.ts (a powder keg afloat, the ring a foe
                       sets it off within), standard3d.ts (a Royal standard's light round the ship), chest3d.ts (floating loot: a chest, crates of goods, lost
                       cargo) — 3D models; ShipSprite.ts — a ship from its Blender atlases, animated ones too (the player's,
                       and the bots' and the turtle's through BotSprites.ts: a sprite and its fire per bot in sight,
                       the turtle swimming and biting); SerpentSprite.ts — a sea serpent from its atlases: pieces laid
                       along its body, the head swimming and biting; ChestSprites.ts — the floating loot from its
                       atlases (dropped, bobbing, blinking before it sinks); PortSprites.ts — the port from its
                       pictures: the ground under the ships, the rest in slices sorted with them; IslandSprites.ts —
                       the islands from their paintings, each in slices sorted with the ships, its shallows under them;
                       portrait.ts — a bot's hull as a picture for the HUD (the bestiary): from its atlases, or its
                       vector model
      effects/         client-only decorations with their own state: Wake.ts (wakes of everything that sails, one
                       shader), foam.ts (what the wakes, the wreck's water and the sea's whitecaps share),
                       targetMarker.ts (where the ship is heading, once the mouse lets go: a green light coming
                       up out of the water with a splash, then hanging there with ripples and sparks round it),
                       ShipFire.ts (fire and smoke of a damaged ship), Sinking.ts
                       (the sinking animation, and the water round the wreck: churn, ring waves, bubbles),
                       ShotEffects.ts (muzzle flashes, smoke, splashes, splinters, bites, a rocket's fire, a powder keg blowing up), DamageNumbers.ts (damage
                       and repairs floating up), Wrecks.ts (sunk bots going down), RepairEffect.ts (a ship under
                       repair), LevelUpEffect.ts (a level reached), BarrageMarks.ts (a boss's shells coming down, red;
                       a player's bombardment's, gold),
                       Trails.ts (where each serpent swam, for its body), targetLock.ts (the rings round the target
                       fired at and the unit picked out), rangeRings.ts (how far the weapon picked reaches: its guns'
                       longest and shortest reach, dashed rings running round in its colour), wind.ts,
                       navDebug.ts (the navigation's debug views, switched in the settings: the route, the hulls),
                       fogOfWar.ts (haze and mist beyond the ship's view range and the spot it watches, one shader),
                       FogClouds.ts (its puffs),
                       SkyClouds.ts (now and then a light cloud drifting over everything, and its shadow),
                       seaSurface.ts (the sea's surface, one shader: the waves, light in the water and on the floor
                       of the shallows, the sky, glitter, whitecaps, and the Moon's light from below, its glass
                       glowing up from the seabed here and there; where the story sends the player, a pool of gold
                       light in the water, rings of it spreading, bent by the waves, and a red one round a boss that
                       fights them and on every spot its shells are to land on; towards the map's edges the
                       Seam's storm, rougher and darker, whitewater at its wall's foot; at a gate to another sea a
                       whirlpool, arms of foam winding in to a dark funnel, its eye violet, red while shut to the
                       ship's tier), seaLook.ts (how it looks: one set of numbers), Beacon.ts (over that pool, a
                       pillar of soft gold light, gold motes rising in it, coming in and going softly; the same in red
                       round a boss while it fights the player, following it, under the ships, its pillar rising
                       behind the masts, and over every spot its shells are to land on, ShellBeacons; its textures
                       made in a canvas), SeamWalls.ts (the Seams, docs/story.md's walls of storm, at the map's edges:
                       a wall of water along each, the sea's ripples running up its face, streams of foam, a white
                       crest blowing off into spray; those the camera looks towards under everything on the water,
                       those in front of it over it, a curtain seen through, clearer round the ship)
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
                       build_ship_icons.py; the items' (items.webp/json, by item id), cut out of eight painted sheets,
                       two pictures an item (the left used, unless the script's SECOND says the right), by
                       build_item_icons.py; the mastery's passives' (mastery.webp/json, by passive id), cut round
                       out of one painted sheet by build_mastery_icons.py; the ships' talents' (talents.webp/json, by
                       talent id, and the talent tree's boards' emblems, by "signatures" or "<ship>/<branch key>"),
                       cut round out of two painted sheets by build_talent_icons.py — don't edit by hand
public/sprites/hud/    the minimap's frame (minimap_frame.webp), made from a painted picture by
                       blender-assets/hud/build_minimap_frame.py, which prints its opening and slots for Minimap.ts's
                       FRAME; the buttons in the slots (minimap_buttons.webp/json), four cut out of painted medallions
                       and six out of a sheet of painted icons by build_minimap_buttons.py; the skill bar's frame (skill_bar.webp), made from a painted picture
                       by build_skill_bar.py, with its weapons lit (skill_bar_cannon.webp, skill_bar_harpoon.webp:
                       painted pictures of them glowing, fitted over the painted ones by scale and move), which prints
                       its wells and the weapons' places for SkillBar.ts's FRAME, and its skills
                       (skill_icons.webp/json), the inside of painted buttons and the abilities' talents' icons cut by
                       build_skill_icons.py; the sea
                       chart's frame (chart_frame.webp), from a painted picture by build_chart_frame.py, which prints
                       its diamond opening and close button's slot for SeaChart.ts's FRAME; the night look's
                       ornaments (ornaments.webp/json, a Pixi spritesheet of pieces by name) cut out of a painted
                       sheet, with the windows' close button (a gold cross, painted on its own), and its night sky (night_sky.webp, a seamless tile of stars and nebulae, made there,
                       seeded), by build_ornaments.py; the HUD's small signs
                       (symbols.webp/json: the gold coin, the doubloon and the experience star, wherever the HUD shows gold,
                       doubloons or XP, in place of the word), shrunk from
                       painted ones by build_symbol_icons.py; the captains' portraits (portraits.webp/json, by number),
                       cut out of one painted sheet's grid by build_portraits.py; the mouse pointers (cursors.webp/json:
                       each one's tile and hot spot), cut out of a painted sheet by build_cursors.py; the maps' markers
                       (map_markers.webp/json, by marker id: the story's gold, the tavern's silver, hostile red, neutral
                       and friendly green, the guild's and the group's blue, the bosses' crowned; and a gate's vortex,
                       the pointer's over one, taken from the pointers' sheet) and the arrows
                       (arrows.webp/json, by colour and make, ten pointing down and ten up), each cut out of a painted
                       grid by build_map_markers.py — don't edit by hand
public/sprites/sea/    sea wave maps (swell, ripples, chop), the caustics and its broad patches (depth, clouds,
                       gusts), made by blender-assets/effects/sea/build_sea.py (its wind map the game leaves out)
public/sprites/sky/    the sky's clouds (clouds.webp/json), made by blender-assets/effects/sky/build_clouds.py
public/sprites/story/  the story's pictures: the prologue's (prologue_1.webp … prologue_4.webp, a card each, 16:9) and
                       the speakers' portraits (speakers.webp/json, by speaker id, each cut square round the face),
                       made from painted art by blender-assets/story/build_story_art.py — don't edit by hand
public/sprites/foam/   foam for the wakes and the water round a wreck, made by blender-assets/effects/foam/build_foam.py
public/sounds/         the game's sounds (Sounds.ts lists them) made from CC0 recordings by
                       blender-assets/sounds/build_sounds.py; their sources are in CREDITS.md there and here
public/landing/        the landing's pictures: og-image.jpg (sprites/port/harbour.webp cut to 1200 × 630, for link
                       previews), harbour-800.webp (the harbour for phones), emblem.webp (the guild's crest, medallion 0
                       of sprites/port/medallions.webp, 96 pixels); with public/favicon.ico (the crest, 48) and
                       apple-touch-icon.png (on the night's blue, 180), cut with ffmpeg
docs/ships.md          ship lines (planned factions and tiers), where a ship's files live, how to add a ship
docs/items.md          the market's items: what works now, what using them needs, and each item's plan
docs/story.md          the story: the world, its people, the starting waters' steps, how the code tells it,
                       its pictures (painted and still to paint)
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

## Landing

`index.html` (and its Ukrainian and Russian, `uk/index.html`, `ru/index.html`) is the page search engines find, so its
text is in the HTML itself, never made by a script; the script only checks the form. Its SEO: the title and description, canonical, Open Graph and Twitter tags, and the structured
data (JSON-LD: WebSite and VideoGame), all naming `%VITE_SITE_URL%` (Vite fills it in from `.env`), with robots.txt and
sitemap.xml from `vite.config.ts`; a change to the game's name or pitch goes to all of them. The game's page stays
`noindex` and out of the sitemap.

It keeps to WCAG 2.2 AA: one h1 and headings in order, landmarks and a skip link, every field with a label and its
`autocomplete`, errors in words under the field (`aria-invalid`, `aria-describedby`) with the focus on the first wrong
one, paste and password managers never blocked, text at 4.5:1 and edges and focus rings at 3:1 (the panels over the
painting are near-opaque for it), nothing wider than the screen at 320 pixels, controls 24 pixels or more, motion only
under `prefers-reduced-motion: no-preference`. Pictures that only decorate have `alt=""`.

It is in English, Ukrainian and Russian, a page each (`/`, `/uk/`, `/ru/`), not `t()`: a crawler reads no script.
Each names the others with `hreflang` (and the sitemap does), and has the language picker in its header; a change to
the landing's text goes to all three. Its form takes the player to the game in the page's language (`play/?lang=uk`:
`GameClient` keeps it as picked), and what its script says is in it too (`landing.ts`).

Camera settings are the `CAMERA` constant in [src/client/scene/SceneView.ts](src/client/scene/SceneView.ts)
(pitch 30°, yaw 45°, zoom 1.4); the HUD's zoom buttons scale the zoom ×1–×3 at runtime (`SceneView.setZoom`). Don't add perspective, sky or other projections unless asked —
they were tried and removed (commit `2c8125f` still has them). How the camera follows the ship is
`scene/cameraControl.ts`: one way only, gliding after it (a dead zone and a recentering camera were tried and
removed). The ship atlases are rendered for this pitch and yaw:
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
