---
paths:
  - 'src/client/**'
---

# Client and rendering (`src/client/`)

## Folders

- `render/` — the 3D engine (`Camera3D`, `Painter3D`). It knows nothing about ships or islands: no imports from `game/` or `scene/`.
- `scene/models/` — how game objects look: `draw*(painter, object, time)` functions that only read game data.
  `ShipSprite` is the exception: a Pixi `Sprite` from pre-rendered atlases (see "Ship sprite" below).
- `scene/effects/` — client-only decorations with their own state (foam, waves, target marker, ship fire and smoke,
  the sinking animation). They may use `Math.random`.
- `hud/` — screen-space Pixi `Text`/`Container`, not projected. `input/` — turns pointer events into game method calls.
- Game logic is imported only from `game/index.ts` (`'../../game'`); Oxlint rejects deep imports into `game/`.

## How it works

- **`SceneView`** is the only scene: classic 2:1 isometric (parallel projection, pitch 30°, yaw 45°).
- Immediate mode: `scene.clear()` and a full redraw every frame via `Painter3D`.
  Everything in the scene is drawn **only through `Painter3D`**, never directly into `Graphics` (otherwise there is no projection or lighting).
  The only exceptions are the ship sprite, which is already projected and lit by Blender, and its water mask.
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

1. Background: the renderer clears the screen to `SEA_COLOR` (set in the `SceneView` constructor).
2. Everything flat on the water (`z = 0`): waves → island "ground" (shallows, sand, cliff shadows) → world border → wake foam → sinking foam → target marker.
   There is no drawn ship shadow: it is baked into the sprite.
3. Volumetric objects (islands) — sorted by `painter.depth(...)` **from far to near**. The ship sprite goes between them
   by `shipDepth`, a point `ship.radius` above the water.
4. Parts within an object are also sorted by depth (island hill and palms).

Add a new volumetric object to the `objects` array with `depth` and `draw(painter)`; don't draw it separately after sorting.

A sprite can't go inside a `Graphics`, so the scene is layers in `container`, bottom to top:
`scene` (flat things and objects farther than the ship) → ship sprite → its `waterMask` → `fireLayer` (flames, then smoke)
→ `front` (objects nearer than the ship, drawn with `frontPainter`).
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
  earlier stage in `DAMAGE_STAGES`.
- It matches `CAMERA` only: a different pitch or yaw needs a re-render from that source. Scale is `camera.zoom / pxPerUnit`.
- The anchor is the ship's centre on the waterline; the sprite bobs with `shipBob` but doesn't heel in turns.
  `shipBob` is exported so effects on the ship move with it.
- The baked shadow lies on the water plane, so it is drawn over islands farther than the ship instead of being hidden by them.

## Damage effects (`effects/Sinking.ts`, `effects/ShipFire.ts`)

- The game only provides `health` and `damageStage`; how damage looks is client state, owned by `SceneView` and updated
  before drawing: `Sinking` first (it produces the `SinkPose`), then `ShipFire`, which reads that pose.
- `Sinking` starts when the stage becomes `sinking` and resets when it leaves it. Its `pose` (depth, tilt, alpha) moves the
  sprite down, and `ShipSprite.waterMask` hides the part below the near half of the hull's waterline.
  The mask must stay in the display list and visible (Pixi skips an invisible mask, which hides the whole sprite),
  and is detached and cleared while the ship is afloat, or it would draw as a plain white shape.
- `ShipFire`: smoke from `heavy`, flames and smoke at `burning` and `sinking`, spawned at the class's `EMITTERS`.
  Fixed particle pools reused round-robin, like the wake. Normal blending, not additive: additive light over the pale sail
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

## Foam wake (`effects/Wake.ts`)

- Owned and updated by `SceneView` (it is view state, not game state), before drawing.
- Fixed pool of `POOL_SIZE` particles reused round-robin. No new objects are created during gameplay.
- A particle is "dead" when `life >= WAKE_LIFETIME`; animation progress is `foamProgress(p)` from 0 to 1.
- Offsets and foam size are in ship radii, so the wake fits ships of every size.

## Waves (`effects/waves.ts`)

- 1200 waves generated once with `createRandom(1)`, so they are identical on every run. Culled with `isVisible` every frame.

## Performance

- The HUD shows FPS and the longest frame over the last half second — use it after rendering changes.
- Cull invisible things with `painter.isVisible(x, y, z, radius)` before drawing (as done for waves and islands).
- Shape count per frame is the main cost: don't raise model detail (coastline segments) or particle pools and spawn rates
  (`ShipFire`, `Wake`) without need.
