import assert from "node:assert/strict";
import { DEFAULT_ATTACK_POSITIONS } from "../src/simulator/attack-positions.js";
import { resolveLeftLongConfiguration } from "../src/simulator/attack-assignment.js";
import { CONTACT_DIRECTIONS, getDirectionalContactOffset } from "../src/simulator/contact-detection.js";
import { SINGLE_DEFENSE_DEFAULTS, createDefenseContactGeometry } from "../src/simulator/single-defense.js";
import { isSpikeExperimentRunning } from "../src/simulator/spike-flight.js";
import { SpikeReceiveSimulator } from "../src/simulator/spike-simulator.js";

function createConfiguredSimulator({ enabled = true, target = { x: 700, y: 450 },
  defense = {}, parameters = {}, fps = 120 } = {}) {
  const simulator = new SpikeReceiveSimulator({ random: () => 0.5 });
  simulator.configureAttackAssignment(resolveLeftLongConfiguration(
    DEFAULT_ATTACK_POSITIONS, "R1", "SIM-P2", simulator.players, simulator.secondTouchPlayerId,
  ));
  simulator.configureSpikeExperiment({ target, parameters: { flightDuration: 0.65, arcHeight: 0, ...parameters } });
  simulator.configureSingleDefense({ ...SINGLE_DEFENSE_DEFAULTS, enabled, ...defense });
  simulator.launch({ x: 1800, y: 450 });
  const initial = simulator.getSnapshot();
  if (enabled) {
    assert.ok(initial.defense.player);
    assert.equal(initial.defense.player.x, simulator.defenseConfiguration.initialX);
    assert.equal(initial.defense.prediction, null);
  }
  let maximumStep = 0;
  let prior = initial.defense?.player ?? null;
  for (let frame = 0; frame < fps * 20 && isSpikeExperimentRunning(simulator.status); frame += 1) {
    simulator.updateFrame(1 / fps);
    const player = simulator.getSnapshot().defense?.player;
    if (player && prior) maximumStep = Math.max(maximumStep, Math.hypot(player.x - prior.x, player.y - prior.y));
    prior = player;
  }
  return { simulator, snapshot: simulator.getSnapshot(), maximumStep };
}

const right = getDirectionalContactOffset(CONTACT_DIRECTIONS.FROM_RIGHT, 50);
const left = getDirectionalContactOffset(CONTACT_DIRECTIONS.FROM_LEFT, 50);
assert.ok(right.x > 0 && right.y < 0, "FROM_RIGHT 必須位於右上方（2 點鐘）。");
assert.ok(left.x < 0 && left.y < 0, "FROM_LEFT 必須位於左上方（10 點鐘）。");
assert.equal(createDefenseContactGeometry(0.65).effectiveAvatarRadius, 65, "0.65 秒扣球使用 ULTRA_FAST 原尺寸幾何。");

const disabled = createConfiguredSimulator({ enabled: false });
assert.equal(disabled.snapshot.status, "SPIKE_LANDED");
assert.equal(disabled.snapshot.events.some((event) => event.type === "DEFENSE_TOUCH"), false);

const success30 = createConfiguredSimulator({ fps: 30 });
const success144 = createConfiguredSimulator({ fps: 144 });
for (const result of [success30, success144]) {
  assert.equal(result.snapshot.status, "DEFENSE_TOUCH_COMPLETE");
  assert.equal(result.snapshot.defense.result.type, "DEFENSE_TOUCH");
  assert.equal(result.snapshot.defense.result.direction, CONTACT_DIRECTIONS.FROM_RIGHT);
  assert.equal(result.snapshot.events.filter((event) => event.type === "DEFENSE_TOUCH").length, 1);
  assert.ok(result.snapshot.defense.result.overlapDepth >= 10 - 1e-6);
  const frameRate = result === success30 ? 30 : 144;
  assert.ok(result.maximumStep <= result.simulator.defenseConfiguration.moveSpeed
    * (1 / frameRate + result.simulator.fixedStep) + 1e-6);
  const thirdIndex = result.snapshot.events.findIndex((event) => event.type === "THIRD_TOUCH");
  const defenseIndex = result.snapshot.events.findIndex((event) => event.type === "DEFENSE_TOUCH");
  assert.ok(thirdIndex >= 0 && defenseIndex > thirdIndex);
}
assert.deepEqual(success30.snapshot.defense.result, success144.snapshot.defense.result);

const missed = createConfiguredSimulator({ defense: { initialX: 520, initialY: 780, moveSpeed: 1 } });
assert.equal(missed.snapshot.status, "SPIKE_LANDED");
assert.equal(missed.snapshot.defense.result.success, false);
assert.equal(missed.snapshot.events.some((event) => event.type === "DEFENSE_TOUCH"), false);

const net = createConfiguredSimulator({ target: { x: 1050, y: 450 }, parameters: { netHeight: 300, netCollisionEnabled: true } });
assert.equal(net.snapshot.status, "SPIKE_NET");
assert.equal(net.snapshot.defense.result.reason, "SPIKE_NET");
assert.equal(net.snapshot.events.some((event) => event.type === "DEFENSE_TOUCH"), false);

console.log("PASS: D2 off unchanged; defender starts only after THIRD_TOUCH; mirrored direction; fixed-speed movement; true touch/miss/net; 0.65 s; identical 30/144 FPS result.");
