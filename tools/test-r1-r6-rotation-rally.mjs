import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { ContinuousRallySession } from "../src/simulator/continuous-rally-session.js";
import { DEFAULT_CONTINUOUS_FORMATION_LIBRARY,
  getContinuousRotationFormation } from "../src/simulator/continuous-rally-formation.js";
import { getR1AttackConfigurations, R1_ATTACK_PHASES } from "../src/simulator/r1-attack-plan.js";
import { createR1BlockPlan, getR1BlockJobs } from "../src/simulator/r1-job-coordination.js";
import { getRotationConfig, nextRallyRotation, RALLY_ROTATIONS } from "../src/simulator/rotation-config.js";

const EXPECTED = Object.freeze({
  R1: { server: "S", receive: ["OH1", "OH2", "MB2"], defense: ["S", "OH2", "MB2"],
    attacks: { OH1: "RIGHT_LONG", MB1: "MIDDLE_QUICK", OP: "LEFT_LONG", OH2: "BACK_CENTER_LONG" },
    alternate: ["OP", "OH1", "RIGHT_LONG"] },
  R6: { server: "OH1", receive: ["OH1", "OH2", "MB2"], defense: ["S", "OH1", "MB2"],
    attacks: { OH1: "BACK_CENTER_LONG", MB1: "MIDDLE_QUICK", OP: "RIGHT_LONG", OH2: "LEFT_LONG" },
    alternate: ["OP", "OH2", "LEFT_LONG"] },
  R5: { server: "MB1", receive: ["OH1", "OH2", "MB1"], defense: ["S", "OH1", "MB1"],
    attacks: { OH1: "BACK_CENTER_LONG", OP: "RIGHT_LONG", OH2: "LEFT_LONG", MB2: "MIDDLE_QUICK" },
    alternate: ["OP", "OH2", "LEFT_LONG"] },
  R4: { server: "OP", receive: ["OH1", "OH2", "MB1"], defense: ["OH1", "MB1", "OP"],
    attacks: { OH1: "BACK_CENTER_LONG", OP: "BACK_RIGHT_LONG", OH2: "LEFT_LONG", MB2: "MIDDLE_QUICK" },
    alternate: ["OP", "OH2", "LEFT_LONG"] },
  R3: { server: "OH2", receive: ["OH1", "OH2", "MB1"], defense: ["MB1", "OP", "OH2"],
    attacks: { OH1: "LEFT_LONG", OP: "BACK_RIGHT_LONG", OH2: "BACK_CENTER_LONG", MB2: "MIDDLE_QUICK" },
    alternate: ["OP", "OH1", "LEFT_LONG"] },
  R2: { server: "MB2", receive: ["OH1", "OH2", "MB2"], defense: ["OP", "OH2", "MB2"],
    attacks: { OH1: "LEFT_LONG", MB1: "MIDDLE_QUICK", OP: "BACK_RIGHT_LONG", OH2: "BACK_CENTER_LONG" },
    alternate: ["OP", "OH1", "LEFT_LONG"] },
});

assert.deepEqual(RALLY_ROTATIONS, ["R1", "R6", "R5", "R4", "R3", "R2"]);
assert.equal(nextRallyRotation("R2"), "R1");

for (const rotation of RALLY_ROTATIONS) {
  const config = getRotationConfig(rotation), expected = EXPECTED[rotation];
  assert.equal(config.serverJob, expected.server);
  assert.deepEqual([...config.serveReceive], expected.receive);
  assert.deepEqual([...config.defenseReceive], expected.defense);
  assert.deepEqual(Object.fromEntries(Object.entries(config.attacks).filter(([, type]) => type)), expected.attacks);
  assert.deepEqual([config.alternateSet.setterJob, config.alternateSet.targetJob,
    config.alternateSet.attackType], expected.alternate);
  for (const jobs of Object.values(config.blocks)) {
    assert.ok(jobs.every((job) => config.front.includes(job)), `${rotation} 只能由前排 Job 攔網。`);
  }

  const away = getR1AttackConfigurations("AWAY", R1_ATTACK_PHASES.SERVE_RECEIVE, rotation);
  const home = getR1AttackConfigurations("HOME", R1_ATTACK_PHASES.SERVE_RECEIVE, rotation);
  for (const [job, type] of Object.entries(expected.attacks)) {
    assert.equal(away[job].attackType, type);
    assert.equal(home[job].attackType, type);
    assert.equal(home[job].readyPosition.x + away[job].readyPosition.x, 2280);
    assert.equal(home[job].readyPosition.y + away[job].readyPosition.y, 900);
    assert.equal(home[job].attackPosition.x + away[job].attackPosition.x, 2280);
    assert.equal(home[job].attackPosition.y + away[job].attackPosition.y, 900);
  }

  for (const attackType of Object.keys(config.blocks)) {
    assert.deepEqual(getR1BlockJobs(attackType, rotation), config.blocks[attackType]);
    const block = createR1BlockPlan("AWAY", attackType, 450, null, rotation);
    for (const job of config.blocks[attackType]) {
      assert.equal(block.assignments.find((entry) => entry.job === job).moveEnabled, true);
    }
  }

  for (const servingTeam of ["HOME", "AWAY"]) {
    const formal = new ContinuousRallySimulator({ seed: 4,
      formationLibrary: DEFAULT_CONTINUOUS_FORMATION_LIBRARY,
      rotations: { HOME: rotation, AWAY: rotation }, servingTeam });
    formal.launch();
    assert.equal(formal.player(formal.serverPlayerId).job, expected.server);
    assert.equal(formal.player(formal.serverPlayerId).team, servingTeam);
    assert.equal(formal.players.length, 12);
  }
  const source = getContinuousRotationFormation(DEFAULT_CONTINUOUS_FORMATION_LIBRARY, rotation);
  assert.equal(source.profiles.SERVE.length, 6);
}

