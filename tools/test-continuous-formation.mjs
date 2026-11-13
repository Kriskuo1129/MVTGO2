import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { SPIKE_COURT_V1 } from "../src/simulator/spike-court.js";
import { CONTINUOUS_FORMATION_STORAGE_KEY, DEFAULT_CONTINUOUS_FORMATION,
  getAppearancePlayerIds, LEGACY_CONTINUOUS_FORMATION_STORAGE_KEY,
  loadContinuousFormation, resetContinuousFormationMode, resolveContinuousFormationProfile,
  resolveContinuousRallyFormation, saveContinuousFormation, updateContinuousFormationPosition,
  V2_CONTINUOUS_FORMATION_STORAGE_KEY, validateContinuousFormation } from "../src/simulator/continuous-rally-formation.js";

assert.equal(DEFAULT_CONTINUOUS_FORMATION.profiles.SERVE.length, 6);
assert.equal(DEFAULT_CONTINUOUS_FORMATION.profiles.RECEIVE.length, 6);
assert.equal(DEFAULT_CONTINUOUS_FORMATION.profiles.DEFENSE.length, 6);
validateContinuousFormation(DEFAULT_CONTINUOUS_FORMATION);
const mirrorY = (y) => SPIKE_COURT_V1.bounds.minY + SPIKE_COURT_V1.bounds.maxY - y;
const officialProfiles = {
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
assert.deepEqual(DEFAULT_CONTINUOUS_FORMATION.profiles, officialProfiles,
  "新環境的 18 組 R1 預設必須與使用者備份完全一致。");

const serveChanged = updateContinuousFormationPosition(DEFAULT_CONTINUOUS_FORMATION,
  "SERVE", "OH1", { x: 1460, y: 610 });
const changed = updateContinuousFormationPosition(serveChanged,
  "RECEIVE", "OH1", { x: 1510, y: 620 });
const defenseChanged = updateContinuousFormationPosition(changed,
  "DEFENSE", "OH1", { x: 1450, y: 600 });
assert.deepEqual(changed.profiles.SERVE.find((entry) => entry.position === "OH1"),
  { position: "OH1", x: 1460, y: 610 });
assert.deepEqual(changed.profiles.RECEIVE.find((entry) => entry.position === "OH1"),
  { position: "OH1", x: 1510, y: 620 });
assert.deepEqual(defenseChanged.profiles.DEFENSE.find((entry) => entry.position === "OH1"),
  { position: "OH1", x: 1450, y: 600 });
assert.deepEqual(resetContinuousFormationMode(defenseChanged, "DEFENSE").profiles.DEFENSE,
  DEFAULT_CONTINUOUS_FORMATION.profiles.DEFENSE);
assert.throws(() => validateContinuousFormation({ ...changed,
  profiles: { ...changed.profiles, SERVE: changed.profiles.SERVE.map((entry) => entry.position === "S"
    ? { ...entry, x: 100 } : entry) } }), /合法範圍/);

const storage = new Map();
const storageApi = { getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value) };
saveContinuousFormation(defenseChanged, storageApi);
assert.ok(storage.has(CONTINUOUS_FORMATION_STORAGE_KEY));
assert.deepEqual(loadContinuousFormation(storageApi), defenseChanged);
storage.delete(CONTINUOUS_FORMATION_STORAGE_KEY);
const v2 = { version: "CONTINUOUS_FORMATION_V2",
  profiles: { SERVE: changed.profiles.SERVE, RECEIVE: changed.profiles.RECEIVE } };
