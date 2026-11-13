import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { createSeededRandom } from "../src/simulator/attack-quality.js";
import { ATTACK_TYPES, DEFAULT_ATTACK_POSITIONS } from "../src/simulator/attack-positions.js";
import { createR1AttackPlan, getR1AttackConfigurations, R1_ATTACK_PHASES,
  selectR1AttackCandidate } from "../src/simulator/r1-attack-plan.js";

const ATTACK_JOBS = ["OH1", "OP", "MB1", "OH2"];

for (const team of ["HOME", "AWAY"]) {
  for (const phase of Object.values(R1_ATTACK_PHASES)) {
    const configurations = getR1AttackConfigurations(team, phase);
    assert.deepEqual(Object.keys(configurations), ATTACK_JOBS);
    for (const config of Object.values(configurations)) {
      assert.ok(config.readyPosition && config.attackPosition);
      assert.ok(config.setDuration > 0 && config.setArcHeight > 0);
    }
  }
}

for (const team of ["HOME", "AWAY"]) {
  const plan = createR1AttackPlan({ team, revision: 10,
    firstTouchPlayerId: `${team}-MB2`, firstTouchJob: "MB2",
    attackPhase: R1_ATTACK_PHASES.SERVE_RECEIVE });
  const players = plan.candidates.map((candidate) => ({ id: `${team}-${candidate.job}`,
    team, job: candidate.job, action: "IDLE", moveSpeed: 300, ...candidate.attackPosition }));
  const opChoice = selectR1AttackCandidate(plan, players, createSeededRandom(20261110));
  assert.equal(opChoice.selected.job, "OP");
  assert.equal(opChoice.selected.attackRole, "LONG");
  assert.equal(opChoice.selected.attackType, "LEFT_LONG");
  assert.deepEqual(opChoice.selected.readyPosition,
    getR1AttackConfigurations(team, R1_ATTACK_PHASES.SERVE_RECEIVE).OP.readyPosition);
  assert.deepEqual(opChoice.selected.attackPosition,
    getR1AttackConfigurations(team, R1_ATTACK_PHASES.SERVE_RECEIVE).OP.attackPosition);
}
for (const job of ATTACK_JOBS) {
  const home = getR1AttackConfigurations("HOME")[job];
  const away = getR1AttackConfigurations("AWAY")[job];
  assert.equal(home.readyPosition.x + away.readyPosition.x, 2280);
  assert.equal(home.readyPosition.y + away.readyPosition.y, 900);
  assert.equal(home.attackPosition.x + away.attackPosition.x, 2280);
  assert.equal(home.attackPosition.y + away.attackPosition.y, 900);
}
assert.equal(getR1AttackConfigurations("AWAY").OH1.attackType, "RIGHT_LONG");
assert.equal(getR1AttackConfigurations("AWAY").OP.attackType, "LEFT_LONG");
assert.equal(getR1AttackConfigurations("HOME").OH1.attackType, "RIGHT_LONG");
assert.equal(getR1AttackConfigurations("HOME").OP.attackType, "LEFT_LONG");
const awayServeReceive = getR1AttackConfigurations("AWAY", R1_ATTACK_PHASES.SERVE_RECEIVE);
const homeServeReceive = getR1AttackConfigurations("HOME", R1_ATTACK_PHASES.SERVE_RECEIVE);
const officialLeftLong = DEFAULT_ATTACK_POSITIONS.entries.find((entry) =>
  entry.rotation === "R1" && entry.playerSlot === "OH1" && entry.attackType === ATTACK_TYPES.LEFT_LONG);
const awayCounterattack = getR1AttackConfigurations("AWAY", R1_ATTACK_PHASES.COUNTERATTACK);
assert.deepEqual(awayCounterattack.OP.readyPosition, officialLeftLong.readyPosition,
  "Scene Library 的 LEFT_LONG READY 不得被重新標成 RIGHT_LONG。");
assert.deepEqual(awayCounterattack.OP.attackPosition, officialLeftLong.attackPosition,
  "Scene Library 的 LEFT_LONG ATTACK 不得被重新標成 RIGHT_LONG。");
assert.ok(awayServeReceive.OP.attackPosition.y > awayServeReceive.OH1.attackPosition.y,
  "AWAY LEFT_LONG 必須在畫面下方、RIGHT_LONG 在上方。");
assert.ok(homeServeReceive.OP.attackPosition.y < homeServeReceive.OH1.attackPosition.y,
  "HOME LEFT_LONG 必須在畫面上方、RIGHT_LONG 在下方。");
