import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { ATTACK_TYPES } from "../src/simulator/attack-positions.js";
import { createR1BlockPlan, getR1BlockJobs } from "../src/simulator/r1-job-coordination.js";
import { getR1AttackConfigurations, R1_ATTACK_PHASES } from "../src/simulator/r1-attack-plan.js";
import { createBlockRebound, detectSweptBlockContact, R1_BLOCK_PHYSICS_V1 } from "../src/simulator/r1-block.js";

assert.deepEqual(getR1BlockJobs(ATTACK_TYPES.LEFT_LONG), ["OH1", "MB1"]);
assert.deepEqual(getR1BlockJobs(ATTACK_TYPES.RIGHT_LONG), ["MB1", "OP"]);
assert.deepEqual(getR1BlockJobs(ATTACK_TYPES.MIDDLE_QUICK), ["MB1"]);
assert.deepEqual(getR1BlockJobs(ATTACK_TYPES.BACK_CENTER_LONG), ["MB1"]);
assert.deepEqual(getR1BlockJobs(ATTACK_TYPES.BACK_RIGHT_LONG), ["MB1", "OP"]);

for (const type of Object.values(ATTACK_TYPES)) {
  const home = createR1BlockPlan("HOME", type, 450);
  const away = createR1BlockPlan("AWAY", type, 450);
  for (const job of getR1BlockJobs(type)) {
    const h = home.assignments.find((entry) => entry.job === job).target;
    const a = away.assignments.find((entry) => entry.job === job).target;
    assert.equal(h.x + a.x, 2280);
    assert.equal(h.y, a.y);
  }
}
for (const attackingTeam of ["HOME", "AWAY"]) {
  const blockingTeam = attackingTeam === "HOME" ? "AWAY" : "HOME";
  const configurations = getR1AttackConfigurations(attackingTeam, R1_ATTACK_PHASES.SERVE_RECEIVE);
  for (const job of ["OH1", "OP"]) {
    const attack = configurations[job];
    const plan = createR1BlockPlan(blockingTeam, attack.attackType, attack.attackPosition.y);
    const mb1 = plan.assignments.find((entry) => entry.job === "MB1").target;
    const outsideJob = attack.attackType === ATTACK_TYPES.LEFT_LONG ? "OH1" : "OP";
    const outside = plan.assignments.find((entry) => entry.job === outsideJob).target;
    assert.ok(Math.abs(mb1.y - 450) < Math.abs(outside.y - 450),
      `${attackingTeam} ${attack.attackType}：MB1 必須比 ${outsideJob} 更靠場中。`);
  }
}
for (const blockingTeam of ["HOME", "AWAY"]) {
  const laneY = blockingTeam === "HOME" ? 240 : 660;
  const plan = createR1BlockPlan(blockingTeam, ATTACK_TYPES.BACK_RIGHT_LONG, laneY);
  const mb1 = plan.assignments.find((entry) => entry.job === "MB1").target;
  const op = plan.assignments.find((entry) => entry.job === "OP").target;
  assert.ok(Math.abs(mb1.y - 450) < Math.abs(op.y - 450),
    `${blockingTeam} BACK_RIGHT_LONG：MB1 必須位於內側。`);
}

const contact = detectSweptBlockContact({
  previousBall: { x: 1170, y: 450, height: 210 },
  currentBall: { x: 1120, y: 450, height: 210 },
  previousPlayer: { x: 1210, y: 450, blockJumpHeight: 65, blockJumpStarted: true },
  currentPlayer: { x: 1210, y: 450, blockJumpHeight: 65, blockJumpStarted: true },
  blockingTeam: "AWAY",
});
assert.equal(contact.contacted, true, "攔網必須由固定步進內的真實掃掠重疊產生。 ");
const miss = detectSweptBlockContact({
  previousBall: { x: 1170, y: 650, height: 210 }, currentBall: { x: 1120, y: 650, height: 210 },
  previousPlayer: { x: 1210, y: 450, blockJumpHeight: 65, blockJumpStarted: true },
  currentPlayer: { x: 1210, y: 450, blockJumpHeight: 65, blockJumpStarted: true }, blockingTeam: "AWAY",
});
assert.equal(miss.contacted, false);
const stuff = createBlockRebound({ contact: { normalizedDistance: 0.2 },
  incomingVelocity: { x: -1000, y: 100, height: -200 }, attackingTeam: "AWAY" });
