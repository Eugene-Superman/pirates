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
  const done = isFullscreen() ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  // Refused (a frame the page is shown in may not allow it): the page stays as it was
  done.catch(() => undefined);
}
