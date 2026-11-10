import { SixPlayerReceiveSimulator, TEAM_SIMULATOR_AVATAR_SIZE, TEAM_SIMULATOR_BALL_DISPLAY_SIZE } from "./team-simulator.js";
import { launchSimulatorBall, stepSimulatorBall } from "./ball.js";
import { SIMULATOR_WORLD } from "./simulator.js";
import { createAttackContactGeometry, detectAttackContact } from "./attack-contact.js";
import { THIRD_PASS_TEST_DEFAULTS, validateThirdPassParameters, planThirdPass } from "./third-pass.js";
import { TOUCH_PHASES, isPlayerTouchEligible, recordEligibleTouch } from "./touch-eligibility.js";
import { getReceiveAnimationProfile } from "./receive-animation.js";
import { ATTACK_MOTION_V1, validateAttackMotionParameters, createAttackMotion,
  updateAttackMotion, sampleAttackMotion, getAttackStrikeWindow } from "./attack-motion.js";
import {
  ATTACK_MOVEMENT_PHASES, createAttackAssignment, isReceiveExperimentRunning,
  setAttackMovementPhase, stepAttackAssignment,
} from "./attack-assignment.js";

// 專用實驗層。未配置 Assignment 時完全沿用原六人停止行為與碰撞流程。
export class LeftLongReceiveSimulator extends SixPlayerReceiveSimulator {
  reset() {
    super.reset();
    this.attackAssignment = null;
    this.thirdPass = null;
    this.thirdTouchResult = null;
    this.attackMotion = null;
    this.pendingThirdTouchStatus = null;
  }

  configure(parameters) {
    if (["THIRD_PASS_IN_FLIGHT", "ATTACK_LANDING"].includes(this.status)) throw new Error("攻擊實驗進行中不可修改參數，請先重設。");
    super.configure(parameters);
  }

  configureThirdPass(parameters) {
    if (isReceiveExperimentRunning(this.status)) throw new Error("實驗進行中不可修改第三段參數。");
    this.thirdPassParameters = validateThirdPassParameters(parameters);
  }

  configureAttackMotion(parameters) {
    if (isReceiveExperimentRunning(this.status)) throw new Error("實驗進行中不可修改攻擊動畫參數。");
    this.attackMotionParameters = validateAttackMotionParameters(parameters);
  }

  configureAttackAssignment(configuration) {
    if (isReceiveExperimentRunning(this.status)) throw new Error("實驗進行中不可更換進攻任務。");
    const assignment = configuration
      ? createAttackAssignment(configuration, this.players, this.secondTouchPlayerId) : null;
    this.attackConfiguration = assignment;
    this.attackAssignment = null;
  }

  launch(target) {
    const assignment = this.attackConfiguration
      ? createAttackAssignment(this.attackConfiguration, this.players, this.secondTouchPlayerId) : null;
    const motion = this.attackMotionParameters ?? ATTACK_MOTION_V1;
    const third = this.thirdPassParameters ?? THIRD_PASS_TEST_DEFAULTS;
    if (assignment && third.arcHeight < third.contactHeight + motion.maximumHeight) {
      throw new RangeError("第三段弧度需至少等於相對接觸高度加上跳躍最高高度；請調整測試參數，不會自動修正球路。");
    }
    super.launch(target);
    this.attackAssignment = assignment;
  }

  startThirdPass(secondTouch) {
    const parameters = this.thirdPassParameters ?? THIRD_PASS_TEST_DEFAULTS;
    const motionParameters = this.attackMotionParameters ?? ATTACK_MOTION_V1;
    this.attackGeometry = createAttackContactGeometry({ avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
      ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE, contactHeight: parameters.contactHeight, direction: motionParameters.direction });
    this.thirdPass = planThirdPass({ start: { x: this.ball.x, y: this.ball.y, height: this.ball.height },
      attackPosition: this.attackAssignment.attackPosition, assignedPlayerId: this.attackAssignment.assignedPlayerId,
      parameters, geometry: this.attackGeometry, anticipatedJumpHeight: motionParameters.maximumHeight });
    this.attackMotion = createAttackMotion({ playerId: this.attackAssignment.assignedPlayerId,
      simulationTime: this.simulationTime, predictedContactTime: this.simulationTime + this.thirdPass.expectedContactTime,
      parameters: motionParameters });
    launchSimulatorBall(this.ball, { start: this.thirdPass.start, target: this.thirdPass.landingTarget,
      duration: this.thirdPass.duration, arcHeight: this.thirdPass.arcHeight });
    this.setTouchEligibility({ phase: TOUCH_PHASES.ATTACK, eligiblePlayerIds: [this.thirdPass.assignedPlayerId] });
    this.status = "THIRD_PASS_IN_FLIGHT";
    this.events.push(Object.freeze({ type: "THIRD_PASS_STARTED", time: secondTouch.time, ...this.thirdPass }));
  }

