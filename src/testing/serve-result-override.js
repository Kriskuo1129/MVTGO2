import { SERVE_OUTCOMES } from "../match/match-resolver.js";
import { MATCH_ENGINE_STATES } from "../match/match-engine.js";
import { formatMatchEvents } from "../match/match-event-formatter.js";

export const SERVE_TEST_RESULTS = Object.freeze({
  ACE: "ACE",
});

// [MVTGO_TEST_HOOK]
// 功能：建立單次發球測試的 ACE 結果覆寫資料。
// 啟用：僅由 testMode === true 的比賽測試控制呼叫。
// 範圍：只提供 Engine 在 Resolver 後套用的結果，不接觸動畫或比分規則。
export function createServeResultOverride(testResult) {
  if (testResult === SERVE_TEST_RESULTS.ACE) {
    return Object.freeze({
      eventType: "SERVE",
      outcome: SERVE_OUTCOMES.ACE,
      errorType: null,
    });
  }
  throw new RangeError(`未知的發球測試結果：${testResult}`);
}

// [MVTGO_TEST_HOOK]
// 功能：將既有正式球場中的 ACE 測試按鈕接到同一個正式 Match Engine。
// 啟用：僅於測試 Match 完成先發確認並進入球場後。
// 範圍：只啟動一次正式發球事件；不建立第二套 Match、動畫或規則。
export function setupServeResultTestControls({ match, engine, courtController, root }) {
  const controls = root.querySelector("#serve-result-test-controls");
  const status = root.querySelector("#serve-result-test-status");
  const buttons = [...controls.querySelectorAll("button[data-serve-test-result]")];
  if (match.environment.testMode !== true) {
    controls.hidden = true;
    return Object.freeze({ destroy() {} });
  }

  controls.hidden = false;
  status.textContent = "選擇單次發球結果；事件結束後不會自動開始下一球。";
  let destroyed = false;
  let running = false;
  const setButtonsDisabled = (disabled) => {
    buttons.forEach((candidate) => { candidate.disabled = disabled; });
  };
  const handleClick = async (event) => {
    if (destroyed || running) return;
    running = true;
    const button = event.currentTarget;
    setButtonsDisabled(true);
    status.textContent = "發球事件進行中…";
    try {
      const completed = await engine.startSingleRally({
        testOverride: createServeResultOverride(button.dataset.serveTestResult),
      });
      courtController?.updateScoreboard();
      await courtController?.playRecordedRally(completed.events);
      status.textContent = formatMatchEvents(completed.events).join(" ");
    } catch (error) {
      console.error(error);
      if (!destroyed) status.textContent = `發球測試失敗：${error.message}`;
    } finally {
      running = false;
      const engineState = engine.getState();
      const canRetry = !engineState.active
        && (
          engineState.state === MATCH_ENGINE_STATES.NOT_STARTED
          || engineState.state === MATCH_ENGINE_STATES.RALLY_ENDED
        );
      if (!destroyed && canRetry) setButtonsDisabled(false);
    }
  };
  buttons.forEach((button) => button.addEventListener("click", handleClick));
  return Object.freeze({
    destroy() {
      destroyed = true;
      buttons.forEach((button) => button.removeEventListener("click", handleClick));
      setButtonsDisabled(true);
      controls.hidden = true;
    },
  });
}
