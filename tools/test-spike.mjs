import assert from "node:assert/strict";
import { SpikeReceiveSimulator, D2_ATTACK_MOTION_V1 } from "../src/simulator/spike-simulator.js";
import { SixPlayerReceiveSimulator, TEAM_SIMULATOR_BALL_DISPLAY_SIZE } from "../src/simulator/team-simulator.js";
import { DEFAULT_ATTACK_POSITIONS } from "../src/simulator/attack-positions.js";
import { resolveLeftLongConfiguration } from "../src/simulator/attack-assignment.js";
import { SPIKE_COURT_V1, validateSpikeTarget, validateSpikeParameters, isSpikeGroundIn } from "../src/simulator/spike-court.js";
import { isSpikeExperimentRunning, sweepSpikeNet, detectSpikeTermination } from "../src/simulator/spike-flight.js";
import { createSimulatorBall, launchSimulatorBall, sampleSimulatorBall, stepSimulatorBall } from "../src/simulator/ball.js";
import { sampleAttackMotion } from "../src/simulator/attack-motion.js";
import { TeamSimulatorRenderer } from "../src/simulator/team-simulator-renderer.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const radius = TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2;
assert.equal(D2_ATTACK_MOTION_V1.jumpDuration, 0.8);
assert.equal(D2_ATTACK_MOTION_V1.swingDuration, 0.1);
near(sampleAttackMotion(D2_ATTACK_MOTION_V1, 0.3).rotationAngle, 30);
near(sampleAttackMotion(D2_ATTACK_MOTION_V1, 0.4).rotationAngle, -30);
near(sampleAttackMotion(D2_ATTACK_MOTION_V1, 0.8).rotationAngle, -360);
for (const target of [null, { x: NaN, y: 450 }, { x: Infinity, y: 450 }, { x: 1140, y: 450 }, { x: 500, y: 901 }]) {
  assert.throws(() => validateSpikeTarget(target));
}
assert.deepEqual(validateSpikeTarget({ x: 500, y: 450 }), { x: 500, y: 450, height: 0 });
assert.throws(() => validateSpikeParameters({ flightDuration: 0 }));
assert.throws(() => validateSpikeParameters({ netHeight: NaN }));
assert.ok(isSpikeGroundIn({ x: SPIKE_COURT_V1.bounds.minX - radius - 0.5, y: 450 }, radius));
assert.equal(isSpikeGroundIn({ x: SPIKE_COURT_V1.bounds.minX - radius - 1.1, y: 450 }, radius), false);
assert.equal(isSpikeGroundIn({ x: SPIKE_COURT_V1.bounds.minX - radius * 0.85,
  y: SPIKE_COURT_V1.bounds.minY - radius * 0.85 }, radius), false);

function ballFixture({ start = { x: 1300, y: 450, height: 100 }, target = { x: 300, y: 450, height: radius }, duration = 0.01, arcHeight = 0 } = {}) {
  const ball = createSimulatorBall(start); launchSimulatorBall(ball, { start, target, duration, arcHeight }); return ball;
}
const fast = ballFixture();
const fastNet = sweepSpikeNet(fast, 0, 1, radius);
assert.ok(fastNet > 0 && fastNet < 1); // 一步跨過整張網仍命中。
near(sampleSimulatorBall(fast, fastNet * fast.duration).x, SPIKE_COURT_V1.netX + radius + SPIKE_COURT_V1.netTolerance);
const grazing = ballFixture({ start: { x: 1300, y: 450, height: 192 }, target: { x: 1000, y: 450, height: 192 } });
const grazeProgress = sweepSpikeNet(grazing, 0, 1, radius);
assert.ok(grazeProgress !== null);
const graze = sampleSimulatorBall(grazing, grazeProgress * grazing.duration);
near(Math.hypot(graze.x - SPIKE_COURT_V1.netX, graze.height - SPIKE_COURT_V1.netHeight), radius + SPIKE_COURT_V1.netTolerance);
assert.ok(graze.x < SPIKE_COURT_V1.netX + 10); // 不在擴張方框角落提前誤判。
assert.equal(sweepSpikeNet(ballFixture({ start: { x: 1300, y: 841, height: 192 }, target: { x: 1000, y: 841, height: 192 } }), 0, 1, radius), null);
assert.equal(sweepSpikeNet(ballFixture({ start: { x: 1300, y: 450, height: 194 }, target: { x: 1000, y: 450, height: 194 } }), 0, 1, radius), null);
const falling = ballFixture({ start: { x: 2000, y: 450, height: 240 }, target: { x: 500, y: 450, height: radius }, arcHeight: -150 });
const earlyGround = detectSpikeTermination(falling, 0, 1, radius);
assert.equal(earlyGround.type, "SPIKE_OUT");
assert.ok(earlyGround.progress < 1); near(earlyGround.position.height, radius);
const legacy = ballFixture({ target: { x: 300, y: 450 } }); stepSimulatorBall(legacy, 1); assert.equal(legacy.height, 0);
const sphere = ballFixture(); stepSimulatorBall(sphere, 1); assert.equal(sphere.height, radius);

