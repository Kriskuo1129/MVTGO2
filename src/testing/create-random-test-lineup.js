import { LINEUP_POSITIONS } from "../lineup/starting-lineup.js";

// [MVTGO_TEST_HOOK]
// 功能：測試模式從 HOME 可出賽名單隨機產生六名不同球員的預設先發。
// 啟用：僅於 testMode === true 建立新測試比賽時。
// 範圍：只提供預設先發輸入，後續仍共用正式驗證、編輯與確認流程。
export function createRandomTestStartingLineup(players, random = Math.random) {
  if (!Array.isArray(players) || players.length < LINEUP_POSITIONS.length) {
    throw new Error("測試模式至少需要六名可出賽球員。");
  }
  if (typeof random !== "function") {
    throw new TypeError("測試模式亂數來源必須是函數。");
  }

  const uniquePlayers = [];
  const seenPlayerIds = new Set();
  players.forEach((player) => {
    if (typeof player?.id !== "string" || player.id === "" || seenPlayerIds.has(player.id)) return;
    seenPlayerIds.add(player.id);
    uniquePlayers.push(player);
  });
  if (uniquePlayers.length < LINEUP_POSITIONS.length) {
    throw new Error("測試模式需要至少六名具有不同 ID 的可出賽球員。");
  }

  const pool = [...uniquePlayers];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const randomValue = random();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new RangeError("測試模式亂數來源必須回傳 0（含）到 1（不含）之間的數值。");
    }
    const swapIndex = Math.floor(randomValue * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return Object.fromEntries(
    LINEUP_POSITIONS.map((position, index) => [position, pool[index].id]),
  );
}
