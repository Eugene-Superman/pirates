import { Application, Container, Text, type FederatedPointerEvent } from 'pixi.js';
import type { GameState } from './game/GameState';
import { Ship } from './game/Ship';
import { Wake } from './game/Wake';
import { WORLD_HEIGHT, WORLD_WIDTH, createWorld } from './game/World';
import { ProjectedView } from './views/ProjectedView';

async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const ship = new Ship();
  ship.x = WORLD_WIDTH / 2;
  ship.y = WORLD_HEIGHT / 2;
  const state: GameState = { world: createWorld(), ship, wake: new Wake(), time: 0 };
  const view = new ProjectedView(app, state);

  // The view draws the world, the HUD stays fixed on top of it
  const hud = new Container();
  app.stage.addChild(view.container, hud);

  const textStyle = {
    fontFamily: 'Arial',
    fontSize: 16,
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 3 },
  };
  const help = new Text({ text: 'Click on the sea to sail', style: { ...textStyle, fontSize: 13 } });
  const speedText = new Text({ text: '', style: textStyle });
  const fpsText = new Text({ text: '', style: textStyle });
  help.position.set(16, 16);
  speedText.position.set(16, help.y + help.height + 8);
  fpsText.position.set(16, speedText.y + 24);
  hud.addChild(help, speedText, fpsText);

  // Controls: click or hold the mouse button / finger
  let steering = false;
  const steerTo = (e: FederatedPointerEvent) => {
    const p = view.screenToWorld(e.global.x, e.global.y);
    ship.setTarget(p.x, p.y);
  };

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e) => {
    steering = true;
    steerTo(e);
  });
  app.stage.on('globalpointermove', (e) => {
    if (steering) steerTo(e);
  });
  app.stage.on('pointerup', () => (steering = false));
  app.stage.on('pointerupoutside', () => (steering = false));

  let shownKnots = -1;
  let fpsFrames = 0;
  let fpsElapsedMs = 0;
  let worstFrameMs = 0;

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    state.time += dt;

    ship.update(dt, state.world.islands);
    state.wake.update(dt, ship);
    view.update(dt);

    const knots = Math.round(ship.speed / 10);
    if (knots !== shownKnots) {
      shownKnots = knots;
      speedText.text = `Speed: ${knots} knots`;
    }

    // Average FPS over half a second + the longest frame in that time (shows stutters)
    fpsFrames++;
    fpsElapsedMs += ticker.elapsedMS;
    worstFrameMs = Math.max(worstFrameMs, ticker.elapsedMS);
    if (fpsElapsedMs >= 500) {
      const fps = (fpsFrames * 1000) / fpsElapsedMs;
      fpsText.text = `FPS: ${fps.toFixed(1)}   longest frame: ${worstFrameMs.toFixed(1)} ms`;
      fpsFrames = 0;
      fpsElapsedMs = 0;
      worstFrameMs = 0;
    }
  });
}

// A startup failure still reaches the console as an unhandled rejection
void main();
