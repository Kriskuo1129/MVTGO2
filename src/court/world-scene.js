import { LINEUP_POSITIONS } from "../lineup/starting-lineup.js";
import { getInitialR1Position } from "../match/positioning.js";
import { WORLD_SIZE } from "./court-config.js";

export const INITIAL_BALL_POSITION = Object.freeze({
  x: WORLD_SIZE.width / 2,
  y: WORLD_SIZE.height / 2,
});

function createTeamWorldPlayers(teamId, startingLineup) {
  return LINEUP_POSITIONS.map((lineupPosition) => {
    const position = getInitialR1Position(teamId, lineupPosition);
    return {
      teamId,
      playerId: startingLineup.assignments[lineupPosition],
      lineupPosition,
      x: position.x,
      y: position.y,
    };
  });
}

export function createInitialWorldScene(homeStartingLineup, awayStartingLineup) {
  return {
    width: WORLD_SIZE.width,
    height: WORLD_SIZE.height,
    players: {
      HOME: createTeamWorldPlayers("HOME", homeStartingLineup),
      AWAY: createTeamWorldPlayers("AWAY", awayStartingLineup),
    },
    ball: {
      id: "BALL",
      x: INITIAL_BALL_POSITION.x,
      y: INITIAL_BALL_POSITION.y,
      height: 0,
    },
  };
}
