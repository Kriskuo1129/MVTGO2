import { createSimulatorBall, launchSimulatorBall, sampleSimulatorBall, stepSimulatorBall } from "./ball.js";
import { createAttackContactGeometry, detectAttackContact } from "./attack-contact.js";
import { ATTACK_MOTION_V1, createAttackMotion, getAttackStrikeWindow, updateAttackMotion } from "./attack-motion.js";
import { createSeededRandom } from "./attack-quality.js";
import { resolveAttackOutput } from "./attack-resolution.js";
import { createReceiveContactGeometry, createSetContactGeometry, detectSimulatorContact } from "./contact-detection.js";
import { createNaturalPredictionBall, createTargetedNaturalSpikeLaunch, getGroundContactFraction,
  NATURAL_SPIKE_PHYSICS_V1, sampleNaturalStep } from "./natural-spike-flight.js";
import { createSimulatorPlayer, decideChaseTarget, predictReachableContact, stepSimulatorPlayer } from "./player-agent.js";
import { PASS_TARGET_ZONES_V1, createPassTargetZones, samplePassTarget } from "./pass-target-zones.js";
import { createReceiveErrorTrajectory, RECEIVE_RESULTS, resolveReceiveContact } from "./receive-quality.js";
import { getReceiveSpeedProfile } from "./receive-animation.js";
import { SIMULATOR_CONTACT_ANCHOR_DISTANCE, SIMULATOR_FIXED_STEP, SIMULATOR_MAX_FRAME_DELTA,
  SIMULATOR_MAXIMUM_CONTACT_HEIGHT, SIMULATOR_WORLD, validateSimulatorParameters } from "./simulator.js";
import { SPIKE_COURT_V1, isSpikeGroundIn } from "./spike-court.js";
import { sweepSpikeNet } from "./spike-flight.js";
import { TEAM_RECEIVE_FORMATION, TEAM_SET_CONTACT_GEOMETRY, TEAM_SIMULATOR_AVATAR_SIZE,
  TEAM_SIMULATOR_BALL_DISPLAY_SIZE, TEAM_SIMULATOR_PARAMETERS } from "./team-simulator.js";
import { assignPrimaryReceiver } from "./team-coordination.js";
import { ATTACK_MOVEMENT_PHASES, stepAttackAssignment } from "./attack-assignment.js";
import { DEFAULT_ATTACK_POSITIONS } from "./attack-positions.js";

export const RALLY_TEAMS = Object.freeze({ HOME: "HOME", AWAY: "AWAY" });
export const RALLY_PHASES = Object.freeze({ SERVE: "SERVE", RECEIVE: "RECEIVE", SET: "SET",
  ATTACK: "ATTACK", ATTACK_FLIGHT: "ATTACK_FLIGHT", FINISHING: "FINISHING", ENDED: "ENDED" });

const FINISHING_HOLD_DURATION = 0.35;
const FINISHING_MAX_DURATION = 3;

const mirrorX = (x) => SIMULATOR_WORLD.width - x;
const opposite = (team) => team === RALLY_TEAMS.HOME ? RALLY_TEAMS.AWAY : RALLY_TEAMS.HOME;
const zonesRight = createPassTargetZones(PASS_TARGET_ZONES_V1, SIMULATOR_WORLD);
const mirrorRect = (r) => ({ minX: mirrorX(r.maxX), maxX: mirrorX(r.minX), minY: r.minY, maxY: r.maxY });
const zonesLeft = createPassTargetZones({ perfect: mirrorRect(PASS_TARGET_ZONES_V1.perfect),
  normalOuter: mirrorRect(PASS_TARGET_ZONES_V1.normalOuter),
  bad: { minX: -160, maxX: -20, minY: PASS_TARGET_ZONES_V1.bad.minY, maxY: PASS_TARGET_ZONES_V1.bad.maxY } }, SIMULATOR_WORLD);
const defaultAttackPosition = DEFAULT_ATTACK_POSITIONS.entries.find((entry) => entry.playerSlot === "OH1");

function getAttackPositions(team) {
  const map = (point) => team === RALLY_TEAMS.AWAY ? { ...point } : { x: mirrorX(point.x), y: point.y };
  return Object.freeze({ readyPosition: Object.freeze(map(defaultAttackPosition.readyPosition)),
    attackPosition: Object.freeze(map(defaultAttackPosition.attackPosition)) });
}

function isOpponentGroundIn(point, radius, attackingTeam) {
  return isSpikeGroundIn(attackingTeam === RALLY_TEAMS.AWAY ? point
    : { ...point, x: mirrorX(point.x) }, radius, SPIKE_COURT_V1);
}

