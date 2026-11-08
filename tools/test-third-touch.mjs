import assert from "node:assert/strict";
import { LeftLongReceiveSimulator } from "../src/simulator/left-long-simulator.js";
import { SixPlayerReceiveSimulator, TEAM_SIMULATOR_AVATAR_SIZE, TEAM_SIMULATOR_BALL_DISPLAY_SIZE } from "../src/simulator/team-simulator.js";
import { ATTACK_ROTATIONS, ATTACK_TYPES, DEFAULT_ATTACK_POSITIONS, getAttackPosition } from "../src/simulator/attack-positions.js";
import { LINEUP_POSITIONS } from "../src/lineup/starting-lineup.js";
import { resolveLeftLongConfiguration, isReceiveExperimentRunning } from "../src/simulator/attack-assignment.js";
import { ATTACK_CONTACT_CONFIG, createAttackContactGeometry, detectAttackContact, getExpectedAttackContact } from "../src/simulator/attack-contact.js";
import { THIRD_PASS_TEST_DEFAULTS, validateThirdPassParameters } from "../src/simulator/third-pass.js";
import { sampleSimulatorBall } from "../src/simulator/ball.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const approved = getAttackPosition(DEFAULT_ATTACK_POSITIONS, { rotation: "R1", playerSlot: "OH1", attackType: "LEFT_LONG" });
assert.deepEqual(approved.readyPosition, { x: 1422.0553176739254, y: 759.6263406329012 });
assert.deepEqual(approved.attackPosition, { x: 1268.25, y: 673.6953125 });
let unconfigured = 0;
for (const rotation of ATTACK_ROTATIONS) for (const playerSlot of LINEUP_POSITIONS) for (const attackType of Object.values(ATTACK_TYPES)) {
  if (getAttackPosition(DEFAULT_ATTACK_POSITIONS, { rotation, playerSlot, attackType }).status === "UNCONFIGURED") unconfigured++;
}
assert.equal(unconfigured, 179); assert.equal(DEFAULT_ATTACK_POSITIONS.entries.length, 1);
for (const invalid of [ { flightDuration: 0 }, { arcHeight: NaN }, { contactHeight: 100 }, { arcHeight: 100 }, { flightDuration: Infinity } ]) {
  assert.throws(() => validateThirdPassParameters({ ...THIRD_PASS_TEST_DEFAULTS, ...invalid }));
}

const geometry = createAttackContactGeometry({ avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
  ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE, contactHeight: 180 });
const player = { id: "SIM-P2", x: 1300, y: 600 };
const point = getExpectedAttackContact(player, geometry);
const sweep = { previousBall: { x: point.x - 300, y: point.y + 20, height: 200, inFlight: true },
  currentBall: { x: point.x + 300, y: point.y - 20, height: 160, inFlight: true },
  previousPlayer: player, currentPlayer: player, assignedPlayerId: player.id, flightStatus: "IN_PLAY", geometry };
const fastHit = detectAttackContact(sweep);
assert.ok(fastHit.contacted && fastHit.stepProgress > 0 && fastHit.stepProgress < 1);
assert.ok(fastHit.overlapDepth >= ATTACK_CONTACT_CONFIG.minimumOverlapDepth - 1e-7);
assert.equal(detectAttackContact({ ...sweep, assignedPlayerId: "SIM-P4" }).contacted, false);
assert.equal(detectAttackContact({ ...sweep, flightStatus: "COMPLETE" }).contacted, false);
assert.equal(detectAttackContact({ ...sweep, currentPlayer: { ...player, action: "RECEIVE" } }).contacted, false);
assert.equal(detectAttackContact({ ...sweep, currentPlayer: { ...player, jumpHeight: NaN } }).contacted, false);
assert.equal(detectAttackContact({ ...sweep, previousBall: { ...sweep.previousBall, inFlight: false } }).contacted, false);
assert.equal(detectAttackContact({ ...sweep,
  previousBall: { x: point.x, y: 100 + player.y + geometry.offset.y, height: 100, inFlight: true },
  currentBall: { x: point.x, y: 50 + player.y + geometry.offset.y, height: 50, inFlight: true } }).contacted, false);
