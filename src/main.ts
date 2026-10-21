import { Application } from 'pixi.js';
import { GameClient } from './client/GameClient';
import { Game } from './game';

async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  new GameClient(app, new Game()).start();
}

// A startup failure still reaches the console as an unhandled rejection
void main();
