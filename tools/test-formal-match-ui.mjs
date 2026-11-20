import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createFormalMatchRosterSource, createFormalMatchTestTeams, FORMAL_MATCH_DEMO_SEED } from
  "../src/simulator/formal-match-test-data.js";
import { FormalRallyAdapter } from "../src/simulator/formal-rally-adapter.js";
import { resolveFormalTeamNames } from "../src/simulator/formal-match-main.js";
import { advanceBallSpinAngle, advanceGroundSpinAngle, isBallSpinPhase, isNetFinished,
  resolveActualBallSpeed, resolveBallFlightSegmentKey, resolveBallSpinProfile,
  resolveBallSpinDirection, resolveBallSpinRate, resolveDisplayedSpeed,
  resolveGroundSpinRate, resolvePlayerShadowVisual, resolveReceiveBallSpinRate,
  updateBallTrailSamples } from
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
assert.deepEqual(resolveFormalTeamNames({ HOME: { name: "虎科資工" },
  AWAY: { teamName: "虎科企管" } }), { HOME: "虎科資工", AWAY: "虎科企管" });
assert.deepEqual(resolveFormalTeamNames({ HOME: {}, AWAY: {} }), { HOME: "HOME", AWAY: "AWAY" });
assert.equal(teams.HOME.players.length, 12);
assert.equal(teams.AWAY.players.length, 6);
assert.equal(new Set(teams.HOME.players.map((player) => player.playerId)).size, 12);
assert.deepEqual(Object.keys(teams.HOME.starters).sort(), ["MB1", "MB2", "OH1", "OH2", "OP", "S"]);
teams.HOME.players[0].abilities.set = 1;
assert.notEqual(createFormalMatchTestTeams().HOME.players[0].abilities.set, 1,
  "測試名單 factory 不得讓 Match 修改共用資料。 ");
const allPlayers = [...teams.HOME.players, ...teams.AWAY.players];
assert.equal(allPlayers.length, 18);
assert.equal(new Set(allPlayers.map((player) => player.playerId)).size, 18);
assert.equal(new Set(allPlayers.map((player) => player.name)).size, 18);
for (const player of allPlayers) {
  for (const abilityValue of Object.values(player.abilities)) {
    assert.ok(Number.isInteger(abilityValue) && abilityValue >= 1 && abilityValue <= 99);
  }
  assert.ok(Number.isInteger(player.mood) && player.mood >= 1 && player.mood <= 5);
  assert.ok(["一般", "跳飄", "跳發"].includes(player.serveType));
}
const positionCounts = (players) => Object.fromEntries(["S", "OH", "MB", "OP"].map((position) =>
  [position, players.filter((player) => player.position === position).length]));
assert.deepEqual(positionCounts(teams.HOME.players), { S: 2, OH: 4, MB: 4, OP: 2 });
assert.deepEqual(positionCounts(teams.AWAY.players), { S: 1, OH: 2, MB: 2, OP: 1 });
assert.deepEqual(createFormalMatchTestTeams({ seed: 12345 }),
  createFormalMatchTestTeams({ seed: 12345 }), "相同名單 Seed 必須產生相同球員資料。 ");
assert.notDeepEqual(createFormalMatchTestTeams({ seed: 12345 }),
  createFormalMatchTestTeams({ seed: 54321 }), "不同名單 Seed 應產生不同球員資料。 ");
const rosterSeeds = [111, 222];
const rosterSource = createFormalMatchRosterSource({ seedFactory: () => rosterSeeds.shift() });
const firstRoster = rosterSource.next();
const secondRoster = rosterSource.next();
assert.equal(firstRoster.seed, 111);
assert.equal(secondRoster.seed, 222);
assert.notDeepEqual(secondRoster.teams, firstRoster.teams,
  "再次進入比賽測試必須建立新名單。 ");

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
for (const player of lineupTeams.HOME.players) {
  assert.deepEqual(configuredTeams.HOME.players.find((entry) => entry.playerId === player.playerId), player,
    "確認先發後不得改變姓名或能力。 ");
}
const configuredRoster = new FormalMatchRoster(configuredTeams);
assert.deepEqual(configuredRoster.getSnapshot().active.HOME, selectedLineup.assignments);
configuredRoster.substitute({ team: "HOME", job: "OH1", playerInId: "HOME-OH1-1" });
assert.equal(configuredRoster.getSnapshot().active.HOME.OH1, "HOME-OH1-1");
assert.deepEqual(configuredRoster.getSnapshot().homePlayers.find((player) =>
  player.playerId === "HOME-OH1-1").abilities,
configuredTeams.HOME.players.find((player) => player.playerId === "HOME-OH1-1").abilities,
"換人必須沿用替補原始能力。 ");

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
assert.equal(isNetFinished({ status: "FINISHING", rallyResult: { reason: "SERVE_NET" } }), false,
  "掛網收尾落地前球體不得消失。 ");
