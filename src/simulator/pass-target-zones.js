import { RECEIVE_QUALITIES } from "./receive-quality.js";

export const PASS_TARGET_ZONES_V1 = Object.freeze({
  perfect: Object.freeze({
    minX: 1201,
    maxX: 1306.6451612903227,
    minY: 348.5483870967742,
    maxY: 489.1935483870967,
  }),
  normalOuter: Object.freeze({
    minX: 1185.483870967742,
    maxX: 1462.5,
    minY: 325,
    maxY: 646.7741935483871,
  }),
  bad: Object.freeze({
    minX: 2300,
    maxX: 2440,
    minY: 320,
    maxY: 620,
  }),
});

function validateRectangle(rectangle, label) {
  const values = [rectangle?.minX, rectangle?.maxX, rectangle?.minY, rectangle?.maxY];
  if (!values.every(Number.isFinite) || rectangle.minX >= rectangle.maxX || rectangle.minY >= rectangle.maxY) {
    throw new RangeError(`${label} 必須是有效的世界座標矩形。`);
  }
  return Object.freeze({ ...rectangle });
}

function contains(outer, inner) {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX
    && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

function intersects(left, right) {
  return left.minX < right.maxX && left.maxX > right.minX
    && left.minY < right.maxY && left.maxY > right.minY;
}

function createNormalPartitions(outer, exclusion) {
  return [
    { minX: outer.minX, maxX: outer.maxX, minY: outer.minY, maxY: exclusion.minY },
    { minX: outer.minX, maxX: outer.maxX, minY: exclusion.maxY, maxY: outer.maxY },
    { minX: outer.minX, maxX: exclusion.minX, minY: exclusion.minY, maxY: exclusion.maxY },
    { minX: exclusion.maxX, maxX: outer.maxX, minY: exclusion.minY, maxY: exclusion.maxY },
  ].filter((rect) => rect.maxX > rect.minX && rect.maxY > rect.minY);
}

function area(rectangle) {
  return (rectangle.maxX - rectangle.minX) * (rectangle.maxY - rectangle.minY);
}

function readRandom(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("目標取樣亂數必須介於 0（含）至 1（不含）。");
  }
  return value;
}

function sampleRectangle(rectangle, random) {
  return Object.freeze({
    x: rectangle.minX + readRandom(random) * (rectangle.maxX - rectangle.minX),
    y: rectangle.minY + readRandom(random) * (rectangle.maxY - rectangle.minY),
  });
}

export function createPassTargetZones({ perfect, normalOuter, bad }, world) {
  const worldRect = validateRectangle({ minX: 0, maxX: world.width, minY: 0, maxY: world.height }, "世界範圍");
  const perfectRect = validateRectangle(perfect, "PERFECT 黃色區域");
  const normalRect = validateRectangle(normalOuter, "NORMAL 藍色區域");
  const badRect = validateRectangle(bad, "BAD 場外區域");
  if (!contains(worldRect, perfectRect) || !contains(worldRect, normalRect)) {
    throw new RangeError("PERFECT 與 NORMAL 區域必須位於世界範圍內。");
  }
  if (!contains(normalRect, perfectRect)) {
    throw new RangeError("黃色 PERFECT 區域必須完整位於藍色 NORMAL 外框內，才能建立互斥範圍。");
  }
  if (intersects(worldRect, badRect)) {
    throw new RangeError("BAD 目標區域必須完整位於場外。");
  }
  const normalPartitions = Object.freeze(createNormalPartitions(normalRect, perfectRect).map(Object.freeze));
  if (normalPartitions.reduce((sum, rect) => sum + area(rect), 0) <= 0) {
    throw new RangeError("NORMAL 藍色區域扣除黃色區域後不可為空。");
  }
  return Object.freeze({ perfect: perfectRect, normalOuter: normalRect, normalPartitions, bad: badRect });
}

export function samplePassTarget(zones, quality, random = Math.random) {
  if (quality === RECEIVE_QUALITIES.PERFECT) return sampleRectangle(zones.perfect, random);
  if (quality === RECEIVE_QUALITIES.BAD) return sampleRectangle(zones.bad, random);
  if (quality !== RECEIVE_QUALITIES.NORMAL) throw new RangeError(`未知的一傳品質：${quality}`);
  const totalArea = zones.normalPartitions.reduce((sum, rect) => sum + area(rect), 0);
  let selection = readRandom(random) * totalArea;
  const selected = zones.normalPartitions.find((rect) => {
    selection -= area(rect);
    return selection < 0;
  }) ?? zones.normalPartitions.at(-1);
  return sampleRectangle(selected, random);
}
