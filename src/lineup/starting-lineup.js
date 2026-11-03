export const LINEUP_POSITIONS = Object.freeze(["S", "OH1", "MB1", "OP", "OH2", "MB2"]);
export const LINEUP_DISPLAY_ORDER = Object.freeze(["OP", "MB1", "OH1", "OH2", "MB2", "S"]);
export const SLOT_PLAYER_POSITIONS = Object.freeze({
  S: "S",
  OH1: "OH",
  MB1: "MB",
  OP: "OP",
  OH2: "OH",
  MB2: "MB",
});

export function isPlayerOutOfPosition(player, lineupPosition) {
  if (!LINEUP_POSITIONS.includes(lineupPosition)) {
    throw new RangeError(`未知的先發職位：${lineupPosition}`);
  }
  if (!player || typeof player.position !== "string") {
    throw new TypeError("球員資料缺少合法擅長職位。");
  }
  return player.position !== SLOT_PLAYER_POSITIONS[lineupPosition];
}

export function sortPlayersForLineupPosition(players, lineupPosition) {
  if (!Array.isArray(players)) {
    throw new TypeError("球員名單必須是陣列。");
  }
  if (!LINEUP_POSITIONS.includes(lineupPosition)) {
    throw new RangeError(`未知的先發職位：${lineupPosition}`);
  }
  const preferredPosition = SLOT_PLAYER_POSITIONS[lineupPosition];
  return [
    ...players.filter((player) => player.position === preferredPosition),
    ...players.filter((player) => player.position !== preferredPosition),
  ];
}

export function createLineup() {
  return Object.fromEntries(LINEUP_POSITIONS.map((position) => [position, null]));
}

export function getSelectedPlayerIds(lineup) {
  return new Set(Object.values(lineup).filter(Boolean));
}

export function setLineupPlayer(lineup, position, playerId) {
  if (!LINEUP_POSITIONS.includes(position)) {
    throw new RangeError(`未知的先發職位：${position}`);
  }
  const normalizedPlayerId = playerId || null;
  const duplicatePosition = LINEUP_POSITIONS.find(
    (candidate) => candidate !== position && lineup[candidate] === normalizedPlayerId,
  );
  if (normalizedPlayerId && duplicatePosition) {
    throw new Error(`此球員已安排於 ${duplicatePosition}。`);
  }
  return { ...lineup, [position]: normalizedPlayerId };
}

export function isLineupComplete(lineup) {
  return (
    LINEUP_POSITIONS.every((position) => Boolean(lineup[position])) &&
    getSelectedPlayerIds(lineup).size === LINEUP_POSITIONS.length
  );
}

export function createStartingLineup(lineup, availablePlayers, team = "HOME") {
  if (!["HOME", "AWAY"].includes(team)) {
    throw new RangeError("球隊必須是 HOME 或 AWAY。");
  }
  if (!isLineupComplete(lineup)) {
    throw new Error("六個職位全部安排完成後才能確認。");
  }
  const availablePlayerIds = new Set(availablePlayers.map((player) => player.id));
  const unavailablePlayerId = [...getSelectedPlayerIds(lineup)].find(
    (playerId) => !availablePlayerIds.has(playerId),
  );
  if (unavailablePlayerId) {
    throw new Error(`球員 ${unavailablePlayerId} 不在可用名單中。`);
  }
  return Object.freeze({
    team,
    assignments: Object.freeze({ ...lineup }),
  });
}
