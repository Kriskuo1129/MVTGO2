import { PLAYER_POSITIONS, SERVE_TYPES } from "../models/player.js";
import { SERVE_TYPES_CONFIG } from "./config/serve-config.js";
import { RALLY_ROTATIONS, ROTATION_JOBS } from "./rotation-config.js";

export const FORMAL_RALLY_TEAMS = Object.freeze(["HOME", "AWAY"]);
export const FORMAL_RALLY_JOBS = ROTATION_JOBS;
export const FORMAL_PLAYER_ABILITY_KEYS = Object.freeze(["attack", "block", "set", "receive", "serve"]);
export const FORMAL_RALLY_INPUT_VERSION = "FORMAL_RALLY_PLAYER_INPUT_V1";

const SIMULATION_SERVE_TYPES = Object.freeze(Object.values(SERVE_TYPES_CONFIG));

function assertInteger(value, minimum, maximum, fieldName) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${fieldName} 必須是 ${minimum}～${maximum} 的整數。`);
  }
}

function validatePlayer(entry, team, index, allIds) {
  const label = `${team}[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError(`${label} 必須是球員物件。`);
  }
  const playerId = typeof entry.playerId === "string" ? entry.playerId.trim() : "";
  if (!playerId) throw new TypeError(`${label}.playerId 不可為空。`);
  if (allIds.has(playerId)) throw new RangeError(`playerId 不可重複：${playerId}。`);
  allIds.add(playerId);
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!name) throw new TypeError(`${label}.name 不可為空。`);
  if (!FORMAL_RALLY_JOBS.includes(entry.job)) {
    throw new RangeError(`${label}.job 必須是：${FORMAL_RALLY_JOBS.join("、")}。`);
  }
  if (!PLAYER_POSITIONS.includes(entry.position)) {
    throw new RangeError(`${label}.position 必須是：${PLAYER_POSITIONS.join("、")}。`);
  }
  const abilities = {};
  for (const key of FORMAL_PLAYER_ABILITY_KEYS) {
    assertInteger(entry.abilities?.[key], 1, 99, `${label}.abilities.${key}`);
    abilities[key] = entry.abilities[key];
  }
  assertInteger(entry.mood, 1, 5, `${label}.mood`);
  if (!SERVE_TYPES.includes(entry.serveType)) {
    throw new RangeError(`${label}.serveType 必須是：${SERVE_TYPES.join("、")}。`);
  }
  if (entry.avatar !== null && entry.avatar !== undefined && typeof entry.avatar !== "string") {
    throw new TypeError(`${label}.avatar 必須是字串或 null。`);
  }
  const overrides = entry.simulationOverrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new TypeError(`${label}.simulationOverrides 為開發測試必要欄位，必須明示提供。`);
  }
  assertInteger(overrides.attackConsistency, 1, 99,
    `${label}.simulationOverrides.attackConsistency`);
  assertInteger(overrides.morale, 0, 99, `${label}.simulationOverrides.morale`);
  if (!SIMULATION_SERVE_TYPES.includes(overrides.serveType)) {
    throw new RangeError(`${label}.simulationOverrides.serveType 必須是：${SIMULATION_SERVE_TYPES.join("、")}。`);
  }
  return Object.freeze({
    playerId, name, job: entry.job, position: entry.position,
    abilities: Object.freeze(abilities), mood: entry.mood,
    serveType: entry.serveType, avatar: entry.avatar ?? null,
    simulationOverrides: Object.freeze({
      attackConsistency: overrides.attackConsistency,
      morale: overrides.morale,
      serveType: overrides.serveType,
    }),
  });
}

export function validateFormalRallyTeams(input) {
  const source = input?.teams ?? input;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("正式 Rally 必須提供 HOME／AWAY 球員資料。");
  }
  const ids = new Set();
  const teams = {};
  for (const team of FORMAL_RALLY_TEAMS) {
    if (!Array.isArray(source[team]) || source[team].length !== FORMAL_RALLY_JOBS.length) {
      throw new RangeError(`${team} 必須提供六名場上球員。`);
    }
    const players = source[team].map((entry, index) => validatePlayer(entry, team, index, ids));
    const jobs = players.map((entry) => entry.job);
    for (const job of FORMAL_RALLY_JOBS) {
      if (jobs.filter((candidate) => candidate === job).length !== 1) {
        throw new RangeError(`${team} 必須且只能提供一名 ${job}。`);
      }
    }
    teams[team] = Object.freeze(players);
  }
  return Object.freeze({ version: FORMAL_RALLY_INPUT_VERSION,
    teams: Object.freeze(teams) });
}

export function validateFormalRallySetup({ rotations = { HOME: "R1", AWAY: "R1" },
  servingTeam = "HOME", seed = 1 } = {}) {
  if (!FORMAL_RALLY_TEAMS.includes(servingTeam)) {
    throw new RangeError("發球方必須為 HOME 或 AWAY。");
  }
  const normalizedRotations = {};
  for (const team of FORMAL_RALLY_TEAMS) {
    if (!RALLY_ROTATIONS.includes(rotations?.[team])) {
      throw new RangeError(`${team} 輪次必須是：${RALLY_ROTATIONS.join("、")}。`);
    }
    normalizedRotations[team] = rotations[team];
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Seed 必須是 0～4294967295 的整數。");
  }
  return Object.freeze({ rotations: Object.freeze(normalizedRotations), servingTeam, seed: seed >>> 0 });
}
