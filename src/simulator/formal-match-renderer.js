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
  "ATTACK_STARTED", "BLOCK_RESULT",
  "RALLY_RESULT_LOCKED", "RALLY_ENDED",
]));

const BALL_SPIN_EVENTS = Object.freeze(new Set([
  "SERVE_CONTACT", "RECEIVE_OUTPUT", "RECEIVE_ERROR", "SET_RESULT",
  "ATTACK_STARTED", "BLOCK_RESULT", "RALLY_RESULT_LOCKED", "RALLY_ENDED",
]));

const GROUND_RESULT_REASONS = Object.freeze(new Set([
  "BALL_LANDED", "BALL_OUT", "SERVE_OUT", "RECEIVE_ERROR_LANDED",
  "SET_MISSED", "THIRD_TOUCH_MISSED",
]));

export function resolveBallFlightSegmentKey(snapshot) {
  const directionEventCount = (snapshot?.events ?? [])
    .filter((event) => BALL_DIRECTION_EVENTS.has(event.type)).length;
  return `${snapshot?.ballFlightId ?? 0}:${directionEventCount}`;
}

export function isBallSpinPhase(snapshot) {
  return resolveBallSpinProfile(snapshot).enabled;
}

export function resolveBallSpinDirection(horizontalVelocity, previousDirection = 0) {
  const epsilon = FORMAL_MATCH_VISUALS.ballSpin.horizontalSpeedEpsilon;
  return Math.abs(horizontalVelocity ?? 0) < epsilon
    ? previousDirection : Math.sign(horizontalVelocity);
}

export function resolveReceiveBallSpinRate(quality) {
  return FORMAL_MATCH_VISUALS.ballSpin.receiveQualityDegreesPerSecond[quality] ?? 0;
}

export function resolveGroundSpinRate(initialRate, elapsedSeconds) {
  const duration = FORMAL_MATCH_VISUALS.ballSpin.groundDecayDurationSeconds;
  if (!(initialRate > 0) || !(duration > 0)) return 0;
  return initialRate * Math.max(0, 1 - Math.max(0, elapsedSeconds) / duration);
}

export function resolveBallSpinProfile(snapshot, previous = {}) {
  const speedLevel = resolveDisplayedSpeed(snapshot);
  const spinEvent = [...(snapshot?.events ?? [])].reverse()
    .find((event) => BALL_SPIN_EVENTS.has(event.type));
  const startedAt = Number.isFinite(spinEvent?.time) ? spinEvent.time
    : snapshot?.simulationTime ?? 0;
  const fallbackDirection = previous.direction ?? 0;
  const eventVelocity = spinEvent?.outgoingVelocity ?? snapshot?.ballVelocity ?? {};
  const direction = resolveBallSpinDirection(eventVelocity.x, fallbackDirection);
  const base = { speedLevel, startedAt, eventType: spinEvent?.type ?? null, direction };
  if (["SERVE_CONTACT", "ATTACK_STARTED"].includes(spinEvent?.type)) {
    const actualSpeed = resolveActualBallSpeed(snapshot);
    return Object.freeze({ ...base, mode: "SPEED", enabled: direction !== 0,
      degreesPerSecond: resolveBallSpinRate(actualSpeed), actualSpeed });
  }
  if (spinEvent?.type === "RECEIVE_OUTPUT") {
    const degreesPerSecond = resolveReceiveBallSpinRate(spinEvent.quality);
    return Object.freeze({ ...base, mode: "RECEIVE", enabled: direction !== 0 && degreesPerSecond > 0,
      degreesPerSecond, quality: spinEvent.quality });
  }
  if (spinEvent?.type === "BLOCK_RESULT") {
    const degreesPerSecond = (previous.degreesPerSecond ?? 0)
      * FORMAL_MATCH_VISUALS.ballSpin.blockRetention;
    return Object.freeze({ ...base, mode: "BLOCK", enabled: direction !== 0 && degreesPerSecond > 0,
      degreesPerSecond });
  }
  if (spinEvent?.type === "RALLY_RESULT_LOCKED"
    && GROUND_RESULT_REASONS.has(spinEvent.reason)) {
    const initialRate = previous.groundInitialRate ?? previous.degreesPerSecond ?? 0;
    const elapsed = Math.max(0, (snapshot?.simulationTime ?? startedAt) - startedAt);
    const degreesPerSecond = resolveGroundSpinRate(initialRate, elapsed);
    return Object.freeze({ ...base, direction: fallbackDirection, mode: "GROUND_DECAY",
      enabled: fallbackDirection !== 0 && degreesPerSecond > 0, degreesPerSecond, initialRate });
  }
  return Object.freeze({ ...base, direction: fallbackDirection, mode: "STOP",
    enabled: false, degreesPerSecond: 0 });
}