const tangentX = player.x + geometry.avatarRadius + geometry.ballRadius;
assert.equal(detectAttackContact({ ...sweep,
  previousBall: { x: tangentX, y: player.y + 200, height: 200, inFlight: true },
  currentBall: { x: tangentX, y: player.y + 160, height: 160, inFlight: true } }).contacted, false);
const jumping = { ...player, jumpHeight: 100 };
const jumpPoint = getExpectedAttackContact(jumping, geometry);
near(jumpPoint.height, point.height + 100);
near(jumpPoint.y - jumpPoint.height, point.y - point.height - 100);
assert.ok(detectAttackContact({ ...sweep, previousPlayer: jumping, currentPlayer: jumping,
  previousBall: { ...sweep.previousBall, height: 300 }, currentBall: { ...sweep.currentBall, height: 260 } }).contacted);

function run({ fps = 120, slow = false, attackPosition = approved.attackPosition,
  readyPosition = approved.readyPosition, parameters = THIRD_PASS_TEST_DEFAULTS } = {}) {
  const simulator = new LeftLongReceiveSimulator({ random: () => 0.5 });
  const configuration = resolveLeftLongConfiguration(DEFAULT_ATTACK_POSITIONS, "R1", "SIM-P2", simulator.players, simulator.secondTouchPlayerId);
  simulator.configureAttackAssignment({ ...configuration, readyPosition, attackPosition });
  simulator.configureThirdPass(parameters);
  if (slow) simulator.configureAttackMotion({ maximumHeight: 0 });
  simulator.launch({ x: 1800, y: 450 });
  let started = false, concurrent = false, interruptedReady = false;
  const step = simulator.stepFixed.bind(simulator);
  simulator.stepFixed = () => {
    const attacker = simulator.players.find((p) => p.id === "SIM-P2");
    const before = { x: attacker.x, y: attacker.y, ballX: simulator.ball.x, ballY: simulator.ball.y, status: simulator.status };
    step();
    assert.ok(Math.hypot(attacker.x - before.x, attacker.y - before.y) <= attacker.moveSpeed * simulator.fixedStep + 1e-7);
    if (!started && simulator.thirdPass) {
      started = true;
      const events = simulator.events;
      const second = events.find((e) => e.type === "SECOND_TOUCH");
      const third = events.find((e) => e.type === "THIRD_PASS_STARTED");
      assert.ok(second?.success && third && events.indexOf(second) < events.indexOf(third));
      assert.deepEqual(third.start, { x: second.ballX, y: second.ballY, height: second.ballHeight });
      near(simulator.ball.x, second.ballX); near(simulator.ball.y, second.ballY); near(simulator.ball.height, second.ballHeight);
      near(simulator.ball.elapsed, 0); near(third.time, second.time);
      near(events.find((e) => e.type === "ATTACK_MOVEMENT_PHASE_CHANGED" && e.movementPhase === "MOVING_TO_ATTACK").time, third.time);
      assert.equal(simulator.attackAssignment.movementPhase, "MOVING_TO_ATTACK");
      interruptedReady = Math.hypot(attacker.x - readyPosition.x, attacker.y - readyPosition.y) > 1;
      const expected = sampleSimulatorBall(simulator.ball, third.expectedContactTime);
      near(expected.x, third.expectedContact.x); near(expected.y, third.expectedContact.y); near(expected.height, third.expectedContact.height);
      assert.notEqual(third.expectedContact.y, attackPosition.y);
      if (slow) attacker.moveSpeed = 0.1;
    }
    if (before.status === "THIRD_PASS_IN_FLIGHT" && simulator.status === "THIRD_PASS_IN_FLIGHT") {
      if (Math.hypot(attacker.x - before.x, attacker.y - before.y) > 0
        && Math.hypot(simulator.ball.x - before.ballX, simulator.ball.y - before.ballY) > 0) concurrent = true;
    }
  };
  for (let frame = 0; frame < fps * 20 && isReceiveExperimentRunning(simulator.status); frame++) simulator.updateFrame(1 / fps);
  return { simulator, snapshot: simulator.getSnapshot(), started, concurrent, interruptedReady };
}

