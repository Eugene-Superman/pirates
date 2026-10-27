import { SHIP_CLASSES, type GameEvent, type GameState, type Ship } from '../../game';
import type { Slot } from '../storage/Store';

// The game's sounds, made from free recordings (CC0) by blender-assets/sounds/build_sounds.py; sources in CREDITS.md there
const SOUNDS_URL = `${import.meta.env.BASE_URL}sounds`;

interface SoundSpec {
  /** File name without .mp3; with variants, name_1 … name_n, one picked at random every time */
  readonly file: string;
  readonly variants?: number;
  /** Loudness at full volume: the files all peak at the same level, so their balance is set here */
  readonly level: number;
}

const SOUNDS = {
  // Weapons and what their shots do
  cannon: { file: 'cannon', level: 0.85 },
  harpoon: { file: 'harpoon', level: 0.75 },
  hitWood: { file: 'hit_wood', variants: 3, level: 0.7 },
  hitFlesh: { file: 'hit_flesh', variants: 2, level: 0.75 },
  splash: { file: 'splash', level: 0.45 },
  // Monsters: a bite, a growl as one goes for the player, its roar as it dies; a ship going down
  bite: { file: 'bite', level: 0.9 },
  growl: { file: 'growl', level: 0.7 },
  roar: { file: 'roar', level: 0.75 },
  sink: { file: 'sink', level: 0.7 },
  // Loot and gold
  chestDrop: { file: 'chest_drop', level: 0.45 },
  chestOpen: { file: 'chest_open', level: 0.7 },
  cargo: { file: 'cargo', level: 0.6 },
  coins: { file: 'coins', level: 0.55 },
  coinsSmall: { file: 'coins_small', level: 0.5 },
  // Jingles
  levelUp: { file: 'level_up', level: 0.55 },
  victory: { file: 'victory', level: 0.4 },
  questDone: { file: 'quest_done', level: 0.5 },
  pathStep: { file: 'path_step', level: 0.4 },
  // The HUD and the port
  click: { file: 'click', level: 0.3 },
  error: { file: 'error', level: 0.55 },
  equip: { file: 'equip', level: 0.5 },
  quest: { file: 'quest', level: 0.55 },
  talent: { file: 'talent', level: 0.4 },
  bell: { file: 'bell', level: 0.5 },
  // Round the ship: the crew's hammer, its timbers, the gulls near the port, the sea
  repair: { file: 'repair', level: 0.3 },
  creak: { file: 'creak', variants: 2, level: 0.22 },
  gull: { file: 'gull', variants: 4, level: 0.28 },
  sea: { file: 'sea', level: 0.2 },
} as const satisfies Record<string, SoundSpec>;
export type SoundName = keyof typeof SOUNDS;

const MORTAR_GAIN = 1.2; // a boss's mortar firing, by the cannon's level
const PITCH_SPREAD = 0.07; // ± share of speed a sound plays at, so a run of them doesn't sound like a loop
// A volley of more guns sounds louder, up to this many times one gun; from VOLLEY_LAYER guns a second shot follows a
// moment later, for the rumble of a broadside
const VOLLEY_GAIN = 0.12; // per gun after the first
const VOLLEY_MAX = 1.6;
const VOLLEY_LAYER = 3;
const LAYER_DELAY = [0.04, 0.09] as const; // seconds
const LAYER_GAIN = 0.55;
// A monster's bite and cries are played slower for a big one, quicker for a lithe one (speed of the recording)
const VOICE: Partial<Record<string, number>> = { seaTurtle: 0.82, seaSerpent: 1.08 };
// Sounds fade out with their distance from the player's ship: full up to NEAR, silent beyond FAR (world units)
const HEARING = { near: 300, far: 1000 } as const;
// The same sound of the sea round the ship at most this many times in one update: a barrage's shells land together,
// and four of one splash on top of each other only clip
const SAME_SOUND_MAX = 2;
const GROWL_AGAIN = 10; // seconds before the same monster growls again as it goes for the player
const CREAK_EVERY = [5, 12] as const; // seconds between two creaks of the ship's timbers while it sails
const CREAK_SPEED = 0.25; // share of its top speed the ship sails at, at least, to creak
const GULL_EVERY = [2.5, 7] as const; // seconds between two gulls' cries near the port
const GULL_REACH = 700; // world units from the port's island where the gulls are heard, fading out
const SEA_FADE = 2.5; // seconds the sea's loop crossfades into itself
const VOLUME_STEP = 0.1;
const DEFAULTS: SoundSettings = { enabled: true, volume: 0.7 };

