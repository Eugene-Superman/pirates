import { Container, Graphics, type Application } from 'pixi.js';
import type { GameState } from '../game/GameState';
import { foamProgress } from '../game/Wake';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../game/World';
import { Camera3D, type CameraConfig, type Vec3 } from './Camera3D';
import { drawIslandGround, drawIslandRaised } from './island3d';
import { Painter3D } from './Painter3D';
import { drawShip, drawShipShadow } from './ship3d';

// Classic 2:1 isometric: tilted 30°, world rotated 45°
const CAMERA: CameraConfig = { pitch: 30, yaw: 45, zoom: 1.4, originY: 0.5 };

const SEA_COLOR = 0x1b6f93;
const WAVE_COLOR = 0x5fb3d6;
const BORDER_COLOR = 0x0b3a52;

// Pseudo-3D: the world has height and the camera looks at it at an angle.
// The scene is redrawn every frame through the Camera3D projection.
export class ProjectedView {
  readonly container = new Container();
  private readonly scene = new Graphics();
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
    const { ship, wake, world, time } = this.state;
    const { camera, painter } = this;
    const { width, height } = this.app.screen;

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
    for (const wave of world.waves) {
      const x = wave.x + Math.sin(time * 0.8 + wave.phase) * 4;
      if (!painter.isVisible(x + wave.width / 2, wave.y, 0, wave.width)) continue;
      painter.curve([x, wave.y, 0], [x + wave.width / 2, wave.y - 5, 0], [x + wave.width, wave.y, 0], 2, WAVE_COLOR, 0.45);
    }

    const islands = world.islands.filter((island) => painter.isVisible(island.x, island.y, 0, island.radius * 1.4 + 60));
    for (const island of islands) drawIslandGround(painter, island);

    this.drawWorldBorder();

    for (const foam of wake.particles) {
      const t = foamProgress(foam);
      if (t < 1) painter.disc(foam.x, foam.y, 0, 4 * (1 + t * 2.5), 0xffffff, foam.startAlpha * (1 - t));
    }

    drawShipShadow(painter, ship, time);

    if (ship.target) {
      const { x, y } = ship.target;
      painter.ring(x, y, 0, 14 * (1 + Math.sin(time * 6) * 0.15), 2, 0xffffff, 0.8);
      painter.line([x - 6, y, 0], [x + 6, y, 0], 2, 0xffffff, 0.8);
      painter.line([x, y - 6, 0], [x, y + 6, 0], 2, 0xffffff, 0.8);
    }

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
