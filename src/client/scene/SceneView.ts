import { Container, Graphics, type Application } from 'pixi.js';
import { WORLD_HEIGHT, WORLD_WIDTH, type GameState } from '../../game';
import { Camera3D, type CameraConfig, type Vec3 } from '../render/Camera3D';
import { Painter3D } from '../render/Painter3D';
import { ShipFire } from './effects/ShipFire';
import { Sinking } from './effects/Sinking';
import { drawTargetMarker } from './effects/targetMarker';
import { Wake, drawWake } from './effects/Wake';
import { createWaves, drawWaves } from './effects/waves';
import { drawIslandGround, drawIslandRaised } from './models/island3d';
import { ShipSprite } from './models/ShipSprite';

// Classic 2:1 isometric: tilted 30°, world rotated 45°
const CAMERA: CameraConfig = { pitch: 30, yaw: 45, zoom: 1.4, originY: 0.5 };
// The ship atlases (see ShipSprite) are rendered in Blender for exactly this camera.
// Changing the camera means re-rendering them from their source outside this repo

// How fast the camera reaches a new zoom: the share of the remaining difference closed per second
const ZOOM_EASE = 8;
const ZOOM_SNAP = 0.001; // pixels per unit: close enough to stop easing

const SEA_COLOR = 0x1b6f93;
const BORDER_COLOR = 0x0b3a52;

// Pseudo-3D: the world has height and the camera looks at it at an angle.
// The scene is redrawn every frame through the Camera3D projection.
// Decorations (waves, foam) are view state: the scene owns and updates them itself.
export class SceneView {
  readonly container = new Container();
  private readonly scene = new Graphics();
  /** Islands nearer than the ship sprite: they must be drawn on top of it */
  private readonly front = new Graphics();
  /** Fire and smoke above the ship, under the islands in front of it */
  private readonly fireLayer = new Graphics();
  private readonly wake = new Wake();
  private readonly fire = new ShipFire();
  private readonly sinking = new Sinking();
  private readonly waves = createWaves();
  private readonly app: Application;
  private readonly state: GameState;
  private readonly camera: Camera3D;
  private readonly painter: Painter3D;
  private readonly frontPainter: Painter3D;
  private readonly firePainter: Painter3D;
  private readonly shipSprite: ShipSprite;
  /** Zoom as a multiple of CAMERA.zoom; the camera eases towards it */
  private zoomLevel = 1;

  constructor(app: Application, state: GameState) {
    this.app = app;
    this.state = state;
    this.camera = new Camera3D(CAMERA);
    this.painter = new Painter3D(this.scene, this.camera);
    this.frontPainter = new Painter3D(this.front, this.camera);
    this.firePainter = new Painter3D(this.fireLayer, this.camera);
    this.shipSprite = new ShipSprite(state.ship.shipClass);
    // The whole screen behind the scene is open sea
    app.renderer.background.color = SEA_COLOR;

    this.camera.focusX = state.ship.x;
    this.camera.focusY = state.ship.y;

    this.container.addChild(this.scene, this.shipSprite.sprite, this.shipSprite.waterMask, this.fireLayer, this.front);
  }

  update(dt: number) {
    const { ship, world, time } = this.state;
    const { camera, painter } = this;
    const { width, height } = this.app.screen;

    const stage = ship.damageStage;
    this.wake.update(dt, ship);
    this.sinking.update(time, stage, ship);
    this.fire.update(dt, ship, stage, this.sinking.pose, time);

    // Smooth camera following the ship
    const follow = Math.min(1, dt * 6);
    camera.focusX += (ship.x - camera.focusX) * follow;
    camera.focusY += (ship.y - camera.focusY) * follow;
    const targetZoom = CAMERA.zoom * this.zoomLevel;
    camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * ZOOM_EASE);
    if (Math.abs(targetZoom - camera.zoom) < ZOOM_SNAP) camera.zoom = targetZoom;
    camera.originX = width / 2;
    camera.originY = height * CAMERA.originY;
    painter.screenWidth = this.frontPainter.screenWidth = width;
    painter.screenHeight = this.frontPainter.screenHeight = height;

    this.scene.clear();

    // Everything lying on the water
    drawWaves(painter, this.waves, time);

    const islands = world.islands.filter((island) =>
      painter.isVisible(island.x, island.y, 0, island.radius * 1.4 + 60),
    );
    for (const island of islands) drawIslandGround(painter, island);

    this.drawWorldBorder();

    drawWake(painter, this.wake);
    this.sinking.drawFoam(painter, ship);
    // No ship shadow here: it is baked into the ship's sprite
    if (ship.target) drawTargetMarker(painter, ship.target, time);

    // Volumetric objects: from far to near
    const objects = islands.map((island) => ({
      depth: painter.depth([island.x, island.y, island.height / 2]),
      draw: (p: Painter3D) => drawIslandRaised(p, island, time),
    }));
    // Sorted by a point about half the ship's height up; its collision radius is a fair measure of its size
    const shipDepth = painter.depth([ship.x, ship.y, ship.radius]);
    objects.sort((a, b) => b.depth - a.depth);

    // A sprite can't go inside a Graphics, so everything nearer than the ship goes to a layer on top of it
    this.front.clear();
    for (const object of objects) {
      object.draw(object.depth < shipDepth ? this.frontPainter : painter);
    }
    this.shipSprite.update(ship, camera, time, stage, this.sinking.pose);

    // Smoke after flames: it rises from them and drifts over them
    this.fireLayer.clear();
    this.fire.drawFlames(this.firePainter);
    this.fire.drawSmoke(this.firePainter);
  }

  /** Zoom as a multiple of the default one: 1 is the normal view, 2 shows everything twice as big */
  get zoom() {
    return this.zoomLevel;
  }

  setZoom(level: number) {
    this.zoomLevel = level;
  }

  screenToWorld(x: number, y: number) {
    return this.camera.screenToGround(x, y);
  }

  // World border: strips lying on the water rather than screen lines, so they are foreshortened like the sea
  private drawWorldBorder() {
    const half = 4;
    const edges = [
      [0, 0, WORLD_WIDTH, 0],
      [0, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT],
      [0, 0, 0, WORLD_HEIGHT],
      [WORLD_WIDTH, 0, WORLD_WIDTH, WORLD_HEIGHT],
    ];

    for (const [x0, y0, x1, y1] of edges) {
      const strip: Vec3[] = [
        [Math.min(x0, x1) - half, Math.min(y0, y1) - half, 0],
        [Math.max(x0, x1) + half, Math.min(y0, y1) - half, 0],
        [Math.max(x0, x1) + half, Math.max(y0, y1) + half, 0],
        [Math.min(x0, x1) - half, Math.max(y0, y1) + half, 0],
      ];
      this.painter.polygon(strip, BORDER_COLOR, 0.6);
    }
  }
}
