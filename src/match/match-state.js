export const MATCH_STATUS = Object.freeze({
  PRE_MATCH: "PRE_MATCH",
});

export const INITIAL_ROTATION = "R1";

export function createInitialMatchState() {
  return {
    status: MATCH_STATUS.PRE_MATCH,
    rotations: Object.freeze({
      HOME: INITIAL_ROTATION,
      AWAY: INITIAL_ROTATION,
    }),
    score: {
      HOME: 0,
      AWAY: 0,
    },
    runtime: {
      servingTeam: "HOME",
      lastEvent: null,
    },
    tactics: Object.freeze({
      HOME: null,
      AWAY: null,
    }),
  };
}
