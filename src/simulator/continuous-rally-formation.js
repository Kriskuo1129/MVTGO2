import { SPIKE_COURT_V1 } from "./spike-court.js";
import { TEAM_RECEIVE_FORMATION, TEAM_SIMULATOR_AVATAR_SIZE } from "./team-simulator.js";

export const CONTINUOUS_FORMATION_VERSION = "CONTINUOUS_FORMATION_V3";
export const CONTINUOUS_FORMATION_STORAGE_KEY = "mvtgo2.continuousFormation.v3";
export const V2_CONTINUOUS_FORMATION_STORAGE_KEY = "mvtgo2.continuousFormation.v2";
export const V2_CONTINUOUS_FORMATION_VERSION = "CONTINUOUS_FORMATION_V2";
export const LEGACY_CONTINUOUS_FORMATION_STORAGE_KEY = "mvtgo2.continuousFormation.v1";
export const LEGACY_CONTINUOUS_FORMATION_VERSION = "CONTINUOUS_FORMATION_V1";
export const CONTINUOUS_TEAMS = Object.freeze(["HOME", "AWAY"]);
export const CONTINUOUS_FORMATION_MODES = Object.freeze({
  SERVE: "SERVE", RECEIVE: "RECEIVE", DEFENSE: "DEFENSE",
});

const modes = Object.freeze(Object.values(CONTINUOUS_FORMATION_MODES));
const jobs = Object.freeze(TEAM_RECEIVE_FORMATION.map((entry) => entry.position));

const margin = TEAM_SIMULATOR_AVATAR_SIZE / 2;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const mirrorFormationPoint = (entry) => Object.freeze({
  x: SPIKE_COURT_V1.bounds.minX + SPIKE_COURT_V1.bounds.maxX - entry.x,
  y: SPIKE_COURT_V1.bounds.minY + SPIKE_COURT_V1.bounds.maxY - entry.y,
});

function sideBoundsAtY(y) {
  const progress = (y - SPIKE_COURT_V1.bounds.minY)
    / (SPIKE_COURT_V1.bounds.maxY - SPIKE_COURT_V1.bounds.minY);
  return {
    left: 625 + (510 - 625) * progress,
    right: 1655 + (1770 - 1655) * progress,
  };
}

export function constrainContinuousPosition(point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    throw new TypeError("R1 初始站位需要有限世界座標。");
  }
  const y = clamp(point.y, SPIKE_COURT_V1.bounds.minY + margin,
    SPIKE_COURT_V1.bounds.maxY - margin);
  const sides = sideBoundsAtY(y);
  return Object.freeze({ x: clamp(point.x, SPIKE_COURT_V1.netX + margin, sides.right - margin), y });
}

function createDefaultFormation() {
  const profiles = {
    SERVE: [
      { position: "S", x: 1612.2303244152909, y: 362.45279947916663 },
      { position: "OH1", x: 1205, y: 325 },
      { position: "MB1", x: 1205, y: 485.65592447916663 },
      { position: "OP", x: 1213.2291666666665, y: 663.2861328124999 },
      { position: "OH2", x: 1668.9166451700078, y: 623.7027994791666 },
      { position: "MB2", x: 1525.9375, y: 556.4111328125 },
    ],
    RECEIVE: [
      { position: "S", x: 1604.1037735849056, y: 325 },
      { position: "OH1", x: 1395.3125, y: 350.57779947916663 },
      { position: "MB1", x: 1205, y: 516.8277994791666 },
      { position: "OP", x: 1343.8541666666665, y: 725 },
      { position: "OH2", x: 1569.4791666666665, y: 675.1611328124999 },
      { position: "MB2", x: 1545.7291666666665, y: 465.36946614583326 },
    ],
    DEFENSE: [
      { position: "S", x: 1604.1037735849056, y: 325 },
      { position: "OH1", x: 1320, y: 690 },
      { position: "MB1", x: 1320, y: 450 },
      { position: "OP", x: 1320, y: 325 },
      { position: "OH2", x: 1631.2264150943397, y: 450 },
      { position: "MB2", x: 1683.301886792453, y: 690 },
    ],
  };
  return Object.freeze({ version: CONTINUOUS_FORMATION_VERSION,
    profiles: Object.freeze(Object.fromEntries(Object.entries(profiles).map(([mode, entries]) =>
      [mode, Object.freeze(entries.map((entry) => Object.freeze(entry)))]))) });
}

export const DEFAULT_CONTINUOUS_FORMATION = createDefaultFormation();

export function validateContinuousFormation(input) {
  if (input?.version !== CONTINUOUS_FORMATION_VERSION || !input.profiles) {
    throw new TypeError("R1 初始站位版本不相容。");
  }
  const profiles = {};
  for (const mode of modes) {
    const entries = input.profiles[mode];
    if (!Array.isArray(entries) || entries.length !== 6) throw new RangeError(`${mode} 必須有六個 Job 站位。`);
    const expected = new Set(jobs);
    profiles[mode] = entries.map((entry) => {
      if (!expected.delete(entry?.position)) throw new RangeError(`${mode} Job 重複或不合法。`);
      const point = constrainContinuousPosition(entry);
      if (Math.abs(point.x - entry.x) > 1e-7 || Math.abs(point.y - entry.y) > 1e-7) {
        throw new RangeError(`${mode}/${entry.position} 必須位於標準右半場合法範圍。`);
      }
      return Object.freeze({ position: entry.position, ...point });
    });
    if (expected.size) throw new RangeError(`${mode} 缺少必要 Job。`);
    profiles[mode] = Object.freeze(profiles[mode]);
  }
  return Object.freeze({ version: CONTINUOUS_FORMATION_VERSION, profiles: Object.freeze(profiles) });
}