  advanceAttackPlayer(player) {
    const motion = this.attackMotion, end = this.simulationTime, begin = end - this.fixedStep;
    if (motion.startedAt === null && motion.jumpPhase !== "SKIPPED") {
      const before = Math.max(0, Math.min(this.fixedStep, motion.scheduledTakeoffTime - begin));
      if (before > 0) stepAttackAssignment(this.attackAssignment, player, begin + before, before);
      const tryTakeoff = (time) => {
        if (time + 1e-10 < motion.scheduledTakeoffTime
          || time > motion.scheduledTakeoffTime + motion.parameters.maximumTakeoffDelay + 1e-10
          || time < this.attackAssignment.movementBlockedUntil || player.action === "RECEIVE"
          || Math.hypot(player.x - this.attackAssignment.attackPosition.x, player.y - this.attackAssignment.attackPosition.y) > 0.0001) return;
        motion.startedAt = time;
        motion.takeoffPosition = Object.freeze({ x: player.x, y: player.y });
        this.events.push(Object.freeze({ type: "ATTACK_JUMP_STARTED", time, playerId: player.id,
          x: player.x, y: player.y, predictedContactTime: motion.predictedContactTime }));
      };
      tryTakeoff(begin + before);
      if (motion.startedAt === null && before < this.fixedStep) {
        stepAttackAssignment(this.attackAssignment, player, end, this.fixedStep - before);
        tryTakeoff(end);
      }
      if (motion.startedAt === null && end > motion.scheduledTakeoffTime + motion.parameters.maximumTakeoffDelay) {
        motion.jumpPhase = "SKIPPED"; motion.skipReason = "ATTACK_NOT_READY_IN_TIME";
      }
    } else if (motion.startedAt === null) {
      stepAttackAssignment(this.attackAssignment, player, end, this.fixedStep);
    }
    this.updateAttackPose(player, end);
  }

  updateAttackPose(player, time) {
    const before = this.attackMotion.jumpPhase;
    updateAttackMotion(this.attackMotion, player, time);
    if (before !== "LANDED" && this.attackMotion.jumpPhase === "LANDED") {
      this.events.push(Object.freeze({ type: "ATTACK_LANDED", time, playerId: player.id }));
    }
  }

  finishThirdPass(resultStatus) {
    const motion = this.attackMotion;
    if (motion && motion.startedAt !== null && motion.jumpPhase !== "LANDED") {
      this.pendingThirdTouchStatus = resultStatus;
      this.status = "ATTACK_LANDING";
    } else {
      if (motion && motion.startedAt === null) {
        motion.jumpPhase = "SKIPPED";
        motion.skipReason ??= "BALL_FINISHED_BEFORE_TAKEOFF";
      }
      this.status = resultStatus;
    }
  }

