import { Container, Graphics, Point, type Application } from 'pixi.js';
import { foamProgress } from '../game/Wake';
import { WORLD_HEIGHT, WORLD_WIDTH, islandOutline, type Island, type Wave } from '../game/World';
import type { GameState, View } from './View';

// Оригінальний вигляд: камера строго зверху, все намальовано пласко
export class TopDownView implements View {
  readonly container = new Container();
  private readonly app: Application;
  private readonly state: GameState;
  private readonly wake = new Graphics();
  private readonly marker = createMarker();
  private readonly ship = createShipGraphics();

  constructor(app: Application, state: GameState) {
    this.app = app;
    this.state = state;

    const islands = new Graphics();
    for (const island of state.world.islands) drawIsland(islands, island);

    this.container.addChild(createSea(state.world.waves), this.wake, islands, this.marker, this.ship);
    this.container.position.copyFrom(this.cameraTarget());
  }

  update(dt: number) {
    const { ship, wake, time } = this.state;

    this.ship.position.set(ship.x, ship.y);
    this.ship.rotation = ship.rotation;

    this.wake.clear();
    for (const foam of wake.particles) {
      const t = foamProgress(foam);
      if (t >= 1) continue;
      this.wake.circle(foam.x, foam.y, 4 * (1 + t * 2.5)).fill({ color: 0xffffff, alpha: foam.startAlpha * (1 - t) });
    }

    this.marker.visible = ship.target !== null;
    if (ship.target) this.marker.position.set(ship.target.x, ship.target.y);
    this.marker.scale.set(1 + Math.sin(time * 6) * 0.15);

    // Плавна камера за кораблем
    const cam = this.cameraTarget();
    const follow = Math.min(1, dt * 6);
    this.container.x += (cam.x - this.container.x) * follow;
    this.container.y += (cam.y - this.container.y) * follow;
  }

  screenToWorld(x: number, y: number) {
    return this.container.toLocal(new Point(x, y));
  }

  private cameraTarget() {
    const { width, height } = this.app.screen;
    return {
      x: clampCamera(width / 2 - this.state.ship.x, width, WORLD_WIDTH),
      y: clampCamera(height / 2 - this.state.ship.y, height, WORLD_HEIGHT),
    };
  }
}

// Не даємо камері показати порожнечу за краєм світу
function clampCamera(value: number, screenSize: number, worldSize: number) {
  if (screenSize >= worldSize) return (screenSize - worldSize) / 2;
  return Math.max(screenSize - worldSize, Math.min(0, value));
}

function createSea(waves: readonly Wave[]): Graphics {
  const sea = new Graphics();

  sea.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(0x1b6f93);

  // Дрібні хвильки
  for (const { x, y, width } of waves) {
    sea.moveTo(x, y).quadraticCurveTo(x + width / 2, y - 5, x + width, y);
  }
  sea.stroke({ width: 2, color: 0x5fb3d6, alpha: 0.45 });

  // Край світу
  sea.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).stroke({ width: 12, color: 0x0b3a52 });

  return sea;
}

function drawIsland(g: Graphics, island: Island) {
  g.poly(islandOutline(island, 1.35)).fill({ color: 0x6fd0e0, alpha: 0.4 }); // мілина
  g.poly(islandOutline(island, 1)).fill(0xe8d18f); // пісок
  g.poly(islandOutline(island, 0.72)).fill(0x4f9a3a); // трава

  for (const palm of island.palms) {
    const px = palm.x + palm.leanX;
    const py = palm.y + palm.leanY;
    g.circle(px + 3, py + 4, 11).fill({ color: 0x000000, alpha: 0.2 });
    g.circle(px, py, 11).fill(0x2f6b25);
    g.circle(px - 3, py - 3, 5).fill(0x4c8f3a);
  }
}

function createMarker(): Graphics {
  const marker = new Graphics()
    .circle(0, 0, 14)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.8 })
    .moveTo(-6, 0)
    .lineTo(6, 0)
    .moveTo(0, -6)
    .lineTo(0, 6)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
  marker.visible = false;
  return marker;
}

// Корабель намальований носом вправо (rotation = 0)
function createShipGraphics(): Graphics {
  const g = new Graphics();

  // Тінь
  g.ellipse(4, 6, 40, 15).fill({ color: 0x000000, alpha: 0.25 });

  // Корпус
  g.moveTo(-34, -12)
    .lineTo(12, -14)
    .quadraticCurveTo(34, -11, 42, 0)
    .quadraticCurveTo(34, 11, 12, 14)
    .lineTo(-34, 12)
    .closePath()
    .fill(0x6b4423)
    .stroke({ width: 2, color: 0x3d2614 });

  // Палуба
  g.moveTo(-30, -9)
    .lineTo(10, -10)
    .quadraticCurveTo(28, -8, 34, 0)
    .quadraticCurveTo(28, 8, 10, 10)
    .lineTo(-30, 9)
    .closePath()
    .fill(0xa8743f);

  // Гармати по бортах
  for (const x of [-20, -6, 8]) {
    g.rect(x - 3, -17, 6, 4).fill(0x222222);
    g.rect(x - 3, 13, 6, 4).fill(0x222222);
  }

  // Щогли та вітрила
  for (const x of [-10, 12]) {
    g.circle(x, 0, 3).fill(0x3d2614);
    g.moveTo(x - 2, -24)
      .quadraticCurveTo(x + 14, 0, x - 2, 24)
      .lineTo(x - 5, 24)
      .quadraticCurveTo(x + 2, 0, x - 5, -24)
      .closePath()
      .fill(0xf2ecd9)
      .stroke({ width: 1, color: 0xbdb39a });
  }

  // Прапор на кормі
  g.rect(-36, -3, 8, 6).fill(0xc0392b);

  return g;
}
