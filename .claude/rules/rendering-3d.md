---
paths:
  - 'src/client/**'
---

# Client and rendering (`src/client/`)

## Folders

- `render/` — the 3D engine (`Camera3D`, `Painter3D`). It knows nothing about ships or islands: no imports from `game/` or `scene/`.
- `scene/models/` — how game objects look: `draw*(painter, object, time)` functions that only read game data.
  `ShipSprite` and `IslandSprites` are the exceptions: Pixi `Sprite`s from pictures rendered in Blender (see "Ship sprite" below).
  Only the player's ship has a sprite; the bots' ships (`botShip3d.ts`, a look per class) and the sea monsters
  (`serpent3d.ts`, `turtle3d.ts`) are vector models.
- `scene/effects/` — client-only decorations with their own state (foam, waves, target marker, ship fire and smoke,
  the sinking animation, shot effects, the sea surface, the fog of war, bots' wrecks, serpents' trails, the repair).
  They may use `Math.random`.
- `scene/cameraControl.ts` — how the camera keeps up with the ship (follow / dead zone / recenter), switched in the HUD.
- `hud/` — screen-space Pixi `Text`/`Container`, not projected; `ui.ts` holds the shared colors, `Tile` (a clickable
  rectangle) and `show`/`tint` (change a `Text` only when the value changes). `input/` — turns pointer and key events
  into game method calls; the unit picked out with a click (`selection.ts`) is client state, which the game only hears
  of when the player attacks it.
- Game logic is imported only from `game/index.ts` (`'../../game'`); Oxlint rejects deep imports into `game/`.

## How it works

- **`SceneView`** is the only scene: classic 2:1 isometric (parallel projection, pitch 30°, yaw 45°).
- Immediate mode: `scene.clear()` and a full redraw every frame via `Painter3D`.
  Everything in the scene is drawn **only through `Painter3D`**, never directly into `Graphics` (otherwise there is no projection or lighting).
  The exceptions are things projected elsewhere: the ship sprite and its water mask, the island pictures (`IslandSprites`)
  and fog puffs (`FogClouds`), all rendered in Blender for this camera; the four shader meshes (`seaSurface.ts`,
  `fogOfWar.ts`, `Wake.ts`, the water round a wreck in `Sinking.ts`), whose vertices are projected with `Camera3D`
  every frame; and what stays the same size at every zoom, drawn in screen pixels at a projected point: the units'
  hit point bars (`SceneView.drawHpBars`) and the damage numbers (`DamageNumbers`).
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

1. Background: the renderer clears the screen to the sea style's flat `color` (`SceneView.setSeaStyle`); the sea surface
   mesh covers it once its maps have loaded (the Classic style has no surface).