assert.equal(isNetFinished({ status: "ENDED", rallyResult: { reason: "SERVE_NET" } }), true);
assert.equal(isNetFinished({ status: "ENDED", rallyResult: { reason: "ATTACK_NET" } }), true);
assert.equal(isNetFinished({ status: "ENDED", rallyResult: { reason: "BALL_LANDED" } }), false);

const trailSnapshot = (time, x, y = 450, height = 50) => ({
  simulationTime: time, ball: { x, y, height },
});
let trail = [];
for (let frame = 0; frame <= 144; frame += 1) {
  const time = frame / 144;
  trail = updateBallTrailSamples(trail, trailSnapshot(time, time * 800));
}
assert.ok(trail.at(-1).time === 1 && trail[0].time >= 0.75 - 1e-9,
  "球路軌跡只能保留最近 0.25 秒的實際位置。 ");
assert.ok(trail.every((sample, index) => index === 0 || sample.time > trail[index - 1].time));
const groundedTrail = updateBallTrailSamples(trail, trailSnapshot(1.3, 800));
assert.equal(groundedTrail.length, 0, "球停止後舊軌跡必須自然淡出。 ");
const sampleTrailAtFps = (fps) => {
  let samples = [];
  for (let frame = 0; frame <= fps; frame += 1) {
    const time = frame / fps;
    samples = updateBallTrailSamples(samples, trailSnapshot(time, time * 800));
  }
  return { first: samples[0], last: samples.at(-1), span: samples.at(-1).time - samples[0].time };
};
for (const sampled of [30, 60, 144].map(sampleTrailAtFps)) {
  assert.equal(sampled.last.time, 1);
  assert.ok(sampled.first.time >= 0.75 - 1e-9 && sampled.span <= 0.25 + 1e-9,
    "不同 FPS 的軌跡皆須使用相同 0.25 秒時間窗。 ");
  assert.equal(sampled.last.x, 800);
}

const groundShadow = resolvePlayerShadowVisual(0);
const airShadow = resolvePlayerShadowVisual(FORMAL_MATCH_VISUALS.playerShadow.maximumJumpHeight);
assert.equal(groundShadow.scale, 1);
assert.equal(groundShadow.opacity, FORMAL_MATCH_VISUALS.playerShadow.maximumOpacity);
assert.equal(airShadow.scale, FORMAL_MATCH_VISUALS.playerShadow.minimumScale);
assert.equal(airShadow.opacity, FORMAL_MATCH_VISUALS.playerShadow.minimumOpacity);

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
for (const [quality, rate] of Object.entries({ PERFECT: 540, NORMAL: 1260, BAD: 2160 })) {
  const receive = { rallyPhase: "SET", simulationTime: 1, ball: { speedLevel: "NORMAL" },
    ballVelocity: { x: -300, y: 0, height: 100 }, events: [
      { type: "SERVE_CONTACT", time: 0, outgoingVelocity: { x: 900, y: 0, height: 0 } },
      { type: "RECEIVE_OUTPUT", time: 0.5, quality, outgoingVelocity: { x: -300, y: 0, height: 100 } },
    ] };
  assert.equal(resolveReceiveBallSpinRate(quality), rate);
  assert.equal(resolveBallSpinProfile(receive, { direction: 1, degreesPerSecond: 1800 }).degreesPerSecond,
    rate, `${quality} 接球後必須使用正式品質轉速。`);
  assert.equal(isBallSpinPhase(receive), true, `${quality} 接球後仍應旋轉。`);
}
const verticalReceive = { rallyPhase: "SET", simulationTime: 1, ball: { speedLevel: "NORMAL" },
  ballVelocity: { x: 0.2, y: 300, height: 100 }, events: [
    { type: "RECEIVE_OUTPUT", time: 0.5, quality: "NORMAL",
      outgoingVelocity: { x: 0.2, y: 300, height: 100 } },
  ] };
assert.equal(resolveBallSpinProfile(verticalReceive, { direction: -1 }).direction, -1,
  "接近垂直的接球球路必須沿用前一段方向。 ");
assert.equal(resolveBallSpinDirection(0.2, 1), 1);
const setStopped = { ...verticalReceive, events: [...verticalReceive.events,
  { type: "SET_RESULT", time: 0.8, quality: "PERFECT" }] };
assert.equal(resolveBallSpinProfile(setStopped, { direction: -1, degreesPerSecond: 1260 }).enabled, false,
  "舉球後必須停止自轉。 ");
const blocked = flightSnapshot("ATTACK_FLIGHT", "ULTRA_FAST", { x: 1200, y: 0, height: -200 },
  [{ type: "BLOCK_CONTACT" }, { type: "BLOCK_RESULT", time: 0.7,
    outgoingVelocity: { x: -400, y: 0, height: 50 } }]);
const blockedProfile = resolveBallSpinProfile(blocked, { direction: 1, degreesPerSecond: 1800 });
assert.equal(blockedProfile.direction, -1);
assert.equal(blockedProfile.degreesPerSecond, 1260, "攔網後應保留 70% 原角速度。 ");
assert.equal(blockedProfile.enabled, true);
const landed = { ...rightFast, simulationTime: 1.2, rallyPhase: "FINISHING",
  rallyResult: { reason: "BALL_LANDED" }, events: [...rightFast.events,
    { type: "RALLY_RESULT_LOCKED", time: 1, reason: "BALL_LANDED" }] };
