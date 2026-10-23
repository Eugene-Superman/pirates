import type { Ship } from '../../game';
import type { Selection } from './selection';

export interface KeyboardActions {
  /** Opens or closes the loadout window */
  toggleLoadout: () => void;
  /** Opens or closes the combat log */
  toggleLog: () => void;
  /** Opens or closes the sea chart */
  toggleMap: () => void;
}

// Keys, by their place on the keyboard (`code`), so they work in any layout, Ukrainian too:
// Space fires at the unit picked out; Escape stops firing, or if the ship isn't firing lets go of the unit picked out
// (unless it closed a window first); R starts the repair; L opens the loadout; J opens the combat log; M the sea chart
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
      case 'KeyR':
        ship.startRepair();
        break;
      case 'KeyL':
        actions.toggleLoadout();
        break;
      case 'KeyJ':
        actions.toggleLog();
        break;
      case 'KeyM':
        actions.toggleMap();
        break;
    }
  });
}
