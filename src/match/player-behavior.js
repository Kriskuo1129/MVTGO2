import { PLAYER_ACTIONS } from "../court/player-action-config.js";
import { SERVICE_ERROR_TYPES, SERVE_OUTCOMES } from "./match-resolver.js";

// 目前正式輪轉資料只有 R1；此集中對應是 Phase 3A 的最小發球員規則。
// 未來定義完整六輪站位時，只需擴充此表，不需修改 Engine 或動畫模組。
export const SERVING_SLOT_BY_ROTATION = Object.freeze({
  R1: "S",
});

// Phase 3A 正式事件球路目標設定；使用世界比例，不放入 Engine 或 Resolver。
// OUT 目標位於場地圖片邊緣的有效球場外，NET 目標位於中央球網附近。
export const SERVE_ROUTE_CONFIG = Object.freeze({
  ace: Object.freeze({ homeX: 0.72, awayX: 0.28, y: 0.58, height: 0 }),
  out: Object.freeze({ homeX: 0.97, awayX: 0.03, y: 0.12, height: 0 }),
  net: Object.freeze({ homeX: 0.51, awayX: 0.49, y: 0.5, height: 20 }),
});

export function getServingPlayer(match) {
  const servingTeam = match?.runtime?.servingTeam;
  const rotation = match?.rotations?.[servingTeam];
  const lineupPosition = SERVING_SLOT_BY_ROTATION[rotation];
  if (!lineupPosition) {
    throw new Error(`目前輪轉 ${rotation} 尚未定義正式發球員槽位。`);
  }
  const team = match.teams[servingTeam];
  const playerId = team.startingLineup.assignments[lineupPosition];
  const player = team.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`${servingTeam} 發球員 ${playerId} 不在正式名單中。`);
  return Object.freeze({ servingTeam, rotation, lineupPosition, player });
}

function getServeTarget(match, servingTeam, result) {
  const { width, height } = match.scene;
  const homeServing = servingTeam === "HOME";
  if (result.outcome === SERVE_OUTCOMES.ACE) {
    const target = SERVE_ROUTE_CONFIG.ace;
    return Object.freeze({
      x: width * (homeServing ? target.homeX : target.awayX),
      y: height * target.y,
      height: target.height,
    });
  }
  if (result.errorType === SERVICE_ERROR_TYPES.NET) {
    const target = SERVE_ROUTE_CONFIG.net;
    return Object.freeze({
      x: width * (homeServing ? target.homeX : target.awayX),
      y: height * target.y,
      height: target.height,
    });
  }
  const target = SERVE_ROUTE_CONFIG.out;
  return Object.freeze({
    x: width * (homeServing ? target.homeX : target.awayX),
    y: height * target.y,
    height: target.height,
  });
}

export function createServeBehavior(match, serveEvent) {
  const { player, servingTeam, lineupPosition } = serveEvent.server;
  const action = player.serveType === "跳發"
    ? PLAYER_ACTIONS.JUMP_SERVE
    : PLAYER_ACTIONS.SERVE;
  return Object.freeze({
    eventType: "SERVE",
    commands: Object.freeze([
      Object.freeze({
        playerId: player.id,
        teamId: servingTeam,
        lineupPosition,
        action,
        ballTrajectory: Object.freeze({
          kind: "SERVE_RESULT",
          target: getServeTarget(match, servingTeam, serveEvent.result),
        }),
      }),
    ]),
  });
}
