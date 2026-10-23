/**
 * The world is a grid of MAP_SQUARES × MAP_SQUARES squares, MAP_SQUARE world units across: about a screen each at the
 * default zoom. The map shows them, named A1…H8 (columns west to east, rows north to south)
 */
export const MAP_SQUARE = 1000;
export const MAP_SQUARES = 8;
export const WORLD_WIDTH = MAP_SQUARE * MAP_SQUARES;
export const WORLD_HEIGHT = MAP_SQUARE * MAP_SQUARES;