const touch = createBlockRebound({ contact: { normalizedDistance: 0.95 },
  incomingVelocity: { x: -1000, y: 100, height: -200 }, attackingTeam: "AWAY" });
assert.equal(stuff.result, "STUFF_BLOCK");
assert.ok(stuff.velocity.x > 0, "攔死球必須反彈回 AWAY 攻擊方。 ");
assert.equal(touch.result, "BLOCK_TOUCH");
assert.ok(touch.velocity.x < 0, "攔網觸球必須減速進入 HOME 防守方。 ");
assert.ok(Math.abs(touch.velocity.x) < 1000);

function run(seed, fps) {
  const simulator = new ContinuousRallySimulator({ seed, serveMode: "LEGACY_MANUAL" });
  simulator.launch({ x: 1820, y: 450 });
  const previous = new Map(simulator.players.map((player) => [player.id, { x: player.x, y: player.y }]));
  for (let frame = 0; frame < fps * 45 && simulator.status !== "ENDED"; frame += 1) {
    const snapshot = simulator.updateFrame(1 / fps);
    for (const player of snapshot.players) {
      const old = previous.get(player.id);
      assert.ok(Math.hypot(player.x - old.x, player.y - old.y) <= player.moveSpeed / 30 + 1e-6,
        "攔網工作不得造成球員瞬移。 ");
      previous.set(player.id, { x: player.x, y: player.y });
    }
  }
  return simulator.getSnapshot();
}

const stuffSnapshot = run(161, 60);
const stuffIndex = stuffSnapshot.events.findIndex((event) => event.type === "BLOCK_RESULT"
  && event.result === "STUFF_BLOCK");
assert.ok(stuffIndex > 0, "正式場地鏡像下 Seed 161 必須包含真實攔死後接球案例。 ");
const stuffContact = stuffSnapshot.events[stuffIndex - 1];
assert.equal(stuffContact.type, "BLOCK_CONTACT");
const stuffResult = stuffSnapshot.events[stuffIndex];
const receiveAfterStuff = stuffSnapshot.events.slice(stuffIndex + 1)
  .find((event) => event.type === "RECEIVE_TOUCH" && event.team === stuffResult.receivingTeam);
assert.equal(receiveAfterStuff?.touchNumber, 1, "攔網觸球不得消耗攻擊方後續一般觸球額度。 ");

const touchSnapshot = run(1, 60);
assert.ok(touchSnapshot.events.some((event) => event.type === "BLOCK_RESULT"
  && event.result === "BLOCK_TOUCH"), "Seed 1 必須包含攔網觸球減速案例。 ");
assert.ok(touchSnapshot.events.some((event) => event.type === "BLOCK_ASSIGN"));
assert.ok(touchSnapshot.events.some((event) => event.type === "BLOCK_READY"));
assert.ok(touchSnapshot.events.some((event) => event.type === "BLOCK_JUMP"));

const coreEvents = (snapshot) => snapshot.events.filter((event) => event.type.startsWith("BLOCK_"))
  .map(({ type, time, team, job, playerId, result, reason, attackType }) =>
    ({ type, time, team, job, playerId, result, reason, attackType }));
assert.deepEqual(coreEvents(run(161, 30)), coreEvents(run(161, 60)));
assert.deepEqual(coreEvents(run(161, 144)), coreEvents(run(161, 60)));

console.log(`PASS: R1 block responsibility; real movement/jump/swept contact; stuff/touch continuations; no touch-count consumption; 30/60/144 FPS. Peak=${R1_BLOCK_PHYSICS_V1.maximumJumpHeight}`);
