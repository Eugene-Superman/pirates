import type { GameState } from '../../game';
import type { Selection } from './selection';

export interface KeyboardActions {
  /** Opens or closes the loadout window */
  toggleLoadout: () => void;
  /** Opens or closes the combat log */
  toggleLog: () => void;
  /** Opens or closes the sea chart */
  toggleMap: () => void;
  /** Opens or closes the talent tree */
  toggleTalents: () => void;
  /** Opens or closes the statistics */
  toggleStats: () => void;
  /** Opens or closes the hold */
  toggleHold: () => void;
  /** Opens or closes the captain's mastery, the account's tree */
  toggleMastery: () => void;
  /** Opens or closes the world chart: every sea */
  toggleWorld: () => void;
  /** Opens or closes the bestiary: every kind of bot */
  toggleBestiary: () => void;
  /** Uses the ship's ability in a slot: 0 the first (F), 1 the second (G), 2 the third (T) */
  useAbility: (slot: number) => void;
  /** Orders the crew to repair, for gold, or to stop */
  repair: () => void;
}

// Keys, by their place on the keyboard (`code`), so they work in any layout, Ukrainian too:
// Space fires at the unit picked out; Escape stops firing, or if the ship isn't firing lets go of the unit picked out
// (unless it closed a window first); Q picks the cannons, E the harpoons; Z and X load the picked weapon's two kinds of
// ammo at hand (1…0 are left to the skill bar's quick slots, the items there: using them comes later); R orders the repair or stops it; F uses
// the ship's ability, G its second, T its third; L opens the loadout; K the talents; J the combat log; M the sea chart; N the world chart (every
// sea); B the bestiary (every kind of bot); I the statistics; H the hold; P the captain's mastery. They go to the ship
// sailed now: another may be bought or taken in port
export function bindKeyboardInput(state: GameState, selection: Selection, actions: KeyboardActions) {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const { ship } = state;
    // Not the page scrolling, held down or not
    if (e.code === 'Space') e.preventDefault();
    // A held key repeats (L would open and close the loadout over and over), and Ctrl+R, Ctrl+L… are the browser's
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {
      case 'Escape':
        if (ship.attackTarget !== null) ship.ceaseFire();
        else selection.id = null;
        break;
      case 'Space':
        if (selection.id !== null) ship.attack(selection.id);
        break;
      case 'KeyQ':
        ship.setWeapon('cannon');
        break;
      case 'KeyE':
        ship.setWeapon('harpoon');
        break;
      // The picked weapon's two kinds of ammo at hand (the skill bar's)
      case 'KeyZ':
        ship.loadBarAmmo(0);
        break;
      case 'KeyX':
        ship.loadBarAmmo(1);
        break;
      case 'KeyR':
        actions.repair();
        break;
      case 'KeyF':
        actions.useAbility(0);
        break;
      case 'KeyT':
        actions.useAbility(2);
        break;
      case 'KeyG':
        actions.useAbility(1);
        break;
      case 'KeyL':
        actions.toggleLoadout();
        break;
      case 'KeyK':
        actions.toggleTalents();
        break;
      case 'KeyJ':
        actions.toggleLog();
        break;
      case 'KeyM':
        actions.toggleMap();
        break;
      case 'KeyN':
        actions.toggleWorld();
        break;
      case 'KeyB':
        actions.toggleBestiary();
        break;
      case 'KeyI':
        actions.toggleStats();
        break;
      case 'KeyH':
        actions.toggleHold();
        break;
      case 'KeyP':
        actions.toggleMastery();
        break;
    }
  });
}
