import assert from "node:assert/strict";
import { FormalMatchSession, FORMAL_MATCH_STATES } from
  "../src/simulator/formal-match-session.js";
import { FORMAL_RALLY_JOBS } from "../src/simulator/formal-rally-player-input.js";

function makeTeams(ability = 72) {
  const positions = { S: "S", OH1: "OH", OH2: "OH", MB1: "MB", MB2: "MB", OP: "OP" };
  return Object.fromEntries(["HOME", "AWAY"].map((team) => [team,
    FORMAL_RALLY_JOBS.map((job, index) => ({
      playerId: `${team}-${job}`, name: `${team} ${job}`, job, position: positions[job],
      abilities: { attack: ability, block: ability, set: ability,
        receive: ability, serve: ability },
      mood: index % 5 + 1, serveType: "一般", avatar: null,
      simulationOverrides: { attackConsistency: ability, morale: 30, serveType: "STANDING" },
    }))]));
}

function createControlledFactory(scorers) {
  let index = 0;
  const calls = [];
  const factory = (options) => {
    calls.push(Object.freeze({ ...options, rotations: Object.freeze({ ...options.rotations }) }));
    let status = "READY", result = null;
    return {
      start() { status = "RUNNING"; return this.getSnapshot(); },
      advance() {
        if (status !== "ENDED") {
          const scoringTeam = typeof scorers === "function" ? scorers(index, options) : scorers[index];
          index += 1;
          if (!scoringTeam) throw new Error(`缺少第 ${index} 球受控結果。`);
          result = Object.freeze({ reason: "CONTROLLED_TEST", scoringTeam, time: 0.1 });
          status = "ENDED";
        }
        return this.getSnapshot();
      },
      getSnapshot() { return Object.freeze({ status, simulationTime: status === "ENDED" ? 0.1 : 0 }); },
      getResult() { return result; },
      getEvents() { return Object.freeze(result ? [Object.freeze({ type: "RALLY_ENDED", ...result })] : []); },
    };
  };
  factory.calls = calls;
  return factory;
}

function finishControlledMatch(scorers, seed = 11) {
  const factory = createControlledFactory(scorers);
  const match = new FormalMatchSession({ teams: makeTeams(), seed, rallyAdapterFactory: factory });
  match.start();
  for (let step = 0; step < 1000 && !match.isEnded(); step += 1) match.advance(1 / 60);
  assert.equal(match.status, FORMAL_MATCH_STATES.MATCH_ENDED);
  return { match, factory, snapshot: match.getSnapshot() };
}

const twoZero = finishControlledMatch([...Array(50)].map(() => "HOME"), 101);
assert.deepEqual(twoZero.snapshot.setsWon, { HOME: 2, AWAY: 0 });
assert.deepEqual(twoZero.snapshot.setResults.map((set) => set.score), [
  { HOME: 25, AWAY: 0 }, { HOME: 25, AWAY: 0 },
]);
assert.equal(twoZero.snapshot.setResults[1].initialServingTeam,
  twoZero.snapshot.setResults[0].initialServingTeam === "HOME" ? "AWAY" : "HOME",
  "第二局必須由第一局相反隊伍先發球。");
assert.equal(twoZero.snapshot.rallyNumber, 50);
const settledCount = twoZero.snapshot.events.filter((event) => event.type === "RALLY_SETTLED").length;
assert.equal(settledCount, 50, "每個 Rally 必須且只能結算一次。");
const endedSnapshot = twoZero.match.getSnapshot();
twoZero.match.advance(10);
assert.deepEqual(twoZero.match.getSnapshot(), endedSnapshot, "Match 結束後不得再建立 Rally。");

const twoOneScorers = [
  ...Array(25).fill("HOME"), ...Array(25).fill("AWAY"), ...Array(15).fill("HOME"),
];
const twoOne = finishControlledMatch(twoOneScorers, 2026);
assert.deepEqual(twoOne.snapshot.setsWon, { HOME: 2, AWAY: 1 });
assert.deepEqual(twoOne.snapshot.setResults.map((set) => set.score), [
  { HOME: 25, AWAY: 0 }, { HOME: 0, AWAY: 25 }, { HOME: 15, AWAY: 0 },
]);
const setStarts = twoOne.snapshot.events.filter((event) => event.type === "SET_STARTED");
assert.equal(setStarts.length, 3);
assert.ok(["HOME", "AWAY"].includes(setStarts[2].servingTeam),
  "第三局必須以 Match seeded RNG 重新抽選發球方。");