storage.set(V2_CONTINUOUS_FORMATION_STORAGE_KEY, JSON.stringify(v2));
const migratedV2 = loadContinuousFormation(storageApi);
assert.deepEqual(migratedV2.profiles.SERVE, changed.profiles.SERVE);
assert.deepEqual(migratedV2.profiles.RECEIVE, changed.profiles.RECEIVE);
assert.deepEqual(migratedV2.profiles.DEFENSE, DEFAULT_CONTINUOUS_FORMATION.profiles.DEFENSE);
assert.ok(storage.has(V2_CONTINUOUS_FORMATION_STORAGE_KEY), "V2 原資料不得刪除。 ");
storage.delete(CONTINUOUS_FORMATION_STORAGE_KEY);
storage.delete(V2_CONTINUOUS_FORMATION_STORAGE_KEY);
const legacy = { version: "CONTINUOUS_FORMATION_V1", teams: {
  HOME: DEFAULT_CONTINUOUS_FORMATION.profiles.RECEIVE.map((entry) => ({ playerId: `HOME-${entry.position}`,
    position: entry.position, x: 2280 - entry.x, y: entry.y })),
  AWAY: DEFAULT_CONTINUOUS_FORMATION.profiles.RECEIVE.map((entry) => ({ playerId: `AWAY-${entry.position}`,
    position: entry.position, x: entry.position === "OH1" ? 1490 : entry.x, y: entry.y })),
} };
storage.set(LEGACY_CONTINUOUS_FORMATION_STORAGE_KEY, JSON.stringify(legacy));
const migrated = loadContinuousFormation(storageApi);
assert.equal(migrated.profiles.SERVE.find((entry) => entry.position === "OH1").x, 1490);
assert.deepEqual(migrated.profiles.SERVE, migrated.profiles.RECEIVE);
assert.deepEqual(migrated.profiles.DEFENSE, DEFAULT_CONTINUOUS_FORMATION.profiles.DEFENSE);
assert.ok(storage.has(LEGACY_CONTINUOUS_FORMATION_STORAGE_KEY), "V1 原資料不得刪除。 ");

const homeServe = resolveContinuousRallyFormation(changed, "HOME");
assert.equal(homeServe.teams.HOME.find((entry) => entry.position === "OH1").x, 2280 - 1460);
assert.equal(homeServe.teams.HOME.find((entry) => entry.position === "OH1").y, mirrorY(610));
assert.equal(homeServe.teams.AWAY.find((entry) => entry.position === "OH1").x, 1510);
assert.equal(homeServe.teams.AWAY.find((entry) => entry.position === "OH1").y, 620);
const awayServe = resolveContinuousRallyFormation(changed, "AWAY");
assert.equal(awayServe.teams.AWAY.find((entry) => entry.position === "OH1").x, 1460);
assert.equal(awayServe.teams.HOME.find((entry) => entry.position === "OH1").x, 2280 - 1510);
assert.equal(awayServe.teams.HOME.find((entry) => entry.position === "OH1").y, mirrorY(620));
const defenseProfiles = resolveContinuousFormationProfile(defenseChanged, "DEFENSE");
assert.equal(defenseProfiles.AWAY.find((entry) => entry.position === "OH1").x, 1450);
assert.equal(defenseProfiles.AWAY.find((entry) => entry.position === "OH1").y, 600);
assert.equal(defenseProfiles.HOME.find((entry) => entry.position === "OH1").x, 2280 - 1450);
assert.equal(defenseProfiles.HOME.find((entry) => entry.position === "OH1").y, mirrorY(600));

const simulator = new ContinuousRallySimulator({ initialFormation: changed, servingTeam: "HOME" });
let snapshot = simulator.getSnapshot();
assert.equal(snapshot.players.find((entry) => entry.id === "HOME-OH1").x, 2280 - 1460);
assert.equal(snapshot.players.find((entry) => entry.id === "HOME-OH1").y, mirrorY(610));
assert.equal(snapshot.players.find((entry) => entry.id === "AWAY-OH1").x, 1510);
simulator.configureServe({ servingTeam: "AWAY" });
snapshot = simulator.getSnapshot();
assert.equal(snapshot.players.find((entry) => entry.id === "HOME-OH1").x, 2280 - 1510);
assert.equal(snapshot.players.find((entry) => entry.id === "HOME-OH1").y, mirrorY(620));
assert.equal(snapshot.players.find((entry) => entry.id === "AWAY-OH1").x, 1460);
assert.deepEqual(getAppearancePlayerIds("OH1"), ["SIM-P2", "HOME-OH1", "AWAY-OH1"]);

console.log("PASS: independent SERVE/RECEIVE/DEFENSE R1 profiles; V1/V2 migration; legal canonical court bounds; HOME/AWAY 180-degree transform; simulator initialization; storage reload.");
