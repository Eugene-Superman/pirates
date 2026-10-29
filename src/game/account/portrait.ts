import type { Player } from '../economy/player';

/**
 * How many portraits a captain picks from: the client's painted busts, by number (0 the first). Online, other players
 * will see it by the captain's name, so it is the player's, kept with their progress
 */
export const PORTRAITS = 10;

/** Puts up the portrait a player picked; false for a number there is no portrait of */
export function choosePortrait(player: Player, portrait: number) {
  if (!Number.isInteger(portrait) || portrait < 0 || portrait >= PORTRAITS) return false;
  player.portrait = portrait;
  return true;
}
