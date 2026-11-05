export const CAMERA_MODES = Object.freeze({
  FULL_COURT: "FULL_COURT",
  FOLLOW_BALL: "FOLLOW_BALL",
});

export const DEFAULT_HORIZONTAL_DEAD_ZONE = 80;
export const FOLLOW_RESPONSE = 5;
export const MAX_FOLLOW_SPEED = 2600;
export const MAX_FOLLOW_ACCELERATION = 9000;
export const MAX_FOLLOW_DECELERATION = 24000;
export const MAX_LOOKAHEAD_DISTANCE = 300;
export const VELOCITY_SMOOTHING_RESPONSE = 14;
export const CAMERA_FIXED_STEP = 1 / 240;
export const FOLLOW_SAFE_BOUNDS = Object.freeze({ left: 100, right: 2180 });

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function smoothstep(progress) {
  return progress * progress * (3 - 2 * progress);
}

export class SimulatorCameraController {
  constructor({ world, mode = CAMERA_MODES.FULL_COURT } = {}) {
    if (!world || !Number.isFinite(world.width) || !Number.isFinite(world.height)) {
      throw new TypeError("Camera Controller 需要有效世界尺寸。");
    }
    this.world = Object.freeze({ width: world.width, height: world.height });
    this.horizontalDeadZone = DEFAULT_HORIZONTAL_DEAD_ZONE;
    this.followRoute = null;
    this.velocityX = 0;
    this.cameraAccumulator = 0;
    this.mode = CAMERA_MODES.FULL_COURT;
    this.centerX = world.width / 2;
    this.centerY = world.height / 2;
    this.setMode(mode);
  }

  setMode(mode) {
    if (!Object.values(CAMERA_MODES).includes(mode)) {
      throw new RangeError(`不支援的鏡頭模式：${mode}`);
    }
    this.mode = mode;
    if (mode === CAMERA_MODES.FULL_COURT) {
      this.followRoute = null;
      this.velocityX = 0;
      this.cameraAccumulator = 0;
    }
  }

  reset({ focusX = this.world.width / 2 } = {}) {
    this.centerX = clamp(focusX, 0, this.world.width);
    this.centerY = this.world.height / 2;
    this.followRoute = null;
    this.velocityX = 0;
    this.cameraAccumulator = 0;
  }

  beginFollowRoute({ startX, targetX, flightDuration, viewportWidth, viewportHeight }) {
    if (this.mode !== CAMERA_MODES.FOLLOW_BALL) return null;
    if (![startX, targetX, flightDuration, viewportWidth, viewportHeight].every(Number.isFinite)
      || flightDuration < 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      throw new RangeError("連續跟球鏡頭需要有效起點、落點、剩餘時間與 Viewport 尺寸。");
    }
    const layout = this.getFollowLayout({ viewportWidth, viewportHeight });
    this.centerX = clamp(this.centerX, layout.minimumCenterX, layout.maximumCenterX);
    this.centerY = this.world.height / 2;
    this.velocityX = 0;
    this.cameraAccumulator = 0;
    this.followRoute = {
      startX,
      targetX,
      flightDuration,
      elapsed: 0,
      horizontalVelocity: flightDuration > 0 ? (targetX - startX) / flightDuration : 0,
    };
    return this.getFollowRouteSnapshot();
  }

