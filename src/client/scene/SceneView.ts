import { Container, Graphics, type Application } from 'pixi.js';
import { WORLD_HEIGHT, WORLD_WIDTH, type GameState } from '../../game';
import { Camera3D, type CameraConfig, type Vec3 } from '../render/Camera3D';
import { Painter3D } from '../render/Painter3D';
import { drawTargetMarker } from './effects/targetMarker';
import { Wake, drawWake } from './effects/Wake';
import { createWaves, drawWaves } from './effects/waves';
import { drawIslandGround, drawIslandRaised } from './models/island3d';
import { drawShip, drawShipShadow } from './models/ship3d';

// Classic 2:1 isometric: tilted 30°, world rotated 45°
const CAMERA: CameraConfig = { pitch: 30, yaw: 45, zoom: 1.4, originY: 0.5 };

const SEA_COLOR = 0x1b6f93;
const BORDER_COLOR = 0x0b3a52;

// Pseudo-3D: the world has height and the camera looks at it at an angle.
// The scene is redrawn every frame through the Camera3D projection.
// Decorations (waves, foam) are view state: the scene owns and updates them itself.
export class SceneView {
  readonly container = new Container();
  private readonly scene = new Graphics();
  private readonly wake = new Wake();
  private readonly waves = createWaves();
  private readonly app: Application;
  private readonly state: GameState;
  private readonly camera: Camera3D;
  private readonly painter: Painter3D;

  constructor(app: Application, state: GameState) {
    this.app = app;
    this.state = state;
    this.camera = new Camera3D(CAMERA);
    this.painter = new Painter3D(this.scene, this.camera);
    // The whole screen behind the scene is open sea
    app.renderer.background.color = SEA_COLOR;

    this.camera.focusX = state.ship.x;
    this.camera.focusY = state.ship.y;

    this.container.addChild(this.scene);
  }

  update(dt: number) {
    const { ship, world, time } = this.state;
    const { camera, painter } = this;
    const { width, height } = this.app.screen;

    this.wake.update(dt, ship);

    // Smooth camera following the ship
    const follow = Math.min(1, dt * 6);
    camera.focusX += (ship.x - camera.focusX) * follow;
    camera.focusY += (ship.y - camera.focusY) * follow;
    camera.originX = width / 2;
    camera.originY = height * CAMERA.originY;
    painter.screenWidth = width;
    painter.screenHeight = height;

    this.scene.clear();

    // Everything lying on the water
    drawWaves(painter, this.waves, time);

    const islands = world.islands.filter((island) =>
      painter.isVisible(island.x, island.y, 0, island.radius * 1.4 + 60),
    );
    for (const island of islands) drawIslandGround(painter, island);

    this.drawWorldBorder();

    drawWake(painter, this.wake);
    drawShipShadow(painter, ship, time);
    if (ship.target) drawTargetMarker(painter, ship.target, time);

    // Volumetric objects: from far to near
    const objects = islands.map((island) => ({
      depth: painter.depth([island.x, island.y, island.height / 2]),
      draw: () => drawIslandRaised(painter, island, time),
    }));
    objects.push({ depth: painter.depth([ship.x, ship.y, 20]), draw: () => drawShip(painter, ship, time) });
    objects.sort((a, b) => b.depth - a.depth);
    for (const object of objects) object.draw();
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
