export const ATTACK_SET_QUALITY_MODIFIERS = Object.freeze({
  PERFECT: Object.freeze({ power: 10, consistency: 8 }),
  NORMAL: Object.freeze({ power: 0, consistency: 0 }),
  BAD: Object.freeze({ power: -15, consistency: -12 }),
});

export const ATTACK_POWER_WEIGHT_ANCHORS = Object.freeze([
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

export const ATTACK_SPEED_UNLOCKS = Object.freeze({
  SLOW: 1,
  NORMAL: 1,
  FAST: 45,
  ULTRA_FAST: 80,
});

export const ATTACK_SPEED_REFERENCE = Object.freeze({
  distance: 700,
  flightTimes: Object.freeze({ SLOW: 1.2, NORMAL: 0.9, FAST: 0.65, ULTRA_FAST: 0.45 }),
});

export const ATTACK_TARGET_CONFIG = Object.freeze({
  inBoundsPolygon: Object.freeze([
    Object.freeze({ x: 647, y: 299 }),
    Object.freeze({ x: 936, y: 299 }),
    Object.freeze({ x: 888, y: 770 }),
    Object.freeze({ x: 532, y: 782 }),
  ]),
  ballRadius: 32.5,
  outBand: Object.freeze({ minimumBeyondBall: 8, maximumBeyondBall: 72 }),
  inTargetBaseProbability: 0.60,
  inTargetAbilitySpan: 0.36,
  ultraFastMinimumAbility: 80,
  ultraFastBaseChance: 1,
  ultraFastAdditionalChance: 29,
  ultraFastAbilitySpan: 19,
  outTargetEdgeInset: 0.08,
});

// V1 動作仍屬暫定值；集中後保留原始時序與物理接觸順序。
export const ATTACK_MOTION_PARAMETERS = Object.freeze({
  maximumHeight: 60,
  jumpDuration: 1,
  takeoffDuration: 0.1,
  drawDuration: 0.2,
  swingDuration: 0.12,
  direction: "LEFT",
  maximumTakeoffDelay: 0.1,
  strikeAngleTolerance: 4,
  drawAngle: 30,
  strikeAngle: -30,
  fullRotationAngle: 360,
});

export const ATTACK_CONTACT_PARAMETERS = Object.freeze({
  minimumBaseHeight: 140,
  heightTolerance: 20,
  horizontalTolerance: 18,
  verticalTolerance: 18,
  minimumOverlapDepth: 16,
  contactHeight: 180,
});