  update({ ballX, remainingFlightTime, deltaSeconds, viewportWidth, viewportHeight }) {
    if (this.mode !== CAMERA_MODES.FOLLOW_BALL) return;
    if (![ballX, remainingFlightTime, deltaSeconds].every(Number.isFinite)
      || remainingFlightTime < 0 || deltaSeconds < 0) {
      throw new TypeError("連續跟球鏡頭需要有效球座標、剩餘時間與非負更新時間。");
    }
    const hasViewportSize = viewportWidth !== undefined || viewportHeight !== undefined;
    if (hasViewportSize && (!Number.isFinite(viewportWidth) || viewportWidth <= 0
      || !Number.isFinite(viewportHeight) || viewportHeight <= 0)) {
      throw new RangeError("跟球鏡頭 Viewport 尺寸必須大於 0。");
    }
    if (!this.followRoute) return;
    const bounds = hasViewportSize
      ? this.getFollowLayout({ viewportWidth, viewportHeight })
      : { minimumCenterX: 0, maximumCenterX: this.world.width };
    const safeDelta = Math.min(deltaSeconds, 0.1);
    this.cameraAccumulator = Math.min(this.cameraAccumulator + safeDelta, 0.1);
    while (this.cameraAccumulator + Number.EPSILON >= CAMERA_FIXED_STEP) {
      this.followRoute.elapsed = Math.min(
        this.followRoute.flightDuration,
        this.followRoute.elapsed + CAMERA_FIXED_STEP,
      );
      const expectedBallX = this.followRoute.startX
        + this.followRoute.horizontalVelocity * this.followRoute.elapsed;
      const routeRemainingTime = Math.max(
        0,
        this.followRoute.flightDuration - this.followRoute.elapsed,
      );
      this.stepFollowCamera({
        ballX: expectedBallX,
        remainingFlightTime: routeRemainingTime,
        deltaSeconds: CAMERA_FIXED_STEP,
        bounds,
      });
      if (this.followRoute.elapsed >= this.followRoute.flightDuration - 1e-9) {
        this.velocityX = 0;
      }
      this.cameraAccumulator -= CAMERA_FIXED_STEP;
    }
  }

  stepFollowCamera({ ballX, remainingFlightTime, deltaSeconds, bounds }) {
    const speed = this.followRoute.horizontalVelocity;
    const lookaheadTime = clamp(0.14 + Math.abs(speed) / 12000, 0.14, 0.3);
    const lookaheadDistance = Math.sign(speed) * Math.min(
      Math.abs(speed) * lookaheadTime,
      Math.abs(speed) * remainingFlightTime,
      MAX_LOOKAHEAD_DISTANCE,
    );
    const predictedBallX = clamp(
      ballX + lookaheadDistance,
      Math.min(this.followRoute.startX, this.followRoute.targetX),
      Math.max(this.followRoute.startX, this.followRoute.targetX),
    );
    const desiredCenterX = clamp(
      predictedBallX,
      bounds.minimumCenterX,
      bounds.maximumCenterX,
    );
    const errorX = desiredCenterX - this.centerX;
    const effectiveDeadZone = clamp(
      this.horizontalDeadZone - Math.abs(speed) / 50,
      this.horizontalDeadZone / 2,
      this.horizontalDeadZone,
    );
    const effectiveErrorX = Math.sign(errorX)
      * Math.max(0, Math.abs(errorX) - effectiveDeadZone);
    const settleDuration = Math.min(0.14, this.followRoute.flightDuration * 0.18);
    const settleFactor = settleDuration > 0
      ? smoothstep(clamp(remainingFlightTime / settleDuration, 0, 1))
      : 0;
    const desiredVelocityX = clamp(
      effectiveErrorX * FOLLOW_RESPONSE,
      -MAX_FOLLOW_SPEED,
      MAX_FOLLOW_SPEED,
    ) * settleFactor;
    const previousVelocityX = this.velocityX;
    const accelerationLimit = Math.abs(desiredVelocityX) < Math.abs(previousVelocityX)
      ? MAX_FOLLOW_DECELERATION
      : MAX_FOLLOW_ACCELERATION;
    const velocitySmoothing = 1 - Math.exp(-VELOCITY_SMOOTHING_RESPONSE * deltaSeconds);
    const velocityChange = clamp(
      (desiredVelocityX - previousVelocityX) * velocitySmoothing,
      -accelerationLimit * deltaSeconds,
      accelerationLimit * deltaSeconds,
    );
    this.velocityX = previousVelocityX + velocityChange;
    const averageVelocityX = (previousVelocityX + this.velocityX) / 2;
    const nextCenterX = this.centerX + averageVelocityX * deltaSeconds;
    this.centerX = clamp(nextCenterX, bounds.minimumCenterX, bounds.maximumCenterX);
    if (this.centerX !== nextCenterX) this.velocityX = 0;
    this.centerY = this.world.height / 2;
  }

