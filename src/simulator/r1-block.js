import { SIMULATOR_WORLD } from "./simulator.js";
import { BLOCK_PHYSICS_PARAMETERS } from "./config/block-config.js";

export const R1_BLOCK_PHYSICS_V1 = BLOCK_PHYSICS_PARAMETERS;

export function sampleBlockJump(elapsed, config = R1_BLOCK_PHYSICS_V1) {
  const time = Math.max(0, Math.min(config.jumpDuration, elapsed));
  const progress = time / config.jumpDuration;
  return Object.freeze({
    elapsed: time,
    jumpHeight: time >= config.jumpDuration ? 0 : config.maximumJumpHeight * Math.sin(Math.PI * progress),
    phase: time >= config.jumpDuration ? "LANDED" : progress < 0.5 ? "TAKEOFF" : "LANDING",
  });
}

function unitSphereInterval(position, delta) {
  const a = delta.x ** 2 + delta.y ** 2 + delta.z ** 2;
  const b = 2 * (position.x * delta.x + position.y * delta.y + position.z * delta.z);
  const c = position.x ** 2 + position.y ** 2 + position.z ** 2 - 1;
  if (a < 1e-12) return c <= 0 ? [0, 1] : null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

export function detectSweptBlockContact({ previousBall, currentBall, previousPlayer, currentPlayer,
  blockingTeam, config = R1_BLOCK_PHYSICS_V1 }) {
  if (!["HOME", "AWAY"].includes(blockingTeam)) throw new RangeError("攔網方必須為 HOME 或 AWAY。");
  if (!previousPlayer.blockJumpStarted || previousPlayer.blockContacted) {
    return Object.freeze({ contacted: false, reason: "NOT_JUMPING" });
  }
  const towardNet = blockingTeam === "HOME" ? 1 : -1;
  const anchor = (player) => ({
    x: player.x + towardNet * config.reachTowardNet,
    y: player.y,
    z: config.baseReachHeight + (player.blockJumpHeight ?? 0),
  });
  const a0 = anchor(previousPlayer), a1 = anchor(currentPlayer);
  const p = {
    x: (previousBall.x - a0.x) / config.horizontalTolerance,
    y: (previousBall.y - a0.y) / config.lateralTolerance,
    z: (previousBall.height - a0.z) / config.heightTolerance,
  };
  const p1 = {
    x: (currentBall.x - a1.x) / config.horizontalTolerance,
    y: (currentBall.y - a1.y) / config.lateralTolerance,
    z: (currentBall.height - a1.z) / config.heightTolerance,
  };
  const interval = unitSphereInterval(p, { x: p1.x - p.x, y: p1.y - p.y, z: p1.z - p.z });
  if (!interval) return Object.freeze({ contacted: false, reason: "NO_SWEPT_CONTACT" });
  const t = Math.max(0, interval[0]);
  if (t > 1 || interval[1] < 0) return Object.freeze({ contacted: false, reason: "NO_SWEPT_CONTACT" });
  const lerp = (from, to) => from + (to - from) * t;
  const delta = { x: p1.x - p.x, y: p1.y - p.y, z: p1.z - p.z };
  const lengthSquared = delta.x ** 2 + delta.y ** 2 + delta.z ** 2;
  const closestT = lengthSquared > 1e-12
    ? Math.max(0, Math.min(1, -(p.x * delta.x + p.y * delta.y + p.z * delta.z) / lengthSquared)) : t;
  const normalizedDistance = Math.hypot(
    p.x + delta.x * closestT, p.y + delta.y * closestT, p.z + delta.z * closestT);
  return Object.freeze({ contacted: true, stepProgress: t, normalizedDistance,
    ballX: lerp(previousBall.x, currentBall.x), ballY: lerp(previousBall.y, currentBall.y),
    ballHeight: lerp(previousBall.height, currentBall.height),
    playerX: lerp(previousPlayer.x, currentPlayer.x), playerY: lerp(previousPlayer.y, currentPlayer.y),
    playerJumpHeight: lerp(previousPlayer.blockJumpHeight ?? 0, currentPlayer.blockJumpHeight ?? 0) });
}

export function createBlockRebound({ contact, incomingVelocity, attackingTeam, blockAbility = 50,
  config = R1_BLOCK_PHYSICS_V1 }) {
  if (!Number.isInteger(blockAbility) || blockAbility < 1 || blockAbility > 99) {
    throw new RangeError("攔網能力必須是 1～99。 ");
  }
  const centeredAbility = (blockAbility - 50) / 49;
  const effectiveThreshold = Math.max(config.minimumDirectThreshold,
    Math.min(config.maximumDirectThreshold, config.directBlockThreshold
      + centeredAbility * config.abilityDirectThresholdAdjustment));
  const direct = contact.normalizedDistance <= effectiveThreshold;
  const attackDirection = attackingTeam === "HOME" ? 1 : -1;
  const xSign = direct ? -attackDirection : attackDirection;
  const retention = direct ? config.stuffHorizontalRetention : config.touchHorizontalRetention;
  const powerMultiplier = config.minimumPowerMultiplier
    + (config.maximumPowerMultiplier - config.minimumPowerMultiplier) * (blockAbility - 1) / 98;
  const qualityScore = blockAbility + (1 - contact.normalizedDistance) * 20;
  const quality = qualityScore >= config.qualityPerfectScore ? "PERFECT"
    : qualityScore >= config.qualityNormalScore ? "NORMAL" : "BAD";
  return Object.freeze({
    result: direct ? "STUFF_BLOCK" : "BLOCK_TOUCH",
    quality, qualityScore, blockAbility, effectiveThreshold, powerMultiplier,
    velocity: Object.freeze({
      x: xSign * Math.max(config.minimumReboundHorizontalSpeed,
        Math.abs(incomingVelocity.x) * retention * powerMultiplier),
      y: incomingVelocity.y * config.lateralRetention,
      height: config.reboundVerticalSpeed * powerMultiplier,
    }),
    receivingTeam: direct ? attackingTeam : (attackingTeam === "HOME" ? "AWAY" : "HOME"),
  });
}

export function projectBlockLaneAtNet(start, velocity, netX = SIMULATOR_WORLD.width / 2) {
  if (!Number.isFinite(velocity.x) || Math.abs(velocity.x) < 1e-9) return start.y;
  const seconds = (netX - start.x) / velocity.x;
  return seconds > 0 ? start.y + velocity.y * seconds : start.y;
}
