import { BALL_FLIGHT_CONFIG } from "./ball-trajectory.js";
import { PLAYER_MOVE_SPEED } from "../config/match-params.js";
import {
  calculateJumpHeightAtTime,
  calculatePlayerContactPoint,
} from "./player-contact-point.js";

export const PLAYER_ACTIONS = Object.freeze({
  IDLE: "IDLE",
  MOVE: "MOVE",
  RECEIVE: "RECEIVE",
  SET: "SET",
  ATTACK: "ATTACK",
  BLOCK: "BLOCK",
  SERVE: "SERVE",
  JUMP_SERVE: "JUMP_SERVE",
});

export const PLAYER_ACTION_TYPES = Object.freeze(Object.values(PLAYER_ACTIONS));

// Phase 2B 動畫節奏與形變集中於此，後續可依正式畫面測試統一調整。
export const PLAYER_ACTION_CONFIG = Object.freeze({
  move: Object.freeze({
    worldSpeed: PLAYER_MOVE_SPEED,
    stretchX: 0.82,
    stretchY: 1.2,
  }),
  receive: Object.freeze({
    duration: 460,
    squashX: 1.18,
    squashY: 0.52,
  }),
  set: Object.freeze({
    duration: 620,
    squashX: 1.18,
    squashY: 0.55,
    jumpHeight: 72,
  }),
  attack: Object.freeze({
    duration: 860,
    jumpHeight: 120,
  }),
  block: Object.freeze({
    duration: 680,
    jumpHeight: 105,
  }),
  serve: Object.freeze({
    tossRiseDuration: 260,
    tossFallDuration: 160,
  }),
  jumpServe: Object.freeze({
    tossRiseDuration: 340,
    tossFallDuration: 300,
    attackStartTime: 220,
  }),
});

export const SERVE_TRAJECTORY_CONFIG = Object.freeze({
  serve: Object.freeze({
    tossHeight: 190,
    flightSpeed: BALL_FLIGHT_CONFIG.serveSpeed,
  }),
  jumpServe: Object.freeze({
    tossHeight: 280,
    flightSpeed: BALL_FLIGHT_CONFIG.jumpServeSpeed,
  }),
});

// 僅供 ?dev 動作驗證產生測試落點；正式比賽目標必須由 Player Behavior 傳入。
export const DEVELOPMENT_SERVE_CONFIG = Object.freeze({
  targetMarginX: 130,
});

export function createServePreparation({
  action,
  teamId,
  playerX,
  playerY,
}) {
  const isJumpServe = action === PLAYER_ACTIONS.JUMP_SERVE;
  if (!isJumpServe && action !== PLAYER_ACTIONS.SERVE) {
    throw new RangeError(`無法建立非發球動作的正式球路：${action}`);
  }
  if (teamId !== "HOME" && teamId !== "AWAY") {
    throw new RangeError(`未知的球隊識別：${teamId}`);
  }
  const config = isJumpServe
    ? SERVE_TRAJECTORY_CONFIG.jumpServe
    : SERVE_TRAJECTORY_CONFIG.serve;
  const actionConfig = isJumpServe
    ? PLAYER_ACTION_CONFIG.jumpServe
    : PLAYER_ACTION_CONFIG.serve;
  const hitTime = actionConfig.tossRiseDuration + actionConfig.tossFallDuration;
  const jumpHeight = isJumpServe
    ? calculateJumpHeightAtTime(
        hitTime - actionConfig.attackStartTime,
        PLAYER_ACTION_CONFIG.attack.duration,
        PLAYER_ACTION_CONFIG.attack.jumpHeight,
      )
    : 0;
  const contact = calculatePlayerContactPoint({
    playerX,
    playerY,
    jumpHeight,
    action,
    teamId,
  });
  return Object.freeze({
    tossStart: Object.freeze({ x: contact.x, y: contact.y, height: 0 }),
    tossApex: Object.freeze({
      x: contact.x,
      y: contact.y,
      height: contact.height + config.tossHeight,
    }),
    contact: Object.freeze({ x: contact.x, y: contact.y, height: contact.height }),
    speed: config.flightSpeed,
  });
}

export function createServeTrajectory({
  action,
  teamId,
  playerX,
  playerY,
  target,
}) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.height)) {
    throw new TypeError("正式發球目標必須包含有效 x、y、height。");
  }
  return Object.freeze({
    ...createServePreparation({ action, teamId, playerX, playerY }),
    target: Object.freeze({ x: target.x, y: target.y, height: target.height }),
  });
}

export function createDevelopmentServeTrajectory({
  action,
  teamId,
  playerX,
  playerY,
  worldWidth,
  worldHeight,
}) {
  const isJumpServe = action === PLAYER_ACTIONS.JUMP_SERVE;
  if (!isJumpServe && action !== PLAYER_ACTIONS.SERVE) {
    throw new RangeError(`無法建立非發球動作的開發球路：${action}`);
  }
  if (teamId !== "HOME" && teamId !== "AWAY") {
    throw new RangeError(`未知的球隊識別：${teamId}`);
  }
  return Object.freeze({
    ...createServeTrajectory({
      action,
      teamId,
      playerX,
      playerY,
      target: {
        x: teamId === "HOME"
          ? worldWidth - DEVELOPMENT_SERVE_CONFIG.targetMarginX
          : DEVELOPMENT_SERVE_CONFIG.targetMarginX,
        y: Math.max(120, Math.min(worldHeight - 120, playerY - 70)),
        height: 0,
      },
    }),
    source: "DEVELOPMENT_ONLY",
  });
}
