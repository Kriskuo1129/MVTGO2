import { createReceiveContactGeometry, detectSimulatorContact, getIncomingDirection } from "./contact-detection.js";
import { createSimulatorPlayer, decideChaseTarget, predictReachableContact, stepSimulatorPlayer } from "./player-agent.js";
import { getReceiveSpeedProfile } from "./receive-animation.js";
import { SIMULATOR_CONTACT_ANCHOR_DISTANCE, SIMULATOR_MAXIMUM_CONTACT_HEIGHT } from "./simulator.js";
import { isSpikeGroundIn, SPIKE_COURT_V1 } from "./spike-court.js";
import { TEAM_SIMULATOR_AVATAR_SIZE, TEAM_SIMULATOR_BALL_DISPLAY_SIZE } from "./team-simulator.js";

export const SINGLE_DEFENSE_DEFAULTS = Object.freeze({
  enabled: false,
  playerId: "AWAY-DEF-1",
  initialX: 600,
  initialY: 650,
  moveSpeed: 300,
  receiveAbility: 70,
  morale: 30,
});

export function validateSingleDefenseConfiguration(input = {}) {
  const value = { ...SINGLE_DEFENSE_DEFAULTS, ...input };
  const bounds = SPIKE_COURT_V1.bounds;
  if (typeof value.enabled !== "boolean" || typeof value.playerId !== "string" || !value.playerId.trim()) {
    throw new TypeError("單人防守設定需要有效的啟用狀態與球員 ID。");
  }
  if (!Number.isFinite(value.initialX) || value.initialX >= SPIKE_COURT_V1.netX
    || !Number.isFinite(value.initialY)
    || !isSpikeGroundIn({ x: value.initialX, y: value.initialY }, 0, SPIKE_COURT_V1)) {
    throw new RangeError(`防守員初始位置須位於左半場 V1 有效範圍：X ${bounds.minX}～${SPIKE_COURT_V1.netX}（不含）、Y ${bounds.minY}～${bounds.maxY}。`);
  }
  if (!Number.isFinite(value.moveSpeed) || value.moveSpeed <= 0 || value.moveSpeed > 1600) {
    throw new RangeError("防守員移動速度須介於 0（不含）～1600 世界單位／秒。");
  }
  if (!Number.isInteger(value.receiveAbility) || value.receiveAbility < 1 || value.receiveAbility > 99
    || !Number.isFinite(value.morale) || value.morale < 0 || value.morale > 99) {
    throw new RangeError("單人防守需要 1～99 整數接球能力與 0～99 士氣。");
  }
  return Object.freeze({ ...value, playerId: value.playerId.trim() });
}

export function createDefenseContactGeometry(flightDuration) {
  return createReceiveContactGeometry({
    avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
    avatarContactScale: getReceiveSpeedProfile(flightDuration).minimumScale,
    ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE,
    minimumOverlapDepth: 10,
    contactTolerance: 10,
  });
}

export function createSingleDefender(configuration) {
  const value = validateSingleDefenseConfiguration(configuration);
  return Object.assign(createSimulatorPlayer({
    id: value.playerId,
    position: "DEF",
    rotationPosition: "EXPERIMENT",
    x: value.initialX,
    y: value.initialY,
    moveSpeed: value.moveSpeed,
  }), { team: "AWAY", responsibility: "HOLD", touchEligible: false,
    receiveAbility: value.receiveAbility, morale: value.morale, receivePreparationTime: 0 });
}

export function updateSingleDefender({ ball, player, fixedStep, contactGeometry }) {
  const prediction = predictReachableContact({
    ball,
    player,
    contactRange: contactGeometry.horizontalTolerance,
    contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
    maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
    sampleStep: Math.max(fixedStep * 4, 1 / 120),
    contactGeometry,
  });
  decideChaseTarget(player, prediction);
  player.task = "RECEIVE";
  player.responsibility = "PRIMARY";
  player.touchEligible = true;
  player.receiveDirection = getIncomingDirection(ball.target.x - ball.start.x);
  const previousPlayer = { x: player.x, y: player.y };
  stepSimulatorPlayer(player, fixedStep);
  const idealDistance = Math.hypot(player.x - prediction.x, player.y - prediction.y);
  player.receivePreparationTime = idealDistance <= contactGeometry.horizontalTolerance
    ? player.receivePreparationTime + fixedStep : 0;
  return Object.freeze({ prediction, previousPlayer });
}

export function detectSingleDefenseContact({ previousBall, currentBall, previousPlayer, currentPlayer, contactGeometry }) {
  return detectSimulatorContact({
    previousBall,
    currentBall,
    previousPlayer,
    currentPlayer,
    contactRange: contactGeometry.horizontalTolerance,
    contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
    maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
    contactGeometry,
  });
}