function createTeam(team, parameters) {
  return TEAM_RECEIVE_FORMATION.map((entry, index) => {
    const rightSide = team === RALLY_TEAMS.AWAY;
    return Object.assign(createSimulatorPlayer({ ...entry, id: `${team}-${entry.position}`,
      x: rightSide ? entry.x : mirrorX(entry.x), moveSpeed: parameters.playerSpeed }), {
      team, receiveAbility: entry.receiveAbility, morale: entry.morale,
      attack: index === 1 ? 75 : 60, attackConsistency: index === 1 ? 75 : 60,
      responsibility: "HOLD", touchEligible: false, receivePreparationTime: 0,
    });
  });
}

export class ContinuousRallySimulator {
  constructor({ parameters = TEAM_SIMULATOR_PARAMETERS, fixedStep = SIMULATOR_FIXED_STEP,
    seed = 2 } = {}) {
    this.fixedStep = fixedStep;
    this.seed = seed >>> 0;
    this.parameters = validateSimulatorParameters(parameters);
    this.reset();
  }

  configure(parameters) { this.parameters = validateSimulatorParameters({ ...this.parameters, ...parameters }); this.reset(); }
  reset() {
    this.accumulator = 0; this.simulationTime = 0; this.status = "READY";
    this.rallyPhase = RALLY_PHASES.SERVE; this.events = []; this.rallyResult = null;
    this.ball = createSimulatorBall({ x: 250, y: 450, height: 72 });
    this.players = [...createTeam(RALLY_TEAMS.HOME, this.parameters), ...createTeam(RALLY_TEAMS.AWAY, this.parameters)];
    this.activeTeam = RALLY_TEAMS.AWAY; this.lastTouchTeam = RALLY_TEAMS.HOME;
    this.teamTouches = { HOME: 0, AWAY: 0 }; this.lastTouchPlayerId = null;
    this.primaryReceiverId = null; this.receiveOutcome = null; this.receiveQualityResult = null;
    this.secondTouchPlayerId = null; this.attackPlayerId = null; this.naturalVelocity = null;
    this.setPrediction = null; this.setContactDiagnostic = null;
    this.motion = null; this.attackGeometry = null; this.attackAssignment = null;
    this.secondTouchResult = null; this.thirdTouchResult = null; this.attackResolution = null;
    this.actualLandingPoint = null; this.random = createSeededRandom(this.seed);
    this.finishing = null;
    this.receiveGeometry = createReceiveContactGeometry({ avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
      avatarContactScale: 0.78, ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE,
      minimumOverlapDepth: 10, contactTolerance: 10 });
  }

  launch(target) {
    this.reset();
    launchSimulatorBall(this.ball, { start: { x: 250, y: 450, height: 72 },
      target: { x: target.x, y: target.y, height: 0 }, duration: this.parameters.flightDuration,
      arcHeight: getReceiveSpeedProfile(this.parameters.flightDuration).arcHeight });
    this.status = "RUNNING"; this.rallyPhase = RALLY_PHASES.RECEIVE;
    this.events.push(Object.freeze({ type: "SERVE_STARTED", time: 0, team: RALLY_TEAMS.HOME }));
    this.prepareReceive(RALLY_TEAMS.AWAY);
  }

  teamPlayers(team) { return this.players.filter((player) => player.team === team); }
  player(id) { return this.players.find((player) => player.id === id) ?? null; }

  prepareReceive(team) {
    this.activeTeam = team; this.teamTouches[team] = 0; this.receiveOutcome = null; this.receiveQualityResult = null;
    const candidates = this.teamPlayers(team).filter((player) => player.position !== "S");
    const assignment = assignPrimaryReceiver({ ball: this.ball, players: candidates,
      contactRange: this.parameters.contactRange, contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
      maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT, sampleStep: 1 / 60,
      contactGeometry: this.receiveGeometry });
    this.primaryReceiverId = assignment?.playerId ?? null;
    this.secondTouchResult = null; this.thirdTouchResult = null;
    for (const player of this.teamPlayers(team)) {
      player.touchEligible = player.id === this.primaryReceiverId;
      player.responsibility = player.touchEligible ? "PRIMARY" : "HOLD";
      player.action = player.touchEligible ? "CHASE" : "IDLE";
    }
    if (assignment) decideChaseTarget(this.player(assignment.playerId), assignment.prediction);
    const setter = this.teamPlayers(team).find((player) => player.position === "S");
    const zones = team === RALLY_TEAMS.AWAY ? zonesRight : zonesLeft;
    decideChaseTarget(setter, { x: (zones.perfect.minX + zones.perfect.maxX) / 2,
      y: (zones.perfect.minY + zones.perfect.maxY) / 2 });
    setter.action = "SET_PREPARE";
    this.rallyPhase = RALLY_PHASES.RECEIVE;
    this.events.push(Object.freeze({ type: "RECEIVE_PHASE_STARTED", time: this.simulationTime,
      team, playerId: this.primaryReceiverId }));
  }

