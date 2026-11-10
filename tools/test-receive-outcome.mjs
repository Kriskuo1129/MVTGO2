import assert from "node:assert/strict";
import { createSeededRandom } from "../src/simulator/attack-quality.js";
import {
  calculateReceiveSuccess,
  createReceiveErrorTrajectory,
  RECEIVE_QUALITIES,
  RECEIVE_RESULTS,
  resolveReceiveContact,
} from "../src/simulator/receive-quality.js";
import { SixPlayerReceiveSimulator } from "../src/simulator/team-simulator.js";

const base = { positionDistance: 0, idealRange: 84, preparationTime: 0.4, morale: 30 };
let calls = 0;
assert.deepEqual(resolveReceiveContact({ contacted: false, random: () => { calls += 1; return 0; } }),
  { result: RECEIVE_RESULTS.MISS, contacted: false });
assert.equal(calls, 0, "MISS 不得消耗成功率 RNG。");

for (const speed of ["SLOW", "MEDIUM", "NORMAL", "FAST", "ULTRA_FAST"]) {
  let prior = 0;
  for (const ability of [1, 25, 50, 75, 99]) {
    const value = calculateReceiveSuccess({ ...base, receiveAbility: ability, incomingSpeedLevel: speed });
    assert.ok(value.probability >= prior - 1e-12);
    prior = value.probability;
  }
}
for (const ability of [1, 50, 99]) {
  const probabilities = ["SLOW", "MEDIUM", "FAST", "ULTRA_FAST"].map((incomingSpeedLevel) =>
    calculateReceiveSuccess({ ...base, receiveAbility: ability, incomingSpeedLevel }).probability);
  for (let index = 1; index < probabilities.length; index += 1) {
    assert.ok(probabilities[index] <= probabilities[index - 1] + 1e-12);
  }
}

const perfect = resolveReceiveContact({ contacted: true, ...base, receiveAbility: 99,
  incomingSpeedLevel: "SLOW", random: () => 0 });
const normalValues = [0, 0.5];
const normal = resolveReceiveContact({ contacted: true, ...base, receiveAbility: 50,
  incomingSpeedLevel: "NORMAL", random: () => normalValues.shift() });
const bad = resolveReceiveContact({ contacted: true, ...base, receiveAbility: 1,
  incomingSpeedLevel: "ULTRA_FAST", random: () => 0 });
assert.equal(perfect.result, RECEIVE_RESULTS.SUCCESS);
assert.equal(perfect.quality, RECEIVE_QUALITIES.PERFECT);
assert.equal(normal.quality, RECEIVE_QUALITIES.NORMAL);
assert.equal(bad.quality, RECEIVE_QUALITIES.BAD);
const error = resolveReceiveContact({ contacted: true, ...base, receiveAbility: 1,
  incomingSpeedLevel: "ULTRA_FAST", random: () => 0.999 });
assert.equal(error.result, RECEIVE_RESULTS.ERROR);
assert.equal(error.qualityResult, undefined);

const errorInput = { start: { x: 1500, y: 450, height: 80 },
  incomingVelocity: { x: 900, y: -80 } };
const trajectoryA = createReceiveErrorTrajectory({ ...errorInput, random: createSeededRandom(1234) });
const trajectoryB = createReceiveErrorTrajectory({ ...errorInput, random: createSeededRandom(1234) });
assert.deepEqual(trajectoryA, trajectoryB);
assert.ok(trajectoryA.duration > 0 && trajectoryA.arcHeight > 0);
assert.notEqual(trajectoryA.target.x, 0);

function runError(fps) {
  const simulator = new SixPlayerReceiveSimulator({ random: () => 0.999 });
  simulator.launch({ x: 1800, y: 450 });
  for (let frame = 0; frame < fps * 5 && simulator.status !== "RECEIVE_ERROR_COMPLETE"
    && simulator.status !== "MISSED"; frame += 1) simulator.updateFrame(1 / fps);
  return simulator.getSnapshot();
}
const error30 = runError(30), error60 = runError(60), error144 = runError(144);
for (const snapshot of [error30, error60, error144]) {
  assert.equal(snapshot.receiveOutcome.result, RECEIVE_RESULTS.ERROR);
  assert.equal(snapshot.status, "RECEIVE_ERROR_COMPLETE");
  assert.equal(snapshot.receiveQuality, null);
  assert.ok(snapshot.events.some((event) => event.type === "RECEIVE_ERROR_STARTED"));
  assert.ok(snapshot.events.some((event) => event.type === "RECEIVE_ERROR_LANDED"));
  assert.equal(snapshot.events.some((event) => event.type === "SECOND_PASS_STARTED"), false);
}
assert.deepEqual(error30.receiveErrorTrajectory, error60.receiveErrorTrajectory);
assert.deepEqual(error30.receiveErrorTrajectory, error144.receiveErrorTrajectory);
assert.deepEqual(error30.ball, error60.ball);
assert.deepEqual(error30.ball, error144.ball);

console.log("PASS: MISS no RNG; receive success monotonic by ability/speed; SUCCESS qualities; reproducible ERROR flight; identical 30/60/144 FPS.");
