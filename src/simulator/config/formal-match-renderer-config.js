export const FORMAL_MATCH_VISUALS = Object.freeze({
  ballDeformation: Object.freeze({
    SLOW: Object.freeze({ scaleX: 1, scaleY: 1 }),
    NORMAL: Object.freeze({ scaleX: 1.2, scaleY: 0.94 }),
    FAST: Object.freeze({ scaleX: 1.55, scaleY: 0.86 }),
    ULTRA_FAST: Object.freeze({ scaleX: 2.05, scaleY: 0.76 }),
    transitionMs: 90,
  }),
  impact: Object.freeze({ noticeableSpeed: 700, strongSpeed: 1050,
    mildDurationMs: 260, noticeableDurationMs: 430, strongDurationMs: 820 }),
  rallyResultHoldMs: 1200,
});

export function resolveImpactLevel(impactSpeed) {
  if (!(impactSpeed > 0)) return "NONE";
  if (impactSpeed >= FORMAL_MATCH_VISUALS.impact.strongSpeed) return "STRONG";
  if (impactSpeed >= FORMAL_MATCH_VISUALS.impact.noticeableSpeed) return "NOTICEABLE";
  return "MILD";
}
