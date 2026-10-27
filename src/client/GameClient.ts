import type { Application } from 'pixi.js';
import {
  buyAmmo,
  buyGun,
  buyOutfit,
  buyShip,
  dropQuest,
  findUnit,
  fitFromHold,
  fitOutfit,
  giveGold,
  giveLevels,
  isAfloat,
  leavePort,
  orderRepair,
  repairInPort,
  resetTalents,
  sellAmmo,
  sellCargo,
  sellGun,
  throwOverboard,
  takeHelm,
  takeQuest,
  takeTalent,
  turnInQuest,
  useAbility,
  type Game,
  type QuestId,
  type ZoneId,
} from '../game';
import { Sounds, type SoundName } from './audio/Sounds';
import { Hud } from './hud/Hud';
import { setTapSound } from './hud/ui';
import { bindCursor } from './input/cursor';
import { Hover } from './input/hover';
import { bindKeyboardInput } from './input/keyboardInput';
import { bindPointerInput } from './input/pointerInput';
import { Selection } from './input/selection';
import type { GpuInfo } from './render/gpu';
import type { CameraMode } from './scene/cameraControl';
import type { FogLayer } from './scene/effects/fogOfWar';
import type { NavDebug } from './scene/effects/navDebug';
import { setLang, startingLang, type Lang } from './i18n/i18n';
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
  /** Set when the ship sails off to another sea: the progress for it is kept, the page reloads in it */
  private travelling = false;

  /** store: what was kept of earlier visits; the game has its progress loaded already */
  constructor(app: Application, game: Game, store: Store, renderer: GpuInfo) {
    this.app = app;
    this.game = game;
    this.store = store;
    this.renderer = renderer;
    // Before anything with text is made
    setLang(startingLang(store.get('lang')));
    this.sounds = new Sounds(store.slot('sound'));
    setTapSound(() => this.sounds.ui('click'));
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
    // Given up at the tavern or from the quest tracker, at sea too, once the player has said yes
    const giveUpQuest = (id: QuestId) => {
      dropQuest(game.state.player, id);
      this.sounds.ui('quest');
    };
    // The HUD's buttons act through the game's methods like any player action (the damage ones are for testing)
    this.hud = new Hud(
      {
        setHealth: (health) => ship.setHealth(health),
        changeHealth: (delta) => ship.setHealth(ship.health + delta),
        // Zoom, range rings and how the fog looks are view state, not game state: they go to the scene,
        // the game never knows about them
        setZoom: view((level: number) => this.view.setZoom(level)),
        toggleRanges: view(() => this.view.toggleRanges()),
        setCameraMode: view((mode: CameraMode) => this.view.setCameraMode(mode)),
        toggleZone: view(() => this.view.toggleZone()),
        toggleFog: view((layer: FogLayer) => this.view.toggleFog(layer)),
        toggleSky: view(() => this.view.toggleSky()),
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
        repair: () => this.cue(orderRepair(game.state, ship)),
        dropQuest: giveUpQuest,
        // The loadout: guns from the hold, bought in port
        fitGun: (weapon, slot, gun) => this.cue(fitFromHold(game.state.player, ship, weapon, slot, gun), 'equip'),
        loadAmmo: (ammo) => ship.loadAmmo(ammo),
        setAmmoSlot: (weapon, index, ammo) => {
          ship.setAmmoSlot(weapon, index, ammo);
          this.sounds.ui('equip');
        },
        // Goods thrown overboard, at sea or in port: they splash down and sink
        throwCargo: (good, count) => this.cue(throwOverboard(ship, good, count), 'splash'),
        changeMaxSpeed: (delta) => ship.tuneSpeeds(delta, 0),
        changeMinSpeed: (delta) => ship.tuneSpeeds(0, delta),
        changeViewRange: (delta) => ship.tuneViewRange(delta),
        addGold: (amount) => giveGold(game.state.player, amount),
        changeLevel: (delta) => this.cue(giveLevels(game.state, ship, delta)),
        // Talents: picked anywhere, forgotten at the shipwright's
        learnTalent: (id) => this.cue(takeTalent(game.state, ship, id), 'talent'),
        resetTalents: () => this.cue(resetTalents(game.state, game.state.player), 'quest'),
        useAbility: () => this.cue(useAbility(game.state, ship)),
        newGame: () => this.newGame(),
        setLanguage: (lang) => this.setLanguage(lang),
        toggleWorld: () => this.hud.toggleWorld(),
      },
      app.screen,
      ship.shipClass,
      this.view.mapAxes,
      {
        name: game.state.world.port.name,
        // In port: game methods like any player action, for the player of this client
        actions: {
          leavePort: () => leavePort(game.state, ship),
          // What it sounds like: a purchase rings, a refusal thuds; gold paid out sounds from the game's events
          buyGun: (gun) => this.cue(buyGun(game.state, game.state.player, gun), 'coins'),
          buyAmmo: (ammo, count) => this.cue(buyAmmo(game.state, game.state.player, ammo, count), 'coinsSmall'),
          sellGun: (gun) => this.cue(sellGun(game.state, game.state.player, gun)),
          sellAmmo: (ammo, count) => this.cue(sellAmmo(game.state, game.state.player, ammo, count)),
          repairInPort: () => this.cue(repairInPort(game.state, game.state.player), 'repair'),
          buyOutfit: (id) => this.cue(buyOutfit(game.state, game.state.player, id), 'coins'),
          fitOutfit: (slot, id) => this.cue(fitOutfit(game.state, game.state.player, slot, id), 'equip'),
          takeQuest: (id) => this.cue(takeQuest(game.state, game.state.player, id), 'quest'),
          turnInQuest: (id) => this.cue(turnInQuest(game.state, game.state.player, id)),
          dropQuest: giveUpQuest,
          sellCargo: (good) => this.cue(sellCargo(game.state, game.state.player, good)),
          // The HUD and the ship's sprite are made for one class of ship: a ship changed reloads the page with it
          buyShip: () => this.reloadIf(buyShip(game.state, game.state.player)),
          takeHelm: (index) => this.reloadIf(takeHelm(game.state, game.state.player, index)),
        },
      },
      { hud: store.slot('hud'), log: store.slot('log'), tracker: store.slot('tracker') },
      game.state.world.zone,
      // The world chart's jump to any sea: for the developer, until the seas are reached only through their gates
      (zone) => this.travel(zone),
    );
    app.stage.addChild(this.view.container, this.hud.container);
    bindPointerInput(app, this.view, ship, this.selection, this.hover, game.state.world.port);
    bindCursor(app, this.view, ship, this.hover);
    bindKeyboardInput(ship, this.selection, {
      toggleLoadout: () => this.hud.toggleLoadout(),
      toggleLog: () => this.hud.toggleLog(),
      toggleMap: () => this.hud.toggleMap(),
      toggleTalents: () => this.hud.toggleTalents(),
      toggleStats: () => this.hud.toggleStats(),
      toggleHold: () => this.hud.toggleHold(),
      toggleMastery: () => this.hud.toggleMastery(),
      toggleWorld: () => this.hud.toggleWorld(),
      useAbility: () => this.cue(useAbility(game.state, ship)),
      repair: () => this.cue(orderRepair(game.state, ship)),
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
      // Sailed into a gate: on to the sea beyond it
      const { departure } = this.game.state.player;
      if (departure) this.travel(departure);
      this.sinceSave += ticker.deltaMS / 1000;
      if (this.sinceSave >= AUTOSAVE) this.save();
      this.forgetLostSelection();
      this.view.update(dt);
      this.sounds.update(this.game.state);
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
          sky: this.view.skyIsShown,
          debug: this.view.debugShown,
          sound: this.sounds.settings,
          renderer: this.renderer,
        },
        this.selection,
      );
    });
  }

  /** What a player's action sounds like: `done` when it worked (or nothing: the game's events sound for it), the
   * refusal's thud when it didn't. Returns whether it worked */
  private cue(worked: boolean, done?: SoundName) {
    if (!worked) this.sounds.ui('error');
    else if (done) this.sounds.ui(done);
    return worked;
  }

  /** Keeps the progress and the combat log */
  private save() {
    if (this.forgetting || this.travelling) return;
    this.sinceSave = 0;
    this.store.set('save', this.game.save());
    this.hud.keep();
  }

  /** Forgets everything kept and starts again: the page reloads with a new player, once the store is written */
  private newGame() {
    this.forgetting = true;
    this.store.clear();
    void this.store.written().then(() => window.location.reload());
  }

  /** If the game changed (a ship bought or changed), keeps the progress and reloads the page, which is made for it */
  private reloadIf(changed: boolean) {
    if (!changed) return false;
    this.save();
    this.store.flush();
    void this.store.written().then(() => window.location.reload());
    return true;
  }

  /**
   * Takes the player to another sea: their progress is kept with their ship coming in there (Game.travel), and the page
   * reloads, its game made for that sea
   */
  private travel(zone: ZoneId) {
    if (this.travelling || this.forgetting) return;
    this.store.set('save', this.game.travel(zone));
    this.hud.keep();
    this.travelling = true;
    this.store.flush();
    void this.store.written().then(() => window.location.reload());
  }

  /** Keeps the language picked and the progress, and reloads the page in it: the HUD's texts are made once */
  private setLanguage(lang: Lang) {
    this.store.set('lang', lang);
    this.reloadIf(true);
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