function run({ target = { x: 500, y: 450 }, parameters = {}, fps = 120, thirdMiss = false } = {}) {
  const simulator = new SpikeReceiveSimulator({ random: () => 0.5 });
  simulator.configureAttackAssignment(resolveLeftLongConfiguration(DEFAULT_ATTACK_POSITIONS, "R1", "SIM-P2", simulator.players, simulator.secondTouchPlayerId));
  simulator.configureSpikeExperiment({ target, parameters });
  simulator.launch({ x: 1800, y: 450 });
  assert.deepEqual(simulator.lockedSpikeTarget, { x: target.x, y: target.y, height: 0 });
  assert.ok(Object.isFrozen(simulator.lockedSpikeTarget));
  assert.throws(() => simulator.configureSpikeExperiment({ target: { x: 800, y: 400 } }), /不可更改/);
  let started = false, concurrent = false, waitedForLanding = false, frozenBall = null, slowed = false;
  const step = simulator.stepFixed.bind(simulator);
  simulator.stepFixed = () => {
    if (thirdMiss && simulator.thirdPass && !slowed) { simulator.players.find((p) => p.id === "SIM-P2").moveSpeed = 240; slowed = true; }
    const before = simulator.getSnapshot(); step(); const snapshot = simulator.getSnapshot();
    if (!started && snapshot.spikeFlight) {
      started = true;
      const third = snapshot.events.find((e) => e.type === "THIRD_TOUCH"), spike = snapshot.events.find((e) => e.type === "SPIKE_STARTED");
      assert.ok(third?.success && snapshot.events.indexOf(third) < snapshot.events.indexOf(spike));
      assert.deepEqual(spike.start, { x: third.ballX, y: third.ballY, height: third.ballHeight });
      near(spike.time, third.time); near(snapshot.ball.x, third.ballX); near(snapshot.ball.y, third.ballY); near(snapshot.ball.height, third.ballHeight);
      near(snapshot.ball.elapsed, 0);
      assert.notEqual(snapshot.attackMotion.jumpPhase, "LANDED");
      assert.throws(() => simulator.configureSpikeExperiment(null));
      assert.throws(() => simulator.configureThirdPass({ flightDuration: 2, arcHeight: 260, contactHeight: 180 }));
    }
    if (before.status === "SPIKE_IN_FLIGHT") {
      const sample = sampleSimulatorBall(simulator.ball, simulator.ball.elapsed);
      near(snapshot.ball.x, sample.x); near(snapshot.ball.y, sample.y); near(snapshot.ball.height, sample.height);
      assert.ok(snapshot.ball.height >= radius - 1e-6);
      if (snapshot.ball.x !== before.ball.x && snapshot.attackMotion.rotationAngle !== before.attackMotion.rotationAngle) concurrent = true;
    }
    if (snapshot.spikeResult) {
      if (!frozenBall) frozenBall = snapshot.ball;
      assert.deepEqual(snapshot.ball, frozenBall);
      if (snapshot.status === "SPIKE_LANDING") { waitedForLanding = true; assert.notEqual(snapshot.attackMotion.jumpPhase, "LANDED"); }
    }
  };
  for (let frame = 0; frame < fps * 20 && isSpikeExperimentRunning(simulator.status); frame++) simulator.updateFrame(1 / fps);
  return { simulator, snapshot: simulator.getSnapshot(), started, concurrent, waitedForLanding };
}