  recordTouch(player, type) {
    if (player.team !== this.activeTeam) return this.endRally("WRONG_TEAM_TOUCH", opposite(player.team));
    if (this.lastTouchPlayerId === player.id) return this.endRally("ILLEGAL_CONSECUTIVE_TOUCH", opposite(player.team));
    this.teamTouches[player.team] += 1;
    if (this.teamTouches[player.team] > 3) return this.endRally("FOUR_TOUCHES", opposite(player.team));
    this.lastTouchPlayerId = player.id; this.lastTouchTeam = player.team;
    this.events.push(Object.freeze({ type, time: this.simulationTime, team: player.team,
      playerId: player.id, touchNumber: this.teamTouches[player.team] }));
    return true;
  }

  stepReceive() {
    const player = this.player(this.primaryReceiverId);
    const setter = this.teamPlayers(this.activeTeam).find((candidate) => candidate.position === "S");
    if (player) {
      const prediction = predictReachableContact({ ball: this.ball, player,
        contactRange: this.parameters.contactRange, contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
        maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT, sampleStep: 1 / 60,
        contactGeometry: this.receiveGeometry });
      decideChaseTarget(player, prediction);
    }
    const previousBall = { ...this.ball }, previousPlayer = player ? { ...player } : null;
    this.simulationTime += this.fixedStep; stepSimulatorBall(this.ball, this.fixedStep);
    if (player) stepSimulatorPlayer(player, this.fixedStep);
    if (setter && setter.id !== player?.id) stepSimulatorPlayer(setter, this.fixedStep);
    const contact = player ? detectSimulatorContact({ previousBall, currentBall: this.ball,
      previousPlayer, currentPlayer: player, contactRange: this.parameters.contactRange,
      contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
      maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT, contactGeometry: this.receiveGeometry }) : null;
    if (contact?.contacted) {
      Object.assign(this.ball, { x: contact.ballX, y: contact.ballY, height: contact.ballHeight,
        inFlight: false, landed: false });
      Object.assign(player, { x: contact.playerX, y: contact.playerY, action: "RECEIVE",
        receiveDirection: contact.direction, isMoving: false });
      if (!this.recordTouch(player, "RECEIVE_TOUCH")) return;
      const incomingVelocity = { x: (contact.ballX - previousBall.x) / this.fixedStep,
        y: (contact.ballY - previousBall.y) / this.fixedStep };
      this.receiveOutcome = resolveReceiveContact({ contacted: true,
        receiveAbility: player.receiveAbility,
        incomingSpeedLevel: this.ball.speedLevel ?? getReceiveSpeedProfile(this.parameters.flightDuration).level,
        positionDistance: Math.hypot(player.x - player.targetX, player.y - player.targetY),
        idealRange: this.parameters.contactRange, preparationTime: player.receivePreparationTime,
        morale: player.morale, random: this.random });
      if (this.receiveOutcome.result === RECEIVE_RESULTS.ERROR) {
        const error = createReceiveErrorTrajectory({ start: { x: this.ball.x, y: this.ball.y, height: this.ball.height },
          incomingVelocity, random: this.random });
        launchSimulatorBall(this.ball, error); this.rallyPhase = "ERROR_FLIGHT";
        this.events.push(Object.freeze({ type: "RECEIVE_ERROR", time: this.simulationTime,
          team: player.team, playerId: player.id, trajectory: error }));
        return;
      }
      this.receiveQualityResult = this.receiveOutcome.qualityResult;
      this.prepareAttackReady(player.team);
      const zones = player.team === RALLY_TEAMS.AWAY ? zonesRight : zonesLeft;
      const target = samplePassTarget(zones, this.receiveOutcome.quality, this.random);
      launchSimulatorBall(this.ball, { start: { x: this.ball.x, y: this.ball.y, height: this.ball.height },
        target, duration: this.receiveOutcome.quality === "PERFECT" ? 1.1 : 1.3,
        arcHeight: this.receiveOutcome.quality === "PERFECT" ? 160 : 210 });
      this.prepareSet(player.team); return;
    }
    if (this.ball.landed) {
      if (this.attackResolution) {
        const point = { x: this.ball.x, y: this.ball.y };
        const inBounds = isOpponentGroundIn(point,
          TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2, this.lastTouchTeam);
        this.actualLandingPoint = Object.freeze({ ...point, inBounds });
        this.endRally(inBounds ? "BALL_LANDED" : "BALL_OUT",
          inBounds ? this.lastTouchTeam : opposite(this.lastTouchTeam));
      } else {
        this.endRally("BALL_LANDED", opposite(this.activeTeam));
      }
    }
  }

