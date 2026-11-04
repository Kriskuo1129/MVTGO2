export const MATCH_STATUS = Object.freeze({
  PRE_MATCH: "PRE_MATCH",
});

export const INITIAL_ROTATION = "R1";

export const MATCH_PHASES = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  RALLY_PREPARE: "RALLY_PREPARE",
  SERVE: "SERVE",
  SERVE_PREPARE: "SERVE_PREPARE",
  SERVE_EXECUTE: "SERVE_EXECUTE",
  BALL_IN_FLIGHT: "BALL_IN_FLIGHT",
  BALL_LANDED: "BALL_LANDED",
  RALLY_RESULT: "RALLY_RESULT",
  RALLY_ENDED: "RALLY_ENDED",
});

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
      phase: MATCH_PHASES.NOT_STARTED,
      rally: null,
      lastEvent: null,
      eventSequence: 0,
      rallySequence: 0,
      events: [],
    },
    tactics: Object.freeze({
      HOME: null,
      AWAY: null,
    }),
  };
}
