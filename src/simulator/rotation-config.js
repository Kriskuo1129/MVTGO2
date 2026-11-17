import { ATTACK_TYPES } from "./attack-positions.js";

export const RALLY_ROTATIONS = Object.freeze(["R1", "R6", "R5", "R4", "R3", "R2"]);
export const ROTATION_JOBS = Object.freeze(["S", "OH1", "OH2", "MB1", "MB2", "OP"]);

const freezeLists = (value) => Object.freeze(Object.fromEntries(Object.entries(value)
  .map(([key, list]) => [key, Object.freeze([...list])])));

const CONFIG = {
  R1: {
    serverJob: "S", front: ["OH1", "MB1", "OP"], back: ["S", "OH2", "MB2"],
    serveReceive: ["OH1", "OH2", "MB2"], defenseReceive: ["S", "OH2", "MB2"],
    attacks: { S: null, OH1: ATTACK_TYPES.RIGHT_LONG, MB1: ATTACK_TYPES.MIDDLE_QUICK,
      OP: ATTACK_TYPES.LEFT_LONG, OH2: ATTACK_TYPES.BACK_CENTER_LONG, MB2: null },
    alternateSet: { setterJob: "OP", targetJob: "OH1", attackType: ATTACK_TYPES.RIGHT_LONG },
    blocks: { LEFT_LONG: ["OH1", "MB1"], RIGHT_LONG: ["MB1", "OP"],
      MIDDLE_QUICK: ["MB1"], BACK_CENTER_LONG: ["MB1"], BACK_RIGHT_LONG: ["MB1", "OP"] },
  },
  R6: {
    serverJob: "OH1", front: ["MB1", "OP", "OH2"], back: ["S", "OH1", "MB2"],
    serveReceive: ["OH1", "OH2", "MB2"], defenseReceive: ["S", "OH1", "MB2"],
    attacks: { S: null, OH1: ATTACK_TYPES.BACK_CENTER_LONG, MB1: ATTACK_TYPES.MIDDLE_QUICK,
      OP: ATTACK_TYPES.RIGHT_LONG, OH2: ATTACK_TYPES.LEFT_LONG, MB2: null },
    alternateSet: { setterJob: "OP", targetJob: "OH2", attackType: ATTACK_TYPES.LEFT_LONG },
    blocks: { LEFT_LONG: ["MB1", "OP"], RIGHT_LONG: ["MB1", "OH2"],
      MIDDLE_QUICK: ["MB1"], BACK_CENTER_LONG: ["MB1"], BACK_RIGHT_LONG: ["MB1"] },
  },
  R5: {
    serverJob: "MB1", front: ["OP", "OH2", "MB2"], back: ["S", "OH1", "MB1"],
    serveReceive: ["OH1", "OH2", "MB1"], defenseReceive: ["S", "OH1", "MB1"],
    attacks: { S: null, OH1: ATTACK_TYPES.BACK_CENTER_LONG, MB1: null,
      OP: ATTACK_TYPES.RIGHT_LONG, OH2: ATTACK_TYPES.LEFT_LONG, MB2: ATTACK_TYPES.MIDDLE_QUICK },
    alternateSet: { setterJob: "OP", targetJob: "OH2", attackType: ATTACK_TYPES.LEFT_LONG },
    blocks: { LEFT_LONG: ["MB2", "OP"], RIGHT_LONG: ["MB2", "OH2"],
      MIDDLE_QUICK: ["MB2"], BACK_CENTER_LONG: ["MB2"], BACK_RIGHT_LONG: ["MB2"] },
  },
  R4: {
    serverJob: "OP", front: ["S", "OH2", "MB2"], back: ["OH1", "MB1", "OP"],
    serveReceive: ["OH1", "OH2", "MB1"], defenseReceive: ["OH1", "MB1", "OP"],
    attacks: { S: null, OH1: ATTACK_TYPES.BACK_CENTER_LONG, MB1: null,
      OP: ATTACK_TYPES.BACK_RIGHT_LONG, OH2: ATTACK_TYPES.LEFT_LONG, MB2: ATTACK_TYPES.MIDDLE_QUICK },
    alternateSet: { setterJob: "OP", targetJob: "OH2", attackType: ATTACK_TYPES.LEFT_LONG },
    blocks: { LEFT_LONG: ["MB2", "S"], RIGHT_LONG: ["MB2", "OH2"],
      MIDDLE_QUICK: ["MB2"], BACK_CENTER_LONG: ["MB2"], BACK_RIGHT_LONG: ["MB2"] },
  },
  R3: {
    serverJob: "OH2", front: ["S", "OH1", "MB2"], back: ["MB1", "OP", "OH2"],
    serveReceive: ["OH1", "OH2", "MB1"], defenseReceive: ["MB1", "OP", "OH2"],
    attacks: { S: null, OH1: ATTACK_TYPES.LEFT_LONG, MB1: null,
      OP: ATTACK_TYPES.BACK_RIGHT_LONG, OH2: ATTACK_TYPES.BACK_CENTER_LONG, MB2: ATTACK_TYPES.MIDDLE_QUICK },
    alternateSet: { setterJob: "OP", targetJob: "OH1", attackType: ATTACK_TYPES.LEFT_LONG },
    blocks: { LEFT_LONG: ["MB2", "S"], RIGHT_LONG: ["MB2", "OH1"],
      MIDDLE_QUICK: ["MB2"], BACK_CENTER_LONG: ["MB2"], BACK_RIGHT_LONG: ["MB2"] },
  },
  R2: {
    serverJob: "MB2", front: ["S", "OH1", "MB1"], back: ["OP", "OH2", "MB2"],
    serveReceive: ["OH1", "OH2", "MB2"], defenseReceive: ["OP", "OH2", "MB2"],
    attacks: { S: null, OH1: ATTACK_TYPES.LEFT_LONG, MB1: ATTACK_TYPES.MIDDLE_QUICK,
      OP: ATTACK_TYPES.BACK_RIGHT_LONG, OH2: ATTACK_TYPES.BACK_CENTER_LONG, MB2: null },
    alternateSet: { setterJob: "OP", targetJob: "OH1", attackType: ATTACK_TYPES.LEFT_LONG },
    blocks: { LEFT_LONG: ["MB1", "S"], RIGHT_LONG: ["MB1", "OH1"],
      MIDDLE_QUICK: ["MB1"], BACK_CENTER_LONG: ["MB1"], BACK_RIGHT_LONG: ["MB1"] },
  },
};

export const ROTATION_CONFIGS = Object.freeze(Object.fromEntries(RALLY_ROTATIONS.map((rotation) => {
  const entry = CONFIG[rotation];
  return [rotation, Object.freeze({ rotation, serverJob: entry.serverJob,
    front: Object.freeze(entry.front), back: Object.freeze(entry.back),
    serveReceive: Object.freeze(entry.serveReceive), defenseReceive: Object.freeze(entry.defenseReceive),
    attacks: Object.freeze({ ...entry.attacks }), alternateSet: Object.freeze({ ...entry.alternateSet }),
    blocks: freezeLists(entry.blocks) })];
})));

export function getRotationConfig(rotation = "R1") {
  const config = ROTATION_CONFIGS[rotation];
  if (!config) throw new RangeError(`未知輪次：${rotation}`);
  return config;
}

export function nextRallyRotation(rotation) {
  const index = RALLY_ROTATIONS.indexOf(rotation);
  if (index < 0) throw new RangeError(`未知輪次：${rotation}`);
  return RALLY_ROTATIONS[(index + 1) % RALLY_ROTATIONS.length];
}
