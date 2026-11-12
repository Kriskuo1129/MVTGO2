import { LeftLongReceiveSimulator } from "./left-long-simulator.js";
import { TEAM_SIMULATOR_BALL_DISPLAY_SIZE } from "./team-simulator.js";
import { ATTACK_MOTION_V1 } from "./attack-motion.js";
import { createSimulatorBall, launchSimulatorBall, stepSimulatorBall, sampleSimulatorBall } from "./ball.js";
import { getReceiveSpeedProfile } from "./receive-animation.js";
import { createReceiveErrorTrajectory, RECEIVE_RESULTS, resolveReceiveContact } from "./receive-quality.js";
import { SPIKE_COURT_V1, validateSpikeTarget, validateSpikeParameters } from "./spike-court.js";
import { detectSpikeTermination, isSpikeExperimentRunning, sweepSpikeNet } from "./spike-flight.js";
import {
  createDefenseContactGeometry,
  createSingleDefender,
  detectSingleDefenseContact,
  SINGLE_DEFENSE_DEFAULTS,
  updateSingleDefender,
  validateSingleDefenseConfiguration,
} from "./single-defense.js";
import { ATTACK_SEED_MODES, createAutoAttackSeed,
  SPIKE_SPEED_REFERENCE } from "./attack-quality.js";
import { resolveAttackOutput } from "./attack-resolution.js";
import { classifyNaturalGround, createNaturalPredictionBall, createTargetedNaturalSpikeLaunch,
  getGroundContactFraction, NATURAL_SPIKE_PHYSICS_V1, sampleNaturalStep } from "./natural-spike-flight.js";

export const SPIKE_FLIGHT_MODES = Object.freeze({ NATURAL: "NATURAL", LEGACY_TARGET: "LEGACY_TARGET" });
export const NATURAL_SPIKE_EXPERIMENT_DEFAULTS = Object.freeze({
  mode: SPIKE_FLIGHT_MODES.NATURAL,
  attack: 70,
  attackConsistency: 70,
  seedMode: ATTACK_SEED_MODES.AUTO,
  randomSeed: 12345,
});

// 使用者確認的 D2 動畫預設；不改 D1 的可調參數與鏡像能力。
export const D2_ATTACK_MOTION_V1 = Object.freeze({ ...ATTACK_MOTION_V1, direction: "LEFT",
  jumpDuration: 0.8, takeoffDuration: 0.1, drawDuration: 0.2, swingDuration: 0.1 });

export class SpikeReceiveSimulator extends LeftLongReceiveSimulator {
  reset() {
    super.reset();
    this.lockedSpikeTarget = null;
    this.spikeFlight = null;
    this.spikeResult = null;
    this.pendingSpikeStatus = null;
    this.defenseConfiguration ??= SINGLE_DEFENSE_DEFAULTS;
    this.defensePlayer = null;
    this.defensePrediction = null;
    this.defenseResult = null;
    this.defenseContactGeometry = null;
    this.defenseContactResolved = false;
    this.attackResolution = null;
    this.naturalSpike = null;
    this.bounceState = null;
    this.actualAttackSeed = null;
  }

  guardSpikeConfiguration() {
    if (["SPIKE_IN_FLIGHT", "SPIKE_LANDING", "DEFENSE_TOUCH_LANDING", "BALL_BOUNCING"].includes(this.status)) throw new Error("扣球 Rally 進行中，目標與參數已鎖定，請先重設。");
  }
  configure(parameters) { this.guardSpikeConfiguration(); super.configure(parameters); }
  configureThirdPass(parameters) { this.guardSpikeConfiguration(); super.configureThirdPass(parameters); }
  configureAttackMotion(parameters) { this.guardSpikeConfiguration(); super.configureAttackMotion(parameters); }
  configureAttackAssignment(configuration) { this.guardSpikeConfiguration(); super.configureAttackAssignment(configuration); }

