import { ATTACK_TYPES, DEFAULT_ATTACK_POSITIONS } from "./attack-positions.js";
import { ATTACK_MOTION_V1, strikeElapsed } from "./attack-motion.js";
import { SIMULATOR_WORLD } from "./simulator.js";

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
});

const ATTACK_TYPE_BY_PHASE_AND_JOB = Object.freeze({
  [R1_ATTACK_PHASES.SERVE_RECEIVE]: Object.freeze({
    OH1: ATTACK_TYPES.RIGHT_LONG,
    OP: ATTACK_TYPES.LEFT_LONG,
    MB1: ATTACK_TYPES.MIDDLE_QUICK,
    OH2: ATTACK_TYPES.BACK_CENTER_LONG,
  }),
  [R1_ATTACK_PHASES.COUNTERATTACK]: Object.freeze({
    OH1: ATTACK_TYPES.RIGHT_LONG,
    OP: ATTACK_TYPES.LEFT_LONG,
    MB1: ATTACK_TYPES.MIDDLE_QUICK,
    OH2: ATTACK_TYPES.BACK_CENTER_LONG,
  }),
});

const transformAttackPoint = (point, team) => team === "AWAY" ? point : Object.freeze({
  x: SIMULATOR_WORLD.width - point.x,
  y: SIMULATOR_WORLD.height - point.y,
});

export function getR1AttackConfigurations(team, attackPhase = R1_ATTACK_PHASES.SERVE_RECEIVE) {
  if (!["HOME", "AWAY"].includes(team)) throw new RangeError("R1 攻擊配置需要 HOME 或 AWAY。");
  if (!Object.values(R1_ATTACK_PHASES).includes(attackPhase)) throw new RangeError("R1 攻擊階段不合法。");
  const assignments = ATTACK_TYPE_BY_PHASE_AND_JOB[attackPhase];
  return Object.freeze(Object.fromEntries(Object.entries(assignments).map(([job, attackType]) => {
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
  attackPhase = R1_ATTACK_PHASES.SERVE_RECEIVE }) {
  const configurations = getR1AttackConfigurations(team, attackPhase);
  const alternateSet = firstTouchJob === "S";
  const candidateJobs = alternateSet ? ["OH1"] : ["OH1", "OP", "MB1", "OH2"];
  return {
    id: `${team}-R1-ATTACK-${revision}`,
    version: R1_ATTACK_PLAN_VERSION,
    revision,
    team,
    attackPhase,
    firstTouchPlayerId,
    firstTouchJob,
    setterJob: alternateSet ? "OP" : "S",
    forcedCandidateJob: alternateSet ? "OH1" : null,
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

export function selectR1AttackCandidate(plan, players, random) {
  if (plan.selectedPlayerId) throw new Error("本次攻擊計畫已鎖定攻擊手。");
  if (typeof random !== "function") throw new TypeError("攻擊手選擇需要可注入 RNG。");
  const evaluations = evaluateR1AttackCandidates(plan, players);
  const feasible = evaluations.filter((entry) => entry.feasible);
  if (feasible.length === 0) return Object.freeze({ selected: null, evaluations: Object.freeze(evaluations) });
  const selected = plan.forcedCandidateJob
    ? feasible.find((entry) => entry.job === plan.forcedCandidateJob) ?? null
    : feasible[Math.min(feasible.length - 1, Math.floor(random() * feasible.length))];
  return Object.freeze({ selected: selected ? Object.freeze(selected) : null,
    evaluations: Object.freeze(evaluations) });
}
