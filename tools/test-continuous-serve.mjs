import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { getServeSpeedWeights, getServePosition, normalizeServeType,
  SIMULATOR_SERVE_TYPES } from "../src/simulator/serve-system.js";
import { SPIKE_COURT_V1 } from "../src/simulator/spike-court.js";

for (const ability of [1, 44, 45, 79, 80, 99]) for (const serveType of Object.values(SIMULATOR_SERVE_TYPES)) {
  const weights = getServeSpeedWeights(ability, serveType);
  assert.ok(Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 100) < 1e-8);
  assert.equal(ability < 45 ? weights.FAST : weights.FAST > 0, ability < 45 ? 0 : true);
  assert.equal(serveType === SIMULATOR_SERVE_TYPES.STANDING || ability < 80
    ? weights.ULTRA_FAST : weights.ULTRA_FAST > 0,
  serveType === SIMULATOR_SERVE_TYPES.STANDING || ability < 80 ? 0 : true);
}
assert.equal(getServeSpeedWeights(99, SIMULATOR_SERVE_TYPES.STANDING).ULTRA_FAST, 0);
assert.ok(Math.abs(getServeSpeedWeights(80, SIMULATOR_SERVE_TYPES.JUMP).ULTRA_FAST - 1) < 0.5);
assert.ok(Math.abs(getServeSpeedWeights(99, SIMULATOR_SERVE_TYPES.JUMP).ULTRA_FAST - 30) < 5);
assert.equal(normalizeServeType("一般"), "STANDING");
assert.equal(normalizeServeType("跳飄"), "JUMP");
assert.equal(normalizeServeType("跳發"), "JUMP");

function start(team, seed = 7, serveType = SIMULATOR_SERVE_TYPES.JUMP) {
  const simulator = new ContinuousRallySimulator({ seed, servingTeam: team });
  simulator.configureServe({ servingTeam: team, ability: 80, serveType });
  simulator.launch();
  const prepared = simulator.getSnapshot();
  assert.equal(prepared.rallyPhase, "SERVE_PREPARE");
  assert.equal(prepared.ballFlightId, 0);
  const server = prepared.players.find((player) => player.id === prepared.serverPlayerId);
  assert.equal(server.job, "S");
  assert.equal(server.action, "SERVE_PREPARE");
  assert.equal(team === "HOME" ? server.x < SPIKE_COURT_V1.bounds.minX : server.x > SPIKE_COURT_V1.bounds.maxX, true);
  let maximumTossHeight = 0;
  for (let i = 0; i < 240 && !simulator.events.some((event) => event.type === "SERVE_CONTACT"); i += 1) {
    const snapshot = simulator.updateFrame(1 / 120);
    maximumTossHeight = Math.max(maximumTossHeight, snapshot.ball.height);
  }
  const contacted = simulator.getSnapshot();
  assert.ok(contacted.events.some((event) => event.type === "SERVE_CONTACT"));
  assert.equal(contacted.ballFlightId, 1);
  assert.equal(team === "HOME"
    ? contacted.serveResolution.target.x > SPIKE_COURT_V1.netX
    : contacted.serveResolution.target.x < SPIKE_COURT_V1.netX, true);
  return { simulator, maximumTossHeight, contactAction: contacted.players
    .find((player) => player.id === contacted.serverPlayerId).action,
    contactHeight: contacted.events.find((event) => event.type === "SERVE_CONTACT").contactHeight };
}

for (const team of ["HOME", "AWAY"]) for (const type of Object.values(SIMULATOR_SERVE_TYPES)) start(team, 7, type);
const standingContact = start("HOME", 7, SIMULATOR_SERVE_TYPES.STANDING);
const jumpContact = start("HOME", 7, SIMULATOR_SERVE_TYPES.JUMP);
assert.ok(jumpContact.maximumTossHeight > standingContact.maximumTossHeight);
assert.ok(jumpContact.contactHeight > standingContact.contactHeight);
assert.equal(standingContact.contactAction, "RECEIVE");
assert.equal(jumpContact.contactAction, "ATTACK");

const missedToss = new ContinuousRallySimulator({ seed: 7, servingTeam: "HOME" });
missedToss.configureServe({ servingTeam: "HOME", ability: 80, serveType: "STANDING" });
missedToss.launch();
for (let step = 0; step < 30; step += 1) missedToss.updateFrame(1 / 120);
const missedServer = missedToss.players.find((player) => player.id === missedToss.serverPlayerId);
missedServer.x -= 300; missedServer.targetX = missedServer.x;
for (let step = 0; step < 600 && missedToss.status !== "ENDED"; step += 1) missedToss.updateFrame(1 / 120);
assert.equal(missedToss.rallyResult.reason, "SERVE_TOSS_MISSED");
assert.equal(missedToss.ballFlightId, 0, "未真實擊中拋球不得建立正式發球球路。");

function complete({ team = "HOME", seed = 7, fps = 60 } = {}) {
  const simulator = new ContinuousRallySimulator({ seed, servingTeam: team });
  simulator.launch();
  for (let i = 0; i < fps * 45 && simulator.status !== "ENDED"; i += 1) simulator.updateFrame(1 / fps);
  return simulator.getSnapshot();
}

const deterministicA = complete({ team: "HOME", seed: 15 });
const deterministicB = complete({ team: "HOME", seed: 15 });
assert.deepEqual(deterministicA.rallyResult, deterministicB.rallyResult);
assert.deepEqual(deterministicA.serveResolution, deterministicB.serveResolution);
assert.ok(deterministicA.events.filter((event) => event.type === "ATTACK_STARTED").length >= 2,
  "正式發球成功後必須能銜接既有多拍攻防。");
assert.equal(complete({ team: "HOME", seed: 1 }).rallyResult.reason, "SERVE_NET");
assert.equal(complete({ team: "HOME", seed: 9 }).rallyResult.reason, "SERVE_OUT");
assert.equal(complete({ team: "AWAY", seed: 9 }).rallyResult.reason, "SERVE_NET");
const fpsRuns = [30, 60, 144].map((fps) => complete({ team: "HOME", seed: 15, fps }));
assert.deepEqual(fpsRuns.map((run) => run.rallyResult), [fpsRuns[0].rallyResult, fpsRuns[0].rallyResult, fpsRuns[0].rallyResult]);
assert.deepEqual(fpsRuns.map((run) => run.events.map((event) => event.type)),
  [fpsRuns[0].events.map((event) => event.type), fpsRuns[0].events.map((event) => event.type), fpsRuns[0].events.map((event) => event.type)]);
assert.ok(getServePosition("HOME").x < SPIKE_COURT_V1.bounds.minX);
assert.ok(getServePosition("AWAY").x > SPIKE_COURT_V1.bounds.maxX);

console.log("PASS: formal HOME/AWAY R1 S serve; STANDING/JUMP real toss and descending swept contact; mirrored baseline positions; ability speed thresholds; net/out/continuous play; deterministic 30/60/144 FPS.");