let landedSnapshot;
for (const [target, expected] of [[{ x: 500, y: 450 }, "SPIKE_LANDED"], [{ x: 1050, y: 450 }, "SPIKE_NET"], [{ x: 100, y: 450 }, "SPIKE_OUT"]]) {
  const result = run({ target }), { snapshot } = result;
  assert.equal(snapshot.status, expected);
  if (expected === "SPIKE_LANDED") landedSnapshot = snapshot;
  assert.ok(result.started && result.concurrent);
  assert.equal(snapshot.attackMotion.jumpPhase, "LANDED");
  assert.equal(snapshot.events.filter((e) => e.type === expected).length, 1);
  assert.equal(snapshot.touchEligibility.touchNumber, 3);
  if (expected === "SPIKE_NET") {
    assert.ok(result.waitedForLanding);
    assert.equal(snapshot.spikeResult.netCheck.result, "NET_CONTACT");
  } else { assert.equal(snapshot.ball.height, radius); assert.equal(snapshot.spikeResult.groundHeight, 0); }
  assert.deepEqual(run({ target, fps: 30 }).snapshot, run({ target, fps: 144 }).snapshot);
  const final = snapshot.ball; result.simulator.updateFrame(1); assert.deepEqual(result.simulator.getSnapshot().ball, final);
  result.simulator.reset();
  assert.equal(result.simulator.getSnapshot().lockedSpikeTarget, null);
  assert.equal(result.simulator.getSnapshot().spikeFlight, null);
}
// 結束後可預覽下一個目標；Rally 進行中則必須顯示鎖定目標。
const elements = new Map();
const renderer = Object.create(TeamSimulatorRenderer.prototype);
renderer.root = { querySelector(selector) {
  if (!elements.has(selector)) elements.set(selector, { style: {} });
  return elements.get(selector);
} };
renderer.spikePreview = { target: { x: 800, y: 500 }, court: SPIKE_COURT_V1 };
renderer.renderSpikeExperiment(landedSnapshot);
near(parseFloat(elements.get("#spike-target-marker").style.left), 800 / 2280 * 100);
assert.ok(elements.get("#spike-debug").textContent.includes("下次指定扣球落點：(800.00, 500.00"));
renderer.renderSpikeExperiment({ ...landedSnapshot, status: "SPIKE_IN_FLIGHT" });
near(parseFloat(elements.get("#spike-target-marker").style.left), 500 / 2280 * 100);
assert.equal(elements.get("#spike-click-mode").disabled, true);
assert.equal(run({ target: { x: 1050, y: 450 }, parameters: { flightDuration: 0.05, netHeight: 300 } }).snapshot.status, "SPIKE_NET");
const missed = run({ thirdMiss: true });
assert.equal(missed.started, false); assert.equal(missed.snapshot.spikeFlight, null);
assert.equal(missed.snapshot.events.some((e) => e.type === "SPIKE_STARTED"), false);
const normal = new SixPlayerReceiveSimulator({ random: () => 0.5 });
const disabled = new SpikeReceiveSimulator({ random: () => 0.5 });
for (const simulator of [normal, disabled]) { simulator.launch({ x: 1800, y: 450 }); for (let frame = 0; frame < 720; frame++) simulator.updateFrame(1 / 120); }
const { lockedSpikeTarget, spikeFlight, spikeResult, attackMotion, attackAssignment, thirdTouchStatus, thirdPass, thirdTouchResult, ...ordinary } = disabled.getSnapshot();
assert.equal(disabled.status, "SECOND_TOUCH_COMPLETE"); assert.deepEqual(ordinary, normal.getSnapshot());
assert.equal(spikeFlight, null); assert.equal(spikeResult, null);
console.log("PASS: target validation/lock; approved D2 animation; real THIRD_TOUCH start; concurrent spike/landing; sphere net sweep/high-speed/edge clearance; ground radius/line tolerance; NET/LANDED/OUT; third miss; ordinary mode; identical 30/144 FPS.");