  stepThirdPass(player) {
    const previousBall = { ...this.ball }, previousPlayer = { ...player };
    const previousPhase = this.attackAssignment.movementPhase;
    this.simulationTime += this.fixedStep;
    stepSimulatorBall(this.ball, this.fixedStep);
    if (typeof this.adjustThirdPassBall === "function") this.adjustThirdPassBall();
    this.advanceAttackPlayer(player);
    const strikeWindow = getAttackStrikeWindow(this.attackMotion, this.simulationTime - this.fixedStep, this.simulationTime);
    const contact = isPlayerTouchEligible(this.touchEligibility, player.id)
      ? detectAttackContact({ previousBall, currentBall: this.ball, previousPlayer, currentPlayer: player,
        assignedPlayerId: this.thirdPass.assignedPlayerId, flightStatus: this.thirdPass.status, geometry: this.attackGeometry, strikeWindow })
      : { contacted: false };
    if (contact.contacted && contact.ballX >= 0 && contact.ballX <= SIMULATOR_WORLD.width
      && contact.ballY >= 0 && contact.ballY <= SIMULATOR_WORLD.height) {
      const time = this.simulationTime - this.fixedStep + this.fixedStep * contact.stepProgress;
      this.ball.x = contact.ballX; this.ball.y = contact.ballY; this.ball.height = contact.ballHeight;
      this.ball.progress = previousBall.progress + (this.ball.progress - previousBall.progress) * contact.stepProgress;
      this.ball.elapsed = previousBall.elapsed + (this.ball.elapsed - previousBall.elapsed) * contact.stepProgress;
      this.ball.inFlight = false; this.ball.landed = false;
      player.x = contact.playerX; player.y = contact.playerY; player.isMoving = false;
      this.attackAssignment.movementPhase = Math.hypot(player.x - player.targetX, player.y - player.targetY) < 0.0001
        ? ATTACK_MOVEMENT_PHASES.ATTACK_READY : ATTACK_MOVEMENT_PHASES.MOVING_TO_ATTACK;
      if (previousPhase !== this.attackAssignment.movementPhase) this.recordAttackPhase(player, time);
      const contactPose = sampleAttackMotion(this.attackMotion.parameters, time - this.attackMotion.startedAt);
      this.thirdTouchResult = Object.freeze({ ...contact, success: true, playerId: player.id, time,
        jumpPhase: "SWING", rotationAngle: contactPose.rotationAngle });
      recordEligibleTouch(this.touchEligibility, { playerId: player.id });
      this.events.push(Object.freeze({ type: "THIRD_TOUCH", ...this.thirdTouchResult }));
      this.thirdPass = Object.freeze({ ...this.thirdPass, status: "COMPLETE" });
      this.finishThirdPass("THIRD_TOUCH_COMPLETE");
      return;
    }
    if (previousPhase !== this.attackAssignment.movementPhase) this.recordAttackPhase(player);
    const outside = this.ball.x < 0 || this.ball.x > SIMULATOR_WORLD.width || this.ball.y < 0 || this.ball.y > SIMULATOR_WORLD.height;
    if (this.ball.landed || outside) {
      const reason = outside ? "OUT_OF_BOUNDS" : "BALL_LANDED";
      this.thirdTouchResult = Object.freeze({ success: false, playerId: this.thirdPass.assignedPlayerId,
        time: this.simulationTime, reason, ballX: this.ball.x, ballY: this.ball.y, ballHeight: this.ball.height });
      this.events.push(Object.freeze({ type: "THIRD_TOUCH_MISSED", ...this.thirdTouchResult }));
      this.ball.inFlight = false;
      this.thirdPass = Object.freeze({ ...this.thirdPass, status: "MISSED" });
      this.finishThirdPass("THIRD_TOUCH_MISSED");
      this.setTouchEligibility({ phase: TOUCH_PHASES.ATTACK, eligiblePlayerIds: [] });
      this.clearAttackAssignment(reason);
    }
  }

  clearAttackAssignment(reason) {
    const assignment = this.attackAssignment;
    if (!assignment) return;
    const player = this.players.find((candidate) => candidate.id === assignment.assignedPlayerId);
    if (assignment.movementPhase !== ATTACK_MOVEMENT_PHASES.IDLE && player) {
      player.targetX = player.x; player.targetY = player.y; player.isMoving = false;
      if (player.action !== "RECEIVE" && this.attackMotion?.startedAt == null) player.action = "IDLE";
    }
    this.events.push(Object.freeze({ type: "ATTACK_ASSIGNMENT_CLEARED", reason, time: this.simulationTime }));
    this.attackAssignment = null;
  }

