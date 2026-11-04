export const POSITION_PHASES = Object.freeze({
  RALLY_PREPARE: "RALLY_PREPARE",
  SERVE_PREPARE: "SERVE_PREPARE",
  SERVE_EXECUTE: "SERVE_EXECUTE",
  BALL_IN_FLIGHT: "BALL_IN_FLIGHT",
  RALLY_RESULT: "RALLY_RESULT",
  RALLY_ENDED: "RALLY_ENDED",
});

// 沿用 Phase 2A 的 R1 世界座標；集中於正式站位資料，不代表 R2～R6。
const R1_BASE_POSITIONS = Object.freeze({
  HOME: Object.freeze({
    S: Object.freeze({ x: 640, y: 520 }),
    OH1: Object.freeze({ x: 810, y: 650 }),
    MB1: Object.freeze({ x: 1000, y: 560 }),
    OP: Object.freeze({ x: 650, y: 700 }),
    OH2: Object.freeze({ x: 820, y: 390 }),
    MB2: Object.freeze({ x: 1010, y: 400 }),
  }),
  AWAY: Object.freeze({
    S: Object.freeze({ x: 1640, y: 520 }),
    OH1: Object.freeze({ x: 1470, y: 650 }),
    MB1: Object.freeze({ x: 1280, y: 560 }),
    OP: Object.freeze({ x: 1630, y: 700 }),
    OH2: Object.freeze({ x: 1460, y: 390 }),
    MB2: Object.freeze({ x: 1270, y: 400 }),
  }),
});

const R1_SERVE_POSITIONS = Object.freeze({
  HOME: Object.freeze({ x: 250, y: 700 }),
  AWAY: Object.freeze({ x: 2030, y: 700 }),
});

const SUPPORTED_PHASES = new Set(Object.values(POSITION_PHASES));

export function getInitialR1Position(teamId, lineupPosition) {
  const position = R1_BASE_POSITIONS[teamId]?.[lineupPosition];
  if (!position) throw new RangeError(`缺少 ${teamId} R1 ${lineupPosition} 初始站位。`);
  return position;
}

export function getPlayerTargetPosition({
  matchState,
  playerId,
  teamId,
  lineupPosition,
}) {
  if (!SUPPORTED_PHASES.has(matchState?.phase)) {
    throw new RangeError(`比賽階段 ${matchState?.phase} 尚未定義正式站位。`);
  }
  const rotation = matchState.rotations?.[teamId];
  if (rotation !== "R1") {
    throw new RangeError(`${teamId} 輪次 ${rotation} 尚未定義正式站位。`);
  }
  const onCourtPlayer = matchState.teams?.[teamId]?.onCourtPlayers
    ?.find((player) => player.playerId === playerId);
  if (!onCourtPlayer || onCourtPlayer.lineupPosition !== lineupPosition) {
    throw new Error(`球員 ${playerId} 與 ${teamId} ${lineupPosition} 正式場上資料不一致。`);
  }

  const shouldUseServePosition = matchState.servingTeam === teamId
    && lineupPosition === matchState.rally?.servingLineupPosition
    && matchState.phase !== POSITION_PHASES.RALLY_PREPARE;
  return shouldUseServePosition
    ? R1_SERVE_POSITIONS[teamId]
    : getInitialR1Position(teamId, lineupPosition);
}