  configureSpikeExperiment(configuration) {
    if (isSpikeExperimentRunning(this.status)) throw new Error("發球開始後不可更改本 Rally 的扣球落點。");
    if (!configuration) { this.spikeConfiguration = null; return; }
    const mode = configuration.mode ?? SPIKE_FLIGHT_MODES.LEGACY_TARGET;
    if (!Object.values(SPIKE_FLIGHT_MODES).includes(mode)) throw new RangeError(`未知的扣球球路模式：${mode}`);
    const attack = configuration.attack ?? configuration.attackAbility ?? NATURAL_SPIKE_EXPERIMENT_DEFAULTS.attack;
    const attackConsistency = configuration.attackConsistency ?? NATURAL_SPIKE_EXPERIMENT_DEFAULTS.attackConsistency;
    const seedMode = configuration.seedMode ?? NATURAL_SPIKE_EXPERIMENT_DEFAULTS.seedMode;
    const randomSeed = configuration.randomSeed ?? NATURAL_SPIKE_EXPERIMENT_DEFAULTS.randomSeed;
    if (!Number.isInteger(attack) || attack < 1 || attack > 99
      || !Number.isInteger(attackConsistency) || attackConsistency < 1 || attackConsistency > 99
      || !Object.values(ATTACK_SEED_MODES).includes(seedMode)
      || !Number.isInteger(randomSeed)) throw new RangeError("自然扣球需要 1～99 整數攻擊能力、AUTO／FIXED Seed 模式與整數 Seed。");
    this.spikeConfiguration = Object.freeze({ mode, attack, attackConsistency, seedMode, randomSeed,
      target: mode === SPIKE_FLIGHT_MODES.LEGACY_TARGET ? validateSpikeTarget(configuration.target) : null,
      parameters: validateSpikeParameters(configuration.parameters) });
  }

  configureSingleDefense(configuration) {
    if (isSpikeExperimentRunning(this.status)) throw new Error("Rally 進行中不可修改單人防守設定。");
    this.defenseConfiguration = validateSingleDefenseConfiguration(configuration);
    this.defensePlayer = null;
    this.defensePrediction = null;
    this.defenseResult = null;
  }

  launch(target) {
    const configuration = this.spikeConfiguration;
    if (configuration) {
      if (!this.attackConfiguration) throw new Error("D2 必須啟用 LEFT_LONG 並指定合法 READY／ATTACK。");
      if ((this.attackMotionParameters ?? D2_ATTACK_MOTION_V1).direction !== "LEFT") throw new Error("D2 本次僅支援向左扣球；向右鏡像請關閉 D2 測試。");
      if (!this.attackMotionParameters) this.attackMotionParameters = D2_ATTACK_MOTION_V1;
    }
    super.launch(target);
    if (configuration) {
      this.lockedSpikeTarget = configuration.mode === SPIKE_FLIGHT_MODES.LEGACY_TARGET
        ? validateSpikeTarget(configuration.target) : null;
      if (configuration.mode === SPIKE_FLIGHT_MODES.NATURAL) {
        this.actualAttackSeed = configuration.seedMode === ATTACK_SEED_MODES.AUTO
          ? createAutoAttackSeed() : configuration.randomSeed >>> 0;
      }
      if (this.defenseConfiguration.enabled) this.defensePlayer = createSingleDefender(this.defenseConfiguration);
    }
  }

  finishThirdPass(resultStatus) {
    if (resultStatus !== "THIRD_TOUCH_COMPLETE" || !this.spikeConfiguration) {
      super.finishThirdPass(resultStatus); return;
    }
    if (this.spikeConfiguration.mode === SPIKE_FLIGHT_MODES.NATURAL) {
      this.startNaturalSpike();
      return;
    }
    const parameters = this.spikeConfiguration.parameters;
    const start = Object.freeze({ x: this.thirdTouchResult.ballX, y: this.thirdTouchResult.ballY, height: this.thirdTouchResult.ballHeight });
    const radius = TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2;
    const court = Object.freeze({ ...SPIKE_COURT_V1, netHeight: parameters.netHeight });
    this.spikeFlight = { status: "IN_PLAY", start, target: this.lockedSpikeTarget,
      parameters, radius, court, startedAt: this.thirdTouchResult.time,
      netCheck: Object.freeze({ enabled: parameters.netCollisionEnabled, result: "PENDING",
        geometryIntersectionDetected: false, planeCrossingHeight: null }) };
    launchSimulatorBall(this.ball, { start, target: { ...this.lockedSpikeTarget, height: radius },
      duration: parameters.flightDuration, arcHeight: parameters.arcHeight });
    if (this.defenseConfiguration.enabled) {
      this.defensePlayer ??= createSingleDefender(this.defenseConfiguration);
      this.defensePlayer.action = "CHASE";
      this.defenseContactGeometry = createDefenseContactGeometry(parameters.flightDuration);
    }
    this.status = "SPIKE_IN_FLIGHT";
    this.events.push(Object.freeze({ type: "SPIKE_STARTED", time: this.thirdTouchResult.time,
      playerId: this.thirdTouchResult.playerId, start, target: this.lockedSpikeTarget, duration: parameters.flightDuration, arcHeight: parameters.arcHeight }));
  }

