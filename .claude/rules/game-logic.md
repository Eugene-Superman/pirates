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
  The order: clear the events the client has read → what talents do over time (`stepTalents`: every ship's top speed
  for this update, Second wind, Damage control) → bots farther than `WAKE_RANGE` from every player are stopped, the
  awake ones think (`thinkBots`: pick a foe, a course, an attack, follow their boss) → for each awake ship, the pilot
  picks a helm (a sinking ship gets none and coasts), then the ship steers and collides in sub-steps of at most
  `MAX_STEP` world units (only islands and ships within `WAKE_RANGE + MEET_RANGE` of a player are looked at) → the
  level 25 abilities (`stepOrdnance`: rockets asked for fired, powder kegs a foe came near blown up) → combat
  (reloads, volleys and bites at attack targets, projectiles landing) → a boss's barrages fired and shells landing
  (`stepBarrages`, a player's bombardment's too) → a monster's own ways of fighting (`stepMonsterSkills`: its ink
  spreading, its dive, its brood) → loot (`stepLoot`: bounties, XP, quest kills, chests and goods dropped, a player's cargo lost) →
  repairs → chests sunk or hauled aboard (`stepChests`) → bots sunk this update taken out, due ones spawned
  (`stepSpawns`) → players' ships in the harbour's basin docked (`stepDocking`) → a player's ship sailing into a gate leaves for the sea beyond (`stepGates`) → a player's wreck brought back once
  `WRECK_TIME` is up → the story's objectives counted from the update's events (`stepStory`) → the story's prey
  brought in or taken away (`stepPrey`, after the story has counted the update's kills) → the stats counted from the
  update's events (`stepStats`) → the feats' rungs the stats have reached (`stepFeats`, last: a `feat` event each).
- `state.events` (shots, impacts, bites, damage, destroyed units, repair steps, gold paid, XP, levels, talents, cargo…)
  are made by an update and read by the client in `view.update` right after it; the next update clears them. Events
  made by a player's action between two updates (an ability used, a quest turned in) live through the next update
  too (`Game.eventsRead`), so the client and `stepStats` read them as well.
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
- A painted island (one the client draws from a painting) then takes the painting's beach as its shape
  (`withPaintedCoast`: `world/paintedCoasts.json`, matched by the island's centre, written with the paintings by
  `blender-assets/islands/build_island_art.py`): a painting is never stretched, so the island fits it. After the map's
  generator has drawn every number, so the map's other islands, places and heights stay the same.
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
  across lines; how to add a class (and a bot's hull) is in `docs/ships.md`. `ships/shipLines.ts` lists the lines
  players sail and every ship in them (`SHIP_LINES`, `lineShip`): a built one is a class, a planned one only a name,
  a role, provisional figures and how it will be got (`SHIP_SOURCES`, priced in `economy/currencies.ts`), for the
  shipyard to show.
  The figures (`maxSpeed`, `minSpeed`, `acceleration`, `turnSpeed`, `viewRange`, `maxHp`) are getters: the
  class's, grown by the outfit fitted and the talents taken (`grownStats`, worked out again by `refit` when one of
  them changes, the hull keeping its share of hit points; `figuresWith` works them out with another piece in a slot,
  for the shop). `tuneSpeeds` / `tuneViewRange` change the class's base for the HUD's debug buttons. Damage lowers the
  top speed from `maxSpeed` towards `minSpeed` (`topSpeed`).
- `setTarget` clamps the target to world bounds; `ship.steer(dt, helm)` turns no faster than `turnSpeed` and speeds up
  or slows down towards the helm's speed. The helm comes from the pilot.
- `ship.bot` is the bot's mind (`bots/brain.ts`), `null` for a player's ship. A bot's ammo never runs out (`infiniteAmmo`).

## Seas (`world/zones.ts`, `world/gates.ts`)

- The game is in one sea at a time (`ZONES`, `state.world.zone`): `new Game(seed, zone)` builds its world from the
  sea's seed (`createWorld(zone)`: the starting waters' is seed 42, its islands painted; the others' are vector-drawn)
  and puts in the sea's bots (`zoneKinds`). A sea is for a tier of ship and some of its levels (`tier`, `levels`);
  its `gates` (west to the sea before it, east to the next) are moved to open water once the routes are known
  (`placeGates`). A player's ship in one leaves (`stepGates` sets `player.departure`, a player's own: online, each
  goes their way), unless the sea's tier is above its ship's (`seaOpenTo`, which the client's charts read too) or it is in combat (a `gateClosed` event as it sails in;
  one that waits in the gate goes once its fight is over). Nor does a ship of a lower tier than the sea's take to it
  from its port (`fitsSea`: `takeHelm`, `buyShip`), or a weak ship laid up there would earn a strong sea's XP. `Game.travel(to)` makes the save for the other sea
  (`zone`, and `arrival`: the sea it came from, so it comes in off the gate back to it, `arrivalPoint`); the client
  keeps it and makes the new sea's game from it (`savedZone`). No bot spawns or wanders near a gate (`nearGate`).
- The starting waters keep their own bots, as balanced; every other sea's are made from `ARCHETYPES` (a trader, a
  raider, a grazer, a pirate, a hunter, a pack, an elite, a boss with its escort) at the sea's tier and levels (`TIER_BOTS`):
  a kind's `hp` (`ship.setHull`) and `power` (`ship.power`: every volley, bite and shell it does is multiplied by
  it, as a talent's boost) make its hull do as the sea asks. Its `tier` weighs its XP: `xpForKill` pays a ship a
  quarter for a bot a tier below it, a point for one further down, all of it for one above; within the tier, by levels
  (`XP_BY_LEVELS`), but the starter sloop (tier 0) is paid in full for every bot, so a new player levels fast.
  `killXpShare` says which of these holds and the shares it leaves, for the bestiary to tell.
