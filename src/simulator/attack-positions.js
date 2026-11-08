import { LINEUP_POSITIONS } from "../lineup/starting-lineup.js";
import { SIMULATOR_WORLD } from "./simulator.js";

export const ATTACK_POSITION_VERSION = 1;
export const ATTACK_ROTATIONS = Object.freeze(["R1", "R2", "R3", "R4", "R5", "R6"]);
export const ATTACK_TYPES = Object.freeze({
  LEFT_LONG: "LEFT_LONG",
  RIGHT_LONG: "RIGHT_LONG",
  BACK_CENTER_LONG: "BACK_CENTER_LONG",
  MIDDLE_QUICK: "MIDDLE_QUICK",
  BACK_RIGHT_LONG: "BACK_RIGHT_LONG",
});
export const ATTACK_TYPE_LABELS = Object.freeze({
  LEFT_LONG: "四號位長攻",
  RIGHT_LONG: "二號位長攻",
  BACK_CENTER_LONG: "六號位後排長攻",
  MIDDLE_QUICK: "三號位快攻",
  BACK_RIGHT_LONG: "二號位後排長攻",
});
// 與六人接發球實驗共用右半場世界範圍；本階段不判定輪轉或前後排進攻資格。
export const ATTACK_POSITION_BOUNDS = Object.freeze({
  minX: SIMULATOR_WORLD.width / 2, maxX: SIMULATOR_WORLD.width,
  minY: 0, maxY: SIMULATOR_WORLD.height,
});

function validateSelection({ rotation, playerSlot, attackType }) {
  if (!ATTACK_ROTATIONS.includes(rotation) || !LINEUP_POSITIONS.includes(playerSlot)
    || !Object.hasOwn(ATTACK_TYPES, attackType)) {
    throw new RangeError("輪次、球員槽位或進攻類型無效。");
  }
}

export function validateAttackPosition(point) {
  const b = ATTACK_POSITION_BOUNDS;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < b.minX || point.x > b.maxX || point.y < b.minY || point.y > b.maxY) {
    throw new RangeError(`座標必須為有限數值，且位於接球方右半場 X ${b.minX}～${b.maxX}、Y ${b.minY}～${b.maxY}（世界像素）。`);
  }
  return Object.freeze({ x: point.x, y: point.y });
}

export function attackPositionKey(entry) {
  validateSelection(entry);
  return `${entry.rotation}/${entry.playerSlot}/${entry.attackType}`;
}

// 缺少任一點仍為 UNCONFIGURED；null 是明確未設定，缺少欄位則拒絕匯入。
export function validateAttackPositions(data) {
  if (data?.version !== ATTACK_POSITION_VERSION || data.receivingSide !== "RIGHT"
    || !Array.isArray(data.entries)) throw new TypeError("站位 JSON 需要 version: 1、receivingSide: RIGHT 與 entries 陣列。");
  const keys = new Set();
  const entries = data.entries.map((entry) => {
    const key = attackPositionKey(entry);
    if (keys.has(key)) throw new Error(`重複站位：${key}`);
    keys.add(key);
    const points = {};
    for (const field of ["readyPosition", "attackPosition"]) {
      if (!Object.hasOwn(entry, field)) throw new TypeError(`${key} 缺少 ${field}；未設定時請明確使用 null。`);
      points[field] = entry[field] === null ? null : validateAttackPosition(entry[field]);
    }
    const status = points.readyPosition && points.attackPosition ? "CONFIGURED" : "UNCONFIGURED";
    if (entry.status !== undefined && entry.status !== status) throw new Error(`${key} 的 status 與座標不一致。`);
    return Object.freeze({ rotation: entry.rotation, playerSlot: entry.playerSlot,
      attackType: entry.attackType, ...points, status });
  });
  entries.sort((a, b) => attackPositionKey(a).localeCompare(attackPositionKey(b)));
  return Object.freeze({ version: ATTACK_POSITION_VERSION, receivingSide: "RIGHT", entries: Object.freeze(entries) });
}

// 使用者確認的唯一正式預設；其餘 179 組不補值。
export const DEFAULT_ATTACK_POSITIONS = validateAttackPositions({ version: 1, receivingSide: "RIGHT", entries: [{
  rotation: "R1", playerSlot: "OH1", attackType: ATTACK_TYPES.LEFT_LONG,
  readyPosition: { x: 1422.0553176739254, y: 759.6263406329012 },
  attackPosition: { x: 1268.25, y: 673.6953125 },
}] });

export function getAttackPosition(data, selection) {
  const key = attackPositionKey(selection);
  return data.entries.find((entry) => attackPositionKey(entry) === key)
    ?? Object.freeze({ ...selection, readyPosition: null, attackPosition: null, status: "UNCONFIGURED" });
}

export function setAttackPosition(data, selection, field, point) {
  if (!["readyPosition", "attackPosition"].includes(field)) throw new Error("未知站位點。");
  const key = attackPositionKey(selection);
  const { status, ...current } = getAttackPosition(data, selection);
  const next = { ...current, [field]: point };
  return validateAttackPositions({ ...data, entries: [
    ...data.entries.filter((entry) => attackPositionKey(entry) !== key), next,
  ] });
}
