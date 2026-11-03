export const PLAYER_CONTACT_CONFIG = Object.freeze({
  avatarDiameter: 72,
  ballDiameter: 46,
  edgeGap: 2,
});

const ACTION_CLOCK_HOURS = Object.freeze({
  ATTACK: Object.freeze({ HOME: 1, AWAY: 11 }),
  SERVE: Object.freeze({ HOME: 1, AWAY: 11 }),
  JUMP_SERVE: Object.freeze({ HOME: 1, AWAY: 11 }),
  RECEIVE: Object.freeze({ HOME: 2, AWAY: 10 }),
  SET: Object.freeze({ HOME: 12, AWAY: 12 }),
});

function assertFinite(value, fieldName) {
  if (!Number.isFinite(value)) throw new TypeError(`${fieldName}必須是有限數字。`);
}

export function calculateJumpHeightAtTime(elapsed, duration, maximumHeight) {
  assertFinite(elapsed, "動作經過時間");
  assertFinite(duration, "動作持續時間");
  assertFinite(maximumHeight, "最大跳躍高度");
  if (duration <= 0 || maximumHeight < 0) {
    throw new RangeError("動作持續時間必須大於 0，最大跳躍高度不得小於 0。");
  }
  const progress = Math.min(Math.max(elapsed / duration, 0), 1);
  if (progress <= 0.42) return maximumHeight * (progress / 0.42);
  if (progress <= 0.58) return maximumHeight;
  return maximumHeight * (1 - ((progress - 0.58) / 0.42));
}

export function calculateSetJumpHeightAtTime(elapsed, duration, maximumHeight) {
  assertFinite(elapsed, "舉球經過時間");
  assertFinite(duration, "舉球持續時間");
  assertFinite(maximumHeight, "舉球最大高度");
  if (duration <= 0 || maximumHeight < 0) {
    throw new RangeError("舉球持續時間必須大於 0，最大高度不得小於 0。");
  }
  const progress = Math.min(Math.max(elapsed / duration, 0), 1);
  if (progress <= 0.22) return 0;
  if (progress <= 0.58) {
    const motionY = 10 + (-maximumHeight - 10) * ((progress - 0.22) / 0.36);
    return Math.max(0, -motionY);
  }
  return maximumHeight * (1 - ((progress - 0.58) / 0.42));
}

export function calculatePlayerContactPoint({
  playerX,
  playerY,
  jumpHeight = 0,
  action,
  teamId,
  avatarDiameter = PLAYER_CONTACT_CONFIG.avatarDiameter,
  ballDiameter = PLAYER_CONTACT_CONFIG.ballDiameter,
}) {
  for (const [value, fieldName] of [
    [playerX, "球員 X"],
    [playerY, "球員 Y"],
    [jumpHeight, "球員跳躍高度"],
    [avatarDiameter, "頭像直徑"],
    [ballDiameter, "排球直徑"],
  ]) assertFinite(value, fieldName);
  if (jumpHeight < 0 || avatarDiameter <= 0 || ballDiameter <= 0) {
    throw new RangeError("跳躍高度不得小於 0，頭像及排球直徑必須大於 0。");
  }
  const clockByTeam = ACTION_CLOCK_HOURS[action];
  if (!clockByTeam) throw new RangeError(`動作 ${action} 沒有正式接觸點規格。`);
  if (teamId !== "HOME" && teamId !== "AWAY") {
    throw new RangeError(`未知的球隊識別：${teamId}`);
  }
  const hour = clockByTeam[teamId];
  const angle = hour / 12 * Math.PI * 2;
  const radius = avatarDiameter / 2 + ballDiameter / 2 + PLAYER_CONTACT_CONFIG.edgeGap;
  return Object.freeze({
    x: playerX + Math.sin(angle) * radius,
    y: playerY - Math.cos(angle) * radius,
    height: jumpHeight,
    action,
    teamId,
    clockHour: hour,
  });
}
