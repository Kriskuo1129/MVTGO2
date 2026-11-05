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
  PLAYER_TASKS,
  predictReachableContact,
  stepSimulatorPlayer,
} from "./player-agent.js";
import {
  DEFAULT_SIMULATOR_PARAMETERS,
  SIMULATOR_BALL_DISPLAY_SIZE,
  SIMULATOR_BALL_OVERLAP_RATIO,
  SIMULATOR_BALL_START,
  SIMULATOR_CONTACT_ANCHOR_DISTANCE,
  SIMULATOR_FIXED_STEP,
  SIMULATOR_HIGH_ARC_HEIGHT,
  SIMULATOR_MAX_FRAME_DELTA,
  SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
  SIMULATOR_WORLD,
  validateSimulatorParameters,
} from "./simulator.js";
import {
  assignPrimaryReceiver,
  PLAYER_POSITIONS,
} from "./team-coordination.js";
import {
  configureTouchEligibility,
  createTouchEligibilitySnapshot,
  createTouchEligibilityState,
  isPlayerTouchEligible,
  recordEligibleTouch,
  TOUCH_PHASES,
} from "./touch-eligibility.js";

export const TEAM_RECEIVE_FORMATION = Object.freeze([
  Object.freeze({ id: "SIM-P1", position: PLAYER_POSITIONS.S, rotationPosition: "POS1", x: 1880, y: 700 }),
  Object.freeze({ id: "SIM-P2", position: PLAYER_POSITIONS.OH1, rotationPosition: "POS2", x: 1510, y: 690 }),
  Object.freeze({ id: "SIM-P3", position: PLAYER_POSITIONS.MB1, rotationPosition: "POS3", x: 1300, y: 520 }),
  Object.freeze({ id: "SIM-P4", position: PLAYER_POSITIONS.OP, rotationPosition: "POS4", x: 1510, y: 310 }),
  Object.freeze({ id: "SIM-P5", position: PLAYER_POSITIONS.OH2, rotationPosition: "POS5", x: 1880, y: 300 }),
  Object.freeze({ id: "SIM-P6", position: PLAYER_POSITIONS.MB2, rotationPosition: "POS6", x: 1740, y: 500 }),
]);

function assertTargetCoordinate(value, maximum, fieldName) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`${fieldName} 必須介於 0～${maximum}。`);
  }
  return value;
}

function createTeamPlayers(parameters) {
  return TEAM_RECEIVE_FORMATION.map((position) => Object.assign(
    createSimulatorPlayer({ ...position, moveSpeed: parameters.playerSpeed }),
    { responsibility: "HOLD" },
  ));
}

export class SixPlayerReceiveSimulator {
  constructor({ parameters = DEFAULT_SIMULATOR_PARAMETERS, fixedStep = SIMULATOR_FIXED_STEP } = {}) {
    if (!Number.isFinite(fixedStep) || fixedStep < 1 / 1000 || fixedStep > 0.1) {
      throw new RangeError("固定時間步進必須介於 0.001～0.1。");
    }
    this.fixedStep = fixedStep;
    this.parameters = validateSimulatorParameters(parameters);
    this.reset();
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
    this.players = createTeamPlayers(this.parameters);
    this.primaryReceiverId = null;
    this.touchEligibility = createTouchEligibilityState();
  }

  launch(target) {
    const targetX = assertTargetCoordinate(target.x, SIMULATOR_WORLD.width, "落點 X");
    const targetY = assertTargetCoordinate(target.y, SIMULATOR_WORLD.height, "落點 Y");
    this.reset();
    launchSimulatorBall(this.ball, {
      start: SIMULATOR_BALL_START,
      target: { x: targetX, y: targetY },
      duration: this.parameters.flightDuration,
      arcHeight: SIMULATOR_HIGH_ARC_HEIGHT,
      trajectoryType: BALL_TRAJECTORY_TYPES.HIGH_ARC,
    });
    const receiveCandidateIds = this.players
      .filter((player) => player.position !== PLAYER_POSITIONS.S)
      .map((player) => player.id);
    this.setTouchEligibility({
      phase: TOUCH_PHASES.RECEIVE,
      eligiblePlayerIds: receiveCandidateIds,
    });
    const assignment = this.assignReceiver();
    this.primaryReceiverId = assignment?.playerId ?? null;
    this.setTouchEligibility({
      phase: TOUCH_PHASES.RECEIVE,
      eligiblePlayerIds: this.primaryReceiverId ? [this.primaryReceiverId] : [],
    });
    this.players.forEach((player) => {
      player.responsibility = player.id === this.primaryReceiverId ? "PRIMARY" : "HOLD";
      player.action = player.responsibility === "PRIMARY" ? "CHASE" : "IDLE";
      player.task = player.responsibility === "PRIMARY"
        ? PLAYER_TASKS.RECEIVE
        : player.position === PLAYER_POSITIONS.S
          ? PLAYER_TASKS.SET_PREPARE
          : PLAYER_TASKS.COVER;
    });
    const primaryReceiver = this.getPrimaryReceiver();
    if (primaryReceiver) decideChaseTarget(primaryReceiver, assignment.prediction);
    this.status = "RUNNING";
    this.events.push(Object.freeze({
      type: "BALL_LAUNCHED",
      time: 0,
      trajectoryType: this.ball.trajectoryType,
      x: targetX,
      y: targetY,
    }));
    this.events.push(Object.freeze({
      type: "RECEIVER_ASSIGNED",
      time: 0,
      playerId: this.primaryReceiverId,
      reachable: assignment?.reachable ?? false,
    }));
  }

