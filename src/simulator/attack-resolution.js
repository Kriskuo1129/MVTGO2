import { createSeededRandom, selectWeighted, SPIKE_SPEED_LEVELS } from "./attack-quality.js";
import { isSpikeGroundIn, SPIKE_COURT_V1 } from "./spike-court.js";

export const SET_QUALITY_MODIFIERS = Object.freeze({
  PERFECT: Object.freeze({ power: 10, consistency: 8 }),
  NORMAL: Object.freeze({ power: 0, consistency: 0 }),
  BAD: Object.freeze({ power: -15, consistency: -12 }),
});

export const ATTACK_POWER_ANCHORS = Object.freeze([
  Object.freeze({ ability: 1, SLOW: 95, NORMAL: 5, FAST: 0 }),
  Object.freeze({ ability: 25, SLOW: 75, NORMAL: 25, FAST: 0 }),
  Object.freeze({ ability: 40, SLOW: 45, NORMAL: 55, FAST: 0 }),
  Object.freeze({ ability: 45, SLOW: 35, NORMAL: 64, FAST: 1 }),
  Object.freeze({ ability: 60, SLOW: 15, NORMAL: 65, FAST: 20 }),
  Object.freeze({ ability: 70, SLOW: 8, NORMAL: 42, FAST: 50 }),
  Object.freeze({ ability: 80, SLOW: 3, NORMAL: 21, FAST: 75 }),
  Object.freeze({ ability: 90, SLOW: 1, NORMAL: 10, FAST: 79.96675900277009 }),
  Object.freeze({ ability: 99, SLOW: 0, NORMAL: 3, FAST: 67 }),
]);

export const SPIKE_SPEED_UNLOCK_THRESHOLDS = Object.freeze({
  SLOW: 1,
  NORMAL: 1,
  FAST: 45,
  ULTRA_FAST: 80,
});

export const LEFT_LONG_TARGET_V1 = Object.freeze({
  inBoundsPolygon: Object.freeze([
    Object.freeze({ x: 647, y: 299 }), Object.freeze({ x: 936, y: 299 }),
    Object.freeze({ x: 888, y: 770 }), Object.freeze({ x: 532, y: 782 }),
  ]),
  ballRadius: 32.5,
  outBand: Object.freeze({ minimumBeyondBall: 8, maximumBeyondBall: 72 }),
});

const clampAbility = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > 99) throw new RangeError("攻擊能力與攻擊穩定必須是 1～99 整數。");
  return value;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function applySetQualityModifiers(attack, attackConsistency, setQuality) {
  clampAbility(attack); clampAbility(attackConsistency);
  const modifier = SET_QUALITY_MODIFIERS[setQuality];
  if (!modifier) throw new RangeError(`未知的舉球品質：${setQuality}`);
  return Object.freeze({ setQuality,
    effectiveAttack: clamp(attack + modifier.power, 1, 99),
    effectiveConsistency: clamp(attackConsistency + modifier.consistency, 1, 99),
    powerModifier: modifier.power, consistencyModifier: modifier.consistency });
}

export function getUltraFastChance(attack) {
  clampAbility(attack);
  return attack < 80 ? 0 : 1 + 29 * Math.pow((attack - 80) / 19, 2);
}

export function getAttackSpeedWeights(attack) {
  clampAbility(attack);
  const upperIndex = ATTACK_POWER_ANCHORS.findIndex((anchor) => anchor.ability >= attack);
  const upper = ATTACK_POWER_ANCHORS[upperIndex], lower = ATTACK_POWER_ANCHORS[Math.max(0, upperIndex - 1)];
  const t = upper === lower ? 0 : (attack - lower.ability) / (upper.ability - lower.ability);
  const interpolated = Object.fromEntries(["SLOW", "NORMAL", "FAST"]
    .map((key) => [key, lower[key] + (upper[key] - lower[key]) * t]));
  const ultra = getUltraFastChance(attack);
  const available = 100 - ultra;
  if (attack < SPIKE_SPEED_UNLOCK_THRESHOLDS.FAST) interpolated.FAST = 0;
  const subtotal = Object.values(interpolated).reduce((sum, weight) => sum + weight, 0);
  return Object.freeze({
    SLOW: interpolated.SLOW / subtotal * available,
    NORMAL: interpolated.NORMAL / subtotal * available,
    FAST: interpolated.FAST / subtotal * available,
    ULTRA_FAST: ultra,
  });
}

export function getHighestUnlockedSpikeSpeed(attack) {
  clampAbility(attack);
  return Object.values(SPIKE_SPEED_LEVELS)
    .filter((level) => attack >= SPIKE_SPEED_UNLOCK_THRESHOLDS[level]).at(-1);
}

