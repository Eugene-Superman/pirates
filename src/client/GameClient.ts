import type { Application } from 'pixi.js';
import {
  buyAmmo,
  buyGun,
  buyItem,
  buyOutfit,
  buyShip,
  choosePortrait,
  claimFeat,
  dropQuest,
  findUnit,
  fitFromHold,
  fitOutfit,
  forgetMastery,
  giveDoubloons,
  giveGold,
  giveLevels,
  isAfloat,
  repairInPort,
  resetTalents,
  seePrologue,
  setSail,
  sellAmmo,
  sellCargo,
  sellGun,
  setQuickSlot,
  skipStoryStep,
  swapQuickSlots,
  throwOverboard,
  takeHelm,
  takeBounty,
  takePassive,
  takeTalent,
  tellStory,
  toggleRepair,
  turnInQuest,
  useAbility,
  type ActiveQuest,
  type Game,
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
import type { NavDebug } from './scene/effects/navDebug';
import { isLang, lang as langPicked, setLang, startingLang, type Lang } from './i18n/i18n';
import { SceneView } from './scene/SceneView';
import type { Store } from './storage/Store';

const MAX_DT = 0.05; // seconds: a long frame (tab in background) must not teleport the ship
const AUTOSAVE = 5; // seconds of play between two saves of the progress and the log; and whenever the page is hidden
// The landing, where logging out goes: at the site's root in English, its Ukrainian and Russian in their own folders
const LANDING = import.meta.env.BASE_URL;

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
    // The language the landing was read in, when the player came from it (play/?lang=uk): kept as picked, the address
    // left plain. Before anything with text is made
    const url = new URL(window.location.href);
    const asked = url.searchParams.get('lang');
    if (isLang(asked)) store.set('lang', asked);
    if (url.searchParams.has('lang')) {
      url.searchParams.delete('lang');
      window.history.replaceState(null, '', url);
    }
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
    // The ship sailed now, read at each action: another may be bought or taken in port
    const ship = () => game.state.ship;
    // Given up at the tavern or from the quest tracker, at sea too and another ship's, once the player has said yes
    const giveUpQuest = (quest: ActiveQuest) => {
      if (dropQuest(game.state.player, quest.ship, quest.id)) this.sounds.ui('quest');
    };
    // The HUD's buttons act through the game's methods like any player action (the damage ones are for testing)
    this.hud = new Hud(
      {
        setHealth: (health) => ship().setHealth(health),
        changeHealth: (delta) => ship().setHealth(ship().health + delta),
        // Zoom, range rings and the debug drawings are view state, not game state: they go to the scene,
        // the game never knows about them
        setZoom: view((level: number) => this.view.setZoom(level)),
        toggleRanges: view(() => this.view.toggleRanges()),
        toggleDebug: view((kind: NavDebug) => this.view.toggleDebug(kind)),
        toggleSound: () => this.sounds.toggle(),
        changeVolume: (steps) => this.sounds.changeVolume(steps),
        setWeapon: (weapon) => ship().setWeapon(weapon),
        toggleFire: () => {
          const { id } = this.selection;
          if (id === null) return;
          if (ship().attackTarget === id) ship().ceaseFire();
          else ship().attack(id);
        },
        repair: () => this.cue(toggleRepair(game.state, ship())),
        dropQuest: giveUpQuest,
        choosePortrait: (portrait) => this.cue(choosePortrait(game.state.player, portrait), 'equip'),
        // The loadout: guns from the hold, bought in port
        fitGun: (weapon, slot, gun) => this.cue(fitFromHold(game.state.player, ship(), weapon, slot, gun), 'equip'),
        swapGuns: (weapon, from, to) => this.cue(ship().swapGuns(weapon, from, to), 'equip'),
        loadAmmo: (ammo) => ship().loadAmmo(ammo),
        setAmmoSlot: (weapon, index, ammo) => {
          ship().setAmmoSlot(weapon, index, ammo);
          this.sounds.ui('equip');
        },
        // Goods thrown overboard, at sea or in port: they splash down and sink
        throwCargo: (good, count) => this.cue(throwOverboard(ship(), good, count), 'splash'),
        // The items bought for doubloons, put on the skill bar's quick slots from the hold, anywhere
        setQuickSlot: (slot, item) => this.cue(setQuickSlot(game.state.player, slot, item), 'equip'),
        swapQuickSlots: (from, to) => this.cue(swapQuickSlots(game.state.player, from, to), 'equip'),
        changeMaxSpeed: (delta) => ship().tuneSpeeds(delta, 0),
        changeMinSpeed: (delta) => ship().tuneSpeeds(0, delta),
        changeViewRange: (delta) => ship().tuneViewRange(delta),
        addGold: (amount) => giveGold(game.state.player, amount),
        addDoubloons: (amount) => giveDoubloons(game.state.player, amount),
        changeLevel: (delta) => this.cue(giveLevels(game.state, ship(), delta)),
        skipStory: () => this.cue(skipStoryStep(game.state, game.state.player)),
        // The story: a conversation heard out moves it on, as any player's action does (online, a command)
        tellStory: (key) => tellStory(game.state, game.state.player, key),
        seePrologue: () => seePrologue(game.state.player),
        // Talents: picked anywhere, forgotten at the shipwright's
        learnTalent: (id) => this.cue(takeTalent(ship(), id), 'talent'),
        resetTalents: () => this.cue(resetTalents(game.state, game.state.player), 'quest'),
        // The captain's mastery: taken anywhere, forgotten in port
        takePassive: (id) => this.cue(takePassive(game.state, game.state.player, id), 'talent'),
        forgetMastery: () => this.cue(forgetMastery(game.state, game.state.player), 'quest'),
        // A feat's reward, claimed anywhere: the doubloons ring
        claimFeat: (id) => this.cue(claimFeat(game.state, game.state.player, id), 'coins'),
        useAbility: (slot) => this.useAbility(slot),
        newGame: () => this.newGame(),
        logOut: () => this.logOut(),
        setLanguage: (lang) => this.setLanguage(lang),
        editLayout: () => this.hud.editLayout(),
      },
      app.screen,
      ship().shipClass,
      this.view.mapAxes,
      {
        name: game.state.world.port.name,
        // In port: game methods like any player action, for the player of this client
        actions: {
          // The story keeps the ship in port while its guns wait in the hold
          leavePort: () => setSail(game.state, game.state.player),
          // What it sounds like: a purchase rings, a refusal thuds; gold paid out sounds from the game's events
          buyGun: (gun) => this.cue(buyGun(game.state, game.state.player, gun), 'coins'),
          buyAmmo: (ammo, count) => this.cue(buyAmmo(game.state, game.state.player, ammo, count), 'coinsSmall'),
          sellGun: (gun) => this.cue(sellGun(game.state, game.state.player, gun)),
          sellAmmo: (ammo, count) => this.cue(sellAmmo(game.state, game.state.player, ammo, count)),
          repairInPort: () => this.cue(repairInPort(game.state, game.state.player), 'repair'),
          buyOutfit: (id) => this.cue(buyOutfit(game.state, game.state.player, id), 'coins'),
          fitOutfit: (slot, id) => this.cue(fitOutfit(game.state, game.state.player, slot, id), 'equip'),
          // The story keeps the tavern shut till it brings the player home from the Baron's waters
          takeQuest: (id) => this.cue(takeBounty(game.state, game.state.player, id), 'quest'),
          turnInQuest: (id) => this.cue(turnInQuest(game.state, game.state.player, id)),
          dropQuest: giveUpQuest,
          sellCargo: (good) => this.cue(sellCargo(game.state, game.state.player, good)),
          buyItem: (id, count) => this.cue(buyItem(game.state, game.state.player, id, count), 'coins'),
          // The new ship at the helm in port: the scene and the HUD follow it from the next frame on
          buyShip: (id, unload) => this.cue(buyShip(game.state, game.state.player, id, unload), 'coins'),
          takeHelm: (index) => this.cue(takeHelm(game.state, game.state.player, index), 'equip'),
        },
      },
      {
        hud: store.slot('hud'),
        layout: store.slot('layout'),
        log: store.slot('log'),
        tracker: store.slot('tracker'),
        tips: store.slot('tips'),
      },
      game.state.world.zone,
      // The world chart's jump to any sea: for the developer, until the seas are reached only through their gates
      (zone) => this.travel(zone),
    );
    app.stage.addChild(this.view.container, this.hud.container);
    bindPointerInput(app, this.view, game.state, this.selection, this.hover);
    bindCursor(app, this.view, game.state, this.hover);
    bindKeyboardInput(game.state, this.selection, {
      toggleLoadout: () => this.hud.toggleLoadout(),
      toggleLog: () => this.hud.toggleLog(),
      toggleMap: () => this.hud.toggleMap(),
      toggleTalents: () => this.hud.toggleTalents(),
      toggleStats: () => this.hud.toggleStats(),
      toggleHold: () => this.hud.toggleHold(),
      toggleMastery: () => this.hud.toggleMastery(),
      toggleWorld: () => this.hud.toggleWorld(),
      toggleBestiary: () => this.hud.toggleBestiary(),
      useAbility: (slot) => this.useAbility(slot),
      repair: () => this.cue(toggleRepair(game.state, ship())),
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
          ranges: this.view.rangesShown,
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

  /**
   * The player's ship's ability in a slot (F, G, T): a rocket flies at the unit it attacks, or else the one picked
   * out, and the shells of a bombardment fall round it
   */
  private useAbility(slot: number) {
    const { ship } = this.game.state;
    return this.cue(useAbility(this.game.state, ship, slot, ship.attackTarget ?? this.selection.id));
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

  /**
   * Keeps the progress and leaves for the landing, once the store is written. There is no account to sign out of until
   * the server: signing in again comes back to the same progress
   */
  private logOut() {
    this.save();
    this.store.flush();
    void this.store.written().then(() => window.location.assign(landing()));
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
    this.save();
    this.store.flush();
    void this.store.written().then(() => window.location.reload());
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

/** The landing in the language the game is read in: the English one at the site's root, the others in their folders */
function landing() {
  const picked = langPicked();
  return picked === 'en' ? LANDING : `${LANDING}${picked}/`;
}
