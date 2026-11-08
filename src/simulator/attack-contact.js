// ATTACK 專屬幾何；世界像素。下降段高點接觸，不共用 RECEIVE／SET 判定。
export const ATTACK_CONTACT_CONFIG = Object.freeze({
  minimumBaseHeight: 140,
  heightTolerance: 20,
  horizontalTolerance: 18,
  verticalTolerance: 18,
  minimumOverlapDepth: 16,
});

export function createAttackContactGeometry({ avatarWorldSize, ballWorldSize, contactHeight, direction = "LEFT" }) {
  const config = ATTACK_CONTACT_CONFIG;
  if (![avatarWorldSize, ballWorldSize, contactHeight].every((n) => Number.isFinite(n) && n > 0)
    || contactHeight - config.heightTolerance < config.minimumBaseHeight) {
    throw new RangeError("ATTACK 接觸高度必須至少為 160 世界像素，尺寸必須為正有限值。");
  }
  const avatarRadius = avatarWorldSize / 2, ballRadius = ballWorldSize / 2;
  const maximumCenterDistance = avatarRadius + ballRadius - config.minimumOverlapDepth;
  const anchorDistance = maximumCenterDistance - Math.max(config.horizontalTolerance, config.verticalTolerance);
  if (anchorDistance <= 0 || config.minimumOverlapDepth >= Math.min(avatarRadius, ballRadius)) {
    throw new RangeError("ATTACK 尺寸不足以形成可見重疊。");
  }
  return Object.freeze({ type: "ATTACK", ...config, avatarRadius, ballRadius, maximumCenterDistance,
    contactHeight, minimumHeight: contactHeight - config.heightTolerance,
    maximumHeight: contactHeight + config.heightTolerance,
    // 接球方右半場面向左側球網，預期接觸在頭像左上方。
    offset: Object.freeze({ x: (direction === "RIGHT" ? 1 : -1) * Math.sin(Math.PI / 3) * anchorDistance,
      y: -Math.cos(Math.PI / 3) * anchorDistance }),
  });
}

// jumpHeight 為實際跳躍高度；沒有跳躍的呼叫者預設為 0。
export function getExpectedAttackContact(player, geometry) {
  const jumpHeight = player.jumpHeight ?? 0;
  if (![player.x, player.y, jumpHeight].every(Number.isFinite) || jumpHeight < 0) throw new RangeError("攻擊預期接觸點需要有限座標與非負跳躍高度。");
  return Object.freeze({ x: player.x + geometry.offset.x,
    y: player.y + geometry.offset.y + geometry.contactHeight,
    height: geometry.contactHeight + jumpHeight });
}

function circleInterval(x, y, dx, dy, radius) {
  const a = dx * dx + dy * dy, b = 2 * (x * dx + y * dy), c = x * x + y * y - radius * radius;
  if (a < 1e-12) return c <= 1e-9 ? [0, 1] : null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

export function detectAttackContact({ previousBall, currentBall, previousPlayer, currentPlayer,
  assignedPlayerId, flightStatus, geometry, strikeWindow = { min: 0, max: 1 } }) {
  if (flightStatus !== "IN_PLAY" || !previousBall.inFlight || currentPlayer.id !== assignedPlayerId
    || currentPlayer.action === "RECEIVE" || !strikeWindow) {
    return Object.freeze({ contacted: false, reason: "NOT_ELIGIBLE" });
  }
  if (currentBall.height >= previousBall.height) return Object.freeze({ contacted: false, reason: "NOT_DESCENDING" });
  const jump0 = previousPlayer.jumpHeight ?? 0, jump1 = currentPlayer.jumpHeight ?? 0;
  if (![previousBall.x, previousBall.y, previousBall.height, currentBall.x, currentBall.y, currentBall.height,
    previousPlayer.x, previousPlayer.y, currentPlayer.x, currentPlayer.y, jump0, jump1].every(Number.isFinite)
    || jump0 < 0 || jump1 < 0) return Object.freeze({ contacted: false, reason: "INVALID_COORDINATES" });
  const x0 = previousBall.x - previousPlayer.x, x1 = currentBall.x - currentPlayer.x;
  const y0 = previousBall.y - previousBall.height - previousPlayer.y + jump0;
  const y1 = currentBall.y - currentBall.height - currentPlayer.y + jump1;
  const h0 = previousBall.height - jump0, h1 = currentBall.height - jump1, dh = h1 - h0;
  const ellipse = circleInterval((x0 - geometry.offset.x) / geometry.horizontalTolerance,
    (y0 - geometry.offset.y) / geometry.verticalTolerance,
    (x1 - x0) / geometry.horizontalTolerance, (y1 - y0) / geometry.verticalTolerance, 1);
  const overlap = circleInterval(x0, y0, x1 - x0, y1 - y0, geometry.maximumCenterDistance);
  if (!ellipse || !overlap) return Object.freeze({ contacted: false, reason: "NO_VISIBLE_OVERLAP" });
  let heightInterval;
  if (Math.abs(dh) < 1e-12) heightInterval = h0 >= geometry.minimumHeight && h0 <= geometry.maximumHeight ? [0, 1] : null;
  else heightInterval = [(geometry.minimumHeight - h0) / dh, (geometry.maximumHeight - h0) / dh].sort((a, b) => a - b);
  if (!heightInterval) return Object.freeze({ contacted: false, reason: "HEIGHT_OUT_OF_RANGE" });
  const first = Math.max(0, ellipse[0], overlap[0], heightInterval[0], strikeWindow.min);
  const last = Math.min(1, ellipse[1], overlap[1], heightInterval[1], strikeWindow.max);
  if (first > last + 1e-10) return Object.freeze({ contacted: false, reason: "NO_SWEPT_CONTACT" });
  const t = Math.min(1, Math.max(0, first));
  const lerp = (a, b) => a + (b - a) * t;
  const centerDistance = Math.hypot(lerp(x0, x1), lerp(y0, y1));
  return Object.freeze({ contacted: true, stepProgress: t,
    ballX: lerp(previousBall.x, currentBall.x), ballY: lerp(previousBall.y, currentBall.y),
    ballHeight: lerp(previousBall.height, currentBall.height),
    playerX: lerp(previousPlayer.x, currentPlayer.x), playerY: lerp(previousPlayer.y, currentPlayer.y),
    playerJumpHeight: lerp(jump0, jump1), centerDistance,
    overlapDepth: geometry.avatarRadius + geometry.ballRadius - centerDistance,
  });
}
