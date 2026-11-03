import { LINEUP_POSITIONS } from "../lineup/starting-lineup.js";
import { WORLD_SIZE } from "./court-config.js";

// Phase 2A 畫面驗證用占位座標，不代表正式輪次站位規則。
const INITIAL_PLAYER_POSITIONS = Object.freeze({
  HOME: Object.freeze({
    S: Object.freeze({ x: 640, y: 520 }),
    OH1: Object.freeze({ x: 810, y: 650 }),
    MB1: Object.freeze({ x: 1000, y: 560 }),
    OP: Object.freeze({ x: 650, y: 700 }),
    OH2: Object.freeze({ x: 820, y: 390 }),
    MB2: Object.freeze({ x: 1010, y: 400 }),
  }),
  AWAY: Object.freeze({
    S: Object.freeze({ x: 1640, y: 520 }),
    OH1: Object.freeze({ x: 1470, y: 650 }),
    MB1: Object.freeze({ x: 1280, y: 560 }),
    OP: Object.freeze({ x: 1630, y: 700 }),
    OH2: Object.freeze({ x: 1460, y: 390 }),
    MB2: Object.freeze({ x: 1270, y: 400 }),
  }),
});

export const INITIAL_BALL_POSITION = Object.freeze({
  x: WORLD_SIZE.width / 2,
  y: WORLD_SIZE.height / 2,
});

function createTeamWorldPlayers(teamId, startingLineup) {
  return LINEUP_POSITIONS.map((lineupPosition) => {
    const position = INITIAL_PLAYER_POSITIONS[teamId][lineupPosition];
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
    },
  };
}
