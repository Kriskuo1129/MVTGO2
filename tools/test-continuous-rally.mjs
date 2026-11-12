import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";

function run({ fps = 120, seed = 26, target = { x: 1820, y: 450 } } = {}) {
  const simulator = new ContinuousRallySimulator({ seed, serveMode: "LEGACY_MANUAL" });
  simulator.launch(target);
  let previousTime = 0;
  const observed = { setTeams: new Set(), attackTeams: new Set(), movingAttackTeams: new Set(),
    followThroughTeams: new Set(), landedAttackTeams: new Set(), finishing: [],
    setDiagnostics: new Map() };
  for (let frame = 0; frame < fps * 40 && simulator.status !== "ENDED"; frame += 1) {
    const snapshot = simulator.updateFrame(1 / fps);
    assert.ok(snapshot.simulationTime >= previousTime);
    previousTime = snapshot.simulationTime;
    if (snapshot.status === "FINISHING") observed.finishing.push(snapshot);
    snapshot.players.forEach((player) => {
      if (player.action === "SET" && snapshot.secondTouchResult?.playerId === player.id) {
        observed.setTeams.add(player.team);
        observed.setDiagnostics.set(player.team, snapshot.setContactDiagnostic);
      }
      if (["TAKEOFF", "DRAW", "SWING", "FOLLOW_THROUGH"].includes(player.jumpPhase)) {
        observed.attackTeams.add(player.team);
      }
      if (player.jumpPhase === "FOLLOW_THROUGH") observed.followThroughTeams.add(player.team);
      if (player.jumpPhase === "LANDED") observed.landedAttackTeams.add(player.team);
      if (["OH1", "OH2", "MB1", "OP"].includes(player.position)
        && player.currentWork?.workType?.startsWith("PREPARE_") && player.isMoving) {
        observed.movingAttackTeams.add(player.team);
      }
    });
  }
  return { snapshot: simulator.getSnapshot(), observed };
}

const firstRun = run(), repeatedRun = run(), run30Result = run({ fps: 30 }),
  run60Result = run({ fps: 60 }), run144Result = run({ fps: 144 });
const first = firstRun.snapshot, repeated = repeatedRun.snapshot;
const run30 = run30Result.snapshot, run60 = run60Result.snapshot, run144 = run144Result.snapshot;
assert.deepEqual(first.events, repeated.events, "固定 Seed 必須重現完整事件序列。");
assert.deepEqual(run30.events, run60.events);
assert.deepEqual(run30.events, run144.events);
assert.equal(first.status, "ENDED");
assert.ok(first.rallyResult?.reason);
assert.ok(["HOME", "AWAY"].includes(first.rallyResult?.scoringTeam));
assert.equal(new Set(first.players.map((player) => player.id)).size, 12);
assert.equal(first.players.filter((player) => player.team === "HOME").length, 6);
assert.equal(first.players.filter((player) => player.team === "AWAY").length, 6);
const touches = first.events.filter((event) => ["RECEIVE_TOUCH", "SECOND_TOUCH", "THIRD_TOUCH"].includes(event.type));
const attacks = first.events.filter((event) => event.type === "ATTACK_STARTED");
assert.ok(attacks.length >= 2, "同一 Rally 至少需要兩次真實第三觸球後的攻擊。");
assert.deepEqual(new Set(attacks.map((event) => event.team)), new Set(["HOME", "AWAY"]));
assert.deepEqual(attacks.slice(0, 2).map((event) => event.team), ["AWAY", "HOME"]);
assert.deepEqual(firstRun.observed.setTeams, new Set(["HOME", "AWAY"]), "雙方 SET 動畫狀態都必須出現。");
for (const team of ["HOME", "AWAY"]) {
  const diagnostic = firstRun.observed.setDiagnostics.get(team);
  assert.equal(diagnostic?.contacted, true, `${team} SET 必須來自真實掃掠接觸。`);
  assert.ok(diagnostic.normalizedDistance <= 1 + 1e-10);
  assert.equal(diagnostic.descending, true);
  assert.equal(diagnostic.prediction.team, team);
}
assert.deepEqual(firstRun.observed.attackTeams, new Set(["HOME", "AWAY"]), "雙方 ATTACK 動畫姿態都必須出現。");
assert.deepEqual(firstRun.observed.followThroughTeams, new Set(["HOME", "AWAY"]), "雙方攻擊收勢都必須完整呈現。");
assert.deepEqual(firstRun.observed.landedAttackTeams, new Set(["HOME", "AWAY"]), "雙方攻擊動畫都必須完成落地。");
assert.deepEqual(firstRun.observed.movingAttackTeams, new Set(["HOME", "AWAY"]), "雙方 OH1 都必須真實跑位。");
assert.ok(firstRun.observed.finishing.length > 1, "Rally 結果鎖定後必須持續播放 FINISHING。");
assert.ok(firstRun.observed.finishing.some((snapshot) => snapshot.finishing.bounceCount > 0),
  "落地球必須在 FINISHING 中產生自然反彈。");
