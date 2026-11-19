export const ABILITY_PERFORMANCE_CONFIG = Object.freeze({
  mismatchMultiplier: 0.8,
  moodModifiers: Object.freeze({ 1: -4, 2: -2, 3: 0, 4: 2, 5: 4 }),
  moraleNeutral: 30,
  moraleModifierPerPoint: 0.05,
  minimumEffectiveAbility: 1,
  maximumEffectiveAbility: 99,
  attackConsistency: Object.freeze({ scale: 1, offset: 0 }),
});

export const POSITION_JOB_COMPATIBILITY = Object.freeze({
  S: Object.freeze(["S"]),
  OH: Object.freeze(["OH1", "OH2"]),
  MB: Object.freeze(["MB1", "MB2"]),
  OP: Object.freeze(["OP"]),
});