  startNaturalSpike() {
    const parameters = this.spikeConfiguration.parameters;
    const start = Object.freeze({ x: this.thirdTouchResult.ballX, y: this.thirdTouchResult.ballY,
      height: this.thirdTouchResult.ballHeight });
    const radius = TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2;
    const court = Object.freeze({ ...SPIKE_COURT_V1, netHeight: parameters.netHeight });
    const setQuality = this.secondPass?.quality ?? this.receiveQuality?.quality;
    this.attackResolution = resolveAttackOutput({ attack: this.spikeConfiguration.attack,
      attackConsistency: this.spikeConfiguration.attackConsistency, setQuality,
      seed: this.actualAttackSeed, court });
    const speedLevel = this.attackResolution.speedLevel;
    const launch = createTargetedNaturalSpikeLaunch({ start,
      target: this.attackResolution.targetPoint, speedLevel, radius });
    const referenceTime = SPIKE_SPEED_REFERENCE.flightTimes[speedLevel];
    this.naturalSpike = { velocity: { ...launch.velocity }, elapsed: 0, speedLevel,
      actualSpeed: launch.actualSpeed, targetPoint: this.attackResolution.targetPoint,
      targetInBounds: this.attackResolution.targetInBounds, bounceCount: 0,
      grounded: false, firstGroundContact: null, rest: false };
    const prediction = createNaturalPredictionBall(start, this.naturalSpike.velocity, radius);
    Object.assign(this.ball, { x: start.x, y: start.y, height: start.height,
      start: start, target: prediction.target, duration: prediction.duration, elapsed: 0,
      progress: 0, arcHeight: prediction.arcHeight, inFlight: true, landed: false,
      trajectoryType: "NATURAL_SPIKE" });
    this.spikeFlight = { mode: SPIKE_FLIGHT_MODES.NATURAL, status: "IN_PLAY", start,
      target: prediction.target, parameters: Object.freeze({ ...parameters,
        flightDuration: referenceTime, speedLevel }), radius, court,
      startedAt: this.thirdTouchResult.time,
      netCheck: Object.freeze({ enabled: parameters.netCollisionEnabled, result: "PENDING",
        geometryIntersectionDetected: false, planeCrossingHeight: null }) };
    if (this.defenseConfiguration.enabled) {
      this.defensePlayer ??= createSingleDefender(this.defenseConfiguration);
      this.defensePlayer.action = "CHASE";
      this.defenseContactGeometry = createDefenseContactGeometry(referenceTime);
    }
    this.status = "SPIKE_IN_FLIGHT";
    this.events.push(Object.freeze({ type: "SPIKE_STARTED", time: this.thirdTouchResult.time,
      playerId: this.thirdTouchResult.playerId, mode: SPIKE_FLIGHT_MODES.NATURAL,
      start, clock: this.attackGeometry.clock, setQuality, speedLevel,
      attackResolution: this.attackResolution, velocity: Object.freeze({ ...launch.velocity }),
      actualSpeed: launch.actualSpeed }));
  }

