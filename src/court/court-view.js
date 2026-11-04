import { HorizontalCamera } from "./camera.js";
import { getCourtConfig } from "./court-config.js";
import {
  createDevelopmentServeTrajectory,
  createServeTrajectory,
  PLAYER_ACTIONS,
  PLAYER_ACTION_TYPES,
} from "./player-action-config.js";
import { PlayerActionController } from "./player-action-controller.js";
import { createInitialWorldScene } from "./world-scene.js";
import {
  createRallyPreparationCommands,
  createServePresentationCommand,
  PLAYER_BEHAVIORS,
} from "../match/player-behavior.js";

export function getCourtPlayers(match, teamId) {
  const team = match?.teams?.[teamId];
  if (!team) {
    throw new RangeError(`未知的球隊識別：${teamId}`);
  }
  return match.scene.players[teamId].map((worldPlayer) => {
    const player = team.players.find((candidate) => candidate.id === worldPlayer.playerId);
    if (!player) {
      throw new Error(`${teamId} 場上球員 ${worldPlayer.playerId} 不在球隊名單中。`);
    }
    return Object.freeze({ ...worldPlayer, player });
  });
}

function createCourtPlayerMarker(courtPlayer) {
  const marker = document.createElement("div");
  marker.className = "court-player";
  marker.dataset.team = courtPlayer.teamId;
  marker.dataset.playerId = courtPlayer.playerId;
  marker.dataset.lineupPosition = courtPlayer.lineupPosition;
  marker.dataset.worldX = String(courtPlayer.x);
  marker.dataset.worldY = String(courtPlayer.y);
  marker.style.left = `${courtPlayer.x}px`;
  marker.style.top = `${courtPlayer.y}px`;
  marker.setAttribute(
    "aria-label",
    `${courtPlayer.player.name}，先發槽位 ${courtPlayer.lineupPosition}`,
  );

  const motionLayer = document.createElement("span");
  motionLayer.className = "court-player__motion";
  const avatar = document.createElement("span");
  avatar.className = "court-player__avatar";
  const fallback = document.createElement("span");
  fallback.className = "court-player__avatar-fallback";
  fallback.textContent = courtPlayer.player.name.slice(-2);
  if (courtPlayer.player.avatar) {
    const image = document.createElement("img");
    image.alt = "";
    image.hidden = true;
    image.addEventListener("load", () => {
      image.hidden = false;
      fallback.hidden = true;
    }, { once: true });
    image.addEventListener("error", () => {
      image.remove();
      fallback.hidden = false;
    }, { once: true });
    image.src = courtPlayer.player.avatar;
    avatar.append(image, fallback);
  } else {
    avatar.append(fallback);
  }
  motionLayer.append(avatar);
  const position = document.createElement("small");
  position.textContent = courtPlayer.lineupPosition;
  marker.append(motionLayer, position);
  return Object.freeze({ marker, motionLayer, avatarLayer: avatar });
}

function createCourtBall(ball) {
  const element = document.createElement("div");
  const height = Number.isFinite(ball.height) ? ball.height : 0;
  element.className = "court-ball";
  element.dataset.worldX = String(ball.x);
  element.dataset.worldY = String(ball.y);
  element.dataset.height = String(height);
  element.style.left = `${ball.x}px`;
  element.style.top = `${ball.y - height}px`;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "排球");
  return element;
}

function createCourtBackground(court) {
  const image = document.createElement("img");
  image.className = "court-world__background";
  image.src = court.imagePath;
  image.alt = court.name;
  image.draggable = false;
  return image;
}