  prepareSet(team) {
    const setter = this.teamPlayers(team).find((player) => player.position === "S");
    this.secondTouchPlayerId = setter.id; setter.touchEligible = true; setter.action = "CHASE";
    this.setPrediction = null; this.setContactDiagnostic = null;
    this.rallyPhase = RALLY_PHASES.SET;
  }

  stepSet() {
    const player = this.player(this.secondTouchPlayerId);
    const prediction = predictReachableContact({ ball: this.ball, player,
      contactRange: this.parameters.contactRange, contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
      maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT, sampleStep: 1 / 60,
      contactGeometry: TEAM_SET_CONTACT_GEOMETRY });
    this.setPrediction = Object.freeze({ ...prediction, team: player.team,
      playerId: player.id, receiveQuality: this.receiveOutcome?.quality ?? null });
    decideChaseTarget(player, prediction);
    const previousBall = { ...this.ball }, previousPlayer = { ...player };
    this.simulationTime += this.fixedStep; stepSimulatorBall(this.ball, this.fixedStep); stepSimulatorPlayer(player, this.fixedStep);
    const attacker = this.player(this.attackPlayerId);
    if (attacker && this.attackAssignment) stepAttackAssignment(this.attackAssignment, attacker,
      this.simulationTime, this.fixedStep);
    const contact = detectSimulatorContact({ previousBall, currentBall: this.ball, previousPlayer, currentPlayer: player,
      contactRange: this.parameters.contactRange, contactAnchorDistance: SIMULATOR_CONTACT_ANCHOR_DISTANCE,
      maximumContactHeight: SIMULATOR_MAXIMUM_CONTACT_HEIGHT, contactGeometry: TEAM_SET_CONTACT_GEOMETRY });
    const horizontalOffset = contact.horizontalOffset ?? null;
    const verticalOffset = contact.verticalOffset ?? null;
    const normalizedDistance = Number.isFinite(horizontalOffset) && Number.isFinite(verticalOffset)
      ? Math.hypot(horizontalOffset / TEAM_SET_CONTACT_GEOMETRY.horizontalTolerance,
        verticalOffset / TEAM_SET_CONTACT_GEOMETRY.verticalTolerance) : null;
    this.setContactDiagnostic = Object.freeze({
      seed: this.seed, team: player.team, receiveQuality: this.receiveOutcome?.quality ?? null,
      playerId: player.id, playerX: player.x, playerY: player.y,
      targetX: player.targetX, targetY: player.targetY,
      prediction: this.setPrediction,
      ballX: this.ball.x, ballY: this.ball.y, ballHeight: this.ball.height,
      remainingTime: Math.max(0, this.ball.duration - this.ball.elapsed),
      descending: this.ball.height < previousBall.height - Number.EPSILON,
      horizontalOffset, verticalOffset, normalizedDistance,
      horizontalTolerance: TEAM_SET_CONTACT_GEOMETRY.horizontalTolerance,
      verticalTolerance: TEAM_SET_CONTACT_GEOMETRY.verticalTolerance,
      contacted: contact.contacted,
    });
    if (contact.contacted) {
      Object.assign(this.ball, { x: contact.ballX, y: contact.ballY, height: contact.ballHeight, inFlight: false });
      Object.assign(player, { x: contact.playerX, y: contact.playerY, action: "SET", isMoving: false });
      if (!this.recordTouch(player, "SECOND_TOUCH")) return;
      this.secondTouchResult = Object.freeze({ success: true, playerId: player.id,
        time: this.simulationTime, ballX: contact.ballX, ballY: contact.ballY,
        ballHeight: contact.ballHeight, centerDistance: contact.centerDistance,
        effectiveAvatarRadius: contact.effectiveAvatarRadius, ballRadius: contact.ballRadius,
        overlapDepth: contact.overlapDepth });
      player.actionUntil = this.simulationTime + 0.35;
      this.prepareAttack(player.team); return;
    }
    if (this.ball.landed) {
      const missReason = !this.setPrediction?.reachable ? "SETTER_UNREACHABLE"
        : normalizedDistance !== null && normalizedDistance > 1 ? "OUTSIDE_SET_GEOMETRY"
          : contact.reason ?? "NO_SWEPT_CONTACT";
      this.secondTouchResult = Object.freeze({ success: false, reason: missReason,
        playerId: player.id, team: player.team, time: this.simulationTime,
        ballX: this.ball.x, ballY: this.ball.y, ballHeight: this.ball.height,
        diagnostic: this.setContactDiagnostic });
      this.events.push(Object.freeze({ type: "SET_MISSED", time: this.simulationTime,
        team: player.team, playerId: player.id, reason: missReason }));
      this.endRally("SET_MISSED", opposite(player.team));
    }
  }

