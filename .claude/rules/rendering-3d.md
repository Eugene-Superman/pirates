---
paths:
  - "src/views/**"
---

# Rendering (`src/views/`)

## How it works

- **`ProjectedView`** is the only view: classic 2:1 isometric (parallel projection, pitch 30°, yaw 45°).
- Immediate mode: `scene.clear()` and a full redraw every frame via `Painter3D`.
  Everything in the scene is drawn **only through `Painter3D`**, never directly into `Graphics` (otherwise there is no projection or lighting).
- No perspective: sizes don't depend on distance, line widths are `width * camera.zoom`.

## Coordinate systems

| Space | x | y | z |
|---|---|---|---|
| World | east | south | up from water |
| Ship (`ship3d.ts`) | towards bow | towards starboard | up from water |
| Camera (`Camera3D`) | right | up the screen | into the screen, larger = farther |

- `Vec3` is a `readonly [x, y, z]` tuple in world coordinates.
- `CameraConfig.pitch` / `yaw` are in **degrees** (90 = straight down, yaw 0 = north at the top). Camera direction is fixed after construction.
- `screenToGround` maps a screen point to the water plane (`z = 0`); it always returns a point.
- Ship-local points are converted to world space via `shipTransform` — it also adds bobbing (`bob`) and heeling (`roll`).

## Draw order (painter's algorithm)

There is no z-buffer, so order is everything. In `ProjectedView.update`:
1. Background: the renderer clears the screen to `SEA_COLOR` (set in the `ProjectedView` constructor).
2. Everything flat on the water (`z = 0`): waves → island "ground" (shallows, sand, cliff shadows) → world border → foam → ship shadow → target marker.
3. Volumetric objects (islands, ship) — sorted by `painter.depth(...)` **from far to near**.
4. Parts within an object are also sorted by depth (ship masts/sails, island hill and palms).

Add a new volumetric object to the `objects` array with `depth` and `draw`; don't draw it separately after sorting.

## `Painter3D` primitives

- `polygon` — the base one: projection only, no lighting.
- `top` — horizontal upward-facing surface (deck, plateau), lit.
- `sides(bottom, top)` — side walls between two outlines; only camera-facing faces are drawn, already sorted.
- `surface` — thin two-sided surface (sail, flag); the normal is flipped towards the camera.
- `line`, `curve`, `disc`, `ring` — width and radius are in world units.
- Shadows: `shadowPoint(p, groundZ)` projects a point along `LIGHT` onto a plane; draw the shadow as a black `polygon` with `SHADOW_ALPHA`.
- Color: `shade(color, k)` changes brightness. The sun (`LIGHT`) shines from the west, from high above.

## Performance

- The HUD shows FPS and the longest frame over the last half second — use it after rendering changes.
- Cull invisible things with `painter.isVisible(x, y, z, radius)` before drawing (as done for waves and islands).
- Polygon count per frame is the main cost: don't increase model detail (`SAIL_COLUMNS`, `SAIL_ROWS`, coastline segments) without need.
