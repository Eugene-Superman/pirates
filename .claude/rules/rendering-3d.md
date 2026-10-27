---
paths:
  - 'src/client/**'
---

# Client and rendering (`src/client/`)

## Folders

- `render/` — the 3D engine (`Camera3D`, `Painter3D`). It knows nothing about ships or islands: no imports from `game/` or `scene/`.
  `gpu.ts` asks, before the `Application` is made, whether the processor draws the game in software: then `main.ts`
  turns smoothing off and lowers the resolution, and the HUD warns under the FPS.
- `scene/models/` — how game objects look: `draw*(painter, object, time)` functions that only read game data.
  The exceptions are Pixi `Sprite`s from pictures rendered in Blender (see "Ship sprite" below): `ShipSprite` (a
  ship, the player's or a bot's), `BotSprites.ts` (a sprite and its fire per bot in sight; the turtle's swims and
  bites), `SerpentSprite.ts` (a serpent's pieces laid along its body), `ChestSprites.ts` (the floating loot) and
  `PortSprites.ts` (the port from its pictures, `public/sprites/port/`: the ground under the ships, the rest in slices
  sorted with them by `port.json`'s points; a lamp and flags drawn over them when it has them) and `IslandSprites.ts`
  (the islands from their paintings, `public/sprites/islands/`: each in slices sorted with the ships by
  `islands.json`'s points, and its shallows, a small picture of a smooth fade stretched under them; a painting is an
  island's whose centre it gives).
  Until their atlases load, the bots' ships (`botShip3d.ts`, a look per class), the sea monsters (`serpent3d.ts`,
  `turtle3d.ts`), the chests (`chest3d.ts`), the port (`port3d.ts`, its island drawn as an island) and the islands
  (`island3d.ts`, also those with no painting) are drawn as vector models; those files also draw the monsters' and
  chests' water. A painting is never stretched onto its island: the island takes the painting's beach as its coast
  (`paintedCoasts.json` in `game/world/`), so what ships run into is drawn.
- `scene/effects/` — client-only decorations with their own state (foam, target marker, ship fire and smoke,
  the sinking animation, shot effects, the sea surface, the fog of war, bots' wrecks, serpents' trails, the repair,
  a level reached, a boss's barrage marks). They may use `Math.random`.
- `scene/cameraControl.ts` — how the camera keeps up with the ship (follow / dead zone / recenter), switched in the HUD.
- `hud/` — screen-space Pixi `Text`/`Container`, not projected; `ui.ts` holds the shared colors, `Tile` (a clickable
  rectangle), `show`/`tint` (change a `Text` only when the value changes), `clip` (a line cut short with an ellipsis)
  and `HudWindow` (a window over the game: the dim behind it, its panel, Close, Escape, scaled to fit the screen; in
  the `WindowLook` it is given). `theme.ts` is the windows' theme, dark wood under a brass frame: its
  panel, `BRASS` tiles (a `TileStyle`), cards, icon slots, meters (`drawMeter`), wells (`drawWell`) and
  `THEMED_WINDOW`; the port's windows, every `HudWindow`, the chat (`ChatPanel`) and the plates and tracker at the top
  (`UnitFrames`, `QuestTracker`, a HUD plate being `themedPanel` with smaller brackets) wear it. A text in a panel of a
  fixed width wraps (`wordWrap`, or `CanvasTextMetrics` for the chat's lines): nothing runs out over its edge. `iconAtlas.ts` loads the items' painted icons (`public/sprites/icons/`) the first time a window asks,
  and the minimap's buttons and the skill bar's skills (`public/sprites/hud/`).
  `input/` — turns pointer and key events into game method calls; the unit picked out with a click (`selection.ts`)
  is client state, which the game only hears of when the player attacks it. The HUD windows that Escape closes (the
  sea chart, the statistics, the captain's mastery, the hold, the talents, the loadout, the port with an item's window
  over it, the settings; and over them all the question before what can't be undone, one `ConfirmDialog` for the
  whole HUD, the port's included)
  listen on `window` in the order the HUD makes them, top-most first and all before `keyboardInput` is bound; each
  skips an Escape already `defaultPrevented` and calls `preventDefault` when it acted, so one press closes only the
  top window, and Escape reaches the ship only when no window was open.
- `storage/Store.ts` — the browser's memory until there is a server: the progress (`game.save()`), the settings, the
  quest tracker's folds, the combat log and the language, by key. IndexedDB, else localStorage, else memory alone; read once at the start, written
  a moment after a change and at once when the page is hidden; `written()` waits for a write before the page reloads
  (a new language). A new game (`clear()`) keeps the language. A part that keeps one thing gets a `Slot`.
- Game logic is imported only from `game/index.ts` (`'../../game'`); Oxlint rejects deep imports into `game/`.

## Texts and languages (`i18n/`)

- Every text a player reads is English in the code and goes through `t()` (`i18n/i18n.ts`): the English text is the
  key of the dictionaries `uk.ts` and `ru.ts`, and a text missing from the picked one stays English (in development
  the console names it once). A new text needs its entry in both.
- `{name}` is filled from `t()`'s parameters. Where a translation starts a sentence with the parameter, it uses a
  capitalised one (`{Name}`, `{Weapon}`): the call passes both forms.
- A text with forms by count is written `one|many` in English and `one|few|many` in a dictionary, picked by `n`.
- The game's data texts (ship, gun, ammo, goods, outfit, quest and talent names and texts) are English in `game/` and
  translated where the client shows them, with the same dictionaries.
- Texts are put together when the HUD is made, so `t()` is never called at module load, before `setLang`; a new
  language reloads the page.

## How it works

- **`SceneView`** is the only scene: classic 2:1 isometric (parallel projection, pitch 30°, yaw 45°).
- Immediate mode: `scene.clear()` and a full redraw every frame via `Painter3D`.
  Everything in the scene is drawn **only through `Painter3D`**, never directly into `Graphics` (otherwise there is no projection or lighting).
  The exceptions are things projected elsewhere: the sprites of ships, monsters and chests with their water masks,
  the port's pictures (`PortSprites`), the islands' paintings (`IslandSprites`), the fog puffs (`FogClouds`) and the sky's clouds and their shadows
  (`SkyClouds`), all made for this camera; the four shader
  meshes (`seaSurface.ts`, `fogOfWar.ts`, `Wake.ts`, the water round a wreck in `Sinking.ts`), whose vertices are
  projected with `Camera3D` every frame; and what stays the same size at every zoom, drawn in screen pixels at a
  projected point: the units' hit point bars (`SceneView.drawHpBars`) and the damage numbers (`DamageNumbers`).
- No perspective: sizes don't depend on distance, line widths are `width * camera.zoom`.
- `camera.zoom` changes at runtime: the HUD's zoom buttons call `SceneView.setZoom`, and `update` eases the camera towards it.
  Read `camera.zoom` every frame; never cache it or anything derived from it.

## Coordinate systems

| Space                      | x           | y                 | z                                 |
| -------------------------- | ----------- | ----------------- | --------------------------------- |
| World                      | east        | south             | up from water                     |
| Ship (`ShipFire` emitters) | towards bow | towards starboard | up from the waterline             |
| Camera (`Camera3D`)        | right       | up the screen     | into the screen, larger = farther |

- `Vec3` is a `readonly [x, y, z]` tuple in world coordinates.
- `CameraConfig.pitch` / `yaw` are in **degrees** (90 = straight down, yaw 0 = north at the top). Camera direction is fixed after construction.
- `screenToGround` maps a screen point to the water plane (`z = 0`); it always returns a point.
- Ship-local points are turned into world space by the ship's `rotation`, raised by `shipBob(time)` and lowered by the
  sinking depth. The Blender models' y points to port, so their y is negated.

## Draw order (painter's algorithm)

There is no z-buffer, so order is everything. In `SceneView.update`:

1. Background: the renderer clears the screen to the sea's flat `SEA_COLOR` (`seaLook.ts`); the sea surface mesh
   covers it once all its maps have loaded.
2. Everything flat on the water (`z = 0`): wakes and the water round a wreck (shader meshes in layers of their own,
   under the islands' see-through shallows) → the painted islands' shallows (`IslandSprites.shallows`, sprites under
   `scene`) → the port's ground picture, once loaded (a sprite under `scene`, in place of its island's ground) → a
   vector-drawn island's "ground" (shallows, sand, cliff shadows) → world border → range rings (the
   picked weapon's shortest and longest reach, dashed, running round) → units' water (a serpent's body under the surface,
   a turtle's) → bubbles over bots' wrecks → chests' foam rings → repair rings → the level-up's glow and rings → the
   target lock ring, then the selection ring → shot ripples → a boss's barrage marks (`BarrageMarks`) → projectile
   shadows → target marker (where the ship can see; beyond, it goes over the fog, see below).
   There is no drawn ship shadow: it is baked into the sprite.
3. Volumetric objects (islands' hills and palms, or the slices of their paintings (`IslandSprites`), bots' ships and
   monsters, bots' wrecks going down, chests, the port's
   pictures' slices (`PortSprites`), or until they load its walls (in lengths of `WALL_STEP`), quay, houses,
   lighthouse and flag (`portPieces`), projectiles, and the player's ship) — `SceneObject`s (`sceneObjects.ts`) sorted
   by `painter.depth(...)` **from far to near**.
   The player's ship goes between them by `shipDepth`, a point `ship.radius` above the water.
4. Parts within an object are also sorted by depth (island hill and palms).

Add a new volumetric object to the `objects` array with `depth` and `draw(painter)` (or its sprite's `layers`); don't
draw it separately after sorting.

A sprite can't go inside a `Graphics`, so the scene is layers in `container`, bottom to top:
sea surface mesh → wake mesh → wreck water mesh → `layers` → the sky clouds' shadows → fog of war mesh (haze and
mist) → fog puffs → `markerLayer` (the target marker where the ship can't see) → the sky's clouds → `overlay` (the
navigation debug drawings) → `hpBars` (the units' hit point bars, with a red border on a bot hostile to the player) →
the damage numbers, over everything.
`layers` holds the painted islands' shallows and the port's ground picture (once loaded), then the sorted objects: `scene` (flat things and the objects
farther than the first sprite), then for each sprite far to near its own layers (a ship: its sprite, its `waterMask`,
its fire over it; a serpent: its pieces; a slice of the port's pictures or of an island's) and a `Graphics` segment of the vector-drawn
objects between it and the next sprite, opened only when there are some (`drawLayers`, segments reused frame to
frame). The player's ship's layers end with `fireLayer`: flames, then smoke, then shot effects nearer than the ship,
the repair's crosses, the level-up's light and the barrage's falling shells.
The fog lies over everything on the water, so beyond the view the islands, the port and the wakes are hazed like the
sea; units inside the fog are not drawn at all. The sky's clouds (`SkyClouds`) drift over it all, high above the
sea, their shadows over everything under the fog.
`draw` receives the painter of its layer — draw with it, not with `this.painter`. Nothing is drawn for a sprite until
its `intact` atlas has loaded (the vector model stands in for a bot, a monster or a chest).

## Ship sprite (`models/ShipSprite.ts`)

- One atlas per ship class (and look) and damage stage: `public/sprites/ships/<line>/<id>/[<look>/]<stage>.{webp,json}`
  (see `docs/ships.md`); the floating loot's are `public/sprites/loot/chest/<look>/intact.{webp,json}`.
  They are rendered in Blender by `render_stages.py` / `render_sprites.py`, whose source lives outside this repo (see the
  camera paragraph in `CLAUDE.md`): 64 directions, frame `i` = ship rotation `i * 360 / 64` degrees.
  `meta.ship` holds `pxPerUnit` (atlas pixels per world unit) and the camera `pitch`/`yaw`; an animated atlas also its
  `directions` and `animations` (frames, fps, loop for each).
- A still atlas names its frames `ship_00…ship_63`; an animated one has a clip per animation, its frames
  `<clip>_<frame>_<direction>` (`swim_00_00`). Each atlas is loaded with its URL as `cachePrefix`; without it the
  atlases overwrite each other's textures in Pixi's cache. `frameOf` picks the frame for a heading and a `SpriteMotion`
  (a clip and how far into it); without one, the atlas's still: its `ship` clip, or its first.
- `ART` lists the stages a class has atlases for, and its looks when it has several (a bot's look is its id modulo
  their number). A stage without one (or not loaded yet) shows the nearest earlier stage in `DAMAGE_STAGES`. A
  folder's `Atlases` are shared by every sprite drawn from it: `intact` and `sinking` load at once, the other stages
  the first time they are shown (a monster's are megabytes each).
- It matches `CAMERA` only: a different pitch or yaw needs a re-render from that source. Scale is `camera.zoom / pxPerUnit`.
- The anchor is the ship's centre on the waterline; the sprite bobs with `shipBob` but doesn't heel in turns.
  `shipBob` is exported so effects on the ship move with it; a bot's bobs at a phase of its own (`BOB_PHASE` × id, `BotSprites.ts`).
- The baked shadow lies on the water plane, so it is drawn over islands farther than the ship instead of being hidden by them.

## Damage effects (`effects/Sinking.ts`, `effects/ShipFire.ts`)

- The game only provides `health` and `damageStage`; how damage looks is client state, owned by `SceneView` and updated
  before drawing: `Sinking` first (it produces the `SinkPose`), then `ShipFire`, which reads that pose. `Sinking` is
  for the player's ship; a sunk bot goes down in `Wrecks` (see "Bots, wrecks and the repair"). Every `BotSprite` has
  a `ShipFire` of its own, drawn on its `over` layer, which burns on while its wreck goes down.
- `Sinking` starts when the stage becomes `sinking` and resets when it leaves it. Its `pose` (depth, tilt, alpha) moves the
  sprite down, and `ShipSprite.waterMask` hides the part below the near half of the hull's waterline.
  The mask must stay in the display list and visible (Pixi skips an invisible mask, which hides the whole sprite),
  and is detached and cleared while the ship is afloat, or it would draw as a plain white shape.
- `Sinking.water` is the water round the wreck: a grid on the water round the ship whose shader works out the churn,
  the ring waves the hull sends out and the bubbles from each pixel's place relative to the hull. It fades out at the
  coasts like the wake (`waterShare`) and lasts `WATER_TIME` after the ship is gone.
- `ShipFire`: smoke from `heavy`, flames and smoke at `burning` and `sinking`, spawned at the class's `EMITTERS`
  (in units of the sloop's size, scaled to the class's `radius`; a class without them doesn't burn). Fixed particle
  pools reused round-robin. Normal blending, not additive: additive light over the pale sail
  and the blue sea turns white and cyan.

## `Painter3D` primitives

- `polygon` — the base one: projection only, no lighting.
- `top` — horizontal upward-facing surface (deck, plateau), lit.
- `sides(bottom, top)` — side walls between two outlines; only camera-facing faces are drawn, already sorted.
- `surface` — thin two-sided surface (sail, flag); the normal is flipped towards the camera.
- `line`, `curve`, `disc`, `ring`, `dashedRing` — width, radius and dashes are in world units.
- `ball` — a circle around a projected point that looks the same from any side (smoke puff, flame); radius in world units.
- Shadows: `shadowPoint(p, groundZ)` projects a point along `LIGHT` onto a plane; draw the shadow as a black `polygon` with `SHADOW_ALPHA`.
- Boxes: `footprint(x, y, z, along, across, angle)` gives a turned rectangle's corners at height `z`, for `sides` and `top`.
- Color: `shade(color, k)` changes brightness. The sun (`LIGHT`) shines from the west, from high above.

## Wakes (`effects/Wake.ts`, `effects/foam.ts`)

- Owned and updated by `SceneView` (it is view state, not game state), before drawing. Everything that sails near
  enough to be seen soon (the player's ship, other ships within its view range plus `NEAR_MARGIN`) is
  a `Body` with a trail: a fixed ring of `TRAIL_POINTS` points where it has been. A body missing from the list passed
  to `update` is gone (or too far), and its wake fades where it was.
- Drawn as ribbons of one mesh with its own shader: the wash behind the stern, and two bow waves running off at the
  Kelvin angle. The ribbons are rebuilt every frame by writing straight into typed arrays, with no objects per point,
  and only the part filled goes to the GPU. Widths are in the hull's half beam, so a wake fits every hull.
- Wakes fade out into the fog beyond the ship's view range, and at the coasts (`waterShare`, given only the islands
  on the screen: it is worked out per point).
- `foam.ts` holds what the wake and the wreck's water share: the foam texture (`loadFoam`), its colors, the shader
  functions `fresnel`, `over` and `dissolve` (`FOAM_GLSL`), and `waterShare`.

## Sea and fog shaders (`effects/seaSurface.ts`, `effects/fogOfWar.ts`)

- Each is one `Mesh` with its own GLSL shader (WebGL only, Pixi's default renderer). The vertices carry their screen
  position and their spot on the water, so the textures stay fixed to the water whatever the camera does.
- Texture origins are moved by whole tiles to near the camera (sea) or the ship (fog): far from 0 a float can't tell
  the texture's pixels apart.
- The sea's look is one set of numbers, `SEA_LOOK` in `seaLook.ts`: three wave layers over the `swell` and `ripples`
  maps, a `chop` where gusts blow with whitecaps frayed by the wakes' foam, two layers of `caustics` (light on the
  floor of the shallows), and the broad `patches` of deeper and shallower water, cloud shadows and gusts. The fog starts at
  `ship.viewRange`; hiding its layers in the HUD changes only the picture, never what the ship can see or shoot
  (`ship.canSee` in the game).

## Shot effects (`effects/ShotEffects.ts`)

- Animates the game's `state.events` (shots, impacts, bites, destroyed units, a boss's mortar firing and its shells
  landing) and cannonball trails. Fixed pools reused round-robin. Effects farther than the ship go to the layer right
  under its sprite, nearer ones to `fireLayer`.
- A shot flashes at every muzzle of the volley, `MAX_MUZZLES` at most. A bite throws up spray and splinters, and
  `lunge(id, time)` darts the monster's head forward; `shake(id, time)` rocks whatever was hit. The player's own ship
  going down is `Sinking`'s, not a splash here.
- The `damage` and `repair` events are `DamageNumbers`': a number floating up over the unit, styled by how the volley
  or bite went (full, a critical hit, the wrong weapon for the target, a miss), red when the player's own ship is hit,
  green for a repair step (with its gold cost), gold for gold paid (a bounty over the wreck, a chest or a quest over
  the ship); for the player's ship also the experience earned, a level reached, an ability used, goods hauled aboard
  and a full hold. A fixed pool of `Text` objects reused round-robin. `LevelUpEffect` is the level's light round the
  ship; `BarrageMarks` the spots a boss's shells will land on (`state.shells`), red rings filling in as they come down.

## Bots, wrecks and the repair (`effects/Wrecks.ts`, `effects/Trails.ts`, `effects/RepairEffect.ts`)

- Bots are drawn only within the player's view range and on screen; a ship's bar of hit points sits over its mast
  (`botShipTop`).
- The game takes a sunk bot out at once, so `Wrecks` keeps its last pose from the `destroyed` event (and a serpent's
  body as last drawn) and lowers it into the sea, the water boiling over it a while longer: a ship or the turtle as
  its sprite (its `sinking` atlas, burning a while, the part under water masked), a serpent as its pieces, the rest
  as their models.
- `Trails` records where each serpent's head has been: the game knows only its position and heading, so its body
  (`serpent3d.ts`, `SPINE`) is laid along the way it swam.
- `RepairEffect`: green crosses rising off a ship under repair, and a ring on the water at every repair step. Both
  follow the ship, which may sail on while it is repaired.

## Performance

- The HUD shows FPS and the longest frame over the last half second — use it after rendering changes.
- Cull invisible things with `painter.isVisible(x, y, z, radius)` before drawing (as done for islands, chests and the port).
- Shape count per frame is the main cost: don't raise model detail (coastline segments), particle pools and spawn rates
  (`ShipFire`, `ShotEffects`) or the wake's trail length (`Wake`) without need.
