import assert from "node:assert/strict";
import { DEFAULT_ATTACK_POSITIONS } from "../src/simulator/attack-positions.js";
import { resolveLeftLongConfiguration } from "../src/simulator/attack-assignment.js";
import { getSpikeReferenceSpeed, ATTACK_SEED_MODES,
  SPIKE_SPEED_LEVELS, SPIKE_SPEED_REFERENCE } from "../src/simulator/attack-quality.js";
import { NATURAL_SPIKE_EXPERIMENT_DEFAULTS, SPIKE_FLIGHT_MODES,
  SpikeReceiveSimulator } from "../src/simulator/spike-simulator.js";

assert.equal(SPIKE_SPEED_REFERENCE.flightTimes.FAST, 0.65);
assert.ok(getSpikeReferenceSpeed(SPIKE_SPEED_LEVELS.SLOW)
  < getSpikeReferenceSpeed(SPIKE_SPEED_LEVELS.NORMAL));
assert.ok(getSpikeReferenceSpeed(SPIKE_SPEED_LEVELS.NORMAL)
  < getSpikeReferenceSpeed(SPIKE_SPEED_LEVELS.FAST));
assert.ok(getSpikeReferenceSpeed(SPIKE_SPEED_LEVELS.FAST)
  < getSpikeReferenceSpeed(SPIKE_SPEED_LEVELS.ULTRA_FAST));

function run({ fps = 120, seed = NATURAL_SPIKE_EXPERIMENT_DEFAULTS.randomSeed,
  seedMode = ATTACK_SEED_MODES.FIXED, attack = 70, attackConsistency = 70,
  netCollisionEnabled = false, defenseEnabled = false, thirdMiss = false } = {}) {
  const simulator = new SpikeReceiveSimulator({ random: () => 0.5 });
  simulator.configureAttackAssignment(resolveLeftLongConfiguration(DEFAULT_ATTACK_POSITIONS,
    "R1", "SIM-P2", simulator.players, simulator.secondTouchPlayerId));
  if (thirdMiss) simulator.configureThirdPass({ flightDuration: 1.6, arcHeight: 260, contactHeight: 180 });
  simulator.configureSpikeExperiment({ mode: SPIKE_FLIGHT_MODES.NATURAL,
    attack, attackConsistency, seedMode, randomSeed: seed,
    parameters: { netCollisionEnabled, netHeight: 160 } });
  simulator.configureSingleDefense({ enabled: defenseEnabled, initialX: 700,
    initialY: 450, moveSpeed: defenseEnabled ? 1600 : 300 });
  simulator.launch({ x: 1800, y: 450 });
  if (thirdMiss) simulator.players.find((player) => player.id === "SIM-P2").moveSpeed = 1;
  for (let frame = 0; frame < fps * 30 && simulator.status !== "BALL_REST"
    && simulator.status !== "DEFENSE_TOUCH_COMPLETE" && simulator.status !== "THIRD_TOUCH_MISSED"; frame++) {
    simulator.updateFrame(1 / fps);
  }
  return simulator.getSnapshot();
}

const result = run();
assert.equal(result.attackGeometry.clock, 11);
assert.equal(result.events.filter((event) => event.type === "ATTACK_QUALITY_SELECTED").length, 0);
assert.equal(result.events.filter((event) => event.type === "THIRD_TOUCH" && event.success).length, 1);
assert.equal(result.events.filter((event) => event.type === "SPIKE_STARTED").length, 1);
assert.ok(result.attackResolution);
assert.equal(result.attackResolution.setQuality, result.secondPass.quality);
assert.equal(result.spikeFlight.mode, SPIKE_FLIGHT_MODES.NATURAL);
assert.equal(result.lockedSpikeTarget, null);
assert.equal(result.status, "BALL_REST");
assert.ok(["SPIKE_LANDED", "SPIKE_OUT", "SPIKE_NET"].includes(result.spikeResult.type));
assert.equal(result.events.filter((event) => event.type === "BALL_FIRST_GROUND_CONTACT").length, 1);
assert.ok(result.naturalSpike.bounceCount >= 1);
assert.equal(result.naturalSpike.rest, true);
assert.deepEqual(result.spikeResult.targetPoint, result.attackResolution.targetPoint);
assert.ok(result.spikeResult.actualLandingPoint);
const bounces = result.events.filter((event) => event.type === "BALL_BOUNCED");
for (let index = 1; index < bounces.length; index++) {
  assert.ok(bounces[index].verticalSpeed <= bounces[index - 1].verticalSpeed + 1e-8);
}

const result30 = run({ fps: 30 });
const result60 = run({ fps: 60 });
const result144 = run({ fps: 144 });
for (const snapshot of [result30, result60, result144]) {
  assert.equal(snapshot.naturalSpike.speedLevel, result.naturalSpike.speedLevel);
  assert.equal(snapshot.spikeResult.type, result.spikeResult.type);
  assert.equal(snapshot.naturalSpike.bounceCount, result.naturalSpike.bounceCount);
}
assert.deepEqual(result30.events, result144.events);
assert.deepEqual(result30.events, result60.events);
assert.deepEqual(result30.attackResolution, result144.attackResolution);
assert.deepEqual(result30.attackResolution, result60.attackResolution);
const autoA = run({ seedMode: ATTACK_SEED_MODES.AUTO });
const autoB = run({ seedMode: ATTACK_SEED_MODES.AUTO });
assert.notEqual(autoA.actualAttackSeed, autoB.actualAttackSeed);
assert.deepEqual(run({ seed: 2468 }).attackResolution, run({ seed: 2468 }).attackResolution);

const net = run({ netCollisionEnabled: true, seed: 1 });
if (net.spikeResult.type === "SPIKE_NET") {
  assert.equal(net.spikeFlight.netCheck.result, "NET_CONTACT");
  assert.ok(net.events.some((event) => event.type === "BALL_FIRST_GROUND_CONTACT"));
}
const ignored = run({ netCollisionEnabled: false, seed: 1 });
if (ignored.spikeFlight.netCheck.geometryIntersectionDetected) {
  assert.equal(ignored.spikeFlight.netCheck.result, "INTERSECTION_IGNORED");
}

const defended = run({ defenseEnabled: true });
assert.equal(defended.defense?.result?.success, true);
assert.equal(defended.status, "DEFENSE_TOUCH_COMPLETE");
assert.equal(defended.events.some((event) => event.type === "BALL_FIRST_GROUND_CONTACT"), false);
const missed = run({ thirdMiss: true });
assert.equal(missed.status, "THIRD_TOUCH_MISSED");
assert.equal(missed.attackResolution, null);
assert.equal(missed.events.some((event) => event.type === "SPIKE_STARTED"), false);
const missedDefense = run({ defenseEnabled: false });
assert.equal(missedDefense.status, "BALL_REST");
assert.ok(missedDefense.events.some((event) => event.type === "BALL_FIRST_GROUND_CONTACT"));

console.log("PASS: fixed 11 o'clock real THIRD_TOUCH; power/consistency resolution after touch; target/actual landing separation; speed order/FAST 0.65; net/defense/bounce; AUTO/FIXED seed; identical 30/60/144 FPS.");