function run(rotation, seed, fps = 60) {
  const simulator = new ContinuousRallySimulator({ seed, serveMode: "LEGACY_MANUAL",
    formationLibrary: DEFAULT_CONTINUOUS_FORMATION_LIBRARY,
    rotations: { HOME: rotation, AWAY: rotation } });
  simulator.launch({ x: 1820, y: 450 });
  for (let frame = 0; frame < fps * 45 && simulator.status !== "ENDED"; frame += 1) {
    simulator.updateFrame(1 / fps);
  }
  assert.equal(simulator.status, "ENDED", `${rotation} Seed ${seed} Rally 必須安全結束。`);
  assert.ok(simulator.events.some((event) => event.type === "RECEIVE_TOUCH"));
  return simulator.getSnapshot();
}

for (const rotation of RALLY_ROTATIONS) {
  const expectedTypes = new Set(Object.values(EXPECTED[rotation].attacks));
  const actualTypes = new Set();
  for (const seed of [1, 2, 3, 4, 5]) {
    const snapshot = run(rotation, seed);
    for (const touch of snapshot.events.filter((event) => event.type === "RECEIVE_TOUCH")) {
      const phase = snapshot.events.slice(0, snapshot.events.indexOf(touch) + 1).reverse()
        .find((event) => event.type === "RECEIVE_PHASE_STARTED" && event.team === touch.team);
      const eligible = phase?.incomingKind === "ATTACK" ? EXPECTED[rotation].defense : EXPECTED[rotation].receive;
      assert.ok(eligible.includes(touch.job), `${rotation} ${phase?.incomingKind} 不得由 ${touch.job} 接第一球。`);
    }
    for (const block of snapshot.events.filter((event) => event.type === "BLOCK_ASSIGN")) {
      assert.deepEqual(block.jobs, getRotationConfig(block.rotation).blocks[block.attackType]);
    }
    snapshot.events.filter((event) => event.type === "THIRD_TOUCH")
      .forEach((event) => actualTypes.add(event.attackType));
  }
  assert.deepEqual(actualTypes, expectedTypes,
    `${rotation} 必須以真實移動、起跳及 THIRD_TOUCH 涵蓋全部攻擊類型。`);

  const core = (snapshot) => snapshot.events.filter((event) =>
    ["RECEIVE_TOUCH", "SECOND_TOUCH", "THIRD_TOUCH", "BLOCK_CONTACT", "BLOCK_RESULT",
      "RALLY_RESULT_LOCKED"].includes(event.type));
  assert.deepEqual(core(run(rotation, 1, 30)), core(run(rotation, 1, 60)));
  assert.deepEqual(core(run(rotation, 1, 144)), core(run(rotation, 1, 60)));
}

for (const [rotation, seed] of [["R1", 5], ["R6", 2], ["R5", 2]]) {
  const snapshot = run(rotation, seed);
  const sTouch = snapshot.events.find((event) => event.type === "RECEIVE_TOUCH" && event.job === "S");
  assert.ok(sTouch, `${rotation} Seed ${seed} 必須包含 S 真實第一觸球。`);
  const selection = snapshot.events.find((event) => event.type === "ATTACK_SELECTED"
    && event.time >= sTouch.time && event.forced);
  const alternate = getRotationConfig(rotation).alternateSet;
  assert.equal(selection.setterJob, alternate.setterJob);
  assert.equal(selection.job, alternate.targetJob);
  assert.equal(selection.attackType, alternate.attackType);
}

const session = new ContinuousRallySession({ simulator: new ContinuousRallySimulator({
  formationLibrary: DEFAULT_CONTINUOUS_FORMATION_LIBRARY }), baseSeed: 31, intermissionDuration: 0 });
session.start({ firstServingTeam: "HOME" });
let expectedRotations = { HOME: "R1", AWAY: "R1" }, previousResultCount = 0;
for (let frame = 0; frame < 60 * 180 && session.getSnapshot().session.results.length < 8; frame += 1) {
  const beforeServing = session.servingTeam;
  const snapshot = session.updateFrame(1 / 60);
  if (snapshot.session.results.length > previousResultCount) {
    const result = snapshot.session.results.at(-1);
    if (result.scoringTeam !== beforeServing) {
      expectedRotations[result.scoringTeam] = nextRallyRotation(expectedRotations[result.scoringTeam]);
    }
    assert.deepEqual(snapshot.session.rotations, expectedRotations);
    previousResultCount = snapshot.session.results.length;
  }
}
assert.ok(previousResultCount >= 8, "連續 Session 必須完成至少八個真實 Rally 並套用 side-out 輪轉。 ");

console.log("PASS: R1-R6 data-driven serve/receive/attack/block behavior; real BACK_RIGHT_LONG; actual alternate set; HOME/AWAY transform; side-out rotation; 30/60/144 FPS deterministic.");
