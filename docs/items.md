# Items

The market's second tab, **Buy**, sells items: scrolls, charms, powders, flags and other things a captain takes to sea.
They are paid in **doubloons only**, never gold: gold is farmed, doubloons are what the game earns on. This file is the
to-do list for making them work: none of them does anything yet.

## What works now

- The catalog: `src/game/items/items.ts` (`ITEMS`, `ITEM_IDS`, `ITEM_CATEGORIES`). Each item has its group, its English
  name, the text the player reads (what it **will** do, its numbers as `figures`) and its price in doubloons.
- Buying: `buyItem` (`economy/shop.ts`), in port only, any count (the info window picks 1, 20, 100, 1000 or as many as
  the doubloons pay for). Bought items go to `player.items`, the player's, not a ship's: every ship they sail has them.
  The hold has room for any number; items take no place of the cargo's.
- The hold (H) has two tabs: **Cargo** (the goods, as before) and **Items** (a cell an item, with its count, and the
  key of its quick slot when it is on the skill bar).
- The skill bar's ten quick slots (keys 1…0) hold items (`player.quickSlots`, `items/quickSlots.ts`): dragged there from
  the hold (or a click on an item in the hold puts it in the first empty slot); dragged from one slot to another they
  swap. An item leaves the bar **only** when it is dragged back into the open hold: let go anywhere else, it stays, so
  a slip of the mouse never empties a slot. An item is in one slot at most.
- A click on a quick slot or its key does **nothing** yet. The tooltip over it says so.
- Saved (`SAVE_VERSION` 15): the items and the quick slots.
- Icons: `public/sprites/icons/items.webp` / `items.json`, cut by `blender-assets/icons/build_item_icons.py` out of
  eight painted sheets (`icons/source/items_1.png` … `items_8.png`, ten items each, each painted twice). The left picture
  of each pair is the icon; to use the right one, add the item's id to `SECOND` in the script and run it again.

## What using them needs (decide before the first one)

- **A command**: `useItem(state, player, slot)` in `game/items/`, the only way the client uses one (online, a command
  sent to the server). It takes one from `player.items` (the slot stays, greyed at 0, so a bought one goes back in its
  place) and starts its effect. Keys 1…0 in `keyboardInput.ts` and a click on a quick slot call it.
- **Effects in time**: what an item does for a while lives on the ship (`ship.itemEffects`: id → until when, in
  `state.time`), stepped from `Game.update` (a new `stepItems`, after `stepTalents`). Times are game time: they run only
  while the player plays. Hours-long ones (artifacts) need a decision: game time, or real time once there is a server.
- **Cooldowns**: per item (`player.itemReadyAt`), shown on its quick slot like an ability's sweep.
- **Stacking**: one of each group at a time is the proposal (one experience scroll, one artifact); another of the same
  item adds its time. Experience adds to the talents' and the mastery's `xp` (`xpGiven`).
- **Randomness** (Lucky coin, the strongbox, treasures) through the game's seeded generators, a stream of their own.
- **Events**: each use an event (`state.events`), for the sounds, the effects and the combat log.
- **Online**: invisibility, holding a foe, teleports and summoned ships against other players need rules of their own
  (shorter, weaker on players, or not at all). The Mystery strongbox sold for doubloons (real money) is a paid random
  reward: in some countries (Belgium, the Netherlands) that is treated as gambling, so check the law and show its odds
  before it goes live, or sell it for gold.
- **Seen by others**: the looks (sails, banner, wake, frame, dolphins) are for other players to see once the game is
  online; until then they are a player's own.

## The items

Prices are in doubloons. "Needs" says what the game must have first, beyond `useItem`.

### Experience and quests (adds to the talents' and the mastery's experience)