for (const configurations of [awayServeReceive, homeServeReceive]) {
  assert.ok(Math.abs(configurations.MB1.attackPosition.y - 450) <= 5,
    "MIDDLE_QUICK 必須位於中央靠網。");
  assert.ok(configurations.OH2.attackPosition.x > configurations.MB1.attackPosition.x
    === (configurations === awayServeReceive),
  "BACK_CENTER_LONG 必須位於各隊後排中央。 ");
}
for (const team of ["HOME", "AWAY"]) {
  const receive = getR1AttackConfigurations(team, R1_ATTACK_PHASES.SERVE_RECEIVE);
  const counter = getR1AttackConfigurations(team, R1_ATTACK_PHASES.COUNTERATTACK);
  assert.equal(receive.OH1.attackRole, "BACK_LONG");
  assert.equal(receive.OP.attackRole, "LONG");
  assert.equal(counter.OH1.attackRole, "BACK_LONG");
  assert.equal(counter.OP.attackRole, "LONG");
  assert.equal(receive.OH1.attackType, "RIGHT_LONG");
  assert.equal(receive.OP.attackType, "LEFT_LONG");
  assert.equal(counter.OH1.attackType, "RIGHT_LONG");
  assert.equal(counter.OP.attackType, "LEFT_LONG");
  assert.deepEqual(counter.OH1.readyPosition, receive.OH1.readyPosition);
  assert.deepEqual(counter.OH1.attackPosition, receive.OH1.attackPosition);
  assert.deepEqual(counter.OP.readyPosition, receive.OP.readyPosition);
  assert.deepEqual(counter.OP.attackPosition, receive.OP.attackPosition);
}

const forced = createR1AttackPlan({ team: "AWAY", revision: 1,
  firstTouchPlayerId: "AWAY-S", firstTouchJob: "S",
  attackPhase: R1_ATTACK_PHASES.COUNTERATTACK });
const forcedConfig = getR1AttackConfigurations("AWAY", R1_ATTACK_PHASES.COUNTERATTACK).OH1;
const forcedChoice = selectR1AttackCandidate(forced, [{ id: "AWAY-OH1", team: "AWAY", job: "OH1",
  action: "IDLE", moveSpeed: 300, ...forcedConfig.attackPosition }], () => 0.99);
assert.equal(forced.setterJob, "OP");
assert.deepEqual(forced.candidates.map((entry) => entry.job), ["OH1"]);
assert.equal(forced.candidates[0].attackRole, "BACK_LONG");
assert.equal(forcedChoice.selected.job, "OH1");
const homeForced = createR1AttackPlan({ team: "HOME", revision: 1,
  firstTouchPlayerId: "HOME-S", firstTouchJob: "S",
  attackPhase: R1_ATTACK_PHASES.COUNTERATTACK });
assert.equal(homeForced.setterJob, "OP");
assert.deepEqual(homeForced.candidates.map((entry) => [entry.job, entry.attackRole]), [["OH1", "BACK_LONG"]]);

const impossible = createR1AttackPlan({ team: "AWAY", revision: 2,
  firstTouchPlayerId: "AWAY-MB2", firstTouchJob: "MB2" });
assert.equal(selectR1AttackCandidate(impossible, impossible.candidates.map((candidate) => ({
  id: `AWAY-${candidate.job}`, team: "AWAY", job: candidate.job,
  x: 2200, y: 900, moveSpeed: 1, action: "IDLE",
})), () => 0).selected, null, "沒有可行候選人時不得強制選人。");

function run(seed, fps = 60) {
  const simulator = new ContinuousRallySimulator({ seed, serveMode: "LEGACY_MANUAL" });
  simulator.launch({ x: 1820, y: 450 });
  let preparingSnapshot = null, secondTouchSnapshot = null;
  for (let frame = 0; frame < fps * 40 && simulator.status !== "ENDED"; frame += 1) {
    const snapshot = simulator.updateFrame(1 / fps);
    if (!preparingSnapshot && snapshot.attackPlan?.status === "PREPARING") preparingSnapshot = snapshot;
    if (!secondTouchSnapshot && snapshot.events.some((event) => event.type === "SECOND_TOUCH")) {
      secondTouchSnapshot = snapshot;
    }
  }
  return { snapshot: simulator.getSnapshot(), preparingSnapshot, secondTouchSnapshot };
}

