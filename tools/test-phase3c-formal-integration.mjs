import assert from "node:assert/strict";
import { calculatePlayerPerformance, deriveAttackConsistency } from
  "../src/simulator/player-performance.js";
import { resolveSetQuality } from "../src/simulator/set-quality.js";
import { getServeQualityWeights, getServeSpeedWeights, isJumpServeType,
  normalizeServeType } from "../src/simulator/serve-system.js";
import { createBlockRebound } from "../src/simulator/r1-block.js";
import { FormalMatchSession, FORMAL_MATCH_STATES } from
  "../src/simulator/formal-match-session.js";
import { FormalRallyAdapter } from "../src/simulator/formal-rally-adapter.js";
import { FORMAL_RALLY_JOBS } from "../src/simulator/formal-rally-player-input.js";
import { createR1AttackPlan, selectR1AttackCandidate } from
  "../src/simulator/r1-attack-plan.js";
import { createRallyTacticEffect, resolveTacticCard } from "../src/simulator/formal-tactics.js";

const abilities = Object.freeze({ attack: 80, block: 80, set: 80, receive: 80, serve: 80 });
const compatible = calculatePlayerPerformance({ abilities, position: "OH", job: "OH1", mood: 3, morale: 30 });
const mismatched = calculatePlayerPerformance({ abilities, position: "OH", job: "S", mood: 3, morale: 30 });
assert.deepEqual(compatible.effectiveAbilities, abilities);
assert.deepEqual(mismatched.effectiveAbilities,
  { attack: 64, block: 64, set: 64, receive: 64, serve: 64 });
assert.equal(deriveAttackConsistency(compatible.effectiveAbilities.attack), 80);
const boosted = calculatePlayerPerformance({ abilities, position: "OH", job: "OH1",
  mood: 5, morale: 50, tacticModifiers: { receive: 8 } });
assert.equal(boosted.effectiveAbilities.receive, 93);
assert.equal(boosted.effectiveAbilities.attack, 85,
  "情緒與士氣應小幅修正，且不可把接發戰術重複套到其他能力。 ");

const highSet = resolveSetQuality({ receiveQuality: "BAD", setAbility: 99, random: () => 0.5 });
const lowSet = resolveSetQuality({ receiveQuality: "BAD", setAbility: 20, random: () => 0.5 });
assert.equal(highSet.quality, "PERFECT", "頂尖舉球員應能修復不佳一傳。 ");
assert.equal(lowSet.quality, "BAD");
assert.deepEqual(resolveSetQuality({ receiveQuality: "NORMAL", setAbility: 70, random: () => 0.25 }),
  resolveSetQuality({ receiveQuality: "NORMAL", setAbility: 70, random: () => 0.25 }));

assert.equal(normalizeServeType("一般"), "STANDING");
assert.equal(normalizeServeType("跳飄"), "JUMP_FLOAT");
assert.equal(normalizeServeType("跳發"), "JUMP");
assert.equal(isJumpServeType("跳飄"), true);
assert.equal(getServeSpeedWeights(99, "STANDING").ULTRA_FAST, 0);
assert.equal(getServeSpeedWeights(99, "JUMP_FLOAT").ULTRA_FAST, 0);
assert.ok(getServeSpeedWeights(99, "JUMP").ULTRA_FAST > 0);
assert.ok(getServeQualityWeights(99, "STANDING").PERFECT
  > getServeQualityWeights(1, "STANDING").PERFECT);
for (const type of ["STANDING", "JUMP_FLOAT", "JUMP"]) {
  const total = Object.values(getServeSpeedWeights(80, type)).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 100) < 1e-9, `${type} 球速權重必須合計 100%。`);
}

const contact = Object.freeze({ normalizedDistance: 0.82 });
const lowBlock = createBlockRebound({ contact, incomingVelocity: { x: 900, y: 30, height: -200 },
  attackingTeam: "HOME", blockAbility: 10 });
const highBlock = createBlockRebound({ contact, incomingVelocity: { x: 900, y: 30, height: -200 },
  attackingTeam: "HOME", blockAbility: 95 });
assert.equal(lowBlock.result, "BLOCK_TOUCH");
assert.equal(highBlock.result, "STUFF_BLOCK");
assert.ok(highBlock.powerMultiplier > lowBlock.powerMultiplier);

const tacticPlan = createR1AttackPlan({ team: "AWAY", revision: 1,
  firstTouchPlayerId: "AWAY-MB2", firstTouchJob: "MB2" });
const tacticPlayers = tacticPlan.candidates.map((candidate) => ({ id: `AWAY-${candidate.job}`,
  team: "AWAY", job: candidate.job, action: "IDLE", moveSpeed: 300,
  attack: candidate.job === "OP" ? 99 : 50, ...candidate.attackPosition }));
assert.equal(selectR1AttackCandidate(tacticPlan, tacticPlayers, () => 0.5,
  createRallyTacticEffect("QUICK_ATTACK")).selected.attackType, "MIDDLE_QUICK");
assert.equal(selectR1AttackCandidate(tacticPlan, tacticPlayers, () => 0.5,
  createRallyTacticEffect("HEAVY_HITTER")).selected.job, "OP");
assert.equal(createRallyTacticEffect("RECEIVE_FOCUS").abilityModifiers.receive, 8);
assert.equal(resolveTacticCard("COACH_CONFIDENCE").moraleDelta, 10);
assert.equal(resolveTacticCard("CHEER_SQUAD").moraleDelta, 30);

function player(playerId, position, value = 72) {
  return { playerId, name: playerId, position,
    abilities: { attack: value, block: value, set: value, receive: value, serve: value },
    mood: 3, serveType: "一般", avatar: null };
}

