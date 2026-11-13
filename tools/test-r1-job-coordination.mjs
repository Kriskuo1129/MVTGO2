import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { DEFAULT_CONTINUOUS_FORMATION,
  resolveContinuousFormationProfile, resolveContinuousRallyFormation } from "../src/simulator/continuous-rally-formation.js";
import { createR1AttackPreparationPlan, createR1BlockPlan, createR1DefensePlan, createR1ReceivePlan,
  R1_DEFENSE_RECEIVE_JOBS, R1_RECEIVE_JOBS, R1_WORK_TYPES } from "../src/simulator/r1-job-coordination.js";
import { getR1AttackConfigurations, R1_ATTACK_PHASES } from "../src/simulator/r1-attack-plan.js";

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
assert.equal(byJob(attackPlan, "OP").workType, R1_WORK_TYPES.PREPARE_LONG);
assert.equal(byJob(attackPlan, "MB2").workType, R1_WORK_TYPES.HOLD);
const counterattackPlan = createR1AttackPreparationPlan("HOME", {
  firstTouchJob: "OH2",
  attackConfigurations: getR1AttackConfigurations("HOME", R1_ATTACK_PHASES.COUNTERATTACK),
});
assert.equal(byJob(counterattackPlan, "OH1").workType, R1_WORK_TYPES.PREPARE_BACK_LONG);
assert.equal(byJob(counterattackPlan, "OP").workType, R1_WORK_TYPES.PREPARE_LONG);
const alternatePlan = createR1AttackPreparationPlan("HOME", { firstTouchJob: "S" });
assert.equal(byJob(alternatePlan, "OP").workType, R1_WORK_TYPES.ALTERNATE_SET);
assert.equal(byJob(alternatePlan, "S").workType, R1_WORK_TYPES.HOLD);

for (const team of ["HOME", "AWAY"]) {
  const initialFormation = resolveContinuousRallyFormation(DEFAULT_CONTINUOUS_FORMATION, team);
  const defenseFormation = resolveContinuousFormationProfile(DEFAULT_CONTINUOUS_FORMATION, "DEFENSE");
  const simulator = new ContinuousRallySimulator({ seed: 9, servingTeam: team });
  simulator.launch();
  let snapshot = simulator.getSnapshot();
  const server = snapshot.players.find((player) => player.id === snapshot.serverPlayerId);
  assert.equal(server.job, "S", "R1 必須由 S 發球。 ");
  assert.equal(snapshot.teamWorkPlans[team].phase, "SERVE_INITIAL");
  for (const player of snapshot.players.filter((candidate) => candidate.team === team && candidate.job !== "S")) {
    const initial = initialFormation.teams[team]
      .find((entry) => entry.playerId === player.id);
    assert.deepEqual({ x: player.x, y: player.y }, { x: initial.x, y: initial.y },
      "擊球前非發球員必須維持 R1 初始站位。");
  }
  const receivingTeam = team === "HOME" ? "AWAY" : "HOME";
  for (const player of snapshot.players.filter((candidate) => candidate.team === receivingTeam)) {
    const initial = initialFormation.teams[receivingTeam]
      .find((entry) => entry.playerId === player.id);
    assert.deepEqual({ x: player.x, y: player.y }, { x: initial.x, y: initial.y },
      "接發方在發球接觸前必須維持 Editor RECEIVE 初始站位。");
  }
  let guard = 0;
  while (!snapshot.events.some((event) => event.type === "SERVE_CONTACT") && guard++ < 600) {
    simulator.updateFrame(1 / 60); snapshot = simulator.getSnapshot();
  }
  assert.ok(snapshot.events.some((event) => event.type === "SERVE_CONTACT"));
  assert.equal(snapshot.teamWorkPlans[team].phase, "DEFENSE_STANDBY");
  for (const assignment of snapshot.teamWorkPlans[team].assignments) {
    const expected = defenseFormation[team].find((entry) => entry.position === assignment.job);
    assert.deepEqual(assignment.target, { x: expected.x, y: expected.y },
      "發球接觸後的工作目標必須直接來自 Editor DEFENSE 快照。");
  }
  const before = new Map(snapshot.players.filter((player) => player.team === team)
    .map((player) => [player.id, { x: player.x, y: player.y }]));
  simulator.updateFrame(1 / 60); snapshot = simulator.getSnapshot();
  for (const player of snapshot.players.filter((candidate) => candidate.team === team)) {
    const start = before.get(player.id);
    assert.ok(Math.hypot(player.x - start.x, player.y - start.y) <= player.moveSpeed / 60 + 1e-7,
      "Job 工作切換不得造成瞬移。");
  }
}

