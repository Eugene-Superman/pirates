import type { Ship } from '../../game';

// Keys: Escape stops the ship firing at its target (unless it closed the settings panel first)
export function bindKeyboardInput(ship: Ship) {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) ship.ceaseFire();
  });
}
