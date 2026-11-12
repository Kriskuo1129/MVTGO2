import { getAttackSpeedWeights } from "./attack-resolution.js";
import { getSpikeReferenceSpeed, selectWeighted } from "./attack-quality.js";
import { sampleUniformQuadrilateral } from "./attack-resolution.js";
import { SPIKE_COURT_V1 } from "./spike-court.js";

export const SIMULATOR_SERVE_TYPES = Object.freeze({ STANDING: "STANDING", JUMP: "JUMP" });
export const LEGACY_SERVE_TYPE_MAP = Object.freeze({ 一般: "STANDING", 跳飄: "JUMP", 跳發: "JUMP" });
export const SERVE_PHASE_TIMING = Object.freeze({ prepare: 0.18, contact: 0.08, followThrough: 0.42 });
export const SERVE_TYPE_CONFIG = Object.freeze({
  STANDING: Object.freeze({ speedFactors: Object.freeze({ SLOW: 1.6, NORMAL: 1.15, FAST: 0.35 }), arcHeight: 305, control: 1.35, tossDuration: 0.72, tossArcHeight: 105, contactHeight: 132 }),
  JUMP: Object.freeze({ speedFactors: Object.freeze({ SLOW: 0.55, NORMAL: 1, FAST: 1.45 }), arcHeight: 215, control: 0.76, tossDuration: 1.02, tossArcHeight: 235, contactHeight: 205 }),
});

const mirrorX = (x, court = SPIKE_COURT_V1) => court.world.width - x;
const normalize = (weights) => {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return Object.freeze(Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total * 100])));
};

export function normalizeServeType(value) {
  const normalized = LEGACY_SERVE_TYPE_MAP[value] ?? value;
  if (!Object.values(SIMULATOR_SERVE_TYPES).includes(normalized)) throw new RangeError(`不支援的發球方式：${value}`);
  return normalized;
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
  return Object.freeze({ x: team === "HOME" ? court.bounds.minX - 105 : court.bounds.maxX + 105, y });
}

export function createServeToss({ team, serveType: input, position }) {
  const serveType = normalizeServeType(input), config = SERVE_TYPE_CONFIG[serveType];
  const x = position.x + (team === "HOME" ? 64 : -64);
  return Object.freeze({ start: Object.freeze({ x, y: position.y, height: 62 }),
    target: Object.freeze({ x, y: position.y, height: 32.5 }), duration: config.tossDuration,
    arcHeight: config.tossArcHeight });
}

export function detectServeContact({ previousBall, currentBall, previousPlayer, currentPlayer,
  serveType: input, team, ballRadius = 32.5, avatarRadius = 65 }) {
  const serveType = normalizeServeType(input), config = SERVE_TYPE_CONFIG[serveType];
  if (currentBall.height >= previousBall.height - Number.EPSILON) return Object.freeze({ contacted: false, reason: "NOT_DESCENDING" });
  const direction = team === "HOME" ? 1 : -1;
  let best = null;
  for (let index = 0; index <= 12; index += 1) {
    const t = index / 12;
    const ballX = previousBall.x + (currentBall.x - previousBall.x) * t;
    const ballScreenY = previousBall.y - previousBall.height
      + ((currentBall.y - currentBall.height) - (previousBall.y - previousBall.height)) * t;
    const playerX = previousPlayer.x + (currentPlayer.x - previousPlayer.x) * t;
    const playerScreenY = previousPlayer.y - (previousPlayer.jumpHeight ?? 0)
      + ((currentPlayer.y - (currentPlayer.jumpHeight ?? 0))
        - (previousPlayer.y - (previousPlayer.jumpHeight ?? 0))) * t;
    const anchorX = playerX + direction * avatarRadius * 0.78;
    const anchorY = playerScreenY - avatarRadius * 0.55;
    const distance = Math.hypot(ballX - anchorX, ballScreenY - anchorY);
    if (!best || distance < best.distance) best = { t, distance, playerScreenY };
  }
  if (best.distance > ballRadius + 16) return Object.freeze({ contacted: false, reason: "OUTSIDE_CONTACT_GEOMETRY", distance: best.distance });
  const ballHeight = previousBall.height + (currentBall.height - previousBall.height) * best.t;
  if (serveType === SIMULATOR_SERVE_TYPES.JUMP
    && (best.playerScreenY >= previousPlayer.y - 8 || ballHeight < config.contactHeight - 45)) {
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
  const speedLevel = selectWeighted(weights, random);
  const leftTarget = sampleUniformQuadrilateral(court.leftLandingPolygon, random);
  const sampled = team === "HOME" ? { x: mirrorX(leftTarget.x, court), y: leftTarget.y } : leftTarget;
  const controlSpread = (100 - server.serveAbility) * 1.65 / config.control;
  const target = manualTarget ? { x: manualTarget.x, y: manualTarget.y }
    : { x: sampled.x + (random() * 2 - 1) * controlSpread,
      y: sampled.y + (random() * 2 - 1) * controlSpread };
  const position = getServePosition(team, target.y, court);
  const contact = contactPoint ?? Object.freeze({ x: position.x + (team === "HOME" ? 64 : -64), y: position.y,
    height: config.contactHeight });
  const distance = Math.hypot(target.x - contact.x, target.y - contact.y);
  const duration = distance / getSpikeReferenceSpeed(speedLevel);
  return Object.freeze({ team, serverId: server.id, serveType,
    ability: server.serveAbility, speedLevel, speedWeights: weights, start: contact, contact,
    target: Object.freeze({ ...target, height: 32.5 }), duration,
    arcHeight: config.arcHeight + (random() * 2 - 1) * 24 });
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