export interface SoundSettings {
  readonly enabled: boolean;
  /** 0…1 */
  readonly volume: number;
}

/** The player's choice as kept between visits; the defaults when there is none, or it is broken */
function readSettings(saved: unknown): SoundSettings {
  if (typeof saved === 'object' && saved !== null && 'enabled' in saved && 'volume' in saved) {
    const { enabled, volume } = saved;
    if (typeof enabled === 'boolean' && typeof volume === 'number' && Number.isFinite(volume)) {
      return { enabled, volume: Math.min(Math.max(volume, 0), 1) };
    }
  }
  return DEFAULTS;
}

/** A random number between two, for when a sound comes next. Cosmetic, so Math.random is fine here */
function between([low, high]: readonly [number, number]) {
  return low + Math.random() * (high - low);
}

/**
 * The game's sounds, through the Web Audio API: every sound decoded once, then played as many times as needed,
 * overlapping, each with its own loudness and pitch. Browsers let a page make sound only after the player has
 * clicked or pressed a key, so nothing is loaded or played until then.
 * What the game does (its events) is heard where it happens, quieter the farther from the player's ship; the HUD's
 * sounds (`ui`) are heard as they are. Under it all the sea, and round the ship its timbers and the port's gulls
 */
export class Sounds {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private current: SoundSettings;
  /** Where the player's choice is kept between visits */
  private readonly kept: Slot;
  /** The chests already afloat: a new one splashes down */
  private chests: Set<number> | null = null;
  private docked: boolean | null = null;
  /** When each monster last growled at the player, by id, and the ones going for them as of the last update */
  private readonly growls = new Map<number, number>();
  private hunters = new Set<number>();
  private nextCreak = 0;
  private nextGull = 0;
  /** When the sea's loop is next started over, crossfading: the audio's own clock, which game time can lag behind */
  private seaAt = 0;

