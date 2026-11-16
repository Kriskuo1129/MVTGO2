import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { SPIKE_COURT_V1 } from "../src/simulator/spike-court.js";
import { CONTINUOUS_FORMATION_LIBRARY_STORAGE_KEY, CONTINUOUS_FORMATION_LIBRARY_VERSION,
  CONTINUOUS_FORMATION_ROTATIONS, CONTINUOUS_FORMATION_STORAGE_KEY,
  DEFAULT_CONTINUOUS_FORMATION, DEFAULT_CONTINUOUS_FORMATION_LIBRARY,
  exportContinuousFormationLibrary, getContinuousRotationFormation,
  getAppearancePlayerIds, LEGACY_CONTINUOUS_FORMATION_STORAGE_KEY,
  importContinuousFormationLibrary, loadContinuousFormation, loadContinuousFormationLibrary,
  resetContinuousFormationLibraryMode, resetContinuousFormationMode,
  resolveContinuousFormationProfile, resolveContinuousRallyFormation,
  saveContinuousFormation, saveContinuousFormationLibrary,
  updateContinuousFormationLibraryPosition, updateContinuousFormationPosition,
  V2_CONTINUOUS_FORMATION_STORAGE_KEY, validateContinuousFormation,
  validateContinuousFormationLibrary } from "../src/simulator/continuous-rally-formation.js";

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
    { position: "S", x: 1466.6666666666667, y: 325 },
    { position: "OH1", x: 1205, y: 325 },
    { position: "MB1", x: 1205, y: 491.25 },
    { position: "OP", x: 1205, y: 657.9166666666667 },
    { position: "OH2", x: 1613.3333333333335, y: 444.58333333333337 },
    { position: "MB2", x: 1500, y: 664.5833333333334 },
  ],
};
assert.deepEqual(DEFAULT_CONTINUOUS_FORMATION.profiles, officialProfiles,
  "新環境的 18 組 R1 預設必須與使用者備份完全一致。");
assert.equal(DEFAULT_CONTINUOUS_FORMATION_LIBRARY.version, CONTINUOUS_FORMATION_LIBRARY_VERSION);
assert.deepEqual(Object.keys(DEFAULT_CONTINUOUS_FORMATION_LIBRARY.rotations),
  CONTINUOUS_FORMATION_ROTATIONS);
for (const rotation of CONTINUOUS_FORMATION_ROTATIONS) {
  assert.equal(Object.values(DEFAULT_CONTINUOUS_FORMATION_LIBRARY.rotations[rotation].profiles).length, 3);
  assert.equal(Object.values(DEFAULT_CONTINUOUS_FORMATION_LIBRARY.rotations[rotation].profiles)
    .reduce((count, entries) => count + entries.length, 0), 18);
}
assert.deepEqual(DEFAULT_CONTINUOUS_FORMATION_LIBRARY.rotations.R1.profiles, officialProfiles,
  "V4 的 R1 必須保留已定案座標。 ");
assert.equal(createHash("sha256").update(JSON.stringify(DEFAULT_CONTINUOUS_FORMATION_LIBRARY)).digest("hex"),
  "ec5ef0fd3d09077142f061efc47d7e90bb90bfe20e4f71371a43701ea33c9a08",
  "V4 正式預設的 108 筆座標必須與使用者 JSON 原始精度完全一致。 ");
assert.notStrictEqual(DEFAULT_CONTINUOUS_FORMATION_LIBRARY.rotations.R1.profiles.SERVE,
  DEFAULT_CONTINUOUS_FORMATION_LIBRARY.rotations.R2.profiles.SERVE,
  "R2～R6 必須是可獨立編輯的資料副本。 ");
validateContinuousFormationLibrary(DEFAULT_CONTINUOUS_FORMATION_LIBRARY);
const freshLibraryStorage = new Map();
const freshLibraryStorageApi = { getItem: (key) => freshLibraryStorage.get(key) ?? null,
  setItem: (key, value) => freshLibraryStorage.set(key, value) };
assert.deepEqual(loadContinuousFormationLibrary(freshLibraryStorageApi),
  DEFAULT_CONTINUOUS_FORMATION_LIBRARY, "全新環境必須載入正式六輪預設。 ");
assert.ok(freshLibraryStorage.has(CONTINUOUS_FORMATION_LIBRARY_STORAGE_KEY));
for (const rotation of CONTINUOUS_FORMATION_ROTATIONS) {
  const formation = getContinuousRotationFormation(DEFAULT_CONTINUOUS_FORMATION_LIBRARY, rotation);
  for (const mode of ["SERVE", "RECEIVE", "DEFENSE"]) {
    const profiles = resolveContinuousFormationProfile(formation, mode);
    for (const away of profiles.AWAY) {
      const home = profiles.HOME.find((entry) => entry.position === away.position);
      assert.equal(home.x + away.x, SPIKE_COURT_V1.bounds.minX + SPIKE_COURT_V1.bounds.maxX);
      assert.equal(home.y + away.y, SPIKE_COURT_V1.bounds.minY + SPIKE_COURT_V1.bounds.maxY);
    }
  }
}

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

