import type { Application } from 'pixi.js';
import { findUnit, isAfloat, type Game } from '../game';
import { Sounds } from './audio/Sounds';
import { Hud } from './hud/Hud';
import { bindKeyboardInput } from './input/keyboardInput';
import { bindPointerInput } from './input/pointerInput';
import { Selection } from './input/selection';
import { SceneView } from './scene/SceneView';

const MAX_DT = 0.05; // seconds: a long frame (tab in background) must not teleport the ship

// Connects the game logic to the browser: scene, HUD, input and the frame loop
export class GameClient {
  private readonly app: Application;
  private readonly game: Game;
  private readonly view: SceneView;
  private readonly hud: Hud;
  private readonly sounds = new Sounds();
  /** The unit the player picked out: shown at the top, fired at with Space */
  private readonly selection = new Selection();

  constructor(app: Application, game: Game) {
    this.app = app;
    this.game = game;
    this.view = new SceneView(app, game.state, this.selection);
    const { ship } = game.state;
    // The HUD's buttons act through the game's methods like any player action (the damage ones are for testing)
    this.hud = new Hud(
      {
        setHealth: (health) => ship.setHealth(health),
        changeHealth: (delta) => ship.setHealth(ship.health + delta),
        // Zoom, range rings and how the fog, the sea and the islands look are view state, not game state: they go to the scene,
        // the game never knows about them
        setZoom: (level) => this.view.setZoom(level),
        toggleRange: (weapon) => this.view.toggleRange(weapon),
        setCameraMode: (mode) => this.view.setCameraMode(mode),
        toggleZone: () => this.view.toggleZone(),
        toggleFog: (layer) => this.view.toggleFog(layer),
        setSeaStyle: (index) => this.view.setSeaStyle(index),
        setIslandLook: (index) => this.view.setIslandLook(index),
        toggleDebug: (kind) => this.view.toggleDebug(kind),
        toggleSound: () => this.sounds.toggle(),
        changeVolume: (steps) => this.sounds.changeVolume(steps),
        setWeapon: (weapon) => ship.setWeapon(weapon),
        ceaseFire: () => ship.ceaseFire(),
        toggleFire: () => {
          const { id } = this.selection;
          if (id === null) return;
          if (ship.attackTarget === id) ship.ceaseFire();
          else ship.attack(id);
        },
        repair: () => ship.startRepair(),
        // The loadout: a testing tool for now, a shipyard and a shop later
        fitGun: (weapon, slot, gun) => ship.fitGun(weapon, slot, gun),
        loadAmmo: (ammo) => ship.loadAmmo(ammo),
        addAmmo: (ammo, count) => ship.addAmmo(ammo, count),
        changeMaxSpeed: (delta) => ship.setSpeeds(ship.maxSpeed + delta, ship.minSpeed),
        changeMinSpeed: (delta) => ship.setSpeeds(ship.maxSpeed, ship.minSpeed + delta),
        changeViewRange: (delta) => ship.setViewRange(ship.viewRange + delta),
      },
      app.screen,
      ship.shipClass,
    );
    app.stage.addChild(this.view.container, this.hud.container);
    bindPointerInput(app, this.view, ship, this.selection);
    bindKeyboardInput(ship, this.selection, { toggleLoadout: () => this.hud.toggleLoadout() });
  }

  start() {
    this.app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
      this.game.update(dt);
      this.forgetLostSelection();
      this.view.update(dt);
      this.sounds.update(this.game.state.events, this.game.state.ship);
      this.hud.update(
        this.game.state,
        ticker.elapsedMS,
        {
          zoom: this.view.zoom,
          cameraMode: this.view.cameraMode,
          ranges: this.view.rangesShown,
          zoneShown: this.view.zoneShown,
          zoneBox: this.view.zoneBox,
          fog: this.view.fogShown,
          seaStyle: this.view.seaStyle,
          islandLook: this.view.islandLook,
          debug: this.view.debugShown,
          sound: this.sounds.settings,
        },
        this.selection,
      );
    });
  }

  /** A unit picked out that sank, or went into the fog, is let go of */
  private forgetLostSelection() {
    const { id } = this.selection;
    if (id === null) return;
    const { state } = this.game;
    const unit = findUnit(state, id);
    if (!unit || !isAfloat(unit) || !state.ship.canSee(unit.x, unit.y)) this.selection.id = null;
  }
}
