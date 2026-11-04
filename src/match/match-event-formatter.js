export function formatMatchEvent(event) {
  if (!event || typeof event !== "object") throw new TypeError("文字事件必須是物件。");
  if (event.type === "RALLY_PREPARED") {
    return `第 ${event.rallyNumber} 次 Rally，${event.playerName} 準備發球。`;
  }
  if (event.type === "SERVE_RESOLVED") {
    return `${event.playerName} 發球，判定結果：${event.result.outcome}。`;
  }
  if (event.type === "BALL_IN_FLIGHT") {
    return `${event.playerName} 的發球飛向 ${event.receivingTeam} 場地。`;
  }
  if (event.type === "BALL_LANDED") {
    return `球落在 ${event.receivingTeam} 場內。`;
  }
  if (event.type === "SCORE_UPDATED") {
    const servingText = event.servingTeamBefore === event.servingTeamAfter
      ? "發球權不變"
      : `發球權轉為 ${event.servingTeamAfter}`;
    return `${event.scoringTeam} 得 1 分，目前比分 ${event.scoreAfter.HOME}：${event.scoreAfter.AWAY}，${servingText}。`;
  }
  if (event.type === "RALLY_ENDED") return `第 ${event.rallyNumber} 次 Rally 結束。`;
  if (event.type === "UNSUPPORTED_RESULT") {
    return `發球結果 ${event.result.outcome} 尚未支援，未進行得分結算。`;
  }
  return `${event.type}`;
}

export function formatMatchEvents(events) {
  if (!Array.isArray(events)) throw new TypeError("文字事件紀錄必須是陣列。");
  return Object.freeze(events.map(formatMatchEvent));
}