export function advanceBallSpinAngle(angle, elapsedSeconds, direction, degreesPerSecond) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 || direction === 0) return angle;
  return angle + elapsedSeconds * degreesPerSecond * direction;
}

export function advanceGroundSpinAngle(angle, fromTime, toTime, direction, initialRate, startedAt) {
  if (!(toTime > fromTime) || direction === 0 || !(initialRate > 0)) return angle;
  const duration = FORMAL_MATCH_VISUALS.ballSpin.groundDecayDurationSeconds;
  const integralAt = (time) => {
    const elapsed = Math.max(0, Math.min(duration, time - startedAt));
    return initialRate * (elapsed - elapsed ** 2 / (2 * duration));
  };
  return angle + direction * (integralAt(toTime) - integralAt(fromTime));
}

export function isNetFinished(snapshot) {
  return snapshot?.status === "ENDED"
    && ["SERVE_NET", "ATTACK_NET"].includes(snapshot?.rallyResult?.reason);
}

export function updateBallTrailSamples(samples, snapshot) {
  const config = FORMAL_MATCH_VISUALS.ballTrail;
  const time = snapshot?.simulationTime;
  const ball = snapshot?.ball;
  if (!Number.isFinite(time) || !Number.isFinite(ball?.x)
    || !Number.isFinite(ball?.y) || !Number.isFinite(ball?.height)) return samples;
  const previous = samples.at(-1);
  const base = previous && time + 1e-10 < previous.time ? [] : samples;
  const last = base.at(-1);
  const sample = Object.freeze({ time, x: ball.x, y: ball.y, height: ball.height });
  let next = base;
  if (!last || time > last.time + 1e-10) {
    const distance = last ? Math.hypot(sample.x - last.x,
      (sample.y - sample.height) - (last.y - last.height)) : Infinity;
    if (distance >= config.minimumWorldDistance) next = [...base, sample];
  }
  return next.filter((entry) => entry.time >= time - config.durationSeconds - 1e-10);
}

