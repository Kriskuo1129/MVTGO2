import {
  BALL_TRAJECTORY_TYPES,
  createSimulatorBall,
  launchSimulatorBall,
  stepSimulatorBall,
} from "./ball.js";
import {
  createReceiveContactGeometry,
  createSetContactGeometry,
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
  SIMULATOR_BALL_OVERLAP_RATIO,
  SIMULATOR_BALL_START,
  SIMULATOR_CONTACT_ANCHOR_DISTANCE,
  SIMULATOR_FIXED_STEP,
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
import {
  getReceiveSpeedProfile,
} from "./receive-animation.js";
import {
  createReceiveErrorTrajectory,
  RECEIVE_QUALITIES,
  RECEIVE_RESULTS,
  resolveReceiveContact,
  SECOND_PASS_TRAJECTORY_CONFIG,
  SECOND_TOUCH_TRAJECTORY_TUNING,
} from "./receive-quality.js";
import {
  createPassTargetZones,
  PASS_TARGET_ZONES_V1,
  samplePassTarget,
} from "./pass-target-zones.js";

export const TEAM_RECEIVE_FORMATION = Object.freeze([
  Object.freeze({ id: "SIM-P1", position: PLAYER_POSITIONS.S, rotationPosition: "POS1", x: 1880, y: 700, receiveAbility: 60, morale: 30 }),
  Object.freeze({ id: "SIM-P2", position: PLAYER_POSITIONS.OH1, rotationPosition: "POS2", x: 1510, y: 690, receiveAbility: 72, morale: 30 }),
  Object.freeze({ id: "SIM-P3", position: PLAYER_POSITIONS.MB1, rotationPosition: "POS3", x: 1300, y: 520, receiveAbility: 58, morale: 30 }),
  Object.freeze({ id: "SIM-P4", position: PLAYER_POSITIONS.OP, rotationPosition: "POS4", x: 1510, y: 310, receiveAbility: 64, morale: 30 }),
  Object.freeze({ id: "SIM-P5", position: PLAYER_POSITIONS.OH2, rotationPosition: "POS5", x: 1880, y: 300, receiveAbility: 76, morale: 30 }),
  Object.freeze({ id: "SIM-P6", position: PLAYER_POSITIONS.MB2, rotationPosition: "POS6", x: 1740, y: 500, receiveAbility: 55, morale: 30 }),
]);

export const TEAM_SIMULATOR_AVATAR_SIZE = 130;
export const TEAM_SIMULATOR_BALL_DISPLAY_SIZE = TEAM_SIMULATOR_AVATAR_SIZE / 2;
export function createTeamReceiveContactGeometry(flightDuration) {
  return createReceiveContactGeometry({
    avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
    avatarContactScale: getReceiveSpeedProfile(flightDuration).minimumScale,
    ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE,
    minimumOverlapDepth: 10,
    contactTolerance: 10,
  });
}
export const TEAM_SET_CONTACT_GEOMETRY = createSetContactGeometry({
  avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
  ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE,
  overlapRatio: SIMULATOR_BALL_OVERLAP_RATIO,
  horizontalTolerance: 10,
  verticalTolerance: 16,
});
export const TEAM_SIMULATOR_PARAMETERS = Object.freeze({
  ...DEFAULT_SIMULATOR_PARAMETERS,
  avatarSize: TEAM_SIMULATOR_AVATAR_SIZE,
  flightDuration: 1.5,
});

function assertTargetCoordinate(value, maximum, fieldName) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`${fieldName} 必須介於 0～${maximum}。`);
  }
  return value;
}

function createTeamPlayers(parameters) {
  return TEAM_RECEIVE_FORMATION.map((position) => Object.assign(
    createSimulatorPlayer({ ...position, moveSpeed: parameters.playerSpeed }),
    {
      responsibility: "HOLD",
      receiveAbility: position.receiveAbility,
      morale: position.morale,
      receivePreparationTime: 0,
      idealReceiveX: position.x,
      idealReceiveY: position.y,
    },
  ));
}

function getRectangleCenter(rectangle) {
  return Object.freeze({
    x: (rectangle.minX + rectangle.maxX) / 2,
    y: (rectangle.minY + rectangle.maxY) / 2,
  });
}

