import { ATTACK_TYPES, DEFAULT_ATTACK_POSITIONS } from "./attack-positions.js";
import { ATTACK_MOTION_V1, strikeElapsed } from "./attack-motion.js";
import { SIMULATOR_WORLD } from "./simulator.js";
import { getRotationConfig } from "./rotation-config.js";

export const R1_ATTACK_PLAN_VERSION = "R1_ATTACK_PLAN_V1";
export const R1_ATTACK_PHASES = Object.freeze({
  SERVE_RECEIVE: "SERVE_RECEIVE",
  COUNTERATTACK: "COUNTERATTACK",
});

const officialLeftLong = DEFAULT_ATTACK_POSITIONS.entries.find((entry) =>
  entry.rotation === "R1" && entry.playerSlot === "OH1" && entry.attackType === ATTACK_TYPES.LEFT_LONG);

// R1-B 暫時座標：只供 Simulator 驗證，待 Scene Library／Editor 正式定案後替換。
const AWAY_ATTACK_CONFIG_BY_TYPE = Object.freeze({
  [ATTACK_TYPES.LEFT_LONG]: Object.freeze({ attackType: ATTACK_TYPES.LEFT_LONG,
    attackRole: "LONG", workType: "PREPARE_LONG",
    readyPosition: officialLeftLong.readyPosition, attackPosition: officialLeftLong.attackPosition,
    setDuration: 1.5, setArcHeight: 360, source: "SCENE_LIBRARY_R1" }),
  [ATTACK_TYPES.RIGHT_LONG]: Object.freeze({ attackType: ATTACK_TYPES.RIGHT_LONG,
    attackRole: "BACK_LONG", workType: "PREPARE_BACK_LONG",
    readyPosition: Object.freeze({ x: 1422, y: 155 }),
    attackPosition: Object.freeze({ x: 1268, y: 240 }),
    setDuration: 1.5, setArcHeight: 340, source: "R1_B_TEMPORARY" }),
  [ATTACK_TYPES.MIDDLE_QUICK]: Object.freeze({ attackType: ATTACK_TYPES.MIDDLE_QUICK,
    attackRole: "MIDDLE_QUICK", workType: "PREPARE_MIDDLE_QUICK",
    readyPosition: Object.freeze({ x: 1480, y: 455 }),
    attackPosition: Object.freeze({ x: 1260, y: 455 }),
    setDuration: 1.25, setArcHeight: 210, source: "R1_B_TEMPORARY" }),
  [ATTACK_TYPES.BACK_CENTER_LONG]: Object.freeze({ attackType: ATTACK_TYPES.BACK_CENTER_LONG,
    attackRole: "BACK_CENTER_LONG", workType: "PREPARE_BACK_CENTER_ATTACK",
    readyPosition: Object.freeze({ x: 1810, y: 455 }),
    attackPosition: Object.freeze({ x: 1540, y: 455 }),
    setDuration: 1.35, setArcHeight: 300, source: "R1_B_TEMPORARY" }),
  [ATTACK_TYPES.BACK_RIGHT_LONG]: Object.freeze({ attackType: ATTACK_TYPES.BACK_RIGHT_LONG,
    attackRole: "BACK_RIGHT_LONG", workType: "PREPARE_BACK_RIGHT_ATTACK",
    readyPosition: Object.freeze({ x: 1810, y: 240 }),
    attackPosition: Object.freeze({ x: 1540, y: 240 }),
    setDuration: 1.35, setArcHeight: 300, source: "ROTATION_V1_TEMPORARY" }),
});

const ATTACK_CANDIDATE_JOB_ORDER = Object.freeze(["OH1", "OP", "MB1", "OH2", "MB2"]);

const transformAttackPoint = (point, team) => team === "AWAY" ? point : Object.freeze({
  x: SIMULATOR_WORLD.width - point.x,
  y: SIMULATOR_WORLD.height - point.y,
});

export function getR1AttackConfigurations(team, attackPhase = R1_ATTACK_PHASES.SERVE_RECEIVE,
  rotation = "R1") {
  if (!["HOME", "AWAY"].includes(team)) throw new RangeError("R1 攻擊配置需要 HOME 或 AWAY。");
  if (!Object.values(R1_ATTACK_PHASES).includes(attackPhase)) throw new RangeError("R1 攻擊階段不合法。");
  const assignments = getRotationConfig(rotation).attacks;
  return Object.freeze(Object.fromEntries(ATTACK_CANDIDATE_JOB_ORDER
    .filter((job) => assignments[job]).map((job) => {
    const attackType = assignments[job];
    const entry = AWAY_ATTACK_CONFIG_BY_TYPE[attackType];
    return [job,
    Object.freeze({ ...entry,
      job,
      readyPosition: transformAttackPoint(entry.readyPosition, team),
      attackPosition: transformAttackPoint(entry.attackPosition, team),
    })];
  })));
}

