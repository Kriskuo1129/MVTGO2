import { sampleSimulatorBall } from "./ball.js";
import {
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
}) {
  const direction = getIncomingDirection(ball.target.x - ball.start.x);
  const contactOffset = getDirectionalContactOffset(direction, contactAnchorDistance);
  let bestEffort = null;
  for (let elapsed = ball.elapsed; elapsed <= ball.duration + Number.EPSILON; elapsed += sampleStep) {
    const sample = sampleSimulatorBall(ball, elapsed);
    if (sample.height > maximumContactHeight) continue;
    const availableTime = Math.max(0, sample.elapsed - ball.elapsed);
    const desiredPlayerX = sample.x - contactOffset.x;
    const desiredPlayerY = sample.y - sample.height - contactOffset.y;
    const distance = Math.hypot(desiredPlayerX - player.x, desiredPlayerY - player.y);
    const requiredTravel = Math.max(0, distance - contactRange);
    const deficit = requiredTravel - player.moveSpeed * availableTime;
    if (deficit <= 0) {
      return Object.freeze({
        x: desiredPlayerX,
        y: desiredPlayerY,
        interceptTime: sample.elapsed,
        travelDistance: distance,
        deficit,
        reachable: true,
      });
    }
    if (!bestEffort || deficit < bestEffort.deficit) {
      bestEffort = {
        x: desiredPlayerX,
        y: desiredPlayerY,
        interceptTime: sample.elapsed,
        deficit,
      };
    }
  }
  const fallback = bestEffort ?? {
    x: ball.target.x - contactOffset.x,
    y: ball.target.y - contactOffset.y,
    interceptTime: ball.duration,
    deficit: Infinity,
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