export function resolvePlayerShadowVisual(jumpHeight = 0) {
  const config = FORMAL_MATCH_VISUALS.playerShadow;
  const ratio = Math.min(1, Math.max(0, jumpHeight) / config.maximumJumpHeight);
  return Object.freeze({
    scale: 1 - (1 - config.minimumScale) * ratio,
    opacity: config.maximumOpacity
      - (config.maximumOpacity - config.minimumOpacity) * ratio,
  });
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
    this.trailElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.trailElement.classList.add("formal-match-ball-trail");
    this.trailGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.trailElement.append(this.trailGroup);
    this.landingMarker = document.createElement("span");
    this.landingMarker.className = "formal-match-landing-marker";
    this.landingMarker.hidden = true;
    this.worldElement.insertBefore(this.trailElement, this.ballElement);
    this.worldElement.insertBefore(this.landingMarker, this.ballElement);
    this.playerElements = new Map();
    this.processedEvents = 0;
    this.rallyNumber = null;
    this.ballFlightSegmentKey = null;
    this.ballSpinAngle = 0;
    this.ballSpinDirection = 0;
    this.ballSpinRate = 0;
    this.ballSpinLastTime = null;
    this.ballSpinMode = "STOP";
    this.ballSpinGroundInitialRate = 0;
    this.ballTrailSamples = [];
    this.landingMarkerKey = null;
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
    this.ballSpinMode = "STOP";
    this.ballSpinGroundInitialRate = 0;
    this.ballTrailSamples = [];
    this.trailGroup.replaceChildren();
    this.landingMarkerKey = null;
    this.landingMarker.hidden = true;
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
    const shadow = document.createElement("span");
    shadow.className = "formal-match-player__shadow";
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
    wrapper.append(shadow, impact);
    this.worldElement.append(wrapper);
    elements = { wrapper, shadow, impact, motion, avatar, fallback, image };
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
      const jumpHeight = Math.max(0, player.jumpHeight ?? 0);
      const shadowConfig = FORMAL_MATCH_VISUALS.playerShadow;
      const shadowVisual = resolvePlayerShadowVisual(jumpHeight);
      elements.shadow.style.width = `${avatarSize * shadowConfig.widthScale}px`;
      elements.shadow.style.height = `${avatarSize * shadowConfig.heightScale}px`;
      elements.shadow.style.setProperty("--player-shadow-offset", `${avatarSize * 0.42}px`);
      elements.shadow.style.setProperty("--player-shadow-scale", String(shadowVisual.scale));
      elements.shadow.style.opacity = String(shadowVisual.opacity);
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
    this.ballTrailSamples = updateBallTrailSamples(this.ballTrailSamples, snapshot);
    this.renderBallTrail(world);
    this.renderLandingMarker(snapshot, ballSize);
    const segmentKey = resolveBallFlightSegmentKey(snapshot);
    const spinProfile = resolveBallSpinProfile(snapshot, {
      direction: this.ballSpinDirection,
      degreesPerSecond: this.ballSpinRate,
      groundInitialRate: this.ballSpinGroundInitialRate,
    });
    if (segmentKey !== this.ballFlightSegmentKey) {
      this.ballFlightSegmentKey = segmentKey;
      this.ballSpinDirection = spinProfile.direction;
      this.ballSpinRate = spinProfile.degreesPerSecond;
      this.ballSpinMode = spinProfile.mode;
      this.ballSpinGroundInitialRate = spinProfile.mode === "GROUND_DECAY"
        ? spinProfile.initialRate : 0;
      this.ballSpinLastTime = spinProfile.startedAt ?? snapshot.simulationTime;
    }
    if (spinProfile.mode === "SPEED" || spinProfile.mode === "GROUND_DECAY") {
      this.ballSpinRate = spinProfile.degreesPerSecond;
    }
    const currentTime = snapshot.simulationTime ?? this.ballSpinLastTime ?? 0;
    if (spinProfile.enabled && this.ballSpinLastTime !== null) {
      this.ballSpinAngle = spinProfile.mode === "GROUND_DECAY"
        ? advanceGroundSpinAngle(this.ballSpinAngle, this.ballSpinLastTime, currentTime,
          this.ballSpinDirection, this.ballSpinGroundInitialRate, spinProfile.startedAt)
        : advanceBallSpinAngle(this.ballSpinAngle,
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
    this.landingMarker.hidden = true;
    this.ballTrailSamples = [];
    this.trailGroup.replaceChildren();
    this.lastSnapshot = null;
  }

  renderBallTrail(world) {
    this.trailElement.setAttribute("viewBox", `0 0 ${world.width} ${world.height}`);
    const config = FORMAL_MATCH_VISUALS.ballTrail;
    const segments = [];
    const count = Math.max(1, this.ballTrailSamples.length - 1);
    for (let index = 1; index < this.ballTrailSamples.length; index += 1) {
      const from = this.ballTrailSamples[index - 1];
      const to = this.ballTrailSamples[index];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(from.x));
      line.setAttribute("y1", String(from.y - from.height));
      line.setAttribute("x2", String(to.x));
      line.setAttribute("y2", String(to.y - to.height));
      const progress = index / count;
      line.style.opacity = String(config.minimumOpacity
        + (config.maximumOpacity - config.minimumOpacity) * progress);
      segments.push(line);
    }
    this.trailGroup.replaceChildren(...segments);
  }

  renderLandingMarker(snapshot, ballSize) {
    const point = snapshot.actualLandingPoint;
    if (!point) return;
    const key = `${point.rallySeed ?? snapshot.seed}:${point.time ?? "legacy"}`;
    this.landingMarker.hidden = false;
    this.landingMarker.style.left = `${point.x / snapshot.world.width * 100}%`;
    this.landingMarker.style.top = `${point.y / snapshot.world.height * 100}%`;
    const size = ballSize * FORMAL_MATCH_VISUALS.landingMarker.ballSizeScale;
    this.landingMarker.style.width = `${size}px`;
    this.landingMarker.style.height = `${size}px`;
    if (key !== this.landingMarkerKey) {
      this.landingMarkerKey = key;
      this.landingMarker.classList.remove("is-new");
      void this.landingMarker.offsetWidth;
      this.landingMarker.classList.add("is-new");
    }
  }
}