export function createR1AttackPlan({ team, revision, firstTouchPlayerId, firstTouchJob,
  attackPhase = R1_ATTACK_PHASES.SERVE_RECEIVE, rotation = "R1" }) {
  const rotationConfig = getRotationConfig(rotation);
  const configurations = getR1AttackConfigurations(team, attackPhase, rotation);
  const alternateSet = firstTouchJob === "S";
  const candidateJobs = alternateSet ? [rotationConfig.alternateSet.targetJob]
    : ATTACK_CANDIDATE_JOB_ORDER.filter((job) => rotationConfig.attacks[job]);
  return {
    id: `${team}-${rotation}-ATTACK-${revision}`,
    version: R1_ATTACK_PLAN_VERSION,
    revision,
    rotation,
    team,
    attackPhase,
    firstTouchPlayerId,
    firstTouchJob,
    setterJob: alternateSet ? rotationConfig.alternateSet.setterJob : "S",
    forcedCandidateJob: alternateSet ? rotationConfig.alternateSet.targetJob : null,
    status: "PREPARING",
    selectedJob: null,
    selectedPlayerId: null,
    selectedAt: null,
    candidates: candidateJobs.map((job) => ({ ...configurations[job] })),
  };
}

export function evaluateR1AttackCandidates(plan, players) {
  return plan.candidates.map((candidate) => {
    const player = players.find((entry) => entry.team === plan.team && entry.job === candidate.job);
    if (!player) return Object.freeze({ ...candidate, playerId: null, feasible: false, reason: "PLAYER_MISSING" });
    if (player.id === plan.firstTouchPlayerId && player.action === "RECEIVE") {
      // 已完成第一觸球後仍可移動；不以呈現中的 RECEIVE 動畫直接排除。
    }
    const attackDistance = Math.hypot(player.x - candidate.attackPosition.x,
      player.y - candidate.attackPosition.y);
    const availableRunTime = Math.max(0, candidate.setDuration - strikeElapsed(ATTACK_MOTION_V1));
    const reachableDistance = player.moveSpeed * availableRunTime;
    return Object.freeze({ ...candidate, playerId: player.id, attackDistance, reachableDistance,
      availableRunTime,
      feasible: attackDistance <= reachableDistance + 1e-7,
      reason: attackDistance <= reachableDistance + 1e-7 ? null : "ATTACK_POSITION_UNREACHABLE" });
  });
}

export function selectR1AttackCandidate(plan, players, random, tactic = null) {
  if (plan.selectedPlayerId) throw new Error("本次攻擊計畫已鎖定攻擊手。");
  if (typeof random !== "function") throw new TypeError("攻擊手選擇需要可注入 RNG。");
  const evaluations = evaluateR1AttackCandidates(plan, players);
  const feasible = evaluations.filter((entry) => entry.feasible);
  if (feasible.length === 0) return Object.freeze({ selected: null, evaluations: Object.freeze(evaluations) });
  let selected = plan.forcedCandidateJob
    ? feasible.find((entry) => entry.job === plan.forcedCandidateJob) ?? null : null;
  if (!plan.forcedCandidateJob) {
    const roll = random();
    if (tactic?.selectionMode === "QUICK") {
      selected = feasible.find((entry) => entry.attackType === ATTACK_TYPES.MIDDLE_QUICK) ?? null;
    } else if (tactic?.selectionMode === "POWER") {
      selected = [...feasible].sort((a, b) => {
        const aPlayer = players.find((entry) => entry.id === a.playerId);
        const bPlayer = players.find((entry) => entry.id === b.playerId);
        return (bPlayer?.attack ?? 0) - (aPlayer?.attack ?? 0);
      })[0] ?? null;
    }
    selected ??= feasible[Math.min(feasible.length - 1, Math.floor(roll * feasible.length))];
  }
  return Object.freeze({ selected: selected ? Object.freeze(selected) : null,
    evaluations: Object.freeze(evaluations) });
}