const lockedResult = firstRun.observed.finishing[0].rallyResult;
for (const snapshot of firstRun.observed.finishing) assert.deepEqual(snapshot.rallyResult, lockedResult);
const lockEventIndex = first.events.findIndex((event) => event.type === "RALLY_RESULT_LOCKED");
assert.ok(lockEventIndex >= 0);
assert.equal(first.events.slice(lockEventIndex + 1).some((event) =>
  ["RECEIVE_TOUCH", "SECOND_TOUCH", "THIRD_TOUCH"].includes(event.type)), false,
"FINISHING 不得產生新的有效觸球。");
for (const attack of attacks) {
  assert.ok(attack.team === "HOME" ? attack.resolution.targetPoint.x > 1140
    : attack.resolution.targetPoint.x < 1140, "攻擊目標必須位於正確的對方半場。");
}
const finalAttack = attacks.at(-1);
if (["BALL_LANDED", "BALL_OUT"].includes(first.rallyResult.reason)) {
  assert.ok(first.actualLandingPoint, "未被接起且自然落地的攻擊必須記錄真實首次落點。");
  assert.ok(Math.hypot(first.actualLandingPoint.x - finalAttack.resolution.targetPoint.x,
    first.actualLandingPoint.y - finalAttack.resolution.targetPoint.y) < 1,
  "自然彈道的真實落點應符合抽選目標的合理容差。");
}
for (let index = 1; index < touches.length; index += 1) {
  assert.notEqual(touches[index].playerId, touches[index - 1].playerId, "同一球員不得非法連續觸球。");
}
for (const event of first.events.filter((entry) => entry.type === "RECEIVE_ERROR")) {
  assert.ok(event.trajectory.duration > 0 && event.trajectory.arcHeight > 0);
}
const seed2 = run({ seed: 2 }).snapshot;
assert.equal(seed2.status, "ENDED", "真實跑位後 Seed 2 仍須安全完成，不要求保留舊版強制多拍結果。");
const missedSet = run({ seed: 5 }).snapshot;
assert.equal(missedSet.rallyResult.reason, "SET_MISSED");
assert.equal(missedSet.secondTouchResult.success, false);
assert.equal(missedSet.secondTouchResult.reason, "SETTER_UNREACHABLE");
assert.equal(missedSet.setContactDiagnostic.prediction.reachable, false);
assert.ok(missedSet.setContactDiagnostic.normalizedDistance > 1,
  "視覺圓形可能重疊，但超出 SET 正上方容差時必須合理拒絕。");
const net = run({ seed: 3 }).snapshot;
assert.equal(net.rallyResult.reason, "ATTACK_NET");
assert.equal(net.rallyResult.scoringTeam, "HOME");
const landed = run({ seed: 1 }).snapshot;
assert.equal(landed.rallyResult.reason, "BALL_LANDED");
const outRun = run({ seed: 2 });
assert.equal(outRun.snapshot.rallyResult.reason, "BALL_OUT");
assert.ok(outRun.observed.finishing.some((snapshot) => snapshot.finishing.bounceCount > 0));
const illegal = new ContinuousRallySimulator({ seed: 7 });
illegal.status = "RUNNING"; illegal.activeTeam = "HOME";
const samePlayer = illegal.players.find((player) => player.team === "HOME");
assert.equal(illegal.recordTouch(samePlayer, "TEST_TOUCH"), true);
illegal.recordTouch(samePlayer, "TEST_TOUCH");
assert.equal(illegal.rallyResult.reason, "ILLEGAL_CONSECUTIVE_TOUCH");
const fourTouches = new ContinuousRallySimulator({ seed: 8 });
fourTouches.status = "RUNNING"; fourTouches.activeTeam = "HOME";
for (const player of fourTouches.players.filter((entry) => entry.team === "HOME").slice(0, 4)) {
  fourTouches.recordTouch(player, "TEST_TOUCH");
}
assert.equal(fourTouches.rallyResult.reason, "FOUR_TOUCHES");

console.log(JSON.stringify({ rallyResult: first.rallyResult,
  phaseEvents: first.events.map((event) => `${event.type}:${event.team ?? "-"}`),
  touchCounts: first.teamTouches }, null, 2));
console.log("PASS: shared 12-player continuous Rally; deterministic seed; actual touch records; terminal reason/scoring team; identical 30/60/144 FPS.");
