import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createFormalMatchTestTeams, FORMAL_MATCH_DEMO_SEED } from
  "../src/simulator/formal-match-test-data.js";
import { FormalRallyAdapter } from "../src/simulator/formal-rally-adapter.js";
import { advanceBallSpinAngle, isBallSpinPhase, isNetFinished,
  resolveActualBallSpeed, resolveBallFlightSegmentKey, resolveBallSpinProfile,
  resolveBallSpinRate, resolveDisplayedSpeed } from
  "../src/simulator/formal-match-renderer.js";
import { createMatchSeedSource, createRandomMatchSeed } from
  "../src/simulator/match-seed.js";
import { FORMAL_MATCH_VISUALS } from
  "../src/simulator/config/formal-match-renderer-config.js";
import { resolveImpactLevel } from
  "../src/simulator/config/formal-match-renderer-config.js";
import { createFormalLineupInput, applyFormalStartingLineup } from
  "../src/simulator/formal-lineup-adapter.js";
import { getPlayerAvatarPresentation, PLAYER_POSITION_AVATAR_COLORS } from
  "../src/display/player-avatar.js";
import { FormalMatchRoster } from "../src/simulator/formal-match-roster.js";

const teams = createFormalMatchTestTeams();
assert.equal(teams.HOME.players.length, 12);
assert.equal(teams.AWAY.players.length, 6);
assert.equal(new Set(teams.HOME.players.map((player) => player.playerId)).size, 12);
assert.deepEqual(Object.keys(teams.HOME.starters).sort(), ["MB1", "MB2", "OH1", "OH2", "OP", "S"]);
teams.HOME.players[0].abilities.set = 1;
assert.notEqual(createFormalMatchTestTeams().HOME.players[0].abilities.set, 1,
  "測試名單 factory 不得讓 Match 修改共用資料。 ");

const lineupTeams = createFormalMatchTestTeams();
const lineupInput = createFormalLineupInput(lineupTeams);
assert.equal(lineupInput.homePlayers.length, 12);
assert.equal(lineupInput.homePlayers[0].id, lineupTeams.HOME.players[0].playerId);
const selectedLineup = { team: "HOME", assignments: {
  S: "HOME-S-2", OH1: "HOME-OH-3", MB1: "HOME-MB-3",
  OP: "HOME-OP-2", OH2: "HOME-OH-4", MB2: "HOME-MB-4",
} };
const configuredTeams = applyFormalStartingLineup(lineupTeams, selectedLineup);
assert.deepEqual(configuredTeams.HOME.starters, selectedLineup.assignments);
assert.equal(configuredTeams.HOME.players.length, 12, "未入選球員必須完整保留為替補。 ");
assert.deepEqual(configuredTeams.AWAY.starters, lineupTeams.AWAY.starters);
const configuredRoster = new FormalMatchRoster(configuredTeams);
assert.deepEqual(configuredRoster.getSnapshot().active.HOME, selectedLineup.assignments);
configuredRoster.substitute({ team: "HOME", job: "OH1", playerInId: "HOME-OH1-1" });
assert.equal(configuredRoster.getSnapshot().active.HOME.OH1, "HOME-OH1-1");

assert.equal(getPlayerAvatarPresentation({ name: "陳冠宇", position: "S", avatar: null }).label, "冠宇");
for (const [position, color] of Object.entries({ S: "#C87979", OH: "#7199CA",
  MB: "#78A88A", OP: "#D8B665" })) {
  assert.equal(PLAYER_POSITION_AVATAR_COLORS[position], color);
  assert.equal(getPlayerAvatarPresentation({ name: "測試球員", position, avatar: null }).color, color);
}
assert.equal(getPlayerAvatarPresentation({ name: "照片球員", position: "OH", avatar: "photo.png" }).photoUrl,
  "photo.png");
assert.equal(getPlayerAvatarPresentation({ name: "錯位球員", position: "MB", job: "OH1", avatar: null }).color,
  PLAYER_POSITION_AVATAR_COLORS.MB, "錯位時必須依原始 position 配色。 ");

