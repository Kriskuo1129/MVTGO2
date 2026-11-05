import {
  BALL_TRAJECTORY_TYPES,
  createSimulatorBall,
  launchSimulatorBall,
  stepSimulatorBall,
} from "./ball.js";
import {
  createPresentationContactPoint,
  detectSimulatorContact,
} from "./contact-detection.js";
import {
  createSimulatorPlayer,
  decideChaseTarget,
  predictReachableContact,
  stepSimulatorPlayer,
} from "./player-agent.js";

export const SIMULATOR_WORLD = Object.freeze({ width: 2280, height: 900 });
export const SIMULATOR_FIXED_STEP = 1 / 120;
export const SIMULATOR_MAX_FRAME_DELTA = 0.25;
export const SIMULATOR_MIN_FLIGHT_DURATION = 0.7;
export const SIMULATOR_MAX_FLIGHT_DURATION = 1.5;

export const DEFAULT_SIMULATOR_PARAMETERS = Object.freeze({
  avatarSize: 150,
  playerSpeed: 300,
  contactRange: 84,
  flightDuration: SIMULATOR_MAX_FLIGHT_DURATION,
  initialPlayerX: 1140,
  initialPlayerY: 650,
});

export const SIMULATOR_BALL_START = Object.freeze({ x: 250, y: 450, height: 72 });
export const SIMULATOR_HIGH_ARC_HEIGHT = 360;
export const SIMULATOR_MAXIMUM_CONTACT_HEIGHT = 118;
export const SIMULATOR_CONTACT_ANCHOR_DISTANCE = 75;
export const SIMULATOR_BALL_DISPLAY_SIZE = 46;
export const SIMULATOR_BALL_OVERLAP_RATIO = 0.5;

