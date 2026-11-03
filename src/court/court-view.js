import { HorizontalCamera } from "./camera.js";
import { getCourtConfig } from "./court-config.js";

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

  const avatar = document.createElement("span");
  avatar.className = "court-player__avatar";
  avatar.textContent = courtPlayer.player.name.slice(-2);
  const position = document.createElement("small");
  position.textContent = courtPlayer.lineupPosition;
  marker.append(avatar, position);
  return marker;
}

function createCourtBall(ball) {
  const element = document.createElement("div");
  element.className = "court-ball";
  element.dataset.worldX = String(ball.x);
  element.dataset.worldY = String(ball.y);
  element.style.left = `${ball.x}px`;
  element.style.top = `${ball.y}px`;
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
  const court = getCourtConfig(match.courtId);
  rootElement.querySelector("#court-match-name").textContent = match.name;
  rootElement.querySelector("#court-home-team-name").textContent = match.teams.HOME.name;
  rootElement.querySelector("#court-away-team-name").textContent = match.teams.AWAY.name;
  rootElement.querySelector("#court-home-score").textContent = String(match.score.HOME);
  rootElement.querySelector("#court-away-score").textContent = String(match.score.AWAY);

  const worldElement = rootElement.querySelector("#court-world");
  const viewportElement = rootElement.querySelector("#court-viewport");
  const ballElement = createCourtBall(match.scene.ball);
  const homePlayers = getCourtPlayers(match, "HOME").map(createCourtPlayerMarker);
  const awayPlayers = getCourtPlayers(match, "AWAY").map(createCourtPlayerMarker);
  worldElement.replaceChildren(
    createCourtBackground(court),
    ...homePlayers,
    ...awayPlayers,
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
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    if (immediate) {
      applyCameraPresentation();
      animationFrameId = null;
    } else {
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

  const devTools = rootElement.querySelector("#court-dev-tools");
  const coordinateOutput = rootElement.querySelector("#court-coordinate-output");
  const copyButton = rootElement.querySelector("#copy-court-coordinate");
  const ballControl = rootElement.querySelector("#dev-ball-x");
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
  if (developmentMode) {
    devTools.hidden = false;
    ballControl.value = String(match.scene.ball.x);
    ballControl.addEventListener("input", () => {
      const nextX = Number(ballControl.value);
      if (!Number.isFinite(nextX)) return;
      match.scene.ball.x = Math.min(Math.max(nextX, 0), match.scene.width);
      ballElement.dataset.worldX = String(match.scene.ball.x);
      ballElement.style.left = `${match.scene.ball.x}px`;
      followBall(false);
    });
    copyButton.addEventListener("click", async () => {
      if (!selectedCoordinate || !globalThis.navigator?.clipboard) return;
      const value = `${Math.round(selectedCoordinate.x)}, ${Math.round(selectedCoordinate.y)}`;
      await globalThis.navigator.clipboard.writeText(value);
    });
  } else {
    devTools.hidden = true;
  }

  return Object.freeze({
    camera,
    followBall,
    resizeCamera,
    destroy() {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      viewportElement.removeEventListener("click", handleWorldClick);
    },
  });
}