  prepareAttackReady(team) {
    const attacker = this.teamPlayers(team).find((player) => player.position === "OH1");
    const positions = getAttackPositions(team);
    this.attackPlayerId = attacker.id;
    this.attackAssignment = { assignedPlayerId: attacker.id, ...positions,
      movementPhase: ATTACK_MOVEMENT_PHASES.MOVING_TO_READY, movementBlockedUntil: 0 };
    attacker.targetX = positions.readyPosition.x; attacker.targetY = positions.readyPosition.y;
    attacker.action = "MOVE";
  }

  prepareAttack(team) {
    const attacker = this.teamPlayers(team).find((player) => player.position === "OH1");
    this.attackPlayerId = attacker.id;
    const positions = getAttackPositions(team);
    this.attackAssignment ??= { assignedPlayerId: attacker.id, ...positions,
      movementPhase: ATTACK_MOVEMENT_PHASES.MOVING_TO_READY, movementBlockedUntil: 0 };
    this.attackAssignment.movementPhase = ATTACK_MOVEMENT_PHASES.MOVING_TO_ATTACK;
    attacker.targetX = this.attackAssignment.attackPosition.x;
    attacker.targetY = this.attackAssignment.attackPosition.y;
    const direction = team === RALLY_TEAMS.HOME ? "RIGHT" : "LEFT";
    this.attackGeometry = createAttackContactGeometry({ avatarWorldSize: TEAM_SIMULATOR_AVATAR_SIZE,
      ballWorldSize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE, contactHeight: 180, direction });
    const targetX = this.attackAssignment.attackPosition.x + this.attackGeometry.offset.x;
    const targetHeight = 180 + ATTACK_MOTION_V1.maximumHeight;
    const targetY = this.attackAssignment.attackPosition.y + this.attackGeometry.offset.y + 180;
    launchSimulatorBall(this.ball, { start: { x: this.ball.x, y: this.ball.y, height: this.ball.height },
      target: { x: targetX, y: targetY, height: targetHeight }, duration: 1.5, arcHeight: 360 });
    this.motion = createAttackMotion({ playerId: attacker.id, simulationTime: this.simulationTime,
      predictedContactTime: this.simulationTime + 1.5, parameters: { ...ATTACK_MOTION_V1, direction } });
    this.rallyPhase = RALLY_PHASES.ATTACK;
  }

  stepAttack() {
    const player = this.player(this.attackPlayerId), previousBall = { ...this.ball }, previousPlayer = { ...player };
    this.simulationTime += this.fixedStep; stepSimulatorBall(this.ball, this.fixedStep);
    stepAttackAssignment(this.attackAssignment, player, this.simulationTime, this.fixedStep);
    if (this.motion.startedAt === null && this.simulationTime + 1e-10 >= this.motion.scheduledTakeoffTime
      && Math.hypot(player.x - this.attackAssignment.attackPosition.x,
        player.y - this.attackAssignment.attackPosition.y) <= 0.0001) {
      this.motion.startedAt = this.simulationTime;
      this.events.push(Object.freeze({ type: "ATTACK_JUMP_STARTED", time: this.simulationTime,
        team: player.team, playerId: player.id, x: player.x, y: player.y }));
    }
    updateAttackMotion(this.motion, player, this.simulationTime);
    const strikeWindow = getAttackStrikeWindow(this.motion, this.simulationTime - this.fixedStep, this.simulationTime);
    const contact = detectAttackContact({ previousBall, currentBall: this.ball, previousPlayer, currentPlayer: player,
      assignedPlayerId: player.id, flightStatus: "IN_PLAY", geometry: this.attackGeometry, strikeWindow });
    if (contact.contacted) {
      Object.assign(this.ball, { x: contact.ballX, y: contact.ballY, height: contact.ballHeight, inFlight: true });
      if (!this.recordTouch(player, "THIRD_TOUCH")) return;
      const resolution = resolveAttackOutput({ attack: player.attack, attackConsistency: player.attackConsistency,
        setQuality: this.receiveQualityResult.quality, seed: Math.floor(this.random() * 0x100000000), court: SPIKE_COURT_V1 });
      const target = player.team === RALLY_TEAMS.AWAY ? resolution.targetPoint
        : { x: mirrorX(resolution.targetPoint.x), y: resolution.targetPoint.y };
      this.attackResolution = Object.freeze({ ...resolution, targetPoint: Object.freeze(target) });
      this.actualLandingPoint = null;
      this.thirdTouchResult = Object.freeze({ success: true, playerId: player.id,
        time: this.simulationTime, ballX: contact.ballX, ballY: contact.ballY,
        ballHeight: contact.ballHeight, overlapDepth: contact.overlapDepth,
        playerJumpHeight: contact.playerJumpHeight, jumpPhase: "SWING",
        rotationAngle: this.motion.rotationAngle });
      const launch = createTargetedNaturalSpikeLaunch({ start: { x: this.ball.x, y: this.ball.y, height: this.ball.height },
        target, speedLevel: resolution.speedLevel, radius: TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2 });
      this.naturalVelocity = { ...launch.velocity }; this.ball.speedLevel = resolution.speedLevel;
      this.rallyPhase = RALLY_PHASES.ATTACK_FLIGHT;
      this.events.push(Object.freeze({ type: "ATTACK_STARTED", time: this.simulationTime,
        team: player.team, playerId: player.id, resolution: this.attackResolution })); return;
    }
    if (this.ball.landed) this.endRally("THIRD_TOUCH_MISSED", opposite(player.team));
  }

