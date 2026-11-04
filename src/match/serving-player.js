// 目前正式輪轉只完成 R1；未來 R2～R6 應集中擴充此對應。
export const SERVING_SLOT_BY_ROTATION = Object.freeze({
  R1: "S",
});

export function getServingPlayer(match) {
  const servingTeam = match?.runtime?.servingTeam;
  if (servingTeam !== "HOME" && servingTeam !== "AWAY") {
    throw new RangeError(`未知的正式發球球隊：${servingTeam}`);
  }
  const rotation = match.rotations?.[servingTeam];
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
