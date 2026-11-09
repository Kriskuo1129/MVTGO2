import assert from "node:assert/strict";
import { LeftLongReceiveSimulator } from "../src/simulator/left-long-simulator.js";
import { SixPlayerReceiveSimulator } from "../src/simulator/team-simulator.js";
import { TeamSimulatorRenderer, resolvePlayerTouchAnimation } from "../src/simulator/team-simulator-renderer.js";
import { createAttackAssignment, resolveLeftLongConfiguration, isReceiveExperimentRunning } from "../src/simulator/attack-assignment.js";
import { DEFAULT_ATTACK_POSITIONS, setAttackPosition } from "../src/simulator/attack-positions.js";

// 座標與能力僅為測試 fixture，不匯入正式站位或寫入任何設定檔。
const configuration = (assignedPlayerId = "SIM-P2") => ({ attackType: "LEFT_LONG", assignedPlayerId,
  readyPosition: { x: 2250, y: 850 }, attackPosition: { x: 1200, y: 100 } });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const empty = new LeftLongReceiveSimulator({ random: () => 0.5 });
for (const invalid of [ { ...configuration(), readyPosition: null }, { ...configuration(), attackPosition: null },
  configuration("SIM-P1"), configuration("missing"), { ...configuration(), attackType: "RIGHT_LONG" },
  { ...configuration(), readyPosition: { x: Infinity, y: 0 } } ]) {
  assert.throws(() => empty.configureAttackAssignment(invalid));
}
assert.throws(() => resolveLeftLongConfiguration(DEFAULT_ATTACK_POSITIONS, "R2", "SIM-P2", empty.players, empty.secondTouchPlayerId), /UNCONFIGURED/);
const selection = { rotation: "R4", playerSlot: "OP", attackType: "LEFT_LONG" };
let positions = setAttackPosition(DEFAULT_ATTACK_POSITIONS, selection, "readyPosition", configuration().readyPosition);
positions = setAttackPosition(positions, selection, "attackPosition", configuration().attackPosition);
const resolved = resolveLeftLongConfiguration(positions, "R4", "SIM-P4", empty.players, empty.secondTouchPlayerId);
assert.equal(resolved.assignedPlayerId, "SIM-P4");
assert.equal(resolved.source.playerSlot, "OP");
assert.equal(createAttackAssignment(configuration("SIM-P4"), empty.players, empty.secondTouchPlayerId).attackType, "LEFT_LONG");

