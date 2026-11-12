import assert from "node:assert/strict";
import { ContinuousRallySimulator } from "../src/simulator/continuous-rally-simulator.js";
import { ContinuousRallySession } from "../src/simulator/continuous-rally-session.js";

function run({ fps = 60, baseSeed = 41, rallies = 12 } = {}) {
  const session = new ContinuousRallySession({ simulator: new ContinuousRallySimulator(),
    baseSeed, intermissionDuration: 0.12 });
  session.start({ firstServingTeam: "HOME", serveType: "STANDING", serveAbility: 68 });
  let guard = 0;
  while (session.results.length < rallies && guard < fps * 600) {
    session.updateFrame(1 / fps); guard += 1;
  }
  assert.equal(session.results.length, rallies);
  session.stop();
  return session;
}

const first = run();
assert.equal(first.scores.HOME + first.scores.AWAY, first.results.length,
  "每個 Rally 必須恰好增加一分。");
for (let index = 1; index < first.results.length; index += 1) {
  assert.equal(first.results[index].servingTeam, first.results[index - 1].scoringTeam,
    "下一球發球方必須是上一球得分方。");
}
assert.deepEqual(new Set(first.results.map((result) => result.scoringTeam)), new Set(["HOME", "AWAY"]));
assert.ok(new Set(first.results.map((result) => result.reason)).size >= 2);
assert.deepEqual(first.results.map((result) => result.seed),
  first.results.map((_, index) => first.seedForRally(index + 1)));

const repeated = run();
assert.deepEqual(repeated.results, first.results, "相同初始 Seed 的整段連續測試必須可重現。");
assert.deepEqual(repeated.scores, first.scores);
const fpsRuns = [30, 60, 144].map((fps) => run({ fps }));
assert.deepEqual(fpsRuns.map((session) => session.results),
  [fpsRuns[0].results, fpsRuns[0].results, fpsRuns[0].results]);
assert.deepEqual(fpsRuns.map((session) => session.scores),
  [fpsRuns[0].scores, fpsRuns[0].scores, fpsRuns[0].scores]);

const restart = run({ rallies: 3 });
restart.restart({ firstServingTeam: "AWAY", serveType: "JUMP", serveAbility: 85 });
assert.deepEqual(restart.scores, { HOME: 0, AWAY: 0 });
assert.equal(restart.rallyNumber, 1);
assert.equal(restart.servingTeam, "AWAY");
assert.equal(restart.simulator.ballFlightId, 0, "新 Rally 準備階段不可殘留上一球 flight ID。");
assert.equal(restart.simulator.events.some((event) => ["RECEIVE_TOUCH", "SECOND_TOUCH", "THIRD_TOUCH"].includes(event.type)), false);
restart.stop();
assert.equal(restart.active, false);
restart.resume();
assert.equal(restart.active, true, "暫停後必須能繼續同一個 Session。");

console.log("PASS: 12+ sequential rallies; exactly-once scoring; scorer serves next; deterministic seed sequence; HOME/AWAY service ownership; 30/60/144 FPS; clean restart state.");
