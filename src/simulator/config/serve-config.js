export const SERVE_TYPES_CONFIG = Object.freeze({ STANDING: "STANDING", JUMP: "JUMP" });

export const LEGACY_SERVE_TYPES = Object.freeze({ 一般: "STANDING", 跳飄: "JUMP", 跳發: "JUMP" });

export const SERVE_ACTION_TIMING = Object.freeze({ prepare: 0.18, contact: 0.08, followThrough: 0.42 });

export const SERVE_PROFILES = Object.freeze({
  STANDING: Object.freeze({
    speedFactors: Object.freeze({ SLOW: 1.6, NORMAL: 1.15, FAST: 0.35 }),
    arcHeight: 305,
    control: 1.35,
    tossDuration: 0.72,
    tossArcHeight: 105,
    contactHeight: 132,
  }),
  JUMP: Object.freeze({
    speedFactors: Object.freeze({ SLOW: 0.55, NORMAL: 1, FAST: 1.45 }),
    arcHeight: 215,
    control: 0.76,
    tossDuration: 1.02,
    tossArcHeight: 235,
    contactHeight: 205,
  }),
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
