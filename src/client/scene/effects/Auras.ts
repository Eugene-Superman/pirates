import { hullReach, isHostile, type Ship, type Unit, type UnitKind } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';
import { SEA_LOOK } from './seaLook';
import { AURA_LIGHTS, type WaterAura } from './seaSurface';

/** What an aura's colour says of its unit: one the story asks the player to sink, or how it stands to them */
type AuraKind = 'story' | 'hostile' | 'neutral' | 'friendly';

// Each kind's light in the water. The story's gold (the lighthouse's, as at a level reached); red for a foe; green for
// a neutral unit, as the HUD names its temper; blue for a friend (another player's ship, online)
const COLORS: Readonly<Record<AuraKind, number>> = {
  story: 0xffb547,
  hostile: 0xff3b2e,
  neutral: 0x35d66a,
  friendly: 0x3cb4ff,
};
const SPREAD = 2.6; // its light in the water reaches this many times as far as the unit's hull
// How bright the aura round the story's prey is while the player neither picks it out nor fires at it (theirs: 1)
const PREY_LIGHT = 0.75;
const FADE = 0.3; // seconds an aura takes to come or go, or to brighten
const COLOR_EASE = 5; // the share of the way to a new colour (a neutral unit turned on the player) it goes a second
// Till the sea's maps load there is no light in the water: a ring on it instead, world units beyond the hull and wide
const RING = { pad: 6, width: 1.6, alpha: 0.8 } as const;

function rgb(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

// Each kind's colour as the sea's shader takes it
const WATER: Readonly<Record<AuraKind, readonly [number, number, number]>> = {
  story: rgb(COLORS.story),
  hostile: rgb(COLORS.hostile),
  neutral: rgb(COLORS.neutral),
  friendly: rgb(COLORS.friendly),
};

/** A slot for one unit's aura, while it shows or fades */
interface Aura {
  /** The unit's id; it keeps the slot till its light has gone */
  key: number | null;
  x: number;
  y: number;
  /** World units: how far its hull reaches from its middle */
  reach: number;
  kind: AuraKind;
  /** How much of it shows (0..1), and how bright it is */
  shown: number;
  light: number;
  /** Its colour in the water now, easing to its kind's */
  readonly color: [number, number, number];
  /** How far its rings have spread (0..1) */
  rings: number;
}

/** What a unit's aura is to be this frame */
interface Wanted {
  readonly unit: Unit;
  readonly kind: AuraKind;
  readonly light: number;
  readonly firing: boolean;
}

/**
 * The auras round the units the player should see marked: the one they fire at, the one they picked out and what the
 * story asks them to sink, like the light round their ship at a level reached without its pillar: a pool of light in
 * the water and rings of it spreading, bent by the waves (the sea's shader draws it, `water`). Gold round the story's
 * prey, else red round a foe, green round a neutral unit, blue round a friend; the prey's dimmer till the player picks
 * it out or fires at it, and the rings quicker round the target while the ship fires. Each comes in and goes softly
 */
export class Auras {
  private readonly auras: Aura[] = Array.from({ length: AURA_LIGHTS }, () => ({
    key: null,
    x: 0,
    y: 0,
    reach: 0,
    kind: 'neutral',
    shown: 0,
    light: 0,
    color: [0, 0, 0],
    rings: 0,
  }));

  /**
   * units: those in sight; player: the player's ship; picked: the unit picked out, if any; targets: the kinds the story
   * asks the player to sink
   */
  update(dt: number, units: readonly Unit[], player: Ship, picked: number | null, targets: readonly UnitKind[]) {
    const wanted: Wanted[] = [];
    for (const unit of units) {
      const fired = unit.id === player.attackTarget;
      const prey = targets.includes(unit.shipClass.id);
      if (!fired && !prey && unit.id !== picked) continue;
      const kind = prey ? 'story' : !unit.bot ? 'friendly' : isHostile(unit, player.id) ? 'hostile' : 'neutral';
      const light = fired || unit.id === picked ? 1 : PREY_LIGHT;
      wanted.push({ unit, kind, light, firing: fired && player.holdReason === null });
    }
    // The target and the unit picked out first: the rest of the prey get what slots are left
    wanted.sort((a, b) => b.light - a.light);
    const free = [...this.auras];
    for (const want of wanted) {
      const own = free.findIndex((aura) => aura.key === want.unit.id);
      const index = own >= 0 ? own : free.findIndex((aura) => aura.shown === 0);
      if (index < 0) continue;
      const [aura] = free.splice(index, 1);
      this.come(aura, want, dt);
    }
    for (const aura of free) {
      aura.shown = Math.max(0, aura.shown - dt / FADE);
      aura.rings = (aura.rings + dt / SEA_LOOK.aura.ringPeriod) % 1;
      // Fading round a unit still in sight, it goes with it
      const unit = units.find((u) => u.id === aura.key);
      if (unit) this.follow(aura, unit);
    }
  }

  private come(aura: Aura, want: Wanted, dt: number) {
    // A slot taken by another unit has its brightness and colour at once
    const fresh = aura.key !== want.unit.id;
    aura.key = want.unit.id;
    this.follow(aura, want.unit);
    aura.kind = want.kind;
    aura.shown = Math.min(1, aura.shown + dt / FADE);
    const step = fresh ? 1 : dt / FADE;
    aura.light += Math.max(-step, Math.min(step, want.light - aura.light));
    const target = WATER[want.kind];
    const ease = fresh ? 1 : Math.min(1, dt * COLOR_EASE);
    for (let i = 0; i < 3; i++) aura.color[i] += (target[i] - aura.color[i]) * ease;
    const { ringPeriod, firingPeriod } = SEA_LOOK.aura;
    aura.rings = (aura.rings + dt / (want.firing ? firingPeriod : ringPeriod)) % 1;
  }

  private follow(aura: Aura, unit: Unit) {
    aura.x = unit.x;
    aura.y = unit.y;
    aura.reach = hullReach(unit.hull);
  }

  /** How much of an aura shows, eased in and out, and as bright as it is */
  private strength(aura: Aura) {
    const s = aura.shown;
    return s * s * (3 - 2 * s) * aura.light;
  }

  /** For the sea's shader: each aura's light in the water, null where none shows */
  get water(): (WaterAura | null)[] {
    return this.auras.map((aura) =>
      aura.shown > 0
        ? {
            x: aura.x,
            y: aura.y,
            radius: aura.reach * SPREAD,
            shown: this.strength(aura),
            color: aura.color,
            rings: aura.rings,
          }
        : null,
    );
  }

  /** Till the sea's maps load, which light the water: a ring on it round each unit */
  drawWater(p: Painter3D) {
    for (const aura of this.auras) {
      if (aura.shown <= 0) continue;
      const radius = aura.reach + RING.pad;
      p.ring(aura.x, aura.y, 0, radius, RING.width, COLORS[aura.kind], RING.alpha * this.strength(aura));
    }
  }
}