const completedByJob = new Map();
for (const seed of [1, 2, 3, 4]) {
  const { snapshot, preparingSnapshot } = run(seed);
  assert.ok(preparingSnapshot, `Seed ${seed} 必須建立攻擊計畫。`);
  const planPlayers = preparingSnapshot.players.filter((player) =>
    player.team === preparingSnapshot.attackPlan.team && ATTACK_JOBS.includes(player.job));
  assert.equal(planPlayers.filter((player) => player.currentWork?.workType?.startsWith("PREPARE_")).length, 4,
    "四名攻擊手必須同步取得準備工作。");
  for (const player of planPlayers) {
    const candidate = preparingSnapshot.attackPlan.candidates.find((entry) => entry.job === player.job);
    assert.deepEqual(player.currentWork.target, candidate.readyPosition,
      `${player.job} 的工作目標必須直接使用正式 Attack Plan READY。`);
    assert.deepEqual({ x: player.targetX, y: player.targetY }, candidate.readyPosition,
      `${player.job} 的 Player Agent 目標必須與 Attack Plan READY 一致。`);
  }
  for (const selected of snapshot.events.filter((event) => event.type === "ATTACK_SELECTED")) {
    const expectedConfiguration = getR1AttackConfigurations(selected.team, selected.attackPhase)[selected.job];
    assert.equal(selected.attackType, expectedConfiguration.attackType);
    assert.equal(selected.attackRole, expectedConfiguration.attackRole);
    const touch = snapshot.events.find((event) => event.type === "THIRD_TOUCH"
      && event.playerId === selected.playerId && event.time >= selected.time);
    if (!touch) continue;
    const jump = snapshot.events.find((event) => event.type === "ATTACK_JUMP_STARTED"
      && event.playerId === selected.playerId && event.time >= selected.time);
    assert.ok(jump, `${selected.job} 必須真實跑位並起跳。`);
    const expected = expectedConfiguration.attackPosition;
    assert.ok(Math.hypot(jump.x - expected.x, jump.y - expected.y) < 1e-6,
      `${selected.job} 必須在自己的 ATTACK 位置起跳。`);
    completedByJob.set(selected.job, { seed, team: selected.team });
  }
  const createdPlans = snapshot.events.filter((event) => event.type === "ATTACK_PLAN_CREATED");
  assert.equal(createdPlans[0]?.attackPhase, R1_ATTACK_PHASES.SERVE_RECEIVE,
    "接發後第一次攻擊必須使用接發進攻分工。");
  assert.ok(createdPlans.slice(1).every((event) => event.attackPhase === R1_ATTACK_PHASES.COUNTERATTACK),
    "攻擊或攔網後的第一觸球必須建立防守反擊分工。");
}

const seed20261113 = run(20261113);
const firstPlanTeam = seed20261113.preparingSnapshot.attackPlan.team;
assert.equal(firstPlanTeam, "AWAY");
for (const job of ["OH1", "OP"]) {
  const candidate = seed20261113.preparingSnapshot.attackPlan.candidates.find((entry) => entry.job === job);
  const atPlan = seed20261113.preparingSnapshot.players.find((entry) => entry.team === firstPlanTeam && entry.job === job);
  const atSet = seed20261113.secondTouchSnapshot.players.find((entry) => entry.team === firstPlanTeam && entry.job === job);
  assert.deepEqual({ x: atSet.targetX, y: atSet.targetY }, candidate.readyPosition,
    `Seed 20261113：${job} 的移動目標必須維持正式 READY。`);
  assert.ok(Math.hypot(atSet.x - candidate.readyPosition.x, atSet.y - candidate.readyPosition.y)
    < Math.hypot(atPlan.x - candidate.readyPosition.x, atPlan.y - candidate.readyPosition.y),
  `Seed 20261113：${job} 必須以真實速度接近 READY，不強制瞬移到位。`);
}
assert.deepEqual(new Set(completedByJob.keys()), new Set(ATTACK_JOBS),
  "固定 Seed 1～4 必須涵蓋四種真實第三觸球。 ");

const deterministicA = run(2).snapshot.events.filter((event) => event.type === "ATTACK_SELECTED");
const deterministicB = run(2).snapshot.events.filter((event) => event.type === "ATTACK_SELECTED");
assert.deepEqual(deterministicA, deterministicB);
const seed2Plans = run(2).snapshot.events.filter((event) => event.type === "ATTACK_PLAN_CREATED");
assert.equal(seed2Plans[0].attackPhase, R1_ATTACK_PHASES.SERVE_RECEIVE);
assert.ok(seed2Plans.length > 1 && seed2Plans.slice(1)
  .every((event) => event.attackPhase === R1_ATTACK_PHASES.COUNTERATTACK),
"接發進攻後的所有防守反擊都必須使用 COUNTERATTACK 分工。 ");
const fpsEvents = [30, 60, 144].map((fps) => run(2, fps).snapshot.events
  .filter((event) => ["ATTACK_PLAN_CREATED", "ATTACK_SELECTED", "THIRD_TOUCH"].includes(event.type)));
assert.deepEqual(fpsEvents[0], fpsEvents[1]);
assert.deepEqual(fpsEvents[0], fpsEvents[2]);

console.log("PASS: four R1 attacks use shared READY/ATTACK movement, locked seeded selection, real SET flight and swept THIRD_TOUCH; HOME/AWAY mirrored; 30/60/144 FPS deterministic.");