function run({ fps = 120, playerId = "SIM-P2", ability = 60, miss = false, flightDuration = 1.5,
  attackConfiguration = configuration(playerId) } = {}) {
  const simulator = new LeftLongReceiveSimulator({ random: () => 0.5 });
  simulator.configure({ flightDuration });
  simulator.configureAttackAssignment(attackConfiguration);
  simulator.launch({ x: 1800, y: 450 });
  simulator.players.forEach((player) => { player.receiveAbility = ability; player.morale = 99; });
  // 刻意讓測試舉球員無法及時到達，以驗證真實碰撞失敗清理。
  if (miss) simulator.getSecondTouchPlayer().moveSpeed = 0.1;
  const identity = simulator.players.map(({ id, position, rotationPosition }) => ({ id, position, rotationPosition }));
  let frozenBall = null, sawReady = false, sawAttack = false, switchedBeforeReady = false, sawAnimationLock = false;
  // 逐固定步進檢查不瞬移；畫面輸入頻率由 fps 控制，移動由原有 fixedStep 控制。
  const originalStep = simulator.stepFixed.bind(simulator);
  simulator.stepFixed = () => {
    const player = simulator.players.find((candidate) => candidate.id === playerId);
    const previous = { x: player.x, y: player.y, phase: simulator.attackAssignment?.movementPhase };
    originalStep();
    const snapshot = simulator.getSnapshot();
    const assignment = snapshot.attackAssignment;
    assert.ok(Math.hypot(player.x - previous.x, player.y - previous.y) <= player.moveSpeed * simulator.fixedStep + 1e-7);
    if (assignment?.movementPhase === "IDLE") {
      assert.equal(snapshot.events.some((event) => event.type === "RECEIVE_QUALITY_RESOLVED"), false);
    }
    if (assignment?.movementPhase === "MOVING_TO_READY") {
      sawReady = true;
      assert.ok(["PERFECT", "NORMAL"].includes(snapshot.receiveQuality.quality));
      assert.equal(snapshot.events.some((event) => event.type === "SECOND_TOUCH"), false);
    }
    if (assignment && snapshot.simulationTime < assignment.movementBlockedUntil && previous.phase === "MOVING_TO_READY") {
      sawAnimationLock = true; near(player.x, previous.x); near(player.y, previous.y);
      assert.equal(player.action, "RECEIVE");
    }
    if (assignment?.movementPhase === "MOVING_TO_ATTACK") {
      sawAttack = true;
      assert.ok(snapshot.secondTouchResult?.success);
      assert.ok(snapshot.events.some((event) => event.type === "SECOND_TOUCH"));
      if (previous.phase === "MOVING_TO_READY") switchedBeforeReady = assignment.readyDistance > 1;
      assert.ok(snapshot.thirdPass);
      assert.deepEqual(snapshot.thirdPass.start, { x: snapshot.secondTouchResult.ballX,
        y: snapshot.secondTouchResult.ballY, height: snapshot.secondTouchResult.ballHeight });
    }
    if (snapshot.thirdTouchResult?.success && !frozenBall) frozenBall = snapshot.ball;
    if (frozenBall) assert.deepEqual(snapshot.ball, frozenBall);
  };
  for (let frame = 0; frame < fps * 20 && isReceiveExperimentRunning(simulator.status); frame++) simulator.updateFrame(1 / fps);
  assert.deepEqual(simulator.players.map(({ id, position, rotationPosition }) => ({ id, position, rotationPosition })), identity);
  return { simulator, snapshot: simulator.getSnapshot(), sawReady, sawAttack, switchedBeforeReady, sawAnimationLock };
}

for (const playerId of ["SIM-P2", "SIM-P4", "SIM-P6"]) {
  const result = run({ playerId });
  assert.ok(["THIRD_TOUCH_COMPLETE", "THIRD_TOUCH_MISSED"].includes(result.snapshot.status));
  assert.ok(result.sawReady && result.sawAttack && result.switchedBeforeReady);
  if (result.snapshot.status === "THIRD_TOUCH_MISSED") {
    assert.equal(result.snapshot.events.some((event) => event.type === "THIRD_TOUCH"), false);
  }
  if (playerId === "SIM-P6") assert.ok(result.sawAnimationLock);
  result.simulator.reset();
  assert.equal(result.simulator.getSnapshot().attackAssignment, null);
  result.simulator.launch({ x: 1800, y: 450 });
  assert.equal(result.simulator.getSnapshot().attackAssignment.movementPhase, "IDLE");
}
const normal = run({ ability: 30 });
assert.equal(normal.snapshot.receiveQuality.quality, "NORMAL"); assert.ok(normal.sawReady && normal.sawAttack);
const bad = run({ ability: 1 });
assert.equal(bad.snapshot.receiveQuality.quality, "BAD");
assert.equal(bad.sawReady || bad.sawAttack, false); assert.equal(bad.snapshot.attackAssignment, null);
assert.equal(bad.snapshot.thirdPass, null);
const missed = run({ miss: true });
assert.equal(missed.snapshot.status, "SECOND_TOUCH_MISSED");
assert.equal(missed.sawAttack, false); assert.equal(missed.snapshot.attackAssignment, null);
assert.equal(missed.snapshot.thirdPass, null);
const ultraFast = run({ playerId: "SIM-P6", ability: 99, flightDuration: 0.8 });
assert.ok(ultraFast.sawAnimationLock);
assert.ok(["THIRD_TOUCH_COMPLETE", "THIRD_TOUCH_MISSED"].includes(ultraFast.snapshot.status));
for (const playerId of ["SIM-P2", "SIM-P6"]) {
  assert.deepEqual(run({ fps: 30, playerId }).snapshot, run({ fps: 144, playerId }).snapshot);
}