  resolveDefenseReceive({ contact, contactTime, incomingVelocity, natural }) {
    const player = this.defensePlayer;
    const incomingSpeedLevel = this.spikeFlight.parameters.speedLevel
      ?? getReceiveSpeedProfile(this.spikeFlight.parameters.flightDuration).level;
    const positionDistance = this.defensePrediction
      ? Math.hypot(player.x - this.defensePrediction.x, player.y - this.defensePrediction.y) : 0;
    const outcome = resolveReceiveContact({ contacted: true,
      receiveAbility: player.receiveAbility, incomingSpeedLevel, positionDistance,
      idealRange: this.defenseContactGeometry.horizontalTolerance,
      preparationTime: player.receivePreparationTime, morale: player.morale, random: this.random });
    Object.assign(this.ball, { x: contact.ballX, y: contact.ballY,
      height: contact.ballHeight, inFlight: false, landed: false });
    Object.assign(player, { x: contact.playerX, y: contact.playerY,
      action: "RECEIVE", receiveDirection: contact.direction, isMoving: false, touchEligible: false });
    this.defenseContactResolved = true;
    const details = { playerId: player.id, time: contactTime, ballX: contact.ballX,
      ballY: contact.ballY, ballHeight: contact.ballHeight, direction: contact.direction,
      centerDistance: contact.centerDistance, effectiveAvatarRadius: contact.effectiveAvatarRadius,
      ballRadius: contact.ballRadius, overlapDepth: contact.overlapDepth, receiveOutcome: outcome };
    if (outcome.result === RECEIVE_RESULTS.SUCCESS) {
      this.defenseResult = Object.freeze({ type: "DEFENSE_TOUCH", success: true, ...details,
        quality: outcome.quality });
      this.spikeFlight.status = "DEFENSE_TOUCH";
      this.events.push(this.defenseResult);
      this.status = this.attackMotion.jumpPhase === "LANDED"
        ? "DEFENSE_TOUCH_COMPLETE" : "DEFENSE_TOUCH_LANDING";
      return;
    }
    const trajectory = createReceiveErrorTrajectory({
      start: { x: contact.ballX, y: contact.ballY, height: contact.ballHeight },
      incomingVelocity,
      receivingTeam: player.team,
      random: this.random,
    });
    this.defenseResult = Object.freeze({ type: "DEFENSE_ERROR", success: false,
      ...details, trajectory });
    this.events.push(this.defenseResult);
    if (natural) {
      const duration = trajectory.duration;
      this.naturalSpike.velocity = {
        x: (trajectory.target.x - trajectory.start.x) / duration,
        y: (trajectory.target.y - trajectory.start.y) / duration,
        height: (this.spikeFlight.radius - trajectory.start.height
          + 0.5 * NATURAL_SPIKE_PHYSICS_V1.gravity * duration ** 2) / duration,
      };
      this.ball.inFlight = true;
      this.updateNaturalBallMetadata();
    } else {
      launchSimulatorBall(this.ball, { ...trajectory,
        target: { ...trajectory.target, height: this.spikeFlight.radius } });
      this.spikeFlight.startedAt = contactTime;
      this.spikeFlight.target = this.ball.target;
      this.spikeFlight.parameters = Object.freeze({ ...this.spikeFlight.parameters,
        flightDuration: trajectory.duration, arcHeight: trajectory.arcHeight });
    }
  }

  updateNaturalBallMetadata() {
    const prediction = createNaturalPredictionBall(this.ball, this.naturalSpike.velocity,
      this.spikeFlight.radius, NATURAL_SPIKE_PHYSICS_V1);
    this.ball.start = Object.freeze({ x: this.ball.x, y: this.ball.y, height: this.ball.height });
    this.ball.target = prediction.target;
    this.ball.duration = prediction.duration;
    this.ball.elapsed = 0;
    this.ball.progress = 0;
    this.ball.arcHeight = prediction.arcHeight;
    this.spikeFlight.target = prediction.target;
    return prediction;
  }

