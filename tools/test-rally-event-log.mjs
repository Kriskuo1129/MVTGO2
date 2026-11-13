import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { ContinuousRallySession } from "../src/simulator/continuous-rally-session.js";
import { getR1AttackConfigurations } from "../src/simulator/r1-attack-plan.js";
import { formatRallyEventLog, mapSimulatorEventToRallyLog,
  RallyEventLogStore } from "../src/simulator/rally-event-log.js";

function run(fps) {
  const simulator = new ContinuousRallySimulator({ seed: 2, serveMode: "LEGACY_MANUAL" });
  const store = new RallyEventLogStore();
  simulator.launch({ x: 1820, y: 450 });
  for (let frame = 0; frame < fps * 40 && simulator.status !== "ENDED"; frame += 1) {
    const snapshot = simulator.updateFrame(1 / fps);
    store.consume(snapshot);
    store.consume(snapshot); // Renderer 重繪不得重複事件。
  }
  return { entries: store.entries, text: formatRallyEventLog(store.entries) };
}

const result = run(60);
assert.ok(result.entries.length > 0);
assert.equal(result.entries[0].type, "RALLY_START");
assert.equal(result.entries.at(-1).type, "RALLY_END");
for (let index = 1; index < result.entries.length; index += 1) {
  assert.ok(result.entries[index].sequence > result.entries[index - 1].sequence);
  assert.ok(result.entries[index].simTime >= result.entries[index - 1].simTime);
}
const selectIndex = result.entries.findIndex((entry) => entry.type === "SET_SELECT");
const setContactIndex = result.entries.findIndex((entry) => entry.type === "SET_CONTACT");
const attackIndex = result.entries.findIndex((entry) => entry.type === "ATTACK_CONTACT");
assert.ok(selectIndex >= 0 && setContactIndex > selectIndex, "SET_SELECT 與實際 SET_CONTACT 必須分離且排序正確。");
assert.ok(attackIndex > setContactIndex, "ATTACK_CONTACT 只能來自真實第三觸球。");
assert.ok(result.entries[selectIndex].details.evaluations.every((entry) => typeof entry.feasible === "boolean"));
assert.ok(result.entries[attackIndex].details.attackType);
const attackPlans = result.entries.filter((entry) => entry.type === "ATTACK_PLAN");
assert.deepEqual(new Set(attackPlans.map((entry) => entry.team)), new Set(["HOME", "AWAY"]));
assert.ok(attackPlans.some((entry) => entry.details.attackPhase === "SERVE_RECEIVE"
  && entry.details.candidates.length === 4
  && /SERVE_RECEIVE（接發進攻）/.test(entry.message)));
assert.ok(attackPlans.some((entry) => entry.details.attackPhase === "COUNTERATTACK"
  && /COUNTERATTACK（防守反擊）/.test(entry.message)));
