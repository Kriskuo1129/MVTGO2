import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { DEFAULT_CONTINUOUS_FORMATION } from "../src/simulator/continuous-rally-formation.js";
import { createR1AttackPreparationPlan, createR1DefensePlan, createR1ReceivePlan,
  R1_DEFENSE_RECEIVE_JOBS, R1_RECEIVE_JOBS, R1_WORK_TYPES } from "../src/simulator/r1-job-coordination.js";
import { getR1AttackConfigurations } from "../src/simulator/r1-attack-plan.js";

const byJob = (plan, job) => plan.assignments.find((assignment) => assignment.job === job);

const homeDefense = createR1DefensePlan("HOME", "TEST");
const awayDefense = createR1DefensePlan("AWAY", "TEST");
for (const job of ["OH1", "MB1", "OP", "OH2", "MB2", "S"]) {
  assert.equal(byJob(homeDefense, job).target.x + byJob(awayDefense, job).target.x, 2280,
    `${job} 的 HOME／AWAY 防守 X 必須鏡像。`);
  assert.equal(byJob(homeDefense, job).target.y, byJob(awayDefense, job).target.y);
}
assert.deepEqual(createR1ReceivePlan("HOME").assignments
  .filter((assignment) => assignment.workType === R1_WORK_TYPES.RECEIVE)
  .map((assignment) => assignment.job), R1_RECEIVE_JOBS);
assert.deepEqual(createR1ReceivePlan("HOME", "ATTACK").assignments
  .filter((assignment) => assignment.workType === R1_WORK_TYPES.RECEIVE)
  .map((assignment) => assignment.job).sort(), [...R1_DEFENSE_RECEIVE_JOBS].sort());

const attackPlan = createR1AttackPreparationPlan("HOME", {
  firstTouchJob: "OH2", attackConfigurations: getR1AttackConfigurations("HOME"),
});
assert.equal(byJob(attackPlan, "S").workType, R1_WORK_TYPES.SET);
assert.equal(byJob(attackPlan, "OH1").workType, R1_WORK_TYPES.PREPARE_BACK_LONG);
assert.equal(byJob(attackPlan, "OH2").workType, R1_WORK_TYPES.PREPARE_BACK_CENTER_ATTACK);
assert.equal(byJob(attackPlan, "MB1").workType, R1_WORK_TYPES.PREPARE_MIDDLE_QUICK);
assert.equal(byJob(attackPlan, "OP").workType, R1_WORK_TYPES.PREPARE_RIGHT_LONG);
assert.equal(byJob(attackPlan, "MB2").workType, R1_WORK_TYPES.HOLD);
const alternatePlan = createR1AttackPreparationPlan("HOME", { firstTouchJob: "S" });
assert.equal(byJob(alternatePlan, "OP").workType, R1_WORK_TYPES.ALTERNATE_SET);
assert.equal(byJob(alternatePlan, "S").workType, R1_WORK_TYPES.HOLD);

for (const team of ["HOME", "AWAY"]) {
  const simulator = new ContinuousRallySimulator({ seed: 9, servingTeam: team });
  simulator.launch();
  let snapshot = simulator.getSnapshot();
  const server = snapshot.players.find((player) => player.id === snapshot.serverPlayerId);
  assert.equal(server.job, "S", "R1 必須由 S 發球。 ");
  assert.equal(snapshot.teamWorkPlans[team].phase, "SERVE_INITIAL");
  for (const player of snapshot.players.filter((candidate) => candidate.team === team && candidate.job !== "S")) {
    const initial = DEFAULT_CONTINUOUS_FORMATION.teams[team]
      .find((entry) => entry.playerId === player.id);
    assert.deepEqual({ x: player.x, y: player.y }, { x: initial.x, y: initial.y },
      "擊球前非發球員必須維持 R1 初始站位。");
  }
  let guard = 0;
  while (!snapshot.events.some((event) => event.type === "SERVE_CONTACT") && guard++ < 600) {
    simulator.updateFrame(1 / 60); snapshot = simulator.getSnapshot();
  }
  assert.ok(snapshot.events.some((event) => event.type === "SERVE_CONTACT"));
  assert.equal(snapshot.teamWorkPlans[team].phase, "DEFENSE");
  assert.deepEqual(snapshot.teamWorkPlans[team].assignments.map(({ job, workType }) => ({ job, workType })),
    homeDefense.assignments.map(({ job, workType }) => ({ job, workType })));
  const before = new Map(snapshot.players.filter((player) => player.team === team)
    .map((player) => [player.id, { x: player.x, y: player.y }]));
  simulator.updateFrame(1 / 60); snapshot = simulator.getSnapshot();
  for (const player of snapshot.players.filter((candidate) => candidate.team === team)) {
    const start = before.get(player.id);
    assert.ok(Math.hypot(player.x - start.x, player.y - start.y) <= player.moveSpeed / 60 + 1e-7,
      "Job 工作切換不得造成瞬移。");
  }
}

const receiveSimulator = new ContinuousRallySimulator({ seed: 2, serveMode: "LEGACY_MANUAL" });
receiveSimulator.launch({ x: 1780, y: 470 });
let receiveSnapshot = receiveSimulator.getSnapshot();
assert.ok(R1_RECEIVE_JOBS.includes(receiveSnapshot.players
  .find((player) => player.id === receiveSnapshot.primaryReceiverId).job));
const receiveRevision = receiveSnapshot.workPlanRevision;
receiveSimulator.updateFrame(1 / 144);
receiveSnapshot = receiveSimulator.getSnapshot();
assert.equal(receiveSnapshot.workPlanRevision, receiveRevision,
  "同一階段不得每幀重新指派工作。");

const defenseReceiveSimulator = new ContinuousRallySimulator({ seed: 4, serveMode: "LEGACY_MANUAL" });
defenseReceiveSimulator.launch({ x: 1780, y: 450 });
defenseReceiveSimulator.prepareReceive("AWAY", "ATTACK");
let defenseSnapshot = defenseReceiveSimulator.getSnapshot();
assert.ok(R1_DEFENSE_RECEIVE_JOBS.includes(defenseSnapshot.players
  .find((player) => player.id === defenseSnapshot.primaryReceiverId).job));
defenseReceiveSimulator.prepareSet("AWAY", { job: "S" });
defenseSnapshot = defenseReceiveSimulator.getSnapshot();
assert.equal(defenseSnapshot.players.find((player) => player.id === defenseSnapshot.secondTouchPlayerId).job, "OP",
  "S 第一觸球時必須由 OP 接手第二球工作。");

let guard = 0;
while (!receiveSnapshot.events.some((event) => event.type === "SECOND_TOUCH") && guard++ < 10000) {
  receiveSimulator.updateFrame(1 / 60); receiveSnapshot = receiveSimulator.getSnapshot();
  if (["FINISHING", "ENDED"].includes(receiveSnapshot.status)) break;
}
const attackWorkEvent = receiveSnapshot.events.find((event) =>
  event.type === "R1_WORK_PLAN_ASSIGNED" && event.phase === "ATTACK_PREPARE");
assert.ok(attackWorkEvent, "一傳成功後必須一次產生攻擊工作安排。");
const attackWorkPlan = receiveSnapshot.teamWorkPlans[attackWorkEvent.team];
assert.equal(byJob(attackWorkPlan, "S").workType, R1_WORK_TYPES.SET);
assert.equal(byJob(attackWorkPlan, "MB2").workType, R1_WORK_TYPES.HOLD);

console.log("PASS: R1 S serve; stable receive eligibility; mirrored defense work; simultaneous attack preparation; fixed-step movement without teleport or per-frame reassignment.");