  recordNaturalGround(point, impactVelocity) {
    const state = this.naturalSpike, flight = this.spikeFlight;
    if (!state.firstGroundContact) {
      const groundType = classifyNaturalGround(point, flight.radius, flight.court);
      const type = this.spikeResult?.type === "SPIKE_NET" ? "SPIKE_NET" : groundType;
      state.firstGroundContact = Object.freeze({ x: point.x, y: point.y,
        height: flight.radius, time: this.simulationTime, type: groundType });
      if (!this.spikeResult) {
        this.spikeResult = Object.freeze({ type, reason: type, time: this.simulationTime,
          ballX: point.x, ballY: point.y, ballHeight: flight.radius, groundHeight: 0,
          radius: flight.radius, netCheck: flight.netCheck,
          targetPoint: state.targetPoint, targetInBounds: state.targetInBounds,
          actualLandingPoint: Object.freeze({ x: point.x, y: point.y }),
          actualInBounds: type === "SPIKE_LANDED" });
        this.events.push(this.spikeResult);
      } else {
        this.spikeResult = Object.freeze({ ...this.spikeResult,
          targetPoint: state.targetPoint, targetInBounds: state.targetInBounds,
          actualLandingPoint: Object.freeze({ x: point.x, y: point.y }),
          actualInBounds: groundType === "SPIKE_LANDED" });
      }
      this.events.push(Object.freeze({ type: "BALL_FIRST_GROUND_CONTACT",
        time: this.simulationTime, result: groundType, rallyResult: type, x: point.x, y: point.y,
        impactVerticalSpeed: impactVelocity.height }));
    }
    state.bounceCount += 1;
    state.velocity.x = impactVelocity.x * NATURAL_SPIKE_PHYSICS_V1.horizontalBounceRetention;
    state.velocity.y = impactVelocity.y * NATURAL_SPIKE_PHYSICS_V1.horizontalBounceRetention;
    const rebound = Math.abs(impactVelocity.height) * NATURAL_SPIKE_PHYSICS_V1.verticalRestitution;
    state.velocity.height = rebound >= NATURAL_SPIKE_PHYSICS_V1.minimumBounceSpeed ? rebound : 0;
    state.grounded = state.velocity.height === 0;
    Object.assign(this.ball, { x: point.x, y: point.y, height: flight.radius, landed: true, inFlight: true });
    flight.status = "BOUNCING";
    this.status = "BALL_BOUNCING";
    this.events.push(Object.freeze({ type: "BALL_BOUNCED", time: this.simulationTime,
      bounceCount: state.bounceCount, verticalSpeed: state.velocity.height,
      horizontalSpeed: Math.hypot(state.velocity.x, state.velocity.y) }));
  }

  finishNaturalRest() {
    const state = this.naturalSpike;
    state.rest = true;
    Object.assign(this.ball, { height: this.spikeFlight.radius, inFlight: false, landed: true });
    this.spikeFlight.status = "BALL_REST";
    this.status = "BALL_REST";
    this.events.push(Object.freeze({ type: "BALL_REST", time: this.simulationTime,
      x: this.ball.x, y: this.ball.y, bounceCount: state.bounceCount,
      firstResult: this.spikeResult?.type ?? null }));
  }

  stepNaturalBounce() {
    const state = this.naturalSpike;
    this.simulationTime += this.fixedStep;
    this.updateAttackPose(this.players.find((player) => player.id === this.attackMotion.playerId), this.simulationTime);
    const damping = Math.exp(-NATURAL_SPIKE_PHYSICS_V1.horizontalDampingPerSecond * this.fixedStep);
    state.velocity.x *= damping;
    state.velocity.y *= damping;
    if (state.grounded) {
      this.ball.x += state.velocity.x * this.fixedStep;
      this.ball.y += state.velocity.y * this.fixedStep;
      if (Math.hypot(state.velocity.x, state.velocity.y) <= NATURAL_SPIKE_PHYSICS_V1.restHorizontalSpeed) this.finishNaturalRest();
      return;
    }
    const previous = { x: this.ball.x, y: this.ball.y, height: this.ball.height };
    const velocity = { ...state.velocity };
    const next = sampleNaturalStep(previous, velocity, this.fixedStep);
    const fraction = getGroundContactFraction(previous, velocity, this.fixedStep,
      this.spikeFlight.radius, NATURAL_SPIKE_PHYSICS_V1.gravity);
    if (fraction !== null) {
      const time = this.fixedStep * fraction;
      const point = sampleNaturalStep(previous, velocity, time);
      this.recordNaturalGround(point, point.velocity);
      return;
    }
    Object.assign(this.ball, { x: next.x, y: next.y, height: next.height });
    Object.assign(state.velocity, next.velocity);
  }