const deuceScores = [];
for (let index = 0; index < 24; index += 1) deuceScores.push("HOME", "AWAY");
deuceScores.push("HOME", "HOME", ...Array(25).fill("HOME"));
const deuce = finishControlledMatch(deuceScores, 303);
assert.deepEqual(deuce.snapshot.setResults[0].score, { HOME: 26, AWAY: 24 },
  "25 分後仍須領先兩分才結束第一局。");

const rotationFactory = createControlledFactory((index, options) => index === 0
  ? (options.servingTeam === "HOME" ? "AWAY" : "HOME") : options.servingTeam);
const rotationMatch = new FormalMatchSession({ teams: makeTeams(), seed: 404,
  rallyAdapterFactory: rotationFactory });
rotationMatch.start();
const initialServer = rotationMatch.servingTeam;
const receiver = initialServer === "HOME" ? "AWAY" : "HOME";
rotationMatch.advance(1 / 60);
assert.equal(rotationMatch.servingTeam, receiver);
assert.equal(rotationMatch.rotations[receiver], "R6", "接發方得分時必須輪轉一次。");
const rotationsAfterSideOut = { ...rotationMatch.rotations };
rotationMatch.advance(1 / 60);
rotationMatch.advance(1 / 60);
assert.deepEqual(rotationMatch.rotations, rotationsAfterSideOut, "發球方連續得分不得輪轉。");

const repeatA = finishControlledMatch(twoOneScorers, 777).snapshot;
const repeatB = finishControlledMatch(twoOneScorers, 777).snapshot;
assert.deepEqual(repeatA.events, repeatB.events);
assert.deepEqual(repeatA.matchResult, repeatB.matchResult);
assert.deepEqual(repeatA.events.filter((event) => event.type === "RALLY_STARTED").map((event) => event.seed),
  repeatB.events.filter((event) => event.type === "RALLY_STARTED").map((event) => event.seed));

function runRealMatch(seed) {
  const match = new FormalMatchSession({ teams: makeTeams(78), seed });
  match.start();
  for (let step = 0; step < 200000 && !match.isEnded()
    && match.status !== FORMAL_MATCH_STATES.ABORTED; step += 1) match.advance(0.25);
  return match;
}

const realMatch = runRealMatch(3152026);
assert.equal(realMatch.status, FORMAL_MATCH_STATES.MATCH_ENDED,
  `真實 FormalRallyAdapter 完整比賽必須結束：${JSON.stringify(realMatch.fault)}`);
assert.ok(["HOME", "AWAY"].includes(realMatch.getMatchResult()?.winner));
assert.ok(realMatch.rallyResults.length >= 30);
assert.ok(realMatch.rallyResults.every((rally) => rally.events.some((event) => event.type === "RALLY_ENDED")));
assert.equal(realMatch.getRallySnapshot().playerInputMode, "EXTERNAL");
assert.ok(realMatch.getRallySnapshot().players.some((player) => player.attack === 78));
const realRepeat = runRealMatch(3152026);
assert.deepEqual(realMatch.getMatchResult(), realRepeat.getMatchResult());
assert.deepEqual(realMatch.rallyResults.map((rally) => ({ seed: rally.seed,
  scoringTeam: rally.scoringTeam, reason: rally.reason, score: rally.score,
  rotationsAfter: rally.rotationsAfter })), realRepeat.rallyResults.map((rally) => ({ seed: rally.seed,
  scoringTeam: rally.scoringTeam, reason: rally.reason, score: rally.score,
  rotationsAfter: rally.rotationsAfter })));

const hangingFactory = () => ({
  start() { return this.getSnapshot(); },
  advance() { return Object.freeze({ status: "RUNNING", simulationTime: 1 }); },
  getSnapshot() { return Object.freeze({ status: "RUNNING", simulationTime: 0 }); },
  getResult() { return null; }, getEvents() { return Object.freeze([]); },
});
const aborted = new FormalMatchSession({ teams: makeTeams(), seed: 9,
  rallyAdapterFactory: hangingFactory, maximumRallySimulationTime: 0.5 });
aborted.start();
aborted.advance(1);
assert.equal(aborted.status, FORMAL_MATCH_STATES.ABORTED);
assert.equal(aborted.fault.code, "RALLY_TIME_LIMIT");
assert.deepEqual(aborted.setScores, { HOME: 0, AWAY: 0 }, "安全中止不得偽造得分。");

assert.throws(() => new FormalMatchSession({ teams: null }));
assert.throws(() => new FormalMatchSession({ teams: makeTeams(), seed: -1 }));

console.log(JSON.stringify({ controlled2to0: twoZero.snapshot.matchResult,
  controlled2to1: twoOne.snapshot.matchResult,
  realMatch: realMatch.getMatchResult(), realRallies: realMatch.rallyResults.length }, null, 2));
console.log("Formal Match Session tests passed.");
