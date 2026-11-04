import { LINEUP_POSITIONS } from "../lineup/starting-lineup.js";
import { createInitialMatchState } from "./match-state.js";

function assertText(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName}不可為空。`);
  }
}

function validateStartingLineup(startingLineup, players, teamId) {
  if (!startingLineup || startingLineup.team !== teamId) {
    throw new Error(`${teamId} 先發配置的球隊識別不正確。`);
  }
  const assignments = startingLineup.assignments;
  const playerIds = LINEUP_POSITIONS.map((position) => assignments?.[position]);
  if (playerIds.some((playerId) => typeof playerId !== "string" || playerId === "")) {
    throw new Error(`${teamId} 六個先發槽位必須全部完成。`);
  }
  if (new Set(playerIds).size !== LINEUP_POSITIONS.length) {
    throw new Error(`${teamId} 先發球員不可重複。`);
  }
  const availablePlayerIds = new Set(players.map((player) => player.id));
  const unavailablePlayerId = playerIds.find((playerId) => !availablePlayerIds.has(playerId));
  if (unavailablePlayerId) {
    throw new Error(`${teamId} 先發球員 ${unavailablePlayerId} 不在球隊名單中。`);
  }
}

export function createMatchId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("目前環境無法建立比賽唯一識別碼。");
  }
  return globalThis.crypto.randomUUID();
}

export function createMatch({
  id,
  name,
  homeTeamName,
  awayTeamName,
  courtId,
  homePlayers,
  awayPlayers,
  homeStartingLineup,
  awayStartingLineup,
  testMode = false,
}) {
  assertText(id, "比賽 ID");
  assertText(name, "比賽名稱");
  assertText(homeTeamName, "HOME 球隊名稱");
  assertText(awayTeamName, "AWAY 球隊名稱");
  assertText(courtId, "場地 ID");
  if (!Array.isArray(homePlayers) || !Array.isArray(awayPlayers)) {
    throw new TypeError("HOME／AWAY 球員名單必須是陣列。");
  }

  const allPlayerIds = [...homePlayers, ...awayPlayers].map((player) => player.id);
  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    throw new Error("HOME／AWAY 球員 ID 不可重複。");
  }
  validateStartingLineup(homeStartingLineup, homePlayers, "HOME");
  validateStartingLineup(awayStartingLineup, awayPlayers, "AWAY");
  if (typeof testMode !== "boolean") {
    throw new TypeError("比賽測試模式識別必須是布林值。");
  }

  const initialState = createInitialMatchState();
  return Object.freeze({
    id: id.trim(),
    name: name.trim(),
    courtId: courtId.trim(),
    environment: Object.freeze({ testMode }),
    teams: Object.freeze({
      HOME: Object.freeze({
        name: homeTeamName.trim(),
        players: homePlayers,
        startingLineup: homeStartingLineup,
      }),
      AWAY: Object.freeze({
        name: awayTeamName.trim(),
        players: awayPlayers,
        startingLineup: awayStartingLineup,
      }),
    }),
    ...initialState,
  });
}
