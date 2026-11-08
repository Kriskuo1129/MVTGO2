import { WORLD_SIZE } from "../court/court-config.js";

// 獨立 V1 實驗幾何，並非正式排球場尺寸或背景圖片線條的物理校準。
// 既有資料只有世界尺寸與左右半場。暫用世界邊緣內縮 10% 的矩形作有效場界。
export const SPIKE_COURT_V1 = Object.freeze({
  version: "EXPERIMENT_V1",
  world: WORLD_SIZE,
  bounds: Object.freeze({ minX: WORLD_SIZE.width * 0.1, maxX: WORLD_SIZE.width * 0.9,
    minY: WORLD_SIZE.height * 0.1, maxY: WORLD_SIZE.height * 0.9 }),
  netX: WORLD_SIZE.width / 2,
  netHeight: 160, // 世界像素，暫定；不是正式高度。
  netTolerance: 0.5,
  sidelineTolerance: 1,
  endlineTolerance: 1,
});

export const SPIKE_TEST_DEFAULTS = Object.freeze({ flightDuration: 0.65, arcHeight: 0, netHeight: SPIKE_COURT_V1.netHeight });

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
    || !Number.isFinite(p.netHeight) || p.netHeight < 0 || p.netHeight > 400) {
    throw new RangeError("扣球 V1：飛行時間 0.05～3 秒、弧度／下墜 -200～300、球網高度 0～400 世界像素。");
  }
  return Object.freeze({ flightDuration: p.flightDuration, arcHeight: p.arcHeight, netHeight: p.netHeight });
}

// 球體地面投影與含線寬容差的對方矩形有交集即界內；角落使用圓而非方框。
export function isSpikeGroundIn(point, radius, court = SPIKE_COURT_V1) {
  const b = court.bounds;
  const x = Math.max(b.minX - court.endlineTolerance, Math.min(court.netX, point.x));
  const y = Math.max(b.minY - court.sidelineTolerance, Math.min(b.maxY + court.sidelineTolerance, point.y));
  return Math.hypot(point.x - x, point.y - y) <= radius + 1e-7;
}
