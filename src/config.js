export const TILE = 1;
export const FLOOR_H = 0.42;
export const MAP_SIZE = 48;
export const BLOCK = 8;
export const WATER_BAND = 16;
export const WATER_EDGE = MAP_SIZE - WATER_BAND;
export const PIER_DEPTH = 2;
export const WATER_Y = -0.28;
export const PIER_Y = 0.075;

export const WALKABLE = new Set([
  "road",
  "sidewalk",
  "grass",
  "pier",
  "plaza",
]);

export const PLAYER_SPEED = 3.15;

/** 2:1 dimetric (same as the old 64×32 tiles): 45° yaw, 30° elevation. */
export const ISO_DIR = {
  x: 1,
  y: Math.SQRT2 * Math.tan(Math.PI / 6),
  z: 1,
};
