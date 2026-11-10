import assert from "node:assert/strict";
import { applySetQualityModifiers, applySpikeSpeedUnlocks, ATTACK_POWER_ANCHORS,
  getAttackSpeedWeights, getHighestUnlockedSpikeSpeed, getInTargetProbability,
  getUltraFastChance, LEFT_LONG_TARGET_V1, resolveAttackOutput, SPIKE_SPEED_UNLOCK_THRESHOLDS,
  sampleNaturalOutTarget, sampleUniformQuadrilateral } from "../src/simulator/attack-resolution.js";
import { createSeededRandom, SPIKE_SPEED_LEVELS } from "../src/simulator/attack-quality.js";
import { isSpikeGroundIn, SPIKE_COURT_V1 } from "../src/simulator/spike-court.js";

assert.deepEqual(applySetQualityModifiers(50, 50, "PERFECT"), {
  setQuality: "PERFECT", effectiveAttack: 60, effectiveConsistency: 58,
  powerModifier: 10, consistencyModifier: 8,
});
assert.equal(applySetQualityModifiers(50, 50, "NORMAL").effectiveAttack, 50);
assert.equal(applySetQualityModifiers(50, 50, "BAD").effectiveAttack, 35);
assert.equal(applySetQualityModifiers(50, 50, "BAD").effectiveConsistency, 38);
assert.equal(getInTargetProbability(1), 0.6);
assert.equal(getInTargetProbability(50), 0.78);
assert.equal(getInTargetProbability(99), 0.96);
const expectedAnchors = new Map([
  [1, [95, 5, 0, 0]], [25, [75, 25, 0, 0]], [40, [45, 55, 0, 0]],
  [45, [35, 64, 1, 0]], [60, [15, 65, 20, 0]], [70, [8, 42, 50, 0]],
  [80, [3, 21, 75, 1]], [90, [1, 10, 79.96675900277009, 9.033240997229916]],
  [99, [0, 3, 67, 30]],
]);
for (const [ability, expected] of expectedAnchors) {
  const actual = getAttackSpeedWeights(ability);
  Object.values(SPIKE_SPEED_LEVELS).forEach((level, index) => {
    assert.ok(Math.abs(actual[level] - expected[index]) < 1e-9, `${ability} ${level}`);
  });
}
for (let ability = 1; ability <= 99; ability++) {
  const weights = getAttackSpeedWeights(ability);
  assert.ok(Object.values(weights).every((weight) => weight >= 0));
  assert.ok(Math.abs(Object.values(weights).reduce((sum, weight) => sum + weight, 0) - 100) < 1e-9);
  if (ability < 45) assert.equal(weights.FAST, 0);
  if (ability < 80) assert.equal(weights.ULTRA_FAST, 0);
}
assert.equal(getUltraFastChance(80), 1);
assert.ok(Math.abs(getUltraFastChance(90) - 9.033240997229916) < 1e-12);
assert.equal(getUltraFastChance(99), 30);
assert.deepEqual(SPIKE_SPEED_UNLOCK_THRESHOLDS, { SLOW: 1, NORMAL: 1, FAST: 45, ULTRA_FAST: 80 });
assert.equal(getHighestUnlockedSpikeSpeed(1), "NORMAL");
assert.equal(getHighestUnlockedSpikeSpeed(44), "NORMAL");
assert.equal(getHighestUnlockedSpikeSpeed(45), "FAST");
assert.equal(getHighestUnlockedSpikeSpeed(79), "FAST");
assert.equal(getHighestUnlockedSpikeSpeed(80), "ULTRA_FAST");
const normalizedExample = applySpikeSpeedUnlocks({ SLOW: 20, NORMAL: 40, FAST: 32, ULTRA_FAST: 8 }, 30);
assert.ok(Math.abs(normalizedExample.SLOW - 100 / 3) < 1e-9);
assert.ok(Math.abs(normalizedExample.NORMAL - 200 / 3) < 1e-9);
assert.equal(normalizedExample.FAST, 0);
assert.equal(normalizedExample.ULTRA_FAST, 0);

for (const scenario of [
  { attack: 1, setQuality: "PERFECT", forbidden: ["FAST", "ULTRA_FAST"] },
  { attack: 30, setQuality: "NORMAL", forbidden: ["FAST", "ULTRA_FAST"] },
  { attack: 44, setQuality: "PERFECT", forbidden: ["FAST", "ULTRA_FAST"] },
  { attack: 45, setQuality: "BAD", forbidden: ["ULTRA_FAST"], required: "FAST" },
  { attack: 79, setQuality: "PERFECT", forbidden: ["ULTRA_FAST"] },
  { attack: 80, setQuality: "BAD", forbidden: [], required: "ULTRA_FAST" },
  { attack: 99, setQuality: "NORMAL", forbidden: [], required: "ULTRA_FAST" },
  { attack: 75, setQuality: "PERFECT", forbidden: ["ULTRA_FAST"] },
]) {
  const seen = new Set();
  for (let index = 0; index < 10000; index++) {
    const result = resolveAttackOutput({ attack: scenario.attack, attackConsistency: 50,
      setQuality: scenario.setQuality, seed: Math.imul(index + 1, 2654435761) >>> 0 });
    seen.add(result.speedLevel);
    assert.ok(Math.abs(Object.values(result.speedWeights).reduce((sum, value) => sum + value, 0) - 100) < 1e-9);
    for (const level of scenario.forbidden) assert.equal(result.speedWeights[level], 0);
  }
  for (const level of scenario.forbidden) assert.equal(seen.has(level), false);
  if (scenario.required) assert.equal(seen.has(scenario.required), true);
}

