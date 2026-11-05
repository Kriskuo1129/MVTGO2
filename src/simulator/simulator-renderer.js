import { SIMULATOR_WORLD } from "./simulator.js";

export class SimulatorRenderer {
  constructor({ root, onTargetSelected }) {
    if (!root || typeof onTargetSelected !== "function") {
      throw new TypeError("Simulator Renderer 需要根節點與落點回呼。");
    }
    this.root = root;
    this.onTargetSelected = onTargetSelected;
    this.viewport = root.querySelector("#simulator-viewport");
    this.player = root.querySelector("#simulator-player");
    this.avatar = root.querySelector("#simulator-player-avatar");
    this.ball = root.querySelector("#simulator-ball");
    this.target = root.querySelector("#simulator-target");
    this.status = root.querySelector("#simulator-status");
    this.telemetry = root.querySelector("#simulator-telemetry");
    this.frameId = null;
    this.lastTimestamp = null;
    this.simulator = null;
    this.lastSnapshot = null;
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
    const x = (event.clientX - rect.left) / rect.width * SIMULATOR_WORLD.width;
    const y = (event.clientY - rect.top) / rect.height * SIMULATOR_WORLD.height;
    this.onTargetSelected({
      x: Math.min(Math.max(x, 0), SIMULATOR_WORLD.width),
      y: Math.min(Math.max(y, 0), SIMULATOR_WORLD.height),
    });
  }

  play(simulator) {
    this.stop();
    this.simulator = simulator;
    this.lastTimestamp = null;
    this.render(simulator.getSnapshot());
    this.frameId = requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  tick(timestamp) {
    if (!this.simulator) return;
    if (this.lastTimestamp === null) this.lastTimestamp = timestamp;
    const deltaSeconds = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    const snapshot = this.simulator.updateFrame(deltaSeconds);
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
    const courtScale = this.viewport.getBoundingClientRect().width / snapshot.world.width;
    const avatarDisplaySize = snapshot.parameters.avatarSize * courtScale;
    const ballDisplaySize = snapshot.presentation.ballDisplaySize * courtScale;
    this.player.style.left = toLeft(snapshot.player.x);
    this.player.style.top = toTop(snapshot.player.y);
    this.avatar.style.width = `${avatarDisplaySize}px`;
    this.avatar.style.height = `${avatarDisplaySize}px`;
    const isReceiving = snapshot.player.action === "RECEIVE";
    this.avatar.classList.toggle("is-receiving", isReceiving);
    this.avatar.classList.toggle(
      "receive-from-left",
      isReceiving && snapshot.player.receiveDirection === "FROM_LEFT",
    );
    this.avatar.classList.toggle(
      "receive-from-right",
      isReceiving && snapshot.player.receiveDirection === "FROM_RIGHT",
    );
    this.ball.style.width = `${ballDisplaySize}px`;
    this.ball.style.height = `${ballDisplaySize}px`;
    const ballDisplayPoint = snapshot.status === "CONTACTED" && snapshot.player.contactPoint
      ? snapshot.player.contactPoint
      : { x: snapshot.ball.x, y: snapshot.ball.y - snapshot.ball.height };
    this.ball.style.left = toLeft(ballDisplayPoint.x);
    this.ball.style.top = toTop(ballDisplayPoint.y);
    this.ball.hidden = snapshot.status === "READY";
    this.target.style.left = toLeft(snapshot.player.targetX);
    this.target.style.top = toTop(snapshot.player.targetY);
    this.target.hidden = snapshot.status === "READY";

    const statusText = {
      READY: "點擊球場指定發球落點。",
      RUNNING: "模擬進行中：球員正在追蹤預測接觸位置。",
      CONTACTED: "接球成功：球員與排球在有效時空範圍內接觸。",
      MISSED: "接球失敗：排球落地前未進入有效接球範圍。",
    }[snapshot.status];
    this.status.textContent = statusText;
    this.status.dataset.state = snapshot.status;
    this.telemetry.textContent = [
      `時間 ${snapshot.simulationTime.toFixed(2)} s`,
      `球 (${snapshot.ball.x.toFixed(0)}, ${snapshot.ball.y.toFixed(0)}, 高 ${snapshot.ball.height.toFixed(0)})`,
      `球員 (${snapshot.player.x.toFixed(0)}, ${snapshot.player.y.toFixed(0)})`,
    ].join("｜");
  }

  stop() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.lastTimestamp = null;
  }

  destroy() {
    this.stop();
    this.resizeObserver?.disconnect();
    this.viewport.removeEventListener("click", this.handleClick);
  }
}
