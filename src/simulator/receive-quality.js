import { RECEIVE_SPEED_LEVELS } from "./receive-animation.js";

export const RECEIVE_QUALITIES = Object.freeze({
  PERFECT: "PERFECT",
  NORMAL: "NORMAL",
  BAD: "BAD",
});

export const RECEIVE_QUALITY_CONFIG = Object.freeze({
  incomingDifficulty: Object.freeze({
    [RECEIVE_SPEED_LEVELS.ULTRA_FAST]: 35,
    [RECEIVE_SPEED_LEVELS.FAST]: 25,
    [RECEIVE_SPEED_LEVELS.MEDIUM]: 15,
    [RECEIVE_SPEED_LEVELS.SLOW]: 5,
  }),
  maximumPositionBonus: 10,
  maximumPreparationBonus: 12,
  preparationSecondsForMaximum: 0.4,
  maximumMoraleBonus: 8,
  randomMinimum: -10,
  randomMaximum: 10,
  perfectThreshold: 75,
  normalThreshold: 40,
});

export const INCOMING_QUALITY_LABELS = Object.freeze({
  [RECEIVE_SPEED_LEVELS.ULTRA_FAST]: "高品質",
  [RECEIVE_SPEED_LEVELS.FAST]: "上品質",
  [RECEIVE_SPEED_LEVELS.MEDIUM]: "中品質",
  [RECEIVE_SPEED_LEVELS.SLOW]: "低品質",
});

function assertRange(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} 必須介於 ${minimum}～${maximum}。`);
  }
  return value;
}

function readRandom(random) {
  if (typeof random !== "function") throw new TypeError("一傳品質需要可呼叫的亂數來源。");
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("亂數來源必須回傳 0（含）至 1（不含）的有限數值。");
  }
  return value;
}

export function calculateMoraleBonus(morale, config = RECEIVE_QUALITY_CONFIG) {
  return assertRange(morale, 0, 99, "士氣") / 99 * config.maximumMoraleBonus;
}

export function calculatePositionBonus(distance, idealRange, config = RECEIVE_QUALITY_CONFIG) {
  if (!Number.isFinite(distance) || distance < 0) throw new RangeError("到位距離不可為負數。");
  if (!Number.isFinite(idealRange) || idealRange <= 0) throw new RangeError("理想到位範圍必須大於 0。");
  return Math.max(0, 1 - distance / idealRange) * config.maximumPositionBonus;
}

export function calculatePreparationBonus(preparationTime, config = RECEIVE_QUALITY_CONFIG) {
  if (!Number.isFinite(preparationTime) || preparationTime < 0) {
    throw new RangeError("準備時間不可為負數。");
  }
  return Math.min(1, preparationTime / config.preparationSecondsForMaximum)
    * config.maximumPreparationBonus;
}

export function resolveReceiveQuality({
  receiveAbility,
  incomingSpeedLevel,
  positionDistance,
  idealRange,
  preparationTime,
  morale,
  random = Math.random,
  config = RECEIVE_QUALITY_CONFIG,
}) {
  const ability = assertRange(receiveAbility, 1, 99, "接球能力");
  const incomingDifficulty = config.incomingDifficulty[incomingSpeedLevel];
  if (!Number.isFinite(incomingDifficulty)) throw new RangeError(`未知的來球品質：${incomingSpeedLevel}`);
  const positionBonus = calculatePositionBonus(positionDistance, idealRange, config);
  const preparationBonus = calculatePreparationBonus(preparationTime, config);
  const moraleBonus = calculateMoraleBonus(morale, config);
  const randomPerformance = config.randomMinimum
    + readRandom(random) * (config.randomMaximum - config.randomMinimum);
  const score = ability - incomingDifficulty + positionBonus
    + preparationBonus + moraleBonus + randomPerformance;
  const quality = score >= config.perfectThreshold
    ? RECEIVE_QUALITIES.PERFECT
    : score >= config.normalThreshold
      ? RECEIVE_QUALITIES.NORMAL
      : RECEIVE_QUALITIES.BAD;
  return Object.freeze({
    quality,
    score,
    receiveAbility: ability,
    incomingSpeedLevel,
    incomingQuality: INCOMING_QUALITY_LABELS[incomingSpeedLevel],
    incomingDifficulty,
    positionDistance,
    positionBonus,
    preparationTime,
    preparationBonus,
    morale,
    moraleBonus,
    randomPerformance,
  });
}

export const SECOND_PASS_TRAJECTORY_CONFIG = Object.freeze({
  [RECEIVE_QUALITIES.PERFECT]: Object.freeze({ duration: 1.1, arcHeight: 160 }),
  [RECEIVE_QUALITIES.NORMAL]: Object.freeze({ duration: 1.3, arcHeight: 210 }),
  [RECEIVE_QUALITIES.BAD]: Object.freeze({ duration: 0.9, arcHeight: 120 }),
});

export const SECOND_TOUCH_TRAJECTORY_TUNING = Object.freeze({
  durationStep: 0.1,
  maximumAdditionalDuration: 0.6,
  additionalArcHeightPerSecond: 40,
});
