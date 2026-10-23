import type { GameEvent, Ship } from '../../game';

// Shot sounds, made from free recordings (CC0) by blender-assets/sounds/build_sounds.py; sources in CREDITS.md there
const SOUNDS_URL = `${import.meta.env.BASE_URL}sounds`;
const SOUND_NAMES = ['cannon', 'harpoon'] as const;
type SoundName = (typeof SOUND_NAMES)[number];

/** Loudness of each sound at full volume: the files all peak at the same level, so their balance is set here */
const LEVELS: Readonly<Record<SoundName, number>> = { cannon: 0.85, harpoon: 0.7 };
const PITCH_SPREAD = 0.07; // ± share of speed a shot plays at, so a run of shots doesn't sound like a loop
// A volley of more guns sounds louder, up to this many times one gun; from VOLLEY_LAYER guns a second shot follows a
// moment later, for the rumble of a broadside
const VOLLEY_GAIN = 0.12; // per gun after the first
const VOLLEY_MAX = 1.6;
const VOLLEY_LAYER = 3;
const LAYER_DELAY = [0.04, 0.09] as const; // seconds
const LAYER_GAIN = 0.55;
// Shots fade out with their distance from the player's ship: full up to NEAR, silent beyond FAR (world units)
const HEARING = { near: 300, far: 1000 } as const;
const VOLUME_STEP = 0.1;
const DEFAULTS: SoundSettings = { enabled: true, volume: 0.7 };
// The player's choice, kept between visits. Only a convenience: without storage the defaults apply
const STORAGE_KEY = 'pirate-game.sound';

export interface SoundSettings {
  readonly enabled: boolean;
  /** 0…1 */
  readonly volume: number;
}

function loadSettings(): SoundSettings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof saved === 'object' && saved !== null && 'enabled' in saved && 'volume' in saved) {
      const { enabled, volume } = saved;
      if (typeof enabled === 'boolean' && typeof volume === 'number') {
        return { enabled, volume: Math.min(Math.max(volume, 0), 1) };
      }
    }
  } catch {
    // Storage blocked or broken: the defaults
  }
  return DEFAULTS;
}

function saveSettings(settings: SoundSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not kept for the next visit, that's all
  }
}

/**
 * The game's sounds, through the Web Audio API: every sound decoded once, then played as many times as needed,
 * overlapping, each with its own loudness and pitch. Browsers let a page make sound only after the player has
 * clicked or pressed a key, so nothing is loaded or played until then
 */
export class Sounds {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private current = loadSettings();

  constructor() {
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

  /** Plays what this update's events sound like: one shot per volley, quieter the farther it is from `listener` */
  update(events: readonly GameEvent[], listener: Ship) {
    if (!this.current.enabled || !this.context) return;
    for (const event of events) {
      if (event.type !== 'shot') continue;
      const distance = Math.hypot(event.at.x - listener.x, event.at.y - listener.y);
      const hearing = 1 - Math.min(Math.max((distance - HEARING.near) / (HEARING.far - HEARING.near), 0), 1);
      if (hearing <= 0) continue;
      const guns = event.muzzles.length;
      const gain = LEVELS[event.weapon] * hearing * Math.min(1 + VOLLEY_GAIN * (guns - 1), VOLLEY_MAX);
      this.play(event.weapon, gain, 0);
      if (guns >= VOLLEY_LAYER) {
        const delay = LAYER_DELAY[0] + Math.random() * (LAYER_DELAY[1] - LAYER_DELAY[0]);
        this.play(event.weapon, gain * LAYER_GAIN, delay);
      }
    }
  }

  private apply(settings: SoundSettings) {
    this.current = settings;
    saveSettings(settings);
    if (this.master) this.master.gain.value = settings.enabled ? settings.volume : 0;
  }

  private start() {
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);
    this.apply(this.current);
    for (const name of SOUND_NAMES) {
      fetch(`${SOUNDS_URL}/${name}.mp3`)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => this.buffers.set(name, buffer))
        .catch((error) => console.warn(`Sound ${name} failed to load`, error));
    }
  }

  /** One play of a sound, `delay` seconds from now, at a slightly random pitch */
  private play(name: SoundName, gain: number, delay: number) {
    const { context, master } = this;
    const buffer = this.buffers.get(name);
    if (!context || !master || !buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    // Cosmetic, so Math.random is fine here
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH_SPREAD;
    const level = context.createGain();
    level.gain.value = gain;
    source.connect(level).connect(master);
    source.start(context.currentTime + delay);
  }
}
