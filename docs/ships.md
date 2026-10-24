# Ships

Every player starts on the **Starter Sloop** (line `starter`). Later ships come in lines: families with their own
style and role, six tiers each. The starter line and the European line's tier 2, the **Corsair** (the goal of the
starting waters, sold at the shipyard once the Captain's path is done), are in code; the rest is the plan. A player
keeps every ship they buy: one sailed, the others laid up in port (`src/game/economy/fleet.ts`). Every ship levels on its own from 1 (the sloop to 10, a tier 2 ship to 20) and has
talents of its own.

## Lines

| Line id (planned) | Line                          | Style                                                                                                      | Role                                                |
| ----------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `starter`         | Starter                       | Small, plain, light                                                                                        | The first ship of every player                      |
| `european`        | Royal Navies                  | Spain, England, France, the Netherlands: classic sailing ships, heavy guns, bronze ornaments, royal crests | All-rounders: balanced guns, speed and hull         |
| `eastern`         | Empires of the East           | China, Japan, Southeast Asia: junks, multi-tier decks, red sails, dragons, lacquered wood                  | Agile and fast, with special abilities              |
| `pirate`          | Brotherhood of the Black Flag | The Caribbean, pirate republics: rebuilt ships, black sails, trophies, uneven hulls, odd weapons           | Heavy broadsides, ambushes, aggressive play         |
| `northern`        | Clans of the Frozen Seas      | Norse myth and northern seas: long hulls, carved beast heads, fur, runes, steel                            | Tough: ramming, defence, strong close-range attacks |
| `legendary`       | Forbidden Fleets              | Supernatural powers, ancient civilisations: ghostly hulls, glowing runes, cursed guns, unusual silhouettes | Unique effects and rare abilities, hard to obtain   |

Paid (premium) ships are undecided.

Tiers 1 → 6:

- **Royal Navies:** Coastal Bark, Corsair, Frigate, Royal Galleon, Admiral, Imperial Ship of the Line
- **Empires of the East:** River Junk, Sea Merchant, Dragon Sentinel, Celestial Frigate, Imperial Junk, Dragon Armada
- **Brotherhood of the Black Flag:** Smuggler, Sea Wolf, Black Corsair, Avenger, Storm Phantom, Lord of the Abyss
- **Clans of the Frozen Seas:** Breaker, Sea Raider, Wolf Ship, Ice Jarl, Storm Petrel, Jörmungandr
- **Forbidden Fleets:** The Forgotten, Cursed Galleon, Soul Reaper, Black Oracle, Sea Devourer, Throne of the Abyss

## Where a ship lives

A ship has one id, unique across all lines (`sloop`), and the same `<line>/<id>` path everywhere:

| What                     | Where                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Model (outside the repo) | `blender-assets/ships/<line>/<id>/`: `<id>.blend`, `build.py`, its own `textures/`    |
| Sprite atlases           | `public/sprites/ships/<line>/<id>/[<look>/]<stage>.{webp,json}`, one per damage stage |
| Size, speed and handling | `SHIP_CLASSES` in `src/game/ships/shipClasses.ts`                                     |
| Gun slots, starting guns | `slots`, `startingGuns` of its entry in `SHIP_CLASSES`                                |
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
3. **Game.** Add the id to `ShipClassId` (and the line to `ShipLineId` if it is new), then an entry in `SHIP_CLASSES`:
   `line`, `tier`, `name`, `radius` (rough size for effects, about half the hull length), `hull` (what it collides with:
   how far the hull reaches to the bow and stern and its half beam, measured on the model), `viewRange` (the fog of war's edge),
   `maxSpeed` (intact) and `minSpeed` (hull nearly
   gone; damage slows the ship between them), handling, `hp` (hull points), and `slots`: per weapon, the places its
   guns go and where their shots leave the ship, in the model's coordinates with y negated (y to starboard); cannons
   are run out on the side facing the target, so a cannon slot is a place along the side. How many slots a ship has is
   balance, not the model's ports: the model is a likeness (a tier 5 ship may carry fifty guns, its model far fewer
   ports), and slots beyond its ports go anywhere along the side. `startingGuns` says which
   slots have a gun when the ship is new; `hold` its places for cargo and `maxLevel` the last level it reaches (10 at
   tier 1, 20 from tier 2; 0 and 1 for a bot's). Its `name` is English: add it to `src/client/i18n/uk.ts` and `ru.ts`.
4. **Client.** Add the class to `ART` (the stages it has atlases for, and its looks if it has several) and to
   `EMITTERS` (where it burns, in the model's coordinates with y negated, in units of the sloop's size: times
   9 / the class's `radius`).
5. Run `npm run format` and `npm run check`, look at every damage stage with the HUD's debug buttons, and commit the atlases
   together with the code.

## Bots' hulls

The bots (`src/game/bots/botKinds.ts`) sail hulls of their own, in `SHIP_CLASSES` too: the lines `bots` (fishing boat,
merchant sloop, smuggler sloop, and the Smuggler Baron's brig, a boss: two masts in its look's `foremast`, a mortar in
its class's `barrage`) and `monsters` (giant turtle, sea serpent — creatures, with `bite` jaws instead of gun
slots).

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
