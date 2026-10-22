# Ships

Every player starts on the **Starter Sloop** (line `starter`). Later ships come in lines: families with their own
style and role, six tiers each. Only the starter line exists in code so far; the rest is the plan.

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

| What                     | Where                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Model (outside the repo) | `blender-assets/ships/<line>/<id>/`: `<id>.blend`, `build.py`, its own `textures/` |
| Sprite atlases           | `public/sprites/ships/<line>/<id>/<stage>.{webp,json}`, one per damage stage       |
| Size and handling        | `SHIP_CLASSES` in `src/game/ships/shipClasses.ts`                                  |
| Which atlases exist      | `ATLAS_STAGES` in `src/client/scene/models/ShipSprite.ts`                          |
| Fire and smoke points    | `EMITTERS` in `src/client/scene/effects/ShipFire.ts`                               |

`<stage>` is one of `DAMAGE_STAGES`: `intact`, `minor`, `heavy`, `burning`, `sinking`.
Only `intact` is required; a missing stage shows the nearest one before it.

## Adding a ship

1. **Model.** Make `blender-assets/ships/<line>/<id>/` with `<id>.blend` and a `build.py` (start from a copy of
   `ships/starter/sloop/build.py`; shared scanned textures are in `blender-assets/textures/`). Bow to +X, waterline at Z = 0,
   1 Blender unit = 1 game unit.
2. **Sprites.** With the `.blend` open in Blender, run `render_stages.py` (all damage stages) or `render_sprites.py`
   (the current one) from the `blender-assets` root. The atlases land in `public/sprites/ships/<line>/<id>/` by themselves.
3. **Game.** Add the id to `ShipClassId` (and the line to `ShipLineId` if it is new), then an entry in `SHIP_CLASSES`:
   `line`, `tier`, `name`, collision `radius` (about half the hull length), handling.
4. **Client.** Add the class to `ATLAS_STAGES` (the stages it has atlases for) and to `EMITTERS` (where it burns,
   in the model's coordinates with y negated).
5. Run `npm run format` and `npm run check`, look at every damage stage with the HUD's debug buttons, and commit the atlases
   together with the code.
