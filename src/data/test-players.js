import { createPlayer } from "../models/player.js";
import { generatePlayerName } from "../utils/player-name-generator.js";

const TEST_NAME_SEED = 20261102;

const HOME_PLAYER_DATA = [
  ["H001", "S", 72, 58, 91, 65, 70, 4, "跳飄"],
  ["H002", "OH", 88, 67, 54, 71, 82, 5, "跳發"],
  ["H003", "MB", 76, 85, 48, 60, 74, 3, "一般"],
  ["H004", "OP", 91, 73, 52, 68, 86, 4, "跳發"],
  ["H005", "OH", 84, 64, 57, 83, 79, 4, "跳飄"],
  ["H006", "MB", 70, 89, 45, 62, 72, 3, "一般"],
  ["H007", "S", 65, 55, 86, 78, 68, 5, "跳飄"],
  ["H008", "OH", 82, 76, 51, 74, 88, 2, "跳發"],
  ["H009", "MB", 68, 81, 47, 69, 66, 4, "一般"],
  ["H010", "OP", 79, 62, 59, 87, 75, 3, "跳飄"],
  ["H011", "OH", 86, 71, 50, 72, 90, 5, "跳發"],
  ["H012", "MB", 74, 84, 46, 64, 73, 3, "一般"],
];

const AWAY_PLAYER_DATA = [
  ["A001", "S", 80, 61, 88, 70, 76, 4, "跳飄"],
  ["A002", "OH", 89, 69, 53, 73, 85, 4, "跳發"],
  ["A003", "MB", 77, 87, 49, 63, 71, 3, "一般"],
  ["A004", "OP", 92, 75, 55, 67, 84, 5, "跳發"],
  ["A005", "OH", 83, 66, 58, 85, 78, 4, "跳飄"],
  ["A006", "MB", 71, 90, 44, 65, 69, 3, "一般"],
];

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function fromRow([id, position, attack, block, set, receive, serve, mood, serveType], random) {
  return createPlayer({
    id,
    name: generatePlayerName(random),
    position,
    abilities: { attack, block, set, receive, serve },
    mood,
    serveType,
    avatar: null,
  });
}

export function createTestMatchPlayers() {
  const random = createSeededRandom(TEST_NAME_SEED);
  const home = Object.freeze(HOME_PLAYER_DATA.map((row) => fromRow(row, random)));
  const away = Object.freeze(AWAY_PLAYER_DATA.map((row) => fromRow(row, random)));
  const allPlayerIds = [...home, ...away].map((player) => player.id);
  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    throw new Error("球員 ID 不可重複。");
  }
  return Object.freeze({ home, away });
}

export function createTestMatchData({
  awayTeamName = "虎科資工",
  courtId = "court-01",
} = {}) {
  const players = createTestMatchPlayers();
  return Object.freeze({
    matchName: "大資盃 冠軍賽",
    homeTeamName: "系排GO",
    awayTeamName,
    courtId,
    homePlayers: players.home,
    awayPlayers: players.away,
  });
}
