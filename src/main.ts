import { Application, Container, Text, type FederatedPointerEvent } from 'pixi.js';
import { Ship } from './game/Ship';
import { Wake } from './game/Wake';
import { WORLD_HEIGHT, WORLD_WIDTH, createWorld } from './game/World';
import { VARIANTS, type Variant } from './variants';
import type { GameState } from './views/View';

async function main() {
  const variantId = new URLSearchParams(location.search).get('v');
  const variant = VARIANTS.find((v) => v.id === variantId) ?? VARIANTS[0];
  createVariantNav(variant);

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#0b3a52',
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const ship = new Ship();
  ship.x = WORLD_WIDTH / 2;
  ship.y = WORLD_HEIGHT / 2;
  const state: GameState = { world: createWorld(), ship, wake: new Wake(), time: 0 };
  const view = variant.create(app, state);

  // Світ малює view, HUD лишається на місці поверх нього
  const hud = new Container();
  app.stage.addChild(view.container, hud);

  const textStyle = {
    fontFamily: 'Arial',
    fontSize: 16,
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 3 },
  };
  const title = new Text({
    text: `${variant.title}: ${variant.description}`,
    style: { ...textStyle, fontWeight: 'bold', wordWrap: true, wordWrapWidth: 520 },
  });
  const help = new Text({
    text: `Клікни по морю, щоб пливти. Клавіші 1-${VARIANTS.length} перемикають варіанти`,
    style: { ...textStyle, fontSize: 13 },
  });
  const speedText = new Text({ text: '', style: textStyle });
  const fpsText = new Text({ text: '', style: textStyle });
  title.position.set(16, 16);
  help.position.set(16, title.y + title.height + 4);
  speedText.position.set(16, help.y + help.height + 8);
  fpsText.position.set(16, speedText.y + 24);
  hud.addChild(title, help, speedText, fpsText);

  // Керування: клік або затиснута кнопка миші / палець
  let steering = false;
  const steerTo = (e: FederatedPointerEvent) => {
    const p = view.screenToWorld(e.global.x, e.global.y);
    if (p) ship.setTarget(p.x, p.y);
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
      speedText.text = `Швидкість: ${knots} вузлів`;
    }

    // Середній FPS за пів секунди + найдовший кадр за цей час (видно підвисання)
    fpsFrames++;
    fpsElapsedMs += ticker.elapsedMS;
    worstFrameMs = Math.max(worstFrameMs, ticker.elapsedMS);
    if (fpsElapsedMs >= 500) {
      const fps = (fpsFrames * 1000) / fpsElapsedMs;
      fpsText.text = `FPS: ${fps.toFixed(1)}   найдовший кадр: ${worstFrameMs.toFixed(1)} мс`;
      fpsFrames = 0;
      fpsElapsedMs = 0;
      worstFrameMs = 0;
    }
  });
}

// Панель внизу екрана: кожен варіант відкривається як окрема сторінка (?v=...)
function createVariantNav(current: Variant) {
  const nav = document.createElement('nav');
  nav.className = 'variants';

  VARIANTS.forEach((variant, i) => {
    const link = document.createElement('a');
    link.href = `?v=${variant.id}`;
    link.textContent = `${i + 1}. ${variant.title}`;
    if (variant === current) link.classList.add('active');
    nav.appendChild(link);
  });
  document.body.appendChild(nav);

  window.addEventListener('keydown', (e) => {
    const variant = VARIANTS[Number(e.key) - 1];
    if (variant && variant !== current) location.search = `?v=${variant.id}`;
  });
}

main();