export function renderCourtView(match, rootElement, { developmentMode = false } = {}) {
  if (!rootElement) {
    throw new TypeError("球場畫面根節點不存在。");
  }
  const presentationScene = createInitialWorldScene(
    match.teams.HOME.startingLineup,
    match.teams.AWAY.startingLineup,
  );
  // Court 擁有自己的 Presentation Scene；不回寫正式 Match 核心資料。
  match = Object.freeze({ ...match, scene: presentationScene });
  const court = getCourtConfig(match.courtId);
  rootElement.querySelector("#court-match-name").textContent = match.name;
  rootElement.querySelector("#court-home-team-name").textContent = match.teams.HOME.name;
  rootElement.querySelector("#court-away-team-name").textContent = match.teams.AWAY.name;
  function updateScoreboard() {
    rootElement.querySelector("#court-home-score").textContent = String(match.score.HOME);
    rootElement.querySelector("#court-away-score").textContent = String(match.score.AWAY);
  }
  updateScoreboard();

  const worldElement = rootElement.querySelector("#court-world");
  const viewportElement = rootElement.querySelector("#court-viewport");
  const ballElement = createCourtBall(match.scene.ball);
  const courtPlayers = [
    ...getCourtPlayers(match, "HOME"),
    ...getCourtPlayers(match, "AWAY"),
  ];
  const playerElements = new Map(
    courtPlayers.map((courtPlayer) => [courtPlayer.playerId, createCourtPlayerMarker(courtPlayer)]),
  );
  worldElement.replaceChildren(
    createCourtBackground(court),
    ...[...playerElements.values()].map(({ marker }) => marker),
    ballElement,
  );

  const camera = new HorizontalCamera({
    worldWidth: match.scene.width,
    worldHeight: match.scene.height,
  });
  let animationFrameId = null;

  function applyCameraPresentation() {
    const presentation = camera.getPresentation();
    worldElement.style.left = `${presentation.contentOffsetX}px`;
    worldElement.style.transform = `translate3d(${-presentation.cameraX * presentation.scale}px, 0, 0) scale(${presentation.scale})`;
  }

  function animateCamera() {
    applyCameraPresentation();
    if (camera.step()) {
      animationFrameId = requestAnimationFrame(animateCamera);
    } else {
      applyCameraPresentation();
      animationFrameId = null;
    }
  }

  function followBall(immediate = false) {
    camera.followWorldX(match.scene.ball.x, immediate);
    if (immediate) {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      applyCameraPresentation();
      animationFrameId = null;
    } else if (animationFrameId === null) {
      animationFrameId = requestAnimationFrame(animateCamera);
    }
  }

  function resizeCamera() {
    const rect = viewportElement.getBoundingClientRect();
    camera.resize(rect.width, rect.height);
    followBall(true);
  }

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(resizeCamera)
    : null;
  if (resizeObserver) resizeObserver.observe(viewportElement);
  resizeCamera();

  function updateBallPresentation() {
    ballElement.dataset.worldX = String(match.scene.ball.x);
    ballElement.dataset.worldY = String(match.scene.ball.y);
    ballElement.dataset.height = String(match.scene.ball.height);
    ballElement.style.left = `${match.scene.ball.x}px`;
    ballElement.style.top = `${match.scene.ball.y - match.scene.ball.height}px`;
    if (ballStateOutput) {
      ballStateOutput.textContent = `排球 X: ${Math.round(match.scene.ball.x)}，Y: ${Math.round(match.scene.ball.y)}，高度: ${Math.round(match.scene.ball.height)}`;
    }
    followBall(false);
  }

  const actionController = new PlayerActionController({
    match,
    playerElements,
    ballElement,
    onBallPositionChange: updateBallPresentation,
  });
  let formalBehaviorActive = false;

  async function playBehaviorCommands(commands) {
    if (!Array.isArray(commands) || commands.length === 0) {
      throw new TypeError("正式行為命令必須是非空陣列。");
    }
    if (formalBehaviorActive) throw new Error("正式行為動畫正在執行中。");
    formalBehaviorActive = true;
    try {
      const completions = await Promise.all(commands.map((command) => {
        if (command.behavior === PLAYER_BEHAVIORS.MOVE_TO_POSITION) {
          return actionController.playAndWait(command.playerId, PLAYER_ACTIONS.MOVE, command.target);
        }
        if (
          command.behavior === PLAYER_BEHAVIORS.HOLD_POSITION
          || command.behavior === PLAYER_BEHAVIORS.IDLE
        ) {
          return Promise.resolve(Object.freeze({
            playerId: command.playerId,
            action: command.behavior,
            status: "COMPLETED",
          }));
        }
        throw new Error(`一般行為播放接口不接受 ${command.behavior}。`);
      }));
      if (completions.some((completion) => completion.status !== "COMPLETED")) {
        throw new Error("正式行為動畫在完成前遭到中斷。");
      }
      return Object.freeze(completions);
    } finally {
      formalBehaviorActive = false;
    }
  }

  async function playServePresentationCommand(command) {
    if (formalBehaviorActive) throw new Error("正式行為動畫正在執行中。");
    if (command?.behavior !== PLAYER_BEHAVIORS.SERVE) {
      throw new TypeError("正式發球表現需要 SERVE 命令。");
    }
    const action = command.action;
    const playerState = actionController.getPlayerState(command.playerId);
    const serveTrajectory = createServeTrajectory({
      action,
      teamId: playerState.teamId,
      playerX: playerState.x,
      playerY: playerState.y,
      target: command.ballTrajectory.target,
    });
    formalBehaviorActive = true;
    try {
      const completion = await actionController.playAndWait(command.playerId, action, {
        serveTrajectory,
      });
      if (completion.status !== "COMPLETED") {
        throw new Error("正式發球動畫在完成前遭到中斷。");
      }
      return Object.freeze([completion]);
    } finally {
      formalBehaviorActive = false;
    }
  }

  async function playRecordedRally(events) {
    if (!Array.isArray(events)) throw new TypeError("球場表現需要正式事件陣列。");
    const preparedEvent = events.find((event) => event.type === "RALLY_PREPARED");
    const serveEvent = events.find((event) => event.type === "SERVE_RESOLVED");
    if (!preparedEvent || !serveEvent) throw new Error("正式事件缺少 Rally 準備或發球結果。");
    await playBehaviorCommands(createRallyPreparationCommands(match, preparedEvent));
    await playServePresentationCommand(createServePresentationCommand(match, serveEvent));
  }

  const devTools = rootElement.querySelector("#court-dev-tools");
  const animationDevTools = rootElement.querySelector("#court-dev-animation");
  const coordinateOutput = rootElement.querySelector("#court-coordinate-output");
  const ballStateOutput = rootElement.querySelector("#dev-ball-state");
  const copyButton = rootElement.querySelector("#copy-court-coordinate");
  const ballControl = rootElement.querySelector("#dev-ball-x");
  const playerControl = rootElement.querySelector("#dev-player-id");
  const actionControl = rootElement.querySelector("#dev-player-action");
  const moveFields = rootElement.querySelector("#dev-move-fields");
  const moveXControl = rootElement.querySelector("#dev-move-x");
  const moveYControl = rootElement.querySelector("#dev-move-y");
  const runActionButton = rootElement.querySelector("#dev-run-action");
  const resetActionButton = rootElement.querySelector("#dev-reset-actions");
  let selectedCoordinate = null;

  function handleWorldClick(event) {
    if (!developmentMode) return;
    selectedCoordinate = camera.screenToWorld(
      event.clientX,
      event.clientY,
      viewportElement.getBoundingClientRect(),
    );
    coordinateOutput.textContent = `X: ${Math.round(selectedCoordinate.x)}, Y: ${Math.round(selectedCoordinate.y)}`;
    copyButton.disabled = false;
  }

  viewportElement.addEventListener("click", handleWorldClick);
  const handleBallInput = () => {
    if (formalBehaviorActive) return;
    const nextX = Number(ballControl.value);
    if (!Number.isFinite(nextX)) return;
    match.scene.ball.x = Math.min(Math.max(nextX, 0), match.scene.width);
    updateBallPresentation();
  };
  const handlePlayerSelection = () => {
    if (!playerControl.value) return;
    const state = actionController.getPlayerState(playerControl.value);
    moveXControl.value = String(Math.round(state.x));
    moveYControl.value = String(Math.round(state.y));
  };
  const handleActionSelection = () => {
    moveFields.hidden = actionControl.value !== PLAYER_ACTIONS.MOVE;
  };
  const handleRunAction = () => {
    if (formalBehaviorActive) return;
    if (!playerControl.value) return;
    let options = {};
    if (actionControl.value === PLAYER_ACTIONS.MOVE) {
      options = { x: Number(moveXControl.value), y: Number(moveYControl.value) };
    } else if (
      actionControl.value === PLAYER_ACTIONS.SERVE
      || actionControl.value === PLAYER_ACTIONS.JUMP_SERVE
    ) {
      const playerState = actionController.getPlayerState(playerControl.value);
      options = {
        serveTrajectory: createDevelopmentServeTrajectory({
          action: actionControl.value,
          teamId: playerState.teamId,
          playerX: playerState.x,
          playerY: playerState.y,
          worldWidth: match.scene.width,
          worldHeight: match.scene.height,
        }),
      };
    }
    actionController.play(playerControl.value, actionControl.value, options);
  };
  const handleResetActions = () => {
    if (formalBehaviorActive) return;
    actionController.resetAll();
    ballControl.value = String(match.scene.ball.x);
    handlePlayerSelection();
    followBall(true);
  };
  if (developmentMode) {
    devTools.hidden = false;
    animationDevTools.hidden = false;
    updateBallPresentation();
    ballControl.value = String(match.scene.ball.x);
    playerControl.replaceChildren(...courtPlayers.map((courtPlayer) => {
      const option = document.createElement("option");
      option.value = courtPlayer.playerId;
      option.textContent = `${courtPlayer.teamId}｜${courtPlayer.lineupPosition}｜${courtPlayer.player.name}`;
      return option;
    }));
    actionControl.replaceChildren(...PLAYER_ACTION_TYPES.filter((action) => action !== PLAYER_ACTIONS.IDLE).map((action) => {
      const option = document.createElement("option");
      option.value = action;
      option.textContent = action;
      return option;
    }));
    handlePlayerSelection();
    handleActionSelection();
    ballControl.addEventListener("input", handleBallInput);
    playerControl.addEventListener("change", handlePlayerSelection);
    actionControl.addEventListener("change", handleActionSelection);
    runActionButton.addEventListener("click", handleRunAction);
    resetActionButton.addEventListener("click", handleResetActions);
    copyButton.addEventListener("click", async () => {
      if (!selectedCoordinate || !globalThis.navigator?.clipboard) return;
      const value = `${Math.round(selectedCoordinate.x)}, ${Math.round(selectedCoordinate.y)}`;
      await globalThis.navigator.clipboard.writeText(value);
    });
  } else {
    devTools.hidden = true;
    animationDevTools.hidden = true;
  }

  return Object.freeze({
    camera,
    actionController,
    playBehaviorCommands,
    playRecordedRally,
    updateScoreboard,
    followBall,
    resizeCamera,
    destroy() {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      actionController.destroy();
      resizeObserver?.disconnect();
      viewportElement.removeEventListener("click", handleWorldClick);
      ballControl.removeEventListener("input", handleBallInput);
      playerControl.removeEventListener("change", handlePlayerSelection);
      actionControl.removeEventListener("change", handleActionSelection);
      runActionButton.removeEventListener("click", handleRunAction);
      resetActionButton.removeEventListener("click", handleResetActions);
    },
  });
}
