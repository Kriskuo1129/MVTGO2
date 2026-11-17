export const PASS_TRAJECTORY_CONFIG = Object.freeze({
  PERFECT: Object.freeze({ duration: 1.1, arcHeight: 160 }),
  NORMAL: Object.freeze({ duration: 1.3, arcHeight: 210 }),
  BAD: Object.freeze({ duration: 0.9, arcHeight: 120 }),
});

export const SET_TRAJECTORY_TUNING = Object.freeze({
  durationStep: 0.1,
  maximumAdditionalDuration: 0.6,
  additionalArcHeightPerSecond: 40,
  successfulTouchAnimationDuration: 0.35,
});
