import { sampleSimulatorBall } from "./ball.js";
import {
  CONTACT_GEOMETRY_TYPES,
  getDirectionalContactOffset,
  getIncomingDirection,
} from "./contact-detection.js";

export const PLAYER_TASKS = Object.freeze({
  RECEIVE: "RECEIVE",
  SET_PREPARE: "SET_PREPARE",
  ATTACK_PREPARE: "ATTACK_PREPARE",
  COVER: "COVER",
  IDLE: "IDLE",
});

export function createSimulatorPlayer({
  id = null,
  position = null,
  rotationPosition = null,
  x,
  y,
  moveSpeed,
}) {
  return {
    id,
    position,
    rotationPosition,
    task: PLAYER_TASKS.IDLE,
    x,
    y,
    moveSpeed,
    targetX: x,
    targetY: y,
    isMoving: false,
    action: "IDLE",
    receiveDirection: null,
    contactPoint: null,
  };
}

export function predictReachableContact({
  ball,
  player,
  contactRange,
  contactAnchorDistance,
  maximumContactHeight,
  sampleStep,
  contactGeometry = null,
}) {
  const direction = getIncomingDirection(ball.target.x - ball.start.x);
  const contactOffset = contactGeometry?.type === CONTACT_GEOMETRY_TYPES.SET
    ? contactGeometry.offset
    : getDirectionalContactOffset(
      direction,
      contactGeometry?.type === CONTACT_GEOMETRY_TYPES.RECEIVE
        ? contactGeometry.anchorDistance
        : contactAnchorDistance,
    );
  const targetTolerance = contactGeometry
    ? Math.min(contactGeometry.horizontalTolerance, contactGeometry.verticalTolerance)
    : contactRange;
  let landingCandidate = null;
  for (let elapsed = ball.duration; elapsed >= ball.elapsed - Number.EPSILON; elapsed -= sampleStep) {
    const sample = sampleSimulatorBall(ball, elapsed);
    const earlierSample = sampleSimulatorBall(ball, Math.max(ball.elapsed, elapsed - sampleStep));
    const descending = sample.elapsed >= ball.duration - Number.EPSILON
      || sample.height < earlierSample.height - Number.EPSILON;
    if (!descending) continue;
    if (sample.height > maximumContactHeight) continue;
    const availableTime = Math.max(0, sample.elapsed - ball.elapsed);
    const desiredPlayerX = sample.x - contactOffset.x;
    const desiredPlayerY = sample.y - sample.height - contactOffset.y;
    const distance = Math.hypot(desiredPlayerX - player.x, desiredPlayerY - player.y);
    const requiredTravel = Math.max(0, distance - targetTolerance);
    const deficit = requiredTravel - player.moveSpeed * availableTime;
    const preparationMargin = availableTime - requiredTravel / player.moveSpeed;
    const prediction = {
      x: desiredPlayerX,
      y: desiredPlayerY,
      interceptTime: sample.elapsed,
      travelDistance: distance,
      deficit,
      preparationMargin,
      landingTimeDelta: ball.duration - sample.elapsed,
    };
    if (deficit <= 0) {
      return Object.freeze({ ...prediction, reachable: true });
    }
    if (!landingCandidate) landingCandidate = prediction;
  }
  const fallback = landingCandidate ?? {
    x: ball.target.x - contactOffset.x,
    y: ball.target.y - contactOffset.y,
    interceptTime: ball.duration,
    travelDistance: Math.hypot(
      ball.target.x - contactOffset.x - player.x,
      ball.target.y - contactOffset.y - player.y,
    ),
    deficit: Infinity,
    preparationMargin: -Infinity,
    landingTimeDelta: 0,
  };
  return Object.freeze({ ...fallback, reachable: false });
}

export function decideChaseTarget(player, predictedContact) {
  player.targetX = predictedContact.x;
  player.targetY = predictedContact.y;
  player.action = "CHASE";
}

export function stepSimulatorPlayer(player, deltaSeconds) {
  const deltaX = player.targetX - player.x;
  const deltaY = player.targetY - player.y;
  const distance = Math.hypot(deltaX, deltaY);
  const maximumMove = player.moveSpeed * deltaSeconds;
  if (distance <= maximumMove || distance < 0.0001) {
    player.x = player.targetX;
    player.y = player.targetY;
    player.isMoving = false;
    return;
  }
  player.x += deltaX / distance * maximumMove;
  player.y += deltaY / distance * maximumMove;
  player.isMoving = true;
}
