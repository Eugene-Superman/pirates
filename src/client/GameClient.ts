import type { Application } from 'pixi.js';
import type { Game } from '../game';
import { Hud } from './hud/Hud';
import { bindPointerInput } from './input/pointerInput';
import { SceneView } from './scene/SceneView';

const MAX_DT = 0.05; // seconds: a long frame (tab in background) must not teleport the ship

// Connects the game logic to the browser: scene, HUD, input and the frame loop
export class GameClient {
  private readonly app: Application;
  private readonly game: Game;
  private readonly view: SceneView;
  private readonly hud: Hud;

  constructor(app: Application, game: Game) {
    this.app = app;
    this.game = game;
    this.view = new SceneView(app, game.state);
    const { ship } = game.state;
    // Debug buttons for checking every damage stage; they act through the game's methods like any player action
    this.hud = new Hud({
      setHealth: (health) => ship.setHealth(health),
      changeHealth: (delta) => ship.setHealth(ship.health + delta),
      // Zoom is view state, not game state: it goes to the scene, the game never knows about it
      setZoom: (level) => this.view.setZoom(level),
    });
    app.stage.addChild(this.view.container, this.hud.container);
    bindPointerInput(app, this.view, game.state.ship);
  }

  start() {
    this.app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
      this.game.update(dt);
      this.view.update(dt);
      this.hud.update(this.game.state.ship, ticker.elapsedMS, this.view.zoom);
    });
  }
}
