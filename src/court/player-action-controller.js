import {
  PLAYER_ACTION_CONFIG,
  PLAYER_ACTIONS,
  PLAYER_ACTION_TYPES,
} from "./player-action-config.js";
import {
  BALL_FLIGHT_CONFIG,
  createBallFlight,
  sampleBallFlight,
} from "./ball-trajectory.js";
import {
  calculateJumpHeightAtTime,
  calculatePlayerContactPoint,
  calculateSetJumpHeightAtTime,
} from "./player-contact-point.js";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function easeOutCubic(progress) {
  return 1 - ((1 - progress) ** 3);
}

function assertTeamId(teamId) {
  if (teamId !== "HOME" && teamId !== "AWAY") {
    throw new RangeError(`未知的球隊識別：${teamId}`);
  }
}

function animateElement(element, keyframes, options) {
  const animation = element.animate(keyframes, {
    fill: "none",
    easing: "ease-in-out",
    ...options,
  });
  return animation;
}

function getAttackFrames(teamId) {
  assertTeamId(teamId);
  return teamId === "HOME"
    ? [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-60deg)", offset: 0.28 },
        { transform: "rotate(360deg)" },
      ]
    : [
        { transform: "rotate(0deg)" },
        { transform: "rotate(60deg)", offset: 0.28 },
        { transform: "rotate(-360deg)" },
      ];
}

function getJumpFrames(height) {
  return [
    { transform: "translateY(0)" },
    { transform: `translateY(${-height}px)`, offset: 0.42 },
    { transform: `translateY(${-height}px)`, offset: 0.58 },
    { transform: "translateY(0)" },
  ];
}

export class PlayerActionController {
  constructor({
    match,
    playerElements,
    ballElement,
    onBallPositionChange = () => {},
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
    now = () => globalThis.performance?.now?.() ?? Date.now(),
  }) {
    if (!match?.scene || !(playerElements instanceof Map) || !ballElement) {
      throw new TypeError("建立球員動作控制器需要正式 Match、球員元素與排球元素。");
    }
    if (typeof requestFrame !== "function" || typeof cancelFrame !== "function") {
      throw new Error("目前環境不支援動畫影格 API。");
    }
    this.match = match;
    this.ballElement = ballElement;
    this.onBallPositionChange = onBallPositionChange;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.now = now;
    this.players = new Map();
    this.ballAnimation = null;
    if (!Number.isFinite(match.scene.ball.height)) match.scene.ball.height = 0;
    this.initialBallPosition = Object.freeze({ ...match.scene.ball });
    this.initialPlayerPositions = new Map();

    for (const teamId of ["HOME", "AWAY"]) {
      for (const worldPlayer of match.scene.players[teamId]) {
        const elements = playerElements.get(worldPlayer.playerId);
        if (!elements) throw new Error(`缺少球員 ${worldPlayer.playerId} 的正式畫面元素。`);
        this.players.set(worldPlayer.playerId, {
          playerId: worldPlayer.playerId,
          teamId,
          worldPlayer,
          ...elements,
          action: PLAYER_ACTIONS.IDLE,
          generation: 0,
          frameId: null,
          jumpFrameId: null,
          jumpHeight: 0,
          animations: [],
          completion: null,
        });
        this.initialPlayerPositions.set(
          worldPlayer.playerId,
          Object.freeze({ x: worldPlayer.x, y: worldPlayer.y }),
        );
      }
    }
  }

  getPlayerState(playerId) {
    const state = this.#getPlayer(playerId);
    return Object.freeze({
      playerId,
      teamId: state.teamId,
      action: state.action,
      x: state.worldPlayer.x,
      y: state.worldPlayer.y,
      jumpHeight: state.jumpHeight,
    });
  }

  getContactPoint(playerId, action, { jumpHeight } = {}) {
    const state = this.#getPlayer(playerId);
    return calculatePlayerContactPoint({
      playerX: state.worldPlayer.x,
      playerY: state.worldPlayer.y,
      jumpHeight: jumpHeight ?? state.jumpHeight,
      action,
      teamId: state.teamId,
    });
  }

