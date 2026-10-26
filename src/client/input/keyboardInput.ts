import type { Ship } from '../../game';
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
  /** Uses the ship's ability */
  useAbility: () => void;
  /** Orders the crew to repair, for gold */
  repair: () => void;
}

// Keys, by their place on the keyboard (`code`), so they work in any layout, Ukrainian too:
// Space fires at the unit picked out; Escape stops firing, or if the ship isn't firing lets go of the unit picked out
// (unless it closed a window first); Q picks the cannons, E the harpoons; Z and X load the picked weapon's two kinds of
// ammo at hand (1…0 are left to the skill bar's quick slots, for what the hold will carry); R orders the repair; F uses
// the ship's ability; L opens the loadout; K the talents; J the combat log; M the sea chart; I the statistics; H the
// hold; P the captain's mastery
export function bindKeyboardInput(ship: Ship, selection: Selection, actions: KeyboardActions) {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
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
        actions.useAbility();
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