const customFormation = JSON.parse(JSON.stringify(DEFAULT_CONTINUOUS_FORMATION));
customFormation.profiles.RECEIVE = customFormation.profiles.RECEIVE.map((entry) => ({
  ...entry, x: entry.position === "S" ? entry.x - 10 : entry.x,
}));
customFormation.profiles.DEFENSE = customFormation.profiles.DEFENSE.map((entry) => ({
  ...entry, x: entry.position === "OH2" ? entry.x - 10 : entry.x,
}));
const serializedCustomFormation = JSON.stringify(customFormation);
for (const team of ["HOME", "AWAY"]) {
  const simulator = new ContinuousRallySimulator({ seed: 9, servingTeam: team,
    initialFormation: customFormation });
  const expectedDefense = resolveContinuousFormationProfile(customFormation, "DEFENSE")[team];
  simulator.launch();
  let snapshot = simulator.getSnapshot(), guard = 0;
  while (!snapshot.events.some((event) => event.type === "SERVE_CONTACT") && guard++ < 600) {
    snapshot = simulator.updateFrame(1 / 60);
  }
  for (const assignment of snapshot.teamWorkPlans[team].assignments) {
    const expected = expectedDefense.find((entry) => entry.position === assignment.job);
    assert.deepEqual(assignment.target, { x: expected.x, y: expected.y },
      "自訂 Editor DEFENSE 座標必須成為發球後的實際 Player Agent 工作目標。");
  }
}
assert.equal(JSON.stringify(customFormation), serializedCustomFormation,
  "Rally 不得改寫傳入的 Editor 站位資料。");

const defenseProfiles = resolveContinuousFormationProfile(customFormation, "DEFENSE");
const blockPlan = createR1BlockPlan("AWAY", "LEFT_LONG", 670, defenseProfiles.AWAY);
for (const assignment of blockPlan.assignments.filter((entry) => !["OH1", "MB1"].includes(entry.job))) {
  const expected = defenseProfiles.AWAY.find((entry) => entry.position === assignment.job);
  assert.deepEqual(assignment.target, { x: expected.x, y: expected.y },
    "BLOCK_PREPARE 只能覆蓋攔網者；其他球員必須維持 DEFENSE 目標。");
}

const transitionSimulator = new ContinuousRallySimulator({ seed: 26, serveMode: "LEGACY_MANUAL",
  initialFormation: customFormation });
transitionSimulator.launch({ x: 1820, y: 450 });
let transitionSnapshot = transitionSimulator.getSnapshot(), transitionGuard = 0;
while (!transitionSnapshot.events.some((event) => event.type === "R1_WORK_PLAN_ASSIGNED"
  && event.reason === "ATTACK_CROSSED_NET") && transitionGuard++ < 10000) {
  transitionSnapshot = transitionSimulator.updateFrame(1 / 120);
}
const defenseTransition = transitionSnapshot.events.find((event) => event.type === "R1_WORK_PLAN_ASSIGNED"
  && event.reason === "ATTACK_CROSSED_NET");
assert.ok(defenseTransition, "攻擊實際過網後必須產生一次 DEFENSE 站位切換。");
assert.equal(defenseTransition.phase, "DEFENSE_STANDBY");
const defenseWork = transitionSnapshot.teamWorkPlans[defenseTransition.team];
for (const assignment of defenseWork.assignments) {
  const expected = defenseProfiles[defenseTransition.team]
    .find((entry) => entry.position === assignment.job);
  assert.deepEqual(assignment.target, { x: expected.x, y: expected.y },
    "ATTACK_CROSSED_NET 後工作目標必須來自 Editor DEFENSE 快照。");
}
const lastAttack = [...transitionSnapshot.events].reverse().find((event) => event.type === "ATTACK_STARTED"
  && event.team === defenseTransition.team);
const transitioningAttacker = transitionSnapshot.players.find((player) => player.id === lastAttack.playerId);
const attackerStart = { x: transitioningAttacker.x, y: transitioningAttacker.y };
const attackerTarget = { x: transitioningAttacker.targetX, y: transitioningAttacker.targetY };
const attackerStartDistance = Math.hypot(attackerStart.x - attackerTarget.x, attackerStart.y - attackerTarget.y);
let attackerMoved = false;
for (let step = 0; step < 240 && !attackerMoved; step += 1) {
  transitionSnapshot = transitionSimulator.updateFrame(1 / 120);
  const attacker = transitionSnapshot.players.find((player) => player.id === lastAttack.playerId);
  const distance = Math.hypot(attacker.x - attackerTarget.x, attacker.y - attackerTarget.y);
  attackerMoved = Math.hypot(attacker.x - attackerStart.x, attacker.y - attackerStart.y) > 1e-7
    && distance < attackerStartDistance;
}
assert.equal(attackerMoved, true,
  "攻擊手完成落地後必須釋放 ATTACK 保護並開始移向 DEFENSE，不得停留原地。");

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
