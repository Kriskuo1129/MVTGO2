import assert from "node:assert/strict";
import { FormalRallyAdapter } from "../src/simulator/formal-rally-adapter.js";
import { FORMAL_RALLY_JOBS, validateFormalRallyTeams } from
  "../src/simulator/formal-rally-player-input.js";
import { RALLY_ROTATIONS } from "../src/simulator/rotation-config.js";

const originalPositions = Object.freeze({ S: "OH", OH1: "S", OH2: "MB",
  MB1: "OP", MB2: "OH", OP: "MB" });

function makeTeams({ homeAbility = 72, awayAbility = 68 } = {}) {
  return Object.fromEntries(["HOME", "AWAY"].map((team) => [team,
    FORMAL_RALLY_JOBS.map((job, index) => {
      const ability = team === "HOME" ? homeAbility : awayAbility;
      return {
        playerId: `${team}-${job}`, name: `${team} ${job}`, job,
        position: originalPositions[job],
        abilities: { attack: ability, block: Math.max(1, ability - 1),
          set: Math.max(1, ability - 2), receive: Math.max(1, ability - 3),
          serve: Math.max(1, ability - 4) },
        mood: index % 5 + 1,
        serveType: index % 3 === 0 ? "一般" : index % 3 === 1 ? "跳飄" : "跳發",
        avatar: index % 2 ? null : `${team}-${job}.png`,
        simulationOverrides: { attackConsistency: Math.max(1, ability - 5),
          morale: 30 + index, serveType: index % 2 ? "JUMP" : "STANDING" },
      };
    })]));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function run({ fps = 60, seed = 20261117, rotations = { HOME: "R1", AWAY: "R1" },
  servingTeam = "HOME", teams = makeTeams() } = {}) {
  const adapter = new FormalRallyAdapter({ teams, rotations, servingTeam, seed });
  adapter.start();
  for (let frame = 0; frame < fps * 60 && adapter.getSnapshot().status !== "ENDED"; frame += 1) {
    adapter.advance(1 / fps);
  }
  return { adapter, snapshot: adapter.getSnapshot() };
}

const source = makeTeams();
const sourceBefore = JSON.stringify(source);
const validated = validateFormalRallyTeams(source);
assert.equal(validated.teams.HOME.length, 6);
assert.equal(JSON.stringify(source), sourceBefore, "驗證不得修改呼叫端資料。");
assert.ok(Object.isFrozen(validated.teams.HOME[0].abilities));

const first = new FormalRallyAdapter({ teams: source, seed: 20261117 });
source.HOME[0].abilities.attack = 1;
first.start();
let snapshot = first.getSnapshot();
assert.equal(snapshot.playerInputMode, "EXTERNAL");
const externalS = snapshot.players.find((player) => player.id === "HOME-S");
assert.equal(externalS.attack, 72, "Adapter 必須使用已驗證快照，不受呼叫端後續修改影響。");
assert.equal(externalS.blockAbility, 71);
assert.equal(externalS.setAbility, 70);
assert.equal(externalS.receiveAbility, 69);
assert.equal(externalS.serveAbility, 68);
assert.equal(externalS.position, "OH", "原始 position 與場上 Job 必須獨立。");
assert.equal(externalS.job, "S");
assert.equal(externalS.formalServeType, "一般");
assert.equal(externalS.serveType, "STANDING");

for (const rotation of RALLY_ROTATIONS) {
  const adapter = new FormalRallyAdapter({ teams: makeTeams(),
    rotations: { HOME: rotation, AWAY: rotation }, servingTeam: "HOME", seed: 7 });
  const jobs = adapter.getSnapshot().players.filter((player) => player.team === "HOME")
    .map((player) => player.job).sort();
  assert.deepEqual(jobs, [...FORMAL_RALLY_JOBS].sort(), `${rotation} 必須保持完整 Job 對應。`);
  assert.deepEqual(adapter.getSnapshot().rotations, { HOME: rotation, AWAY: rotation });
}

const run30 = run({ fps: 30 }), run60 = run({ fps: 60 }), run144 = run({ fps: 144 });
for (const result of [run30, run60, run144]) {
  assert.equal(result.snapshot.status, "ENDED", "正式 Rally 必須能自然結束。");
  assert.ok(result.adapter.getResult()?.reason);
  assert.ok(["HOME", "AWAY"].includes(result.adapter.getResult()?.scoringTeam));
  assert.deepEqual(result.adapter.getEvents(), result.snapshot.events);
}
assert.deepEqual(run30.snapshot.events, run60.snapshot.events);
assert.deepEqual(run30.snapshot.events, run144.snapshot.events);
assert.deepEqual(run30.adapter.getResult(), run60.adapter.getResult());
assert.deepEqual(run30.adapter.getResult(), run144.adapter.getResult());
const repeated = run({ fps: 60 });
assert.deepEqual(run60.snapshot.events, repeated.snapshot.events, "相同輸入與 Seed 必須可重現。");

const frozenInput = deepFreeze(makeTeams());
const frozenBefore = JSON.stringify(frozenInput);
const frozenRun = run({ teams: frozenInput, seed: 88 });
assert.equal(frozenRun.snapshot.status, "ENDED");
assert.equal(JSON.stringify(frozenInput), frozenBefore, "引擎不得修改呼叫端球員輸入。");

const invalidCases = [
  () => new FormalRallyAdapter(),
  () => new FormalRallyAdapter({ teams: { HOME: makeTeams().HOME, AWAY: [] } }),
  () => {
    const teams = makeTeams(); teams.AWAY[0].playerId = teams.HOME[0].playerId;
    return new FormalRallyAdapter({ teams });
  },
  () => {
    const teams = makeTeams(); teams.HOME[0].job = teams.HOME[1].job;
    return new FormalRallyAdapter({ teams });
  },
  () => {
    const teams = makeTeams(); teams.HOME[0].abilities.receive = 100;
    return new FormalRallyAdapter({ teams });
  },
  () => {
    const teams = makeTeams(); delete teams.HOME[0].simulationOverrides;
    return new FormalRallyAdapter({ teams });
  },
];
for (const createInvalid of invalidCases) assert.throws(createInvalid);

const legacyModule = await import("../src/simulator/continuous-rally-simulator.js");
const legacy = new legacyModule.ContinuousRallySimulator({ seed: 2, serveMode: "LEGACY_MANUAL" });
assert.equal(legacy.getSnapshot().playerInputMode, "LEGACY_TEST");

console.log("Formal Rally Adapter tests passed.");