- Each sea's tavern offers its own quests (`zoneQuests`: the starting waters' eight, the others' made from their bots),
  counted only for kills in their sea and turned in only at its tavern.

## Levels, talents and outfit (`ships/talents.ts`, `ships/talentTrees.ts`, `ships/outfit.ts`)

- What a ship of a line players sail has by its tier, whatever the line, is `lineTier` (`ships/shipClasses.ts`): its
  `maxLevel`, ten a tier (the starter sloop's 10, as tier 1's; 60 at tier 6, `MAX_LEVEL`), its `abilities` (one up to
  tier 2, two at tiers 3 and 4, three from tier 5). The European line is the yardstick the others are balanced against:
  its hull is set for a fight of 20–30 s between two ships of a tier with their tier's guns in every cannon slot, and a
  ship is meant to beat two of the tier below (the arsenal is still to be balanced for both). A player's ship comes
  with no guns (`UNARMED`): only the bots' hulls have `startingGuns`. A new player's sloop has its four cannons and four
  harpoon guns in the hold (`STARTING_HOLD`, economy/player.ts, given in `Game.load`), the story's first step to fit
  them; every new ship carries `STARTING_AMMO`, a few hundred of the first cannonball and harpoon and nothing else,
  added to the player's ammo as they take its helm (see Economy: the ammo goes with the ship sailed).
- Every ship levels on its own, from 1 to its class's `maxLevel`: `xp` from kills (`xpForKill`: less for a bot far below the ship, never for the starter sloop) and quests (`gainXp`, `xp` and
  `level` events). XP beyond the class's last level is lost: the `xp` event carries only what the ship took, and
  there is none at its last level. `giveLevels` (`account/mastery.ts`) is the HUD's debug buttons: a level up or
  down, within the class's; a level lost takes the talents again through `learnTalents`, as a save does, and the
  captain's passives through `retakeMastery`.
- Talents: a point at every level from 2 that isn't a milestone, spent a rank at a time in the branches of the ship's
  own tree (`TALENT_TREES` by class, `talentTree`, `ship.tree`), a branch's next row opening with the tree's
  `rowPoints` more spent in it, its last once every row before it is taken in full (a talent's `opens`: of one of two,
  the smaller); the milestone levels (`MILESTONES`: every fifth, 5 to 60) offer one of two signature talents
  instead (`SIGNATURES`, every ship's; a passive one may give effects, as a branch talent's rank does), the level 5 one
  an ability (`useAbility`, `ships/abilities.ts`, slot 0, F: Full sail cools down from the press, Broadside from
  the volley it fires, its `talent` event with it, so arming it again and again counts for nothing), the
  level 25 one a second (slot 1, G, tier 3 ships and up: a rocket or a powder keg, combat/ordnance.ts), each with
  its own cooldown (`abilityReadyAt`, `abilityCooldown`), and the level 50 one a third (slot 2, T, tier 5 ships and
  up: a bombardment, combat/ordnance.ts, or a Royal standard: more damage done and less taken for a while,
  `ship.standardUntil`); the passive ones from 35 strong, one of each two a quicker kill and the other a longer fight. `talentBlock` says why one
  can't be taken; `ship.learnTalent` keeps to the rules, `forgetTalents` is the shipwright's (`resetTalents`: all at once, in port, for
  doubloons, `RESPEC_PRICE` a level of the ship). The
  signatures' numbers are `PERKS`; `stepTalents` does what talents do over time.