const libraryStorage = new Map([[CONTINUOUS_FORMATION_STORAGE_KEY,
  JSON.stringify(defenseChanged)]]);
const libraryStorageApi = { getItem: (key) => libraryStorage.get(key) ?? null,
  setItem: (key, value) => libraryStorage.set(key, value) };
const migratedLibrary = loadContinuousFormationLibrary(libraryStorageApi);
assert.deepEqual(getContinuousRotationFormation(migratedLibrary, "R1"), defenseChanged,
  "V3 migration 必須完整保留使用者 R1。 ");
for (const rotation of CONTINUOUS_FORMATION_ROTATIONS.slice(1)) {
  assert.deepEqual(getContinuousRotationFormation(migratedLibrary, rotation), defenseChanged,
    `${rotation} 必須以獨立副本複製 R1 作為編輯起點。`);
}
assert.ok(libraryStorage.has(CONTINUOUS_FORMATION_STORAGE_KEY), "V3 原資料必須保留。 ");
assert.ok(libraryStorage.has(CONTINUOUS_FORMATION_LIBRARY_STORAGE_KEY));

for (const corruptedV4 of ["{broken json", JSON.stringify({
  version: CONTINUOUS_FORMATION_LIBRARY_VERSION, rotations: { R1: migratedLibrary.rotations.R1 },
})]) {
  const corruptStorage = new Map([
    [CONTINUOUS_FORMATION_LIBRARY_STORAGE_KEY, corruptedV4],
    [CONTINUOUS_FORMATION_STORAGE_KEY, JSON.stringify(defenseChanged)],
  ]);
  let writes = 0;
  const corruptStorageApi = { getItem: (key) => corruptStorage.get(key) ?? null,
    setItem: () => { writes += 1; } };
  assert.throws(() => loadContinuousFormationLibrary(corruptStorageApi),
    /V4 站位損壞.*原始資料已保留/);
  assert.equal(corruptStorage.get(CONTINUOUS_FORMATION_LIBRARY_STORAGE_KEY), corruptedV4,
    "損壞的 V4 原文必須保留供備份恢復。 ");
  assert.equal(writes, 0, "V4 存在但損壞時不得以 V3 migration 覆寫。 ");
}

const r2Changed = updateContinuousFormationLibraryPosition(migratedLibrary,
  "R2", "SERVE", "OH1", { x: 1500, y: 500 });
assert.equal(r2Changed.rotations.R2.profiles.SERVE.find((entry) => entry.position === "OH1").x, 1500);
assert.deepEqual(r2Changed.rotations.R1.profiles, migratedLibrary.rotations.R1.profiles,
  "修改 R2 不得覆寫 R1。 ");
assert.deepEqual(r2Changed.rotations.R3.profiles, migratedLibrary.rotations.R3.profiles,
  "修改 R2 不得覆寫其他輪次。 ");
const r3Changed = updateContinuousFormationLibraryPosition(r2Changed,
  "R3", "DEFENSE", "MB2", { x: 1600, y: 650 });
const resetR3 = resetContinuousFormationLibraryMode(r3Changed, "R3", "DEFENSE");
assert.deepEqual(resetR3.rotations.R3.profiles.DEFENSE,
  DEFAULT_CONTINUOUS_FORMATION_LIBRARY.rotations.R3.profiles.DEFENSE);
assert.deepEqual(resetR3.rotations.R2.profiles, r3Changed.rotations.R2.profiles);

saveContinuousFormationLibrary(r3Changed, libraryStorageApi);
assert.deepEqual(loadContinuousFormationLibrary(libraryStorageApi), r3Changed,
  "重新載入後六輪資料必須完整保留。 ");
const exported = exportContinuousFormationLibrary(r3Changed);
assert.deepEqual(importContinuousFormationLibrary(exported), r3Changed,
  "六輪 JSON 匯出／匯入必須可無損往返。 ");
assert.throws(() => importContinuousFormationLibrary("not json"), SyntaxError);
assert.throws(() => importContinuousFormationLibrary(JSON.stringify({
  version: CONTINUOUS_FORMATION_LIBRARY_VERSION, rotations: { R1: r3Changed.rotations.R1 },
})), /缺少站位資料/);
assert.throws(() => importContinuousFormationLibrary(JSON.stringify({ ...r3Changed,
  rotations: { ...r3Changed.rotations, R4: { profiles: { ...r3Changed.rotations.R4.profiles,
    SERVE: r3Changed.rotations.R4.profiles.SERVE.map((entry) => entry.position === "S"
      ? { ...entry, x: 100 } : entry) } } } })), /合法範圍/);

const editorHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
for (const id of ["continuous-formation-rotation", "continuous-formation-mode",
  "continuous-formation-export", "continuous-formation-import",
  "continuous-formation-import-input"]) {
  assert.equal((editorHtml.match(new RegExp(`id=["']${id}["']`, "g")) ?? []).length, 1,
    `Editor 必須且只能提供一個 #${id}。`);
}

console.log("PASS: R1～R6 independent profiles; V1/V2/V3 migration; JSON round-trip and rejection; legal bounds; HOME/AWAY transform; R1 simulator compatibility.");
