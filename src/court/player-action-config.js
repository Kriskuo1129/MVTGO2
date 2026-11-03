import { BALL_FLIGHT_CONFIG } from "./ball-trajectory.js";
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
    worldSpeed: 560,
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

// 僅供 ?dev 動作驗證產生測試球路；正式比賽落點必須由 Match Engine 傳入。
export const DEVELOPMENT_SERVE_CONFIG = Object.freeze({
  serve: Object.freeze({
    tossHeight: 190,
    targetMarginX: 130,
    flightSpeed: BALL_FLIGHT_CONFIG.serveSpeed,
  }),
  jumpServe: Object.freeze({
    tossHeight: 280,
    targetMarginX: 130,
    flightSpeed: BALL_FLIGHT_CONFIG.jumpServeSpeed,
  }),
});

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
  const config = isJumpServe
    ? DEVELOPMENT_SERVE_CONFIG.jumpServe
    : DEVELOPMENT_SERVE_CONFIG.serve;
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
    target: Object.freeze({
      x: teamId === "HOME" ? worldWidth - config.targetMarginX : config.targetMarginX,
      y: Math.max(120, Math.min(worldHeight - 120, playerY - 70)),
      height: 0,
    }),
    speed: config.flightSpeed,
    source: "DEVELOPMENT_ONLY",
  });
}