// 未啟用實驗時，比對整段原六人流程（包含碰撞結果與第二觸球停止位置）。
const original = new SixPlayerReceiveSimulator({ random: () => 0.5 });
const disabled = new LeftLongReceiveSimulator({ random: () => 0.5 });
for (const simulator of [original, disabled]) {
  simulator.launch({ x: 1800, y: 450 });
  simulator.players.forEach((player) => { player.receiveAbility = 60; player.morale = 99; });
  for (let frame = 0; frame < 720; frame++) simulator.updateFrame(1 / 120);
}
const { attackAssignment, thirdPass, thirdTouchResult, attackMotion, thirdTouchStatus, ...disabledSnapshot } = disabled.getSnapshot();
assert.equal(attackAssignment, null);
assert.equal(thirdPass, null); assert.equal(thirdTouchResult, null);
assert.equal(attackMotion, null); assert.equal(thirdTouchStatus, null);
assert.equal(original.status, "SECOND_TOUCH_COMPLETE");
assert.deepEqual(disabledSnapshot, original.getSnapshot());
const enabledSnapshot = run().snapshot;
assert.deepEqual(enabledSnapshot.firstTouchContact, original.getSnapshot().firstTouchContact);
assert.deepEqual(enabledSnapshot.secondTouchResult, original.getSnapshot().secondTouchResult);
const setter = enabledSnapshot.players.find((player) => player.id === enabledSnapshot.secondTouchPlayerId);
const setAnimation = resolvePlayerTouchAnimation(setter, enabledSnapshot);
assert.equal(setAnimation.isSuccessfulSet, true);
assert.equal(setAnimation.profile.minimumScale, 0.78);
assert.notEqual(setAnimation.profile.level, "ULTRA_FAST");
assert.equal(resolvePlayerTouchAnimation({ ...setter, action: "SET" }, {
  ...enabledSnapshot, secondTouchResult: { ...enabledSnapshot.secondTouchResult, success: false },
}).isSuccessfulSet, false);
const otherPhysicalStates = (snapshot) => snapshot.players.filter((player) => player.id !== "SIM-P2")
  .map(({ touchEligible, ...player }) => player);
assert.deepEqual(otherPhysicalStates(enabledSnapshot), otherPhysicalStates(original.getSnapshot()));

// Debug 必須依真實事件及清理結果顯示狀態，不能由標記或預覽配置推斷完成。
function renderDebug(snapshot) {
  const elements = new Map();
  const element = (key) => {
    if (!elements.has(key)) elements.set(key, { style: {}, querySelector: element });
    return elements.get(key);
  };
  const renderer = Object.create(TeamSimulatorRenderer.prototype);
  renderer.root = { querySelector: element };
  renderer.renderAttackExperiment(snapshot);
  return element("#left-long-debug").textContent;
}
const successDebug = renderDebug(run({ attackConfiguration: { ...DEFAULT_ATTACK_POSITIONS.entries[0], assignedPlayerId: "SIM-P2" } }).snapshot);
for (const text of ["Simulator Status：THIRD_TOUCH_COMPLETE", "Movement Phase：ATTACK_READY",
  "成功 SECOND_TOUCH：YES", "目前移動目標：ATTACK", "距離目前目標：0.00 世界單位", "OH1"]) {
  assert.ok(successDebug.includes(text), text);
}
const failureDebug = renderDebug(missed.snapshot);
for (const text of ["Simulator Status：SECOND_TOUCH_MISSED", "Movement Phase：IDLE",
  "成功 SECOND_TOUCH：NO", "BALL_LANDED", "本次進攻跑位未完成"]) assert.ok(failureDebug.includes(text), text);
assert.equal(failureDebug.includes("ATTACK_READY"), false);
console.log("PASS: UNCONFIGURED/S blocked; multiple players; PERFECT/NORMAL/BAD; receive lock; real SECOND_TOUCH gating/failure; READY interruption; third-pass extension; reset; unchanged disabled mode; identical 30/144 FPS.");
console.log("PASS: explicit Debug status, phase, real SECOND_TOUCH, target/distance and failure reason.");
