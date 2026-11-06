export const RECEIVE_SPEED_LEVELS = Object.freeze({
  ULTRA_FAST: "ULTRA_FAST",
  FAST: "FAST",
  MEDIUM: "MEDIUM",
  SLOW: "SLOW",
});

export const RECEIVE_SPEED_OPTIONS = Object.freeze([
  Object.freeze({ level: RECEIVE_SPEED_LEVELS.ULTRA_FAST, label: "超快", flightDuration: 0.8, arcHeight: 120, minimumScale: 0.78, animationDurationMs: 900 }),
  Object.freeze({ level: RECEIVE_SPEED_LEVELS.FAST, label: "快", flightDuration: 1.0, arcHeight: 190, minimumScale: 0.78, animationDurationMs: 420 }),
  Object.freeze({ level: RECEIVE_SPEED_LEVELS.MEDIUM, label: "中", flightDuration: 1.3, arcHeight: 270, minimumScale: 0.78, animationDurationMs: 350 }),
  Object.freeze({ level: RECEIVE_SPEED_LEVELS.SLOW, label: "慢", flightDuration: 1.5, arcHeight: 360, minimumScale: 0.78, animationDurationMs: 300 }),
]);

export const RECEIVE_ANIMATION_CLASS_NAMES = Object.freeze([
  "receive-speed-ultra-fast",
  "receive-speed-fast",
  "receive-speed-medium",
  "receive-speed-slow",
]);

const RECEIVE_ANIMATION_PROFILES = Object.freeze({
  [RECEIVE_SPEED_LEVELS.ULTRA_FAST]: Object.freeze({
    ...RECEIVE_SPEED_OPTIONS[0],
    className: "receive-speed-ultra-fast",
  }),
  [RECEIVE_SPEED_LEVELS.FAST]: Object.freeze({
    ...RECEIVE_SPEED_OPTIONS[1],
    className: "receive-speed-fast",
  }),
  [RECEIVE_SPEED_LEVELS.MEDIUM]: Object.freeze({
    ...RECEIVE_SPEED_OPTIONS[2],
    className: "receive-speed-medium",
  }),
  [RECEIVE_SPEED_LEVELS.SLOW]: Object.freeze({
    ...RECEIVE_SPEED_OPTIONS[3],
    className: "receive-speed-slow",
  }),
});

export function getReceiveSpeedLevel(flightDuration) {
  if (!Number.isFinite(flightDuration) || flightDuration <= 0) {
    throw new TypeError("接球動畫需要有效的球飛行時間。");
  }
  if (flightDuration <= 0.9) return RECEIVE_SPEED_LEVELS.ULTRA_FAST;
  if (flightDuration <= 1.15) return RECEIVE_SPEED_LEVELS.FAST;
  if (flightDuration <= 1.4) return RECEIVE_SPEED_LEVELS.MEDIUM;
  return RECEIVE_SPEED_LEVELS.SLOW;
}

export function getReceiveAnimationProfile(flightDuration) {
  return RECEIVE_ANIMATION_PROFILES[getReceiveSpeedLevel(flightDuration)];
}

export const getReceiveSpeedProfile = getReceiveAnimationProfile;

export function getReceivePushDirection(receiveDirection) {
  if (receiveDirection === "FROM_LEFT") return 1;
  if (receiveDirection === "FROM_RIGHT") return -1;
  throw new RangeError(`未知的來球方向：${receiveDirection}`);
}