  stepNaturalSpike() {
    const state = this.naturalSpike, flight = this.spikeFlight, radius = flight.radius;
    const prediction = createNaturalPredictionBall(this.ball, state.velocity, radius, NATURAL_SPIKE_PHYSICS_V1);
    const previousBall = { x: this.ball.x, y: this.ball.y, height: this.ball.height,
      progress: 0, inFlight: true };
    const defenseStep = this.defensePlayer && !this.defenseContactResolved
      ? updateSingleDefender({ ball: prediction, player: this.defensePlayer,
        fixedStep: this.fixedStep, contactGeometry: this.defenseContactGeometry }) : null;
    if (defenseStep) this.defensePrediction = defenseStep.prediction;
    const previousVelocity = { ...state.velocity };
    const next = sampleNaturalStep(previousBall, previousVelocity, this.fixedStep);
    const segment = createSimulatorBall(previousBall);
    launchSimulatorBall(segment, { start: previousBall,
      target: { x: next.x, y: next.y, height: next.height }, duration: this.fixedStep,
      arcHeight: NATURAL_SPIKE_PHYSICS_V1.gravity * this.fixedStep ** 2 / 8 });
    const netProgress = sweepSpikeNet(segment, 0, 1, radius, flight.court);
    const groundProgress = getGroundContactFraction(previousBall, previousVelocity,
      this.fixedStep, radius, NATURAL_SPIKE_PHYSICS_V1.gravity);
    const currentBall = { x: next.x, y: next.y, height: next.height, progress: 1, inFlight: true };
    const defenseContact = defenseStep ? detectSingleDefenseContact({ previousBall,
      currentBall, previousPlayer: defenseStep.previousPlayer,
      currentPlayer: this.defensePlayer, contactGeometry: this.defenseContactGeometry }) : null;
    const netEvent = netProgress ?? Infinity;
    const groundEvent = groundProgress ?? Infinity;
    const defenseEvent = defenseContact?.contacted ? defenseContact.stepProgress : Infinity;

    this.simulationTime += this.fixedStep;
    state.elapsed += this.fixedStep;
    this.updateAttackPose(this.players.find((player) => player.id === this.attackMotion.playerId), this.simulationTime);

    if (defenseEvent < netEvent - 1e-10 && defenseEvent < groundEvent - 1e-10) {
      this.resolveDefenseReceive({ contact: defenseContact,
        contactTime: this.simulationTime - this.fixedStep + this.fixedStep * defenseEvent,
        incomingVelocity: previousVelocity, natural: true });
      return;
    }

    if (netProgress !== null) {
      const intersection = sampleSimulatorBall(segment, netProgress * segment.duration);
      flight.netCheck = Object.freeze({ enabled: flight.parameters.netCollisionEnabled,
        result: flight.parameters.netCollisionEnabled ? "NET_CONTACT" : "INTERSECTION_IGNORED",
        geometryIntersectionDetected: true, contactHeight: intersection.height,
        planeCrossingHeight: intersection.height, predictedPlaneCrossingHeight: intersection.height });
      if (flight.parameters.netCollisionEnabled && netEvent <= groundEvent + 1e-10) {
        Object.assign(this.ball, { x: intersection.x, y: intersection.y, height: intersection.height });
        const atNet = sampleNaturalStep(previousBall, previousVelocity, this.fixedStep * netProgress);
        state.velocity.x = Math.abs(atNet.velocity.x) * NATURAL_SPIKE_PHYSICS_V1.netHorizontalRetention;
        state.velocity.y = atNet.velocity.y * NATURAL_SPIKE_PHYSICS_V1.netHorizontalRetention;
        state.velocity.height = Math.min(atNet.velocity.height, -NATURAL_SPIKE_PHYSICS_V1.netDownwardSpeed);
        if (!this.spikeResult) {
          this.spikeResult = Object.freeze({ type: "SPIKE_NET", reason: "SPIKE_NET",
            time: this.simulationTime - this.fixedStep + this.fixedStep * netProgress,
            ballX: intersection.x, ballY: intersection.y, ballHeight: intersection.height,
            groundHeight: null, radius, netCheck: flight.netCheck });
          this.events.push(this.spikeResult);
        }
        if (this.defensePlayer && !this.defenseContactResolved) {
          this.defensePlayer.action = "IDLE";
          this.defenseResult = Object.freeze({ type: "DEFENSE_MISSED", success: false,
            playerId: this.defensePlayer.id, time: this.spikeResult.time, reason: "SPIKE_NET" });
          this.defensePlayer = null;
        }
        return;
      }
    }

    if (groundProgress !== null && groundEvent <= netEvent + 1e-10) {
      const time = this.fixedStep * groundProgress;
      const point = sampleNaturalStep(previousBall, previousVelocity, time);
      this.recordNaturalGround(point, point.velocity);
      if (this.defensePlayer && !this.defenseResult) {
        this.defenseResult = Object.freeze({ type: "DEFENSE_MISSED", success: false,
          playerId: this.defensePlayer.id, time: this.simulationTime, reason: this.spikeResult.type });
        this.defensePlayer.action = "IDLE";
      }
      return;
    }

    Object.assign(this.ball, { x: next.x, y: next.y, height: next.height });
    Object.assign(state.velocity, next.velocity);
    this.updateNaturalBallMetadata();
  }