- A tree (`ships/talentTrees.ts`) grows with the tier: the starter sloop's one short branch, a tier 1 ship's three,
  then deeper rows and ranks, four branches from tier 4. A branch talent is `<class>.<key>` and gives effects a rank
  (`effects`, the same as the mastery's: `ships/bonus.ts`); it may be one of two with a `rival` of its row (either
  taken shuts the other) or `needs` ranks of a talent of an earlier row, of any branch (so taking them again row by row
  always finds it). Every row must be reachable with the smaller of each pair before it, and a tree holds more than its
  ship's points at its last level: two ships at their last level differ. A tier 1 to tier 3 ship's three branches are
  all its points each (7 at level 10, 15 at level 20, 23 at level 30), with no talent needing one of another branch,
  one of two at a branch's end (and from tier 3 in its middle, the two alike in points), and about as strong in a
  fight (each tree's comment weighs them): one taken to its end, or some of each. From tier 4 a ship's four branches are
  half its points each, less one (15, 19 and 23 at levels 40, 50 and 60), so any two of them are taken to their ends
  with one to spare: one talent of the tree `needs` a rank of a first-row talent of another branch (`needs` in
  talentTrees.ts, never of one of two), the spare point when that branch isn't one of the two; alike in their rows and choices, the fourth a little less in a fight, the rest in gold (the
  galleon's treasure) or its abilities sooner and a Battle cry with each (the command, the quarterdeck). The starter sloop's 7 ranks are its 7
  points at level 10: it takes all of them. A ship class players
  sail needs its tree; a save's talents of another tree, or an older one's, are left out and their points come back.
- Outfit: one piece to a slot (`OUTFIT_SLOTS`: sails, hull, rudder, lookout), in tiers; each adds shares of the class's
  figures (`OutfitBonus`), as talents do. Bought into the player's hold and fitted only in port (`shop.ts`).

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
  update: no guns of the weapon fitted, out of the loaded ammo, the loaded ammo not at hand, the target hidden in the
  fog of war (`ship.canSee`), the crew blinded by ink (`'ink'`), the target gone under (`'deep'`), or beyond every
  fitted gun's reach. The HUD tells the player.
- A player's ship fires only the ammo at hand: its two places a weapon on the skill bar (`ammoBar`), put there from
  the hold (`setAmmoSlot`, only ammo aboard). Ammo that runs out (`addAmmo`, fired or sold) leaves its place; loaded,
  it stays loaded, and the ship holds fire till the player loads another — never one picked for them, it might be dear
  — or puts some at hand again: more of it bought (or given) stays in the hold, never put at hand for them either.
  A save puts the bar back as it was, not through
  `setAmmoSlot`, so a ship holding fire comes back holding fire.
- A ship class has gun `slots` per weapon; `ship.guns` holds the gun fitted in each (`fitGun`; `swapGuns` moves one
  into another slot of its weapon, the two swapping with their reloads), one of `GUNS` in `arsenal.ts`; any ship fits any gun and fires any ammo, whatever its tier. Every gun has its own `range` and `reload` (`ship.reloads[weapon][slot]`). A volley fires every fitted
  gun of the selected weapon that is loaded, within reach of the target and has a shot of the loaded ammo (`loadAmmo`,
  `ship.ammo`), as one projectile from the middle of them; the `shot` event lists every muzzle. Cannons fire from the
  side facing the target. Guns of different reloads drift apart, so with a Broadside loaded (`broadsideArmed`) the
  loaded guns hold fire till every one in reach is loaded: its ×2 is every gun's volley at once, never a quick gun's
  alone, and it is spent with that one volley. For the same reason Relentless and a Rolling thunder count rounds, not
  volleys (`ship.fireRun`): a round is over once every gun of the weapon in reach has fired in it, so a quick gun among
  slow ones never runs them up faster than the slow ones alone; the run is over at another target or
  `PERKS.relentless.lapse` seconds without a volley at it (its own time, not `inCombat`: Bilge pumps shorten that).
- Damage is rolled when a volley is fired (`rollVolley`), with the game's own seeded generator (the dice): each
  gun rolls 1…its `die`; `missOn` or lower misses, `critFrom` or higher is a critical hit (`critMultiplier` × the die
  plus the ammo's bonus), anything else is the roll plus the bonus. A broadside nearly always has a crit among its
  dice, so the volley as a whole is `critical` (what the combat log marks) only with a crit and its sum `CRITICAL_SPREADS`
  standard deviations over its average (a lone die: its crit): about one volley in ten, whatever the guns. A weapon does full damage to what it is made for
  (`against`: cannons objects, harpoons creatures) and `OFF_TARGET_SHARE` to the rest. Every die rolled travels with
  the volley as its `Strike` (attacker, ammo, bonus, share, each die) into the `damage` event, for the combat log.
- Projectiles always hit: a volley homes in on the target and lands after `distance / weapon.speed`, doing its damage
  (a `damage` event). A sea monster has jaws (`shipClass.bite`) instead of gun slots: once they are ready and its head
  (the hull's bow) is within `reach` of the victim's hull, it bites — a `bite` event, full damage at once, no projectile.
- Firing, or being fired at or bitten, puts a ship in combat for `COMBAT_TIME` (`enterCombat`): no repairs till then.
  Whatever does damage (`hurt`) puts its owner in combat too: a powder keg's blast, a bombardment's shell.
  A ship that is hit remembers who hit it (`lastHitBy`), so a bot fights back.
- A ship's talents and its captain's mastery give it the same effects (`ships/bonus.ts`: a `ShipBonus` each,
  `ship.talentBonus` and `ship.captain`; `ship.bonus` both together, what the game reads). In a strike: more on every
  die (in its `bonus`) and crits sooner, the talents that did the `Strike`'s `diceTalents`; Broadside, Ambush,
  Relentless, Last stand and a Royal standard multiply it, and `bonusBoost` does, once for the talents and once for the mastery (its part
  the `Strike`'s `captain`); the talents that did are its `talents`. `bonusGuard` takes damage off the same way (the
  `damage` event's `guard` and `guardedBy` for the talents, `captainGuard`). Unsinkable keeps a ship afloat once, Iron
  keel once a fight, Second wind mends it at once in a fight, Spoils of battle mends a share of the damage the ship
  does, a chain shot or a barbed harpoon slows the target, and `spoils` rewards a kill (cannons or harpoon guns
  reloaded, the hull mended: Prize crew, Apex predator); `mend` tells the client of a talent's hull mended. All in `hurt`, where every strike's
  damage is done. A bot's ship has `NO_BONUS`: every share 0, so nothing changes.
- A boss's mortar (`barrage.ts`, `shipClass.barrage`): at a foe it attacks and sees, it marks `shells` spots on the
  water (`state.shells`), one where the foe is and one where it will be; each lands `delay` later and strikes every
  player's ship under it with one die (`strikeOnce`, as a bite does). Seen coming, it is dodged.
- A monster's own ways of fighting (`monsterSkills.ts`, `shipClass.skills`: the Inkmother's), in two phases (below
  its `phase` of the hull it fights harder). Its `dive`: every `cooldown` seconds (one a phase), at a foe it attacks
  out of its arms' reach (`from`…`range`, beyond its view range: it knows where the foe it chases is), it goes under (`ship.diving`, `ship.submerged`): out of every
  shot's and hull's way (no volley, rocket, keg or shell takes it, shots in flight fall into the sea, the player holds
  fire, `'deep'`; it is no obstacle and doesn't steer), `warn` seconds before it comes up the spot is marked where
  its foe will be (`diving.spot`), and it comes up there beside the hull in the way, its arms striking every player's
  ship within `radius` (`strikeOnce`, source `'arms'`, guarded as a bite). Its `ink`: as its hull falls past each of
  `at`, a cloud round it (`state.inks`, spreading, gone after `lasts`); every ship's `veils` are the clouds, and a
  player's crew in one sees only its `sight` round the ship, nor sees into one from farther (`Ship.canSee`,
  `inkSight`; the player holds fire, `'ink'`); bots see through it. Its `brood`: as its hull falls past `at`, once a
  life (`BotMind.broodLoosed`), `count` young of the sea's kind that sails its `hull` come up round it
  (`spawnBrood`), its escort (`BotMind.young`): they never come back on their own, and go back to the deep (taken out
  with a `dive` event) once it is gone or calm with them.
- The level 25 abilities (`ordnance.ts`, `PERKS.rocket` and `powderKeg`), as hard as a volley of every cannon the ship
  has fitted (its loaded ammo's bonus on each die), so they grow with its guns. A rocket is asked for at the unit the
  player attacks or picked out, in range and sight (`abilityTarget`), and fired at the next update with the game's dice
  (`ship.rocketAt`): a projectile that always lands, full damage whatever the target, slowing it. A powder keg is
  dropped astern (`state.kegs`), live at once, and blows up when a bot hostile to its owner is within its blast (one
  there already as it falls sets it off at the next update): every bot within its blast takes its charge, rolled for each; a player's ships are spared; unexploded, it
  sinks. The rocket is the sure blow, the keg two and a half times it but only when a foe comes to it (a monster, a
  ship giving chase, an escort). The level 50 bombardment (`bombard`) marks its shells along the course of the
  target in range and sight (`abilityTarget`), each where the target will be as it lands, in `state.shells` with
  their `ordnance` (its charge); they land with a boss's, and every bot under one takes its charge. A Royal standard
  flying multiplies every volley and takes a share off every blow taken (`hurt`).
- A unit at 0 hit points is destroyed (a `destroyed` event with its kind, heading and who struck, for the client's
  wreck and for the loot): it can't be seen, shot at or bumped into, and shots still flying at it fall into the sea.
  Ships go down (see Hull health).
- A ship in port (`docked`) is out of the fight: nobody fires at it, and shots still flying at it fall into the sea.

## Bots (`bots/`)

- `botKinds.ts`: each kind of bot sails a class of the `bots` or `monsters` line, is `neutral` or `aggressive`, has
  the ammo its guns fire, an `aggroRange`, a `cruise` throttle, how many sail each map square on average
  (`perSquare`), its `respawnTime`, the `bounty` its killer is paid, its `level` and the `xp` it is worth, the
  `chest` it may leave and the goods (`cargo`) its wreck may drop. A `boss` (the Smuggler Baron) is one of its kind,
  at its `lair`, with `escorts` of another kind; a mini-boss (`boss.mini`: the starting waters' Inkmother) is one
  too, alone at a lair of its own (`escorts` null), its brood (`inkling`, `perSquare` 0) let loose in its fight. A
  sea's are `zoneBosses`, the boss first. No other bot comes into
  the game or wanders within `LAIR_CLEAR` of a lair (`nearLair`), so a captain meets a boss and its escort alone.
  A kind's `pack` is how many of it sail together (1 for one alone): the starting waters' jackals and every other
  sea's `pack` archetype, four cutters (`jackalCutter`), each sunk in a few volleys but hard all together; `botsInSea`
  counts whole packs.
- `brain.ts` (`thinkBots`, before the ships steer): a bot picks a foe — the player who hit it, or for an aggressive
  one the nearest player within its aggro range — and fights it: a monster goes for the hull, a gunship closes to
  `FIGHT_SHARE` of its guns' reach and circles there, a bot with no weapon runs. It gives the foe up after `LOSE_TIME`
  beyond `LEASH`, then wanders round its home at its cruise throttle. Bots never fight bots, and leave a player in port
  be. An escort follows its boss (`follow`: off its beam, a little faster than it cruises) and joins its fights; once
  the boss is gone it wanders round the lair. A pack (`BotMind.pack`, an id of the game's that no ship takes) follows
  the first of it afloat (`packsAfloat`, in the order they came in), the rest in `PACK_FORMATION` behind it, and
  fights as one: a calm member takes on the foe a mate fights, if that foe is within `LEASH` of it (`joinPack`; never
  farther, or the pack would take a fight up again for each other and never give it up). `isHostile` tells the client whether a bot threatens a player;
  `noticeRange` how near an aggressive one notices a player's ship (its aggro range, nearer with the ship's stealth).
- Only bots within `WAKE_RANGE` of a player's ship are awake (`isAwake`): the rest wait where they are, stopped, so a
  big sea full of bots costs only those round the players. `WAKE_RANGE` stays well beyond a player's view range and
  `LEASH`, so a bot wakes before it can be seen and gives up a fight before it falls asleep.
- `spawner.ts`: `populate` puts every kind's bots (`botsInSea`: `perSquare` to every map square) on open water when the game starts (aggressive ones no nearer than
  `SAFE_RADIUS` to `START`). A sunk bot is taken out of `state.ships` in the update it sinks (the client animates the
  wreck) and replaced near where it sailed (within `RESPAWN_SPREAD` of its home), where no player can see it, after
  its `respawnTime` shared by the players' ships within `WAKE_RANGE` of it (`respawnDelay`: ten captains hunting the
  same waters find them as full as one; a boss's alone keeps its time); a spawn that finds no room tries again later.
  A bot alone, or the first of a pack, comes in at the emptiest of `CHOICES` places that fit (`crowding`: the bots
  within `CROWD_RADIUS`, the new one with them, for the room there), so the sea fills evenly and the stretch a
  captain hunts is filled first, yet keeps its knots and open stretches. The room (`SeaRoom`, `seaRoom`, made once
  with the sea and kept by `Game`) is the open water where a bot may come in, so a place by a coast, the Seam or a
  boss's waters is never taken for an empty one and the bots don't pile up round them. A boss comes in at its lair with its escort
  (`spawnBoss`); a sunk escort doesn't come back on its own, the boss brings it back, taking the escort that outlived
  the last boss into its service first. A pack comes in together (`spawnInPack`: the first anywhere, the rest within
  `PACK_JOIN` of it), never within `PACK_SAFE` of `START` (the far waters, out of a new captain's way); one sunk comes
  back to its mates afloat, out of sight and never while they fight, or with none afloat near its home as the first
  of the pack again (`Respawn.pack`).

## Economy (`economy/`), the port (`world/port.ts`) and saves (`save.ts`)

- `state.player` (`player.ts`) is what belongs to the player rather than to their ship: `gold`, the `hold` of guns and
  `outfits` not fitted, the `items` bought for doubloons and the skill bar's `quickSlots` (see Items), the quests taken and how many were turned in, all together (`progress`, which opens the tavern's later quests) and each (`progress.turnedIn`: its prizes, its repeats), the story (`story`, story/story.ts), the ships laid up in port (`fleet`),
  their `stats`, the rungs of each feat whose rewards they have claimed (`feats`) and the captain's `portrait` (`account/portrait.ts`: a number below `PORTRAITS`, picked with
  `choosePortrait`, the client's painted busts in the same order; others will see it online), and the seas they have
  sailed (`charted`, the starting waters first: `chartSea` as a game is made for a sea, so a gate sailed through charts
  the sea beyond; the client tells what sails only these). One player for now; online there will be one per player's ship (`playerOf`, `shipOf`). Gold comes
  in only through `earn` (a `gold` event for the client) and goes out only through `spend` (`records/stats.ts`: the
  shop, repairs at sea, the shipyard); `giveGold` is the HUD's debug button. `doubloons` are bought, with the online
  game: until then only a few quests' prizes (`prizes.ts`), the feats' rewards and the debug buttons (`giveDoubloons`) give them; forgetting the captain's mastery or a ship's talents spends them, and the Golden Galleon's items (see Items).
- `loot.ts`: `stepLoot` reads this update's `destroyed` events: the player who sank a bot is paid its kind's `bounty`,
  their ship earns its XP and counts it for its quests (`countKill`), and the bot may leave a `Chest` (chance and
  gold from `BOT_KINDS`, a ship's only: a monster's `chest` is null; goods from its `cargo`, the loot generator). A
  player's ship that goes down leaves its cargo floating there for `LOST_CARGO_TIME` (all of it stays aboard with a
  Hidden hold or Insured cargo). A bot's chest is kept (`keptFor`: its `takers`, no `expiresAt`) when it matters: the
  story's prey's for the player's ship it was brought in for, a boss's for every player's ship afloat within
  `BOSS_FIGHT` of it as it sank and the one that sank it; it floats till they have emptied it, or none of them is in
  the sea (online: gone home or on). `stepChests`: any other chest sinks after `CHEST_TIME`; a player's ship that may
  haul it (`mayHaul`) sailing over it takes its gold and what fits of its goods (`haulAboard`, dearest first; a
  `holdFull` event when nothing fits), the rest stays floating. `killReward` is what a kill of a kind would pay the
  player's ship now, from the same formulas (`bountyBoost`, `chestGoldBoost`, `killXp`): the bounty, the XP it keeps
  and why (`killXpShare`), a chest's chance and gold, a second chest's, the goods' odds, and which passives and talents
  add to each (`bonusesFor`, as the tavern's `questReward`), for the bestiary.
- `cargo.ts`: the goods (`GOODS`), a hold's or a chest's `Cargo`; a ship's `holdSize` is its class's `hold`, more with
  the talents and the mastery that give `hold`. `throwOverboard` empties some of a good out of the hold, anywhere, to make room: it sinks.
- `quests.ts`: the tavern's `QUESTS` (sink `count` of a hull class, eight to a dozen of a common kind or a whole pack so a quest is an
  outing of its own, for a `reward` and `xp`, offered once `after` quests have been turned in; its `grade`, easy, hard,
  elite or epic, for the tavern to tell); taken and turned in only in port, turned in only at the tavern of its sea
  (`questsToTurnIn`: the ship sailed's done there, what the port's marks count), and in the starting waters taken only once
  the story opens the tavern (`tavernOpen`, `takeBounty`: story/story.ts). The first time a player turns a quest in
  (`progress.turnedIn`, the player's, whatever ship), its `prizes` come too (`economy/prizes.ts`, `givePrizes`: guns,
  outfit and items into the hold, ammo into the ship's, doubloons; a `prizes` event): the starting waters' own for now.
  Its gold and XP are `REPEAT_SHARES` of them by the times it was turned in before: in full twice, then less, so a
  player goes round the tavern rather than doing one quest over and over. A quest is the ship's that took it (`ActiveQuest.ship`):
  only its kills count for it and only it turns it in, so a strong ship can't do a weak one's quests for its XP; the
  ship sailed's are `shipQuests`, the others' wait laid up with their ships. Any of them is given up anywhere, done or not
  (`dropQuest`, by its ship), so a player needn't take a ship's helm and sail back to its quest's sea to let it go. At most `MAX_QUESTS` a ship (`questLimit`)
  at once, the same quest on two ships counted for each on its own. `questReward` is what one
  pays the player's ship now (its repeat share, its prizes the first time), with the mastery's and its talents' bonuses (`xpGiven`, as `gainXp` gives it; none of the
  XP beyond its last level, `xpRoom`), and which passives and talents add to it, for the tavern. `shop.ts`, only in port:
  guns and outfit into the hold, ammo by any count, as many as the gold pays for (priced by packs of `AMMO_PACK` shots), the
  outfit fitted (`fitOutfit`), the shipwright's full repair and his forgetting the talents (`resetTalents`, for doubloons), goods
  sold at the market (`sellCargo`); priced by tier. The arsenal buys guns from the hold and ammo back for a quarter of
  their price (`sellGun`, `sellAmmo`, `SELL_BACK`: gold earned as `'arsenal'`), so buying and selling never pays. A
  gun is fitted from the hold anywhere (`fitFromHold`).
- `shipyard.ts`: the ships for sale and their terms, by tier and the same for every line players climb (`LADDER_LINES`:
  the European, Eastern, pirate and northern; `TIER_TERMS`: a price, the level of the ship sailed (from tier 2 the one
  before it at its last level, and nothing more: no quests), how far along the story). The goal (`shipGoal`) is by the ship sailed: after the starter
  sloop, a tier 1 ship of any of those lines (the story told up to the Seam's seal: the Baron sunk), after one of them
  the next of its line; its ships (`goalShips`) are the built ones not owned yet, so a planned line's waits. The
  Captain's path (`captainsPath`) is its terms as steps, each counted from the player, their ship and the story.
  `tierMastered`: whether the player has a ship of a tier at its last level, which a masterwork of that tier asks for.
  `fleet.ts`: `buyShip` of one of the goal's ships (`isGoalShip`, checked first: online the id is a player's) once
  every term is met (`termsMet`), with `unload` the guns and outfit of the ship it replaces taken into the hold first
  (the client asks, the first time: leaving the starter sloop), `takeHelm` of a ship laid up in port, each only of a
  ship whose tier the sea allows (`fitsSea`); the ship sailed keeps the player's ship id, the one left is laid up as a `SavedShip` in `player.fleet`.
  The ammo is the player's, not a ship's: it goes with the ship sailed (`changeShip`, `ship.takeAmmo`), at hand and
  loaded as it was, what the ship taken carries (a new one's starting ammo) added to the same kind's, at hand or in the
  hold; the ship laid up keeps none, so the same kind is never split between two ships (an older save's laid-up ships
  hand theirs over as it loads, `loadFleet`).
- The port (`PORT`, made once, the same on every run): a bay cut into its island's own coast (`shore`), a stone `quay`
  round its back, and two breakwaters (`walls`, smoothed middle lines) curving out from the headlands towards each
  other; the island's `coast` runs round them, so ships bump into them and the pilot sails round them like any coast.
  A player's ship that sails into the `basin` inside them docks (`stepDocking`, `ship.dock`): out of the fight,
  `setTarget` and `attack` ignored, it sails on to the `mooring` and lies there. `leavePort` sails it out through the
  entrance to the `roadstead`; `mayDock` keeps it from docking again until it has sailed `UNDOCK_MARGIN` beyond the
  basin. No bot spawns or wanders within `HARBOUR_CLEAR` of the basin (`nearHarbour`), so the way in stays clear.
- `save.ts`: `saveGame` makes plain `SaveData` of a player's progress (the sea they are in, the purse, the hold of guns and outfit, the items and the quick slots, quests with their ships and how many times each was turned in,
  the Captain's path, the story (its step by id), the fleet laid up in port, the stats, the feats' rungs claimed (an older save's: every rung reached, whose points it had), the captain's mastery and portrait, the seas sailed (an older save's: every sea up to the one it is in, along the gates), and the ship: its class, place, hull, guns, ammo, the ammo
  loaded and at hand, weapon, outfit, XP and talents, cargo, stats, whether it is in port); `loadGame` checks every field and keeps only the valid
  ones (a ship on land or off the map comes back at `START`; talents are put back through `learnTalent`, so only what
  the rules allow; a saved gun in a slot the class no longer has goes into the player's hold:
  `loadShip` returns them; a save from before `SMALL_HOLDS` keeps all its cargo, the hold over-full till it is
  sold; one from before the story that starts it gets the guns its first step asks for in the hold). No bots, chests
  or time: the sea is made afresh. Bump `SAVE_VERSION` when the shape changes (an
  older save is read field by field); a class renamed goes in `RENAMED_CLASSES`, so an older save's ship sails on
  under its new id. The client keeps the save until there is a server.

## Items (`items/`)

- `items.ts`: the Golden Galleon's items (`ITEMS`, `ITEM_IDS`, in ten groups, `ITEM_CATEGORIES`), sold for **doubloons only**,
  never gold: each its name, its text with its `figures` (what it is to do and how much) and its `price`. None does
  anything yet: `docs/items.md` is the plan, item by item, and what using them needs first (`useItem`, effects in time,
  cooldowns, stacking). No item gives what a talent, a signature or a passive of the mastery does, but more experience,
  which adds to theirs: never a share more speed, damage, hull, reload, reach, gold or room, a slow, a share of damage
  taken off, the hull mended a second or a blow that leaves the ship afloat.
- Bought on the Golden Galleon in port by any count (`buyItem`, `economy/shop.ts`), or given among a quest's prizes the first time it is turned in and a feat's rewards (`givePrizes`), into `player.items`: the player's, for every
  ship they sail, as many as they like, taking no room in the hold.
- `quickSlots.ts`: the skill bar's ten quick slots (`player.quickSlots`, keys 1…0): an item of the hold in each, one
  slot an item at most (`setQuickSlot` moves one already on the bar; null empties a slot), `swapQuickSlots`. Using one is
  to come, a game method like any player action.

## The captain's mastery (`account/mastery.ts`)

- The account's own passives, for every ship the player sails (a ship's talents are that ship's). Seven
  specializations (`MASTERY_SPEC_IDS`), each growing from the captain on its own: a trunk, three twigs of five steps
  that add the same a step (`STEP_TIERS`: common, common, improved, rare, rare), a special at each twig's end, and two
  legendaries at the crown, open with `LEGENDARY_GATE` points in the specialization. A passive is taken once, for its
  tier's cost (`PASSIVE_COSTS`), when one it `links` to (nearer the captain) is taken. `MASTERY_PASSIVES` is the whole
  tree, built from `PLANS` (a passive's key, name, text with its `figures`, `effects`). Its figures are provisional;
  the tree costs far more than the ships of now pay, so a long-time captain always has more to take.
- Points (`captainPoints`): a point every `POINT_LEVELS` levels of every ship of the player's, the one sailed and those
  laid up (a line of six tiers pays 21, the starter sloop one more), and the feats' rungs claimed (`RUNG_POINTS` a
  rung; see Feats).
- What is taken is the player's (`player.mastery`, saved; ids `spec.key`, a twig's steps `spec.twig.n`), added up
  into a `ShipBonus` (`ships/bonus.ts`, the same effects as the talents') that the player's ship carries
  (`ship.captain`, set by `applyMastery` whenever it changes or
  the ship does): figures grown like the outfit's, combat (see Combat), reloads, reach, the hold, combat time,
  repairs and their gold, bounties, chests, goods, the market (`marketValue`), quests (`questLimit`, their gold),
  experience (`gainXp`), the abilities' cooldown, talent points on every ship (`shipTalentPoints`), and how near hostile
  bots notice the ship (`brain.ts`). `takePassive` keeps to the rules (`masteryBlock`); `retakeMastery` takes a list
  again by them (a save loaded, a level lost); `forgetMastery` gives every point back in port for doubloons, `MASTERY_RESPEC_PRICE` a point (not
  gold, which a player farms: they would take whatever the next fight wants and forget it after).
- A save loads the ships with the passives as saved, so a talent point the mastery gives keeps its talent, then checks
  the passives against what the ships pay, then the quests (Busy captain allows one more).

## Feats (`account/feats.ts`)

- Ladders of rungs (`FEATS`) counted from the player's stats (`count`, its `goals`); the duels' come with the online
  game (`planned`). A rung reached is told of (`stepFeats`, after the stats: a `feat` event; `player.featsReached`, not
  saved, so a game loaded counts what it has without a word), and its reward waits for the player to claim it, never
  given unasked: `claimFeat`, anywhere, takes a ladder's next rung reached (`rungsClaimed`: `player.feats`, saved), its
  `RUNG_POINTS` the captain's to spend only then (`featPoints`), its `RUNG_DOUBLOONS` and its `items` of the Golden
  Galleon's (provisional, fitting what the ladder counts) given as a quest's prizes are (`givePrizes`): a `featClaimed`
  event. `rungReward` is a rung's reward, `rewardsToClaim` the rewards waiting. The last rungs are to give ships.

## The story (`story/story.ts`, docs/story.md)

- The story is data: its speakers (`SPEAKERS`), the prologue's cards (`PROLOGUE`), its chapters and its steps (`STORY`),
  each with its `objectives` (`reach` a mark, `sink` so many of a kind, `fit` so many guns of a weapon, `haul` a
  wreck's loot (a good, or anything), `dock`, a `level`, a `talent`, a `repair` step at sea, a `sell` at the market, a
  tavern quest taken (`takeQuest`) and turned in (`turnInQuest`), a piece of `outfit` fitted, a `weapon` picked, a
  `ship` of a tier sailed), its `opening` and `closing` lines (English, the client translates them),
  how it is turned in (`'done'`: the moment its objectives are met, its closing told wherever the ship is; `'port'`:
  once the ship docks with them met, its closing told there), its `reward` (gold as a `'quest'`'s, with the step in the
  event's `story`, and experience), a good it `takes` from the hold as it is turned in (Edda's moon glass), and a kind
  it has the crew `watch` while its closing is told (the Baron, scouted). Only the starting waters' steps so far,
  counted only there.
- A player's progress along it is `player.story` (`StoryProgress`, saved by step id): the prologue seen, the step on,
  whether its opening was told (its objectives count only from then), each objective's count, and a step done whose
  closing is still to be told. A player's, not a ship's: any ship they sail counts for it.
- `stepStory` (before the stats) counts the update's events (`destroyed` by the player's ship, loot hauled, a repair
  step, goods sold, a quest's gold turned in) and the ship's state (where it is, docked, level, a talent, a quest
  taken, outfit fitted, the weapon picked, its tier) towards
  the objectives (a `story` event for each met) and ends a step turned in `'done'`. `storyTalk` is what is to be told
  now (a closing still to tell, else the step's opening, else in port the closing of a step to turn in there);
  `tellStory(key)` is the player having heard it out, `seePrologue` the prologue seen: the player's actions, commands
  online, never a pause (the sea goes on). `skipStoryStep` is the debug buttons'.
- Its places on the map (`StoryMark`: the buoy off the roadstead, the spot off the Baron's lair) are placed on the open
  water nearest them when the sea is made (`placeStoryMarks`, `state.world.marks`); no bot comes into the game or
  wanders near one (`nearStoryMark`, as near a gate). `storyMark` is the one the step asks the player to sail to now,
  or the harbour (`port`, at its berth) while it asks them home (to dock, to turn the step in, to sell the goods
  aboard at the market once that is all it still asks, or for what only the tavern or the workshop does: a bounty to
  take, or another once it was given up, one done to turn in, the outfit to buy), the ship at sea. `storyGoal` is where the client
  points the player: that mark, or else the nearest of the prey brought in for them and the chests with what the
  step asks them to haul up that they may haul (`haulsLeft`).
- While the step asks for guns that wait in the hold (`storyFitting`: a weapon's slot empty and its guns aboard; none
  to fit, sold say, and the player is never shut in), the ship stays in port: the client sets sail through `setSail`,
  which refuses then (Edda: "Don't take her out bare"), and leaves through `leavePort` otherwise.
- The tavern is shut in the starting waters till the story has brought the player home from the Baron's waters
  (`tavernOpen`: its `bounty` step reached), or while a quest of theirs is still to do or turn in (an older save's,
  never stranded): Hale opens it then, and asks for a couple of bounties. The client takes a quest through `takeBounty`
  (as it sets sail through `setSail`), which refuses while it is shut; `takeQuest` itself knows nothing of the story.
  Another sea's tavern is open.
- What the step asks the player to sink (`storyTargets`: the client marks it gold) is brought in near them as prey
  (`storyPrey`, bots/spawner.ts `stepPrey`): as many as it still asks for, out of sight round the ship at sea (a second
  one by the first), weaker than their kind (`PREY_HULL`, `PREY_POWER`), never back once sunk, each leaving a shard of
  moon glass (economy/loot.ts); one the story no longer asks for, or left far behind, is taken away unseen. Once
  every kind is sunk, while the glass the step asks them to haul up is not and no chest of it floats for them (each
  prey's is kept for them, but lost with the sea made afresh as a game is loaded), one more is brought in (`huntsLeft`), so the story never stalls. A boss is
  never prey. Each prey is its player's (`BotMind.prey`): online, one per player who needs it.
- While the closing of a step with `watch` is told (`storyWatch`), for `WATCH_TIME` at most (`story.watchUntil`, not
  saved: a player who never closes it isn't left alone for good), the player's ship sees one of that kind through the
  fog (`Ship.spotted`, which `canSee` reads), and is left alone while it attacks nothing (`Ship.parley`: no bot starts
  a fight with it, and those fighting it calm down); `stepStory` sets both every update. The client turns the camera to
  it.
- A new player (no save) starts docked in port (`Game.load`), where the story's first opening is told after the
  prologue.

## Records (`records/`)

- `stats.ts`: what a player and each of their ships have done (`Stats`: kills by class, quests, gold earned by how
  and spent, chests and goods, volleys, damage, bites, sinkings, repairs, abilities, the voyage), for the medals to
  come. `tally.ts`: `stepStats` counts them from the update's events, just before the feats (`stepFeats`) in `Game.update`; a ship's are its own,
  a player's all their ships' together.

## Hull health (`ships/damage.ts`) and repairs (`ships/repair.ts`)

- A ship has hull points: `hp`, whole, out of `maxHp` (its class's `hp`, grown by its outfit and talents). They change only through `ship.setHealth`
  (in percent, for the HUD's debug buttons), `ship.takeDamage` (combat), `ship.heal` (repairs), all clamped, and
  `ship.respawn`.
- `health` is derived from them: hull integrity in percent, `0`–`MAX_HEALTH` (100). Damage stages and speed go by it.
- `damageStage(health)` maps it to one of `DAMAGE_STAGES`: `intact` → `minor` → `heavy` → `burning` → `sinking`.
  The order matters: the client falls back along it when a stage has no sprite.
- At 0 the ship is sinking (`isSinking`): its target, attack target and repair are cleared, `setTarget` and `attack`
  are ignored, and it coasts to a stop. A bot's ship is then taken out of the game (Bots); a player's ship comes back
  whole at `START` `WRECK_TIME` after it went down (`Game`, `ship.wreckedAt`), with its guns and ammo.
- The repair skill: `toggleRepair` sets the crew to work (`ship.startRepair`) or, at any moment, stops them (the
  step under way lost, nothing paid for it: `startRepair` starts the step clock from nothing, so stopping and starting
  again, however quickly, never mends sooner than repairing on), and `stepRepairs` mends `REPAIR_RATE` of
  the hull a second (more with Carpenters) in steps every `REPAIR_TICK` (a `repair` event each). A player pays for each
  step, `REPAIR_HP_PER_GOLD` hull for a gold (`canPayRepair`). It stops when the hull is whole, the ship sinks, the
  ship is in combat, or the gold runs out (a `repairStopped` event) — so it can't be started in combat or without the
  gold either.
