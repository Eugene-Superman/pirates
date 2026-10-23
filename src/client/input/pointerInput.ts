import type { Application, FederatedPointerEvent } from 'pixi.js';
import type { Ship } from '../../game';
import type { SceneView } from '../scene/SceneView';
import type { Selection } from './selection';

const DOUBLE_CLICK = 350; // milliseconds between the two clicks of a double click

// Mouse and touch: click or hold the button / finger to steer the ship. Click a ship, a monster or a target to pick it
// out (its hit points show at the top); double-click it to fire at it until told to stop (Escape, keyboardInput)
export function bindPointerInput(app: Application, view: SceneView, ship: Ship, selection: Selection) {
  let steering = false;
  let lastClick = { id: -1, at: -Infinity };
  const steerTo = (e: FederatedPointerEvent) => {
    const p = view.screenToWorld(e.global.x, e.global.y);
    ship.setTarget(p.x, p.y);
  };

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e) => {
    const unit = view.pickUnit(e.global.x, e.global.y);
    if (unit) {
      const now = performance.now();
      if (lastClick.id === unit.id && now - lastClick.at < DOUBLE_CLICK) ship.attack(unit.id);
      selection.id = unit.id;
      lastClick = { id: unit.id, at: now };
      return;
    }
    steering = true;
    steerTo(e);
  });
  app.stage.on('globalpointermove', (e) => {
    if (steering) steerTo(e);
  });
  app.stage.on('pointerup', () => (steering = false));
  app.stage.on('pointerupoutside', () => (steering = false));
}