function makeRoster() {
  const positions = { S: "S", OH1: "OH", MB1: "MB", OP: "OP", OH2: "OH", MB2: "MB" };
  const starters = Object.fromEntries(FORMAL_RALLY_JOBS.map((job) => [job, `HOME-${job}`]));
  return {
    HOME: { players: [...FORMAL_RALLY_JOBS.map((job) => player(`HOME-${job}`, positions[job])),
      player("HOME-BENCH", "OH", 77)], starters },
    AWAY: { players: FORMAL_RALLY_JOBS.map((job) => player(`AWAY-${job}`, positions[job])),
      starters: Object.fromEntries(FORMAL_RALLY_JOBS.map((job) => [job, `AWAY-${job}`])) },
  };
}

function controlledFactory() {
  return () => {
    let status = "READY";
    const result = Object.freeze({ scoringTeam: "HOME", reason: "CONTROLLED", time: 0.1 });
    return { start() { status = "RUNNING"; return this.getSnapshot(); },
      advance() { status = "ENDED"; return this.getSnapshot(); },
      getSnapshot() { return Object.freeze({ status, simulationTime: status === "ENDED" ? 0.1 : 0 }); },
      getResult() { return status === "ENDED" ? result : null; },
      getEvents() { return Object.freeze(status === "ENDED" ? [{ type: "RALLY_ENDED", ...result }] : []); } };
  };
}

const match = new FormalMatchSession({ teams: makeRoster(), seed: 3103,
  rallyAdapterFactory: controlledFactory() });
match.start();
match.advance(1 / 60);
assert.equal(match.status, FORMAL_MATCH_STATES.RALLY_ENDED);
const paused = match.pause("HOME");
assert.equal(paused.status, FORMAL_MATCH_STATES.PAUSED);
assert.deepEqual(match.advance(10), paused, "暫停不得推進時間、RNG 或重複結算。 ");
match.resume();
const firstSubstitution = match.substitute({ team: "HOME", job: "OH1", playerInId: "HOME-BENCH" });
assert.equal(firstSubstitution.playerOutId, "HOME-OH1");
const reentry = match.substitute({ team: "HOME", job: "OH1", playerInId: "HOME-OH1" });
assert.equal(reentry.playerOutId, "HOME-BENCH");
assert.throws(() => match.substitute({ team: "HOME", job: "OH1", playerInId: "HOME-BENCH" }));
assert.throws(() => match.substitute({ team: "AWAY", job: "OH1", playerInId: "AWAY-OH1" }));
const cardId = match.getSnapshot().tactics.hands.HOME[0];
match.activateTactic({ team: "HOME", cardId });
assert.equal(match.getOperationAvailability().canActivateTactic, false);
assert.equal(match.getSnapshot().tactics.pending.cardId, cardId);

match.teamMorale = { HOME: 30, AWAY: 30 };
match.streak = { team: null, count: 0 };
for (let index = 0; index < 5; index += 1) match.updateMoraleStreak("HOME");
assert.deepEqual(match.teamMorale, { HOME: 36, AWAY: 24 });
assert.equal(match.getRosterSnapshot().active.HOME.OH1, "HOME-OH1");

const seedControlA = new FormalMatchSession({ teams: makeRoster(), seed: 777,
  rallyAdapterFactory: controlledFactory() });
const seedControlB = new FormalMatchSession({ teams: makeRoster(), seed: 777,
  rallyAdapterFactory: controlledFactory() });
seedControlA.start(); seedControlB.start();
seedControlA.advance(1 / 60); seedControlB.advance(1 / 60);
seedControlA.activateTactic({ team: "HOME", cardId: seedControlA.getSnapshot().tactics.hands.HOME[0] });
seedControlA.advance(1 / 60); seedControlB.advance(1 / 60);
assert.equal(seedControlA.currentRallySeed, seedControlB.currentRallySeed,
  "戰術抽卡與啟用不得改變 Rally Seed 序列。 ");

const positions = { S: "S", OH1: "OH", MB1: "MB", OP: "OP", OH2: "OH", MB2: "MB" };
const externalTeams = Object.fromEntries(["HOME", "AWAY"].map((team) => [team,
  FORMAL_RALLY_JOBS.map((job) => ({ ...player(`${team}-${job}`, positions[job], 80), job }))]));
const qualityRally = new FormalRallyAdapter({ teams: externalTeams, seed: 1 });
qualityRally.start();
for (let frame = 0; frame < 120 * 60 && qualityRally.getSnapshot().status !== "ENDED"; frame += 1) {
  qualityRally.advance(1 / 120);
}
const qualityEvents = qualityRally.getEvents();
const receiveResult = qualityEvents.find((event) => event.type === "RECEIVE_RESULT");
const setResult = qualityEvents.find((event) => event.type === "SET_RESULT");
const attackStarted = qualityEvents.find((event) => event.type === "ATTACK_STARTED");
assert.ok(receiveResult?.quality);
assert.ok(setResult?.quality && setResult.receiveQuality === receiveResult.quality);
assert.ok(attackStarted?.setQuality === setResult.quality && attackStarted.attackQuality);
assert.ok(Number.isFinite(receiveResult.impactSpeed));
assert.ok(Number.isFinite(setResult.impactSpeed));
assert.ok(Number.isFinite(attackStarted.outgoingVelocity.x));
assert.ok(qualityRally.getSnapshot().players.every((entry) => entry.rawAbilities && entry.effectiveAbilities));

console.log("Phase 3C formal integration tests passed.");
