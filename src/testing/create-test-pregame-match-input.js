import { createTestMatchData } from "../data/test-players.js";
import { createPregameMatchInput } from "../match/create-pregame-match-input.js";
import { createRandomTestStartingLineup } from "./create-random-test-lineup.js";

// [MVTGO_TEST_HOOK]
// 功能：準備比賽測試系統所需球員、隨機 HOME 先發及本場比賽資料。
// 啟用：僅於玩家點擊首頁「比賽測試系統」時。
// 範圍：只建立正式輸入資料；驗證、先發編輯、Match 與球場均沿用正式流程。
export function createTestPregameMatchInput({ random = Math.random } = {}) {
  const testMatchData = createTestMatchData();
  const homeDefaultStartingLineup = createRandomTestStartingLineup(
    testMatchData.homePlayers,
    random,
  );
  return createPregameMatchInput({
    ...testMatchData,
    homeDefaultStartingLineup,
  });
}