  stepFixed() {
    if (this.status === "ATTACK_LANDING") {
      this.simulationTime += this.fixedStep;
      const player = this.players.find((candidate) => candidate.id === this.attackMotion.playerId);
      this.updateAttackPose(player, this.simulationTime);
      if (this.attackMotion.jumpPhase === "LANDED") {
        this.status = this.pendingThirdTouchStatus;
        this.pendingThirdTouchStatus = null;
      }
      return;
    }
    const assignment = this.attackAssignment;
    if (!assignment) { super.stepFixed(); return; }
    const player = this.players.find((candidate) => candidate.id === assignment.assignedPlayerId);
    if (this.status === "THIRD_PASS_IN_FLIGHT") { this.stepThirdPass(player); return; }
    const eventOffset = this.events.length;
    super.stepFixed();
    let transitioned = false;
    for (const event of this.events.slice(eventOffset)) {
      if (event.type === "RECEIVE_RESOLVED" && event.result === "ERROR") {
        this.clearAttackAssignment("RECEIVE_ERROR"); return;
      }
      if (event.type === "RECEIVE_QUALITY_RESOLVED") {
        if (!["PERFECT", "NORMAL"].includes(event.quality)) { this.clearAttackAssignment("BAD_PASS"); return; }
        if (event.playerId === player.id) {
          assignment.movementBlockedUntil = event.time
            + getReceiveAnimationProfile(this.parameters.flightDuration).animationDurationMs / 1000;
          player.isMoving = false;
        }
        setAttackMovementPhase(assignment, player, ATTACK_MOVEMENT_PHASES.MOVING_TO_READY);
        this.recordAttackPhase(player);
        transitioned = true;
      }
      if (event.type === "SECOND_TOUCH" && event.success
        && assignment.movementPhase === ATTACK_MOVEMENT_PHASES.MOVING_TO_READY) {
        setAttackMovementPhase(assignment, player, ATTACK_MOVEMENT_PHASES.MOVING_TO_ATTACK);
        this.recordAttackPhase(player, event.time);
        this.startThirdPass(event);
        transitioned = true;
      }
    }
    if (["MISSED", "RECEIVE_ERROR_COMPLETE", "SECOND_TOUCH_MISSED", "PASS_COMPLETE"].includes(this.status)) {
      this.clearAttackAssignment(this.status); return;
    }
    if (this.status === "PASS_IN_FLIGHT" && !transitioned) {
      stepAttackAssignment(assignment, player, this.simulationTime, this.fixedStep);
    }
  }

  recordAttackPhase(player, time = this.simulationTime) {
    this.events.push(Object.freeze({ type: "ATTACK_MOVEMENT_PHASE_CHANGED", time,
      playerId: player.id, movementPhase: this.attackAssignment.movementPhase,
      playerX: player.x, playerY: player.y, targetX: player.targetX, targetY: player.targetY }));
  }

  getSnapshot() {
    const snapshot = super.getSnapshot();
    const assignment = this.attackAssignment;
    const player = assignment && this.players.find((candidate) => candidate.id === assignment.assignedPlayerId);
    const motion = this.attackMotion;
    const players = motion ? Object.freeze(snapshot.players.map((entry) => entry.id === motion.playerId
      ? Object.freeze({ ...entry, jumpHeight: motion.jumpHeight, rotationAngle: motion.rotationAngle,
        jumpPhase: motion.jumpPhase, jumpElapsed: motion.jumpElapsed, jumpDuration: motion.jumpDuration }) : entry)) : snapshot.players;
    return Object.freeze({ ...snapshot, players, attackMotion: motion ? Object.freeze({ ...motion }) : null,
    thirdTouchStatus: this.thirdTouchResult ? this.thirdTouchResult.success ? "THIRD_TOUCH_COMPLETE" : "THIRD_TOUCH_MISSED" : null,
    thirdPass: this.thirdPass ? Object.freeze({ ...this.thirdPass,
      remainingTime: this.thirdPass.status === "IN_PLAY" ? Math.max(0, this.thirdPass.duration - this.ball.elapsed) : 0 }) : null,
    thirdTouchResult: this.thirdTouchResult, attackAssignment: assignment ? Object.freeze({ ...assignment,
      targetPosition: Object.freeze({ x: player.targetX, y: player.targetY }),
      targetDistance: Math.hypot(player.targetX - player.x, player.targetY - player.y),
      readyDistance: Math.hypot(assignment.readyPosition.x - player.x, assignment.readyPosition.y - player.y),
      attackDistance: Math.hypot(assignment.attackPosition.x - player.x, assignment.attackPosition.y - player.y),
    }) : null });
  }
}