  stepSpike() {
    const from = this.ball.progress;
    const previousBall = { x: this.ball.x, y: this.ball.y, height: this.ball.height,
      progress: this.ball.progress, inFlight: this.ball.inFlight };
    const defenseStep = this.defensePlayer && !this.defenseContactResolved
      ? updateSingleDefender({ ball: this.ball, player: this.defensePlayer,
        fixedStep: this.fixedStep, contactGeometry: this.defenseContactGeometry }) : null;
    if (defenseStep) this.defensePrediction = defenseStep.prediction;
    this.simulationTime += this.fixedStep;
    stepSimulatorBall(this.ball, this.fixedStep);
    const player = this.players.find((candidate) => candidate.id === this.attackMotion.playerId);
    this.updateAttackPose(player, this.simulationTime);
    const flight = this.spikeFlight, { radius, court } = flight;
    const netIntersectionProgress = sweepSpikeNet(this.ball, from, this.ball.progress, radius, court);
    const terminal = detectSpikeTermination(this.ball, from, this.ball.progress, radius, court,
      { netCollisionEnabled: flight.parameters.netCollisionEnabled });
    const defenseContact = defenseStep ? detectSingleDefenseContact({
      previousBall,
      currentBall: this.ball,
      previousPlayer: defenseStep.previousPlayer,
      currentPlayer: this.defensePlayer,
      contactGeometry: this.defenseContactGeometry,
    }) : null;
    const stepLength = this.ball.progress - from;
    const terminalStepProgress = terminal && stepLength > Number.EPSILON
      ? (terminal.progress - from) / stepLength : Infinity;
    if (defenseContact?.contacted && defenseContact.stepProgress < terminalStepProgress - Number.EPSILON) {
      const contactTime = this.simulationTime - this.fixedStep + this.fixedStep * defenseContact.stepProgress;
      this.resolveDefenseReceive({ contact: defenseContact, contactTime,
        incomingVelocity: { x: (this.ball.x - previousBall.x) / this.fixedStep,
          y: (this.ball.y - previousBall.y) / this.fixedStep }, natural: false });
      return;
    }
    const planeProgress = (court.netX - this.ball.start.x) / (this.ball.target.x - this.ball.start.x);
    const predictedHeight = planeProgress >= 0 && planeProgress <= 1 ? sampleSimulatorBall(this.ball, planeProgress * this.ball.duration).height : null;
    const checkedProgress = terminal?.progress ?? this.ball.progress;
    const crossed = planeProgress >= 0 && planeProgress <= 1 && checkedProgress >= planeProgress;
    const cleared = crossed && this.ball.start.x + (this.ball.target.x - this.ball.start.x) * checkedProgress < court.netX - radius - court.netTolerance;
    const geometryIntersectionDetected = flight.netCheck.geometryIntersectionDetected || netIntersectionProgress !== null;
    const intersectionPosition = netIntersectionProgress === null
      ? null : sampleSimulatorBall(this.ball, netIntersectionProgress * this.ball.duration);
    flight.netCheck = Object.freeze({ enabled: flight.parameters.netCollisionEnabled,
      result: terminal?.type === "SPIKE_NET" ? "NET_CONTACT"
        : geometryIntersectionDetected && !flight.parameters.netCollisionEnabled ? "INTERSECTION_IGNORED"
          : cleared ? "CLEARED" : "PENDING",
      geometryIntersectionDetected,
      predictedPlaneCrossingHeight: predictedHeight, planeCrossingHeight: crossed ? predictedHeight : null,
      bottomAtPlane: crossed ? predictedHeight - radius : null,
      contactHeight: terminal?.type === "SPIKE_NET" ? terminal.position.height
        : intersectionPosition?.height ?? flight.netCheck.contactHeight ?? null });
    if (!terminal) return;
    const p = terminal.position;
    Object.assign(this.ball, { x: p.x, y: p.y, height: terminal.type === "SPIKE_NET" ? p.height : radius,
      progress: terminal.progress, elapsed: terminal.progress * this.ball.duration,
      inFlight: false, landed: terminal.type !== "SPIKE_NET" });
    this.spikeResult = Object.freeze({ type: terminal.type, reason: terminal.type,
      time: flight.startedAt + this.ball.elapsed, ballX: this.ball.x, ballY: this.ball.y, ballHeight: this.ball.height,
      groundHeight: terminal.type === "SPIKE_NET" ? null : 0, radius, netCheck: flight.netCheck });
    if (this.defensePlayer && !this.defenseContactResolved) {
      this.defensePlayer.action = "IDLE";
      this.defensePlayer.touchEligible = false;
      this.defensePlayer.responsibility = "HOLD";
      this.defenseResult = Object.freeze({ type: "DEFENSE_MISSED", success: false,
        playerId: this.defensePlayer.id, time: this.spikeResult.time,
        reason: terminal.type === "SPIKE_NET" ? "SPIKE_NET" : terminal.type });
    }
    flight.status = terminal.type;
    this.events.push(this.spikeResult);
    if (this.attackMotion.jumpPhase === "LANDED") this.status = terminal.type;
    else { this.pendingSpikeStatus = terminal.type; this.status = "SPIKE_LANDING"; }
  }

