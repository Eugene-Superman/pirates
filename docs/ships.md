# Ships

Every player starts on the **Starter Sloop** (line `starter`, tier 0). Later ships come in lines: families with their own style
and role, six tiers each, and the masterworks, bought. The sloop and the whole European line, the **Royal Herald**
(the goal of the starting waters, sold at the shipyard once the Captain's path is done), the **Salamander**, the
**Peregrine**, the **Crowned Lion**, the **Black Eagle** and the **Sovereign of the Seas** (the next goals, sold the
same way; named after the beasts and titles of heraldry, each after what its hull shows), are built; the other 54 are planned. `SHIP_LINES` in `src/game/ships/shipLines.ts` lists every line and
its ships: a planned one has a name, a tier, a role, provisional figures and how it is got, which the shipyard shows
(its legend and each line's look are in `src/client/hud/shipLore.ts`). A player keeps every ship they buy: one
sailed, the others laid up in port (`src/game/economy/fleet.ts`). Every ship levels on its own from 1 (the sloop to
10, a line's ships to ten a tier, 60 at tier 6) and has a talent tree of its own (`src/game/ships/talentTrees.ts`).

## Lines

| Line id     | Line                          | Style                                                                                                      | Role                                                             |
| ----------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `starter`   | Starter ships                 | Small, plain, light                                                                                        | The first ship of every player                                   |
| `european`  | Royal Navies                  | Spain, England, France, the Netherlands: classic sailing ships, heavy guns, bronze ornaments, royal crests | All-rounders: balanced guns, speed and hull                      |
| `eastern`   | Empires of the East           | China, Japan, Southeast Asia: junks, multi-tier decks, red sails, dragons, lacquered wood                  | Agile and fast, with special abilities                           |
| `pirate`    | Brotherhood of the Black Flag | The Caribbean, pirate republics: rebuilt ships, black sails, trophies, uneven hulls, odd weapons           | Heavy broadsides, ambushes, aggressive play                      |
| `northern`  | Clans of the Frozen Seas      | Norse myth and northern seas: long hulls, carved beast heads, fur, runes, steel                            | Tough: ramming, defence, strong close-range attacks              |
| `legendary` | Forbidden Fleets              | Supernatural powers, ancient civilisations: ghostly hulls, glowing runes, cursed guns, unusual silhouettes | Unique effects and rare abilities, hard to obtain                |
| `premium`   | Masterworks                   | The finest work of the master shipwrights, each in the manner of a line: gilded, carved, set with gems     | Bought with doubloons: as strong as their tier, finer to look at |

Tiers 1 → 6, with their ids (built ones in bold):

- **Royal Navies:** **Royal Herald** (`coastalBark`), **Salamander** (`corsair`), **Peregrine** (`frigate`), **Crowned
  Lion** (`royalGalleon`), **Black Eagle** (`admiral`), **Sovereign of the Seas** (`shipOfTheLine`): the ids are
  their first names, kept so saves, atlases and talent trees stay as they are
- **Empires of the East:** River Junk (`riverJunk`), Sea Merchant (`seaMerchant`), Dragon Sentinel (`dragonSentinel`),
  Celestial Frigate (`celestialFrigate`), Imperial Junk (`imperialJunk`), Dragon Armada (`dragonArmada`)
- **Brotherhood of the Black Flag:** Smuggler (`smuggler`), Sea Wolf (`seaWolf`), Black Corsair (`blackCorsair`),
  Avenger (`avenger`), Storm Phantom (`stormPhantom`), Lord of the Abyss (`abyssLord`)
- **Clans of the Frozen Seas:** Breaker (`breaker`), Sea Raider (`seaRaider`), Wolf Ship (`wolfShip`), Ice Jarl
  (`iceJarl`), Storm Petrel (`stormPetrel`), Jörmungandr (`jormungandr`)

The Forbidden Fleets have four ships a tier, each got its own way and paid in that way's own currency
(`src/game/economy/currencies.ts`); `OBTAIN` in `shipLines.ts` has each one's price and terms:

| Tier | Sea monster hunts (pearls)       | Boss fights (seals)                 | Treasure maps (relics)           | The arena (glory)       | Events (tokens)             | Guild battles (honour)           |
| ---- | -------------------------------- | ----------------------------------- | -------------------------------- | ----------------------- | --------------------------- | -------------------------------- |
| 1    | Shellback (`shellback`)          |                                     | Will-o'-the-Wisp (`willOWisp`)   | Duelist (`duelist`)     | The Forgotten (`forgotten`) |                                  |
| 2    |                                  | Baron's Shadow (`baronsShadow`)     | Cursed Galleon (`cursedGalleon`) |                         | Aurora (`aurora`)           | Oathkeeper (`oathkeeper`)        |
| 3    | Serpent's Spine (`serpentSpine`) | Soul Reaper (`soulReaper`)          |                                  | Gladiator (`gladiator`) |                             | Iron Covenant (`ironCovenant`)   |
| 4    |                                  |                                     | Black Oracle (`blackOracle`)     | Conqueror (`conqueror`) | Siren's Song (`sirensSong`) | Bastion (`bastion`)              |
| 5    | Sea Devourer (`seaDevourer`)     | Pale Admiral (`paleAdmiral`)        |                                  | Champion (`champion`)   | Phoenix (`phoenix`)         |                                  |
| 6    | Leviathan (`leviathan`)          | Throne of the Abyss (`abyssThrone`) | Starfall (`starfall`)            |                         |                             | Eternal Armada (`eternalArmada`) |

The masterworks, two a tier, each in the manner of a line and with the figures of that line's ship of its tier: Gilded
Swallow (`gildedSwallow`, European) and Jade Lotus (`jadeLotus`, Eastern); Velvet Rose (`velvetRose`, pirate) and
Silver Fjord (`silverFjord`, northern); Crown Jewel (`crownJewel`) and Moonlit Dragon (`moonlitDragon`); Ruby Corsair
(`rubyCorsair`) and Valhalla (`valhalla`); Sun King (`sunKing`) and Empress of the Waves (`empressOfWaves`); Midnight
Sun (`midnightSun`) and Mirage (`mirage`, Forbidden Fleets). Each is bought with doubloons once the player has a ship of
the same tier of another line at its last level (`tierMastered` in `src/game/economy/shipyard.ts`; the sloop, tier 0,
opens none).

The planned ships' figures are provisional: the European line's ladder (the Royal Herald's own at tier 1), each line
leaning its own way (the comment over `PLANNED` says how). Harpoon guns come in numbers like the cannons', in its
line's mix: about even in the European line and the East (a few more harpoon guns there), mostly cannons for the
pirates, mostly harpoon guns in the North, each ship its own way in the Forbidden Fleets. Each is balanced when it is
built, and its currency and terms come with the system that pays them.

## Where a ship lives

A ship has one id, unique across all lines (`sloop`), and the same `<line>/<id>` path everywhere:

| What                     | Where                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Model (outside the repo) | `blender-assets/ships/<line>/<id>/`: `<id>.blend`, `build.py`, its own `textures/`    |
| Sprite atlases           | `public/sprites/ships/<line>/<id>/[<look>/]<stage>.{webp,json}`, one per damage stage |
| Size, speed and handling | `SHIP_CLASSES` in `src/game/ships/shipClasses.ts`                                     |
| Gun slots, starting guns | `slots`, `startingGuns` of its entry in `SHIP_CLASSES`                                |
| Talent tree              | `TALENT_TREES` in `src/game/ships/talentTrees.ts`                                     |
| Which atlases exist      | `ART` in `src/client/scene/models/ShipSprite.ts` (stages, looks)                      |
| Fire and smoke points    | `EMITTERS` in `src/client/scene/effects/ShipFire.ts`                                  |

`<stage>` is one of `DAMAGE_STAGES`: `intact`, `minor`, `heavy`, `burning`, `sinking`.
Only `intact` is required; a missing stage shows the nearest one before it. `<look>` is there only for a ship with
several looks (the bots' fishing boat and merchant sloop): a folder of atlases for each. An animated ship's atlas holds
every frame of its animations from every direction (see the turtle below).

## Adding a ship

1. **Model.** Make `blender-assets/ships/<line>/<id>/` with `<id>.blend` and a `build.py` (start from a copy of
   `ships/starter/sloop/build.py`; shared scanned textures are in `blender-assets/textures/`). Bow to +X, waterline at Z = 0,
   1 Blender unit = 1 game unit.
2. **Sprites.** With the `.blend` open in Blender, run `render_stages.py` (all damage stages) or `render_sprites.py`
   (the current one) from the `blender-assets` root. The atlases land in `public/sprites/ships/<line>/<id>/` by themselves.
3. **Game.** A planned ship has its id in `LineShipId` and its row in `PLANNED` (`src/game/ships/shipLines.ts`): add
   the id to `ShipClassId` and take its row out of `PLANNED` (its figures are where its class's start; the shipyard
   then shows the class's). Then an entry in `SHIP_CLASSES`:
   `line`, `tier`, `name`, `radius` (rough size for effects, about half the hull length), `hull` (what it collides with:
   how far the hull reaches to the bow and stern and its half beam, measured on the model), `viewRange` (the fog of war's edge),
   `maxSpeed` (intact) and `minSpeed` (hull nearly
   gone; damage slows the ship between them), handling, `hp` (hull points), and `slots`: per weapon, the places its
   guns go and where their shots leave the ship, in the model's coordinates with y negated (y to starboard); cannons
   are run out on the side facing the target, so a cannon slot is a place along the side. How many slots a ship has is
   balance, not the model's ports: the model is a likeness (a tier 5 ship may carry fifty guns, its model far fewer
   ports), and slots beyond its ports go anywhere along the side. `startingGuns` says which
   slots have a gun when the ship is new, from the first: `UNARMED` for a ship the shipyard sells, which comes with none
   (a bot's hull has its kind's guns); `hold` its places for cargo. A line's ship takes `...lineTier(tier)` for its
   `tier`, `maxLevel` (the last level it reaches: ten a tier) and `abilities`; a bot's has its `tier` and `...BOT_HULL`. A ship of the European line keeps to its ladder (the comment over
   the Royal Herald, `coastalBark`): a fight of 20–30 s between two of a tier, and each tier beats two of the tier below. Its `name` is English, in `src/client/i18n/uk.ts`
   and `ru.ts` (a planned ship's is already there). The shipyard sells it once it is built: a ship of a
   line in `LADDER_LINES` (`src/game/economy/shipyard.ts`) by its tier's `TIER_TERMS` (a price, a level, the
   story), the same for every line, to a player sailing its line's ship of the tier below (after the starter sloop, a
   tier 1 ship of any of them). The Forbidden Fleets' ships and the masterworks are got their own ways (`OBTAIN`,
   `src/game/ships/shipLines.ts`), which the shipyard only shows for now. A class renamed goes in `RENAMED_CLASSES` (`src/game/save.ts`), so a save keeps it.
   Its talent tree goes in `TALENT_TREES` (`src/game/ships/talentTrees.ts`): as long and tangled as its tier asks (the
   trees of the same tier of the European line show how), every row reachable, more ranks than its points at its last
   level; its talents' names and branches in `uk.ts` and `ru.ts`.
4. **Client.** Add the class to `ART` (the stages it has atlases for, and its looks if it has several) and to
   `EMITTERS` (where it burns, in the model's coordinates with y negated, in units of the sloop's size: times
   9 / the class's `radius`).
5. Run `npm run format` and `npm run check`, look at every damage stage with the HUD's debug buttons, and commit the atlases
   together with the code.

## Bots' hulls

The bots (`src/game/bots/botKinds.ts`) sail hulls of their own, in `SHIP_CLASSES` too: the lines `bots` (fishing boat,
merchant sloop, smuggler sloop, and the Smuggler Baron's brig, a boss: two masts in its look's `foremast`, a mortar in
its class's `barrage`) and `monsters` (giant turtle, sea serpent — creatures, with `bite` jaws instead of gun
slots; and the Inkmother, a squid, the starting waters' mini-boss, with its own ways of fighting in its class's
`skills` (`combat/monsterSkills.ts`: a dive, ink, a brood), and its brood, the inkling, both vector-drawn in
`monster3d.ts` till they are modelled). The jackal cutter (`jackalCutter`, line `bots`) sails in packs of four (the starting waters' jackals and
every sea's pack): a small two-masted cutter under rust-red lateen sails with a swivel gun on its rail, vector-drawn
in `botShip3d.ts` till it is modelled; its model goes to `blender-assets/ships/bots/jackalCutter/`, its hull
(`bow` 12, `stern` −11, `halfBeam` 4.4) and gun slot measured on it.

The bots' ships are Blender models with atlases, like the players' ships, in `blender-assets/ships/bots/`: the
fishing boat in three looks (`nets`, `barrels`, `pots`), the merchant sloop in two (`crates`, `bales`), the smuggler
sloop in one, and the Smuggler Baron's (`baronBrig`): the smuggler's ship made bigger to his hull, with red sails, two
guns a side and his mortar. The sloops share their builder, `ships/bots/bot_sloop.py`, each folder's `build.py` giving
its hull, rig, guns and looks (the Baron's takes the smuggler's and stretches it). A bot's look is its id modulo the number of looks. The client draws each bot in
sight with a sprite of its own (`client/scene/models/BotSprites.ts`), with its fire, its wreck going down as its
`sinking` atlas; until its atlases load, it is drawn as its vector model.

The giant turtle is a Blender model too (`blender-assets/ships/monsters/seaTurtle/`), and animated: its head, jaw,
neck and flippers hang on keyframed empties ("joints"), and its atlases hold a `swim` loop and a `bite` from every
direction (`ANIMATIONS` in its `build.py`; the dead turtle, belly up, one still frame). The client plays them
(`BotSprite`). The sea serpent (`blender-assets/ships/monsters/seaSerpent/`) bends along the way it swam, so it isn't
one picture: its atlases hold its parts from every direction (`head`, swimming, and `bite`, animated; a `segment` of
the body, the same with a `fin` and with a `harpoon` in it, and the `tail`), and the client lays them along its body
(`client/scene/models/SerpentSprite.ts`, the body's wave from `serpent3d.ts`), scaled to its thickness. Until their
atlases load the monsters are vector models (`serpent3d.ts`, `turtle3d.ts`, which also draw their water), and so are
the bots' ships (`client/scene/models/botShip3d.ts`, a look per class in `LOOKS`, which also gives every bot ship's
height for its hit point bar). A bot's `hull` matches its model's deck outline. To add a bot: a class
here, a model with atlases (or a vector look), and a kind in `BOT_KINDS`.
