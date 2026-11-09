export const SPIKE_SPEED_LEVELS = Object.freeze({ SLOW: "SLOW", NORMAL: "NORMAL", FAST: "FAST", ULTRA_FAST: "ULTRA_FAST" });
export const ATTACK_SEED_MODES = Object.freeze({ AUTO: "AUTO", FIXED: "FIXED" });

let autoSeedSequence = 0;
export function createAutoAttackSeed() {
  autoSeedSequence = (autoSeedSequence + 1) >>> 0;
  const time = Date.now() >>> 0;
  const entropy = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0x100000000) >>> 0;
  return (time ^ entropy ^ Math.imul(autoSeedSequence, 2654435761)) >>> 0;
}

export const SPIKE_SPEED_REFERENCE = Object.freeze({
  distance: 700,
  flightTimes: Object.freeze({ SLOW: 1.2, NORMAL: 0.9, FAST: 0.65, ULTRA_FAST: 0.45 }),
});

export function selectWeighted(weights, random) {
  const entries = Object.entries(weights);
  if (typeof random !== "function" || entries.length === 0
    || entries.some(([, weight]) => !Number.isFinite(weight) || weight < 0)
    || !entries.some(([, weight]) => weight > 0)) {
    throw new TypeError("加權抽選需要至少一個正權重、其餘非負權重與可呼叫的亂數來源。");
  }
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.min(1 - Number.EPSILON, Math.max(0, random())) * total;
  for (const [value, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return value;
  }
  return entries.at(-1)[0];
}

export function createSeededRandom(seed) {
  if (!Number.isInteger(seed)) throw new TypeError("實驗 RNG Seed 必須是整數。");
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function getSpikeReferenceSpeed(level) {
  const time = SPIKE_SPEED_REFERENCE.flightTimes[level];
  if (!time) throw new RangeError(`未知的扣球速度：${level}`);
  return SPIKE_SPEED_REFERENCE.distance / time;
}