| #   | Id                       | Name                     | Price | What it will do                                                                  | Needs                                                               |
| --- | ------------------------ | ------------------------ | ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | `cabinBoysScroll`        | Cabin boy's scroll       | 3     | +10% experience for ships and monsters sunk, 30 min                              | A share added in `xpGiven` for kills                                |
| 2   | `navigatorsScroll`       | Navigator's scroll       | 8     | +25% experience for ships and monsters sunk, 30 min                              | As 1                                                                |
| 3   | `captainsScroll`         | Captain's scroll         | 25    | +50% experience for kills and quests, 60 min                                     | As 1, quests too                                                    |
| 4   | `watchLog`               | Watch log                | 15    | ×2 experience for the next 25 kills                                              | A count of kills left, not a time                                   |
| 5   | `oldBosunsWisdom`        | Old bosun's wisdom       | 6     | 30 min: bots of the ship's tier give all their XP, whatever their level          | `xpForKill` skipping its level share (not the tier below's quarter) |
| 6   | `fleetLog`               | Fleet log                | 12    | 60 min: a ship laid up in port, picked, earns 30% of the XP the ship sailed does | Picking a ship of `player.fleet`; XP into a `SavedShip`             |
| 7   | `letterOfRecommendation` | Letter of recommendation | 4     | The next quest turned in gives ×2 experience                                     | A flag read by `turnInQuest`                                        |
| 8   | `trophyPennant`          | Trophy pennant           | 10    | 30 min: every kill counts twice for the quests                                   | `countKill` counting 2                                              |
| 9   | `couriersSeal`           | Courier's seal           | 2     | Turns a quest that is done in at sea                                             | `turnInQuest` without the port; which quest (the tracker)           |

### Repairs and defence

| #   | Id                | Name             | Price | What it will do                                                        | Needs                                                                     |
| --- | ----------------- | ---------------- | ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 10  | `canvasPatch`     | Canvas patch     | 1     | Mends 15% of the hull at once, in a fight too; once every 60 s         | `ship.heal`, a `mend` event                                               |
| 11  | `spareTimbers`    | Spare timbers    | 2     | Mends 35% of the hull at once, in a fight too; once every 2 min        | As 10                                                                     |
| 12  | `shipyardWarrant` | Shipyard warrant | 3     | The whole hull at once, at sea, out of combat                          | As 10, refused in combat                                                  |
| 13  | `poseidonsAegis`  | Poseidon's aegis | 4     | 10 s: a shield takes blows worth 30% of the hull before the hull does  | A shield's points on the ship, taken first in `hurt`; drawn over the ship |
| 14  | `stElmosCharm`    | St. Elmo's charm | 10    | 3 s: no blow does any damage; once every 3 min                         | `hurt` doing nothing while it lasts                                       |
| 15  | `mirrorBrass`     | Mirror brass     | 3     | 10 s: 30% of the damage taken strikes back at whoever dealt it         | `hurt` striking `lastHitBy` back                                          |
| 16  | `boardingNets`    | Boarding nets    | 2     | 20 s: nothing can stop, silence, pull or throw back the ship           | The holding items (31–40) on ships, from bots or players                  |
| 17  | `shipsBell`       | Ship's bell      | 1     | 2 min: a boss's mortar shells marked under the ship land twice as late | `barrage.ts` reading it when it marks a shell                             |
| 18  | `charonsObol`     | Charon's obol    | 2     | Sunk, the ship is back by the port at once                             | `WRECK_TIME` skipped once; used from the wreck (the bar while sinking)    |

### Hiding and getting away

| #   | Id                    | Name                   | Price | What it will do                                                                          | Needs                                                                    |
| --- | --------------------- | ---------------------- | ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 19  | `smokePots`           | Smoke pots             | 2     | 5 s: nobody sees or aims at the ship, shots on their way fall in the sea; firing ends it | `canSee` false for the others; projectiles at it dropped; a smoke effect |
| 20  | `fogCloak`            | Fog cloak              | 8     | 20 s: nobody sees the ship until it fires; bots sail by                                  | As 19, bots not noticing it (`brain.ts`)                                 |
| 21  | `whiteFlag`           | White flag             | 4     | Ends the fight: attackers sail off, the ship holds fire 10 s; once every 5 min           | Bots giving the ship up (`brain.ts`), `combatUntil` cleared              |
| 22  | `homewardCompass`     | Homeward compass       | 1     | 10 s still, out of combat, and the ship is back by the port                              | A channel broken by moving or a hit; then at `START`                     |
| 23  | `admiraltyPass`       | Admiralty pass         | 2     | The next gate lets the ship through in a fight                                           | `stepGates` letting it pass once                                         |
| 24  | `decoyRaft`           | Decoy raft             | 2     | A raft astern: 6 s every foe within 300 fires at it                                      | A unit that can be fired at (`units.ts` has only ships)                  |
| 25  | `lighthouseInABottle` | Lighthouse in a bottle | 6     | Sets a buoy; within 1 h the ship can be back at it once                                  | Two uses: set and go back; the buoy on the map                           |

### Seamanship (never more speed: the talents give it)

| #   | Id              | Name            | Price | What it will do                                   | Needs                                           |
| --- | --------------- | --------------- | ----- | ------------------------------------------------- | ----------------------------------------------- |
| 26  | `bottledGale`   | Bottled gale    | 2     | The ship leaps 150 ahead at once; once every 30 s | A move checked against coasts (`collideShip`)   |
| 27  | `galleySweeps`  | Galley sweeps   | 2     | 20 s: turns on the spot, no speed lost in turns   | The pilot's slowing for turns and the turn rate |
| 28  | `kedgeAnchor`   | Kedge anchor    | 1     | Turns the ship about at once                      | `rotation` + π, speed kept or lost              |
| 29  | `riggingGrease` | Rigging grease  | 1     | Clears every slow, and none takes hold for 15 s   | `slowedUntil` cleared and refused               |
| 30  | `ghostShipNail` | Ghost ship nail | 4     | 1 h: the ship sails through other ships           | `collideShip` skipping ships for it             |

### Holding the foe (no talent does it)

| #   | Id               | Name            | Price | What it will do                                            | Needs                                                  |
| --- | ---------------- | --------------- | ----- | ---------------------------------------------------------- | ------------------------------------------------------ |
| 31  | `grapplingHooks` | Grappling hooks | 2     | The target within 150 is held still 3 s                    | A hold on a ship's steering (as `slowedTo` 0)          |
| 32  | `soakedPowder`   | Soaked powder   | 3     | The ship aimed at cannot fire 4 s                          | Combat skipping its volleys                            |
| 33  | `whaleboneNet`   | Whalebone net   | 2     | The monster aimed at cannot bite 5 s                       | Combat skipping its bites                              |
| 34  | `hornOfDread`    | Horn of dread   | 3     | 8 s: every foe within 300 reloads 40% slower               | A reload share on bots                                 |
| 35  | `flashPowder`    | Flash powder    | 3     | 6 s: half the target's dice miss                           | `rollVolley` missing every other die                   |
| 36  | `jollyRoger`     | Jolly Roger     | 2     | Bots of lower levels within 300 flee 5 s                   | A flee state in `brain.ts`                             |
| 37  | `neptunesWrath`  | Neptune's wrath | 3     | A wave throws every foe within 200 back by 150             | A push checked against coasts                          |
| 38  | `whirlpoolFlask` | Whirlpool flask | 5     | A whirlpool 5 s draws every foe within 120 in and spins it | A place on the water that pulls; drawn on the water    |
| 39  | `oilSlick`       | Oil slick       | 2     | A slick astern 12 s: a foe in it cannot steer 3 s          | A place on the water, like a powder keg (`state.kegs`) |
| 40  | `towHarpoon`     | Tow harpoon     | 2     | Pulls the target 120 towards the ship                      | A pull checked against coasts                          |
| 41  | `phosphorPaint`  | Phosphor paint  | 2     | 60 s: the target shows through the fog and cannot hide     | `canSee` true for it; against 19–20 online             |
| 42  | `tamersWhistle`  | Tamer's whistle | 6     | The monster aimed at, not a boss, fights for the ship 15 s | Bots fighting bots, which they never do now            |
| 43  | `bribePurse`     | Bribe purse     | 10    | A boss's escort stays out of this fight                    | Escorts not joining (`follow` in `brain.ts`)           |

### Strikes and help

| #   | Id                 | Name               | Price | What it will do                                                                | Needs                                                    |
| --- | ------------------ | ------------------ | ----- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 44  | `greekFire`        | Greek fire         | 3     | The next 3 cannon volleys set the target alight: +50% of their damage over 5 s | Damage over time, which nothing does now                 |
| 45  | `jellyfishVenom`   | Jellyfish venom    | 3     | The next 3 harpoon volleys poison a monster: +60% over 6 s                     | As 44                                                    |
| 46  | `skippingShot`     | Skipping shot      | 2     | The next volley skips on to one more foe within 150, half its damage           | A second projectile from where the first lands           |
| 47  | `blessedShot`      | Blessed shot       | 2     | 60 s: none of the ship's dice miss                                             | `rollVolley` rolling past `missOn`                       |
| 48  | `thunderbolt`      | Thunderbolt        | 4     | Lightning: 6% of the target's whole hull, not a boss                           | A strike by share of `maxHp`                             |
| 49  | `fireship`         | Fireship           | 7     | A burning boat sails at the target, blows up, the sea on fire 6 s              | A unit that sails at a target; fire on the water (as 44) |
| 50  | `hiredSloop`       | Hired sloop        | 5     | 20 s: a ship of the player's tier sails with them and fires at their target    | A friendly bot: the brain on the player's side           |
| 51  | `phantomFrigate`   | Phantom frigate    | 20    | 30 s: a ghost ship twice as strong that nothing can hit                        | As 50, untargetable                                      |
| 52  | `hourglassOfTides` | Hourglass of tides | 12    | Every ability (F, G, T) ready at once; once every 10 min                       | `abilityReadyAt` cleared                                 |

### Scouting

| #   | Id               | Name             | Price | What it will do                                                    | Needs                                                       |
| --- | ---------------- | ---------------- | ----- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| 53  | `signalFlare`    | Signal flare     | 1     | Lifts the fog 20 s within 600 of where the player points           | A second spot the ship sees from (`canSee`, the fog shader) |
| 54  | `gullsEye`       | Gull's eye       | 2     | 5 min: the sea chart shows every bot of the sea                    | The chart drawing bots beyond the view                      |
| 55  | `huntersCompass` | Hunter's compass | 1     | 15 min: an arrow to the nearest bot the quests ask for             | An arrow round the ship (client)                            |
| 56  | `barometer`      | Barometer        | 1     | When and where the sea's boss comes                                | The boss's respawn time read from `stepSpawns`              |
| 57  | `lookoutParrot`  | Lookout parrot   | 5     | 2 h: cries out when a hostile bot comes out of the fog at the ship | A warning when an aggressive bot's foe is the ship, unseen  |

### Loot and gold

| #   | Id                 | Name              | Price | What it will do                                                          | Needs                                                           |
| --- | ------------------ | ----------------- | ----- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 58  | `luckyCoin`        | Lucky coin        | 5     | 30 min: a kill has a 5% chance to pay ×10 its bounty                     | `stepLoot`, the loot generator                                  |
| 59  | `goldenHook`       | Golden hook       | 5     | 30 min: monsters sunk leave chests of gold too                           | A chest for a kind whose `chest` is null                        |
| 60  | `blackSpot`        | Black spot        | 4     | The target, not a boss, sunk within 30 s: ×3 bounty and a chest          | A mark on a bot, read by `stepLoot`                             |
| 61  | `wantedPoster`     | Wanted poster     | 8     | A wanted captain comes near, stronger than the elite: ×5 bounty, a chest | A bot spawned for one player (`spawner.ts`), a kind of its own  |
| 62  | `challengeHorn`    | Challenge horn    | 15    | The sea's boss comes at once, if its lair is empty                       | `spawnBoss` on demand                                           |
| 63  | `mapScrap`         | Map scrap         | 2     | A small treasure of the sea marked on the chart                          | Treasures: a place, a chest there, the chart's mark             |
| 64  | `treasureMap`      | Treasure map      | 12    | A great treasure guarded by pirates; later with ancient relics           | As 63, guards spawned; relics (`currencies.ts`)                 |
| 65  | `mysteryStrongbox` | Mystery strongbox | 6     | Gold, one of these items or, now and then, doubloons                     | A table of chances, seeded; see the note on paid random rewards |
| 66  | `billOfExchange`   | Bill of exchange  | 1     | Sells the whole hold at sea for 75% of the market's price                | `sellCargo` without the port, at a share                        |
| 67  | `fishingNets`      | Fishing nets      | 1     | 30 min: out of combat, a fish into the hold every 20 s                   | Cargo added while it lasts, the hold's room kept                |
| 68  | `powderTender`     | Powder tender     | 1     | Buys ammo at sea once, at the arsenal's prices                           | The arsenal's ammo tabs at sea, once                            |

### Artifacts (they work long: one at a time)

| #   | Id                  | Name                 | Price | What it will do                                                      | Needs                                                    |
| --- | ------------------- | -------------------- | ----- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| 69  | `sailorsCharm`      | Sailor's charm       | 10    | 2 h: the first blow at the ship every 5 min misses                   | `hurt` skipping a blow; a timer                          |
| 70  | `stormOrb`          | Storm orb            | 20    | 1 h: lightning strikes the nearest foe within 300 every 15 s         | A strike of its own, as hard as what? (to balance)       |
| 71  | `drownedKingsCrown` | Drowned king's crown | 30    | 1 h: every ship sunk rises as a ghost and fights for the player 10 s | As 50, from the wreck                                    |
| 72  | `enchantedWheel`    | Enchanted wheel      | 12    | 1 h: attacking, the ship keeps the best distance by itself           | The bots' `FIGHT_SHARE` circling, for the player's pilot |
| 73  | `phoenixFeather`    | Phoenix feather      | 40    | Once a day: sunk, the ship rises where it went down 5 s later, whole | A day of what time; the wreck brought back in place      |

### Looks (they change nothing in a fight)

| #   | Id               | Name             | Price | What it will do                                     | Needs                                                          |
| --- | ---------------- | ---------------- | ----- | --------------------------------------------------- | -------------------------------------------------------------- |
| 74  | `fireworks`      | Fireworks        | 1     | A salute in the sky over the ship                   | An effect (client), and an event for others online             |
| 75  | `sailDye`        | Sail dye         | 50    | A colour for a ship's sails, for good               | Ship atlases in looks (`<look>/` folders), rendered per colour |
| 76  | `captainsBanner` | Captain's banner | 30    | A flag of the player's own on the mast, for good    | A flag on the ship's sprite; the player's pick saved           |
| 77  | `colouredWake`   | Coloured wake    | 15    | A colour for the ship's wake, 7 days                | A tint in the wake's shader (`Wake.ts`); real days             |
| 78  | `portraitFrame`  | Portrait frame   | 20    | A gold or silver frame round the captain's portrait | A frame in `UnitFrames`, saved with the portrait               |
| 79  | `shantySingers`  | Shanty singers   | 2     | Sea shanties aboard for 1 h                         | Music in `Sounds.ts` (recordings to find, CC0)                 |
| 80  | `dolphinEscort`  | Dolphin escort   | 5     | Dolphins swim beside the ship for 1 h               | A model or atlas, swimming beside the ship (client)            |
