import {
  PLAYER_GIVEN_NAMES,
  PLAYER_JAPAN_SURNAMES,
  PLAYER_SURNAMES,
  PLAYER_TAIWAN_SURNAMES,
} from "../data/player-names.js";

function validateNameOptions(values, fieldName) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${fieldName}不可為空。`);
  }
  if (values.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new TypeError(`${fieldName}只能包含非空白字串。`);
  }
  if (values.some((value) => value !== value.trim() || /\s/u.test(value))) {
    throw new TypeError(`${fieldName}不可包含空白。`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${fieldName}不可包含重複項目。`);
  }
}

function pickRandom(values, random, fieldName) {
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("亂數來源必須回傳大於等於 0 且小於 1 的有限數字。");
  }
  return values[Math.floor(randomValue * values.length)].trim();
}

export function generatePlayerName(random = Math.random) {
  if (typeof random !== "function") {
    throw new TypeError("亂數來源必須是函數。");
  }
  validateNameOptions(PLAYER_SURNAMES, "姓氏陣列");
  validateNameOptions(PLAYER_TAIWAN_SURNAMES, "台灣姓氏陣列");
  validateNameOptions(PLAYER_JAPAN_SURNAMES, "日本姓氏陣列");
  validateNameOptions(PLAYER_GIVEN_NAMES, "名字陣列");
  return `${pickRandom(PLAYER_SURNAMES, random)}${pickRandom(PLAYER_GIVEN_NAMES, random)}`;
}
