import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { R1_BLOCK_PHYSICS_V1 } from "../src/simulator/r1-block.js";
import { SPIKE_COURT_V1 } from "../src/simulator/spike-court.js";

const TOUCH_EVENTS = new Set([
  "SERVE_CONTACT", "RECEIVE_TOUCH", "SET_TOUCH", "ATTACK_STARTED", "BLOCK_CONTACT",
]);

function run({ seed, servingTeam = "HOME", serveMode = "LEGACY_MANUAL", fps = 60 } = {}) {
  const simulator = new ContinuousRallySimulator({ seed, servingTeam, serveMode });
  if (serveMode === "LEGACY_MANUAL") simulator.launch({ x: 1820, y: 450 });
  else simulator.launch();
  let lockedSnapshot = null;
  for (let frame = 0; frame < fps * 45 && simulator.status !== "ENDED"; frame += 1) {
    const snapshot = simulator.updateFrame(1 / fps);
    if (!lockedSnapshot && snapshot.status === "FINISHING") lockedSnapshot = snapshot;
  }
  return { lockedSnapshot, snapshot: simulator.getSnapshot() };
}

function verifyNetFinish({ seed, servingTeam = "HOME", serveMode = "LEGACY_MANUAL", reason }) {
  const { lockedSnapshot, snapshot } = run({ seed, servingTeam, serveMode });
  assert.equal(lockedSnapshot?.rallyResult?.reason, reason);
  assert.equal(lockedSnapshot.status, "FINISHING");
  assert.equal(lockedSnapshot.actualLandingPoint, null,
    `${reason} 規則結果鎖定時球仍在空中，不得預造落點。`);
  assert.equal(snapshot.status, "ENDED");
  assert.equal(snapshot.rallyResult.reason, reason);
  assert.ok(Number.isFinite(snapshot.actualLandingPoint?.x)
    && Number.isFinite(snapshot.actualLandingPoint?.y));
  assert.ok(Number.isFinite(snapshot.actualLandingPoint?.time));
  assert.equal(snapshot.actualLandingPoint.rallySeed, seed);
  const lockedIndex = snapshot.events.findIndex((event) => event.type === "RALLY_RESULT_LOCKED");
  const groundIndex = snapshot.events.findIndex((event) => event.type === "BALL_GROUND_CONTACT");
  assert.ok(lockedIndex >= 0 && groundIndex > lockedIndex,
    `${reason} 必須先鎖定結果，再由實際物理落地。`);
  assert.equal(snapshot.events.filter((event) => event.type === "RALLY_RESULT_LOCKED").length, 1);
  assert.equal(snapshot.events.slice(lockedIndex + 1).some((event) => TOUCH_EVENTS.has(event.type)), false,
    `${reason} 鎖定後不得再有有效球員觸球。`);
  const scoringSideIsAway = snapshot.rallyResult.scoringTeam === "AWAY";
  assert.equal(scoringSideIsAway ? snapshot.actualLandingPoint.x < SPIKE_COURT_V1.netX
    : snapshot.actualLandingPoint.x > SPIKE_COURT_V1.netX, true,
  `${reason} 反彈落點必須位於原攻擊方場內。`);
  return snapshot;
}

verifyNetFinish({ seed: 9, serveMode: "FORMAL", reason: "SERVE_NET" });
verifyNetFinish({ seed: 6, servingTeam: "AWAY", serveMode: "FORMAL", reason: "SERVE_NET" });
const attackNet = verifyNetFinish({ seed: 2, reason: "ATTACK_NET" });
assert.ok(attackNet.events.some((event) => event.type === "FINISHING_BOUNCE"));

const blockRun = run({ seed: 5 }).snapshot;
const attackJumps = blockRun.events.filter((event) => event.type === "ATTACK_JUMP_STARTED");
const blockJumps = blockRun.events.filter((event) => event.type === "BLOCK_JUMP");
assert.ok(attackJumps.length > 0 && blockJumps.length > 0);
for (const blockJump of blockJumps) {
  assert.ok(Number.isFinite(blockJump.attackerJumpTime));
  assert.ok(Math.abs(blockJump.time - blockJump.attackerJumpTime
    - R1_BLOCK_PHYSICS_V1.takeoffDelayAfterAttacker) < 1e-9,
  "攔網起跳必須固定在攻擊手實際起跳後 0.1 秒。 ");
  const attackerJump = attackJumps.find((event) => Math.abs(event.time - blockJump.attackerJumpTime) < 1e-9);
  assert.ok(attackerJump, "BLOCK_JUMP 必須引用真實 ATTACK_JUMP_STARTED。 ");
}

const summarize = (snapshot) => ({
  result: snapshot.rallyResult,
  landing: snapshot.actualLandingPoint,
  events: snapshot.events.map(({ type, time, reason, scoringTeam, team, job, result }) =>
    ({ type, time, reason, scoringTeam, team, job, result })),
});
const fpsRuns = [30, 60, 144].map((fps) => run({ seed: 5, fps }).snapshot);
assert.deepEqual(summarize(fpsRuns[1]), summarize(fpsRuns[0]));
assert.deepEqual(summarize(fpsRuns[2]), summarize(fpsRuns[0]));

console.log("PASS: net result lock + physical fall/bounce/landing; no post-net touches; "
  + "actual landing data; blocker takeoff attacker+0.1s; 30/60/144 FPS deterministic.");