  stepFixed() {
    if (this.status === "SPIKE_IN_FLIGHT") {
      if (this.spikeConfiguration?.mode === SPIKE_FLIGHT_MODES.NATURAL) this.stepNaturalSpike();
      else this.stepSpike();
      return;
    }
    if (this.status === "BALL_BOUNCING") { this.stepNaturalBounce(); return; }
    if (this.status === "DEFENSE_TOUCH_LANDING") {
      this.simulationTime += this.fixedStep;
      this.updateAttackPose(this.players.find((player) => player.id === this.attackMotion.playerId), this.simulationTime);
      if (this.attackMotion.jumpPhase === "LANDED") this.status = "DEFENSE_TOUCH_COMPLETE";
      return;
    }
    if (this.status === "SPIKE_LANDING") {
      this.simulationTime += this.fixedStep;
      this.updateAttackPose(this.players.find((player) => player.id === this.attackMotion.playerId), this.simulationTime);
      if (this.attackMotion.jumpPhase === "LANDED") { this.status = this.pendingSpikeStatus; this.pendingSpikeStatus = null; }
      return;
    }
    super.stepFixed();
  }

  getSnapshot() {
    const snapshot = super.getSnapshot();
    return Object.freeze({ ...snapshot, lockedSpikeTarget: this.lockedSpikeTarget,
      spikeFlight: this.spikeFlight ? Object.freeze({ ...this.spikeFlight, progress: this.ball.progress,
        elapsed: this.naturalSpike?.elapsed ?? this.ball.elapsed,
        remainingTime: this.spikeFlight.status === "IN_PLAY" ? Math.max(0, this.ball.duration - this.ball.elapsed) : 0 }) : null,
      spikeResult: this.spikeResult,
      ...(this.spikeConfiguration ? {
        attackResolution: this.attackResolution,
        actualAttackSeed: this.actualAttackSeed,
        attackGeometry: this.attackGeometry,
        naturalSpike: this.naturalSpike ? Object.freeze({ ...this.naturalSpike,
          velocity: Object.freeze({ ...this.naturalSpike.velocity }) }) : null,
      } : {}),
      ...(this.defenseConfiguration.enabled ? { defense: Object.freeze({ enabled: true,
        configuration: this.defenseConfiguration,
        player: this.defensePlayer ? Object.freeze({ ...this.defensePlayer }) : null,
        prediction: this.defensePrediction,
        contactGeometry: this.defenseContactGeometry ?? null,
        result: this.defenseResult }) } : {}) });
  }
}
