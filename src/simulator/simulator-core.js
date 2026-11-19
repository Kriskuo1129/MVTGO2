import { BALL_CONFIG } from "./config/ball-config.js";
import {
  PLAYER_CONTACT_CONFIG,
  PLAYER_PHYSICS_CONFIG,
  SIMULATOR_TIMING_CONFIG,
  SIMULATOR_WORLD_CONFIG,
} from "./config/player-config.js";

export const SIMULATOR_WORLD = SIMULATOR_WORLD_CONFIG;
export const SIMULATOR_FIXED_STEP = SIMULATOR_TIMING_CONFIG.fixedStep;
export const SIMULATOR_MAX_FRAME_DELTA = SIMULATOR_TIMING_CONFIG.maximumFrameDelta;
export const SIMULATOR_MIN_FLIGHT_DURATION = BALL_CONFIG.minimumLegacyFlightDuration;
export const SIMULATOR_MAX_FLIGHT_DURATION = BALL_CONFIG.maximumLegacyFlightDuration;

export const DEFAULT_SIMULATOR_PARAMETERS = Object.freeze({
  avatarSize: PLAYER_PHYSICS_CONFIG.defaultAvatarSize,
  playerSpeed: PLAYER_PHYSICS_CONFIG.moveSpeed,
  contactRange: PLAYER_PHYSICS_CONFIG.contactRange,
  flightDuration: SIMULATOR_MAX_FLIGHT_DURATION,
  initialPlayerX: PLAYER_PHYSICS_CONFIG.initialX,
  initialPlayerY: PLAYER_PHYSICS_CONFIG.initialY,
});

export const SIMULATOR_BALL_START = BALL_CONFIG.initial;
export const SIMULATOR_HIGH_ARC_HEIGHT = BALL_CONFIG.legacyHighArcHeight;
export const SIMULATOR_MAXIMUM_CONTACT_HEIGHT = PLAYER_CONTACT_CONFIG.maximumReceiveHeight;
export const SIMULATOR_CONTACT_ANCHOR_DISTANCE = PLAYER_CONTACT_CONFIG.receiveAnchorDistance;
export const SIMULATOR_BALL_DISPLAY_SIZE = BALL_CONFIG.singlePlayerDisplayDiameter;
export const SIMULATOR_BALL_OVERLAP_RATIO = PLAYER_CONTACT_CONFIG.ballOverlapRatio;

function assertFiniteRange(value, minimum, maximum, fieldName) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${fieldName} 必須介於 ${minimum}～${maximum}。`);
  }
  return value;
}

export function validateSimulatorParameters(parameters) {
  return Object.freeze({
    avatarSize: assertFiniteRange(parameters.avatarSize, PLAYER_PHYSICS_CONFIG.minimumAvatarSize,
      PLAYER_PHYSICS_CONFIG.maximumAvatarSize, "球員顯示尺寸"),
    playerSpeed: assertFiniteRange(parameters.playerSpeed, PLAYER_PHYSICS_CONFIG.minimumMoveSpeed,
      PLAYER_PHYSICS_CONFIG.maximumMoveSpeed, "球員速度"),
    contactRange: assertFiniteRange(parameters.contactRange, PLAYER_PHYSICS_CONFIG.minimumContactRange,
      PLAYER_PHYSICS_CONFIG.maximumContactRange, "有效接球範圍"),
    flightDuration: assertFiniteRange(parameters.flightDuration, SIMULATOR_MIN_FLIGHT_DURATION,
      SIMULATOR_MAX_FLIGHT_DURATION, "球飛行時間"),
    initialPlayerX: assertFiniteRange(parameters.initialPlayerX, 0, SIMULATOR_WORLD.width, "球員初始 X"),
    initialPlayerY: assertFiniteRange(parameters.initialPlayerY, 0, SIMULATOR_WORLD.height, "球員初始 Y"),
  });
}
