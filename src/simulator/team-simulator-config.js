import { createReceiveContactGeometry, createSetContactGeometry } from "./contact-detection.js";
import { PLAYER_POSITIONS } from "./team-coordination.js";
import { getReceiveSpeedProfile } from "./receive-animation.js";
import { BALL_CONFIG } from "./config/ball-config.js";
import { PLAYER_CONTACT_CONFIG, PLAYER_PHYSICS_CONFIG } from "./config/player-config.js";
import {
  DEFAULT_SIMULATOR_PARAMETERS,
  SIMULATOR_BALL_OVERLAP_RATIO,
} from "./simulator-core.js";

export const TEAM_RECEIVE_FORMATION = Object.freeze([
  Object.freeze({ id: "SIM-P1", position: PLAYER_POSITIONS.S, rotationPosition: "POS1", x: 1880, y: 700, receiveAbility: 60, morale: 30 }),
  Object.freeze({ id: "SIM-P2", position: PLAYER_POSITIONS.OH1, rotationPosition: "POS2", x: 1510, y: 690, receiveAbility: 72, morale: 30 }),
  Object.freeze({ id: "SIM-P3", position: PLAYER_POSITIONS.MB1, rotationPosition: "POS3", x: 1300, y: 520, receiveAbility: 58, morale: 30 }),
  Object.freeze({ id: "SIM-P4", position: PLAYER_POSITIONS.OP, rotationPosition: "POS4", x: 1510, y: 310, receiveAbility: 64, morale: 30 }),
  Object.freeze({ id: "SIM-P5", position: PLAYER_POSITIONS.OH2, rotationPosition: "POS5", x: 1880, y: 300, receiveAbility: 76, morale: 30 }),
  Object.freeze({ id: "SIM-P6", position: PLAYER_POSITIONS.MB2, rotationPosition: "POS6", x: 1740, y: 500, receiveAbility: 55, morale: 30 }),
]);

export const TEAM_SIMULATOR_AVATAR_SIZE = PLAYER_PHYSICS_CONFIG.teamAvatarSize;
export const TEAM_SIMULATOR_BALL_DISPLAY_SIZE = BALL_CONFIG.teamDiameter;

export function createTeamReceiveContactGeometry(flightDuration) {
  return createReceiveContactGeometry({
    avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
    avatarContactScale: getReceiveSpeedProfile(flightDuration).minimumScale,
    ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE,
    minimumOverlapDepth: PLAYER_CONTACT_CONFIG.receiveMinimumOverlapDepth,
    contactTolerance: PLAYER_CONTACT_CONFIG.receiveTolerance,
  });
}

export const TEAM_SET_CONTACT_GEOMETRY = createSetContactGeometry({
  avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
  ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE,
  overlapRatio: SIMULATOR_BALL_OVERLAP_RATIO,
  horizontalTolerance: PLAYER_CONTACT_CONFIG.setHorizontalTolerance,
  verticalTolerance: PLAYER_CONTACT_CONFIG.setVerticalTolerance,
});

export const TEAM_SIMULATOR_PARAMETERS = Object.freeze({
  ...DEFAULT_SIMULATOR_PARAMETERS,
  avatarSize: TEAM_SIMULATOR_AVATAR_SIZE,
  flightDuration: 1.5,
});
