import assert from "node:assert/strict";
import { ATTACK_MOTION_V1, validateAttackMotionParameters, sampleAttackMotion, strikeElapsed,
  createAttackMotion, updateAttackMotion } from "../src/simulator/attack-motion.js";
import { LeftLongReceiveSimulator } from "../src/simulator/left-long-simulator.js";
import { SixPlayerReceiveSimulator, TEAM_SIMULATOR_AVATAR_SIZE, TEAM_SIMULATOR_BALL_DISPLAY_SIZE } from "../src/simulator/team-simulator.js";
import { DEFAULT_ATTACK_POSITIONS } from "../src/simulator/attack-positions.js";
import { resolveLeftLongConfiguration, isReceiveExperimentRunning } from "../src/simulator/attack-assignment.js";
import { createAttackContactGeometry, detectAttackContact } from "../src/simulator/attack-contact.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const left = validateAttackMotionParameters();
const right = validateAttackMotionParameters({ direction: "RIGHT" });
const strike = strikeElapsed(left);
near(sampleAttackMotion(left, 0).rotationAngle, 0);
near(sampleAttackMotion(left, left.takeoffDuration + left.drawDuration).rotationAngle, 30);
near(sampleAttackMotion(left, strike).rotationAngle, -30);
near(sampleAttackMotion(left, left.jumpDuration).rotationAngle, -360);
near(sampleAttackMotion(left, strike).jumpHeight, 60);
near(sampleAttackMotion(left, left.jumpDuration).jumpHeight, 0);
let last = sampleAttackMotion(left, 0);
for (let i = 0; i <= 240; i++) {
  const t = i / 120, a = sampleAttackMotion(left, t), b = sampleAttackMotion(right, t);
  near(a.rotationAngle, -b.rotationAngle); near(a.jumpHeight, b.jumpHeight);
  assert.ok(Math.abs(a.rotationAngle - last.rotationAngle) < 6);
  if (t > left.takeoffDuration + left.drawDuration) assert.ok(a.rotationAngle <= last.rotationAngle + 1e-8);
  last = a;
}
for (const invalid of [{ jumpDuration: 0 }, { maximumHeight: NaN }, { drawDuration: 4 }, { direction: "UP" }]) {
  assert.throws(() => validateAttackMotionParameters(invalid));
}
const genericPlayer = { id: "GENERIC", x: 1500, y: 650, moveSpeed: 300 };
const standalone = createAttackMotion({ playerId: genericPlayer.id, simulationTime: 0, predictedContactTime: 2, parameters: left });
standalone.startedAt = 1;
for (let step = 0; step <= 120; step++) {
  updateAttackMotion(standalone, genericPlayer, 1 + step / 120);
  assert.equal(genericPlayer.x, 1500); assert.equal(genericPlayer.y, 650); assert.equal(genericPlayer.moveSpeed, 300);
}

function run({ fps = 120, direction = "LEFT", speed = null, playerId = "SIM-P2" } = {}) {
  const simulator = new LeftLongReceiveSimulator({ random: () => 0.5 });
  const configuration = playerId === "SIM-P2"
    ? resolveLeftLongConfiguration(DEFAULT_ATTACK_POSITIONS, "R1", playerId, simulator.players, simulator.secondTouchPlayerId)
    // 非 OH1 測試 fixture，不寫入正式站位資料。
    : { attackType: "LEFT_LONG", assignedPlayerId: playerId, readyPosition: { x: 1510, y: 310 }, attackPosition: { x: 1510, y: 310 } };
  simulator.configureAttackAssignment(configuration);
  simulator.configureAttackMotion({ direction });
  simulator.launch({ x: 1800, y: 450 });
  let sawContinuation = false, sawPostContactRotation = false, frozenBall = null, prediction = null, changedSpeed = false;
  const step = simulator.stepFixed.bind(simulator);
  simulator.stepFixed = () => {
    const player = simulator.players.find((p) => p.id === playerId);
    if (simulator.thirdPass && !changedSpeed) { if (speed !== null) player.moveSpeed = speed; changedSpeed = true; }
    const previous = { x: player.x, y: player.y };
    step();
    const snapshot = simulator.getSnapshot(), motion = snapshot.attackMotion;
    assert.ok(Math.hypot(player.x - previous.x, player.y - previous.y) <= player.moveSpeed * simulator.fixedStep + 1e-7);
    if (motion) {
      prediction ??= motion.predictedContactTime;
      assert.equal(motion.predictedContactTime, prediction);
      if (motion.startedAt !== null) {
        near(player.x, motion.takeoffPosition.x); near(player.y, motion.takeoffPosition.y);
        assert.equal(player.moveSpeed, speed ?? 300);
      }
    }
    if (snapshot.thirdTouchResult) {
      if (!frozenBall) frozenBall = snapshot.ball;
      assert.deepEqual(snapshot.ball, frozenBall);
      if (snapshot.status === "ATTACK_LANDING") {
        sawContinuation = true;
        assert.notEqual(motion.jumpPhase, "LANDED");
        if (snapshot.thirdTouchResult.success && Math.abs(motion.rotationAngle) > 35) sawPostContactRotation = true;
      }
    }
  };
  for (let frame = 0; frame < fps * 20 && isReceiveExperimentRunning(simulator.status); frame++) simulator.updateFrame(1 / fps);
  return { simulator, snapshot: simulator.getSnapshot(), sawContinuation, sawPostContactRotation };
}

