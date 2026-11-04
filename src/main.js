import { APP_CONFIG } from "./config/app.config.js";
import { beginPregameFlow } from "./match/match-main.js";
import { createTestPregameMatchInput } from "./testing/create-test-pregame-match-input.js";
import { setupServeResultTestControls } from "./testing/serve-result-override.js";

document.title = APP_CONFIG.title;

const matchTestButton = document.querySelector("#match-test-button");

matchTestButton.addEventListener("click", () => {
  // [MVTGO_TEST_HOOK]
  // 功能：將比賽測試系統準備的正式輸入交給比賽系統主流程。
  // 啟用：玩家點擊首頁「比賽測試系統」時。
  // 範圍：只指定 testMode；先發、Match、球場與未來即時系統均沿用正式流程。
  beginPregameFlow(createTestPregameMatchInput(), {
    testMode: true,
    onCourtReady: ({ match, engine, courtController }) => setupServeResultTestControls({
      match,
      engine,
      courtController,
      root: document.querySelector("#court-view"),
    }),
  });
});
