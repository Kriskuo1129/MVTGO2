import { PLAYER_ACTIONS } from "../court/player-action-config.js";
import { SERVE_OUTCOMES } from "./match-resolver.js";
import { getPlayerTargetPosition, POSITION_PHASES } from "./positioning.js";

export const PLAYER_BEHAVIORS = Object.freeze({
  MOVE_TO_POSITION: "MOVE_TO_POSITION",
  HOLD_POSITION: "HOLD_POSITION",
  SERVE: "SERVE",
  IDLE: "IDLE",
});

// 正式結果已由 Engine 確認；此設定只決定 ACE 的視覺落點。
export const SERVE_ROUTE_CONFIG = Object.freeze({
  ace: Object.freeze({ homeX: 0.72, awayX: 0.28, y: 0.58, height: 0 }),
});

function createPresentationState(match, preparedEvent) {
  const teams = {};
  for (const teamId of ["HOME", "AWAY"]) {
    teams[teamId] = Object.freeze({
      onCourtPlayers: Object.freeze(match.scene.players[teamId].map((worldPlayer) => {
        const player = match.teams[teamId].players
          .find((candidate) => candidate.id === worldPlayer.playerId);
        return Object.freeze({
          playerId: worldPlayer.playerId,
          lineupPosition: worldPlayer.lineupPosition,
          x: worldPlayer.x,
          y: worldPlayer.y,
          serveType: player?.serveType,
        });
      })),
    });
  }
  return Object.freeze({
    phase: POSITION_PHASES.SERVE_PREPARE,
    servingTeam: preparedEvent.teamId,
    rotations: match.rotations,
    teams: Object.freeze(teams),
    rally: Object.freeze({ servingLineupPosition: preparedEvent.lineupPosition }),
  });
}

function getAceVisualTarget(match, servingTeam) {
  const config = SERVE_ROUTE_CONFIG.ace;
  return Object.freeze({
    x: match.scene.width * (servingTeam === "HOME" ? config.homeX : config.awayX),
    y: match.scene.height * config.y,
    height: config.height,
  });
}

export function createRallyPreparationCommands(match, preparedEvent) {
  if (preparedEvent?.type !== "RALLY_PREPARED") {
    throw new TypeError("站位表現需要 RALLY_PREPARED 正式事件。");
  }
  const presentationState = createPresentationState(match, preparedEvent);
  const commands = [];
  for (const teamId of ["HOME", "AWAY"]) {
    for (const worldPlayer of match.scene.players[teamId]) {
      const target = getPlayerTargetPosition({
        matchState: presentationState,
        playerId: worldPlayer.playerId,
        teamId,
        lineupPosition: worldPlayer.lineupPosition,
      });
      const needsMove = Math.hypot(worldPlayer.x - target.x, worldPlayer.y - target.y) > 0.01;
      commands.push(Object.freeze({
        playerId: worldPlayer.playerId,
        teamId,
        lineupPosition: worldPlayer.lineupPosition,
        behavior: needsMove ? PLAYER_BEHAVIORS.MOVE_TO_POSITION : PLAYER_BEHAVIORS.HOLD_POSITION,
        target,
      }));
    }
  }
  return Object.freeze(commands);
}

export function createServePresentationCommand(match, serveEvent) {
  if (serveEvent?.type !== "SERVE_RESOLVED") {
    throw new TypeError("發球表現需要 SERVE_RESOLVED 正式事件。");
  }
  if (serveEvent.result?.outcome !== SERVE_OUTCOMES.ACE) {
    throw new Error(`尚未支援 ${serveEvent.result?.outcome} 的發球表現。`);
  }
  const player = match.teams[serveEvent.teamId].players
    .find((candidate) => candidate.id === serveEvent.playerId);
  if (!player) throw new Error(`發球表現找不到正式球員 ${serveEvent.playerId}。`);
  return Object.freeze({
    playerId: player.id,
    teamId: serveEvent.teamId,
    behavior: PLAYER_BEHAVIORS.SERVE,
    action: player.serveType === "跳發" ? PLAYER_ACTIONS.JUMP_SERVE : PLAYER_ACTIONS.SERVE,
    ballTrajectory: Object.freeze({
      kind: "SERVE_RESULT",
      target: getAceVisualTarget(match, serveEvent.teamId),
    }),
  });
}
