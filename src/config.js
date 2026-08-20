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

export const CAM = {
  distMin: 3.4,
  distMax: 16,
  distDefault: 7.4,
  pitchMin: 0.14,
  pitchMax: 1.22,
  pitchDefault: 0.46,
  lookY: 0.66,
  fov: 0.95,
  lookSens: 0.0054,
  touchLookSens: 0.0072,
  stickLook: 2.55,
};