  constructor(kept: Slot) {
    this.kept = kept;
    this.current = readSettings(kept.get());
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.start();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get settings(): SoundSettings {
    return this.current;
  }

  toggle() {
    this.apply({ ...this.current, enabled: !this.current.enabled });
  }

  /** Changes the volume by steps of VOLUME_STEP (−1 one step down, +1 one up) */
  changeVolume(steps: number) {
    const volume = Math.round((this.current.volume + steps * VOLUME_STEP) * 10) / 10;
    this.apply({ ...this.current, volume: Math.min(Math.max(volume, 0), 1) });
  }

  /** A sound of the HUD (a button, a purchase, a refusal): heard as it is, wherever the ship is */
  ui(name: SoundName) {
    if (this.current.enabled) this.play(name, 1, 0);
  }

  /** Plays what this update's events sound like, and the sounds round the player's ship */
  update(state: GameState) {
    const listener = state.ship;
    const firstUpdate = this.chests === null;
    const fresh = state.chests.filter((chest) => !this.chests?.has(chest.id));
    this.chests = new Set(state.chests.map((chest) => chest.id));
    const wasDocked = this.docked;
    this.docked = listener.docked;
    if (!this.current.enabled || !this.context) return;

    const hearing = (at: { x: number; y: number }) => {
      const distance = Math.hypot(at.x - listener.x, at.y - listener.y);
      return 1 - Math.min(Math.max((distance - HEARING.near) / (HEARING.far - HEARING.near), 0), 1);
    };
    const played = new Map<SoundName, number>();
    const near = (name: SoundName, at: { x: number; y: number }, gain = 1, rate = 1) => {
      const heard = hearing(at);
      const times = played.get(name) ?? 0;
      if (heard <= 0 || times >= SAME_SOUND_MAX) return;
      played.set(name, times + 1);
      this.play(name, gain * heard, 0, rate);
    };
    const mine = (event: GameEvent) => 'shipId' in event && event.shipId === listener.id;
    const happened = (type: GameEvent['type']) => state.events.some((e) => e.type === type && mine(e));
    // One jingle at a time: a level beats a quest, a quest beats a kill
    const leveled = happened('level');
    const paid = (reason: string) => state.events.some((e) => e.type === 'gold' && mine(e) && e.reason === reason);

    for (const event of state.events) {
      switch (event.type) {
        case 'shot':
          this.shot(event, hearing(event.at));
          break;
        case 'barrage':
          near('cannon', event.at, MORTAR_GAIN);
          break;
        case 'shellLanded':
          near('splash', event.at, 1.2);
          break;
        case 'damage': {
          if (event.source === 'bite') break;
          if (event.amount <= 0) near('splash', event.at);
          else near(SHIP_CLASSES[event.targetKind].nature === 'creature' ? 'hitFlesh' : 'hitWood', event.at);
          break;
        }
        case 'bite': {
          const attacker = state.ships.find((s) => s.id === event.attackerId);
          near('bite', event.at, 1, (attacker && VOICE[attacker.shipClass.id]) ?? 1);
          break;
        }
        case 'destroyed':
          if (SHIP_CLASSES[event.kind].nature === 'creature') {
            near('roar', event.at, 1, VOICE[event.kind] ?? 1);
            near('splash', event.at, 1.4, 0.7);
          } else near('sink', event.at);
          break;
        case 'gold':
          if (!mine(event)) break;
          if (event.reason === 'bounty') {
            this.play('coins', 1, 0.15);
            if (!leveled) this.play('victory', 1, 0.3);
          } else if (event.reason === 'chest') this.play('chestOpen', 1, 0);
          else if (event.reason === 'quest') {
            this.play('coins', 1, 0);
            if (!leveled) this.play('questDone', 1, 0.1);
          } else this.play('coins', 1, 0);
          break;
        case 'cargo':
          if (mine(event) && !paid('chest')) this.play('cargo', 1, 0);
          break;
        case 'holdFull':
        case 'gateClosed':
        case 'repairStopped':
          if (mine(event)) this.play('error', 1, 0);
          break;
        case 'level':
          if (mine(event)) this.play('levelUp', 1, 0.2);
          break;
        case 'pathStep':
          if (mine(event) && !leveled && !paid('quest')) this.play('pathStep', 1, 0.6);
          break;
        case 'repair':
          if (mine(event)) this.play('repair', 1, 0);
          break;
        case 'talent':
          if (mine(event)) this.play('talent', 1, 0);
          break;
        default:
          break;
      }
    }
    // A chest dropped into the sea; not the ones afloat when the game started
    if (!firstUpdate) for (const chest of fresh) near('chestDrop', chest);
    if (wasDocked === false && listener.docked) this.play('bell', 1, 0);
    this.growl(state, near);
    this.ambience(state, listener);
  }

  private shot(event: Extract<GameEvent, { type: 'shot' }>, hearing: number) {
    if (hearing <= 0) return;
    const guns = event.muzzles.length;
    const gain = hearing * Math.min(1 + VOLLEY_GAIN * (guns - 1), VOLLEY_MAX);
    this.play(event.weapon, gain, 0);
    if (guns >= VOLLEY_LAYER) this.play(event.weapon, gain * LAYER_GAIN, between(LAYER_DELAY));
  }

  /** A monster growls as it goes for the player's ship, once in a while */
  private growl(state: GameState, near: (name: SoundName, at: Ship, gain?: number, rate?: number) => void) {
    const hunters = new Set<number>();
    for (const ship of state.ships) {
      if (ship.shipClass.nature !== 'creature' || ship.attackTarget !== state.ship.id) continue;
      hunters.add(ship.id);
      if (this.hunters.has(ship.id)) continue;
      const last = this.growls.get(ship.id);
      if (last !== undefined && state.time - last < GROWL_AGAIN) continue;
      this.growls.set(ship.id, state.time);
      near('growl', ship, 1, VOICE[ship.shipClass.id] ?? 1);
    }
    this.hunters = hunters;
  }

  /** The sea all the time, the ship's timbers creaking as it sails, gulls near the port */
  private ambience(state: GameState, ship: Ship) {
    const { time } = state;
    const buffer = this.buffers.get(SOUNDS.sea.file);
    if (buffer && this.context && this.context.currentTime >= this.seaAt) {
      this.loopOnce(buffer);
      this.seaAt = this.context.currentTime + buffer.duration - SEA_FADE;
    }
    if (time >= this.nextCreak) {
      this.nextCreak = time + between(CREAK_EVERY);
      if (!ship.docked && !ship.isSinking && ship.speed > ship.maxSpeed * CREAK_SPEED) this.play('creak', 1, 0);
    }
    if (time >= this.nextGull) {
      this.nextGull = time + between(GULL_EVERY);
      const { island } = state.world.port;
      const distance = Math.hypot(ship.x - island.x, ship.y - island.y) - island.reach;
      const heard = 1 - Math.min(Math.max(distance / GULL_REACH, 0), 1);
      if (heard > 0) this.play('gull', heard, 0, 1 + (Math.random() - 0.5) * 0.2);
    }
  }

  /** One play of the sea's loop, fading in and out, so the next one crossfades into it */
  private loopOnce(buffer: AudioBuffer) {
    const { context, master } = this;
    if (!context || !master) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const level = context.createGain();
    const now = context.currentTime;
    const end = now + buffer.duration;
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(SOUNDS.sea.level, now + SEA_FADE);
    level.gain.setValueAtTime(SOUNDS.sea.level, end - SEA_FADE);
    level.gain.linearRampToValueAtTime(0, end);
    source.connect(level).connect(master);
    source.start(now);
  }

  private apply(settings: SoundSettings) {
    this.current = settings;
    this.kept.set(settings);
    if (this.master) this.master.gain.value = settings.enabled ? settings.volume : 0;
  }

  private start() {
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);
    this.apply(this.current);
    for (const spec of Object.values(SOUNDS)) {
      const variants = 'variants' in spec ? spec.variants : 0;
      const files = variants > 0 ? Array.from({ length: variants }, (_, i) => `${spec.file}_${i + 1}`) : [spec.file];
      for (const file of files) {
        fetch(`${SOUNDS_URL}/${file}.mp3`)
          .then((response) => response.arrayBuffer())
          .then((data) => context.decodeAudioData(data))
          .then((buffer) => this.buffers.set(file, buffer))
          .catch((error) => console.warn(`Sound ${file} failed to load`, error));
      }
    }
  }

  /** One play of a sound (a variant of it at random), `delay` seconds from now, at a slightly random pitch */
  private play(name: SoundName, gain: number, delay: number, rate = 1) {
    const { context, master } = this;
    const spec: SoundSpec = SOUNDS[name];
    const variants = spec.variants ?? 0;
    const file = variants > 0 ? `${spec.file}_${1 + Math.floor(Math.random() * variants)}` : spec.file;
    const buffer = this.buffers.get(file);
    if (!context || !master || !buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * PITCH_SPREAD);
    const level = context.createGain();
    level.gain.value = spec.level * gain;
    source.connect(level).connect(master);
    source.start(context.currentTime + delay);
  }
}