export function applySpikeSpeedUnlocks(weights, attack) {
  clampAbility(attack);
  const filtered = Object.fromEntries(Object.values(SPIKE_SPEED_LEVELS)
    .map((level) => [level, attack >= SPIKE_SPEED_UNLOCK_THRESHOLDS[level] ? weights[level] : 0]));
  const total = Object.values(filtered).reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) throw new RangeError("球速解鎖後必須至少保留一個正權重。");
  return Object.freeze(Object.fromEntries(Object.entries(filtered)
    .map(([level, weight]) => [level, weight / total * 100])));
}

export function getInTargetProbability(effectiveConsistency) {
  clampAbility(effectiveConsistency);
  return 0.60 + 0.36 * (effectiveConsistency - 1) / 98;
}

const triangleArea = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
function sampleTriangle(a, b, c, random) {
  const r1 = Math.sqrt(random()), r2 = random();
  return Object.freeze({ x: (1 - r1) * a.x + r1 * (1 - r2) * b.x + r1 * r2 * c.x,
    y: (1 - r1) * a.y + r1 * (1 - r2) * b.y + r1 * r2 * c.y });
}

export function sampleUniformQuadrilateral(polygon, random) {
  if (!Array.isArray(polygon) || polygon.length !== 4 || typeof random !== "function") throw new TypeError("四邊形均勻抽樣需要四個頂點與 RNG。");
  const firstArea = triangleArea(polygon[0], polygon[1], polygon[2]);
  const secondArea = triangleArea(polygon[0], polygon[2], polygon[3]);
  return random() < firstArea / (firstArea + secondArea)
    ? sampleTriangle(polygon[0], polygon[1], polygon[2], random)
    : sampleTriangle(polygon[0], polygon[2], polygon[3], random);
}

export function sampleNaturalOutTarget(random, court = SPIKE_COURT_V1,
  configuration = LEFT_LONG_TARGET_V1) {
  const polygon = court.leftLandingPolygon;
  // 排除球網邊，只取頂邊、底邊與左側底線；依邊長加權，避免短邊被過度抽樣。
  const edgeIndexes = [0, 2, 3];
  const edges = edgeIndexes.map((index) => {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  let cursor = random() * edges.reduce((sum, edge) => sum + edge.length, 0);
  const edge = edges.find((candidate) => (cursor -= candidate.length) <= 0) ?? edges.at(-1);
  const t = 0.08 + random() * 0.84;
  const base = { x: edge.a.x + (edge.b.x - edge.a.x) * t, y: edge.a.y + (edge.b.y - edge.a.y) * t };
  const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y, length = Math.hypot(dx, dy);
  const minimumOffset = configuration.ballRadius + configuration.outBand.minimumBeyondBall;
  const maximumOffset = configuration.ballRadius + configuration.outBand.maximumBeyondBall;
  const offset = minimumOffset + random() * (maximumOffset - minimumOffset);
  const point = Object.freeze({ x: base.x + dy / length * offset, y: base.y - dx / length * offset });
  if (point.x < 0 || point.x > court.world.width || point.y < 0 || point.y > court.world.height
    || isSpikeGroundIn(point, configuration.ballRadius, court)) throw new Error("界外目標帶產生非法座標。");
  return point;
}

export function createAttackRandomChannels(seed) {
  if (!Number.isInteger(seed)) throw new TypeError("攻擊抽選 Seed 必須是整數。");
  return Object.freeze({
    speed: createSeededRandom((seed ^ 0x51ed270b) >>> 0),
    targetType: createSeededRandom((seed ^ 0x9e3779b9) >>> 0),
    targetPoint: createSeededRandom((seed ^ 0x85ebca6b) >>> 0),
  });
}

export function resolveAttackOutput({ attack, attackConsistency, setQuality, seed,
  court = SPIKE_COURT_V1 }) {
  const effective = applySetQualityModifiers(attack, attackConsistency, setQuality);
  const channels = createAttackRandomChannels(seed);
  // 球速只看原始 attack；舉球品質不解鎖、也不改變球速分布。
  const rawSpeedWeights = getAttackSpeedWeights(attack);
  const speedWeights = applySpikeSpeedUnlocks(rawSpeedWeights, attack);
  const speedLevel = selectWeighted(speedWeights, channels.speed);
  const inProbability = getInTargetProbability(effective.effectiveConsistency);
  const targetInBounds = channels.targetType() < inProbability;
  const targetPoint = targetInBounds
    ? sampleUniformQuadrilateral(LEFT_LONG_TARGET_V1.inBoundsPolygon, channels.targetPoint)
    : sampleNaturalOutTarget(channels.targetPoint, court);
  return Object.freeze({ ...effective, rawAttack: attack, rawSpeedWeights, speedWeights,
    highestUnlockedSpeed: getHighestUnlockedSpikeSpeed(attack), speedLevel, inProbability,
    targetInBounds, targetPoint });
}
