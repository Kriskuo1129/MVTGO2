export const SERVE_TYPES_CONFIG = Object.freeze({ STANDING: "STANDING",
  JUMP_FLOAT: "JUMP_FLOAT", JUMP: "JUMP" });

export const LEGACY_SERVE_TYPES = Object.freeze({ 一般: "STANDING", 跳飄: "JUMP_FLOAT", 跳發: "JUMP" });

export const SERVE_ACTION_TIMING = Object.freeze({ prepare: 0.18, contact: 0.08, followThrough: 0.42 });

export const SERVE_PROFILES = Object.freeze({
  STANDING: Object.freeze({
    speedFactors: Object.freeze({ SLOW: 1.6, NORMAL: 1.15, FAST: 0.35 }),
    arcHeight: 305,
    control: 1.35,
    tossDuration: 0.72,
    tossArcHeight: 105,
    contactHeight: 132,
    qualityAnchors: Object.freeze({ low: Object.freeze({ PERFECT: 8, NORMAL: 62, BAD: 30 }),
      high: Object.freeze({ PERFECT: 58, NORMAL: 39, BAD: 3 }) }),
  }),
  JUMP_FLOAT: Object.freeze({
    speedFactors: Object.freeze({ SLOW: 0.9, NORMAL: 1.3, FAST: 0.9 }),
    arcHeight: 255,
    control: 0.95,
    tossDuration: 0.96,
    tossArcHeight: 205,
    contactHeight: 190,
    qualityAnchors: Object.freeze({ low: Object.freeze({ PERFECT: 5, NORMAL: 55, BAD: 40 }),
      high: Object.freeze({ PERFECT: 55, NORMAL: 40, BAD: 5 }) }),
  }),
  JUMP: Object.freeze({
    speedFactors: Object.freeze({ SLOW: 0.55, NORMAL: 1, FAST: 1.45 }),
    arcHeight: 215,
    control: 0.76,
    tossDuration: 1.02,
    tossArcHeight: 235,
    contactHeight: 205,
    qualityAnchors: Object.freeze({ low: Object.freeze({ PERFECT: 2, NORMAL: 43, BAD: 55 }),
      high: Object.freeze({ PERFECT: 52, NORMAL: 40, BAD: 8 }) }),
  }),
});

export const SERVE_QUALITY_MODIFIERS = Object.freeze({
  PERFECT: Object.freeze({ controlSpread: 0.65, arcVariance: 0.6 }),
  NORMAL: Object.freeze({ controlSpread: 1, arcVariance: 1 }),
  BAD: Object.freeze({ controlSpread: 1.55, arcVariance: 1.35 }),
});

export const SERVE_TARGET_WEIGHTS = Object.freeze({ BACK: 80, FRONT: 20 });

export const SERVE_GEOMETRY_CONFIG = Object.freeze({
  outsideBaselineDistance: 105,
  tossForwardDistance: 64,
  tossStartHeight: 62,
  targetHeight: 32.5,
  defaultBallRadius: 32.5,
  defaultAvatarRadius: 65,
  contactSamples: 12,
  anchorHorizontalScale: 0.78,
  anchorVerticalScale: 0.55,
  contactDistancePadding: 16,
  jumpScreenClearance: 8,
  jumpHeightTolerance: 45,
  controlSpreadCoefficient: 1.65,
  netTargetMargin: 1,
  arcVariance: 24,
  jumpMotionContactFraction: 0.78,
  jumpMotionMaximumHeight: 85,
  jumpMotionStartProgress: 0.42,
  netFinishHorizontalRetention: 0.12,
  netFinishVerticalRetention: 0.2,
  netFinishMinimumDownwardSpeed: -80,
});