  setTouchEligibility({ phase, eligiblePlayerIds }) {
    configureTouchEligibility(this.touchEligibility, { phase, eligiblePlayerIds });
    return createTouchEligibilitySnapshot(this.touchEligibility);
  }

  assignReceiver() {
    return assignPrimaryReceiver({
      ball: this.ball,
      players: this.players,
      contactRange: this.parameters.contactRange,
      contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
      maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
      sampleStep: Math.max(this.fixedStep * 4, 1 / 30),
      isCandidateEligible: (player) => isPlayerTouchEligible(this.touchEligibility, player.id),
    });
  }

  getPrimaryReceiver() {
    return this.players.find((player) => player.id === this.primaryReceiverId) ?? null;
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
    const primaryReceiver = this.getPrimaryReceiver();
    if (primaryReceiver) {
      decideChaseTarget(primaryReceiver, predictReachableContact({
        ball: this.ball,
        player: primaryReceiver,
        contactRange: this.parameters.contactRange,
        contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
        maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
        sampleStep: Math.max(this.fixedStep * 4, 1 / 30),
      }));
    }

    const previousBall = {
      x: this.ball.x,
      y: this.ball.y,
      height: this.ball.height,
      progress: this.ball.progress,
      inFlight: this.ball.inFlight,
    };
    const previousPlayers = new Map(this.players.map((player) => [
      player.id,
      { x: player.x, y: player.y },
    ]));
    this.simulationTime += this.fixedStep;
    stepSimulatorBall(this.ball, this.fixedStep);
    if (primaryReceiver) stepSimulatorPlayer(primaryReceiver, this.fixedStep);

    let contact = null;
    let contactingPlayer = null;
    for (const player of this.players) {
      const candidateContact = detectSimulatorContact({
        previousBall,
        currentBall: this.ball,
        previousPlayer: previousPlayers.get(player.id),
        currentPlayer: player,
        contactRange: this.parameters.contactRange,
        contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
        maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
      });
      if (candidateContact.contacted && isPlayerTouchEligible(this.touchEligibility, player.id)) {
        contact = candidateContact;
        contactingPlayer = player;
        break;
      }
    }
    if (contact?.contacted) {
      this.status = "CONTACTED";
      this.ball.inFlight = false;
      this.ball.landed = false;
      this.ball.x = contact.ballX;
      this.ball.y = contact.ballY;
      this.ball.height = contact.ballHeight;
      this.ball.progress = previousBall.progress
        + (this.ball.progress - previousBall.progress) * contact.stepProgress;
      contactingPlayer.x = contact.playerX;
      contactingPlayer.y = contact.playerY;
      contactingPlayer.action = "RECEIVE";
      contactingPlayer.receiveDirection = contact.direction;
      contactingPlayer.contactPoint = createPresentationContactPoint({
        player: contactingPlayer,
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
        playerId: contactingPlayer.id,
        ballX: this.ball.x,
        ballY: this.ball.y,
        playerX: contactingPlayer.x,
        playerY: contactingPlayer.y,
        receiveDirection: contactingPlayer.receiveDirection,
        contactPoint: contactingPlayer.contactPoint,
      }));
      recordEligibleTouch(this.touchEligibility, { playerId: contactingPlayer.id });
      return;
    }

    if (this.ball.landed) {
      this.status = "MISSED";
      if (primaryReceiver) {
        primaryReceiver.action = "IDLE";
        primaryReceiver.task = PLAYER_TASKS.IDLE;
      }
      this.events.push(Object.freeze({
        type: "BALL_MISSED",
        time: this.simulationTime,
        ballX: this.ball.x,
        ballY: this.ball.y,
        attemptedPlayerId: primaryReceiver?.id ?? null,
      }));
    }
  }

  getSnapshot() {
    return Object.freeze({
      status: this.status,
      simulationTime: this.simulationTime,
      parameters: this.parameters,
      world: SIMULATOR_WORLD,
      primaryReceiverId: this.primaryReceiverId,
      touchEligibility: createTouchEligibilitySnapshot(this.touchEligibility),
      ball: Object.freeze({
        x: this.ball.x,
        y: this.ball.y,
        height: this.ball.height,
        progress: this.ball.progress,
        inFlight: this.ball.inFlight,
        trajectoryType: this.ball.trajectoryType,
        targetX: this.ball.target.x,
        targetY: this.ball.target.y,
      }),
      players: Object.freeze(this.players.map((player) => Object.freeze({
        id: player.id,
        position: player.position,
        rotationPosition: player.rotationPosition,
        task: player.task,
        touchEligible: isPlayerTouchEligible(this.touchEligibility, player.id),
        responsibility: player.responsibility,
        x: player.x,
        y: player.y,
        targetX: player.targetX,
        targetY: player.targetY,
        action: player.action,
        receiveDirection: player.receiveDirection,
        contactPoint: player.contactPoint ? Object.freeze({ ...player.contactPoint }) : null,
        isMoving: player.isMoving,
      }))),
      events: Object.freeze([...this.events]),
      presentation: Object.freeze({
        ballDisplaySize: SIMULATOR_BALL_DISPLAY_SIZE,
        ballOverlapRatio: SIMULATOR_BALL_OVERLAP_RATIO,
      }),
    });
  }
}
