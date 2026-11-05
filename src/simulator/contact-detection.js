export const CONTACT_DIRECTIONS = Object.freeze({
  FROM_LEFT: "FROM_LEFT",
  FROM_RIGHT: "FROM_RIGHT",
});

export function getIncomingDirection(deltaX) {
  return deltaX >= 0 ? CONTACT_DIRECTIONS.FROM_LEFT : CONTACT_DIRECTIONS.FROM_RIGHT;
}

export function getDirectionalContactOffset(direction, distance) {
  const horizontalSign = direction === CONTACT_DIRECTIONS.FROM_LEFT ? -1 : 1;
  return Object.freeze({
    x: horizontalSign * Math.sin(Math.PI / 3) * distance,
    y: -Math.cos(Math.PI / 3) * distance,
  });
}

export function createPresentationContactPoint({
  player,
  direction,
  avatarSize,
  ballSize,
  overlapRatio,
}) {
  const centerDistance = avatarSize / 2 + ballSize / 2 - ballSize * overlapRatio;
  const offset = getDirectionalContactOffset(direction, centerDistance);
  return Object.freeze({ x: player.x + offset.x, y: player.y + offset.y });
}

export function detectSimulatorContact({
  previousBall,
  currentBall,
  previousPlayer,
  currentPlayer,
  contactRange,
  contactAnchorDistance,
  maximumContactHeight,
}) {
  if (!previousBall.inFlight) return Object.freeze({ contacted: false });

  let minimumTime = 0;
  let maximumTime = 1;
  if (previousBall.height > maximumContactHeight && currentBall.height > maximumContactHeight) {
    return Object.freeze({ contacted: false });
  }
  if (previousBall.height > maximumContactHeight) {
    minimumTime = (previousBall.height - maximumContactHeight)
      / (previousBall.height - currentBall.height);
  } else if (currentBall.height > maximumContactHeight) {
    maximumTime = (maximumContactHeight - previousBall.height)
      / (currentBall.height - previousBall.height);
  }

  const direction = getIncomingDirection(currentBall.x - previousBall.x);
  const anchorOffset = getDirectionalContactOffset(direction, contactAnchorDistance);
  const relativeStartX = previousBall.x - (previousPlayer.x + anchorOffset.x);
  const relativeStartY = (previousBall.y - previousBall.height)
    - (previousPlayer.y + anchorOffset.y);
  const relativeEndX = currentBall.x - (currentPlayer.x + anchorOffset.x);
  const relativeEndY = (currentBall.y - currentBall.height)
    - (currentPlayer.y + anchorOffset.y);
  const relativeDeltaX = relativeEndX - relativeStartX;
  const relativeDeltaY = relativeEndY - relativeStartY;
  const relativeLengthSquared = relativeDeltaX ** 2 + relativeDeltaY ** 2;
  const closestTime = relativeLengthSquared < Number.EPSILON
    ? minimumTime
    : Math.min(
      Math.max(
        -(relativeStartX * relativeDeltaX + relativeStartY * relativeDeltaY)
          / relativeLengthSquared,
        minimumTime,
      ),
      maximumTime,
    );
  const relativeX = relativeStartX + relativeDeltaX * closestTime;
  const relativeY = relativeStartY + relativeDeltaY * closestTime;
  const distance = Math.hypot(relativeX, relativeY);
  if (distance > contactRange) return Object.freeze({ contacted: false, distance });

  const interpolate = (start, end) => start + (end - start) * closestTime;
  return Object.freeze({
    contacted: true,
    direction,
    stepProgress: closestTime,
    distance,
    ballX: interpolate(previousBall.x, currentBall.x),
    ballY: interpolate(previousBall.y, currentBall.y),
    ballHeight: interpolate(previousBall.height, currentBall.height),
    playerX: interpolate(previousPlayer.x, currentPlayer.x),
    playerY: interpolate(previousPlayer.y, currentPlayer.y),
  });
}
