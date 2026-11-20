import { PLAYER_GIVEN_NAMES, PLAYER_SURNAMES } from "../data/player-names.js";
import { SERVE_TYPES } from "../models/player.js";
import { generatePlayerName } from "../utils/player-name-generator.js";
import { createSeededRandom } from "./attack-quality.js";
import { createMatchSeedSource } from "./match-seed.js";

const ABILITY_KEYS = Object.freeze(["attack", "block", "set", "receive", "serve"]);

const HOME_ROSTER = Object.freeze([
  { playerId: "HOME-S-1", position: "S", starterJob: "S" },
  { playerId: "HOME-OH1-1", position: "OH", starterJob: "OH1" },
  { playerId: "HOME-MB1-1", position: "MB", starterJob: "MB1" },
  { playerId: "HOME-OP-1", position: "OP", starterJob: "OP" },
  { playerId: "HOME-OH2-1", position: "OH", starterJob: "OH2" },
  { playerId: "HOME-MB2-1", position: "MB", starterJob: "MB2" },
  { playerId: "HOME-S-2", position: "S" },
  { playerId: "HOME-OH-3", position: "OH" },
  { playerId: "HOME-MB-3", position: "MB" },
  { playerId: "HOME-OP-2", position: "OP" },
  { playerId: "HOME-OH-4", position: "OH" },
  { playerId: "HOME-MB-4", position: "MB" },
]);

const AWAY_ROSTER = Object.freeze([
  { playerId: "AWAY-S-1", position: "S", starterJob: "S" },
  { playerId: "AWAY-OH1-1", position: "OH", starterJob: "OH1" },
  { playerId: "AWAY-MB1-1", position: "MB", starterJob: "MB1" },
  { playerId: "AWAY-OP-1", position: "OP", starterJob: "OP" },
  { playerId: "AWAY-OH2-1", position: "OH", starterJob: "OH2" },
  { playerId: "AWAY-MB2-1", position: "MB", starterJob: "MB2" },
]);

function randomInteger(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function createUniqueName(random, usedNames) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = generatePlayerName(random);
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  for (const surname of PLAYER_SURNAMES) for (const givenName of PLAYER_GIVEN_NAMES) {
    const candidate = `${surname}${givenName}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  throw new Error("姓名資料庫沒有足夠的不重複組合。 ");
}

function createTeam(roster, random, usedNames) {
  const starters = {};
  const players = roster.map(({ playerId, position, starterJob }) => {
    if (starterJob) starters[starterJob] = playerId;
    return { playerId, name: createUniqueName(random, usedNames), position,
      abilities: Object.fromEntries(ABILITY_KEYS.map((key) => [key, randomInteger(random, 1, 99)])),
      mood: randomInteger(random, 1, 5),
      serveType: SERVE_TYPES[randomInteger(random, 0, SERVE_TYPES.length - 1)], avatar: null };
  });
  return { players, starters };
}

export const FORMAL_MATCH_DEMO_SEED = 20261119;

export function createFormalMatchTestTeams({ seed = FORMAL_MATCH_DEMO_SEED, random = null } = {}) {
  const rosterRandom = random ?? createSeededRandom(seed >>> 0);
  const usedNames = new Set();
  return { HOME: createTeam(HOME_ROSTER, rosterRandom, usedNames),
    AWAY: createTeam(AWAY_ROSTER, rosterRandom, usedNames) };
}

export function createFormalMatchRosterSource({ fixedSeed = null, seedFactory } = {}) {
  const seedSource = createMatchSeedSource({ fixedSeed,
    ...(seedFactory ? { randomSeed: seedFactory } : {}) });
  return Object.freeze({ next() {
    const seed = seedSource.next();
    return Object.freeze({ seed, teams: createFormalMatchTestTeams({ seed }) });
  } });
}
