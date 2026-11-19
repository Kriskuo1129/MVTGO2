import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createFormalMatchTestTeams, FORMAL_MATCH_DEMO_SEED } from
  "../src/simulator/formal-match-test-data.js";
import { FormalRallyAdapter } from "../src/simulator/formal-rally-adapter.js";
import { isNetFinished, resolveBallDeformation, resolveBallFlightAngle,
  resolveBallFlightSegmentKey, resolveDisplayedSpeed, isBallDeformationPhase } from
  "../src/simulator/formal-match-renderer.js";
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
assert.deepEqual(FORMAL_MATCH_VISUALS.ballDeformation.SLOW, { scaleX: 1, scaleY: 1 });
assert.ok(FORMAL_MATCH_VISUALS.ballDeformation.NORMAL.scaleX
  < FORMAL_MATCH_VISUALS.ballDeformation.FAST.scaleX);
assert.ok(FORMAL_MATCH_VISUALS.ballDeformation.FAST.scaleX
  < FORMAL_MATCH_VISUALS.ballDeformation.ULTRA_FAST.scaleX);
assert.equal(resolveBallDeformation({ ballVelocity: { x: 1000, y: 0, height: 0 } }).angle, 0);
assert.equal(resolveBallDeformation({ ballVelocity: { x: 0, y: 1000, height: 0 } }).angle, -90);
assert.equal(resolveBallDeformation({ ballVelocity: { x: 0, y: 0, height: 1000 } }).angle, -90,
  "世界高度向上時，畫面移動方向必須向上。 ");
assert.equal(resolveBallFlightAngle({ ballVelocity: { x: -1000, y: 0, height: 0 } }), 0,
  "橢圓左右方向等價，不應產生 180° 旋轉。 ");
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
  rallyPhase, ball: { speedLevel }, ballVelocity: outgoingVelocity,
  events: [{ type: rallyPhase === "SERVE_FLIGHT" ? "SERVE_CONTACT" : "ATTACK_STARTED",
    outgoingVelocity }, ...extraEvents],
});
const horizontalFast = flightSnapshot("SERVE_FLIGHT", "FAST", { x: 1000, y: 0, height: 0 });
const verticalFast = flightSnapshot("ATTACK_FLIGHT", "FAST", { x: 0, y: 0, height: 1000 });
const diagonalFast = flightSnapshot("ATTACK_FLIGHT", "FAST", { x: 800, y: 0, height: -800 });
assert.equal(resolveBallDeformation(horizontalFast).angle, 0);
assert.equal(resolveBallDeformation(verticalFast).angle, -90);
assert.ok(Math.abs(resolveBallDeformation(diagonalFast).angle - 45) < 1e-9);
for (const level of ["SLOW", "NORMAL", "FAST", "ULTRA_FAST"]) {
  const visual = resolveBallDeformation(flightSnapshot("SERVE_FLIGHT", level,
    { x: 1000, y: 0, height: 0 }));
  assert.equal(visual.enabled, level !== "SLOW");
  assert.equal(visual.scaleX, FORMAL_MATCH_VISUALS.ballDeformation[level].scaleX);
}
assert.equal(isBallDeformationPhase(horizontalFast), true);
for (const phase of ["RECEIVE", "SET", "ATTACK", "FINISHING", "ENDED"]) {
  const visual = resolveBallDeformation({ ...horizontalFast, rallyPhase: phase });
  assert.deepEqual({ x: visual.scaleX, y: visual.scaleY }, { x: 1, y: 1 }, `${phase} 必須恢復圓形。`);
}
const blocked = flightSnapshot("ATTACK_FLIGHT", "ULTRA_FAST", { x: 1200, y: 0, height: -200 },
  [{ type: "BLOCK_CONTACT" }, { type: "BLOCK_RESULT" }]);
assert.equal(isBallDeformationPhase(blocked), false);
assert.equal(resolveBallDeformation(blocked).scaleX, 1);
const landed = { ...horizontalFast, rallyResult: { reason: "BALL_LANDED" } };
assert.equal(resolveBallDeformation(landed).scaleX, 1);
const sameLaunch30 = { ...diagonalFast, ballVelocity: { x: 790, y: 0, height: -760 } };
const sameLaunch144 = { ...diagonalFast, ballVelocity: { x: 740, y: 0, height: -620 } };
assert.equal(resolveBallFlightAngle(sameLaunch30), resolveBallFlightAngle(sameLaunch144),
  "同一 launch event 的方向不得因 Renderer FPS 取樣時機不同。 ");
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
for (const id of ["formal-match-button", "formal-match-view", "formal-match-viewport",
  "formal-match-start", "formal-match-next", "formal-match-auto", "formal-match-pause",
  "formal-match-substitute", "formal-match-tactics"]) assert.ok(ids.includes(id), `缺少 ${id}。`);
assert.doesNotMatch(html, /formal-match-(sets-home|sets-away|server|status|rally)/,
  "精簡記分板不得保留局數勝場、發球方、狀態或 Rally 欄位。 ");
assert.match(css, /\.formal-match-scoreboard\s*\{[\s\S]*?position:\s*absolute;/,
  "記分板必須是球場內 absolute overlay。 ");
assert.match(css, /\.formal-match-scoreboard[\s\S]*?pointer-events:\s*none;/,
  "記分板不得攔截球場操作。 ");

console.log("Formal Match UI data/visual contract tests passed.");