2. Everything flat on the water (`z = 0`): wave strokes (only styles with `arcs`, in their own `sea` layer) → wakes and
   the water round a wreck (shader meshes in layers of their own, over the island ground pictures) → island "ground"
   (shallows, sand, cliff shadows; low-poly look) → world border → range rings (each weapon's longest reach) → units'
   water (the barrel's foam, a serpent's body under the surface, a turtle's) → bubbles over bots' wrecks → repair rings
   → the target lock ring, then the selection ring → shot ripples → projectile shadows → target marker.
   There is no drawn ship shadow: it is baked into the sprite.
3. Volumetric objects (low-poly islands, targets, bots' ships and monsters, bots' wrecks going down, projectiles) —
   sorted by `painter.depth(...)` **from far to near**.
   The ship sprite goes between them by `shipDepth`, a point `ship.radius` above the water. A textured island's raised
   picture goes to the far or near island layer by `SceneView.islandInFront`.
4. Parts within an object are also sorted by depth (island hill and palms).

Add a new volumetric object to the `objects` array with `depth` and `draw(painter)`; don't draw it separately after sorting.

A sprite can't go inside a `Graphics`, so the scene is layers in `container`, bottom to top:
sea surface mesh → `sea` (wave strokes) → fog of war mesh (haze and mist) → fog puffs → island ground pictures →
wake mesh → wreck water mesh → `scene` (flat things and objects farther than the ship) → far island pictures → ship
sprite → its `waterMask` → `fireLayer` (flames, then smoke, then shot effects nearer than the ship, then the repair's
crosses) → near island pictures → `front` (objects nearer than the ship, drawn with `frontPainter`; the navigation
debug drawings last) → `hpBars` (the units' hit point bars, with a red border on a bot hostile to the player) → the
damage numbers, over everything.
The fog lies under the islands, so islands stay clear of it; units inside the fog are not drawn at all.
Known limit: an object in `scene` stays under the far island pictures even where it is nearer than the island.
`draw` receives the painter of its layer — draw with it, not with `this.painter`. Nothing is drawn for the ship until its
`intact` atlas has loaded.

## Ship sprite (`models/ShipSprite.ts`)

- One atlas per ship class and damage stage: `public/sprites/ships/<line>/<id>/<stage>.{webp,json}` (see `docs/ships.md`).
  They are rendered in Blender by `render_stages.py` / `render_sprites.py`, whose source lives outside this repo (see the
  camera paragraph in `CLAUDE.md`): 64 directions, frame `i` = ship rotation `i * 360 / 64` degrees.
  `meta.ship` holds `pxPerUnit` (atlas pixels per world unit) and the camera `pitch`/`yaw`.
- Every atlas names its frames `ship_00…ship_63`, so each is loaded with its URL as `cachePrefix`; without it the atlases
  overwrite each other's textures in Pixi's cache.
- `ATLAS_STAGES` lists the stages a class has atlases for. A stage without one (or not loaded yet) shows the nearest
  earlier stage in `DAMAGE_STAGES`. The bots' classes have none: they are vector models.
- It matches `CAMERA` only: a different pitch or yaw needs a re-render from that source. Scale is `camera.zoom / pxPerUnit`.
- The anchor is the ship's centre on the waterline; the sprite bobs with `shipBob` but doesn't heel in turns.
  `shipBob` is exported so effects on the ship move with it.
- The baked shadow lies on the water plane, so it is drawn over islands farther than the ship instead of being hidden by them.

## Damage effects (`effects/Sinking.ts`, `effects/ShipFire.ts`)

- The game only provides `health` and `damageStage`; how damage looks is client state, owned by `SceneView` and updated
  before drawing: `Sinking` first (it produces the `SinkPose`), then `ShipFire`, which reads that pose. Both are for the
  player's ship; a sunk bot goes down in `Wrecks` (see "Bots, wrecks and the repair").
- `Sinking` starts when the stage becomes `sinking` and resets when it leaves it. Its `pose` (depth, tilt, alpha) moves the
  sprite down, and `ShipSprite.waterMask` hides the part below the near half of the hull's waterline.
  The mask must stay in the display list and visible (Pixi skips an invisible mask, which hides the whole sprite),
  and is detached and cleared while the ship is afloat, or it would draw as a plain white shape.
- `Sinking.water` is the water round the wreck: a grid on the water round the ship whose shader works out the churn,
  the ring waves the hull sends out and the bubbles from each pixel's place relative to the hull. It fades out at the
  coasts like the wake (`waterShare`) and lasts `WATER_TIME` after the ship is gone.
- `ShipFire`: smoke from `heavy`, flames and smoke at `burning` and `sinking`, spawned at the class's `EMITTERS`
  (classes with a sprite only). Fixed particle pools reused round-robin. Normal blending, not additive: additive light over the pale sail
  and the blue sea turns white and cyan.

## `Painter3D` primitives

- `polygon` — the base one: projection only, no lighting.
- `top` — horizontal upward-facing surface (deck, plateau), lit.
- `sides(bottom, top)` — side walls between two outlines; only camera-facing faces are drawn, already sorted.
- `surface` — thin two-sided surface (sail, flag); the normal is flipped towards the camera.
- `line`, `curve`, `disc`, `ring` — width and radius are in world units.
- `ball` — a circle around a projected point that looks the same from any side (smoke puff, flame); radius in world units.
- Shadows: `shadowPoint(p, groundZ)` projects a point along `LIGHT` onto a plane; draw the shadow as a black `polygon` with `SHADOW_ALPHA`.
- Color: `shade(color, k)` changes brightness. The sun (`LIGHT`) shines from the west, from high above.

## Wakes (`effects/Wake.ts`, `effects/foam.ts`)

- Owned and updated by `SceneView` (it is view state, not game state), before drawing. Everything that sails near
  enough to be seen soon (the player's ship, other ships within its view range plus `NEAR_MARGIN`, targets afloat) is
  a `Body` with a trail: a fixed ring of `TRAIL_POINTS` points where it has been. A body missing from the list passed
  to `update` is gone (or too far), and its wake fades where it was.
- Drawn as ribbons of one mesh with its own shader: the wash behind the stern, and two bow waves running off at the
  Kelvin angle. The ribbons are rebuilt every frame by writing straight into typed arrays, with no objects per point,
  and only the part filled goes to the GPU. Widths are in the hull's half beam, so a wake fits every hull.
- Wakes fade out into the fog beyond the ship's view range, and at the coasts (`waterShare`).
- `foam.ts` holds what the wake and the wreck's water share: the foam texture (`loadFoam`), its colors, the shader
  functions `fresnel`, `over` and `dissolve` (`FOAM_GLSL`), and `waterShare`.

## Waves (`effects/waves.ts`)

- 1200 waves generated once with `createRandom(1)`, so they are identical on every run. Culled with `isVisible` every frame.
  Drawn only for sea styles with `arcs`, in that style's color.

## Sea and fog shaders (`effects/seaSurface.ts`, `effects/fogOfWar.ts`)

- Each is one `Mesh` with its own GLSL shader (WebGL only, Pixi's default renderer). The vertices carry their screen
  position and their spot on the water, so the textures stay fixed to the water whatever the camera does.
- Texture origins are moved by whole tiles to near the camera (sea) or the ship (fog): far from 0 a float can't tell
  the texture's pixels apart.
- Sea looks are data in `seaStyles.ts`. The fog starts at `ship.viewRange`; hiding its layers in the HUD changes only
  the picture, never what the ship can see or shoot (`ship.canSee` in the game).

## Shot effects (`effects/ShotEffects.ts`)

- Animates the game's `state.events` (shots, impacts, bites, destroyed units) and cannonball trails. Fixed pools
  reused round-robin. Effects farther than the ship go to `scene`, nearer ones to `fireLayer`.
- A shot flashes at every muzzle of the volley, `MAX_MUZZLES` at most. A bite throws up spray and splinters, and
  `lunge(id, time)` darts the monster's head forward; `shake(id, time)` rocks whatever was hit. The player's own ship
  going down is `Sinking`'s, not a splash here.
- The `damage` and `repair` events are `DamageNumbers`': a number floating up over the unit, styled by how the volley
  or bite went (full, a critical hit, the wrong weapon for the target, a miss), red when the player's own ship is hit,
  green for a repair step. A fixed pool of `Text` objects reused round-robin.

## Bots, wrecks and the repair (`effects/Wrecks.ts`, `effects/Trails.ts`, `effects/RepairEffect.ts`)

- Bots are drawn only within the player's view range and on screen; a ship's bar of hit points sits over its mast
  (`botShipTop`).
- The game takes a sunk bot out at once, so `Wrecks` keeps its last pose from the `destroyed` event (and a serpent's
  body as last drawn) and lowers its model into the sea, the water boiling over it a while longer.
- `Trails` records where each serpent's head has been: the game knows only its position and heading, so its body
  (`serpent3d.ts`, `SPINE`) is laid along the way it swam.
- `RepairEffect`: green crosses rising off a ship under repair, and a ring on the water at every repair step. Both
  follow the ship, which may sail on while it is repaired.

## Performance

- The HUD shows FPS and the longest frame over the last half second — use it after rendering changes.
- Cull invisible things with `painter.isVisible(x, y, z, radius)` before drawing (as done for waves and islands).
- Shape count per frame is the main cost: don't raise model detail (coastline segments), particle pools and spawn rates
  (`ShipFire`, `ShotEffects`) or the wake's trail length (`Wake`) without need.
