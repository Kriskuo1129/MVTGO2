import { SPIKE_COURT_V1 } from "./spike-court.js";
import { TEAM_RECEIVE_FORMATION, TEAM_SIMULATOR_AVATAR_SIZE } from "./team-simulator.js";

export const CONTINUOUS_FORMATION_VERSION = "CONTINUOUS_FORMATION_V1";
export const CONTINUOUS_FORMATION_STORAGE_KEY = "mvtgo2.continuousFormation.v1";
export const CONTINUOUS_TEAMS = Object.freeze(["HOME", "AWAY"]);

const margin = TEAM_SIMULATOR_AVATAR_SIZE / 2;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function sideBoundsAtY(y) {
  const progress = (y - SPIKE_COURT_V1.bounds.minY)
    / (SPIKE_COURT_V1.bounds.maxY - SPIKE_COURT_V1.bounds.minY);
  return {
    left: 625 + (510 - 625) * progress,
    right: 1655 + (1770 - 1655) * progress,
  };
}

export function constrainContinuousPosition(team, point) {
  if (!CONTINUOUS_TEAMS.includes(team) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    throw new TypeError("連續 Rally 站位需要合法隊伍與世界座標。");
  }
  const y = clamp(point.y, SPIKE_COURT_V1.bounds.minY + margin,
    SPIKE_COURT_V1.bounds.maxY - margin);
  const sides = sideBoundsAtY(y);
  const minimumX = team === "HOME" ? sides.left + margin : SPIKE_COURT_V1.netX + margin;
  const maximumX = team === "HOME" ? SPIKE_COURT_V1.netX - margin : sides.right - margin;
  return Object.freeze({ x: clamp(point.x, minimumX, maximumX), y });
}

function createDefaultFormation() {
  const teams = Object.fromEntries(CONTINUOUS_TEAMS.map((team) => [team,
    TEAM_RECEIVE_FORMATION.map((entry) => {
      const source = team === "AWAY" ? entry : { x: SPIKE_COURT_V1.world.width - entry.x, y: entry.y };
      const point = constrainContinuousPosition(team, source);
      return Object.freeze({ playerId: `${team}-${entry.position}`, position: entry.position, ...point });
    })]));
  return Object.freeze({ version: CONTINUOUS_FORMATION_VERSION,
    teams: Object.freeze(Object.fromEntries(CONTINUOUS_TEAMS.map((team) =>
      [team, Object.freeze(teams[team])]))), });
}

export const DEFAULT_CONTINUOUS_FORMATION = createDefaultFormation();

export function validateContinuousFormation(input) {
  if (input?.version !== CONTINUOUS_FORMATION_VERSION || !input.teams) {
    throw new TypeError("連續 Rally 站位版本不相容。");
  }
  const teams = {};
  for (const team of CONTINUOUS_TEAMS) {
    const entries = input.teams[team];
    if (!Array.isArray(entries) || entries.length !== 6) throw new RangeError(`${team} 必須有六名球員站位。`);
    const expected = new Set(TEAM_RECEIVE_FORMATION.map((entry) => `${team}-${entry.position}`));
    teams[team] = entries.map((entry) => {
      if (!expected.delete(entry?.playerId) || entry.position !== entry.playerId.slice(team.length + 1)) {
        throw new RangeError(`${team} 球員 ID 或職位不合法。`);
      }
      const point = constrainContinuousPosition(team, entry);
      if (Math.abs(point.x - entry.x) > 1e-7 || Math.abs(point.y - entry.y) > 1e-7) {
        throw new RangeError(`${entry.playerId} 必須位於所屬合法半場內。`);
      }
      return Object.freeze({ playerId: entry.playerId, position: entry.position, ...point });
    });
    if (expected.size) throw new RangeError(`${team} 缺少必要球員站位。`);
    teams[team] = Object.freeze(teams[team]);
  }
  return Object.freeze({ version: CONTINUOUS_FORMATION_VERSION, teams: Object.freeze(teams) });
}

export function updateContinuousFormationPosition(formation, playerId, point) {
  const team = CONTINUOUS_TEAMS.find((value) => playerId.startsWith(`${value}-`));
  if (!team) throw new RangeError("找不到站位球員。");
  const constrained = constrainContinuousPosition(team, point);
  const next = { version: CONTINUOUS_FORMATION_VERSION, teams: {} };
  for (const currentTeam of CONTINUOUS_TEAMS) next.teams[currentTeam] = formation.teams[currentTeam].map((entry) =>
    entry.playerId === playerId ? { ...entry, ...constrained } : { ...entry });
  return validateContinuousFormation(next);
}

export function loadContinuousFormation(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const raw = target?.getItem(CONTINUOUS_FORMATION_STORAGE_KEY);
    return raw ? validateContinuousFormation(JSON.parse(raw)) : DEFAULT_CONTINUOUS_FORMATION;
  } catch {
    return DEFAULT_CONTINUOUS_FORMATION;
  }
}

export function saveContinuousFormation(formation, storage) {
  const valid = validateContinuousFormation(formation);
  const target = storage ?? globalThis.localStorage;
  target?.setItem(CONTINUOUS_FORMATION_STORAGE_KEY, JSON.stringify(valid));
  return valid;
}

export function getAppearancePlayerIds(position) {
  return Object.freeze([`SIM-P${TEAM_RECEIVE_FORMATION.findIndex((entry) => entry.position === position) + 1}`,
    `HOME-${position}`, `AWAY-${position}`]);
}
