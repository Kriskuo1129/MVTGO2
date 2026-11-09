import { WORLD_SIZE } from "../court/court-config.js";

// Simulator 世界座標直接對應 2280×900 背景圖片像素；下列梯形由 court-01.png
// 的主綠色球場外框一次性校準。執行時只使用座標幾何，不依圖片顏色判定。
const landingPolygon = Object.freeze([
  Object.freeze({ x: 625, y: 260 }),
  Object.freeze({ x: 1655, y: 260 }),
  Object.freeze({ x: 1770, y: 790 }),
  Object.freeze({ x: 510, y: 790 }),
]);
const leftLandingPolygon = Object.freeze([
  landingPolygon[0], Object.freeze({ x: WORLD_SIZE.width / 2, y: 260 }),
  Object.freeze({ x: WORLD_SIZE.width / 2, y: 790 }), landingPolygon[3],
]);
export const SPIKE_COURT_V1 = Object.freeze({
  version: "COURT_01_PIXEL_CALIBRATED_V1",
  world: WORLD_SIZE,
  bounds: Object.freeze({ minX: 510, maxX: 1770, minY: 260, maxY: 790 }),
  landingPolygon,
  leftLandingPolygon,
  netX: WORLD_SIZE.width / 2,
  netHeight: 160, // 世界像素，暫定；不是正式高度。
  netTolerance: 0.5,
  sidelineTolerance: 1,
  endlineTolerance: 1,
});

export const SPIKE_TEST_DEFAULTS = Object.freeze({
  flightDuration: 0.65,
  arcHeight: 0,
  netHeight: SPIKE_COURT_V1.netHeight,
  netCollisionEnabled: false,
});

export function validateSpikeTarget(point, court = SPIKE_COURT_V1) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.x >= court.netX || point.y < 0 || point.y > court.world.height) {
    throw new RangeError(`扣球落點必須位於對方左半場：X 0～${court.netX}（不含）、Y 0～${court.world.height}。`);
  }
  return Object.freeze({ x: point.x, y: point.y, height: 0 });
}

export function validateSpikeParameters(input = {}) {
  const p = { ...SPIKE_TEST_DEFAULTS, ...input };
  if (!Number.isFinite(p.flightDuration) || p.flightDuration < 0.05 || p.flightDuration > 3
    || !Number.isFinite(p.arcHeight) || p.arcHeight < -200 || p.arcHeight > 300
    || !Number.isFinite(p.netHeight) || p.netHeight < 0 || p.netHeight > 400
    || typeof p.netCollisionEnabled !== "boolean") {
    throw new RangeError("扣球 V1：飛行時間 0.05～3 秒、弧度／下墜 -200～300、球網高度 0～400 世界像素。");
  }
  return Object.freeze({ flightDuration: p.flightDuration, arcHeight: p.arcHeight,
    netHeight: p.netHeight, netCollisionEnabled: p.netCollisionEnabled });
}

// 球體地面投影與含線寬容差的對方矩形有交集即界內；角落使用圓而非方框。
export function isSpikeGroundIn(point, radius, court = SPIKE_COURT_V1) {
  const polygon = court.leftLandingPolygon
    ?? [{ x: court.bounds.minX, y: court.bounds.minY }, { x: court.netX, y: court.bounds.minY },
      { x: court.netX, y: court.bounds.maxY }, { x: court.bounds.minX, y: court.bounds.maxY }];
  const inside = polygon.every((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= -1e-7;
  });
  if (inside) return true;
  const distanceToSegment = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  };
  const tolerance = radius + Math.max(court.sidelineTolerance, court.endlineTolerance);
  return polygon.some((a, index) => distanceToSegment(point, a, polygon[(index + 1) % polygon.length]) <= tolerance + 1e-7);
}
