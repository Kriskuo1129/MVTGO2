// V1 實驗參數，尚未正式定案。時間：秒；高度：世界像素；角度：度。
export const ATTACK_MOTION_V1 = Object.freeze({
  maximumHeight: 60,
  jumpDuration: 1,
  takeoffDuration: 0.1,
  drawDuration: 0.2,
  swingDuration: 0.12,
  direction: "LEFT",
  maximumTakeoffDelay: 0.1,
  strikeAngleTolerance: 4,
});

export function validateAttackMotionParameters(input = {}) {
  const p = { ...ATTACK_MOTION_V1, ...input };
  if (!Number.isFinite(p.maximumHeight) || p.maximumHeight < 0 || p.maximumHeight > 180
    || !Number.isFinite(p.jumpDuration) || p.jumpDuration < 0.3 || p.jumpDuration > 3
    || ![p.takeoffDuration, p.drawDuration, p.swingDuration].every((v) => Number.isFinite(v) && v >= 0.02)
    || strikeElapsed(p) > p.jumpDuration - 0.05
    || !["LEFT", "RIGHT"].includes(p.direction)
    || !Number.isFinite(p.maximumTakeoffDelay) || p.maximumTakeoffDelay < 0 || p.maximumTakeoffDelay > 0.3
    || !Number.isFinite(p.strikeAngleTolerance) || p.strikeAngleTolerance <= 0 || p.strikeAngleTolerance > 10) {
    throw new RangeError("攻擊動畫 V1：高度 0～180、總時間 0.3～3 秒；起跳／拉弓／揮擊各至少 0.02 秒，並保留至少 0.05 秒落地；方向為 LEFT 或 RIGHT。");
  }
  return Object.freeze(p);
}

export function strikeElapsed(parameters) {
  return parameters.takeoffDuration + parameters.drawDuration + parameters.swingDuration;
}

export function sampleAttackMotion(parameters, elapsed) {
  const t = Math.max(0, Math.min(parameters.jumpDuration, elapsed));
  const drawStart = parameters.takeoffDuration;
  const swingStart = drawStart + parameters.drawDuration;
  const strike = strikeElapsed(parameters);
  const sign = parameters.direction === "LEFT" ? 1 : -1;
  let jumpPhase, angle;
  if (t >= parameters.jumpDuration) { jumpPhase = "LANDED"; angle = -360; }
  else if (t < drawStart) { jumpPhase = "TAKEOFF"; angle = 0; }
  else if (t < swingStart) { jumpPhase = "DRAW"; angle = 30 * (t - drawStart) / parameters.drawDuration; }
  else if (t <= strike) { jumpPhase = "SWING"; angle = 30 - 60 * (t - swingStart) / parameters.swingDuration; }
  else { jumpPhase = "FOLLOW_THROUGH"; angle = -30 - 330 * (t - strike) / (parameters.jumpDuration - strike); }
  // 在預定揮擊末端達到最高點；兩段曲線在最高點具有相同的零斜率。
  const jumpHeight = jumpPhase === "LANDED" ? 0 : parameters.maximumHeight * (t <= strike
    ? Math.sin(Math.PI / 2 * t / strike)
    : Math.cos(Math.PI / 2 * (t - strike) / (parameters.jumpDuration - strike)));
  // 保留未取餘數的連續角度。±360° 落地後保持，視覺上等同 0°。
  return { jumpPhase, jumpHeight, rotationAngle: sign * angle, jumpElapsed: t, jumpDuration: parameters.jumpDuration };
}

export function createAttackMotion({ playerId, simulationTime, predictedContactTime, parameters }) {
  return { playerId, parameters, predictedContactTime,
    scheduledTakeoffTime: predictedContactTime - strikeElapsed(parameters),
    scheduledAt: simulationTime, startedAt: null, takeoffPosition: null, skipReason: null,
    jumpPhase: "SCHEDULED", jumpHeight: 0, rotationAngle: 0, jumpElapsed: 0, jumpDuration: parameters.jumpDuration };
}

export function updateAttackMotion(motion, player, simulationTime) {
  if (motion.startedAt !== null) Object.assign(motion, sampleAttackMotion(motion.parameters, simulationTime - motion.startedAt));
  player.jumpHeight = motion.jumpHeight;
  player.rotationAngle = motion.rotationAngle;
  if (motion.startedAt !== null) {
    player.action = motion.jumpPhase === "LANDED" ? "IDLE" : "ATTACK";
    player.isMoving = false;
  }
}

// 把角度接近 ±30° 的揮擊時窗裁切到目前固定步進；不是動畫到點即宣告觸球。
export function getAttackStrikeWindow(motion, fromTime, toTime) {
  if (!motion || motion.startedAt === null || toTime <= fromTime) return null;
  const end = motion.startedAt + strikeElapsed(motion.parameters);
  const begin = end - motion.parameters.swingDuration * motion.parameters.strikeAngleTolerance / 60;
  const min = Math.max(0, (begin - fromTime) / (toTime - fromTime));
  const max = Math.min(1, (end - fromTime) / (toTime - fromTime));
  return min <= max ? { min, max } : null;
}
