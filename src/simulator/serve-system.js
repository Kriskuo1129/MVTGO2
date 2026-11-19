import { getAttackSpeedWeights } from "./attack-resolution.js";
import { getSpikeReferenceSpeed, selectWeighted } from "./attack-quality.js";
import { sampleUniformQuadrilateral } from "./attack-resolution.js";
import { SPIKE_COURT_V1 } from "./spike-court.js";
import {
  LEGACY_SERVE_TYPES,
  SERVE_ACTION_TIMING,
  SERVE_GEOMETRY_CONFIG,
  SERVE_PROFILES,
  SERVE_QUALITY_MODIFIERS,
  SERVE_TARGET_WEIGHTS,
  SERVE_TYPES_CONFIG,
} from "./config/serve-config.js";

export const SIMULATOR_SERVE_TYPES = SERVE_TYPES_CONFIG;
export const LEGACY_SERVE_TYPE_MAP = LEGACY_SERVE_TYPES;
export const SERVE_PHASE_TIMING = SERVE_ACTION_TIMING;
export const SERVE_TYPE_CONFIG = SERVE_PROFILES;
export const SERVE_TARGET_ZONE_WEIGHTS = SERVE_TARGET_WEIGHTS;

const mirrorX = (x, court = SPIKE_COURT_V1) => court.world.width - x;
const normalize = (weights) => {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return Object.freeze(Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total * 100])));
};
const midpoint = (a, b) => Object.freeze({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function getServeTargetZones(court = SPIKE_COURT_V1) {
  const [backTop, netTop, netBottom, backBottom] = court.leftLandingPolygon;
  const middleTop = midpoint(backTop, netTop), middleBottom = midpoint(backBottom, netBottom);
  return Object.freeze({
    BACK: Object.freeze([backTop, middleTop, middleBottom, backBottom]),
    FRONT: Object.freeze([middleTop, netTop, netBottom, middleBottom]),
  });
}

export function normalizeServeType(value) {
  const normalized = LEGACY_SERVE_TYPE_MAP[value] ?? value;
  if (!Object.values(SIMULATOR_SERVE_TYPES).includes(normalized)) throw new RangeError(`不支援的發球方式：${value}`);
  return normalized;
}

export function isJumpServeType(value) {
  const serveType = normalizeServeType(value);
  return serveType === SIMULATOR_SERVE_TYPES.JUMP_FLOAT || serveType === SIMULATOR_SERVE_TYPES.JUMP;
}

export function getServeQualityWeights(ability, serveTypeInput) {
  if (!Number.isInteger(ability) || ability < 1 || ability > 99) throw new RangeError("發球能力必須是 1～99。 ");
  const config = SERVE_TYPE_CONFIG[normalizeServeType(serveTypeInput)];
  const progress = (ability - 1) / 98;
  return Object.freeze(Object.fromEntries(["PERFECT", "NORMAL", "BAD"].map((quality) =>
    [quality, config.qualityAnchors.low[quality]
      + (config.qualityAnchors.high[quality] - config.qualityAnchors.low[quality]) * progress])));
}

export function getServeSpeedWeights(ability, serveTypeInput) {
  const serveType = normalizeServeType(serveTypeInput);
  const config = SERVE_TYPE_CONFIG[serveType];
  if (!config) throw new RangeError(`不支援的發球類型：${serveType}`);
  const base = getAttackSpeedWeights(ability);
  const ultra = serveType === SIMULATOR_SERVE_TYPES.JUMP ? base.ULTRA_FAST : 0;
  const adjusted = Object.fromEntries(["SLOW", "NORMAL", "FAST"]
    .map((level) => [level, base[level] * config.speedFactors[level]]));
  const normalized = normalize(adjusted);
  return Object.freeze({
    SLOW: normalized.SLOW * (100 - ultra) / 100,
    NORMAL: normalized.NORMAL * (100 - ultra) / 100,
    FAST: normalized.FAST * (100 - ultra) / 100,
    ULTRA_FAST: ultra,
  });
}

export function getServePosition(team, y = 450, court = SPIKE_COURT_V1) {
  if (!['HOME', 'AWAY'].includes(team)) throw new RangeError("發球隊伍必須為 HOME 或 AWAY。");
  return Object.freeze({ x: team === "HOME"
    ? court.bounds.minX - SERVE_GEOMETRY_CONFIG.outsideBaselineDistance
    : court.bounds.maxX + SERVE_GEOMETRY_CONFIG.outsideBaselineDistance, y });
}

export function createServeToss({ team, serveType: input, position }) {
  const serveType = normalizeServeType(input), config = SERVE_TYPE_CONFIG[serveType];
  const x = position.x + (team === "HOME" ? 1 : -1) * SERVE_GEOMETRY_CONFIG.tossForwardDistance;
  return Object.freeze({ start: Object.freeze({ x, y: position.y,
    height: SERVE_GEOMETRY_CONFIG.tossStartHeight }),
    target: Object.freeze({ x, y: position.y, height: SERVE_GEOMETRY_CONFIG.targetHeight }), duration: config.tossDuration,
    arcHeight: config.tossArcHeight });
}

export function detectServeContact({ previousBall, currentBall, previousPlayer, currentPlayer,
  serveType: input, team, ballRadius = SERVE_GEOMETRY_CONFIG.defaultBallRadius,
  avatarRadius = SERVE_GEOMETRY_CONFIG.defaultAvatarRadius }) {
  const serveType = normalizeServeType(input), config = SERVE_TYPE_CONFIG[serveType];
  if (currentBall.height >= previousBall.height - Number.EPSILON) return Object.freeze({ contacted: false, reason: "NOT_DESCENDING" });
  const direction = team === "HOME" ? 1 : -1;
  let best = null;
  for (let index = 0; index <= SERVE_GEOMETRY_CONFIG.contactSamples; index += 1) {
    const t = index / SERVE_GEOMETRY_CONFIG.contactSamples;
    const ballX = previousBall.x + (currentBall.x - previousBall.x) * t;
    const ballScreenY = previousBall.y - previousBall.height
      + ((currentBall.y - currentBall.height) - (previousBall.y - previousBall.height)) * t;
    const playerX = previousPlayer.x + (currentPlayer.x - previousPlayer.x) * t;
    const playerScreenY = previousPlayer.y - (previousPlayer.jumpHeight ?? 0)
      + ((currentPlayer.y - (currentPlayer.jumpHeight ?? 0))
        - (previousPlayer.y - (previousPlayer.jumpHeight ?? 0))) * t;
    const anchorX = playerX + direction * avatarRadius * SERVE_GEOMETRY_CONFIG.anchorHorizontalScale;
    const anchorY = playerScreenY - avatarRadius * SERVE_GEOMETRY_CONFIG.anchorVerticalScale;
    const distance = Math.hypot(ballX - anchorX, ballScreenY - anchorY);
    if (!best || distance < best.distance) best = { t, distance, playerScreenY };
  }
  if (best.distance > ballRadius + SERVE_GEOMETRY_CONFIG.contactDistancePadding) return Object.freeze({ contacted: false, reason: "OUTSIDE_CONTACT_GEOMETRY", distance: best.distance });
  const ballHeight = previousBall.height + (currentBall.height - previousBall.height) * best.t;
  if (isJumpServeType(serveType)
    && (best.playerScreenY >= previousPlayer.y - SERVE_GEOMETRY_CONFIG.jumpScreenClearance
      || ballHeight < config.contactHeight - SERVE_GEOMETRY_CONFIG.jumpHeightTolerance)) {
    return Object.freeze({ contacted: false, reason: "JUMP_CONTACT_TOO_LOW", distance: best.distance });
  }
  return Object.freeze({ contacted: true, t: best.t, distance: best.distance,
    ballX: previousBall.x + (currentBall.x - previousBall.x) * best.t,
    ballY: previousBall.y + (currentBall.y - previousBall.y) * best.t, ballHeight });
}

export function resolveServeLaunch({ team, server, random, manualTarget = null,
  court = SPIKE_COURT_V1, contactPoint = null }) {
  if (typeof random !== "function" || !server || !Number.isInteger(server.serveAbility)
    || server.serveAbility < 1 || server.serveAbility > 99) throw new TypeError("正式發球需要合法球員能力與 RNG。");
  const serveType = normalizeServeType(server.serveType);
  const config = SERVE_TYPE_CONFIG[serveType];
  const weights = getServeSpeedWeights(server.serveAbility, serveType);
  const qualityWeights = getServeQualityWeights(server.serveAbility, serveType);
  const quality = selectWeighted(qualityWeights, random);
  const qualityModifier = SERVE_QUALITY_MODIFIERS[quality];
  const speedLevel = selectWeighted(weights, random);
  // 手動測試仍走既有完整區域取樣以維持 Seed 序列；正式發球才套用前／後場權重。
  const targetZone = manualTarget ? "MANUAL"
    : random() * 100 < SERVE_TARGET_ZONE_WEIGHTS.BACK ? "BACK" : "FRONT";
  const leftTarget = sampleUniformQuadrilateral(manualTarget
    ? court.leftLandingPolygon : getServeTargetZones(court)[targetZone], random);
  const sampled = team === "HOME" ? { x: mirrorX(leftTarget.x, court), y: leftTarget.y } : leftTarget;
  const controlSpread = (100 - server.serveAbility)
    * SERVE_GEOMETRY_CONFIG.controlSpreadCoefficient / config.control
    * qualityModifier.controlSpread;
  const spreadTarget = { x: sampled.x + (random() * 2 - 1) * controlSpread,
    y: sampled.y + (random() * 2 - 1) * controlSpread };
  const target = manualTarget ? { x: manualTarget.x, y: manualTarget.y }
    : { x: team === "HOME" ? Math.max(court.netX + SERVE_GEOMETRY_CONFIG.netTargetMargin, spreadTarget.x)
      : Math.min(court.netX - SERVE_GEOMETRY_CONFIG.netTargetMargin, spreadTarget.x), y: spreadTarget.y };
  const position = getServePosition(team, target.y, court);
  const contact = contactPoint ?? Object.freeze({ x: position.x
    + (team === "HOME" ? 1 : -1) * SERVE_GEOMETRY_CONFIG.tossForwardDistance, y: position.y,
    height: config.contactHeight });
  const distance = Math.hypot(target.x - contact.x, target.y - contact.y);
  const duration = distance / getSpikeReferenceSpeed(speedLevel);
  return Object.freeze({ team, serverId: server.id, serveType, quality, qualityWeights,
    ability: server.serveAbility, speedLevel, speedWeights: weights, targetZone, start: contact, contact,
    target: Object.freeze({ ...target, height: SERVE_GEOMETRY_CONFIG.targetHeight }), duration,
    arcHeight: config.arcHeight + (random() * 2 - 1) * SERVE_GEOMETRY_CONFIG.arcVariance
      * qualityModifier.arcVariance });
}

export function detectServeNetContact(ball, fromProgress, toProgress, radius,
  court = SPIKE_COURT_V1) {
  const dx = ball.target.x - ball.start.x;
  if (Math.abs(dx) < 1e-9) return null;
  const progress = (court.netX - ball.start.x) / dx;
  if (progress < fromProgress - 1e-9 || progress > toProgress + 1e-9) return null;
  const y = ball.start.y + (ball.target.y - ball.start.y) * progress;
  const baseHeight = ball.start.height + (ball.target.height - ball.start.height) * progress;
  const height = baseHeight + 4 * ball.arcHeight * progress * (1 - progress);
  return y >= court.bounds.minY - radius && y <= court.bounds.maxY + radius
    && height <= court.netHeight + radius ? Object.freeze({ progress, x: court.netX, y, height }) : null;
}
