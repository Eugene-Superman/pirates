import { Container, Graphics, type Application } from 'pixi.js';
import { normalizeAngle } from '../game/math';
import { foamProgress } from '../game/Wake';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../game/World';
import { Camera3D, type CameraConfig, type Vec3 } from './Camera3D';
import { drawIslandGround, drawIslandRaised } from './island3d';
import { Painter3D, mix } from './Painter3D';
import { drawShip, drawShipShadow } from './ship3d';
import type { GameState, View } from './View';

export interface ProjectedViewConfig extends CameraConfig {
  /** Небо, горизонт і туман удалині */
  sky?: boolean;
  /** Камера повертається слідом за кораблем */
  followHeading?: boolean;
}

const SEA_COLOR = 0x1b6f93;
const WAVE_COLOR = 0x5fb3d6;
const SKY_TOP = 0x3d86c6;
const HAZE_COLOR = 0xbfdfea;
const BORDER_COLOR = 0x0b3a52;

// Псевдо-3D: у світу є висота, а камера дивиться під кутом.
// Сцена щокадру перемальовується через проекцію Camera3D.
export class ProjectedView implements View {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly scene = new Graphics();
  private readonly app: Application;
  private readonly state: GameState;
  private readonly config: ProjectedViewConfig;
  private readonly camera: Camera3D;
  private readonly painter: Painter3D;

  constructor(app: Application, state: GameState, config: ProjectedViewConfig) {
    this.app = app;
    this.state = state;
    this.config = config;
    this.camera = new Camera3D(config);
    this.painter = new Painter3D(this.scene, this.camera);

    if (config.sky) {
      this.painter.fogColor = HAZE_COLOR;
      this.painter.fogStart = this.camera.distance * 1.3;
      this.painter.fogEnd = this.camera.distance * 6;
    }

    this.camera.focusX = state.ship.x;
    this.camera.focusY = state.ship.y;
    if (config.followHeading) this.camera.yaw = state.ship.rotation + Math.PI / 2;

    this.container.addChild(this.background, this.scene);
  }

  update(dt: number) {
    const { ship, wake, world, time } = this.state;
    const { camera, painter } = this;
    const { width, height } = this.app.screen;

    // Плавна камера за кораблем
    const follow = Math.min(1, dt * 6);
    camera.focusX += (ship.x - camera.focusX) * follow;
    camera.focusY += (ship.y - camera.focusY) * follow;
    if (this.config.followHeading) {
      camera.yaw += normalizeAngle(ship.rotation + Math.PI / 2 - camera.yaw) * Math.min(1, dt * 2.5);
    }
    camera.originX = width / 2;
    camera.originY = height * this.config.originY;
    painter.screenWidth = width;
    painter.screenHeight = height;

    this.drawBackground(width, height);
    this.scene.clear();

    // Все, що лежить на воді
    for (const wave of world.waves) {
      const x = wave.x + Math.sin(time * 0.8 + wave.phase) * 4;
      if (!painter.isVisible(x + wave.width / 2, wave.y, 0, wave.width)) continue;
      // Далекі хвильки в кілька пікселів не видно, а малювати їх дорого
      if (camera.perspective && wave.width * camera.project(x, wave.y, 0).scale < 6) continue;
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

    // Об'ємні об'єкти: від дальнього до ближнього
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

  private drawBackground(width: number, height: number) {
    const bg = this.background;
    bg.clear();

    const horizon = this.config.sky ? this.camera.horizonY() : null;
    if (horizon === null) {
      bg.rect(0, 0, width, height).fill(SEA_COLOR);
      return;
    }

    // Небо: градієнт смугами до горизонту
    const skyBands = 16;
    for (let i = 0; i < skyBands && horizon > 0; i++) {
      bg.rect(0, (horizon * i) / skyBands, width, horizon / skyBands + 1).fill(mix(SKY_TOP, HAZE_COLOR, (i + 0.5) / skyBands));
    }

    // Море: колір кожної смуги залежить від того, як далеко ця вода. Біля горизонту смуги густіші
    const seaTop = Math.max(horizon, 0);
    const seaBands = 40;
    for (let i = 0; i < seaBands; i++) {
      const y0 = seaTop + (height - seaTop) * (i / seaBands) ** 2;
      const y1 = seaTop + (height - seaTop) * ((i + 1) / seaBands) ** 2;
      const ground = this.camera.screenToGround(width / 2, (y0 + y1) / 2);
      const depth = ground ? this.camera.toCamera(ground.x, ground.y, 0).z : Infinity;
      bg.rect(0, y0, width, y1 - y0 + 1).fill(mix(SEA_COLOR, HAZE_COLOR, this.painter.fogAt(depth)));
    }
  }

  // Межа світу: смуги на воді, а не лінії, щоб перспектива правильно звужувала їх удалині.
  // Кожна смуга порізана на шматки, щоб туман лягав поступово.
  private drawWorldBorder() {
    const half = 4;
    const pieces = 16;
    const edges = [
      [0, 0, WORLD_WIDTH, 0],
      [0, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT],
      [0, 0, 0, WORLD_HEIGHT],
      [WORLD_WIDTH, 0, WORLD_WIDTH, WORLD_HEIGHT],
    ];

    for (const [x0, y0, x1, y1] of edges) {
      for (let i = 0; i < pieces; i++) {
        const ax = x0 + ((x1 - x0) * i) / pieces;
        const ay = y0 + ((y1 - y0) * i) / pieces;
        const bx = x0 + ((x1 - x0) * (i + 1)) / pieces;
        const by = y0 + ((y1 - y0) * (i + 1)) / pieces;
        const strip: Vec3[] = [
          [Math.min(ax, bx) - half, Math.min(ay, by) - half, 0],
          [Math.max(ax, bx) + half, Math.min(ay, by) - half, 0],
          [Math.max(ax, bx) + half, Math.max(ay, by) + half, 0],
          [Math.min(ax, bx) - half, Math.max(ay, by) + half, 0],
        ];
        this.painter.polygon(strip, BORDER_COLOR, 0.6);
      }
    }
  }
}