  getFollowRouteSnapshot() {
    return this.followRoute ? Object.freeze({
      ...this.followRoute,
      centerX: this.centerX,
      velocityX: this.velocityX,
    }) : null;
  }

  getFullCourtLayout({ viewportWidth, viewportHeight }) {
    const displayScale = Math.min(
      viewportWidth / this.world.width,
      viewportHeight / this.world.height,
    );
    const renderedWidth = this.world.width * displayScale;
    const renderedHeight = this.world.height * displayScale;
    return {
      fallbackToFullCourt: false,
      displayScale,
      visibleWidth: this.world.width,
      visibleHeight: this.world.height,
      worldLeft: 0,
      worldTop: 0,
      minimumCenterX: this.world.width / 2,
      maximumCenterX: this.world.width / 2,
      centerX: this.world.width / 2,
      offsetX: (viewportWidth - renderedWidth) / 2,
      offsetY: (viewportHeight - renderedHeight) / 2,
      renderedWidth,
      renderedHeight,
    };
  }

  getFollowLayout({ viewportWidth, viewportHeight }) {
    const displayScale = viewportHeight / this.world.height;
    const visibleWidth = viewportWidth / displayScale;
    const safeWidth = FOLLOW_SAFE_BOUNDS.right - FOLLOW_SAFE_BOUNDS.left;
    if (visibleWidth > safeWidth || visibleWidth >= this.world.width) {
      const fallback = this.getFullCourtLayout({ viewportWidth, viewportHeight });
      return { ...fallback, fallbackToFullCourt: true };
    }
    const minimumCenterX = FOLLOW_SAFE_BOUNDS.left + visibleWidth / 2;
    const maximumCenterX = FOLLOW_SAFE_BOUNDS.right - visibleWidth / 2;
    const centerX = clamp(this.centerX, minimumCenterX, maximumCenterX);
    const worldLeft = centerX - visibleWidth / 2;
    return {
      fallbackToFullCourt: false,
      displayScale,
      visibleWidth,
      visibleHeight: this.world.height,
      worldLeft,
      worldTop: 0,
      minimumCenterX,
      maximumCenterX,
      centerX,
      offsetX: -worldLeft * displayScale,
      offsetY: 0,
      renderedWidth: this.world.width * displayScale,
      renderedHeight: viewportHeight,
    };
  }

  getViewportState({ viewportWidth, viewportHeight }) {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0
      || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
      throw new RangeError("Camera Viewport 尺寸必須大於 0。");
    }
    const layout = this.mode === CAMERA_MODES.FOLLOW_BALL
      ? this.getFollowLayout({ viewportWidth, viewportHeight })
      : this.getFullCourtLayout({ viewportWidth, viewportHeight });
    const fullCourtScale = Math.min(
      viewportWidth / this.world.width,
      viewportHeight / this.world.height,
    );
    return Object.freeze({
      ...layout,
      mode: this.mode,
      zoom: layout.displayScale / fullCourtScale,
      centerY: this.world.height / 2,
    });
  }

  screenToWorld({ screenX, screenY, viewportWidth, viewportHeight }) {
    const view = this.getViewportState({ viewportWidth, viewportHeight });
    return Object.freeze({
      x: clamp((screenX - view.offsetX) / view.displayScale, 0, this.world.width),
      y: clamp((screenY - view.offsetY) / view.displayScale, 0, this.world.height),
    });
  }

  worldToScreen({ worldX, worldY, viewportWidth, viewportHeight }) {
    const view = this.getViewportState({ viewportWidth, viewportHeight });
    return Object.freeze({
      x: view.offsetX + worldX * view.displayScale,
      y: view.offsetY + worldY * view.displayScale,
    });
  }
}
