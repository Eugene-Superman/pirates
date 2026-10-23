import type { Application, FederatedPointerEvent } from 'pixi.js';
import type { Ship } from '../../game';
import type { SceneView } from '../scene/SceneView';

// Mouse and touch: click or hold the button / finger to steer the ship. Click a target to fire at it until told to
// stop: click it again (or press Escape, keyboardInput); click another one to fire at that instead
export function bindPointerInput(app: Application, view: SceneView, ship: Ship) {
  let steering = false;
  const steerTo = (e: FederatedPointerEvent) => {
    const p = view.screenToWorld(e.global.x, e.global.y);
    ship.setTarget(p.x, p.y);
  };

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e) => {
    const target = view.pickTarget(e.global.x, e.global.y);
    if (target) {
      if (ship.attackTarget === target.id) ship.ceaseFire();
      else ship.attack(target.id);
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
