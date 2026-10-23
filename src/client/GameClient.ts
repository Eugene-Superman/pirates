import type { Application } from 'pixi.js';
import {
  buyAmmo,
  buyGun,
  dropQuest,
  findUnit,
  fitFromHold,
  giveGold,
  isAfloat,
  leavePort,
  repairInPort,
  takeQuest,
  turnInQuest,
  type Game,
  type WeaponId,
} from '../game';
import { Sounds } from './audio/Sounds';
import { Hud } from './hud/Hud';
import { bindCursor } from './input/cursor';
import { Hover } from './input/hover';
import { bindKeyboardInput } from './input/keyboardInput';
import { bindPointerInput } from './input/pointerInput';
import { Selection } from './input/selection';
import type { GpuInfo } from './render/gpu';
import type { CameraMode } from './scene/cameraControl';
import type { FogLayer } from './scene/effects/fogOfWar';
import type { NavDebug } from './scene/effects/navDebug';
import { SceneView } from './scene/SceneView';
import type { Store } from './storage/Store';

const MAX_DT = 0.05; // seconds: a long frame (tab in background) must not teleport the ship
const AUTOSAVE = 5; // seconds of play between two saves of the progress and the log; and whenever the page is hidden

// Connects the game logic to the browser: scene, HUD, input and the frame loop
export class GameClient {
  private readonly app: Application;
  private readonly game: Game;
  private readonly view: SceneView;
  private readonly hud: Hud;
  private readonly sounds: Sounds;
  /** The unit the player picked out: shown at the top, fired at with Space */
  private readonly selection = new Selection();
  /** The unit under the mouse: the cursor shows it, a click takes it */
  private readonly hover = new Hover();
  /** The browser's memory of the progress and the settings, until there is a server */
  private readonly store: Store;
  /** What draws the game: the HUD warns when it is the processor */
  private readonly renderer: GpuInfo;
  private sinceSave = 0;
  /** Set by New game: nothing is kept any more, the page reloads */
  private forgetting = false;

  /** store: what was kept of earlier visits; the game has its progress loaded already */
  constructor(app: Application, game: Game, store: Store, renderer: GpuInfo) {
    this.app = app;
    this.game = game;
    this.store = store;
    this.renderer = renderer;
    this.sounds = new Sounds(store.slot('sound'));
    this.view = new SceneView(app, game.state, this.selection);
    this.view.applySettings(store.get('view'));
    // Kept the moment they change: settings change seldom
    const view = <T extends unknown[]>(change: (...args: T) => void) => {
      return (...args: T) => {
        change(...args);
        store.set('view', this.view.settings);
      };
    };
    const { ship } = game.state;
    // The HUD's buttons act through the game's methods like any player action (the damage ones are for testing)
    this.hud = new Hud(
      {
        setHealth: (health) => ship.setHealth(health),
        changeHealth: (delta) => ship.setHealth(ship.health + delta),
        // Zoom, range rings and how the fog looks are view state, not game state: they go to the scene,
        // the game never knows about them
        setZoom: view((level: number) => this.view.setZoom(level)),
        toggleRange: view((weapon: WeaponId) => this.view.toggleRange(weapon)),
        setCameraMode: view((mode: CameraMode) => this.view.setCameraMode(mode)),
        toggleZone: view(() => this.view.toggleZone()),
        toggleFog: view((layer: FogLayer) => this.view.toggleFog(layer)),
        toggleDebug: view((kind: NavDebug) => this.view.toggleDebug(kind)),
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
        // The loadout: guns from the hold, bought in port
        fitGun: (weapon, slot, gun) => fitFromHold(game.state.player, ship, weapon, slot, gun),
        loadAmmo: (ammo) => ship.loadAmmo(ammo),
        changeMaxSpeed: (delta) => ship.setSpeeds(ship.maxSpeed + delta, ship.minSpeed),
        changeMinSpeed: (delta) => ship.setSpeeds(ship.maxSpeed, ship.minSpeed + delta),
        changeViewRange: (delta) => ship.setViewRange(ship.viewRange + delta),
        addGold: (amount) => giveGold(game.state.player, amount),
        newGame: () => this.newGame(),
      },
      app.screen,
      ship.shipClass,
      this.view.mapAxes,
      {
        name: game.state.world.port.name,
        // In port: game methods like any player action, for the player of this client
        actions: {
          leavePort: () => leavePort(game.state, ship),
          buyGun: (gun) => buyGun(game.state, game.state.player, gun),
          buyAmmo: (ammo) => buyAmmo(game.state, game.state.player, ammo),
          repairInPort: () => repairInPort(game.state, game.state.player),
          takeQuest: (id) => takeQuest(game.state, game.state.player, id),
          turnInQuest: (id) => turnInQuest(game.state, game.state.player, id),
          dropQuest: (id) => dropQuest(game.state.player, id),
        },
      },
      { hud: store.slot('hud'), log: store.slot('log') },
    );
    app.stage.addChild(this.view.container, this.hud.container);
    bindPointerInput(app, this.view, ship, this.selection, this.hover, game.state.world.port);
    bindCursor(app, this.view, ship, this.hover);
    bindKeyboardInput(ship, this.selection, {
      toggleLoadout: () => this.hud.toggleLoadout(),
      toggleLog: () => this.hud.toggleLog(),
      toggleMap: () => this.hud.toggleMap(),
    });
  }

  start() {
    // Hidden or closed: everything is kept now (a write started then still finishes)
    const keepAll = () => {
      this.save();
      this.store.flush();
    };
    window.addEventListener('pagehide', keepAll);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') keepAll();
    });
    this.app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
      this.game.update(dt);
      this.sinceSave += ticker.deltaMS / 1000;
      if (this.sinceSave >= AUTOSAVE) this.save();
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
          debug: this.view.debugShown,
          sound: this.sounds.settings,
          renderer: this.renderer,
        },
        this.selection,
      );
    });
  }

  /** Keeps the progress and the combat log */
  private save() {
    if (this.forgetting) return;
    this.sinceSave = 0;
    this.store.set('save', this.game.save());
    this.hud.keep();
  }

  /** Forgets everything kept and starts again: the page reloads with a new player */
  private newGame() {
    this.forgetting = true;
    this.store.clear();
    window.location.reload();
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
