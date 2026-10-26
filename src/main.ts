import { Application } from 'pixi.js';
import { GameClient } from './client/GameClient';
import { probeGpu } from './client/render/gpu';
import { Store } from './client/storage/Store';
import { Game } from './game';

// Pixels drawn per screen pixel when the processor draws the game: about twice the frame rate, a little blurred
const SOFTWARE_RESOLUTION = 0.75;

async function main() {
  // Asked before the game's context is made: smoothing can't be turned off later
  const renderer = probeGpu();
  const app = new Application();
  await app.init({
    resizeTo: window,
    // Smoothed edges cost a graphics card next to nothing, but a third of the frames when the processor draws
    antialias: !renderer.software,
    resolution: renderer.software ? SOFTWARE_RESOLUTION : window.devicePixelRatio,
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);
  // The whole page is the game: a right click is a click in it, never the browser's menu
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // A seed of its own for every game started: the dice and the bots differ each time (online, the server's)
  const game = new Game(Math.floor(Math.random() * 2 ** 32));
  // The player's progress and settings, kept in the browser until there is a server
  const store = await Store.open();
  game.load(store.get('save'));
  new GameClient(app, game, store, renderer).start();
}

// A startup failure still reaches the console as an unhandled rejection
void main();