  stepAttackFlight() {
    const previous = { ...this.ball }, velocity = { ...this.naturalVelocity };
    const next = sampleNaturalStep(previous, velocity, this.fixedStep);
    const segment = createSimulatorBall(previous);
    launchSimulatorBall(segment, { start: previous, target: { x: next.x, y: next.y, height: next.height },
      duration: this.fixedStep, arcHeight: NATURAL_SPIKE_PHYSICS_V1.gravity * this.fixedStep ** 2 / 8 });
    const net = sweepSpikeNet(segment, 0, 1, TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2, SPIKE_COURT_V1);
    const ground = getGroundContactFraction(previous, velocity, this.fixedStep,
      TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2, NATURAL_SPIKE_PHYSICS_V1.gravity);
    this.simulationTime += this.fixedStep;
    const attacker = this.player(this.attackPlayerId);
    if (attacker && this.motion?.startedAt !== null
      && this.motion.jumpPhase !== "LANDED") updateAttackMotion(this.motion, attacker, this.simulationTime);
    if (net !== null) return this.endRally("ATTACK_NET", opposite(this.lastTouchTeam));
    if (ground !== null) {
      const point = sampleNaturalStep(previous, velocity, ground * this.fixedStep);
      Object.assign(this.ball, { x: point.x, y: point.y, height: TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2 });
      const inBounds = isOpponentGroundIn(point, TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2, this.lastTouchTeam);
      this.actualLandingPoint = Object.freeze({ x: point.x, y: point.y, inBounds });
      return this.endRally(inBounds ? "BALL_LANDED" : "BALL_OUT",
        inBounds ? this.lastTouchTeam : opposite(this.lastTouchTeam),
        { groundContact: true, impactVelocity: point.velocity });
    }
    Object.assign(this.ball, { x: next.x, y: next.y, height: next.height, inFlight: true });
    Object.assign(this.naturalVelocity, next.velocity);
    const crossed = this.lastTouchTeam === RALLY_TEAMS.HOME
      ? previous.x < SPIKE_COURT_V1.netX && next.x >= SPIKE_COURT_V1.netX
      : previous.x > SPIKE_COURT_V1.netX && next.x <= SPIKE_COURT_V1.netX;
    if (crossed) {
      const receiving = opposite(this.lastTouchTeam);
      const prediction = createNaturalPredictionBall(next, next.velocity,
        TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2);
      Object.assign(this.ball, prediction);
      this.prepareReceive(receiving);
    }
  }

  stepErrorFlight() {
    this.simulationTime += this.fixedStep; stepSimulatorBall(this.ball, this.fixedStep);
    if (this.ball.landed) this.endRally("RECEIVE_ERROR_LANDED", opposite(this.activeTeam));
  }

  getCurrentBallVelocity() {
    if (!(this.ball.duration > 0)) return { x: 0, y: 0, height: 0 };
    const progress = Math.max(0, Math.min(1, this.ball.progress));
    return {
      x: (this.ball.target.x - this.ball.start.x) / this.ball.duration,
      y: (this.ball.target.y - this.ball.start.y) / this.ball.duration,
      height: (this.ball.target.height - this.ball.start.height) / this.ball.duration
        + 4 * this.ball.arcHeight * (1 - 2 * progress) / this.ball.duration,
    };
  }

