import { ATTACK_TYPES, getAttackPosition, validateAttackPosition } from "./attack-positions.js";
import { decideChaseTarget, stepSimulatorPlayer } from "./player-agent.js";

export const ATTACK_MOVEMENT_PHASES = Object.freeze({
  IDLE: "IDLE",
  MOVING_TO_READY: "MOVING_TO_READY",
  MOVING_TO_ATTACK: "MOVING_TO_ATTACK",
  ATTACK_READY: "ATTACK_READY",
});
export const ATTACK_ARRIVAL_TOLERANCE = 0.0001;

export function isReceiveExperimentRunning(status) {
  return ["RUNNING", "FINISHING", "RECEIVE_ERROR_IN_FLIGHT", "PASS_IN_FLIGHT",
    "THIRD_PASS_IN_FLIGHT", "ATTACK_LANDING"].includes(status);
}

// C1 相容查詢僅供實驗入口；Assignment 本身只需要任務負責人與兩個目標點。
export function resolveLeftLongConfiguration(data, rotation, assignedPlayerId, players, secondTouchPlayerId) {
  const player = players.find((candidate) => candidate.id === assignedPlayerId);
  if (!player) throw new RangeError("請選擇有效的長攻負責球員。");
  const source = { rotation, playerSlot: player.position, attackType: ATTACK_TYPES.LEFT_LONG };
  const positions = getAttackPosition(data, source);
  return createAttackAssignment({ ...positions, assignedPlayerId,
    source: { ...source, dataset: "C1_APPLIED_PREVIEW" } }, players, secondTouchPlayerId);
}

// 只描述本次任務，不更動球員 Position、rotationPosition 或觸球資格。
export function createAttackAssignment(configuration, players, secondTouchPlayerId) {
  if (configuration?.attackType !== ATTACK_TYPES.LEFT_LONG) throw new RangeError("本實驗僅支援 LEFT_LONG。");
  const player = players.find((candidate) => candidate.id === configuration.assignedPlayerId);
  if (!player) throw new RangeError("請指定場上有效球員。");
  if (player.position === "S" || player.id === secondTouchPlayerId) {
    throw new RangeError("本階段不支援 S 或第二觸球執行者擔任長攻負責人。");
  }
  if (!configuration.readyPosition || !configuration.attackPosition) {
    throw new Error("UNCONFIGURED：請先設定 READY／ATTACK，並於站位編輯器套用預覽。");
  }
  return {
    attackType: ATTACK_TYPES.LEFT_LONG,
    assignedPlayerId: player.id,
    readyPosition: validateAttackPosition(configuration.readyPosition),
    attackPosition: validateAttackPosition(configuration.attackPosition),
    movementPhase: ATTACK_MOVEMENT_PHASES.IDLE,
    movementBlockedUntil: 0,
    source: configuration.source ? Object.freeze({ ...configuration.source }) : null,
  };
}

export function setAttackMovementPhase(assignment, player, phase) {
  assignment.movementPhase = phase;
  const target = phase === ATTACK_MOVEMENT_PHASES.MOVING_TO_READY
    ? assignment.readyPosition : assignment.attackPosition;
  // 改目標而非座標；RECEIVE 的呈現與動作鎖交給固定步進處理。
  player.targetX = target.x;
  player.targetY = target.y;
}

export function stepAttackAssignment(assignment, player, simulationTime, fixedStep) {
  const phase = assignment?.movementPhase;
  if (![ATTACK_MOVEMENT_PHASES.MOVING_TO_READY, ATTACK_MOVEMENT_PHASES.MOVING_TO_ATTACK].includes(phase)) return;
  if (simulationTime + Number.EPSILON < assignment.movementBlockedUntil) return;
  const availableStep = Math.min(fixedStep, Math.max(0, simulationTime - assignment.movementBlockedUntil));
  if (availableStep <= Number.EPSILON) return;
  const target = phase === ATTACK_MOVEMENT_PHASES.MOVING_TO_READY
    ? assignment.readyPosition : assignment.attackPosition;
  decideChaseTarget(player, target);
  stepSimulatorPlayer(player, availableStep);
  if (Math.hypot(player.x - target.x, player.y - target.y) <= ATTACK_ARRIVAL_TOLERANCE) {
    player.action = "IDLE";
    if (phase === ATTACK_MOVEMENT_PHASES.MOVING_TO_ATTACK) {
      assignment.movementPhase = ATTACK_MOVEMENT_PHASES.ATTACK_READY;
    }
  }
}