assert.equal(resolveDisplayedSpeed({ ball: { speedLevel: "ULTRA_FAST" } }), "ULTRA_FAST");
assert.equal(resolveDisplayedSpeed({ ball: {}, ballVelocity: { x: 1000, y: 0, height: 0 } }), "FAST");
const sameSegmentA = { ballFlightId: 4, events: [{ type: "SERVE_CONTACT" }] };
const sameSegmentB = { ...sameSegmentA, ballVelocity: { x: 300, y: 500, height: -100 } };
assert.equal(resolveBallFlightSegmentKey(sameSegmentA), resolveBallFlightSegmentKey(sameSegmentB),
  "同一球路的速度方向變化不得建立新視覺方向。 ");
assert.notEqual(resolveBallFlightSegmentKey(sameSegmentA), resolveBallFlightSegmentKey({
  ballFlightId: 5, events: [...sameSegmentA.events, { type: "RECEIVE_OUTPUT" }],
}), "新觸球球路必須更新視覺方向。 ");
assert.equal(isNetFinished({ rallyResult: { reason: "SERVE_NET" } }), true);
assert.equal(isNetFinished({ rallyResult: { reason: "ATTACK_NET" } }), true);
assert.equal(isNetFinished({ rallyResult: { reason: "BALL_LANDED" } }), false);

const flightSnapshot = (rallyPhase, speedLevel, outgoingVelocity, extraEvents = []) => ({
  rallyPhase, simulationTime: 1, ball: { speedLevel }, ballVelocity: outgoingVelocity,
  events: [{ type: rallyPhase === "SERVE_FLIGHT" ? "SERVE_CONTACT" : "ATTACK_STARTED",
    time: 0, outgoingVelocity }, ...extraEvents],
});
const rightFast = flightSnapshot("SERVE_FLIGHT", "FAST", { x: 1000, y: 0, height: 0 });
const leftFast = flightSnapshot("ATTACK_FLIGHT", "FAST", { x: -1000, y: 0, height: 0 });
assert.equal(resolveBallSpinProfile(rightFast).direction, 1, "向右飛必須順時針。 ");
assert.equal(resolveBallSpinProfile(leftFast).direction, -1, "向左飛必須逆時針。 ");
assert.equal(resolveBallSpinProfile(flightSnapshot("SERVE_FLIGHT", "FAST",
  { x: 0.5, y: 900, height: 0 })).enabled, false, "近乎垂直時不得抖動旋轉。 ");
const spinAnchors = FORMAL_MATCH_VISUALS.ballSpin.speedAnchors;
assert.deepEqual(spinAnchors.map(({ degreesPerSecond }) => degreesPerSecond), [360, 1080, 1800, 2880]);
spinAnchors.forEach(({ speed, degreesPerSecond }) => {
  assert.ok(Math.abs(resolveBallSpinRate(speed) - degreesPerSecond) < 1e-9);
});
const sampledRates = [0, 650, 850, 1000, 1300, 2000].map(resolveBallSpinRate);
for (let index = 1; index < sampledRates.length; index += 1) {
  assert.ok(sampledRates[index] >= sampledRates[index - 1], "實際球速提高時角速度不得下降。 ");
}
assert.equal(resolveBallSpinRate(-1), 360);
assert.equal(resolveBallSpinRate(99999), 2880);
assert.equal(resolveActualBallSpeed({ ballVelocity: { x: 300, y: 400, height: 0 } }), 500);
assert.equal(isBallSpinPhase(rightFast), true);
for (const phase of ["RECEIVE", "SET", "ATTACK", "FINISHING", "ENDED"]) {
  assert.equal(isBallSpinPhase({ ...rightFast, rallyPhase: phase }), false, `${phase} 不得旋轉。`);
}
const blocked = flightSnapshot("ATTACK_FLIGHT", "ULTRA_FAST", { x: 1200, y: 0, height: -200 },
  [{ type: "BLOCK_CONTACT" }, { type: "BLOCK_RESULT" }]);