  endRally(reason, scoringTeam, { groundContact = false, impactVelocity = null } = {}) {
    if (this.status === "FINISHING" || this.status === "ENDED") return this.rallyResult;
    const radius = TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2;
    const landed = groundContact || this.ball.landed || ["BALL_LANDED", "BALL_OUT",
      "RECEIVE_ERROR_LANDED", "SET_MISSED", "THIRD_TOUCH_MISSED"].includes(reason);
    const incoming = impactVelocity ?? this.getCurrentBallVelocity();
    const rebound = landed
      ? Math.abs(incoming.height) * NATURAL_SPIKE_PHYSICS_V1.verticalRestitution : 0;
    this.rallyPhase = RALLY_PHASES.FINISHING; this.status = "FINISHING";
    this.rallyResult = Object.freeze({ reason, scoringTeam, time: this.simulationTime });
    this.finishing = {
      state: landed ? "BOUNCING" : "HOLDING",
      elapsed: 0,
      bounceCount: 0,
      grounded: landed && rebound < NATURAL_SPIKE_PHYSICS_V1.minimumBounceSpeed,
      velocity: {
        x: landed ? incoming.x * NATURAL_SPIKE_PHYSICS_V1.horizontalBounceRetention : 0,
        y: landed ? incoming.y * NATURAL_SPIKE_PHYSICS_V1.horizontalBounceRetention : 0,
        height: landed && rebound >= NATURAL_SPIKE_PHYSICS_V1.minimumBounceSpeed ? rebound : 0,
      },
    };
    Object.assign(this.ball, { height: landed ? radius : this.ball.height,
      inFlight: landed, landed });
    this.events.push(Object.freeze({ type: "RALLY_RESULT_LOCKED", ...this.rallyResult }));
    return this.rallyResult;
  }

  completeFinishing() {
    const finishedBounce = this.finishing.state === "BOUNCING";
    this.status = "ENDED"; this.rallyPhase = RALLY_PHASES.ENDED;
    this.ball.inFlight = false;
    if (finishedBounce) this.ball.landed = true;
    this.finishing.state = "REST";
    this.events.push(Object.freeze({ type: "RALLY_ENDED", reason: this.rallyResult.reason,
      scoringTeam: this.rallyResult.scoringTeam, time: this.simulationTime }));
  }

  stepFinishing() {
    const state = this.finishing;
    this.simulationTime += this.fixedStep; state.elapsed += this.fixedStep;
    const motionPlayer = this.player(this.motion?.playerId);
    if (motionPlayer && this.motion.startedAt !== null && this.motion.jumpPhase !== "LANDED") {
      updateAttackMotion(this.motion, motionPlayer, this.simulationTime);
    }
    if (state.state === "HOLDING") {
      if (state.elapsed >= FINISHING_HOLD_DURATION
        && (!this.motion || this.motion.startedAt === null || this.motion.jumpPhase === "LANDED")) {
        this.completeFinishing();
      } else if (state.elapsed >= FINISHING_MAX_DURATION) this.completeFinishing();
      return;
    }
    const damping = Math.exp(-NATURAL_SPIKE_PHYSICS_V1.horizontalDampingPerSecond * this.fixedStep);
    state.velocity.x *= damping; state.velocity.y *= damping;
    if (state.grounded) {
      this.ball.x += state.velocity.x * this.fixedStep;
      this.ball.y += state.velocity.y * this.fixedStep;
      if (Math.hypot(state.velocity.x, state.velocity.y) <= NATURAL_SPIKE_PHYSICS_V1.restHorizontalSpeed
        || state.elapsed >= FINISHING_MAX_DURATION) this.completeFinishing();
      return;
    }
    const previous = { x: this.ball.x, y: this.ball.y, height: this.ball.height };
    const velocity = { ...state.velocity };
    const next = sampleNaturalStep(previous, velocity, this.fixedStep);
    const radius = TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2;
    const fraction = previous.height <= radius + 1e-9 && velocity.height > 0 ? null
      : getGroundContactFraction(previous, velocity, this.fixedStep,
        radius, NATURAL_SPIKE_PHYSICS_V1.gravity);
    if (fraction !== null) {
      const point = sampleNaturalStep(previous, velocity, fraction * this.fixedStep);
      state.bounceCount += 1;
      state.velocity.x = point.velocity.x * NATURAL_SPIKE_PHYSICS_V1.horizontalBounceRetention;
      state.velocity.y = point.velocity.y * NATURAL_SPIKE_PHYSICS_V1.horizontalBounceRetention;
      const rebound = Math.abs(point.velocity.height) * NATURAL_SPIKE_PHYSICS_V1.verticalRestitution;
      state.velocity.height = rebound >= NATURAL_SPIKE_PHYSICS_V1.minimumBounceSpeed ? rebound : 0;
      state.grounded = state.velocity.height === 0;
      Object.assign(this.ball, { x: point.x, y: point.y,
        height: TEAM_SIMULATOR_BALL_DISPLAY_SIZE / 2, inFlight: true, landed: true });
      this.events.push(Object.freeze({ type: "FINISHING_BOUNCE", time: this.simulationTime,
        bounceCount: state.bounceCount }));
      return;
    }
    Object.assign(this.ball, { x: next.x, y: next.y, height: next.height,
      inFlight: true, landed: false });
    Object.assign(state.velocity, next.velocity);
  }

