import { createSimulatorBall, launchSimulatorBall } from "./ball.js";
import { isSpikeGroundIn, SPIKE_COURT_V1 } from "./spike-court.js";
import { getSpikeReferenceSpeed } from "./attack-quality.js";

export const NATURAL_SPIKE_PHYSICS_V1 = Object.freeze({
  gravity: 980,
  verticalRestitution: 0.48,
  horizontalBounceRetention: 0.72,
  horizontalDampingPerSecond: 1.8,
  minimumBounceSpeed: 70,
  restHorizontalSpeed: 18,
  netHorizontalRetention: 0.15,
  netDownwardSpeed: 120,
});

export function createTargetedNaturalSpikeLaunch({ start, target, speedLevel,
  radius, physics = NATURAL_SPIKE_PHYSICS_V1 }) {
  if (![start?.x, start?.y, start?.height, target?.x, target?.y, radius].every(Number.isFinite)) {
    throw new TypeError("目標彈道需要有效起點、目標與球半徑。");
  }
  const dx = target.x - start.x, dy = target.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) throw new RangeError("扣球目標不可等於觸球位置。");
  const speed = getSpikeReferenceSpeed(speedLevel);
  const duration = distance / speed;
  const verticalSpeed = (radius - start.height + 0.5 * physics.gravity * duration ** 2) / duration;
  const velocity = Object.freeze({ x: dx / distance * speed, y: dy / distance * speed, height: verticalSpeed });
  return Object.freeze({ start: Object.freeze({ ...start }), target: Object.freeze({ ...target }),
    speedLevel, duration, velocity, actualSpeed: Math.hypot(velocity.x, velocity.y, velocity.height) });
}

export function timeToGround(height, verticalSpeed, radius, gravity = NATURAL_SPIKE_PHYSICS_V1.gravity) {
  const discriminant = verticalSpeed ** 2 + 2 * gravity * Math.max(0, height - radius);
  return Math.max(0, (verticalSpeed + Math.sqrt(discriminant)) / gravity);
}

export function createNaturalPredictionBall(ball, velocity, radius, physics = NATURAL_SPIKE_PHYSICS_V1) {
  const duration = Math.max(1 / 120, timeToGround(ball.height, velocity.height, radius, physics.gravity));
  const target = { x: ball.x + velocity.x * duration, y: ball.y + velocity.y * duration, height: radius };
  const arcHeight = (velocity.height * duration - radius + ball.height) / 4;
  const prediction = createSimulatorBall({ x: ball.x, y: ball.y, height: ball.height });
  launchSimulatorBall(prediction, { start: { x: ball.x, y: ball.y, height: ball.height }, target, duration, arcHeight });
  return prediction;
}

export function sampleNaturalStep(ball, velocity, deltaSeconds, gravity = NATURAL_SPIKE_PHYSICS_V1.gravity) {
  return Object.freeze({
    x: ball.x + velocity.x * deltaSeconds,
    y: ball.y + velocity.y * deltaSeconds,
    height: ball.height + velocity.height * deltaSeconds - 0.5 * gravity * deltaSeconds ** 2,
    velocity: Object.freeze({ x: velocity.x, y: velocity.y, height: velocity.height - gravity * deltaSeconds }),
  });
}

export function getGroundContactFraction(ball, velocity, deltaSeconds, radius, gravity = NATURAL_SPIKE_PHYSICS_V1.gravity) {
  if (ball.height <= radius + 1e-9 && velocity.height <= 0) return 0;
  const a = -0.5 * gravity, b = velocity.height, c = ball.height - radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const roots = [(-b + Math.sqrt(discriminant)) / (2 * a), (-b - Math.sqrt(discriminant)) / (2 * a)]
    .filter((time) => time >= -1e-10 && time <= deltaSeconds + 1e-10);
  return roots.length ? Math.min(...roots) / deltaSeconds : null;
}

export function classifyNaturalGround(point, radius, court = SPIKE_COURT_V1) {
  return isSpikeGroundIn(point, radius, court) ? "SPIKE_LANDED" : "SPIKE_OUT";
}
