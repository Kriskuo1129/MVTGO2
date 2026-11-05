import { SIMULATOR_WORLD } from "./simulator.js";
import {
  CAMERA_MODES,
  SimulatorCameraController,
} from "./camera-controller.js";

export class TeamSimulatorRenderer {
  constructor({ root, onTargetSelected }) {
    if (!root || typeof onTargetSelected !== "function") {
      throw new TypeError("六人 Simulator Renderer 需要根節點與落點回呼。");
    }
    this.root = root;
    this.onTargetSelected = onTargetSelected;
    this.viewport = root.querySelector("#team-simulator-viewport");
    this.world = root.querySelector("#team-simulator-world");
    this.ball = root.querySelector("#team-simulator-ball");
    this.target = root.querySelector("#team-simulator-target");
    this.status = root.querySelector("#team-simulator-status");
    this.telemetry = root.querySelector("#team-simulator-telemetry");
    this.playerElements = new Map();
    this.frameId = null;
    this.layoutFrameId = null;
    this.lastTimestamp = null;
    this.simulator = null;
    this.lastSnapshot = null;
    this.camera = new SimulatorCameraController({ world: SIMULATOR_WORLD });
    this.handleClick = this.handleClick.bind(this);
    this.viewport.addEventListener("click", this.handleClick);
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
        if (this.lastSnapshot) this.render(this.lastSnapshot);
      })
      : null;
    this.resizeObserver?.observe(this.viewport);
  }

  handleClick(event) {
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.onTargetSelected(this.camera.screenToWorld({
      screenX: event.clientX - rect.left,
      screenY: event.clientY - rect.top,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    }));
  }

  ensurePlayerElement(player) {
    if (this.playerElements.has(player.id)) return this.playerElements.get(player.id);
    const wrapper = document.createElement("span");
    wrapper.className = "simulator-player team-simulator-player";
    wrapper.dataset.playerId = player.id;
    const avatar = document.createElement("span");
    avatar.className = "simulator-player__avatar";
    avatar.textContent = player.position;
    wrapper.append(avatar);
    this.world.append(wrapper);
    const elements = Object.freeze({ wrapper, avatar });
    this.playerElements.set(player.id, elements);
    return elements;
  }

  play(simulator) {
    this.stop();
    this.simulator = simulator;
    this.lastTimestamp = null;
    const snapshot = simulator.getSnapshot();
    if (this.camera.mode === CAMERA_MODES.FULL_COURT
      || this.lastSnapshot?.status === "READY") this.resetCamera(snapshot);
    this.beginCameraFollow(snapshot);
    this.render(snapshot);
    this.frameId = requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  tick(timestamp) {
    if (!this.simulator) return;
    if (this.lastTimestamp === null) this.lastTimestamp = timestamp;
    const deltaSeconds = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    const snapshot = this.simulator.updateFrame(deltaSeconds);
    const viewportRect = this.viewport.getBoundingClientRect();
    if (viewportRect.width > 0 && viewportRect.height > 0) {
      this.camera.update({
        ballX: snapshot.ball.x,
        remainingFlightTime: snapshot.parameters.flightDuration
          * Math.max(0, 1 - snapshot.ball.progress),
        deltaSeconds,
        viewportWidth: viewportRect.width,
        viewportHeight: viewportRect.height,
      });
    }
    this.render(snapshot);
    if (snapshot.status === "RUNNING") {
      this.frameId = requestAnimationFrame((nextTimestamp) => this.tick(nextTimestamp));
    } else {
      this.frameId = null;
    }
  }

  render(snapshot) {
    this.lastSnapshot = snapshot;
    const toLeft = (x) => `${x / snapshot.world.width * 100}%`;
    const toTop = (y) => `${y / snapshot.world.height * 100}%`;
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const cameraView = this.camera.getViewportState({
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    });
    this.world.style.left = `${cameraView.offsetX}px`;
    this.world.style.top = `${cameraView.offsetY}px`;
    this.world.style.width = `${cameraView.renderedWidth}px`;
    this.world.style.height = `${cameraView.renderedHeight}px`;
    const avatarDisplaySize = snapshot.parameters.avatarSize * cameraView.displayScale;
    const ballDisplaySize = snapshot.presentation.ballDisplaySize * cameraView.displayScale;

    snapshot.players.forEach((player) => {
      const { wrapper, avatar } = this.ensurePlayerElement(player);
      wrapper.style.left = toLeft(player.x);
      wrapper.style.top = toTop(player.y);
      wrapper.classList.toggle("is-primary-receiver", player.responsibility === "PRIMARY");
      wrapper.classList.toggle("is-touch-eligible", player.touchEligible);
      wrapper.dataset.task = player.task;
      wrapper.title = `${player.position}｜${player.rotationPosition}｜${player.task}`;
      avatar.style.width = `${avatarDisplaySize}px`;
      avatar.style.height = `${avatarDisplaySize}px`;
      const isReceiving = player.action === "RECEIVE";
      avatar.classList.toggle("is-receiving", isReceiving);
      avatar.classList.toggle("receive-from-left", isReceiving && player.receiveDirection === "FROM_LEFT");
      avatar.classList.toggle("receive-from-right", isReceiving && player.receiveDirection === "FROM_RIGHT");
    });

    const primary = snapshot.players.find((player) => player.id === snapshot.primaryReceiverId);
    const ballDisplayPoint = snapshot.status === "CONTACTED" && primary?.contactPoint
      ? primary.contactPoint
      : { x: snapshot.ball.x, y: snapshot.ball.y - snapshot.ball.height };
    this.ball.style.width = `${ballDisplaySize}px`;
    this.ball.style.height = `${ballDisplaySize}px`;
    this.ball.style.left = toLeft(ballDisplayPoint.x);
    this.ball.style.top = toTop(ballDisplayPoint.y);
    this.ball.hidden = snapshot.status === "READY";
    this.target.style.left = toLeft(snapshot.ball.targetX);
    this.target.style.top = toTop(snapshot.ball.targetY);
    this.target.hidden = snapshot.status === "READY";

    const resultEvent = snapshot.events.at(-1);
    const statusText = {
      READY: "點擊球場指定發球落點。",
      RUNNING: `主要接球員：${snapshot.primaryReceiverId ?? "分配中"}`,
      CONTACTED: `${resultEvent?.playerId ?? snapshot.primaryReceiverId} 完成接球。`,
      MISSED: "無人於落地前完成接球。",
    }[snapshot.status];
    this.status.textContent = statusText;
    this.status.dataset.state = snapshot.status;
    this.telemetry.textContent = [
      `球路 ${snapshot.ball.trajectoryType}`,
      `時間 ${snapshot.simulationTime.toFixed(2)} s`,
      `球 (${snapshot.ball.x.toFixed(0)}, ${snapshot.ball.y.toFixed(0)}, 高 ${snapshot.ball.height.toFixed(0)})`,
      `責任 ${snapshot.primaryReceiverId ?? "尚未分配"}`,
      `鏡頭 ${cameraView.mode}`,
    ].join("｜");
    return true;
  }

  renderWhenReady(snapshot = this.lastSnapshot) {
    if (!snapshot || this.render(snapshot) || this.root.hidden) return;
    if (this.layoutFrameId !== null) cancelAnimationFrame(this.layoutFrameId);
    this.layoutFrameId = requestAnimationFrame(() => {
      this.layoutFrameId = null;
      this.renderWhenReady(snapshot);
    });
  }

  setCameraMode(mode) {
    this.camera.setMode(mode);
    if (this.lastSnapshot) {
      if (mode === CAMERA_MODES.FULL_COURT) {
        this.resetCamera(this.lastSnapshot);
      } else {
        if (this.lastSnapshot.status === "READY") this.resetCamera(this.lastSnapshot);
        this.beginCameraFollow(this.lastSnapshot);
      }
      this.render(this.lastSnapshot);
    }
  }

  beginCameraFollow(snapshot = this.lastSnapshot) {
    if (!snapshot || snapshot.status !== "RUNNING"
      || this.camera.mode !== CAMERA_MODES.FOLLOW_BALL) return;
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const remainingFlightTime = snapshot.parameters.flightDuration
      * Math.max(0, 1 - snapshot.ball.progress);
    this.camera.beginFollowRoute({
      startX: snapshot.ball.x,
      targetX: snapshot.ball.targetX,
      flightDuration: remainingFlightTime,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    });
  }

  resetCamera(snapshot = this.lastSnapshot) {
    if (!snapshot) return;
    const focusX = this.camera.mode === CAMERA_MODES.FOLLOW_BALL
      ? snapshot.ball.x
      : snapshot.world.width / 2;
    this.camera.reset({ focusX });
  }

  stop() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    if (this.layoutFrameId !== null) cancelAnimationFrame(this.layoutFrameId);
    this.frameId = null;
    this.layoutFrameId = null;
    this.lastTimestamp = null;
  }

  destroy() {
    this.stop();
    this.resizeObserver?.disconnect();
    this.viewport.removeEventListener("click", this.handleClick);
  }
}
