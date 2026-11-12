import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { CONTINUOUS_FORMATION_STORAGE_KEY, DEFAULT_CONTINUOUS_FORMATION,
  getAppearancePlayerIds, loadContinuousFormation, saveContinuousFormation,
  updateContinuousFormationPosition, validateContinuousFormation } from "../src/simulator/continuous-rally-formation.js";

assert.equal(DEFAULT_CONTINUOUS_FORMATION.teams.HOME.length, 6);
assert.equal(DEFAULT_CONTINUOUS_FORMATION.teams.AWAY.length, 6);
assert.equal(new Set([...DEFAULT_CONTINUOUS_FORMATION.teams.HOME,
  ...DEFAULT_CONTINUOUS_FORMATION.teams.AWAY].map((entry) => entry.playerId)).size, 12);
validateContinuousFormation(DEFAULT_CONTINUOUS_FORMATION);

const homeChanged = updateContinuousFormationPosition(DEFAULT_CONTINUOUS_FORMATION,
  "HOME-OH1", { x: 820, y: 610 });
const changed = updateContinuousFormationPosition(homeChanged,
  "AWAY-OH1", { x: 1460, y: 620 });
assert.deepEqual(changed.teams.HOME.find((entry) => entry.playerId === "HOME-OH1"),
  { playerId: "HOME-OH1", position: "OH1", x: 820, y: 610 });
assert.deepEqual(changed.teams.AWAY.find((entry) => entry.playerId === "AWAY-OH1"),
  { playerId: "AWAY-OH1", position: "OH1", x: 1460, y: 620 });
assert.notEqual(changed.teams.HOME.find((entry) => entry.playerId === "HOME-OH1").x,
  changed.teams.AWAY.find((entry) => entry.playerId === "AWAY-OH1").x);

const clampedHome = updateContinuousFormationPosition(changed, "HOME-S", { x: 2000, y: -20 });
const homeS = clampedHome.teams.HOME.find((entry) => entry.playerId === "HOME-S");
assert.ok(homeS.x < 1140 && homeS.y >= 325);
const clampedAway = updateContinuousFormationPosition(changed, "AWAY-S", { x: 100, y: 1000 });
const awayS = clampedAway.teams.AWAY.find((entry) => entry.playerId === "AWAY-S");
assert.ok(awayS.x > 1140 && awayS.y <= 725);

const storage = new Map();
const storageApi = { getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value) };
saveContinuousFormation(changed, storageApi);
assert.ok(storage.has(CONTINUOUS_FORMATION_STORAGE_KEY));
assert.deepEqual(loadContinuousFormation(storageApi), changed);
storage.set(CONTINUOUS_FORMATION_STORAGE_KEY, JSON.stringify({ version: "OLD" }));
assert.deepEqual(loadContinuousFormation(storageApi), DEFAULT_CONTINUOUS_FORMATION);

const simulator = new ContinuousRallySimulator({ initialFormation: changed });
let snapshot = simulator.getSnapshot();
assert.equal(snapshot.players.find((entry) => entry.id === "HOME-OH1").x, 820);
assert.equal(snapshot.players.find((entry) => entry.id === "AWAY-OH1").x, 1460);
simulator.reset();
snapshot = simulator.getSnapshot();
assert.equal(snapshot.players.find((entry) => entry.id === "HOME-OH1").x, 820);
assert.deepEqual(getAppearancePlayerIds("OH1"), ["SIM-P2", "HOME-OH1", "AWAY-OH1"]);

console.log("PASS: versioned 12-player world formation; legal half-court clamping; HOME/AWAY isolation; storage reload/fallback; simulator integration; shared appearance aliases.");
