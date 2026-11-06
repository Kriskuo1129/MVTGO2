import { SIMULATOR_WORLD } from "./simulator.js";
import {
  CAMERA_MODES,
  SimulatorCameraController,
} from "./camera-controller.js";
import {
  getReceiveAnimationProfile,
  getReceivePushDirection,
  RECEIVE_ANIMATION_CLASS_NAMES,
} from "./receive-animation.js";

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
    this.debug = root.querySelector("#team-simulator-debug");
    this.playerElements = new Map();
    this.playerAppearances = new Map();
    this.frameId = null;
    this.layoutFrameId = null;
    this.lastTimestamp = null;
    this.simulator = null;
    this.lastSnapshot = null;
    this.interactionEnabled = true;
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
    if (!this.interactionEnabled) return;
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.onTargetSelected(this.camera.screenToWorld({
      screenX: event.clientX - rect.left,
      screenY: event.clientY - rect.top,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    }));
  }

  setInteractionEnabled(enabled) {
    this.interactionEnabled = Boolean(enabled);
    this.viewport.setAttribute("aria-disabled", String(!this.interactionEnabled));
  }

  clientToWorld(clientX, clientY) {
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new RangeError("球場尚未取得有效顯示尺寸。");
    }
    return this.camera.screenToWorld({
      screenX: clientX - rect.left,
      screenY: clientY - rect.top,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    });
  }

  ensurePlayerElement(player) {
    if (this.playerElements.has(player.id)) return this.playerElements.get(player.id);
    const wrapper = document.createElement("span");
    wrapper.className = "simulator-player team-simulator-player";
    wrapper.dataset.playerId = player.id;
    const avatar = document.createElement("span");
    avatar.className = "simulator-player__avatar";
    const motion = document.createElement("span");
    motion.className = "simulator-player__motion";
    const fallback = document.createElement("span");
    fallback.className = "simulator-player__fallback";
    fallback.textContent = player.position;
    const image = document.createElement("img");
    image.className = "simulator-player__photo";
    image.alt = "";
    image.hidden = true;
    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });
    avatar.append(fallback, image);
    motion.append(avatar);
    wrapper.append(motion);
    this.world.append(wrapper);
    const elements = Object.freeze({ wrapper, motion, avatar, fallback, image });
    this.playerElements.set(player.id, elements);
    this.applyPlayerAppearance(player.id, elements);
    return elements;
  }

  setPlayerAppearance(playerId, appearance) {
    this.playerAppearances.set(playerId, { ...appearance });
    const elements = this.playerElements.get(playerId);
    if (elements) this.applyPlayerAppearance(playerId, elements);
  }

  applyPlayerAppearance(playerId, elements) {
    const appearance = this.playerAppearances.get(playerId);
    if (!appearance) return;
    elements.avatar.style.backgroundColor = appearance.skinColor;
    const photoUrl = appearance.photoUrl || "";
    if (photoUrl) {
      if (elements.image.getAttribute("src") !== photoUrl) elements.image.src = photoUrl;
    } else {
      elements.image.removeAttribute("src");
    }
    elements.image.hidden = !appearance.photoUrl;
    elements.fallback.hidden = Boolean(appearance.photoUrl);
    elements.image.style.setProperty("--photo-zoom", String(appearance.zoom));
    elements.image.style.setProperty("--photo-x", `${appearance.offsetX}%`);
    elements.image.style.setProperty("--photo-y", `${appearance.offsetY}%`);
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
    if (snapshot.status === "PASS_IN_FLIGHT" && this.lastSnapshot?.status !== "PASS_IN_FLIGHT") {
      this.beginCameraFollow(snapshot);
    }
    const viewportRect = this.viewport.getBoundingClientRect();
    if (viewportRect.width > 0 && viewportRect.height > 0) {
      this.camera.update({
        ballX: snapshot.ball.x,
        remainingFlightTime: snapshot.ball.duration * Math.max(0, 1 - snapshot.ball.progress),
        deltaSeconds,
        viewportWidth: viewportRect.width,
        viewportHeight: viewportRect.height,
      });
    }
    this.render(snapshot);
    if (snapshot.status === "RUNNING" || snapshot.status === "PASS_IN_FLIGHT") {
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
      const { wrapper, motion, avatar } = this.ensurePlayerElement(player);
      wrapper.style.left = toLeft(player.x);
      wrapper.style.top = toTop(player.y);
      wrapper.classList.toggle("is-primary-receiver", player.responsibility === "PRIMARY");
      wrapper.classList.toggle("is-touch-eligible", player.touchEligible);
      wrapper.dataset.task = player.task;
      wrapper.title = `${player.position}｜${player.rotationPosition}｜${player.task}`;
      avatar.style.width = `${avatarDisplaySize}px`;
      avatar.style.height = `${avatarDisplaySize}px`;
      const isReceiving = player.action === "RECEIVE";
      const animationProfile = getReceiveAnimationProfile(snapshot.parameters.flightDuration);
      wrapper.style.setProperty("--receive-minimum-scale", String(animationProfile.minimumScale));
      wrapper.style.setProperty("--receive-animation-duration", `${animationProfile.animationDurationMs}ms`);
      avatar.classList.toggle("is-receiving", isReceiving);
      avatar.classList.remove(...RECEIVE_ANIMATION_CLASS_NAMES);
      if (isReceiving) {
        avatar.classList.add(animationProfile.className);
      }
      avatar.classList.toggle("receive-from-left", isReceiving && player.receiveDirection === "FROM_LEFT");
      avatar.classList.toggle("receive-from-right", isReceiving && player.receiveDirection === "FROM_RIGHT");
      const isUltraFastReceive = isReceiving && animationProfile.level === "ULTRA_FAST";
      const pushDirection = isReceiving
        ? getReceivePushDirection(player.receiveDirection)
        : 1;
      const availableWorldDistance = pushDirection > 0
        ? snapshot.world.width - player.x
        : player.x;
      const rollWorldDistance = Math.min(snapshot.parameters.avatarSize, availableWorldDistance);
      motion.style.setProperty("--receive-roll-distance", `${pushDirection * rollWorldDistance * cameraView.displayScale}px`);
      motion.style.setProperty("--receive-roll-rotation", `${pushDirection * 360}deg`);
      motion.classList.toggle("is-ultra-fast-receiving", isUltraFastReceive);
    });

    const primary = snapshot.players.find((player) => player.id === snapshot.primaryReceiverId);
    const ballDisplayPoint = snapshot.status === "AWAITING_PASS_TARGET_CONFIG" && primary?.contactPoint
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

    const statusText = {
      READY: "點擊球場指定發球落點。",
      RUNNING: `主要接球員：${snapshot.primaryReceiverId ?? "分配中"}`,
      AWAITING_PASS_TARGET_CONFIG: "一傳品質已判定，等待黃色／藍色區域座標設定。",
      PASS_IN_FLIGHT: `第二段一傳飛行中：${snapshot.receiveQuality?.quality ?? "尚未判定"}`,
      SECOND_TOUCH_COMPLETE: `第二次觸球完成：${snapshot.secondTouchPlayerId}`,
      SECOND_TOUCH_MISSED: "第二段球已落地，第二次觸球未完成。",
      PASS_COMPLETE: snapshot.receiveQuality?.quality === "BAD"
        ? "BAD 一傳已飛出場外，未啟動第二次觸球。"
        : `第二段一傳完成：${snapshot.receiveQuality?.quality ?? "尚未判定"}`,
      MISSED: "無人於落地前完成接球。",
    }[snapshot.status];
    this.status.textContent = statusText;
    this.status.dataset.state = snapshot.status;
    this.telemetry.textContent = [
      `球路 ${snapshot.ball.trajectoryType}`,
      `弧度 ${snapshot.ball.arcHeight}`,
      `時間 ${snapshot.simulationTime.toFixed(2)} s`,
      `球 (${snapshot.ball.x.toFixed(0)}, ${snapshot.ball.y.toFixed(0)}, 高 ${snapshot.ball.height.toFixed(0)})`,
      `責任 ${snapshot.primaryReceiverId ?? "尚未分配"}`,
      `鏡頭 ${cameraView.mode}`,
    ].join("｜");
    const quality = snapshot.receiveQuality;
    const secondPass = snapshot.secondPass;
    const secondTouchPlayer = snapshot.players.find(
      (player) => player.id === snapshot.secondTouchPlayerId,
    );
    const secondTouchResult = snapshot.secondTouchResult;
    this.debug.textContent = quality
      ? [
        `第一觸球球員：${snapshot.firstTouchPlayerId ?? snapshot.primaryReceiverId ?? "尚未發生"}`,
        `第二觸球指定球員：${snapshot.secondTouchPlayerId ?? "尚未指定"}`,
        `提前跑位目標：(${snapshot.secondTouchPrepareTarget.x.toFixed(2)}, ${snapshot.secondTouchPrepareTarget.y.toFixed(2)})`,
        secondTouchPlayer
          ? `第二觸球員目前目標：(${secondTouchPlayer.targetX.toFixed(2)}, ${secondTouchPlayer.targetY.toFixed(2)})`
          : "第二觸球員目前目標：無",
        `來球品質：${quality.incomingQuality}／${quality.incomingSpeedLevel}（難度 ${quality.incomingDifficulty}）`,
        `接球能力：${quality.receiveAbility}`,
        `到位距離：${quality.positionDistance.toFixed(2)}／加分 ${quality.positionBonus.toFixed(2)}`,
        `準備時間：${quality.preparationTime.toFixed(3)} 秒／加分 ${quality.preparationBonus.toFixed(2)}`,
        `士氣：${quality.morale}／加成 ${quality.moraleBonus.toFixed(2)}`,
        `隨機發揮：${quality.randomPerformance.toFixed(2)}`,
        `最終分數：${quality.score.toFixed(2)}／品質 ${quality.quality}`,
        snapshot.firstTouchContact
          ? `RECEIVE 接觸：球心距離 ${snapshot.firstTouchContact.centerDistance.toFixed(2)}／有效頭像半徑 ${snapshot.firstTouchContact.effectiveAvatarRadius.toFixed(2)}／球半徑 ${snapshot.firstTouchContact.ballRadius.toFixed(2)}／重疊 ${snapshot.firstTouchContact.overlapDepth.toFixed(2)}`
          : "RECEIVE 接觸：尚未發生",
        secondPass
          ? `第二段目標：(${secondPass.target.x.toFixed(1)}, ${secondPass.target.y.toFixed(1)})／飛行 ${secondPass.duration.toFixed(2)} 秒`
          : "第二段目標：等待正式區域座標",
        secondPass
          ? `球路調整：+${secondPass.additionalDuration.toFixed(2)} 秒${secondPass.trajectoryAdjustmentLimitReached ? "／已達調整上限仍不可達" : ""}`
          : "球路調整：尚未建立",
        snapshot.secondTouchPrediction
          ? `第二觸球預估：${snapshot.secondTouchPrediction.reachable ? "可達" : "不可達"}，時間 ${snapshot.secondTouchPrediction.interceptTime.toFixed(3)} 秒`
          : quality.quality === "BAD"
            ? "第二觸球預估：BAD 不啟動"
            : "第二觸球預估：尚未建立第二段球路",
        secondTouchResult
          ? `第二觸球結果：${secondTouchResult.success ? "成功" : "失敗"}，時間 ${secondTouchResult.time.toFixed(3)} 秒，位置 (${secondTouchResult.ballX.toFixed(1)}, ${secondTouchResult.ballY.toFixed(1)}, 高 ${secondTouchResult.ballHeight.toFixed(1)})`
          : "第二觸球結果：進行中",
        secondTouchResult?.success
          ? `SET 接觸：球心距離 ${secondTouchResult.centerDistance.toFixed(2)}／有效頭像半徑 ${secondTouchResult.effectiveAvatarRadius.toFixed(2)}／球半徑 ${secondTouchResult.ballRadius.toFixed(2)}／重疊 ${secondTouchResult.overlapDepth.toFixed(2)}`
          : "SET 接觸：尚未成功",
      ].join("\n")
      : [
        `第一觸球球員：${snapshot.firstTouchPlayerId ?? "尚未發生"}`,
        `第二觸球指定球員：${snapshot.secondTouchPlayerId ?? "尚未指定"}`,
        `提前跑位目標：(${snapshot.secondTouchPrepareTarget.x.toFixed(2)}, ${snapshot.secondTouchPrepareTarget.y.toFixed(2)})`,
        secondTouchPlayer
          ? `第二觸球員目前目標：(${secondTouchPlayer.targetX.toFixed(2)}, ${secondTouchPlayer.targetY.toFixed(2)})`
          : "第二觸球員目前目標：無",
        "一傳品質：尚未判定",
        "第二觸球結果：尚未開始",
      ].join("\n");
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
    if (!snapshot || !["RUNNING", "PASS_IN_FLIGHT"].includes(snapshot.status)
      || this.camera.mode !== CAMERA_MODES.FOLLOW_BALL) return;
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const remainingFlightTime = snapshot.ball.duration * Math.max(0, 1 - snapshot.ball.progress);
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