export class SixPlayerReceiveSimulator {
  constructor({
    parameters = TEAM_SIMULATOR_PARAMETERS,
    fixedStep = SIMULATOR_FIXED_STEP,
    random = Math.random,
    passTargetZones = PASS_TARGET_ZONES_V1,
    secondTouchPlayerId = null,
  } = {}) {
    if (!Number.isFinite(fixedStep) || fixedStep < 1 / 1000 || fixedStep > 0.1) {
      throw new RangeError("固定時間步進必須介於 0.001～0.1。");
    }
    if (typeof random !== "function") throw new TypeError("六人 Simulator 需要可呼叫的亂數來源。");
    this.fixedStep = fixedStep;
    this.random = random;
    this.configuredSecondTouchPlayerId = secondTouchPlayerId;
    this.passTargetZones = createPassTargetZones(passTargetZones, SIMULATOR_WORLD);
    this.parameters = validateSimulatorParameters(parameters);
    this.reset();
  }

  configure(parameters) {
    if (this.status === "RUNNING" || this.status === "PASS_IN_FLIGHT") {
      throw new Error("模擬進行中不可修改參數。");
    }
    this.parameters = validateSimulatorParameters({ ...this.parameters, ...parameters });
    this.reset();
  }

  configurePassTargetZones(zones) {
    this.passTargetZones = createPassTargetZones(zones, SIMULATOR_WORLD);
    if (this.status === "AWAITING_PASS_TARGET_CONFIG") {
      const contactEvent = [...this.events].reverse().find((event) => event.type === "BALL_CONTACTED");
      this.startSecondPass({ contactTime: contactEvent?.time ?? this.simulationTime });
    }
    return this.passTargetZones;
  }

  setSecondTouchPlayerId(playerId) {
    if (this.status === "RUNNING" || this.status === "PASS_IN_FLIGHT") {
      throw new Error("球路進行中不可更換第二觸球執行者。");
    }
    if (!this.players.some((player) => player.id === playerId)) {
      throw new RangeError(`第二觸球球員不存在：${playerId}`);
    }
    this.configuredSecondTouchPlayerId = playerId;
    this.secondTouchPlayerId = playerId;
  }

  reset() {
    this.accumulator = 0;
    this.simulationTime = 0;
    this.status = "READY";
    this.events = [];
    this.ball = createSimulatorBall(SIMULATOR_BALL_START);
    this.players = createTeamPlayers(this.parameters);
    this.receiveContactGeometry = createTeamReceiveContactGeometry(
      this.parameters.flightDuration,
    );
    this.primaryReceiverId = null;
    this.firstTouchPlayerId = null;
    this.firstTouchContact = null;
    this.secondTouchPlayerId = this.configuredSecondTouchPlayerId
      ?? this.players.find((player) => player.position === PLAYER_POSITIONS.S)?.id
      ?? null;
    if (!this.secondTouchPlayerId
      || !this.players.some((player) => player.id === this.secondTouchPlayerId)) {
      throw new RangeError("六人 Simulator 需要有效的第二觸球球員 ID。");
    }
    this.secondTouchPrepareTarget = getRectangleCenter(this.passTargetZones.perfect);
    this.secondTouchPrediction = null;
    this.secondTouchResult = null;
    this.touchEligibility = createTouchEligibilityState();
    this.receiveQualityResult = null;
    this.receiveOutcome = null;
    this.receiveErrorTrajectory = null;
    this.secondPass = null;
  }

