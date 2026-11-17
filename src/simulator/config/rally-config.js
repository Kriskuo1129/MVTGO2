export const RALLY_FLOW_CONFIG = Object.freeze({
  intermissionDuration: 0.8,
  finishingHoldDuration: 0.35,
  finishingMaximumDuration: 3,
  maximumTeamTouches: 3,
});

export const FORMAL_MATCH_RULES = Object.freeze({
  setsToWin: 2,
  setTargetPoints: Object.freeze([25, 25, 15]),
  minimumWinningMargin: 2,
  maximumRallySimulationTime: 120,
  maximumMatchRallies: 1000,
});
