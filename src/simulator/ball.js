function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

export const BALL_TRAJECTORY_TYPES = Object.freeze({
  HIGH_ARC: "HIGH_ARC",
});

export function createSimulatorBall({ x, y, height = 0 }) {
  return {
    x,
    y,
    height,
    start: Object.freeze({ x, y, height }),
    target: Object.freeze({ x, y, height: 0 }),
    duration: 0,
    elapsed: 0,
    progress: 0,
    arcHeight: 0,
    trajectoryType: BALL_TRAJECTORY_TYPES.HIGH_ARC,
    inFlight: false,
    landed: false,
  };
}

export function launchSimulatorBall(ball, {
  start,
  target,
  duration,
  arcHeight,
  trajectoryType = BALL_TRAJECTORY_TYPES.HIGH_ARC,
}) {
  if (trajectoryType !== BALL_TRAJECTORY_TYPES.HIGH_ARC) {
    throw new RangeError(`尚未支援球路類型：${trajectoryType}`);
  }
  Object.assign(ball, {
    x: start.x,
    y: start.y,
    height: start.height,
    start: Object.freeze({ ...start }),
    target: Object.freeze({ x: target.x, y: target.y, height: target.height ?? 0 }),
    duration,
    elapsed: 0,
    progress: 0,
    arcHeight,
    trajectoryType,
    inFlight: true,
    landed: false,
  });
}

export function stepSimulatorBall(ball, deltaSeconds) {
  if (!ball.inFlight) return;
  ball.elapsed = Math.min(ball.duration, ball.elapsed + deltaSeconds);
  const sample = sampleSimulatorBall(ball, ball.elapsed);
  ball.progress = sample.progress;
  ball.x = sample.x;
  ball.y = sample.y;
  ball.height = sample.height;
  if (ball.progress >= 1) {
    ball.inFlight = false;
    ball.landed = true;
    ball.height = ball.target.height;
  }
}

export function sampleSimulatorBall(ball, elapsed) {
  const clampedElapsed = Math.min(Math.max(elapsed, 0), ball.duration);
  const progress = ball.duration === 0 ? 1 : clampedElapsed / ball.duration;
  return Object.freeze({
    elapsed: clampedElapsed,
    progress,
    x: lerp(ball.start.x, ball.target.x, progress),
    y: lerp(ball.start.y, ball.target.y, progress),
    height: Math.max(
      0,
      lerp(ball.start.height, ball.target.height, progress)
        + ball.arcHeight * 4 * progress * (1 - progress),
    ),
  });
}