function pointInPolygon(point, polygon) {
  let sign = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) > 1e-8) { const next = Math.sign(cross); if (sign && sign !== next) return false; sign ||= next; }
  }
  return true;
}

const quadrilateralSamples = Array.from({ length: 10000 }, (_, index) =>
  sampleUniformQuadrilateral(LEFT_LONG_TARGET_V1.inBoundsPolygon, createSeededRandom(index * 7919 + 17)));
assert.ok(quadrilateralSamples.every((point) => pointInPolygon(point, LEFT_LONG_TARGET_V1.inBoundsPolygon)));
const qMean = quadrilateralSamples.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
qMean.x /= quadrilateralSamples.length; qMean.y /= quadrilateralSamples.length;
assert.ok(qMean.x > 730 && qMean.x < 790 && qMean.y > 500 && qMean.y < 570);

for (let seed = 0; seed < 1000; seed++) {
  const point = sampleNaturalOutTarget(createSeededRandom(seed * 2654435761));
  assert.equal(isSpikeGroundIn(point, 32.5, SPIKE_COURT_V1), false);
  assert.ok(point.x >= 0 && point.x <= 2280 && point.y >= 0 && point.y <= 900);
}

const scenarios = [
  { attack: 10, attackConsistency: 10, setQuality: "NORMAL" },
  { attack: 50, attackConsistency: 50, setQuality: "NORMAL" },
  { attack: 90, attackConsistency: 90, setQuality: "NORMAL" },
  { attack: 50, attackConsistency: 50, setQuality: "PERFECT" },
  { attack: 50, attackConsistency: 50, setQuality: "BAD" },
];
const report = [];
for (const scenario of scenarios) {
  const speedCounts = Object.fromEntries(Object.values(SPIKE_SPEED_LEVELS).map((level) => [level, 0]));
  let inTargets = 0;
  for (let index = 0; index < 3000; index++) {
    const result = resolveAttackOutput({ ...scenario, seed: (Math.imul(index + 1, 2654435761) ^ 0xa5a5a5a5) >>> 0 });
    speedCounts[result.speedLevel]++;
    if (result.targetInBounds) inTargets++;
    assert.equal(result.targetInBounds
      ? pointInPolygon(result.targetPoint, LEFT_LONG_TARGET_V1.inBoundsPolygon)
      : !isSpikeGroundIn(result.targetPoint, 32.5), true);
  }
  report.push({ ...scenario, speedCounts, inTargetRate: inTargets / 30 });
}
assert.ok(report[2].speedCounts.ULTRA_FAST > report[0].speedCounts.ULTRA_FAST);
assert.ok(report[2].inTargetRate > report[0].inTargetRate);
// attack 只改速度權重；consistency 只改界內機率。
assert.equal(getInTargetProbability(applySetQualityModifiers(1, 70, "NORMAL").effectiveConsistency),
  getInTargetProbability(applySetQualityModifiers(99, 70, "NORMAL").effectiveConsistency));
assert.deepEqual(getAttackSpeedWeights(applySetQualityModifiers(70, 1, "NORMAL").effectiveAttack),
  getAttackSpeedWeights(applySetQualityModifiers(70, 99, "NORMAL").effectiveAttack));
const attack79Normal = resolveAttackOutput({ attack: 79, attackConsistency: 50, setQuality: "NORMAL", seed: 7 });
const attack79Perfect = resolveAttackOutput({ attack: 79, attackConsistency: 50, setQuality: "PERFECT", seed: 7 });
assert.deepEqual(attack79Perfect.speedWeights, attack79Normal.speedWeights);
assert.equal(attack79Perfect.speedLevel, attack79Normal.speedLevel);
assert.equal(attack79Perfect.speedWeights.ULTRA_FAST, 0);

console.log(JSON.stringify({ parameterSamplesPerScenario: 3000, targetUniformityMean: qMean, scenarios: report }, null, 2));
console.log("PASS: unlock thresholds/boundaries and 8×10000 no-over-tier draws; normalized unlocked weights; power anchors/interpolation; independent consistency; set-quality modifiers; uniform quadrilateral; natural out bands; 5×3000 parameter samples.");
