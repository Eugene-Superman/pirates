import { AMMO, AMMO_IDS, OFF_TARGET_SHARE, WEAPONS, type GameState, type WeaponId } from '../../game';
import type { Slot } from '../storage/Store';
import { t } from '../i18n/i18n';
import type { Talk, TalkLine } from './DialogueBox';

/** What the bosun tells a new captain the first time it happens */
type TipId = 'wrongWeapon' | 'noGuns' | 'notAtHand' | 'noAmmo' | 'lowAmmo' | 'holdFull' | 'dive' | 'ink' | 'brood';
const TIP_IDS: readonly TipId[] = [
  'wrongWeapon',
  'noGuns',
  'notAtHand',
  'noAmmo',
  'lowAmmo',
  'holdFull',
  'dive',
  'ink',
  'brood',
];

const TIMES = 1; // times each tip is given, in all: once told, the player knows, and more of it only nags
const LASTS = 9; // seconds a tip stays at the bottom of the screen, unless Done is pressed
const LOW_AMMO = 25; // shots of the ammo loaded left, and none other of its weapon aboard: time to think of the arsenal

/** The keys the weapons are picked with, for the tips' words */
const WEAPON_KEYS: Readonly<Record<WeaponId, string>> = { cannon: 'Q', harpoon: 'E' };

/** A line of the bosun's */
function bosun(text: string, params?: TalkLine['params']): TalkLine {
  return { speaker: 'bosun', text, params };
}

/** A weapon's name in a sentence, lower case */
function weapon(id: WeaponId) {
  return t(WEAPONS[id].name).toLowerCase();
}

/**
 * The bosun's tips: a line in the story's conversation box when the player does something the wrong way (cannonballs
 * at a beast, harpoons at a hull) or runs short (no guns fitted, no ammo at hand or left, a full hold), the first time
 * each happens (TIMES), and never while the story has something to say. How often each was given is kept in the
 * browser, so a New game gives them again
 */
export class Tips {
  private readonly kept: Slot;
  private readonly given: Record<TipId, number>;
  private current: Talk | null = null;
  /** Counts the tips given, for a key of its own each: the same tip again starts from its first line */
  private serial = 0;

  constructor(kept: Slot) {
    this.kept = kept;
    const saved = kept.get();
    this.given = {
      wrongWeapon: 0,
      noGuns: 0,
      notAtHand: 0,
      noAmmo: 0,
      lowAmmo: 0,
      holdFull: 0,
      dive: 0,
      ink: 0,
      brood: 0,
    };
    if (typeof saved === 'object' && saved !== null) {
      for (const id of TIP_IDS) {
        const n: unknown = Reflect.get(saved, id);
        if (typeof n === 'number' && Number.isInteger(n) && n >= 0) this.given[id] = n;
      }
    }
  }

  /**
   * The tip to show now, if any: the one shown, or a new one this update's events or the ship call for. `quiet`: the
   * story is talking, or a window is over the box; no tip starts then
   */
  update(state: GameState, quiet: boolean): Talk | null {
    if (this.current || quiet) return this.current;
    const due = this.due(state);
    if (!due) return null;
    const [id, line] = due;
    this.given[id]++;
    this.kept.set({ ...this.given });
    this.current = { key: `tip:${id}:${this.serial++}`, lines: [line], lasts: LASTS };
    return this.current;
  }

  /** The conversation of this key was heard out, or went by itself: whether it was a tip (the story's are not) */
  heard(key: string) {
    if (this.current?.key !== key) return false;
    this.current = null;
    return true;
  }

  /** The first tip the moment calls for that is still to be given, and its line */
  private due(state: GameState): readonly [TipId, TalkLine] | null {
    const { ship } = state;
    const may = (id: TipId) => this.given[id] < TIMES && !ship.isSinking;
    const loaded = ship.loaded[ship.weapon];
    for (const event of state.events) {
      if (event.type === 'damage' && event.attackerId === ship.id && !event.full && may('wrongWeapon')) {
        if (event.source !== 'cannon' && event.source !== 'harpoon') continue;
        const better: WeaponId = event.source === 'cannon' ? 'harpoon' : 'cannon';
        const text =
          event.source === 'cannon'
            ? 'Cannonballs barely scratch a beast, captain: {share}% of their damage. Harpoons do it all: take them ({key}).'
            : 'Harpoons barely scratch a hull, captain: {share}% of their damage. Cannons do it all: take them ({key}).';
        return ['wrongWeapon', bosun(text, { share: OFF_TARGET_SHARE * 100, key: WEAPON_KEYS[better] })];
      }
      // A monster's own ways of fighting (the Inkmother's), the first time each is turned on the player
      if (event.type === 'dive' && event.targetId === ship.id && may('dive')) {
        return [
          'dive',
          bosun(
            "She's gone under, captain! Where the water glows dark she comes up, her arms all round: turn hard out of it, don't stop.",
          ),
        ];
      }
      if (event.type === 'surface' && event.radius === 0 && ship.canSee(event.at.x, event.at.y) && may('brood')) {
        return [
          'brood',
          bosun("Her young, captain! They're quicker than us: harpoon them first, or they'll hold us for her."),
        ];
      }
      if (event.type === 'holdFull' && event.shipId === ship.id && may('holdFull')) {
        return [
          'holdFull',
          bosun('The hold is full, captain. Sell the goods at the market, or throw some overboard (H).'),
        ];
      }
      if (event.type === 'shot' && event.shooterId === ship.id && may('lowAmmo')) {
        const left = ship.ammo[event.ammo];
        const other = AMMO_IDS[event.weapon].some((id) => id !== event.ammo && ship.ammo[id] > 0);
        if (left > 0 && left <= LOW_AMMO && !other) {
          return [
            'lowAmmo',
            bosun('Only {n} {ammo} left, captain. The arsenal in port sells more.', {
              n: left,
              ammo: t(AMMO[event.ammo].name),
            }),
          ];
        }
      }
    }
    if (ship.inkSight !== null && may('ink')) {
      return ['ink', bosun("Ink! We're blind in it, captain: sail out of the cloud and we'll see again.")];
    }
    if (ship.attackTarget === null) return null;
    if (ship.holdReason === 'noGuns' && may('noGuns')) {
      return [
        'noGuns',
        bosun('No {weapon} fitted, captain! Open the loadout (L) and fit them from the hold.', {
          weapon: weapon(ship.weapon),
        }),
      ];
    }
    if (ship.holdReason === 'noAmmo' && may('noAmmo')) {
      return [
        'noAmmo',
        bosun("We're out of {ammo}! Load another at hand (Z, X), or sail home: the arsenal in port sells more.", {
          ammo: t(AMMO[loaded].name),
        }),
      ];
    }
    if (ship.holdReason === 'notAtHand' && may('notAtHand')) {
      const other = ship.ammoBar[ship.weapon].some((id) => id !== null);
      return [
        'notAtHand',
        other
          ? bosun(
              '{ammo} is aboard, captain, but not at hand: put it on the bar in the loadout (L), or load the other (Z, X).',
              {
                ammo: t(AMMO[loaded].name),
              },
            )
          : bosun('Nothing at hand for the {weapon}, captain: put some ammo on the bar in the loadout (L).', {
              weapon: weapon(ship.weapon),
            }),
      ];
    }
    return null;
  }
}