assert.ok(attackPlans.every((entry) => entry.message.includes(entry.details.attackPlanId)));
assert.ok(attackPlans.some((entry) => /OH1 背長/.test(entry.message) && /OP 長攻/.test(entry.message)));
for (const attack of result.entries.filter((entry) => entry.type === "ATTACK_CONTACT")) {
  assert.equal(attack.details.attackType,
    getR1AttackConfigurations(attack.team, attack.details.attackPhase)[attack.job].attackType,
    "Event Log 必須顯示以攻擊方自身視角定義的攻擊類型。 ");
}
assert.match(result.text, /Rally #1 \| Seed 2/);
assert.match(result.text, /SET_SELECT/);
assert.match(result.text, /ATTACK_CONTACT/);
assert.match(result.text, /BLOCK_ASSIGN/);
assert.ok(result.entries.some((entry) => entry.type === "FORMATION_TRANSITION"
  && /ATTACK_CROSSED_NET → DEFENSE/.test(entry.message)));
const serveTransition = mapSimulatorEventToRallyLog({ type: "R1_WORK_PLAN_ASSIGNED", time: 0.8,
  team: "HOME", phase: "DEFENSE_STANDBY", reason: "SERVE_CONTACT", revision: 2 }, {
  rallyId: 1, sequence: 2, seed: 2, servingTeam: "HOME", players: [],
});
assert.equal(serveTransition.type, "FORMATION_TRANSITION");
assert.match(serveTransition.message, /SERVE_CONTACT → DEFENSE/);
const blockContactIndex = result.entries.findIndex((entry) => entry.type === "BLOCK_CONTACT");
if (blockContactIndex >= 0) {
  assert.equal(result.entries[blockContactIndex + 1].type, "BLOCK_RESULT",
    "真實攔網接觸後才可記錄攔網結果。 ");
  assert.ok(result.entries[blockContactIndex].details.height > 0);
}
assert.match(result.text, /RALLY_END/);

const forcedSelection = mapSimulatorEventToRallyLog({ type: "ATTACK_SELECTED", time: 2,
  team: "AWAY", playerId: "AWAY-OH1", job: "OH1", setterPlayerId: "AWAY-OP",
  setterJob: "OP", attackType: "RIGHT_LONG", attackPlanId: "AWAY-R1-ATTACK-2",
  attackRole: "BACK_LONG", attackPhase: "COUNTERATTACK",
  forced: true, evaluations: [{ job: "OH1", feasible: true, reason: null }] }, {
  rallyId: 8, sequence: 4, seed: 99, servingTeam: "HOME", players: [],
});
assert.equal(forcedSelection.job, "OP");
assert.equal(forcedSelection.details.selectedJob, "OH1");
assert.match(forcedSelection.message, /OP 代舉 → OH1 背長（指定）/);

const forcedPlan = mapSimulatorEventToRallyLog({ type: "ATTACK_PLAN_CREATED", time: 1.5,
  team: "HOME", attackPlanId: "HOME-R1-ATTACK-3", setterJob: "OP",
  attackPhase: "COUNTERATTACK", forcedCandidateJob: "OH1", candidateJobs: ["OH1"],
  candidates: [{ job: "OH1", attackType: "RIGHT_LONG", attackRole: "BACK_LONG",
    workType: "PREPARE_BACK_LONG" }] }, {
  rallyId: 8, sequence: 3, seed: 99, servingTeam: "AWAY", players: [],
});
assert.match(forcedPlan.message,
  /COUNTERATTACK（防守反擊）｜計畫 HOME-R1-ATTACK-3｜候選：OH1 背長；OP 代舉，固定候選 OH1/);

const core = (entries) => entries.map(({ sequence, simTime, team, job, type, details }) =>
  ({ sequence, simTime, team, job, type, details }));
assert.deepEqual(core(run(30).entries), core(run(60).entries));
assert.deepEqual(core(run(144).entries), core(run(60).entries));

const session = new ContinuousRallySession({
  simulator: new ContinuousRallySimulator(), baseSeed: 11, intermissionDuration: 0.01,
});
const sessionStore = new RallyEventLogStore();
sessionStore.beginSession();
session.start({ firstServingTeam: "HOME", serveType: "STANDING", serveAbility: 70 });
while (session.rallyNumber < 2 || session.simulator.status !== "ENDED") {
  sessionStore.consume(session.updateFrame(1 / 60));
  if (session.rallyNumber > 2) break;
}
assert.ok(new Set(sessionStore.entries.map((entry) => entry.rallyId)).size >= 2,
  "連續 Session 必須保留不同 Rally 的事件。");
const beforePause = sessionStore.entries.length;
session.stop();
sessionStore.consume(session.getSnapshot());
sessionStore.consume(session.getSnapshot());
assert.equal(sessionStore.entries.length, beforePause, "暫停與重繪不得產生重複事件。");

console.log("PASS: engine-sourced Rally log; ordered immutable events; SET selection/contact separation; real ATTACK contact; multi-Rally retention; copy text; redraw/pause dedupe; 30/60/144 FPS.");