function assertFiniteRange(value, minimum, maximum, fieldName) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${fieldName} 必須介於 ${minimum}～${maximum}。`);
  }
  return value;
}

export function validateSimulatorParameters(parameters) {
  return Object.freeze({
    avatarSize: assertFiniteRange(parameters.avatarSize, 32, 160, "球員顯示尺寸"),
    playerSpeed: assertFiniteRange(parameters.playerSpeed, 20, 1600, "球員速度"),
    contactRange: assertFiniteRange(parameters.contactRange, 10, 240, "有效接球範圍"),
    flightDuration: assertFiniteRange(
      parameters.flightDuration,
      SIMULATOR_MIN_FLIGHT_DURATION,
      SIMULATOR_MAX_FLIGHT_DURATION,
      "球飛行時間",
    ),
    initialPlayerX: assertFiniteRange(parameters.initialPlayerX, 0, SIMULATOR_WORLD.width, "球員初始 X"),
    initialPlayerY: assertFiniteRange(parameters.initialPlayerY, 0, SIMULATOR_WORLD.height, "球員初始 Y"),
  });
}

export class SinglePlayerChaseSimulator {
  constructor({ parameters = DEFAULT_SIMULATOR_PARAMETERS, fixedStep = SIMULATOR_FIXED_STEP } = {}) {
    this.fixedStep = assertFiniteRange(fixedStep, 1 / 1000, 0.1, "固定時間步進");
    this.parameters = validateSimulatorParameters(parameters);
    this.accumulator = 0;
    this.simulationTime = 0;
    this.status = "READY";
    this.events = [];
    this.ball = createSimulatorBall(SIMULATOR_BALL_START);
    this.player = createSimulatorPlayer({
      x: this.parameters.initialPlayerX,
      y: this.parameters.initialPlayerY,
      moveSpeed: this.parameters.playerSpeed,
    });
  }

  configure(parameters) {
    if (this.status === "RUNNING") throw new Error("模擬進行中不可修改參數。");
    this.parameters = validateSimulatorParameters({ ...this.parameters, ...parameters });
    this.reset();
  }

  reset() {
    this.accumulator = 0;
    this.simulationTime = 0;
    this.status = "READY";
    this.events = [];
    this.ball = createSimulatorBall(SIMULATOR_BALL_START);
    this.player = createSimulatorPlayer({
      x: this.parameters.initialPlayerX,
      y: this.parameters.initialPlayerY,
      moveSpeed: this.parameters.playerSpeed,
    });
  }

  launch(target) {
    const targetX = assertFiniteRange(target.x, 0, SIMULATOR_WORLD.width, "落點 X");
    const targetY = assertFiniteRange(target.y, 0, SIMULATOR_WORLD.height, "落點 Y");
    this.reset();
    launchSimulatorBall(this.ball, {
      start: SIMULATOR_BALL_START,
      target: { x: targetX, y: targetY },
      duration: this.parameters.flightDuration,
      arcHeight: SIMULATOR_HIGH_ARC_HEIGHT,
      trajectoryType: BALL_TRAJECTORY_TYPES.HIGH_ARC,
    });
    decideChaseTarget(this.player, predictReachableContact({
      ball: this.ball,
      player: this.player,
      contactRange: this.parameters.contactRange,
      contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
      maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
      sampleStep: Math.max(this.fixedStep * 4, 1 / 30),
    }));
    this.status = "RUNNING";
    this.events.push(Object.freeze({ type: "BALL_LAUNCHED", time: 0, x: targetX, y: targetY }));
  }

  updateFrame(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new TypeError("畫面更新時間必須是非負有限數值。");
    }
    this.accumulator = Math.min(
      this.accumulator + Math.min(deltaSeconds, SIMULATOR_MAX_FRAME_DELTA),
      SIMULATOR_MAX_FRAME_DELTA,
    );
    while (this.accumulator + Number.EPSILON >= this.fixedStep) {
      this.stepFixed();
      this.accumulator -= this.fixedStep;
    }
    return this.getSnapshot();
  }

  stepFixed() {
    if (this.status !== "RUNNING") return;
    decideChaseTarget(this.player, predictReachableContact({
      ball: this.ball,
      player: this.player,
      contactRange: this.parameters.contactRange,
      contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
      maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
      sampleStep: Math.max(this.fixedStep * 4, 1 / 30),
    }));
    const previousBall = {
      x: this.ball.x,
      y: this.ball.y,
      height: this.ball.height,
      progress: this.ball.progress,
      inFlight: this.ball.inFlight,
    };
    const previousPlayer = { x: this.player.x, y: this.player.y };
    this.simulationTime += this.fixedStep;
    stepSimulatorBall(this.ball, this.fixedStep);
    stepSimulatorPlayer(this.player, this.fixedStep);

    const contact = detectSimulatorContact({
      previousBall,
      currentBall: this.ball,
      previousPlayer,
      currentPlayer: this.player,
      contactRange: this.parameters.contactRange,
      contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
      maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
    });
    if (contact.contacted) {
      this.status = "CONTACTED";
      this.ball.inFlight = false;
      this.ball.landed = false;
      this.ball.x = contact.ballX;
      this.ball.y = contact.ballY;
      this.ball.height = contact.ballHeight;
      this.ball.progress = previousBall.progress
        + (this.ball.progress - previousBall.progress) * contact.stepProgress;
      this.player.x = contact.playerX;
      this.player.y = contact.playerY;
      this.player.action = "RECEIVE";
      this.player.receiveDirection = contact.direction;
      this.player.contactPoint = createPresentationContactPoint({
        player: this.player,
        direction: contact.direction,
        avatarSize: this.parameters.avatarSize,
        ballSize: SIMULATOR_BALL_DISPLAY_SIZE,
        overlapRatio: SIMULATOR_BALL_OVERLAP_RATIO,
      });
      const contactTime = this.simulationTime
        - this.fixedStep
        + this.fixedStep * contact.stepProgress;
      this.events.push(Object.freeze({
        type: "BALL_CONTACTED",
        time: contactTime,
        ballX: this.ball.x,
        ballY: this.ball.y,
        playerX: this.player.x,
        playerY: this.player.y,
        receiveDirection: this.player.receiveDirection,
        contactPoint: this.player.contactPoint,
      }));
      return;
    }

    if (this.ball.landed) {
      this.status = "MISSED";
      this.player.action = "IDLE";
      this.events.push(Object.freeze({
        type: "BALL_MISSED",
        time: this.simulationTime,
        ballX: this.ball.x,
        ballY: this.ball.y,
        playerX: this.player.x,
        playerY: this.player.y,
      }));
    }
  }

  getSnapshot() {
    return Object.freeze({
      status: this.status,
      simulationTime: this.simulationTime,
      parameters: this.parameters,
      world: SIMULATOR_WORLD,
      ball: Object.freeze({
        x: this.ball.x,
        y: this.ball.y,
        height: this.ball.height,
        progress: this.ball.progress,
        inFlight: this.ball.inFlight,
      }),
      player: Object.freeze({
        x: this.player.x,
        y: this.player.y,
        targetX: this.player.targetX,
        targetY: this.player.targetY,
        action: this.player.action,
        receiveDirection: this.player.receiveDirection,
        contactPoint: this.player.contactPoint
          ? Object.freeze({ ...this.player.contactPoint })
          : null,
        isMoving: this.player.isMoving,
      }),
      events: Object.freeze([...this.events]),
      presentation: Object.freeze({
        ballDisplaySize: SIMULATOR_BALL_DISPLAY_SIZE,
        ballOverlapRatio: SIMULATOR_BALL_OVERLAP_RATIO,
      }),
    });
  }
}
