import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import {
  formatSecondTouchPrepareTarget,
  getPlayerAvatarLabel,
  getTeamSimulatorStatusText,
  isNewContinuousBallFlight,
  TeamSimulatorRenderer,
} from "../src/simulator/team-simulator-renderer.js";
import { SixPlayerReceiveSimulator } from "../src/simulator/team-simulator.js";
import { isSpikeExperimentRunning } from "../src/simulator/spike-flight.js";

const continuous = new ContinuousRallySimulator({ seed: 2 });
assert.equal(getPlayerAvatarLabel({ team: "HOME", job: "OH1", position: "OH1" }), "OH1");
assert.equal(getPlayerAvatarLabel({ team: "AWAY", job: "MB2", position: "MB2" }), "MB2");
continuous.launch({ x: 1820, y: 450 });
for (let step = 0; step < 240
  && !continuous.events.some((event) => event.type === "SERVE_CONTACT"); step += 1) {
  continuous.updateFrame(1 / 120);
}
const running = continuous.getSnapshot();
assert.equal(running.status, "RUNNING");
assert.equal(running.secondTouchPrepareTarget, undefined);
assert.equal(formatSecondTouchPrepareTarget(running), "提前跑位目標：由目前 Rally 階段動態決定");

for (let step = 0; step < 120 * 40 && continuous.status !== "ENDED"; step += 1) {
  continuous.updateFrame(1 / 120);
}
const ended = continuous.getSnapshot();
assert.equal(ended.status, "ENDED");
assert.match(getTeamSimulatorStatusText(ended), /Rally 結束：.+／得分方 (HOME|AWAY)/);
assert.equal(isSpikeExperimentRunning("FINISHING"), true,
  "Renderer 必須在 FINISHING 持續 requestAnimationFrame。");

assert.equal(running.ballFlightId, 1, "發球必須建立第一個連續 Rally 球路 ID。");
assert.equal(isNewContinuousBallFlight(running, null), true);
assert.equal(isNewContinuousBallFlight(running, running.ballFlightId), false,
  "同一球路不得每幀重新啟動 Camera route。");
const cameraFollowHarness = Object.assign(Object.create(TeamSimulatorRenderer.prototype), {
  lastFollowedBallFlightId: null,
  followCount: 0,
  beginCameraFollow() { this.followCount += 1; return true; },
});
assert.equal(cameraFollowHarness.followNewContinuousBallFlight(running), true);
assert.equal(cameraFollowHarness.followNewContinuousBallFlight(running), false);
assert.equal(cameraFollowHarness.followCount, 1, "同一 flight ID 只能呼叫一次 beginCameraFollow。 ");

function createAttackRendererHarness() {
  const marker = { style: {} };
  const overlay = { hidden: true, querySelector: () => marker };
  const debug = { textContent: "" };
  const controls = new Map();
  const root = { querySelector(selector) {
    if (selector === "#left-long-targets") return overlay;
    if (selector === "#left-long-debug") return debug;
    if (!controls.has(selector)) controls.set(selector, { disabled: false });
    return controls.get(selector);
  } };
  return { renderer: Object.assign(Object.create(TeamSimulatorRenderer.prototype),
    { root, attackPreview: null }), debug };
}

function renderContinuousStages({ seed, target = { x: 1820, y: 450 } }) {
  const simulator = new ContinuousRallySimulator({ seed, serveMode: "LEGACY_MANUAL" });
  const harness = createAttackRendererHarness();
  const phases = new Set();
  const teams = new Set();
  const flights = [];
  let lastFlightId = null;
  simulator.launch(target);
  for (let frame = 0; frame < 60 * 40 && simulator.status !== "ENDED"; frame += 1) {
    const snapshot = simulator.updateFrame(1 / 60);
    phases.add(snapshot.rallyPhase);
    teams.add(snapshot.activeTeam);
    if (snapshot.ballFlightId !== lastFlightId) {
      flights.push({ id: snapshot.ballFlightId, phase: snapshot.rallyPhase,
        startX: snapshot.ball.start.x, targetX: snapshot.ball.targetX });
      lastFlightId = snapshot.ballFlightId;
    }
    TeamSimulatorRenderer.prototype.renderAttackExperiment.call(harness.renderer, snapshot);
    const assignment = snapshot.attackAssignment;
    if (assignment) {
      const player = snapshot.players.find((entry) => entry.id === assignment.assignedPlayerId);
      assert.ok(player);
      assert.equal(assignment.readyDistance,
        Math.hypot(player.x - assignment.readyPosition.x, player.y - assignment.readyPosition.y));
      assert.equal(assignment.attackDistance,
        Math.hypot(player.x - assignment.attackPosition.x, player.y - assignment.attackPosition.y));
    }
  }
  const finalSnapshot = simulator.getSnapshot();
  TeamSimulatorRenderer.prototype.renderAttackExperiment.call(harness.renderer, finalSnapshot);
  phases.add(finalSnapshot.rallyPhase);
  return { finalSnapshot, phases, teams, flights };
}

const stageRun = renderContinuousStages({ seed: 26 });
  for (const phase of ["RECEIVE", "SET", "ATTACK", "ATTACK_FLIGHT", "FINISHING", "ENDED"]) {
  assert.ok(stageRun.phases.has(phase), `Renderer 必須處理 ${phase} 階段。`);
}
assert.deepEqual(stageRun.teams, new Set(["HOME", "AWAY"]));
assert.ok(stageRun.flights.length >= 7, "多拍 Rally 的發球、一傳、舉球與扣球應持續建立新 flight ID。");
assert.deepEqual(stageRun.flights.map((flight) => flight.id),
  Array.from({ length: stageRun.flights.length }, (_, index) => index + 1));
assert.ok(stageRun.flights.some((flight) => flight.targetX > flight.startX));
assert.ok(stageRun.flights.some((flight) => flight.targetX < flight.startX),
  "HOME／AWAY 來回球路必須同時包含左右兩種 Camera 方向。");

const errorRun = renderContinuousStages({ seed: 9 });
assert.ok(errorRun.phases.has("ERROR_FLIGHT"), "Renderer 必須處理 ERROR_FLIGHT 階段。");

const assignment = stageRun.finalSnapshot.attackAssignment;
const missingDebugFields = assignment ? { ...stageRun.finalSnapshot,
  attackAssignment: { ...assignment, targetDistance: undefined, readyDistance: undefined,
    attackDistance: undefined, targetPosition: undefined } } : stageRun.finalSnapshot;
assert.doesNotThrow(() => TeamSimulatorRenderer.prototype.renderAttackExperiment.call(
  createAttackRendererHarness().renderer, missingDebugFields));

const legacySnapshot = new SixPlayerReceiveSimulator({ random: () => 0.5 }).getSnapshot();
assert.match(formatSecondTouchPrepareTarget(legacySnapshot), /^提前跑位目標：\([\d.]+, [\d.]+\)$/);

console.log("PASS: actual attack Renderer handles RECEIVE/SET/ATTACK/ATTACK_FLIGHT/ERROR_FLIGHT/ENDED, repeated HOME/AWAY stages, real distances, optional Debug fields, and legacy snapshot compatibility.");
