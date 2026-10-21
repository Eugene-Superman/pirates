---
paths:
  - 'src/client/**'
---

# Client and rendering (`src/client/`)

## Folders

- `render/` — the 3D engine (`Camera3D`, `Painter3D`). It knows nothing about ships or islands: no imports from `game/` or `scene/`.
- `scene/models/` — how game objects look: `draw*(painter, object, time)` functions that only read game data.
  `ShipSprite` is the exception: a Pixi `Sprite` from a pre-rendered atlas (see "Ship sprite" below).
- `scene/effects/` — client-only decorations with their own state (foam, waves, target marker). They may use `Math.random`.
- `hud/` — screen-space Pixi `Text`/`Container`, not projected. `input/` — turns pointer events into game method calls.
- Game logic is imported only from `game/index.ts` (`'../../game'`); Oxlint rejects deep imports into `game/`.

## How it works

- **`SceneView`** is the only scene: classic 2:1 isometric (parallel projection, pitch 30°, yaw 45°).
- Immediate mode: `scene.clear()` and a full redraw every frame via `Painter3D`.
  Everything in the scene is drawn **only through `Painter3D`**, never directly into `Graphics` (otherwise there is no projection or lighting).
  The only exception is the ship sprite, which is already projected and lit by Blender.
- No perspective: sizes don't depend on distance, line widths are `width * camera.zoom`.

## Coordinate systems

| Space               | x           | y                 | z                                 |
| ------------------- | ----------- | ----------------- | --------------------------------- |
| World               | east        | south             | up from water                     |
| Ship (`ship3d.ts`)  | towards bow | towards starboard | up from water                     |
| Camera (`Camera3D`) | right       | up the screen     | into the screen, larger = farther |

- `Vec3` is a `readonly [x, y, z]` tuple in world coordinates.
- `CameraConfig.pitch` / `yaw` are in **degrees** (90 = straight down, yaw 0 = north at the top). Camera direction is fixed after construction.
- `screenToGround` maps a screen point to the water plane (`z = 0`); it always returns a point.
- Ship-local points are converted to world space via `shipTransform` — it also adds bobbing (`shipBob`) and heeling (`roll`).

## Draw order (painter's algorithm)

There is no z-buffer, so order is everything. In `SceneView.update`:

1. Background: the renderer clears the screen to `SEA_COLOR` (set in the `SceneView` constructor).
2. Everything flat on the water (`z = 0`): waves → island "ground" (shallows, sand, cliff shadows) → world border → foam → ship shadow → target marker.
3. Volumetric objects (islands, ship) — sorted by `painter.depth(...)` **from far to near**.
4. Parts within an object are also sorted by depth (ship masts/sails, island hill and palms).

Add a new volumetric object to the `objects` array with `depth` and `draw(painter)`; don't draw it separately after sorting.

With the ship sprite loaded, a sprite can't go inside a `Graphics`, so the scene is three layers in `container`:
`scene` (flat things and objects farther than the ship) → ship sprite → `front` (objects nearer than the ship, drawn with `frontPainter`).
`draw` receives the painter of its layer — draw with it, not with `this.painter`. The ship shadow is baked into the sprite,
so `drawShipShadow` is skipped. While the atlas loads (or if it fails to load), the drawn `ship3d` ship is used as before.

## Ship sprite (`models/ShipSprite.ts`)

- The atlas `public/sprites/ship-iso.{webp,json}` is rendered from `art/ship.blend` by `art/render_sprites.py`: 64 directions,
  frame `i` = ship rotation `i * 360 / 64` degrees. `meta.ship` holds `pxPerUnit` (atlas pixels per world unit) and the camera `pitch`/`yaw`.
- It matches `CAMERA` only: a different pitch or yaw needs a re-render (`art/README.md`). Scale is `camera.zoom / pxPerUnit`.
- The anchor is the ship's centre on the waterline; the sprite bobs with `shipBob` but doesn't heel in turns.
- The baked shadow lies on the water plane, so it is drawn over islands farther than the ship instead of being hidden by them.

## `Painter3D` primitives

- `polygon` — the base one: projection only, no lighting.
- `top` — horizontal upward-facing surface (deck, plateau), lit.
- `sides(bottom, top)` — side walls between two outlines; only camera-facing faces are drawn, already sorted.
- `surface` — thin two-sided surface (sail, flag); the normal is flipped towards the camera.
- `line`, `curve`, `disc`, `ring` — width and radius are in world units.
- Shadows: `shadowPoint(p, groundZ)` projects a point along `LIGHT` onto a plane; draw the shadow as a black `polygon` with `SHADOW_ALPHA`.
- Color: `shade(color, k)` changes brightness. The sun (`LIGHT`) shines from the west, from high above.

## Foam wake (`effects/Wake.ts`)

- Owned and updated by `SceneView` (it is view state, not game state), before drawing.
- Fixed pool of `POOL_SIZE` particles reused round-robin. No new objects are created during gameplay.
- A particle is "dead" when `life >= WAKE_LIFETIME`; animation progress is `foamProgress(p)` from 0 to 1.

## Waves (`effects/waves.ts`)

- 1200 waves generated once with `createRandom(1)`, so they are identical on every run. Culled with `isVisible` every frame.

## Performance

- The HUD shows FPS and the longest frame over the last half second — use it after rendering changes.
- Cull invisible things with `painter.isVisible(x, y, z, radius)` before drawing (as done for waves and islands).
- Polygon count per frame is the main cost: don't increase model detail (`SAIL_COLUMNS`, `SAIL_ROWS`, coastline segments) without need.
