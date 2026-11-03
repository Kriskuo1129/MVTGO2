import {
  BALL_SPEED_DEFAULT,
  SERVE_SPEED_NORMAL,
  JUMP_SERVE_SPEED,
} from "../config/match-params.js";

export const BALL_FLIGHT_CONFIG = Object.freeze({
  defaultSpeed: BALL_SPEED_DEFAULT,
  serveSpeed: SERVE_SPEED_NORMAL,
  jumpServeSpeed: JUMP_SERVE_SPEED,
  minimumDuration: 80,
});

function validatePoint(point, fieldName) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.height)) {
    throw new TypeError(`${fieldName}必須包含有效的 x、y、height。`);
  }
  if (point.height < 0) throw new RangeError(`${fieldName}.height 不得小於 0。`);
}

export function calculateBallDistance(start, end) {
  validatePoint(start, "軌跡起點");
  validatePoint(end, "軌跡終點");
  return Math.hypot(end.x - start.x, end.y - start.y, end.height - start.height);
}

export function createBallFlight({
  start,
  end,
  speed = BALL_FLIGHT_CONFIG.defaultSpeed,
  duration,
}) {
  const distance = calculateBallDistance(start, end);
  if (distance <= 0) throw new RangeError("排球軌跡起點與終點不可完全相同。");
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) {
    throw new RangeError("指定飛行時間必須是大於 0 的有限毫秒數。");
  }
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new RangeError("排球速度必須是大於 0 的有限數字。");
  }
  const durationMs = duration ?? Math.max(
    BALL_FLIGHT_CONFIG.minimumDuration,
    distance / speed * 1000,
  );
  return Object.freeze({
    start: Object.freeze({ x: start.x, y: start.y, height: start.height }),
    end: Object.freeze({ x: end.x, y: end.y, height: end.height }),
    distance,
    speed: duration === undefined ? speed : distance / (durationMs / 1000),
    duration: durationMs,
    status: "READY",
  });
}

export function sampleBallFlight(flight, elapsed) {
  if (!flight || !Number.isFinite(flight.duration) || flight.duration <= 0) {
    throw new TypeError("排球軌跡資料無效。");
  }
  if (!Number.isFinite(elapsed)) throw new TypeError("軌跡經過時間必須是有限數字。");
  const progress = Math.min(Math.max(elapsed / flight.duration, 0), 1);
  return Object.freeze({
    x: flight.start.x + (flight.end.x - flight.start.x) * progress,
    y: flight.start.y + (flight.end.y - flight.start.y) * progress,
    height: flight.start.height + (flight.end.height - flight.start.height) * progress,
    progress,
    status: progress >= 1 ? "COMPLETED" : "IN_FLIGHT",
  });
}