  play(playerId, action, options = {}) {
    if (!PLAYER_ACTION_TYPES.includes(action)) {
      throw new RangeError(`未知的球員動作：${action}`);
    }
    if (action === PLAYER_ACTIONS.IDLE) return this.idle(playerId);
    if (action === PLAYER_ACTIONS.MOVE) {
      return this.moveTo(playerId, options.x, options.y);
    }

    let serveTrajectory = null;
    let servePreparation = null;
    if (action === PLAYER_ACTIONS.SERVE || action === PLAYER_ACTIONS.JUMP_SERVE) {
      this.#assertBallAvailable(playerId);
      if (options.servePreparation && typeof options.onContact === "function") {
        servePreparation = this.#validateServePreparation(
          this.#getPlayer(playerId),
          action,
          options.servePreparation,
        );
      } else {
        serveTrajectory = this.#validateServeTrajectory(
          this.#getPlayer(playerId),
          action,
          options.serveTrajectory,
        );
      }
    }

    const state = this.#beginAction(playerId, action);
    if (action === PLAYER_ACTIONS.RECEIVE) return this.#receive(state);
    if (action === PLAYER_ACTIONS.SET) return this.#set(state);
    if (action === PLAYER_ACTIONS.ATTACK) return this.#attack(state);
    if (action === PLAYER_ACTIONS.BLOCK) return this.#block(state);
    if (action === PLAYER_ACTIONS.SERVE) {
      return this.#serve(state, false, serveTrajectory ?? servePreparation, options.onContact);
    }
    return this.#serve(state, true, serveTrajectory ?? servePreparation, options.onContact);
  }

  playAndWait(playerId, action, options = {}) {
    this.play(playerId, action, options);
    const state = this.#getPlayer(playerId);
    if (state.action === PLAYER_ACTIONS.IDLE) {
      return Promise.resolve(Object.freeze({ playerId, action, status: "COMPLETED" }));
    }
    const generation = state.generation;
    return new Promise((resolve) => {
      state.completion = { generation, action, resolve };
    });
  }

  moveTo(playerId, targetX, targetY) {
    const state = this.#beginAction(playerId, PLAYER_ACTIONS.MOVE);
    const startX = state.worldPlayer.x;
    const startY = state.worldPlayer.y;
    const x = clamp(Number(targetX), 0, this.match.scene.width);
    const y = clamp(Number(targetY), 0, this.match.scene.height);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.idle(playerId);
      throw new TypeError("MOVE 目標必須是有效的世界座標。");
    }
    const deltaX = x - startX;
    const deltaY = y - startY;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 0.01) return this.idle(playerId);

    const directionAngle = (Math.atan2(deltaY, deltaX) * 180 / Math.PI) + 90;
    const { worldSpeed, stretchX, stretchY } = PLAYER_ACTION_CONFIG.move;
    state.avatarLayer.style.transform = `rotate(${directionAngle}deg) scale(${stretchX}, ${stretchY})`;
    const duration = Math.max(120, distance / worldSpeed * 1000);
    const generation = state.generation;
    const startedAt = this.now();

    const step = (timestamp) => {
      if (!this.#isCurrent(state, generation)) return;
      const progress = clamp((timestamp - startedAt) / duration, 0, 1);
      const eased = easeOutCubic(progress);
      this.#setPlayerWorldPosition(state, startX + deltaX * eased, startY + deltaY * eased);
      if (progress < 1) {
        state.frameId = this.requestFrame(step);
      } else {
        state.frameId = null;
        this.#finishAction(state, generation);
      }
    };
    state.frameId = this.requestFrame(step);
    return this.getPlayerState(playerId);
  }

  interrupt(playerId) {
    const state = this.#getPlayer(playerId);
    this.#resolveCompletion(state, "INTERRUPTED");
    this.#cancelStateAnimations(state);
    state.generation += 1;
    state.action = PLAYER_ACTIONS.IDLE;
    this.#resetPresentation(state);
    if (this.ballAnimation?.ownerPlayerId === playerId) this.#cancelBallAnimation();
    return this.getPlayerState(playerId);
  }

  idle(playerId) {
    return this.interrupt(playerId);
  }

  resetAll({ restoreWorldPositions = true } = {}) {
    for (const playerId of this.players.keys()) this.interrupt(playerId);
    this.#cancelBallAnimation();
    if (restoreWorldPositions) {
      for (const [playerId, position] of this.initialPlayerPositions) {
        this.#setPlayerWorldPosition(this.#getPlayer(playerId), position.x, position.y);
      }
      this.#setBallWorldPosition(
        this.initialBallPosition.x,
        this.initialBallPosition.y,
        this.initialBallPosition.height,
      );
    }
  }

  destroy() {
    this.resetAll({ restoreWorldPositions: false });
  }

  #getPlayer(playerId) {
    const state = this.players.get(playerId);
    if (!state) throw new RangeError(`找不到正式場上球員：${playerId}`);
    return state;
  }

  #beginAction(playerId, action) {
    const state = this.#getPlayer(playerId);
    this.interrupt(playerId);
    state.generation += 1;
    state.action = action;
    return state;
  }

  #isCurrent(state, generation) {
    return state.generation === generation && state.action !== PLAYER_ACTIONS.IDLE;
  }

  #setPlayerWorldPosition(state, x, y) {
    state.worldPlayer.x = clamp(x, 0, this.match.scene.width);
    state.worldPlayer.y = clamp(y, 0, this.match.scene.height);
    state.marker.dataset.worldX = String(state.worldPlayer.x);
    state.marker.dataset.worldY = String(state.worldPlayer.y);
    state.marker.style.left = `${state.worldPlayer.x}px`;
    state.marker.style.top = `${state.worldPlayer.y}px`;
  }

  #setBallWorldPosition(x, y, height = this.match.scene.ball.height) {
    this.match.scene.ball.x = clamp(x, 0, this.match.scene.width);
    this.match.scene.ball.y = clamp(y, 0, this.match.scene.height);
    this.match.scene.ball.height = Math.max(0, height);
    this.ballElement.dataset.worldX = String(this.match.scene.ball.x);
    this.ballElement.dataset.worldY = String(this.match.scene.ball.y);
    this.ballElement.dataset.height = String(this.match.scene.ball.height);
    this.ballElement.style.left = `${this.match.scene.ball.x}px`;
    this.ballElement.style.top = `${this.match.scene.ball.y - this.match.scene.ball.height}px`;
    this.onBallPositionChange(this.match.scene.ball);
  }

  #cancelStateAnimations(state) {
    if (state.frameId !== null) {
      this.cancelFrame(state.frameId);
      state.frameId = null;
    }
    if (state.jumpFrameId !== null) {
      this.cancelFrame(state.jumpFrameId);
      state.jumpFrameId = null;
    }
    state.jumpHeight = 0;
    for (const animation of state.animations) animation.cancel();
    state.animations = [];
  }

  #resetPresentation(state) {
    state.motionLayer.style.transform = "translateY(0)";
    state.avatarLayer.style.transform = "rotate(0deg) scale(1)";
  }

  #trackAnimations(state, animations) {
    state.animations = animations;
    const generation = state.generation;
    Promise.all(animations.map((animation) => animation.finished.catch(() => null)))
      .then(() => this.#finishAction(state, generation));
    return this.getPlayerState(state.playerId);
  }

  #finishAction(state, generation) {
    if (!this.#isCurrent(state, generation)) return;
    this.#resolveCompletion(state, "COMPLETED", generation);
    state.animations = [];
    state.action = PLAYER_ACTIONS.IDLE;
    state.jumpHeight = 0;
    this.#resetPresentation(state);
  }

  #resolveCompletion(state, status, generation = state.generation) {
    const completion = state.completion;
    if (!completion || completion.generation !== generation) return;
    state.completion = null;
    completion.resolve(Object.freeze({
      playerId: state.playerId,
      action: completion.action,
      status,
    }));
  }

  #receive(state) {
    const config = PLAYER_ACTION_CONFIG.receive;
    const angle = state.teamId === "HOME" ? 45 : -45;
    const animation = animateElement(state.avatarLayer, [
      { transform: "rotate(0deg) scale(1)" },
      { transform: `rotate(${angle}deg) scale(${config.squashX}, ${config.squashY})`, offset: 0.34 },
      { transform: `rotate(${angle * 0.22}deg) scale(0.92, 1.08)`, offset: 0.68 },
      { transform: "rotate(0deg) scale(1)" },
    ], { duration: config.duration });
    return this.#trackAnimations(state, [animation]);
  }

  #set(state) {
    const config = PLAYER_ACTION_CONFIG.set;
    const squash = animateElement(state.avatarLayer, [
      { transform: "rotate(0deg) scale(1)" },
      { transform: `rotate(0deg) scale(${config.squashX}, ${config.squashY})`, offset: 0.25 },
      { transform: "rotate(0deg) scale(0.94, 1.08)", offset: 0.58 },
      { transform: "rotate(0deg) scale(1)" },
    ], { duration: config.duration });
    const jump = animateElement(state.motionLayer, [
      { transform: "translateY(0)" },
      { transform: "translateY(10px)", offset: 0.22 },
      { transform: `translateY(${-config.jumpHeight}px)`, offset: 0.58 },
      { transform: "translateY(0)" },
    ], { duration: config.duration });
    this.#trackJumpHeight(
      state,
      config.jumpHeight,
      config.duration,
      0,
      calculateSetJumpHeightAtTime,
    );
    return this.#trackAnimations(state, [squash, jump]);
  }

  #attack(state) {
    const config = PLAYER_ACTION_CONFIG.attack;
    this.#trackJumpHeight(state, config.jumpHeight, config.duration);
    return this.#trackAnimations(state, [
      animateElement(state.avatarLayer, getAttackFrames(state.teamId), { duration: config.duration }),
      animateElement(state.motionLayer, getJumpFrames(config.jumpHeight), { duration: config.duration }),
    ]);
  }

  #block(state) {
    const config = PLAYER_ACTION_CONFIG.block;
    this.#trackJumpHeight(state, config.jumpHeight, config.duration);
    return this.#trackAnimations(state, [
      animateElement(state.motionLayer, getJumpFrames(config.jumpHeight), { duration: config.duration }),
    ]);
  }

  #serve(state, isJumpServe, serveTrajectory, onContact = null) {
    const config = isJumpServe ? PLAYER_ACTION_CONFIG.jumpServe : PLAYER_ACTION_CONFIG.serve;
    const trajectory = serveTrajectory;
    this.#setBallWorldPosition(
      trajectory.tossStart.x,
      trajectory.tossStart.y,
      trajectory.tossStart.height,
    );
    const generation = state.generation;
    const ballPath = this.#animateBallPath(
      state.playerId,
      [trajectory.tossStart, trajectory.tossApex, trajectory.contact, trajectory.target],
      [config.tossRiseDuration, config.tossFallDuration],
      trajectory.flight ?? null,
      generation,
      onContact,
      isJumpServe ? BALL_FLIGHT_CONFIG.jumpServeSpeed : BALL_FLIGHT_CONFIG.serveSpeed,
    );

    if (isJumpServe) {
      // 跳發直接重用與 ATTACK 相同的旋轉及跳躍規則。
      const attack = PLAYER_ACTION_CONFIG.attack;
      this.#trackJumpHeight(
        state,
        attack.jumpHeight,
        attack.duration,
        config.attackStartTime,
      );
      return this.#trackAnimations(state, [
        ballPath,
        animateElement(state.avatarLayer, getAttackFrames(state.teamId), {
          duration: attack.duration,
          delay: config.attackStartTime,
        }),
        animateElement(state.motionLayer, getJumpFrames(attack.jumpHeight), {
          duration: attack.duration,
          delay: config.attackStartTime,
        }),
      ]);
    }

    return this.#trackAnimations(state, [ballPath]);
  }

  #assertBallAvailable(playerId) {
    if (this.ballAnimation && this.ballAnimation.ownerPlayerId !== playerId) {
      throw new Error(`正式排球正在由球員 ${this.ballAnimation.ownerPlayerId} 執行發球動畫。`);
    }
  }

  #validateServeTrajectory(state, action, trajectory) {
    const preparation = this.#validateServePreparation(state, action, trajectory);
    const { contact, target } = preparation;
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.height)) {
      throw new TypeError("serveTrajectory.target 必須包含有效 x、y、height。");
    }
    if (target.x < 0 || target.x > this.match.scene.width || target.y < 0 || target.y > this.match.scene.height || target.height < 0) {
      throw new RangeError("serveTrajectory.target 超出正式世界範圍。");
    }
    if (state.teamId === "HOME" && target.x <= contact.x) {
      throw new Error("HOME 發球目標必須位於擊球點右側。");
    }
    if (state.teamId === "AWAY" && target.x >= contact.x) {
      throw new Error("AWAY 發球目標必須位於擊球點左側。");
    }
    const defaultSpeed = action === PLAYER_ACTIONS.JUMP_SERVE
      ? BALL_FLIGHT_CONFIG.jumpServeSpeed
      : BALL_FLIGHT_CONFIG.serveSpeed;
    const flight = createBallFlight({
      start: contact,
      end: target,
      speed: trajectory.speed ?? defaultSpeed,
      duration: trajectory.duration,
    });
    return Object.freeze({ ...preparation, target, flight });
  }

  #validateServePreparation(state, action, trajectory) {
    if (!trajectory || typeof trajectory !== "object") {
      throw new TypeError("正式發球動作必須由 Match Engine 提供 serveTrajectory。開發模式會明確提供測試球路。");
    }
    const names = ["tossStart", "tossApex", "contact"];
    for (const name of names) {
      const point = trajectory[name];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.height)) {
        throw new TypeError(`serveTrajectory.${name} 必須包含有效 x、y、height。`);
      }
      if (point.x < 0 || point.x > this.match.scene.width || point.y < 0 || point.y > this.match.scene.height || point.height < 0) {
        throw new RangeError(`serveTrajectory.${name} 超出正式世界範圍。`);
      }
    }
    const { tossStart, tossApex, contact } = trajectory;
    if (
      Math.abs(tossStart.x - tossApex.x) > 0.01
      || Math.abs(tossStart.y - tossApex.y) > 0.01
    ) {
      throw new Error("發球垂直上拋階段必須保持固定世界 X 與地面投影 Y。");
    }
    if (tossApex.height <= tossStart.height) {
      throw new Error("發球拋球最高點的高度必須高於起點。");
    }
    const actionConfig = action === PLAYER_ACTIONS.JUMP_SERVE
      ? PLAYER_ACTION_CONFIG.jumpServe
      : PLAYER_ACTION_CONFIG.serve;
    const hitTime = actionConfig.tossRiseDuration + actionConfig.tossFallDuration;
    const expectedJumpHeight = action === PLAYER_ACTIONS.JUMP_SERVE
      ? calculateJumpHeightAtTime(
          hitTime - actionConfig.attackStartTime,
          PLAYER_ACTION_CONFIG.attack.duration,
          PLAYER_ACTION_CONFIG.attack.jumpHeight,
        )
      : 0;
    const expectedContact = calculatePlayerContactPoint({
      playerX: state.worldPlayer.x,
      playerY: state.worldPlayer.y,
      jumpHeight: expectedJumpHeight,
      action,
      teamId: state.teamId,
    });
    const contactDifference = Math.hypot(
      contact.x - expectedContact.x,
      contact.y - expectedContact.y,
      contact.height - expectedContact.height,
    );
    if (contactDifference > 0.5) {
      throw new Error("serveTrajectory.contact 必須符合球員正式動作接觸點。");
    }
    return Object.freeze({ ...trajectory, tossStart, tossApex, contact });
  }

  #animateBallPath(
    ownerPlayerId,
    points,
    tossDurations,
    flight,
    ownerGeneration,
    onContact = null,
    deferredFlightSpeed = BALL_FLIGHT_CONFIG.serveSpeed,
  ) {
    const startedAt = this.now();
    const tossDuration = tossDurations.reduce((sum, duration) => sum + duration, 0);
    let activeFlight = flight;
    let totalDuration = tossDuration + (activeFlight?.duration ?? 0);
    let contactHandled = false;
    let resolveFinished;
    const finished = new Promise((resolve) => { resolveFinished = resolve; });
    const animation = {
      ownerPlayerId,
      ownerGeneration,
      frameId: null,
      resolveFinished,
    };
    this.ballAnimation = animation;

    const step = (timestamp) => {
      if (this.ballAnimation !== animation) return;
      const owner = this.players.get(ownerPlayerId);
      if (!owner || owner.generation !== ownerGeneration) {
        this.#cancelBallAnimation();
        return;
      }
      const elapsed = clamp(timestamp - startedAt, 0, totalDuration);
      let position;
      if (elapsed <= tossDuration) {
        let segment = 0;
        let segmentElapsed = elapsed;
        while (segment < tossDurations.length - 1 && segmentElapsed > tossDurations[segment]) {
          segmentElapsed -= tossDurations[segment];
          segment += 1;
        }
        const progress = clamp(segmentElapsed / tossDurations[segment], 0, 1);
        const eased = easeOutCubic(progress);
        const from = points[segment];
        const to = points[segment + 1];
        position = {
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased,
          height: from.height + (to.height - from.height) * eased,
        };
      } else {
        if (!contactHandled && onContact) {
          contactHandled = true;
          const target = onContact(Object.freeze({ ...points[2] }));
          if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.height)) {
            this.#cancelBallAnimation();
            return;
          }
          activeFlight = createBallFlight({
            start: points[2],
            end: target,
            speed: target.speed ?? deferredFlightSpeed,
            duration: target.duration,
          });
          totalDuration = tossDuration + activeFlight.duration;
        }
        position = activeFlight
          ? sampleBallFlight(activeFlight, elapsed - tossDuration)
          : points[2];
      }
      this.#setBallWorldPosition(position.x, position.y, position.height);
      if (elapsed < totalDuration) {
        animation.frameId = this.requestFrame(step);
      } else {
        this.ballAnimation = null;
        animation.resolveFinished();
      }
    };
    animation.frameId = this.requestFrame(step);
    return Object.freeze({
      finished,
      cancel: () => {
        if (this.ballAnimation === animation) this.#cancelBallAnimation();
      },
    });
  }

  #trackJumpHeight(
    state,
    maximumHeight,
    duration,
    delay = 0,
    heightSampler = calculateJumpHeightAtTime,
  ) {
    const generation = state.generation;
    const startedAt = this.now();
    const step = (timestamp) => {
      if (!this.#isCurrent(state, generation)) return;
      const elapsed = timestamp - startedAt - delay;
      state.jumpHeight = elapsed <= 0
        ? 0
        : heightSampler(elapsed, duration, maximumHeight);
      if (elapsed < duration) {
        state.jumpFrameId = this.requestFrame(step);
      } else {
        state.jumpFrameId = null;
        state.jumpHeight = 0;
      }
    };
    state.jumpFrameId = this.requestFrame(step);
  }

  #cancelBallAnimation() {
    if (!this.ballAnimation) return;
    if (this.ballAnimation.frameId !== null) this.cancelFrame(this.ballAnimation.frameId);
    this.ballAnimation.resolveFinished();
    this.ballAnimation = null;
  }
}
