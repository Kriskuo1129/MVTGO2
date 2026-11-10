import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import {
  formatSecondTouchPrepareTarget,
  getTeamSimulatorStatusText,
  TeamSimulatorRenderer,
} from "../src/simulator/team-simulator-renderer.js";
import { SixPlayerReceiveSimulator } from "../src/simulator/team-simulator.js";
import { isSpikeExperimentRunning } from "../src/simulator/spike-flight.js";

const continuous = new ContinuousRallySimulator({ seed: 2 });
continuous.launch({ x: 1820, y: 450 });
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
  const simulator = new ContinuousRallySimulator({ seed });
  const harness = createAttackRendererHarness();
  const phases = new Set();
  const teams = new Set();
  simulator.launch(target);
  for (let frame = 0; frame < 60 * 40 && simulator.status !== "ENDED"; frame += 1) {
    const snapshot = simulator.updateFrame(1 / 60);
    phases.add(snapshot.rallyPhase);
    teams.add(snapshot.activeTeam);
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
  return { finalSnapshot, phases, teams };
}

const stageRun = renderContinuousStages({ seed: 26 });
  for (const phase of ["RECEIVE", "SET", "ATTACK", "ATTACK_FLIGHT", "FINISHING", "ENDED"]) {
  assert.ok(stageRun.phases.has(phase), `Renderer 必須處理 ${phase} 階段。`);
}
assert.deepEqual(stageRun.teams, new Set(["HOME", "AWAY"]));

const errorRun = renderContinuousStages({ seed: 6 });
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
