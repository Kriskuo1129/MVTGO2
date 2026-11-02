export const PLAYER_MOOD_NAMES = Object.freeze({
  1: "淡定",
  2: "冷靜",
  3: "一般",
  4: "熱情",
  5: "瘋狂",
});

export function getPlayerMoodName(mood) {
  if (!Number.isInteger(mood) || !(mood in PLAYER_MOOD_NAMES)) {
    throw new RangeError("情緒必須是 1～5 的整數。");
  }
  return PLAYER_MOOD_NAMES[mood];
}

export function getAbilityTierClass(ability) {
  if (!Number.isInteger(ability) || ability < 1 || ability > 99) {
    throw new RangeError("能力值必須是 1～99 的整數。");
  }
  if (ability >= 90) return "ability-tier--gold";
  if (ability >= 80) return "ability-tier--pink";
  if (ability >= 70) return "ability-tier--red";
  if (ability >= 60) return "ability-tier--yellow";
  if (ability >= 50) return "ability-tier--blue";
  return "ability-tier--gray";
}
