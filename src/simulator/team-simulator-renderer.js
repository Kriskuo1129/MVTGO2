import { SIMULATOR_WORLD } from "./simulator.js";
import { isSpikeExperimentRunning as isReceiveExperimentRunning } from "./spike-flight.js";
import {
  CAMERA_MODES,
  SimulatorCameraController,
} from "./camera-controller.js";
import {
  getReceiveAnimationProfile,
  getReceivePushDirection,
  RECEIVE_ANIMATION_CLASS_NAMES,
} from "./receive-animation.js";

export function resolvePlayerTouchAnimation(player, snapshot) {
  const isReceiving = player.action === "RECEIVE";
  const isSuccessfulSet = player.action === "SET"
    && snapshot.secondTouchResult?.success === true
    && snapshot.secondTouchResult.playerId === player.id;
  // SET 共用既有縮放／回彈動畫；至少採 FAST 設定，避免 ULTRA_FAST 翻滾。
  const profile = getReceiveAnimationProfile(isSuccessfulSet
    ? Math.max(1, snapshot.parameters.flightDuration)
    : snapshot.parameters.flightDuration);
  return Object.freeze({ isReceiving, isSuccessfulSet, profile,
    hasTouchAnimation: isReceiving || isSuccessfulSet });
}

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

  setAttackPreview(configuration) {
    this.attackPreview = configuration;
    if (this.lastSnapshot) this.renderWhenReady(this.lastSnapshot);
  }

  setSpikePreview(configuration) {
    this.spikePreview = configuration;
    if (this.lastSnapshot) this.renderWhenReady(this.lastSnapshot);
  }

  renderSpikeExperiment(snapshot) {
    const running = isReceiveExperimentRunning(snapshot.status);
    for (const id of ["spike-enabled", "spike-flight-mode", "spike-attack-ability", "spike-attack-consistency", "spike-seed-mode", "spike-random-seed", "spike-click-mode", "spike-target-x", "spike-target-y", "spike-target-clear", "spike-duration", "spike-arc", "spike-net-height", "spike-net-collision-enabled",
      "single-defense-enabled", "single-defense-x", "single-defense-y", "single-defense-speed"]) {
      this.root.querySelector(`#${id}`).disabled = running;
    }
    const naturalMode = this.root.querySelector("#spike-flight-mode").value === "NATURAL";
    if (!running && naturalMode) {
      for (const id of ["spike-click-mode", "spike-target-x", "spike-target-y", "spike-target-clear"]) {
        this.root.querySelector(`#${id}`).disabled = true;
      }
      this.root.querySelector("#spike-random-seed").disabled
        = this.root.querySelector("#spike-seed-mode").value === "AUTO";
    }
    const flight = snapshot.spikeFlight;
    const target = running
      ? snapshot.attackResolution?.targetPoint ?? snapshot.lockedSpikeTarget
      : this.spikePreview?.target;
    const court = running ? flight?.court ?? this.spikePreview?.court : this.spikePreview?.court;
    const overlay = this.root.querySelector("#spike-target-overlay");
    overlay.hidden = !court;
    const marker = this.root.querySelector("#spike-target-marker");
    marker.hidden = !target;
    if (target) {
      marker.style.left = `${target.x / snapshot.world.width * 100}%`;
      marker.style.top = `${target.y / snapshot.world.height * 100}%`;
    }
    if (court) {
      const outline = this.root.querySelector("#spike-court-outline"), b = court.bounds;
      outline.style.left = `${b.minX / snapshot.world.width * 100}%`;
      outline.style.top = `${b.minY / snapshot.world.height * 100}%`;
      outline.style.width = `${(court.netX - b.minX) / snapshot.world.width * 100}%`;
      outline.style.height = `${(b.maxY - b.minY) / snapshot.world.height * 100}%`;
    }
    const defenseMarker = this.root.querySelector("#single-defense-prediction");
    const prediction = snapshot.defense?.prediction;
    defenseMarker.hidden = !prediction;
    if (prediction) {
      defenseMarker.style.left = `${prediction.x / snapshot.world.width * 100}%`;
      defenseMarker.style.top = `${prediction.y / snapshot.world.height * 100}%`;
    }
    const lines = [`${running ? "目前指定" : "下次指定"}扣球落點：${target ? `(${target.x.toFixed(2)}, ${target.y.toFixed(2)}, 地面 0)` : "UNCONFIGURED"}｜${running && snapshot.lockedSpikeTarget ? "本 Rally 已鎖定" : "發球前可修改"}`];
    if (flight) {
      const net = flight.netCheck;
      const court = flight.court;
      lines.push(`第四段模式：${flight.mode ?? "LEGACY_TARGET"}`,
        `固定擊球點：${snapshot.attackGeometry?.clock ?? 11} 點鐘｜舉球品質：${snapshot.attackResolution?.setQuality ?? "—"}`,
        `本 Rally Seed：${snapshot.actualAttackSeed ?? "—"}`,
        `有效攻擊：${snapshot.attackResolution?.effectiveAttack ?? "—"}｜有效穩定：${snapshot.attackResolution?.effectiveConsistency ?? "—"}`,
        `最高解鎖球速：${snapshot.attackResolution?.highestUnlockedSpeed ?? "—"}｜抽選權重 ${snapshot.attackResolution ? Object.entries(snapshot.attackResolution.speedWeights).map(([level, weight]) => `${level} ${weight.toFixed(2)}%`).join("／") : "—"}`,
        `界內目標機率：${snapshot.attackResolution ? (snapshot.attackResolution.inProbability * 100).toFixed(2) + "%" : "—"}｜抽選目標：${snapshot.attackResolution?.targetInBounds ? "IN" : snapshot.attackResolution ? "OUT" : "—"}`,
        `targetPoint：${snapshot.attackResolution ? `(${snapshot.attackResolution.targetPoint.x.toFixed(2)}, ${snapshot.attackResolution.targetPoint.y.toFixed(2)})` : "—"}`,
        `actualLandingPoint：${snapshot.spikeResult?.actualLandingPoint ? `(${snapshot.spikeResult.actualLandingPoint.x.toFixed(2)}, ${snapshot.spikeResult.actualLandingPoint.y.toFixed(2)})` : "—"}｜targetInBounds ${snapshot.attackResolution?.targetInBounds ?? "—"}｜actualInBounds ${snapshot.spikeResult?.actualInBounds ?? "—"}`,
        `球速等級：${snapshot.naturalSpike?.speedLevel ?? "—"}｜實際出球速度 ${snapshot.naturalSpike?.actualSpeed?.toFixed(2) ?? "—"}`,
        `速度向量：X ${snapshot.naturalSpike?.velocity.x.toFixed(2) ?? "—"}、Y ${snapshot.naturalSpike?.velocity.y.toFixed(2) ?? "—"}、垂直 ${snapshot.naturalSpike?.velocity.height.toFixed(2) ?? "—"}`,
        `出球垂直角：${snapshot.naturalSpike ? (Math.atan2(snapshot.naturalSpike.velocity.height,
          Math.hypot(snapshot.naturalSpike.velocity.x, snapshot.naturalSpike.velocity.y)) * 180 / Math.PI).toFixed(2) + "°" : "—"}`,
        `預測落點／舊版鎖定點：(${flight.target.x.toFixed(2)}, ${flight.target.y.toFixed(2)})`);
      lines.push(`真實 THIRD_TOUCH 起點：(${flight.start.x.toFixed(2)}, ${flight.start.y.toFixed(2)}, 高 ${flight.start.height.toFixed(2)})`,
        `第四段：${flight.status}｜${flight.parameters.flightDuration} 秒｜進度 ${(flight.progress * 100).toFixed(1)}%｜剩餘 ${flight.remainingTime.toFixed(3)} 秒`,
        `掛網判定：${net.enabled ? "啟用" : "關閉（僅觀察幾何）"}｜幾何相交：${net.geometryIntersectionDetected ? "YES" : "NO"}`,
        `球網 V1：X ${court.netX}、高 ${court.netHeight}｜${net.result}`,
        `平面預計穿越高度：${net.predictedPlaneCrossingHeight?.toFixed(2) ?? "—"}｜實際穿越高度：${net.planeCrossingHeight?.toFixed(2) ?? "尚未穿越"}`,
        `球網接觸高度：${net.contactHeight?.toFixed(2) ?? "—"}｜終止原因：${snapshot.spikeResult?.reason ?? "尚無"}`,
        `球心高度：${snapshot.ball.height.toFixed(2)}｜球半徑：${flight.radius}；地面落點 0 對應球心 ${flight.radius}`,
        `攻擊手：${snapshot.attackMotion?.jumpPhase ?? "—"}｜${snapshot.attackMotion?.rotationAngle.toFixed(2) ?? "—"}°`);
      if (snapshot.naturalSpike) lines.push(
        `首次落地：${snapshot.naturalSpike.firstGroundContact ? `(${snapshot.naturalSpike.firstGroundContact.x.toFixed(2)}, ${snapshot.naturalSpike.firstGroundContact.y.toFixed(2)})／${snapshot.naturalSpike.firstGroundContact.type}` : "尚未"}`,
        `反彈次數：${snapshot.naturalSpike.bounceCount}｜目前水平速度 ${Math.hypot(snapshot.naturalSpike.velocity.x, snapshot.naturalSpike.velocity.y).toFixed(2)}｜BALL_REST ${snapshot.naturalSpike.rest ? "YES" : "NO"}`);
    } else lines.push("等待真實 THIRD_TOUCH；D2 未啟用時保留 D1 流程。");
    const defense = snapshot.defense;
    lines.push(`單人防守：${defense?.enabled ? "啟用" : "關閉"}`);
    if (defense?.enabled) {
      const player = defense.player, config = defense.configuration, result = defense.result;
      lines.push(`防守員初始 (${config.initialX.toFixed(2)}, ${config.initialY.toFixed(2)})｜速度 ${config.moveSpeed}`,
        player ? `目前 (${player.x.toFixed(2)}, ${player.y.toFixed(2)})｜來球 ${player.receiveDirection ?? "等待扣球"}` : "目前：等待真實 THIRD_TOUCH",
        prediction ? `預測接觸 (${prediction.x.toFixed(2)}, ${prediction.y.toFixed(2)})｜剩餘 ${(prediction.interceptTime - snapshot.ball.elapsed).toFixed(3)} 秒｜距離 ${prediction.travelDistance.toFixed(2)}｜${prediction.reachable ? "可達" : "最佳努力"}` : "預測接觸：尚未啟動",
        result?.success ? `DEFENSE_TOUCH：${result.time.toFixed(3)} 秒｜球心距離 ${result.centerDistance.toFixed(2)}｜有效半徑 ${result.effectiveAvatarRadius.toFixed(2)}｜球半徑 ${result.ballRadius.toFixed(2)}｜重疊 ${result.overlapDepth.toFixed(2)}`
          : result ? `防守失敗：${result.reason}` : "防守結果：等待扣球");
    }
    this.root.querySelector("#spike-debug").textContent = lines.join("\n");
  }

  renderAttackExperiment(snapshot) {
    const running = isReceiveExperimentRunning(snapshot.status);
    for (const id of ["left-long-enabled", "left-long-rotation", "left-long-player", "third-pass-duration", "third-pass-arc", "third-pass-contact-height",
      "attack-motion-direction", "attack-motion-height", "attack-motion-duration", "attack-motion-takeoff", "attack-motion-draw", "attack-motion-swing"]) {
      this.root.querySelector(`#${id}`).disabled = running;
    }
    const assignment = snapshot.attackAssignment;
    const display = assignment ?? (snapshot.status === "READY" ? this.attackPreview : null);
    const overlay = this.root.querySelector("#left-long-targets");
    overlay.hidden = !display;
    if (display) {
      for (const field of ["readyPosition", "attackPosition"]) {
        const marker = overlay.querySelector(`[data-left-long-target="${field}"]`);
        const point = display[field];
        marker.style.left = `${point.x / snapshot.world.width * 100}%`;
        marker.style.top = `${point.y / snapshot.world.height * 100}%`;
      }
    }
    const phase = assignment?.movementPhase ?? "IDLE";
    const targetName = phase === "MOVING_TO_READY" ? "READY"
      : ["MOVING_TO_ATTACK", "ATTACK_READY"].includes(phase) ? "ATTACK" : null;
    const secondTouchSucceeded = snapshot.secondTouchResult?.success === true
      && snapshot.events.some((event) => event.type === "SECOND_TOUCH" && event.success === true);
    const cleared = [...snapshot.events].reverse().find((event) => event.type === "ATTACK_ASSIGNMENT_CLEARED");
    const failureReason = snapshot.thirdTouchResult?.success === false ? snapshot.thirdTouchResult.reason
      : snapshot.secondTouchResult?.success === false ? snapshot.secondTouchResult.reason : cleared?.reason;
    const player = assignment && snapshot.players.find((candidate) => candidate.id === assignment.assignedPlayerId);
    const lines = [
      `Simulator Status：${snapshot.status}`,
      `Movement Phase：${phase}`,
      `成功 SECOND_TOUCH：${secondTouchSucceeded ? "YES" : "NO"}`,
      `目前移動目標：${targetName ?? "無（尚未啟動或已清理）"}`,
      `距離目前目標：${targetName ? assignment.targetDistance.toFixed(2) + " 世界單位" : "—"}`,
    ];
    if (failureReason) lines.push(`失敗／清理原因：${failureReason}；${snapshot.thirdPass ? "第三觸球未完成" : "本次進攻跑位未完成"}。`);
    if (snapshot.thirdPass) {
      const third = snapshot.thirdPass;
      const attacker = snapshot.players.find((candidate) => candidate.id === third.assignedPlayerId);
      lines.push(`第三段球路：${third.status}｜剩餘 ${third.remainingTime.toFixed(3)} 秒`,
        `第三段起點 (${third.start.x.toFixed(2)}, ${third.start.y.toFixed(2)}, 高 ${third.start.height.toFixed(2)})`,
        `預計接觸 (${third.expectedContact.x.toFixed(2)}, ${third.expectedContact.y.toFixed(2)}, 高 ${third.expectedContact.height.toFixed(2)})`,
        `球目前高度：${snapshot.ball.height.toFixed(2)}｜${attacker?.position ?? "攻擊手"} 距離 ATTACK：${attacker ? Math.hypot(attacker.x - third.attackPosition.x, attacker.y - third.attackPosition.y).toFixed(2) : "—"}`,
        `第三觸球：${snapshot.thirdTouchResult?.success === true ? "成功（真實掃掠碰撞）" : snapshot.thirdTouchResult?.success === false ? "失敗" : "尚未發生"}`);
      if (snapshot.thirdTouchResult?.success) lines.push(`碰撞高度 ${snapshot.thirdTouchResult.ballHeight.toFixed(2)}｜可見重疊 ${snapshot.thirdTouchResult.overlapDepth.toFixed(2)} 世界像素`);
    }
    if (snapshot.attackMotion) {
      const motion = snapshot.attackMotion;
      const attacker = snapshot.players.find((candidate) => candidate.id === motion.playerId);
      const relativeDistance = attacker ? Math.hypot(snapshot.ball.x - attacker.x,
        snapshot.ball.y - snapshot.ball.height - (attacker.y - motion.jumpHeight)) : null;
      lines.push(`jumpPhase：${motion.jumpPhase}｜jumpHeight：${motion.jumpHeight.toFixed(2)}`,
        `rotationAngle：${motion.rotationAngle.toFixed(2)}°｜jumpElapsed：${motion.jumpElapsed.toFixed(3)} / ${motion.jumpDuration} 秒`,
        `預測第三觸球時間：${motion.predictedContactTime.toFixed(3)} 秒｜實際 THIRD_TOUCH：${snapshot.thirdTouchResult?.success ? snapshot.thirdTouchResult.time.toFixed(3) + " 秒" : "尚無"}`,
        `起跳排程：${motion.scheduledTakeoffTime.toFixed(3)} 秒｜實際起跳：${motion.startedAt === null ? "尚無" : motion.startedAt.toFixed(3) + " 秒"}`,
        `球與跳躍後頭像相對距離：${relativeDistance === null ? "—" : relativeDistance.toFixed(2) + " 世界像素"}`,
        `結果：${snapshot.thirdTouchStatus ?? "等待真實碰撞"}｜${["ATTACK_LANDING", "SPIKE_LANDING"].includes(snapshot.status) ? "旋轉／落地中，實驗尚未結束" : motion.jumpPhase === "LANDED" ? "已落地" : motion.skipReason ?? "動作進行中"}`);
      if (snapshot.thirdTouchResult?.success) lines.push(`真實觸球姿態：${snapshot.thirdTouchResult.jumpPhase}｜角度 ${snapshot.thirdTouchResult.rotationAngle.toFixed(2)}°｜跳躍高度 ${snapshot.thirdTouchResult.playerJumpHeight.toFixed(2)}`);
    }
    if (assignment) {
      lines.push(
        `LEFT_LONG → ${player?.position ?? "球員"}（${assignment.assignedPlayerId}）`,
        `本 Rally 來源：${assignment.source?.rotation ?? "指定資料"}／${assignment.source?.playerSlot ?? "自訂"}／C1 已套用預覽`,
        `READY (${assignment.readyPosition.x}, ${assignment.readyPosition.y}) 距離 ${assignment.readyDistance.toFixed(2)}`,
        `ATTACK (${assignment.attackPosition.x}, ${assignment.attackPosition.y}) 距離 ${assignment.attackDistance.toFixed(2)}`,
        ...(targetName ? [`目前目標座標 (${assignment.targetPosition.x.toFixed(2)}, ${assignment.targetPosition.y.toFixed(2)})`] : []),
        snapshot.simulationTime < assignment.movementBlockedUntil ? "接球動畫鎖定中：等待模擬時間解除" : "移動控制：固定時間步進",
      );
    } else {
      lines.push(`進攻任務：${cleared ? "本 Rally 已清理" : this.attackPreview ? "已配置，等待下一次發球" : "未啟用或 UNCONFIGURED"}`);
    }
    this.root.querySelector("#left-long-debug").textContent = lines.join("\n");
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
    if (["PASS_IN_FLIGHT", "THIRD_PASS_IN_FLIGHT", "SPIKE_IN_FLIGHT"].includes(snapshot.status) && this.lastSnapshot?.status !== snapshot.status) {
      this.beginCameraFollow(snapshot);
    }
    const viewportRect = this.viewport.getBoundingClientRect();
    if (viewportRect.width > 0 && viewportRect.height > 0
      && !["ATTACK_LANDING", "SPIKE_LANDING", "DEFENSE_TOUCH_LANDING", "THIRD_TOUCH_COMPLETE", "THIRD_TOUCH_MISSED", "SPIKE_NET", "SPIKE_LANDED", "SPIKE_OUT", "DEFENSE_TOUCH_COMPLETE"].includes(snapshot.status)) {
      this.camera.update({
        ballX: snapshot.ball.x,
        remainingFlightTime: snapshot.ball.duration * Math.max(0, 1 - snapshot.ball.progress),
        deltaSeconds,
        viewportWidth: viewportRect.width,
        viewportHeight: viewportRect.height,
      });
    }
    this.render(snapshot);
    if (isReceiveExperimentRunning(snapshot.status)) {
      this.frameId = requestAnimationFrame((nextTimestamp) => this.tick(nextTimestamp));
    } else {
      this.frameId = null;
    }
  }

  render(snapshot) {
    this.lastSnapshot = snapshot;
    this.renderAttackExperiment(snapshot);
    this.renderSpikeExperiment(snapshot);
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
      wrapper.hidden = false;
      wrapper.dataset.team = "HOME";
      wrapper.style.left = toLeft(player.x);
      wrapper.style.top = toTop(player.y);
      wrapper.classList.toggle("is-primary-receiver", player.responsibility === "PRIMARY");
      wrapper.classList.toggle("is-touch-eligible", player.touchEligible);
      wrapper.dataset.task = player.task;
      wrapper.title = `${player.position}｜${player.rotationPosition}｜${player.task}`;
      avatar.style.width = `${avatarDisplaySize}px`;
      avatar.style.height = `${avatarDisplaySize}px`;
      const { isReceiving, isSuccessfulSet, profile: animationProfile,
        hasTouchAnimation } = resolvePlayerTouchAnimation(player, snapshot);
      wrapper.style.setProperty("--receive-minimum-scale", String(animationProfile.minimumScale));
      wrapper.style.setProperty("--receive-animation-duration", `${animationProfile.animationDurationMs}ms`);
      avatar.classList.toggle("is-receiving", isReceiving);
      avatar.classList.toggle("is-setting", isSuccessfulSet);
      RECEIVE_ANIMATION_CLASS_NAMES.forEach((className) => {
        avatar.classList.toggle(className, hasTouchAnimation && className === animationProfile.className);
      });
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
      // 僅畫出固定步進快照；既有 RECEIVE 的 CSS 動畫與幾何維持原樣。
      const hasAttackPose = ["TAKEOFF", "DRAW", "SWING", "FOLLOW_THROUGH", "LANDED"].includes(player.jumpPhase);
      motion.style.transform = hasAttackPose
        ? `translateY(${-player.jumpHeight * cameraView.displayScale}px) rotate(${player.rotationAngle}deg)` : "";
    });

    const defensePlayer = snapshot.defense?.player;
    const staleDefense = this.playerElements.get(snapshot.defense?.configuration?.playerId ?? "AWAY-DEF-1");
    if (!defensePlayer && staleDefense) staleDefense.wrapper.hidden = true;
    if (defensePlayer) {
      const { wrapper, motion, avatar } = this.ensurePlayerElement(defensePlayer);
      wrapper.hidden = false;
      wrapper.dataset.team = "AWAY";
      wrapper.style.left = toLeft(defensePlayer.x);
      wrapper.style.top = toTop(defensePlayer.y);
      wrapper.dataset.task = defensePlayer.task;
      wrapper.title = `AWAY 防守實驗｜${defensePlayer.task}`;
      avatar.style.width = `${avatarDisplaySize}px`;
      avatar.style.height = `${avatarDisplaySize}px`;
      const profile = getReceiveAnimationProfile(snapshot.spikeFlight?.parameters.flightDuration ?? 0.65);
      const isReceiving = defensePlayer.action === "RECEIVE";
      wrapper.style.setProperty("--receive-minimum-scale", String(profile.minimumScale));
      wrapper.style.setProperty("--receive-animation-duration", `${profile.animationDurationMs}ms`);
      avatar.classList.toggle("is-receiving", isReceiving);
      avatar.classList.remove(...RECEIVE_ANIMATION_CLASS_NAMES);
      if (isReceiving) avatar.classList.add(profile.className);
      avatar.classList.toggle("receive-from-left", isReceiving && defensePlayer.receiveDirection === "FROM_LEFT");
      avatar.classList.toggle("receive-from-right", isReceiving && defensePlayer.receiveDirection === "FROM_RIGHT");
      const pushDirection = isReceiving ? getReceivePushDirection(defensePlayer.receiveDirection) : 1;
      const availableWorldDistance = pushDirection > 0 ? snapshot.world.width - defensePlayer.x : defensePlayer.x;
      motion.style.setProperty("--receive-roll-distance", `${pushDirection * Math.min(snapshot.parameters.avatarSize, availableWorldDistance) * cameraView.displayScale}px`);
      motion.style.setProperty("--receive-roll-rotation", `${pushDirection * 360}deg`);
      motion.classList.toggle("is-ultra-fast-receiving", isReceiving && profile.level === "ULTRA_FAST");
      motion.style.transform = "";
    }

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
    this.target.hidden = snapshot.status === "READY" || Boolean(snapshot.spikeFlight);

    const statusText = {
      READY: "點擊球場指定發球落點。",
      RUNNING: `主要接球員：${snapshot.primaryReceiverId ?? "分配中"}`,
      AWAITING_PASS_TARGET_CONFIG: "一傳品質已判定，等待黃色／藍色區域座標設定。",
      PASS_IN_FLIGHT: `第二段一傳飛行中：${snapshot.receiveQuality?.quality ?? "尚未判定"}`,
      SECOND_TOUCH_COMPLETE: `第二次觸球完成：${snapshot.secondTouchPlayerId}`,
      THIRD_PASS_IN_FLIGHT: "第三段球路進行中；攻擊手同步跑位，等待真實 ATTACK 接觸。",
      ATTACK_LANDING: `已記錄 ${snapshot.thirdTouchStatus}；球已停止，攻擊手繼續旋轉與落地，實驗尚未結束。`,
      THIRD_TOUCH_COMPLETE: "THIRD_TOUCH_COMPLETE：真實第三觸球成功，攻擊手已完成落地；未生成扣球球路。",
      THIRD_TOUCH_MISSED: `THIRD_TOUCH_MISSED：${snapshot.thirdTouchResult?.reason ?? "未碰到攻擊手"}`,
      SPIKE_IN_FLIGHT: `SPIKE_IN_FLIGHT：扣球飛行中；攻擊手${snapshot.attackMotion?.jumpPhase === "LANDED" ? "已落地" : "收勢／落地中"}。`,
      BALL_BOUNCING: "BALL_BOUNCING：首次落地結果已鎖定，排球依恢復係數與阻尼自然反彈。",
      BALL_REST: "BALL_REST：反彈能量低於停止門檻，排球靜止。",
      SPIKE_LANDING: `已記錄 ${snapshot.spikeResult?.type}；攻擊手繼續落地，實驗尚未結束。`,
      SPIKE_NET: "SPIKE_NET：扣球碰網；攻擊手已落地。此結果不代表得分。",
      SPIKE_LANDED: "SPIKE_LANDED：扣球落在對方 V1 有效場內；攻擊手已落地。此結果不代表得分。",
      SPIKE_OUT: "SPIKE_OUT：扣球落在 V1 有效場外；攻擊手已落地。此結果不代表得分。",
      DEFENSE_TOUCH_LANDING: "已記錄 DEFENSE_TOUCH；球已停止，攻擊手繼續完成落地。",
      DEFENSE_TOUCH_COMPLETE: "DEFENSE_TOUCH_COMPLETE：AWAY 防守員真實接觸扣球，第四段球路已停止。",
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
    if (!snapshot || !["RUNNING", "PASS_IN_FLIGHT", "THIRD_PASS_IN_FLIGHT", "SPIKE_IN_FLIGHT"].includes(snapshot.status)
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
