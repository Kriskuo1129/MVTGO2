export const SERVE_TYPES = Object.freeze(["一般", "跳飄", "跳發"]);
export const PLAYER_POSITIONS = Object.freeze(["S", "OH", "MB", "OP"]);

const ABILITY_KEYS = Object.freeze(["attack", "block", "set", "receive", "serve"]);

function assertIntegerInRange(value, minimum, maximum, fieldName) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${fieldName} 必須是 ${minimum}～${maximum} 的整數。`);
  }
}

export function createPlayer({ id, name, position, abilities, mood, serveType, avatar = null }) {
  if (typeof id !== "string" || id.trim() === "") {
    throw new TypeError("球員 ID 不可為空。");
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError("球員名稱不可為空。");
  }
  if (!PLAYER_POSITIONS.includes(position)) {
    throw new RangeError(`球員職位必須是：${PLAYER_POSITIONS.join("、")}。`);
  }
  ABILITY_KEYS.forEach((key) => {
    assertIntegerInRange(abilities?.[key], 1, 99, `能力 ${key}`);
  });
  assertIntegerInRange(mood, 1, 5, "情緒");
  if (!SERVE_TYPES.includes(serveType)) {
    throw new RangeError(`發球類型必須是：${SERVE_TYPES.join("、")}。`);
  }
  if (avatar !== null && typeof avatar !== "string") {
    throw new TypeError("頭像識別欄位必須是字串或 null。");
  }
  return Object.freeze({
    id: id.trim(),
    name: name.trim(),
    position,
    abilities: Object.freeze({ ...abilities }),
    mood,
    serveType,
    avatar,
  });
}
