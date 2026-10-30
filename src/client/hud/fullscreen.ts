/** The Keyboard Lock API (Chromium's, not yet in TypeScript's DOM): keys the page hears before the browser does */
interface KeyboardLock {
  lock(codes: string[]): Promise<void>;
  unlock(): void;
}

/** Whether the browser lets the page fill the screen: not on an iPhone, nor in a frame that doesn't allow it */
export function canFillScreen() {
  return 'requestFullscreen' in document.documentElement && document.fullscreenEnabled;
}

/** Whether the game fills the screen now, however it got there (F11 aside: the browser's own) */
export function isFullscreen() {
  return document.fullscreenElement !== null;
}

/** Fills the screen with the game or gives the window back. From a click: a browser lets a page do it only then */
export function toggleFullscreen() {
  if (isFullscreen()) {
    document.exitFullscreen().catch(() => undefined);
    return;
  }
  document.documentElement
    .requestFullscreen()
    .then(keepEscape)
    // Refused (a frame the page is shown in may not allow it): the page stays as it was
    .catch(() => undefined);
}

// Held down to leave the full screen, Escape repeats: only its first press closes a window, not every one under
// it (nor sets sail from the harbour)
function held(e: KeyboardEvent) {
  if (e.code === 'Escape' && e.repeat) e.stopImmediatePropagation();
}

/**
 * Escape is the game's while it fills the screen: it closes the window on top. Where the browser lets a page keep it
 * (Chromium), the full screen is left only by holding it down, as the browser tells the player; elsewhere (Firefox,
 * Safari) it leaves at once, and nothing a page does stops that
 */
function keepEscape() {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  if (keyboard === undefined) return;
  keyboard.lock(['Escape']).catch(() => undefined);
  const release = () => {
    if (isFullscreen()) return;
    keyboard.unlock();
    window.removeEventListener('keydown', held, { capture: true });
    document.removeEventListener('fullscreenchange', release);
  };
  // Before the windows' own listeners, all on `window` in the bubbling phase
  window.addEventListener('keydown', held, { capture: true });
  document.addEventListener('fullscreenchange', release);
}
