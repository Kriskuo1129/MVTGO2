import { SERVE_OUTCOMES } from "./match-resolver.js";

export function getReceivingTeam(servingTeam) {
  if (servingTeam === "HOME") return "AWAY";
  if (servingTeam === "AWAY") return "HOME";
  throw new RangeError(`未知的發球球隊：${servingTeam}`);
}

export function settleServeResult(match, serveEvent) {
  if (!match?.score || !match.runtime) {
    throw new TypeError("發球結算需要正式 Match 執行資料。");
  }
  const { servingTeam, result } = serveEvent;
  const receivingTeam = getReceivingTeam(servingTeam);
  let scoringTeam;
  if (result.outcome === SERVE_OUTCOMES.ACE) {
    scoringTeam = servingTeam;
  } else if (result.outcome === SERVE_OUTCOMES.SERVICE_ERROR) {
    scoringTeam = receivingTeam;
  } else {
    throw new RangeError(`尚未支援的發球結果：${result.outcome}`);
  }

  match.score[scoringTeam] += 1;
  match.runtime.servingTeam = scoringTeam;
  match.runtime.lastEvent = Object.freeze({
    eventType: "SERVE",
    servingTeam,
    scoringTeam,
    result,
  });
  return Object.freeze({
    scoringTeam,
    servingTeam: match.runtime.servingTeam,
    score: Object.freeze({ ...match.score }),
  });
}
