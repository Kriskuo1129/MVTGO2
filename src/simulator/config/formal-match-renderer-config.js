export const FORMAL_MATCH_VISUALS = Object.freeze({
  ballSpin: Object.freeze({
    speedAnchors: Object.freeze([
      Object.freeze({ speed: 583.33, degreesPerSecond: 360 }),
      Object.freeze({ speed: 777.78, degreesPerSecond: 1080 }),
      Object.freeze({ speed: 1076.92, degreesPerSecond: 1800 }),
      Object.freeze({ speed: 1555.56, degreesPerSecond: 2880 }),
    ]),
    horizontalSpeedEpsilon: 1,
    receiveQualityDegreesPerSecond: Object.freeze({
      PERFECT: 540,
      NORMAL: 1260,
      BAD: 2160,
    }),
    blockRetention: 0.7,
    groundDecayDurationSeconds: 0.65,
  }),
  impact: Object.freeze({ noticeableSpeed: 700, strongSpeed: 1050,
    mildDurationMs: 260, noticeableDurationMs: 430, strongDurationMs: 820 }),
  ballTrail: Object.freeze({ durationSeconds: 0.25, minimumWorldDistance: 0.5,
    minimumOpacity: 0.08, maximumOpacity: 0.58 }),
  landingMarker: Object.freeze({ ballSizeScale: 1.45 }),
  playerShadow: Object.freeze({ widthScale: 0.72, heightScale: 0.2,
    maximumJumpHeight: 105, minimumScale: 0.62, minimumOpacity: 0.18, maximumOpacity: 0.38 }),
  rallyResultHoldMs: 1200,
});

export function resolveImpactLevel(impactSpeed) {
  if (!(impactSpeed > 0)) return "NONE";
  if (impactSpeed >= FORMAL_MATCH_VISUALS.impact.strongSpeed) return "STRONG";
  if (impactSpeed >= FORMAL_MATCH_VISUALS.impact.noticeableSpeed) return "NOTICEABLE";
  return "MILD";
}
