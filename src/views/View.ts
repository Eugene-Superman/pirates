import type { Container } from 'pixi.js';
import type { Ship } from '../game/Ship';
import type { Wake } from '../game/Wake';
import type { WorldData } from '../game/World';

// Стан гри, спільний для всіх варіантів вигляду
export interface GameState {
  world: WorldData;
  ship: Ship;
  wake: Wake;
  time: number;
}

// Варіант вигляду: як намалювати стан гри і як перевести клік у точку світу
export interface View {
  readonly container: Container;
  update(dt: number): void;
  /** Точка на воді під курсором, або null якщо клік не по воді (наприклад, у небо) */
  screenToWorld(x: number, y: number): { x: number; y: number } | null;
}
