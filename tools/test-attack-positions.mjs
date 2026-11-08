import assert from "node:assert/strict";
import {
  ATTACK_ROTATIONS, ATTACK_TYPES, DEFAULT_ATTACK_POSITIONS,
  getAttackPosition, setAttackPosition, validateAttackPositions,
} from "../src/simulator/attack-positions.js";
import { LINEUP_POSITIONS } from "../src/lineup/starting-lineup.js";
import { SimulatorCameraController, CAMERA_MODES } from "../src/simulator/camera-controller.js";
import { TeamSimulatorRenderer } from "../src/simulator/team-simulator-renderer.js";
import { SixPlayerReceiveSimulator } from "../src/simulator/team-simulator.js";
import { SIMULATOR_WORLD } from "../src/simulator/simulator.js";

let data = validateAttackPositions({ version: 1, receivingSide: "RIGHT", entries: [] });
let index = 0;
for (const rotation of ATTACK_ROTATIONS) for (const playerSlot of LINEUP_POSITIONS) {
  for (const attackType of Object.keys(ATTACK_TYPES)) {
    const selection = { rotation, playerSlot, attackType };
    assert.equal(getAttackPosition(data, selection).status, "UNCONFIGURED");
    data = setAttackPosition(data, selection, "readyPosition", { x: 1500 + index, y: 200 });
    assert.equal(getAttackPosition(data, selection).status, "UNCONFIGURED");
    data = setAttackPosition(data, selection, "attackPosition", { x: 1200 + index, y: 300 });
    index++;
  }
}
assert.equal(data.entries.length, 180);
data.entries.forEach((entry) => {
  assert.equal(entry.status, "CONFIGURED");
  assert.equal(entry.readyPosition.x - entry.attackPosition.x, 300);
});
assert.equal(new Set(data.entries.map((entry) => entry.readyPosition.x)).size, 180);
assert.deepEqual(validateAttackPositions(JSON.parse(JSON.stringify(data))), data);
assert.equal(DEFAULT_ATTACK_POSITIONS.entries.length, 1);
const selection = { rotation: "R1", playerSlot: "S", attackType: "LEFT_LONG" };
const empty = getAttackPosition(DEFAULT_ATTACK_POSITIONS, selection);
assert.equal(empty.readyPosition, null);
assert.equal(empty.attackPosition, null);
for (const point of [{ x: NaN, y: 1 }, { x: Infinity, y: 1 }, { x: 1139, y: 1 },
  { x: 2281, y: 1 }, { x: 1200, y: -1 }, { x: 1200, y: 901 }, { x: "1500", y: 1 }]) {
  assert.throws(() => setAttackPosition(data, selection, "readyPosition", point), /座標/);
}
for (const invalid of [
  { ...data, version: 2 }, { ...data, receivingSide: "LEFT" },
  { ...data, entries: [{ ...selection, readyPosition: null }] },
  { ...data, entries: [data.entries[0], data.entries[0]] },
  { ...data, entries: [{ ...empty, status: "CONFIGURED" }] },
  { ...data, entries: [{ ...empty, rotation: "R7" }] },
]) assert.throws(() => validateAttackPositions(invalid));
const partial = setAttackPosition(DEFAULT_ATTACK_POSITIONS, selection, "readyPosition", { x: 1600, y: 450 });
assert.deepEqual(validateAttackPositions(JSON.parse(JSON.stringify(partial))), partial);

// 透過 Renderer 的正式入口驗證縮放與平移，非另寫一套座標轉換。
for (const mode of Object.values(CAMERA_MODES)) {
  const camera = new SimulatorCameraController({ world: SIMULATOR_WORLD, mode });
  camera.centerX = 1600;
  for (const size of [{ width: 1200, height: 500 }, { width: 600, height: 600 }]) {
    const renderer = Object.create(TeamSimulatorRenderer.prototype);
    renderer.camera = camera;
    renderer.viewport = { getBoundingClientRect: () => ({ left: 25, top: 40, ...size }) };
    const screen = camera.worldToScreen({ worldX: 1700, worldY: 450, viewportWidth: size.width, viewportHeight: size.height });
    const world = renderer.clientToWorld(screen.x + 25, screen.y + 40);
    assert.ok(Math.abs(world.x - 1700) < 1e-8);
    assert.ok(Math.abs(world.y - 450) < 1e-8);
    let calls = 0;
    renderer.onTargetSelected = () => calls++;
    renderer.interactionEnabled = false;
    renderer.handleClick({ clientX: screen.x + 25, clientY: screen.y + 40 });
    assert.equal(calls, 0);
    renderer.interactionEnabled = true;
    renderer.handleClick({ clientX: screen.x + 25, clientY: screen.y + 40 });
    assert.equal(calls, 1);
  }
}

// 編輯資料不參與既有六人實驗狀態；固定步進的相同輸入維持相同結果。
const first = new SixPlayerReceiveSimulator({ random: () => 0.5 });
const second = new SixPlayerReceiveSimulator({ random: () => 0.5 });
first.launch({ x: 1800, y: 450 }); second.launch({ x: 1800, y: 450 });
const before = JSON.stringify(first.getSnapshot());
setAttackPosition(data, selection, "attackPosition", { x: 1250, y: 400 });
assert.equal(JSON.stringify(first.getSnapshot()), before);
for (let frame = 0; frame < 30; frame++) { first.updateFrame(1 / 120); second.updateFrame(1 / 120); }
assert.deepEqual(first.getSnapshot(), second.getSnapshot());
console.log("PASS: 180 independent combinations, partial/unconfigured, JSON validation/roundtrip, Camera/Renderer conversion and click isolation, unchanged six-player simulation.");