for (const direction of ["LEFT", "RIGHT"]) {
  const runResult = run({ direction }), { snapshot } = runResult;
  assert.equal(snapshot.status, "THIRD_TOUCH_COMPLETE");
  assert.ok(runResult.sawContinuation && runResult.sawPostContactRotation);
  assert.equal(snapshot.thirdTouchStatus, "THIRD_TOUCH_COMPLETE");
  const result = snapshot.thirdTouchResult, motion = snapshot.attackMotion;
  assert.equal(result.jumpPhase, "SWING");
  assert.ok(Math.abs(result.rotationAngle - (direction === "LEFT" ? -30 : 30)) <= ATTACK_MOTION_V1.strikeAngleTolerance + 1e-7);
  assert.ok(result.playerJumpHeight > 0);
  assert.equal(motion.jumpPhase, "LANDED"); near(motion.jumpHeight, 0);
  near(motion.rotationAngle, direction === "LEFT" ? -360 : 360);
  assert.ok(snapshot.simulationTime > result.time);
  assert.equal(snapshot.events.filter((e) => e.type === "ATTACK_JUMP_STARTED").length, 1);
  assert.equal(snapshot.events.filter((e) => e.type === "ATTACK_LANDED").length, 1);
  assert.equal(snapshot.events.filter((e) => e.type === "THIRD_TOUCH").length, 1);
  assert.deepEqual(snapshot.ball, runResult.simulator.updateFrame(1).ball);
  assert.deepEqual(run({ fps: 30, direction }).snapshot, run({ fps: 144, direction }).snapshot);
  runResult.simulator.reset();
  assert.equal(runResult.simulator.getSnapshot().attackMotion, null);
  assert.equal(runResult.simulator.getSnapshot().thirdTouchStatus, null);
  assert.equal(runResult.simulator.players.find((p) => p.id === "SIM-P2").jumpHeight, undefined);
}

// 在真實觸球點驗證有／無 jumpHeight 的幾何差異，不靠 Renderer 補正。
const actual = run().snapshot.thirdTouchResult;
const geometry = createAttackContactGeometry({ avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
  ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE, contactHeight: 180 });
const actor = { id: "SIM-P2", x: actual.playerX, y: actual.playerY, jumpHeight: actual.playerJumpHeight };
const sweep = { previousBall: { x: actual.ballX, y: actual.ballY, height: actual.ballHeight + 0.1, inFlight: true },
  currentBall: { x: actual.ballX, y: actual.ballY, height: actual.ballHeight - 0.1, inFlight: true },
  previousPlayer: actor, currentPlayer: actor, assignedPlayerId: actor.id, flightStatus: "IN_PLAY", geometry };
assert.ok(detectAttackContact(sweep).contacted);
assert.equal(detectAttackContact({ ...sweep, previousPlayer: { ...actor, jumpHeight: 0 }, currentPlayer: { ...actor, jumpHeight: 0 } }).contacted, false);
assert.equal(detectAttackContact({ ...sweep, strikeWindow: null }).contacted, false);
const whiff = run({ speed: 250 });
assert.equal(whiff.snapshot.status, "THIRD_TOUCH_MISSED");
assert.ok(whiff.sawContinuation);
assert.equal(whiff.snapshot.attackMotion.jumpPhase, "LANDED");
near(whiff.snapshot.attackMotion.rotationAngle, -360);
assert.equal(whiff.snapshot.events.some((e) => e.type === "THIRD_TOUCH"), false);
assert.ok(whiff.snapshot.events.find((e) => e.type === "ATTACK_LANDED").time > whiff.snapshot.thirdTouchResult.time);
assert.deepEqual(run({ fps: 30, speed: 250 }).snapshot, run({ fps: 144, speed: 250 }).snapshot);
const skipped = run({ speed: 240 }).snapshot;
assert.equal(skipped.attackMotion.jumpPhase, "SKIPPED");
assert.equal(skipped.events.some((e) => e.type === "THIRD_TOUCH"), false);
const other = run({ playerId: "SIM-P4" }).snapshot;
assert.equal(other.attackMotion.playerId, "SIM-P4");
assert.equal(other.attackMotion.jumpPhase, "LANDED");
assert.equal(other.status, "THIRD_TOUCH_COMPLETE");
const normal = new SixPlayerReceiveSimulator({ random: () => 0.5 });
normal.launch({ x: 1800, y: 450 }); for (let i = 0; i < 720; i++) normal.updateFrame(1 / 120);
assert.equal(normal.status, "SECOND_TOUCH_COMPLETE");
console.log("PASS: continuous mirrored angles; fixed-step jump/ground separation; one-shot prediction; real jump-aware SWING collision; success/whiff follow-through and landing; no false touch; generic player; normal stop; identical 30/144 FPS.");