export function migrateLegacyContinuousFormation(input) {
  if (input?.version !== LEGACY_CONTINUOUS_FORMATION_VERSION || !Array.isArray(input.teams?.AWAY)) {
    throw new TypeError("不是可遷移的 V1 站位資料。");
  }
  const canonical = input.teams.AWAY.map((entry) => ({ position: entry.position, x: entry.x, y: entry.y }));
  return validateContinuousFormation({ version: CONTINUOUS_FORMATION_VERSION,
    profiles: { SERVE: canonical, RECEIVE: canonical,
      DEFENSE: DEFAULT_CONTINUOUS_FORMATION.profiles.DEFENSE } });
}

export function migrateV2ContinuousFormation(input) {
  if (input?.version !== V2_CONTINUOUS_FORMATION_VERSION
    || !Array.isArray(input.profiles?.SERVE) || !Array.isArray(input.profiles?.RECEIVE)) {
    throw new TypeError("不是可遷移的 V2 站位資料。");
  }
  return validateContinuousFormation({ version: CONTINUOUS_FORMATION_VERSION,
    profiles: { SERVE: input.profiles.SERVE, RECEIVE: input.profiles.RECEIVE,
      DEFENSE: DEFAULT_CONTINUOUS_FORMATION.profiles.DEFENSE } });
}

export function updateContinuousFormationPosition(formation, mode, position, point) {
  const valid = validateContinuousFormation(formation);
  if (!modes.includes(mode) || !jobs.includes(position)) throw new RangeError("找不到 R1 站位模式或 Job。");
  const constrained = constrainContinuousPosition(point);
  return validateContinuousFormation({ version: CONTINUOUS_FORMATION_VERSION,
    profiles: Object.fromEntries(modes.map((currentMode) => [currentMode,
      valid.profiles[currentMode].map((entry) => currentMode === mode && entry.position === position
        ? { ...entry, ...constrained } : { ...entry })])) });
}

export function resetContinuousFormationMode(formation, mode) {
  const valid = validateContinuousFormation(formation);
  if (!modes.includes(mode)) throw new RangeError("未知的 R1 站位模式。");
  return validateContinuousFormation({ version: CONTINUOUS_FORMATION_VERSION,
    profiles: { ...valid.profiles, [mode]: DEFAULT_CONTINUOUS_FORMATION.profiles[mode] } });
}

export function resolveContinuousRallyFormation(formation, servingTeam) {
  const valid = validateContinuousFormation(formation);
  if (!CONTINUOUS_TEAMS.includes(servingTeam)) throw new RangeError("發球方必須為 HOME 或 AWAY。");
  const teams = {};
  for (const team of CONTINUOUS_TEAMS) {
    const mode = team === servingTeam ? CONTINUOUS_FORMATION_MODES.SERVE : CONTINUOUS_FORMATION_MODES.RECEIVE;
    teams[team] = Object.freeze(valid.profiles[mode].map((entry) => {
      const point = team === "AWAY" ? entry : mirrorFormationPoint(entry);
      return Object.freeze({ playerId: `${team}-${entry.position}`, position: entry.position,
        x: point.x, y: point.y });
    }));
  }
  return Object.freeze({ version: CONTINUOUS_FORMATION_VERSION, servingTeam,
    teams: Object.freeze(teams) });
}

export function resolveContinuousFormationProfile(formation, mode) {
  const valid = validateContinuousFormation(formation);
  if (!modes.includes(mode)) throw new RangeError("未知的 R1 站位模式。");
  return Object.freeze(Object.fromEntries(CONTINUOUS_TEAMS.map((team) => [team,
    Object.freeze(valid.profiles[mode].map((entry) => {
      const point = team === "AWAY" ? entry : mirrorFormationPoint(entry);
      return Object.freeze({ playerId: `${team}-${entry.position}`, position: entry.position,
        x: point.x, y: point.y });
    }))])));
}

export function loadContinuousFormation(storage) {
  const target = storage ?? globalThis.localStorage;
  try {
    const raw = target?.getItem(CONTINUOUS_FORMATION_STORAGE_KEY);
    if (raw) return validateContinuousFormation(JSON.parse(raw));
  } catch { /* 繼續嘗試 V1。 */ }
  try {
    const v2Raw = target?.getItem(V2_CONTINUOUS_FORMATION_STORAGE_KEY);
    if (v2Raw) {
      const migrated = migrateV2ContinuousFormation(JSON.parse(v2Raw));
      target?.setItem(CONTINUOUS_FORMATION_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch { /* V2 原資料保留於舊 key，繼續嘗試 V1。 */ }
  try {
    const legacyRaw = target?.getItem(LEGACY_CONTINUOUS_FORMATION_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = migrateLegacyContinuousFormation(JSON.parse(legacyRaw));
      target?.setItem(CONTINUOUS_FORMATION_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch { /* 舊資料保留於舊 key，安全退回預設。 */ }
  return DEFAULT_CONTINUOUS_FORMATION;
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
