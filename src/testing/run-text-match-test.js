import { formatMatchEvents } from "../match/match-event-formatter.js";
import { MatchEngine } from "../match/match-engine.js";
import { createServeResultOverride, SERVE_TEST_RESULTS } from "./serve-result-override.js";

// [MVTGO_TEST_HOOK]
// 功能：在完全不建立 Court、Camera 或 Player Agent 的情況下，重複執行正式 ACE Rally。
// 啟用：僅供 testMode === true 的正式 Match 進行 Node／文字驗證。
// 範圍：只提供 ACE 覆寫與文字輸出；Resolver、Rules、比分與事件仍由正式 Engine 處理。
export function runTextAceMatchTest({ match, rallyCount = 1, random = Math.random }) {
  if (match?.environment?.testMode !== true) {
    throw new Error("文字 ACE 測試入口只接受 testMode === true 的正式 Match。");
  }
  if (!Number.isInteger(rallyCount) || rallyCount < 1) {
    throw new RangeError("文字測試 Rally 次數必須是正整數。");
  }
  const engine = new MatchEngine({ match, random });
  const override = createServeResultOverride(SERVE_TEST_RESULTS.ACE);
  const rallies = [];
  for (let index = 0; index < rallyCount; index += 1) {
    const result = engine.startSingleRally({ testOverride: override });
    rallies.push(Object.freeze({
      result,
      text: formatMatchEvents(result.events),
    }));
  }
  return Object.freeze({
    engine,
    rallies: Object.freeze(rallies),
    score: Object.freeze({ ...match.score }),
  });
}
