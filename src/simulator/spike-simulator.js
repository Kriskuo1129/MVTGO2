import { LeftLongReceiveSimulator } from "./left-long-simulator.js";
import { TEAM_SIMULATOR_BALL_DISPLAY_SIZE } from "./team-simulator.js";
import { ATTACK_MOTION_V1 } from "./attack-motion.js";
import { launchSimulatorBall, stepSimulatorBall, sampleSimulatorBall } from "./ball.js";
import { SPIKE_COURT_V1, validateSpikeTarget, validateSpikeParameters } from "./spike-court.js";
import { detectSpikeTermination, isSpikeExperimentRunning } from "./spike-flight.js";

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
  }

  guardSpikeConfiguration() {
    if (["SPIKE_IN_FLIGHT", "SPIKE_LANDING"].includes(this.status)) throw new Error("扣球 Rally 進行中，目標與參數已鎖定，請先重設。");
  }
  configure(parameters) { this.guardSpikeConfiguration(); super.configure(parameters); }
  configureThirdPass(parameters) { this.guardSpikeConfiguration(); super.configureThirdPass(parameters); }
  configureAttackMotion(parameters) { this.guardSpikeConfiguration(); super.configureAttackMotion(parameters); }
  configureAttackAssignment(configuration) { this.guardSpikeConfiguration(); super.configureAttackAssignment(configuration); }

  configureSpikeExperiment(configuration) {
    if (isSpikeExperimentRunning(this.status)) throw new Error("發球開始後不可更改本 Rally 的扣球落點。");
    this.spikeConfiguration = configuration ? Object.freeze({
      target: validateSpikeTarget(configuration.target), parameters: validateSpikeParameters(configuration.parameters),
    }) : null;
  }

  launch(target) {
    const configuration = this.spikeConfiguration;
    if (configuration) {
      if (!this.attackConfiguration) throw new Error("D2 必須啟用 LEFT_LONG 並指定合法 READY／ATTACK。");
      if ((this.attackMotionParameters ?? D2_ATTACK_MOTION_V1).direction !== "LEFT") throw new Error("D2 本次僅支援向左扣球；向右鏡像請關閉 D2 測試。");
      if (!this.attackMotionParameters) this.attackMotionParameters = D2_ATTACK_MOTION_V1;
    }
    super.launch(target);
    if (configuration) this.lockedSpikeTarget = validateSpikeTarget(configuration.target);
  }

  finishThirdPass(resultStatus) {
    if (resultStatus !== "THIRD_TOUCH_COMPLETE" || !this.spikeConfiguration) {
      super.finishThirdPass(resultStatus); return;
    }
    const parameters = this.spikeConfiguration.parameters;
    const start = Object.freeze({ x: this.thirdTouchResult.ballX, y: this.thirdTouchResult.ballY, height: this.thirdTouchResult.ballHeight });
    const radius = TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2;
    const court = Object.freeze({ ...SPIKE_COURT_V1, netHeight: parameters.netHeight });
    this.spikeFlight = { status: "IN_PLAY", start, target: this.lockedSpikeTarget,
      parameters, radius, court, startedAt: this.thirdTouchResult.time, netCheck: Object.freeze({ result: "PENDING", planeCrossingHeight: null }) };
    launchSimulatorBall(this.ball, { start, target: { ...this.lockedSpikeTarget, height: radius },
      duration: parameters.flightDuration, arcHeight: parameters.arcHeight });
    this.status = "SPIKE_IN_FLIGHT";
    this.events.push(Object.freeze({ type: "SPIKE_STARTED", time: this.thirdTouchResult.time,
      playerId: this.thirdTouchResult.playerId, start, target: this.lockedSpikeTarget, duration: parameters.flightDuration, arcHeight: parameters.arcHeight }));
  }

  stepSpike() {
    const from = this.ball.progress;
    this.simulationTime += this.fixedStep;
    stepSimulatorBall(this.ball, this.fixedStep);
    const player = this.players.find((candidate) => candidate.id === this.attackMotion.playerId);
    this.updateAttackPose(player, this.simulationTime);
    const flight = this.spikeFlight, { radius, court } = flight;
    const terminal = detectSpikeTermination(this.ball, from, this.ball.progress, radius, court);
    const planeProgress = (court.netX - this.ball.start.x) / (this.ball.target.x - this.ball.start.x);
    const predictedHeight = planeProgress >= 0 && planeProgress <= 1 ? sampleSimulatorBall(this.ball, planeProgress * this.ball.duration).height : null;
    const checkedProgress = terminal?.progress ?? this.ball.progress;
    const crossed = planeProgress >= 0 && planeProgress <= 1 && checkedProgress >= planeProgress;
    const cleared = crossed && this.ball.start.x + (this.ball.target.x - this.ball.start.x) * checkedProgress < court.netX - radius - court.netTolerance;
    flight.netCheck = Object.freeze({ result: terminal?.type === "SPIKE_NET" ? "NET_CONTACT" : cleared ? "CLEARED" : "PENDING",
      predictedPlaneCrossingHeight: predictedHeight, planeCrossingHeight: crossed ? predictedHeight : null,
      bottomAtPlane: crossed ? predictedHeight - radius : null,
      contactHeight: terminal?.type === "SPIKE_NET" ? terminal.position.height : null });
    if (!terminal) return;
    const p = terminal.position;
    Object.assign(this.ball, { x: p.x, y: p.y, height: terminal.type === "SPIKE_NET" ? p.height : radius,
      progress: terminal.progress, elapsed: terminal.progress * this.ball.duration,
      inFlight: false, landed: terminal.type !== "SPIKE_NET" });
    this.spikeResult = Object.freeze({ type: terminal.type, reason: terminal.type,
      time: flight.startedAt + this.ball.elapsed, ballX: this.ball.x, ballY: this.ball.y, ballHeight: this.ball.height,
      groundHeight: terminal.type === "SPIKE_NET" ? null : 0, radius, netCheck: flight.netCheck });
    flight.status = terminal.type;
    this.events.push(this.spikeResult);
    if (this.attackMotion.jumpPhase === "LANDED") this.status = terminal.type;
    else { this.pendingSpikeStatus = terminal.type; this.status = "SPIKE_LANDING"; }
  }

  stepFixed() {
    if (this.status === "SPIKE_IN_FLIGHT") { this.stepSpike(); return; }
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
        elapsed: this.ball.elapsed, remainingTime: this.spikeFlight.status === "IN_PLAY" ? Math.max(0, this.ball.duration - this.ball.elapsed) : 0 }) : null,
      spikeResult: this.spikeResult });
  }
}