assert.equal(isBallSpinPhase(blocked), false);
const landed = { ...rightFast, rallyResult: { reason: "BALL_LANDED" } };
assert.equal(isBallSpinPhase(landed), false);
for (const fps of [30, 60, 144]) {
  let angle = 0;
  for (let frame = 0; frame < fps * 2; frame += 1) {
    angle = advanceBallSpinAngle(angle, 1 / fps, 1, resolveBallSpinRate(1076.92));
  }
  assert.ok(Math.abs(angle - 3600) < 1e-8, `${fps} FPS 的兩秒旋轉角度必須相同。`);
}
const cryptoValues = [101, 202];
const cryptoSource = { getRandomValues(array) { array[0] = cryptoValues.shift(); return array; } };
assert.equal(createRandomMatchSeed({ cryptoSource }), 101);
assert.equal(createRandomMatchSeed({ cryptoSource }), 202);
const generatedSeeds = [303, 404];
const randomSeedSource = createMatchSeedSource({ randomSeed: () => generatedSeeds.shift() });
assert.equal(randomSeedSource.next(), 303, "新比賽必須取得新 Seed。 ");
assert.equal(randomSeedSource.next(), 404, "重新開始必須取得新 Seed。 ");
const fixedSeedSource = createMatchSeedSource({ fixedSeed: FORMAL_MATCH_DEMO_SEED,
  randomSeed: () => { throw new Error("固定 Seed 不得呼叫隨機來源。 "); } });
assert.equal(fixedSeedSource.next(), FORMAL_MATCH_DEMO_SEED);
assert.equal(fixedSeedSource.next(), FORMAL_MATCH_DEMO_SEED);
assert.equal(resolveImpactLevel(400), "MILD");
assert.equal(resolveImpactLevel(800), "NOTICEABLE");
assert.equal(resolveImpactLevel(1200), "STRONG");

function runRally(fps) {
  const roster = createFormalMatchTestTeams();
  const activeTeams = Object.fromEntries(["HOME", "AWAY"].map((team) => [team,
    Object.entries(roster[team].starters).map(([job, playerId]) => ({
      ...roster[team].players.find((player) => player.playerId === playerId), job, morale: 30,
    }))]));
  const adapter = new FormalRallyAdapter({ teams: activeTeams,
    rotations: { HOME: "R1", AWAY: "R1" }, servingTeam: "HOME",
    seed: FORMAL_MATCH_DEMO_SEED });
  let snapshot = adapter.start();
  for (let frame = 0; frame < fps * 45 && snapshot.status !== "ENDED"; frame += 1) {
    snapshot = adapter.advance(1 / fps);
  }
  assert.equal(snapshot.status, "ENDED", `${fps} FPS 正式測試 Rally 應正常結束。`);
  return { result: adapter.getResult(), events: adapter.getEvents().map((event) => event.type) };
}

const fps30 = runRally(30);
assert.deepEqual(runRally(60), fps30);
assert.deepEqual(runRally(144), fps30);

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/main.css", import.meta.url), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "index.html 不得產生重複 DOM id。 ");
for (const id of ["match-test-button", "formal-match-view", "formal-match-viewport",
  "formal-match-start", "formal-match-next", "formal-match-auto", "formal-match-pause",
  "formal-match-substitute", "formal-match-tactics"]) assert.ok(ids.includes(id), `缺少 ${id}。`);
assert.doesNotMatch(html, /formal-match-(sets-home|sets-away|server|status|rally)/,
  "精簡記分板不得保留局數勝場、發球方、狀態或 Rally 欄位。 ");
assert.match(css, /\.formal-match-scoreboard\s*\{[\s\S]*?position:\s*absolute;/,
  "記分板必須是球場內 absolute overlay。 ");
assert.match(css, /\.formal-match-scoreboard[\s\S]*?pointer-events:\s*none;/,
  "記分板不得攔截球場操作。 ");

console.log("Formal Match UI data/visual contract tests passed.");
