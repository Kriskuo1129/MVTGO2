export const CONTACT_DIRECTIONS = Object.freeze({
  FROM_LEFT: "FROM_LEFT",
  FROM_RIGHT: "FROM_RIGHT",
});

export const CONTACT_GEOMETRY_TYPES = Object.freeze({
  RECEIVE: "RECEIVE",
  SET: "SET",
});

function assertContactDimensions(values, message) {
  if (!values.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError(message);
  }
}

export function createReceiveContactGeometry({
  avatarWorldSize,
  avatarContactScale,
  ballWorldSize,
  minimumOverlapDepth,
  contactTolerance,
}) {
  assertContactDimensions(
    [avatarWorldSize, avatarContactScale, ballWorldSize, minimumOverlapDepth, contactTolerance],
    "RECEIVE 接觸幾何需要有效的世界尺寸、縮放與重疊參數。",
  );
  const effectiveAvatarRadius = avatarWorldSize * avatarContactScale / 2;
  const ballRadius = ballWorldSize / 2;
  const maximumCenterDistance = effectiveAvatarRadius + ballRadius - minimumOverlapDepth;
  const anchorDistance = maximumCenterDistance - contactTolerance;
  if (minimumOverlapDepth >= Math.min(effectiveAvatarRadius, ballRadius)
    || anchorDistance <= 0) {
    throw new RangeError("RECEIVE 重疊深度或接觸容差超出有效幾何範圍。");
  }
  return Object.freeze({
    type: CONTACT_GEOMETRY_TYPES.RECEIVE,
    directional: true,
    anchorDistance,
    horizontalTolerance: contactTolerance,
    verticalTolerance: contactTolerance,
    effectiveAvatarRadius,
    ballRadius,
    minimumOverlapDepth,
  });
}

export function createSetContactGeometry({
  avatarWorldSize,
  ballWorldSize,
  overlapRatio = 0,
  horizontalTolerance = ballWorldSize * 0.36,
  verticalTolerance = ballWorldSize * 0.48,
}) {
  if (![avatarWorldSize, ballWorldSize, horizontalTolerance, verticalTolerance].every(
    (value) => Number.isFinite(value) && value > 0,
  ) || !Number.isFinite(overlapRatio) || overlapRatio < 0 || overlapRatio > 1) {
    throw new RangeError("SET 接觸幾何需要有效的世界尺寸、重疊比例與容差。");
  }
  return Object.freeze({
    type: CONTACT_GEOMETRY_TYPES.SET,
    offset: Object.freeze({
      x: 0,
      y: -(avatarWorldSize / 2 + ballWorldSize / 2 - ballWorldSize * overlapRatio),
    }),
    horizontalTolerance,
    verticalTolerance,
    effectiveAvatarRadius: avatarWorldSize / 2,
    ballRadius: ballWorldSize / 2,
  });
}

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
  contactGeometry = null,
}) {
  if (!previousBall.inFlight) return Object.freeze({ contacted: false });
  if (currentBall.height >= previousBall.height - Number.EPSILON) {
    return Object.freeze({ contacted: false, reason: "BALL_NOT_DESCENDING" });
  }

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
  const anchorOffset = contactGeometry?.type === CONTACT_GEOMETRY_TYPES.SET
    ? contactGeometry.offset
    : getDirectionalContactOffset(
      direction,
      contactGeometry?.type === CONTACT_GEOMETRY_TYPES.RECEIVE
        ? contactGeometry.anchorDistance
        : contactAnchorDistance,
    );
  const horizontalTolerance = contactGeometry
    ? contactGeometry.horizontalTolerance
    : contactRange;
  const verticalTolerance = contactGeometry
    ? contactGeometry.verticalTolerance
    : contactRange;
  const actualRelativeStartX = previousBall.x - (previousPlayer.x + anchorOffset.x);
  const actualRelativeStartY = (previousBall.y - previousBall.height)
    - (previousPlayer.y + anchorOffset.y);
  const actualRelativeEndX = currentBall.x - (currentPlayer.x + anchorOffset.x);
  const actualRelativeEndY = (currentBall.y - currentBall.height)
    - (currentPlayer.y + anchorOffset.y);
  const relativeStartX = actualRelativeStartX / horizontalTolerance;
  const relativeStartY = actualRelativeStartY / verticalTolerance;
  const relativeEndX = actualRelativeEndX / horizontalTolerance;
  const relativeEndY = actualRelativeEndY / verticalTolerance;
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
  const normalizedDistance = Math.hypot(relativeX, relativeY);
  const actualRelativeX = actualRelativeStartX
    + (actualRelativeEndX - actualRelativeStartX) * closestTime;
  const actualRelativeY = actualRelativeStartY
    + (actualRelativeEndY - actualRelativeStartY) * closestTime;
  const distance = Math.hypot(actualRelativeX, actualRelativeY);
  if (normalizedDistance > 1) {
    return Object.freeze({
      contacted: false,
      distance,
      horizontalOffset: actualRelativeX,
      verticalOffset: actualRelativeY,
    });
  }

  const interpolate = (start, end) => start + (end - start) * closestTime;
  const ballX = interpolate(previousBall.x, currentBall.x);
  const ballY = interpolate(previousBall.y, currentBall.y);
  const ballHeight = interpolate(previousBall.height, currentBall.height);
  const playerX = interpolate(previousPlayer.x, currentPlayer.x);
  const playerY = interpolate(previousPlayer.y, currentPlayer.y);
  const ballDisplayY = ballY - ballHeight;
  const centerDistance = Math.hypot(ballX - playerX, ballDisplayY - playerY);
  const overlapDepth = contactGeometry
    ? contactGeometry.effectiveAvatarRadius + contactGeometry.ballRadius - centerDistance
    : null;
  return Object.freeze({
    contacted: true,
    direction,
    stepProgress: closestTime,
    distance,
    horizontalOffset: actualRelativeX,
    verticalOffset: actualRelativeY,
    ballX,
    ballY,
    ballHeight,
    playerX,
    playerY,
    centerDistance,
    effectiveAvatarRadius: contactGeometry?.effectiveAvatarRadius ?? null,
    ballRadius: contactGeometry?.ballRadius ?? null,
    overlapDepth,
  });
}
