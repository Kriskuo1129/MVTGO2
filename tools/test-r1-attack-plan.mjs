import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { createR1AttackPlan, getR1AttackConfigurations,
  selectR1AttackCandidate } from "../src/simulator/r1-attack-plan.js";

const ATTACK_JOBS = ["OH1", "OP", "MB1", "OH2"];

for (const team of ["HOME", "AWAY"]) {
  const configurations = getR1AttackConfigurations(team);
  assert.deepEqual(Object.keys(configurations), ATTACK_JOBS);
  for (const config of Object.values(configurations)) {
    assert.ok(config.readyPosition && config.attackPosition);
    assert.ok(config.setDuration > 0 && config.setArcHeight > 0);
  }
}
for (const job of ATTACK_JOBS) {
  const home = getR1AttackConfigurations("HOME")[job];
  const away = getR1AttackConfigurations("AWAY")[job];
  assert.equal(home.readyPosition.x + away.readyPosition.x, 2280);
  assert.equal(home.attackPosition.x + away.attackPosition.x, 2280);
}

const forced = createR1AttackPlan({ team: "AWAY", revision: 1,
  firstTouchPlayerId: "AWAY-S", firstTouchJob: "S" });
const forcedConfig = getR1AttackConfigurations("AWAY").OH1;
const forcedChoice = selectR1AttackCandidate(forced, [{ id: "AWAY-OH1", team: "AWAY", job: "OH1",
  action: "IDLE", moveSpeed: 300, ...forcedConfig.attackPosition }], () => 0.99);
assert.equal(forced.setterJob, "OP");
assert.equal(forcedChoice.selected.job, "OH1");

const impossible = createR1AttackPlan({ team: "AWAY", revision: 2,
  firstTouchPlayerId: "AWAY-MB2", firstTouchJob: "MB2" });
assert.equal(selectR1AttackCandidate(impossible, impossible.candidates.map((candidate) => ({
  id: `AWAY-${candidate.job}`, team: "AWAY", job: candidate.job,
  x: 2200, y: 900, moveSpeed: 1, action: "IDLE",
})), () => 0).selected, null, "沒有可行候選人時不得強制選人。");

function run(seed, fps = 60) {
  const simulator = new ContinuousRallySimulator({ seed, serveMode: "LEGACY_MANUAL" });
  simulator.launch({ x: 1820, y: 450 });
  let preparingSnapshot = null;
  for (let frame = 0; frame < fps * 40 && simulator.status !== "ENDED"; frame += 1) {
    const snapshot = simulator.updateFrame(1 / fps);
    if (!preparingSnapshot && snapshot.attackPlan?.status === "PREPARING") preparingSnapshot = snapshot;
  }
  return { snapshot: simulator.getSnapshot(), preparingSnapshot };
}

const completedByJob = new Map();
for (const seed of [1, 2, 3]) {
  const { snapshot, preparingSnapshot } = run(seed);
  assert.ok(preparingSnapshot, `Seed ${seed} 必須建立攻擊計畫。`);
  const planPlayers = preparingSnapshot.players.filter((player) =>
    player.team === preparingSnapshot.attackPlan.team && ATTACK_JOBS.includes(player.job));
  assert.equal(planPlayers.filter((player) => player.currentWork?.workType?.startsWith("PREPARE_")).length, 4,
    "四名攻擊手必須同步取得準備工作。");
  for (const selected of snapshot.events.filter((event) => event.type === "ATTACK_SELECTED")) {
    const touch = snapshot.events.find((event) => event.type === "THIRD_TOUCH"
      && event.playerId === selected.playerId && event.time >= selected.time);
    if (!touch) continue;
    const jump = snapshot.events.find((event) => event.type === "ATTACK_JUMP_STARTED"
      && event.playerId === selected.playerId && event.time >= selected.time);
    assert.ok(jump, `${selected.job} 必須真實跑位並起跳。`);
    const expected = getR1AttackConfigurations(selected.team)[selected.job].attackPosition;
    assert.ok(Math.hypot(jump.x - expected.x, jump.y - expected.y) < 1e-6,
      `${selected.job} 必須在自己的 ATTACK 位置起跳。`);
    completedByJob.set(selected.job, { seed, team: selected.team });
  }
}
assert.deepEqual(new Set(completedByJob.keys()), new Set(ATTACK_JOBS),
  "固定 Seed 1～3 必須涵蓋四種真實第三觸球。 ");

const deterministicA = run(2).snapshot.events.filter((event) => event.type === "ATTACK_SELECTED");
const deterministicB = run(2).snapshot.events.filter((event) => event.type === "ATTACK_SELECTED");
assert.deepEqual(deterministicA, deterministicB);
const fpsEvents = [30, 60, 144].map((fps) => run(2, fps).snapshot.events
  .filter((event) => ["ATTACK_PLAN_CREATED", "ATTACK_SELECTED", "THIRD_TOUCH"].includes(event.type)));
assert.deepEqual(fpsEvents[0], fpsEvents[1]);
assert.deepEqual(fpsEvents[0], fpsEvents[2]);

console.log("PASS: four R1 attacks use shared READY/ATTACK movement, locked seeded selection, real SET flight and swept THIRD_TOUCH; HOME/AWAY mirrored; 30/60/144 FPS deterministic.");
