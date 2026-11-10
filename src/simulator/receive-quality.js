import { RECEIVE_SPEED_LEVELS } from "./receive-animation.js";

export const RECEIVE_QUALITIES = Object.freeze({
  PERFECT: "PERFECT",
  NORMAL: "NORMAL",
  BAD: "BAD",
});

export const RECEIVE_RESULTS = Object.freeze({
  MISS: "MISS",
  ERROR: "ERROR",
  SUCCESS: "SUCCESS",
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

// V1 暫定成功率：與品質分數共用能力、來球難度及正向加成，但不加入隨機發揮。
// 錨點之間採線性插值，避免把成功率數值散落在發球與扣球流程。
export const RECEIVE_SUCCESS_CONFIG = Object.freeze({
  scoreAnchors: Object.freeze([
    Object.freeze({ score: -35, probability: 0.05 }),
    Object.freeze({ score: 0, probability: 0.18 }),
    Object.freeze({ score: 25, probability: 0.42 }),
    Object.freeze({ score: 50, probability: 0.68 }),
    Object.freeze({ score: 75, probability: 0.86 }),
    Object.freeze({ score: 100, probability: 0.95 }),
  ]),
  errorFlight: Object.freeze({
    minimumDuration: 0.45,
    maximumDuration: 0.9,
    minimumArcHeight: 45,
    maximumArcHeight: 150,
    minimumDistance: 180,
    maximumDistance: 520,
    directionSpreadRadians: Math.PI * 0.78,
  }),
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

export function normalizeReceiveSpeedLevel(speedLevel) {
  if (speedLevel === "NORMAL") return RECEIVE_SPEED_LEVELS.MEDIUM;
  if (Object.values(RECEIVE_SPEED_LEVELS).includes(speedLevel)) return speedLevel;
  throw new RangeError(`未知的來球速度：${speedLevel}`);
}

function interpolateProbability(score, anchors) {
  if (score <= anchors[0].score) return anchors[0].probability;
  const last = anchors[anchors.length - 1];
  if (score >= last.score) return last.probability;
  const upperIndex = anchors.findIndex((anchor) => anchor.score >= score);
  const lower = anchors[upperIndex - 1];
  const upper = anchors[upperIndex];
  const progress = (score - lower.score) / (upper.score - lower.score);
  return lower.probability + (upper.probability - lower.probability) * progress;
}

export function calculateReceiveSuccess({
  receiveAbility,
  incomingSpeedLevel,
  positionDistance,
  idealRange,
  preparationTime,
  morale,
  qualityConfig = RECEIVE_QUALITY_CONFIG,
  successConfig = RECEIVE_SUCCESS_CONFIG,
}) {
  const ability = assertRange(receiveAbility, 1, 99, "接球能力");
  const normalizedSpeedLevel = normalizeReceiveSpeedLevel(incomingSpeedLevel);
  const incomingDifficulty = qualityConfig.incomingDifficulty[normalizedSpeedLevel];
  const positionBonus = calculatePositionBonus(positionDistance, idealRange, qualityConfig);
  const preparationBonus = calculatePreparationBonus(preparationTime, qualityConfig);
  const moraleBonus = calculateMoraleBonus(morale, qualityConfig);
  const controlScore = ability - incomingDifficulty + positionBonus + preparationBonus + moraleBonus;
  return Object.freeze({
    probability: interpolateProbability(controlScore, successConfig.scoreAnchors),
    controlScore,
    receiveAbility: ability,
    incomingSpeedLevel: normalizedSpeedLevel,
    incomingDifficulty,
    positionDistance,
    positionBonus,
    preparationTime,
    preparationBonus,
    morale,
    moraleBonus,
  });
}

export function resolveReceiveContact({ contacted, random = Math.random, ...input }) {
  if (!contacted) return Object.freeze({ result: RECEIVE_RESULTS.MISS, contacted: false });
  const success = calculateReceiveSuccess(input);
  const successRoll = readRandom(random);
  if (successRoll >= success.probability) {
    return Object.freeze({ result: RECEIVE_RESULTS.ERROR, contacted: true, successRoll, ...success });
  }
  const quality = resolveReceiveQuality({ ...input,
    incomingSpeedLevel: success.incomingSpeedLevel, random });
  return Object.freeze({ result: RECEIVE_RESULTS.SUCCESS, contacted: true,
    successRoll, ...success, quality: quality.quality, qualityResult: quality });
}

export function createReceiveErrorTrajectory({
  start,
  incomingVelocity,
  random = Math.random,
  config = RECEIVE_SUCCESS_CONFIG.errorFlight,
}) {
  if (![start?.x, start?.y, start?.height, incomingVelocity?.x, incomingVelocity?.y]
    .every(Number.isFinite)) throw new TypeError("失控球路需要有效的接觸點與來球速度。");
  const incomingAngle = Math.atan2(incomingVelocity.y, incomingVelocity.x);
  const deflection = (readRandom(random) - 0.5) * config.directionSpreadRadians;
  const angle = incomingAngle + Math.PI + deflection;
  const distance = config.minimumDistance
    + readRandom(random) * (config.maximumDistance - config.minimumDistance);
  const duration = config.minimumDuration
    + readRandom(random) * (config.maximumDuration - config.minimumDuration);
  const arcHeight = config.minimumArcHeight
    + readRandom(random) * (config.maximumArcHeight - config.minimumArcHeight);
  return Object.freeze({
    start: Object.freeze({ ...start }),
    target: Object.freeze({
      x: start.x + Math.cos(angle) * distance,
      y: start.y + Math.sin(angle) * distance,
      height: 0,
    }),
    duration,
    arcHeight,
    directionRadians: angle,
    distance,
  });
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
  const normalizedSpeedLevel = normalizeReceiveSpeedLevel(incomingSpeedLevel);
  const incomingDifficulty = config.incomingDifficulty[normalizedSpeedLevel];
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
    incomingSpeedLevel: normalizedSpeedLevel,
    incomingQuality: INCOMING_QUALITY_LABELS[normalizedSpeedLevel],
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