const landedProfile = resolveBallSpinProfile(landed, { direction: 1, degreesPerSecond: 1800 });
assert.ok(landedProfile.degreesPerSecond > 0 && landedProfile.degreesPerSecond < 1800,
  "落地後必須逐漸減速。 ");
assert.equal(resolveGroundSpinRate(1800, 0), 1800);
assert.equal(resolveGroundSpinRate(1800,
  FORMAL_MATCH_VISUALS.ballSpin.groundDecayDurationSeconds), 0);
for (const fps of [30, 60, 144]) {
  let angle = 0;
  for (let frame = 0; frame < fps * 2; frame += 1) {
    angle = advanceBallSpinAngle(angle, 1 / fps, 1, resolveBallSpinRate(1076.92));
  }
  assert.ok(Math.abs(angle - 3600) < 1e-8, `${fps} FPS 的兩秒旋轉角度必須相同。`);
  let decayAngle = 0;
  let previousTime = 1;
  const duration = FORMAL_MATCH_VISUALS.ballSpin.groundDecayDurationSeconds;
  for (let frame = 1; frame <= Math.ceil(fps * duration); frame += 1) {
    const currentTime = Math.min(1 + duration, 1 + frame / fps);
    decayAngle = advanceGroundSpinAngle(decayAngle, previousTime, currentTime, 1, 1800, 1);
    previousTime = currentTime;
  }
  assert.ok(Math.abs(decayAngle - 1800 * duration / 2) < 1e-8,
    `${fps} FPS 的落地減速角度必須一致。`);
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
const formalMainSource = await readFile(new URL("../src/simulator/formal-match-main.js", import.meta.url), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "index.html 不得產生重複 DOM id。 ");
for (const id of ["match-test-button", "formal-match-view", "formal-match-viewport",
  "formal-match-score-home", "formal-match-team-home", "formal-match-sets-score",
  "formal-match-team-away", "formal-match-score-away",
  "formal-match-start", "formal-match-next", "formal-match-auto", "formal-match-pause",
  "formal-match-substitute", "formal-match-tactics"]) assert.ok(ids.includes(id), `缺少 ${id}。`);
const scoreboardMarkup = html.match(/<section class="formal-match-scoreboard"[\s\S]*?<\/section>/)?.[0];
assert.ok(scoreboardMarkup);
const scoreboardIds = [...scoreboardMarkup.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(scoreboardIds, ["formal-match-score-home", "formal-match-team-home",
  "formal-match-sets-score", "formal-match-team-away", "formal-match-score-away"],
"正式記分板必須依小分、隊名、大比分、隊名、小分排列。 ");
assert.ok(html.indexOf("formal-match-scoreboard") < html.indexOf("id=\"formal-match-viewport\""),
  "記分板必須位於球場 Viewport 之前。 ");
assert.match(html, /formal-match-stage[\s\S]*?formal-match-scoreboard[\s\S]*?formal-match-viewport/,
  "記分板與 Viewport 必須位於同一版面容器。 ");
const scoreboardCss = css.match(/\.formal-match-scoreboard\s*\{([\s\S]*?)\}/)?.[1] ?? "";
assert.doesNotMatch(scoreboardCss, /position:\s*absolute/,
  "記分板不得再覆蓋於球場。 ");
assert.match(scoreboardCss, /grid-template-columns:[^;]*minmax\([^;]*minmax\([^;]*minmax\([^;]*minmax\([^;]*minmax\(/,
  "記分板必須使用固定五欄 Grid。 ");
assert.match(scoreboardCss, /width:\s*100%/,
  "記分板必須與球場容器等寬。 ");
assert.match(css, /\.formal-match-scoreboard\s*>\s*\*\s*\{[\s\S]*?text-overflow:\s*ellipsis;/,
  "過長隊名必須省略而非撐高記分板。 ");
assert.match(formalMainSource,
  /sets-score"\]\.textContent\s*=\s*`\$\{snapshot\.setsWon\.HOME\}:\$\{snapshot\.setsWon\.AWAY\}`/,
  "大比分必須直接讀取正式 Match Snapshot 的 setsWon。 ");
assert.match(css, /\.formal-match-player__shadow\s*\{[\s\S]*?pointer-events:\s*none;/,
  "球員陰影必須是獨立且不攔截操作的地面層。 ");
assert.match(css, /\.formal-match-ball-trail\s*\{[\s\S]*?pointer-events:\s*none;/,
  "球路軌跡不得參與操作或碰撞。 ");
assert.match(css, /\.formal-match-landing-marker\s*\{[\s\S]*?border-radius:\s*50%;/,
  "實際落點必須使用圓環標記。 ");

console.log("Formal Match UI data/visual contract tests passed.");