  stepFixed() {
    if (this.status === "FINISHING") { this.stepFinishing(); return; }
    if (this.status !== "RUNNING") return;
    for (const player of this.players) {
      if (player.actionUntil && this.simulationTime >= player.actionUntil) {
        player.actionUntil = null;
        if (player.action === "SET") player.action = "IDLE";
      }
    }
    if (this.rallyPhase === RALLY_PHASES.RECEIVE) this.stepReceive();
    else if (this.rallyPhase === RALLY_PHASES.SET) this.stepSet();
    else if (this.rallyPhase === RALLY_PHASES.ATTACK) this.stepAttack();
    else if (this.rallyPhase === RALLY_PHASES.ATTACK_FLIGHT) this.stepAttackFlight();
    else if (this.rallyPhase === "ERROR_FLIGHT") this.stepErrorFlight();
    const motionPlayer = this.player(this.motion?.playerId);
    if (motionPlayer && this.motion.startedAt !== null && this.motion.jumpPhase !== "LANDED") {
      updateAttackMotion(this.motion, motionPlayer, this.simulationTime);
    }
  }

  updateFrame(deltaSeconds) {
    this.accumulator = Math.min(this.accumulator + Math.min(deltaSeconds, SIMULATOR_MAX_FRAME_DELTA), SIMULATOR_MAX_FRAME_DELTA);
    while (this.accumulator + Number.EPSILON >= this.fixedStep) { this.stepFixed(); this.accumulator -= this.fixedStep; }
    return this.getSnapshot();
  }

  getSnapshot() {
    const snapshotPlayers = this.players.map((player) => {
      const attackPose = this.motion?.playerId === player.id ? {
        jumpHeight: this.motion.jumpHeight, rotationAngle: this.motion.rotationAngle,
        jumpPhase: this.motion.jumpPhase, jumpElapsed: this.motion.jumpElapsed,
        jumpDuration: this.motion.jumpDuration,
      } : {};
      return Object.freeze({ ...player, ...attackPose, touchEligible: Boolean(player.touchEligible) });
    });
    const attackPlayer = this.player(this.attackAssignment?.assignedPlayerId);
    const attackPhase = this.attackAssignment?.movementPhase;
    const targetPosition = attackPhase === ATTACK_MOVEMENT_PHASES.MOVING_TO_READY
      ? this.attackAssignment?.readyPosition
      : [ATTACK_MOVEMENT_PHASES.MOVING_TO_ATTACK, ATTACK_MOVEMENT_PHASES.ATTACK_READY].includes(attackPhase)
        ? this.attackAssignment?.attackPosition : null;
    const attackAssignment = this.attackAssignment && attackPlayer ? Object.freeze({ ...this.attackAssignment,
      targetPosition: targetPosition ? Object.freeze({ ...targetPosition }) : null,
      targetDistance: targetPosition
        ? Math.hypot(attackPlayer.x - targetPosition.x, attackPlayer.y - targetPosition.y) : null,
      readyDistance: Math.hypot(attackPlayer.x - this.attackAssignment.readyPosition.x,
        attackPlayer.y - this.attackAssignment.readyPosition.y),
      attackDistance: Math.hypot(attackPlayer.x - this.attackAssignment.attackPosition.x,
        attackPlayer.y - this.attackAssignment.attackPosition.y),
    }) : null;
    return Object.freeze({ status: this.status, rallyPhase: this.rallyPhase, activeTeam: this.activeTeam,
      simulationTime: this.simulationTime, parameters: this.parameters, world: SIMULATOR_WORLD,
      primaryReceiverId: this.primaryReceiverId, secondTouchPlayerId: this.secondTouchPlayerId,
      teamTouches: Object.freeze({ ...this.teamTouches }), receiveOutcome: this.receiveOutcome,
      receiveQuality: this.receiveQualityResult, rallyResult: this.rallyResult,
      ball: Object.freeze({ ...this.ball, targetX: this.ball.target.x, targetY: this.ball.target.y }),
      players: Object.freeze(snapshotPlayers), events: Object.freeze([...this.events]),
      presentation: Object.freeze({ ballDisplaySize: TEAM_SIMULATOR_BALL_DISPLAY_SIZE, ballOverlapRatio: 0.5,
        receiveContactScale: 0.78 }), attackMotion: this.motion ? Object.freeze({ ...this.motion }) : null,
      attackAssignment,
      thirdPass: null, thirdTouchResult: this.thirdTouchResult,
      secondTouchResult: this.secondTouchResult, attackResolution: this.attackResolution,
      setPrediction: this.setPrediction, setContactDiagnostic: this.setContactDiagnostic,
      actualLandingPoint: this.actualLandingPoint,
      finishing: this.finishing ? Object.freeze({ ...this.finishing,
        velocity: Object.freeze({ ...this.finishing.velocity }) }) : null,
      spikeConfiguration: null, spikeFlight: null, spikeResult: null,
      defense: Object.freeze({ enabled: false }) });
  }
}