  launch(target) {
    const targetX = assertTargetCoordinate(target.x, SIMULATOR_WORLD.width, "落點 X");
    const targetY = assertTargetCoordinate(target.y, SIMULATOR_WORLD.height, "落點 Y");
    this.reset();
    const speedProfile = getReceiveSpeedProfile(this.parameters.flightDuration);
    launchSimulatorBall(this.ball, {
      start: SIMULATOR_BALL_START,
      target: { x: targetX, y: targetY },
      duration: this.parameters.flightDuration,
      arcHeight: speedProfile.arcHeight,
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
    if (primaryReceiver) {
      decideChaseTarget(primaryReceiver, assignment.prediction);
      primaryReceiver.idealReceiveX = assignment.prediction.x;
      primaryReceiver.idealReceiveY = assignment.prediction.y;
    }
    const secondTouchPlayer = this.getSecondTouchPlayer();
    if (secondTouchPlayer && secondTouchPlayer.id !== this.primaryReceiverId) {
      decideChaseTarget(secondTouchPlayer, this.secondTouchPrepareTarget);
      secondTouchPlayer.task = PLAYER_TASKS.SET_PREPARE;
    }
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
    this.events.push(Object.freeze({
      type: "SECOND_TOUCH_PREPARE_STARTED",
      time: 0,
      playerId: this.secondTouchPlayerId,
      target: this.secondTouchPrepareTarget,
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
      contactGeometry: this.receiveContactGeometry,
      isCandidateEligible: (player) => isPlayerTouchEligible(this.touchEligibility, player.id),
    });
  }

  getPrimaryReceiver() {
    return this.players.find((player) => player.id === this.primaryReceiverId) ?? null;
  }

  getSecondTouchPlayer() {
    return this.players.find((player) => player.id === this.secondTouchPlayerId) ?? null;
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
    if (this.status === "RECEIVE_ERROR_IN_FLIGHT") {
      this.simulationTime += this.fixedStep;
      stepSimulatorBall(this.ball, this.fixedStep);
      if (this.ball.landed) {
        this.status = "RECEIVE_ERROR_COMPLETE";
        this.events.push(Object.freeze({ type: "RECEIVE_ERROR_LANDED",
          time: this.simulationTime, ballX: this.ball.x, ballY: this.ball.y }));
      }
      return;
    }
    if (this.status === "PASS_IN_FLIGHT") {
      this.stepSecondPass();
      return;
    }
    if (this.status !== "RUNNING") return;
    const primaryReceiver = this.getPrimaryReceiver();
    let currentPrediction = null;
    if (primaryReceiver) {
      currentPrediction = predictReachableContact({
        ball: this.ball,
        player: primaryReceiver,
        contactRange: this.parameters.contactRange,
        contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
        maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
        sampleStep: Math.max(this.fixedStep * 4, 1 / 30),
        contactGeometry: this.receiveContactGeometry,
      });
      decideChaseTarget(primaryReceiver, currentPrediction);
      primaryReceiver.idealReceiveX = currentPrediction.x;
      primaryReceiver.idealReceiveY = currentPrediction.y;
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
    if (primaryReceiver) {
      stepSimulatorPlayer(primaryReceiver, this.fixedStep);
      const idealDistance = Math.hypot(
        primaryReceiver.x - primaryReceiver.idealReceiveX,
        primaryReceiver.y - primaryReceiver.idealReceiveY,
      );
      primaryReceiver.receivePreparationTime = idealDistance <= this.parameters.contactRange
        ? primaryReceiver.receivePreparationTime + this.fixedStep
        : 0;
    }
    const preparingPlayer = this.getSecondTouchPlayer();
    if (preparingPlayer && preparingPlayer.id !== primaryReceiver?.id) {
      stepSimulatorPlayer(preparingPlayer, this.fixedStep);
    }

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
        contactGeometry: this.receiveContactGeometry,
      });
      if (candidateContact.contacted && isPlayerTouchEligible(this.touchEligibility, player.id)) {
        contact = candidateContact;
        contactingPlayer = player;
        break;
      }
    }
    if (contact?.contacted) {
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
      contactingPlayer.contactPoint = Object.freeze({
        x: contact.ballX,
        y: contact.ballY - contact.ballHeight,
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
        ballHeight: this.ball.height,
        playerX: contactingPlayer.x,
        playerY: contactingPlayer.y,
        receiveDirection: contactingPlayer.receiveDirection,
        contactPoint: contactingPlayer.contactPoint,
        centerDistance: contact.centerDistance,
        effectiveAvatarRadius: contact.effectiveAvatarRadius,
        ballRadius: contact.ballRadius,
        overlapDepth: contact.overlapDepth,
      }));
      this.firstTouchPlayerId = contactingPlayer.id;
      this.firstTouchContact = Object.freeze({
        playerId: contactingPlayer.id,
        centerDistance: contact.centerDistance,
        effectiveAvatarRadius: contact.effectiveAvatarRadius,
        ballRadius: contact.ballRadius,
        overlapDepth: contact.overlapDepth,
      });
      recordEligibleTouch(this.touchEligibility, { playerId: contactingPlayer.id });
      const positionDistance = Math.hypot(
        contactingPlayer.x - contactingPlayer.idealReceiveX,
        contactingPlayer.y - contactingPlayer.idealReceiveY,
      );
      const incomingVelocity = Object.freeze({
        x: (contact.ballX - previousBall.x) / (this.fixedStep * Math.max(contact.stepProgress, Number.EPSILON)),
        y: (contact.ballY - previousBall.y) / (this.fixedStep * Math.max(contact.stepProgress, Number.EPSILON)),
      });
      this.receiveOutcome = resolveReceiveContact({
        contacted: true,
        receiveAbility: contactingPlayer.receiveAbility,
        incomingSpeedLevel: getReceiveSpeedProfile(this.parameters.flightDuration).level,
        positionDistance,
        idealRange: this.parameters.contactRange,
        preparationTime: contactingPlayer.receivePreparationTime,
        morale: contactingPlayer.morale,
        random: this.random,
      });
      this.events.push(Object.freeze({ type: "RECEIVE_RESOLVED", time: contactTime,
        playerId: contactingPlayer.id, ...this.receiveOutcome }));
      if (this.receiveOutcome.result === RECEIVE_RESULTS.ERROR) {
        this.receiveErrorTrajectory = createReceiveErrorTrajectory({
          start: { x: this.ball.x, y: this.ball.y, height: this.ball.height },
          incomingVelocity,
          random: this.random,
        });
        launchSimulatorBall(this.ball, this.receiveErrorTrajectory);
        this.setTouchEligibility({ phase: TOUCH_PHASES.RECEIVE, eligiblePlayerIds: [] });
        this.status = "RECEIVE_ERROR_IN_FLIGHT";
        this.events.push(Object.freeze({ type: "RECEIVE_ERROR_STARTED", time: contactTime,
          playerId: contactingPlayer.id, trajectory: this.receiveErrorTrajectory }));
        return;
      }
      this.receiveQualityResult = this.receiveOutcome.qualityResult;
      this.events.push(Object.freeze({
        type: "RECEIVE_QUALITY_RESOLVED",
        time: contactTime,
        playerId: contactingPlayer.id,
        ...this.receiveQualityResult,
      }));
      if (!this.passTargetZones) {
        this.status = "AWAITING_PASS_TARGET_CONFIG";
        this.events.push(Object.freeze({
          type: "PASS_TARGET_CONFIGURATION_REQUIRED",
          time: contactTime,
          quality: this.receiveQualityResult.quality,
        }));
        return;
      }
      this.startSecondPass({ contactTime });
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

  stepSecondPass() {
    const shouldAttemptSecondTouch = this.receiveQualityResult.quality !== RECEIVE_QUALITIES.BAD;
    const secondTouchPlayer = shouldAttemptSecondTouch ? this.getSecondTouchPlayer() : null;
    if (secondTouchPlayer) {
      this.secondTouchPrediction = predictReachableContact({
        ball: this.ball,
        player: secondTouchPlayer,
        contactRange: this.parameters.contactRange,
        contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
        maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
        sampleStep: Math.max(this.fixedStep * 4, 1 / 30),
        contactGeometry: TEAM_SET_CONTACT_GEOMETRY,
      });
      decideChaseTarget(secondTouchPlayer, this.secondTouchPrediction);
      secondTouchPlayer.task = PLAYER_TASKS.SET_PREPARE;
    }
    const previousBall = {
      x: this.ball.x,
      y: this.ball.y,
      height: this.ball.height,
      progress: this.ball.progress,
      inFlight: this.ball.inFlight,
    };
    const previousPlayer = secondTouchPlayer
      ? { x: secondTouchPlayer.x, y: secondTouchPlayer.y }
      : null;
    this.simulationTime += this.fixedStep;
    stepSimulatorBall(this.ball, this.fixedStep);
    if (secondTouchPlayer) stepSimulatorPlayer(secondTouchPlayer, this.fixedStep);

    if (secondTouchPlayer && isPlayerTouchEligible(this.touchEligibility, secondTouchPlayer.id)) {
      const contact = detectSimulatorContact({
        previousBall,
        currentBall: this.ball,
        previousPlayer,
        currentPlayer: secondTouchPlayer,
        contactRange: this.parameters.contactRange,
        contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
        maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
        contactGeometry: TEAM_SET_CONTACT_GEOMETRY,
      });
      if (contact.contacted) {
        this.ball.inFlight = false;
        this.ball.landed = false;
        this.ball.x = contact.ballX;
        this.ball.y = contact.ballY;
        this.ball.height = contact.ballHeight;
        this.ball.progress = previousBall.progress
          + (this.ball.progress - previousBall.progress) * contact.stepProgress;
        secondTouchPlayer.x = contact.playerX;
        secondTouchPlayer.y = contact.playerY;
        secondTouchPlayer.action = "SET";
        secondTouchPlayer.receiveDirection = contact.direction;
        const contactTime = this.simulationTime
          - this.fixedStep
          + this.fixedStep * contact.stepProgress;
        recordEligibleTouch(this.touchEligibility, { playerId: secondTouchPlayer.id });
        this.secondTouchResult = Object.freeze({
          success: true,
          playerId: secondTouchPlayer.id,
          time: contactTime,
          ballX: contact.ballX,
          ballY: contact.ballY,
          ballHeight: contact.ballHeight,
          playerX: contact.playerX,
          playerY: contact.playerY,
          horizontalOffset: contact.horizontalOffset,
          verticalOffset: contact.verticalOffset,
          centerDistance: contact.centerDistance,
          effectiveAvatarRadius: contact.effectiveAvatarRadius,
          ballRadius: contact.ballRadius,
          overlapDepth: contact.overlapDepth,
          receiveQuality: this.receiveQualityResult.quality,
        });
        this.events.push(Object.freeze({
          type: "SECOND_TOUCH",
          ...this.secondTouchResult,
        }));
        this.status = "SECOND_TOUCH_COMPLETE";
        return;
      }
    }

    if (this.ball.landed) {
      const outsideWorld = this.ball.x < 0 || this.ball.x > SIMULATOR_WORLD.width
        || this.ball.y < 0 || this.ball.y > SIMULATOR_WORLD.height;
      this.secondTouchResult = Object.freeze({
        success: false,
        playerId: shouldAttemptSecondTouch ? this.secondTouchPlayerId : null,
        time: this.simulationTime,
        ballX: this.ball.x,
        ballY: this.ball.y,
        ballHeight: this.ball.height,
        receiveQuality: this.receiveQualityResult.quality,
        reason: shouldAttemptSecondTouch ? "BALL_LANDED" : "BAD_PASS_OUTSIDE",
      });
      this.events.push(Object.freeze({
        type: shouldAttemptSecondTouch ? "SECOND_TOUCH_MISSED" : "SECOND_PASS_LANDED",
        ...this.secondTouchResult,
        outsideWorld,
      }));
      this.status = shouldAttemptSecondTouch ? "SECOND_TOUCH_MISSED" : "PASS_COMPLETE";
    }
  }

  planSecondPassTrajectory({ quality, start, target, player }) {
    const base = SECOND_PASS_TRAJECTORY_CONFIG[quality];
    if (!player || quality === RECEIVE_QUALITIES.BAD) {
      return Object.freeze({
        ...base,
        additionalDuration: 0,
        prediction: null,
        adjusted: false,
        adjustmentLimitReached: false,
      });
    }
    const maximumSteps = Math.round(
      SECOND_TOUCH_TRAJECTORY_TUNING.maximumAdditionalDuration
        / SECOND_TOUCH_TRAJECTORY_TUNING.durationStep,
    );
    let selected = null;
    for (let step = 0; step <= maximumSteps; step += 1) {
      const additionalDuration = step * SECOND_TOUCH_TRAJECTORY_TUNING.durationStep;
      const duration = base.duration + additionalDuration;
      const arcHeight = base.arcHeight
        + additionalDuration * SECOND_TOUCH_TRAJECTORY_TUNING.additionalArcHeightPerSecond;
      const planningBall = createSimulatorBall(start);
      launchSimulatorBall(planningBall, {
        start,
        target,
        duration,
        arcHeight,
        trajectoryType: BALL_TRAJECTORY_TYPES.HIGH_ARC,
      });
      const prediction = predictReachableContact({
        ball: planningBall,
        player,
        contactRange: this.parameters.contactRange,
        contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
        maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT,
        sampleStep: Math.max(this.fixedStep * 4, 1 / 30),
        contactGeometry: TEAM_SET_CONTACT_GEOMETRY,
      });
      selected = {
        duration,
        arcHeight,
        additionalDuration,
        prediction,
        adjusted: step > 0,
        adjustmentLimitReached: !prediction.reachable && step === maximumSteps,
      };
      if (prediction.reachable) break;
    }
    return Object.freeze(selected);
  }

  startSecondPass({ contactTime }) {
    const quality = this.receiveQualityResult.quality;
    const target = samplePassTarget(this.passTargetZones, quality, this.random);
    const start = Object.freeze({ x: this.ball.x, y: this.ball.y, height: this.ball.height });
    const secondTouchPlayer = quality === RECEIVE_QUALITIES.BAD ? null : this.getSecondTouchPlayer();
    const trajectory = this.planSecondPassTrajectory({
      quality,
      start,
      target,
      player: secondTouchPlayer,
    });
    launchSimulatorBall(this.ball, {
      start,
      target,
      duration: trajectory.duration,
      arcHeight: trajectory.arcHeight,
      trajectoryType: BALL_TRAJECTORY_TYPES.HIGH_ARC,
    });
    const estimatedSecondTouch = trajectory.prediction;
    this.secondTouchPrediction = estimatedSecondTouch;
    this.setTouchEligibility({
      phase: TOUCH_PHASES.SET,
      eligiblePlayerIds: secondTouchPlayer ? [secondTouchPlayer.id] : [],
    });
    if (secondTouchPlayer && estimatedSecondTouch) {
      decideChaseTarget(secondTouchPlayer, estimatedSecondTouch);
      secondTouchPlayer.task = PLAYER_TASKS.SET_PREPARE;
    }
    this.secondPass = Object.freeze({
      quality,
      start,
      target,
      duration: trajectory.duration,
      arcHeight: trajectory.arcHeight,
      secondTouchPlayerId: secondTouchPlayer?.id ?? null,
      estimatedSecondTouch,
      trajectoryAdjusted: trajectory.adjusted,
      additionalDuration: trajectory.additionalDuration,
      trajectoryAdjustmentLimitReached: trajectory.adjustmentLimitReached,
    });
    this.status = "PASS_IN_FLIGHT";
    this.events.push(Object.freeze({
      type: "SECOND_PASS_STARTED",
      time: contactTime,
      ...this.secondPass,
    }));
  }

  getSnapshot() {
    return Object.freeze({
      status: this.status,
      simulationTime: this.simulationTime,
      parameters: this.parameters,
      world: SIMULATOR_WORLD,
      primaryReceiverId: this.primaryReceiverId,
      firstTouchPlayerId: this.firstTouchPlayerId,
      firstTouchContact: this.firstTouchContact,
      secondTouchPlayerId: this.secondTouchPlayerId,
      secondTouchPrepareTarget: this.secondTouchPrepareTarget,
      secondTouchPrediction: this.secondTouchPrediction,
      secondTouchResult: this.secondTouchResult,
      touchEligibility: createTouchEligibilitySnapshot(this.touchEligibility),
      receiveQuality: this.receiveQualityResult,
      receiveOutcome: this.receiveOutcome,
      receiveErrorTrajectory: this.receiveErrorTrajectory,
      secondPass: this.secondPass,
      ball: Object.freeze({
        x: this.ball.x,
        y: this.ball.y,
        height: this.ball.height,
        progress: this.ball.progress,
        duration: this.ball.duration,
        elapsed: this.ball.elapsed,
        inFlight: this.ball.inFlight,
        trajectoryType: this.ball.trajectoryType,
        arcHeight: this.ball.arcHeight,
        speedLevel: getReceiveSpeedProfile(this.parameters.flightDuration).level,
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
        receiveAbility: player.receiveAbility,
        morale: player.morale,
        receivePreparationTime: player.receivePreparationTime,
        idealReceiveX: player.idealReceiveX,
        idealReceiveY: player.idealReceiveY,
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
        ballDisplaySize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE,
        ballOverlapRatio: SIMULATOR_BALL_OVERLAP_RATIO,
        receiveContactScale: getReceiveSpeedProfile(this.parameters.flightDuration).minimumScale,
      }),
    });
  }
}
