import { FORMAL_MATCH_VISUALS, resolveImpactLevel } from "./config/formal-match-renderer-config.js";
import { getReceiveAnimationProfile, getReceivePushDirection,
  RECEIVE_ANIMATION_CLASS_NAMES } from "./receive-animation.js";
import { updatePlayerAvatarElement } from "../display/player-avatar.js";

export function resolveDisplayedSpeed(snapshot) {
  const explicit = snapshot?.ball?.speedLevel;
  if (["SLOW", "NORMAL", "FAST", "ULTRA_FAST"].includes(explicit)) return explicit;
  const velocity = snapshot?.ballVelocity;
  const speed = velocity
    ? Math.hypot(velocity.x ?? 0, (velocity.y ?? 0) - (velocity.height ?? 0)) : 0;
  if (speed >= 1350) return "ULTRA_FAST";
  if (speed >= 900) return "FAST";
  if (speed >= 650) return "NORMAL";
  return "SLOW";
}

export function resolveActualBallSpeed(snapshot) {
  const velocity = snapshot?.ballVelocity;
  return velocity ? Math.hypot(velocity.x ?? 0, velocity.y ?? 0, velocity.height ?? 0) : 0;
}

export function resolveBallSpinRate(speed) {
  const anchors = FORMAL_MATCH_VISUALS.ballSpin.speedAnchors;
  if (!Number.isFinite(speed) || speed <= anchors[0].speed) return anchors[0].degreesPerSecond;
  for (let index = 1; index < anchors.length; index += 1) {
    const lower = anchors[index - 1];
    const upper = anchors[index];
    if (speed <= upper.speed) {
      const progress = (speed - lower.speed) / (upper.speed - lower.speed);
      return lower.degreesPerSecond
        + (upper.degreesPerSecond - lower.degreesPerSecond) * progress;
    }
  }
  return anchors.at(-1).degreesPerSecond;
}

const BALL_DIRECTION_EVENTS = Object.freeze(new Set([
  "SERVE_CONTACT", "RECEIVE_OUTPUT", "RECEIVE_ERROR", "SET_RESULT",
  "ATTACK_STARTED", "BLOCK_RESULT", "FINISHING_BOUNCE",
]));

export function resolveBallFlightSegmentKey(snapshot) {
  const directionEventCount = (snapshot?.events ?? [])
    .filter((event) => BALL_DIRECTION_EVENTS.has(event.type)).length;
  return `${snapshot?.ballFlightId ?? 0}:${directionEventCount}`;
}

export function isBallSpinPhase(snapshot) {
  if (!["SERVE_FLIGHT", "ATTACK_FLIGHT"].includes(snapshot?.rallyPhase)
    || snapshot?.rallyResult) return false;
  const latestContact = [...(snapshot?.events ?? [])].reverse().find((event) => [
    "SERVE_CONTACT", "ATTACK_STARTED", "RECEIVE_RESULT", "SET_RESULT",
    "BLOCK_CONTACT", "BLOCK_RESULT", "FINISHING_BOUNCE", "RALLY_RESULT_LOCKED",
  ].includes(event.type));
  return latestContact?.type === "SERVE_CONTACT" || latestContact?.type === "ATTACK_STARTED";
}

export function resolveBallSpinProfile(snapshot) {
  const speedLevel = resolveDisplayedSpeed(snapshot);
  if (!isBallSpinPhase(snapshot)) return Object.freeze({ enabled: false, direction: 0,
    degreesPerSecond: 0, speedLevel, startedAt: null });
  const launchEvent = [...(snapshot?.events ?? [])].reverse().find((event) =>
    ["SERVE_CONTACT", "ATTACK_STARTED"].includes(event.type) && event.outgoingVelocity);
  const horizontalVelocity = launchEvent?.outgoingVelocity?.x ?? snapshot?.ballVelocity?.x ?? 0;
  const epsilon = FORMAL_MATCH_VISUALS.ballSpin.horizontalSpeedEpsilon;
  const direction = Math.abs(horizontalVelocity) < epsilon ? 0 : Math.sign(horizontalVelocity);
  const actualSpeed = resolveActualBallSpeed(snapshot);
  return Object.freeze({ enabled: direction !== 0, direction,
    degreesPerSecond: resolveBallSpinRate(actualSpeed), actualSpeed, speedLevel,
    startedAt: Number.isFinite(launchEvent?.time) ? launchEvent.time : snapshot?.simulationTime ?? 0 });
}

export function advanceBallSpinAngle(angle, elapsedSeconds, direction, degreesPerSecond) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 || direction === 0) return angle;
  return angle + elapsedSeconds * degreesPerSecond * direction;
}

export function isNetFinished(snapshot) {
  return ["SERVE_NET", "ATTACK_NET"].includes(snapshot?.rallyResult?.reason);
}

