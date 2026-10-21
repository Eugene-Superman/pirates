import type { Application } from 'pixi.js';
import { ProjectedView } from './views/ProjectedView';
import { TopDownView } from './views/TopDownView';
import type { GameState, View } from './views/View';

export interface Variant {
  id: string;
  title: string;
  description: string;
  create: (app: Application, state: GameState) => View;
}

// Кожен варіант відкривається як окрема сторінка: ?v=<id>
export const VARIANTS: Variant[] = [
  {
    id: 'top',
    title: 'Зверху',
    description: 'оригінал. Камера строго зверху, все пласке',
    create: (app, state) => new TopDownView(app, state),
  },
  {
    id: 'tilted',
    title: '3/4',
    description: 'камера нахилена на 50°, без перспективи. Найближче до Pirate Storm',
    create: (app, state) =>
      new ProjectedView(app, state, { pitch: 50, yaw: 0, perspective: false, zoom: 1.5, originY: 0.5 }),
  },
  {
    id: 'iso',
    title: 'Ізометрія',
    description: 'класична ізометрія 2:1, світ повернутий на 45°, як у стратегіях',
    create: (app, state) =>
      new ProjectedView(app, state, { pitch: 30, yaw: 45, perspective: false, zoom: 1.4, originY: 0.5 }),
  },
  {
    id: 'horizon',
    title: 'Горизонт',
    description: 'справжня перспектива: далеке менше, видно небо і туман на горизонті',
    create: (app, state) =>
      new ProjectedView(app, state, {
        pitch: 20,
        yaw: 0,
        perspective: true,
        distance: 700,
        zoom: 1.3,
        originY: 0.62,
        sky: true,
      }),
  },
  {
    id: 'chase',
    title: 'За кораблем',
    description: 'камера позаду корабля і повертається разом з ним',
    create: (app, state) =>
      new ProjectedView(app, state, {
        pitch: 16,
        yaw: 0,
        perspective: true,
        distance: 520,
        zoom: 1.6,
        originY: 0.7,
        sky: true,
        followHeading: true,
      }),
  },
  {
    id: 'parallax',
    title: 'Паралакс',
    description: 'зверху, але з перспективою: високі речі відхиляються від центру екрана, як у GTA 2',
    create: (app, state) =>
      new ProjectedView(app, state, { pitch: 90, yaw: 0, perspective: true, distance: 420, zoom: 1.3, originY: 0.5 }),
  },
];