const success = run();
assert.ok(success.started && success.concurrent);
assert.equal(success.snapshot.status, "THIRD_TOUCH_COMPLETE");
assert.equal(success.snapshot.attackAssignment.movementPhase, "ATTACK_READY");
const result = success.snapshot.thirdTouchResult, ball = success.snapshot.ball;
assert.equal(result.playerId, "SIM-P2"); assert.equal(ball.inFlight, false);
assert.equal(success.snapshot.touchEligibility.phase, "ATTACK");
assert.equal(success.snapshot.touchEligibility.touchNumber, 3);
assert.equal(success.snapshot.touchEligibility.lastTouch.playerId, "SIM-P2");
assert.ok(result.ballHeight - result.playerJumpHeight >= geometry.minimumHeight && result.ballHeight - result.playerJumpHeight <= geometry.maximumHeight);
assert.ok(result.overlapDepth >= geometry.minimumOverlapDepth - 1e-7);
near(ball.x, result.ballX); near(ball.y, result.ballY); near(ball.height, result.ballHeight);
near(Math.hypot(result.ballX - result.playerX, result.ballY - result.ballHeight - result.playerY + result.playerJumpHeight), result.centerDistance);
assert.equal(success.snapshot.events.filter((e) => e.type === "THIRD_TOUCH").length, 1);
success.simulator.updateFrame(1);
assert.deepEqual(success.simulator.getSnapshot(), success.snapshot);
assert.equal(success.snapshot.events.some((e) => e.type.includes("FOURTH") || e.type.includes("SCORE")), false);

const missed = run({ slow: true });
assert.equal(missed.snapshot.status, "THIRD_TOUCH_MISSED");
assert.equal(missed.snapshot.thirdTouchResult.reason, "BALL_LANDED");
assert.equal(missed.snapshot.ball.height, 0);
assert.equal(missed.snapshot.touchEligibility.touchNumber, 2);
assert.equal(missed.snapshot.events.some((e) => e.type === "THIRD_TOUCH"), false);
const outside = run({ slow: true, attackPosition: { x: 1268.25, y: 890 } });
assert.equal(outside.snapshot.status, "THIRD_TOUCH_MISSED");
assert.equal(outside.snapshot.thirdTouchResult.reason, "OUT_OF_BOUNDS");
assert.equal(outside.snapshot.events.some((e) => e.type === "THIRD_TOUCH"), false);
const unfinishedReady = run({ readyPosition: { x: 2250, y: 850 } });
assert.ok(unfinishedReady.interruptedReady && unfinishedReady.started && unfinishedReady.concurrent);
for (const slow of [false, true]) assert.deepEqual(run({ fps: 30, slow }).snapshot, run({ fps: 144, slow }).snapshot);
const normal = new SixPlayerReceiveSimulator({ random: () => 0.5 });
normal.launch({ x: 1800, y: 450 }); for (let frame = 0; frame < 720; frame++) normal.updateFrame(1 / 120);
assert.equal(normal.status, "SECOND_TOUCH_COMPLETE");
assert.equal(normal.events.some((e) => e.type === "THIRD_PASS_STARTED"), false);
console.log("PASS: exact approved defaults/179 unconfigured; real second-touch origin; simultaneous fixed-step flight/movement; swept ATTACK overlap/height/eligibility/jump interface; natural ground/outside misses; no fabricated touch; ordinary mode; identical 30/144 FPS.");