export class FormalMatchRenderer {
  constructor({ root }) {
    this.root = root;
    this.viewport = root.querySelector("#formal-match-viewport");
    this.worldElement = root.querySelector("#formal-match-world");
    this.ballElement = root.querySelector("#formal-match-ball");
    this.ballArtwork = document.createElement("img");
    this.ballArtwork.className = "formal-match-ball__artwork";
    this.ballArtwork.src = "./assets/balls/volleyball.svg";
    this.ballArtwork.alt = "";
    this.ballElement.replaceChildren(this.ballArtwork);
    this.playerElements = new Map();
    this.processedEvents = 0;
    this.rallyNumber = null;
    this.ballFlightSegmentKey = null;
    this.ballSpinAngle = 0;
    this.ballSpinDirection = 0;
    this.ballSpinRate = 0;
    this.ballSpinLastTime = null;
    this.lastSnapshot = null;
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.lastSnapshot && this.render(this.lastSnapshot, this.rallyNumber)) : null;
    this.resizeObserver?.observe(this.viewport);
  }

  resetRally(rallyNumber) {
    this.rallyNumber = rallyNumber;
    this.processedEvents = 0;
    this.ballFlightSegmentKey = null;
    this.ballSpinAngle = 0;
    this.ballSpinDirection = 0;
    this.ballSpinRate = 0;
    this.ballSpinLastTime = null;
    this.ballElement.classList.remove("is-net-finished");
  }

  ensurePlayer(player) {
    let elements = this.playerElements.get(player.id);
    if (elements) return elements;
    const wrapper = document.createElement("span");
    wrapper.className = "simulator-player team-simulator-player formal-match-player";
    wrapper.dataset.playerId = player.id;
    wrapper.dataset.team = player.team;
    const impact = document.createElement("span");
    impact.className = "formal-match-player__impact";
    const motion = document.createElement("span");
    motion.className = "simulator-player__motion";
    const avatar = document.createElement("span");
    avatar.className = "simulator-player__avatar";
    const fallback = document.createElement("span");
    fallback.className = "simulator-player__fallback";
    const image = document.createElement("img");
    image.className = "simulator-player__photo";
    image.alt = "";
    image.hidden = !player.avatar;
    if (player.avatar) image.src = player.avatar;
    image.addEventListener("error", () => { image.hidden = true; fallback.hidden = false; });
    fallback.hidden = Boolean(player.avatar);
    avatar.append(fallback, image);
    motion.append(avatar);
    impact.append(motion);
    wrapper.append(impact);
    this.worldElement.append(wrapper);
    elements = { wrapper, impact, motion, avatar, fallback, image };
    this.playerElements.set(player.id, elements);
    updatePlayerAvatarElement(elements, player);
    return elements;
  }

  playImpact(playerId, impactSpeed) {
    const elements = this.playerElements.get(playerId);
    if (!elements) return;
    const level = resolveImpactLevel(impactSpeed);
    if (level === "NONE") return;
    elements.impact.classList.remove("is-impact-mild", "is-impact-noticeable", "is-impact-strong");
    void elements.impact.offsetWidth;
    elements.impact.classList.add(`is-impact-${level.toLowerCase()}`);
  }

  processEvents(snapshot) {
    const events = snapshot.events ?? [];
    if (events.length < this.processedEvents) this.processedEvents = 0;
    for (const event of events.slice(this.processedEvents)) {
      if (event.type === "RECEIVE_RESULT") this.playImpact(event.playerId, event.impactSpeed);
    }
    this.processedEvents = events.length;
  }

  render(snapshot, rallyNumber = this.rallyNumber) {
    if (!snapshot) return;
    if (rallyNumber !== this.rallyNumber) this.resetRally(rallyNumber);
    this.lastSnapshot = snapshot;
    const rect = this.viewport.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    const world = snapshot.world;
    const scale = rect.height / world.height;
    const renderedWidth = world.width * scale;
    const ballScreenX = snapshot.ball.x * scale;
    const desiredLeft = rect.width / 2 - ballScreenX;
    const minLeft = Math.min(0, rect.width - renderedWidth);
    const left = Math.max(minLeft, Math.min(0, desiredLeft));
    this.worldElement.style.width = `${renderedWidth}px`;
    this.worldElement.style.height = `${rect.height}px`;
    this.worldElement.style.left = `${left}px`;
    this.worldElement.style.top = "0px";
    const activeIds = new Set(snapshot.players.map((player) => player.id));
    for (const [id, elements] of this.playerElements) elements.wrapper.hidden = !activeIds.has(id);
    const avatarSize = snapshot.parameters.avatarSize * scale;
    for (const player of snapshot.players) {
      const elements = this.ensurePlayer(player);
      elements.wrapper.hidden = false;
      elements.wrapper.dataset.team = player.team;
      elements.wrapper.style.left = `${player.x / world.width * 100}%`;
      elements.wrapper.style.top = `${player.y / world.height * 100}%`;
      elements.avatar.style.width = `${avatarSize}px`;
      elements.avatar.style.height = `${avatarSize}px`;
      elements.avatar.style.fontSize = `${Math.max(9, avatarSize * 0.2)}px`;
      updatePlayerAvatarElement(elements, player);
      elements.impact.style.setProperty("--impact-direction", player.team === "HOME" ? "-12px" : "12px");
      const isReceiving = player.action === "RECEIVE";
      const isSuccessfulSet = player.action === "SET"
        && snapshot.secondTouchResult?.success === true
        && snapshot.secondTouchResult.playerId === player.id;
      const profile = getReceiveAnimationProfile(isSuccessfulSet
        ? Math.max(1, snapshot.parameters.flightDuration)
        : Math.max(0.01, snapshot.parameters.flightDuration));
      elements.wrapper.style.setProperty("--receive-minimum-scale", String(profile.minimumScale));
      elements.wrapper.style.setProperty("--receive-animation-duration", `${profile.animationDurationMs}ms`);
      elements.avatar.classList.toggle("is-receiving", isReceiving);
      elements.avatar.classList.toggle("is-setting", isSuccessfulSet);
      RECEIVE_ANIMATION_CLASS_NAMES.forEach((className) => {
        elements.avatar.classList.toggle(className,
          (isReceiving || isSuccessfulSet) && className === profile.className);
      });
      elements.avatar.classList.toggle("receive-from-left",
        isReceiving && player.receiveDirection === "FROM_LEFT");
      elements.avatar.classList.toggle("receive-from-right",
        isReceiving && player.receiveDirection === "FROM_RIGHT");
      const pushDirection = isReceiving && player.receiveDirection
        ? getReceivePushDirection(player.receiveDirection) : 1;
      const availableWorldDistance = pushDirection > 0 ? world.width - player.x : player.x;
      elements.motion.style.setProperty("--receive-roll-distance",
        `${pushDirection * Math.min(snapshot.parameters.avatarSize, availableWorldDistance) * scale}px`);
      elements.motion.style.setProperty("--receive-roll-rotation", `${pushDirection * 360}deg`);
      elements.motion.classList.toggle("is-ultra-fast-receiving",
        isReceiving && profile.level === "ULTRA_FAST");
      elements.motion.classList.toggle("is-serve-away", player.team === "AWAY");
      elements.motion.classList.toggle("is-serve-preparing", player.action === "SERVE_PREPARE");
      elements.motion.classList.toggle("is-serve-contacting", player.action === "SERVE_CONTACT");
      elements.motion.classList.toggle("is-serve-following", player.action === "SERVE_FOLLOW_THROUGH");
      const hasAttackPose = ["TAKEOFF", "DRAW", "SWING", "FOLLOW_THROUGH", "LANDED"]
        .includes(player.jumpPhase);
      elements.motion.style.transform = hasAttackPose
        ? `translateY(${-((player.jumpHeight ?? 0) * scale)}px) rotate(${player.rotationAngle ?? 0}deg)` : "";
      elements.wrapper.setAttribute("aria-label", `${player.team} ${player.job ?? ""} ${player.name ?? ""}`.trim());
    }
    const ballSize = snapshot.presentation.ballDisplaySize * scale;
    this.ballElement.hidden = false;
    this.ballElement.style.left = `${snapshot.ball.x / world.width * 100}%`;
    this.ballElement.style.top = `${(snapshot.ball.y - snapshot.ball.height) / world.height * 100}%`;
    const segmentKey = resolveBallFlightSegmentKey(snapshot);
    const spinProfile = resolveBallSpinProfile(snapshot);
    if (segmentKey !== this.ballFlightSegmentKey) {
      this.ballFlightSegmentKey = segmentKey;
      this.ballSpinDirection = spinProfile.direction;
      this.ballSpinRate = spinProfile.degreesPerSecond;
      this.ballSpinLastTime = spinProfile.startedAt ?? snapshot.simulationTime;
    }
    this.ballSpinRate = spinProfile.degreesPerSecond;
    const currentTime = snapshot.simulationTime ?? this.ballSpinLastTime ?? 0;
    if (spinProfile.enabled && this.ballSpinLastTime !== null) {
      this.ballSpinAngle = advanceBallSpinAngle(this.ballSpinAngle,
        currentTime - this.ballSpinLastTime, this.ballSpinDirection, this.ballSpinRate);
    }
    this.ballSpinLastTime = currentTime;
    this.ballElement.dataset.speed = spinProfile.speedLevel;
    this.ballElement.dataset.spinning = String(spinProfile.enabled);
    this.ballElement.style.width = `${ballSize}px`;
    this.ballElement.style.height = `${ballSize}px`;
    this.ballArtwork.style.transform = `rotate(${this.ballSpinAngle}deg)`;
    this.ballElement.classList.toggle("is-net-finished", isNetFinished(snapshot));
    this.processEvents(snapshot);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.playerElements.clear();
    this.lastSnapshot = null;
  }

  clear() {
    for (const elements of this.playerElements.values()) elements.wrapper.hidden = true;
    this.ballElement.hidden = true;
    this.lastSnapshot = null;
  }
}
