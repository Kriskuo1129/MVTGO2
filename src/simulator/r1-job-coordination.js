import { SIMULATOR_WORLD } from "./simulator.js";

export const R1_JOBS = Object.freeze(["S", "OH1", "OH2", "MB1", "MB2", "OP"]);

export const R1_WORK_TYPES = Object.freeze({
  SERVE: "SERVE",
  RECEIVE: "RECEIVE",
  SET: "SET",
  ALTERNATE_SET: "ALTERNATE_SET",
  PREPARE_BACK_LONG: "PREPARE_BACK_LONG",
  PREPARE_BACK_CENTER_ATTACK: "PREPARE_BACK_CENTER_ATTACK",
  PREPARE_MIDDLE_QUICK: "PREPARE_MIDDLE_QUICK",
  PREPARE_LONG: "PREPARE_LONG",
  PREPARE_RIGHT_LONG: "PREPARE_RIGHT_LONG",
  HOLD: "HOLD",
  BLOCK_BACK_LONG: "BLOCK_BACK_LONG",
  BLOCK_ALL: "BLOCK_ALL",
  BLOCK_LONG: "BLOCK_LONG",
  DEFEND_SPIKE: "DEFEND_SPIKE",
});

export const R1_RECEIVE_JOBS = Object.freeze(["OH1", "OH2", "MB2"]);
export const R1_DEFENSE_RECEIVE_JOBS = Object.freeze(["OH2", "MB2", "S"]);
export const R1_BLOCK_JOB_MAP = Object.freeze({
  LEFT_LONG: Object.freeze(["OH1", "MB1"]),
  RIGHT_LONG: Object.freeze(["MB1", "OP"]),
  MIDDLE_QUICK: Object.freeze(["MB1"]),
  BACK_CENTER_LONG: Object.freeze(["MB1"]),
  BACK_RIGHT_LONG: Object.freeze(["MB1", "OP"]),
});

const RIGHT_DEFENSE_POINTS = Object.freeze({
  OH1: Object.freeze({ x: 1320, y: 690, area: "FRONT_LEFT" }),
  MB1: Object.freeze({ x: 1320, y: 450, area: "FRONT_CENTER" }),
  OP: Object.freeze({ x: 1320, y: 210, area: "FRONT_RIGHT" }),
  OH2: Object.freeze({ x: 1740, y: 450, area: "BACK_CENTER" }),
  MB2: Object.freeze({ x: 1740, y: 690, area: "BACK_LEFT" }),
  S: Object.freeze({ x: 1740, y: 210, area: "BACK_RIGHT" }),
});

const DEFENSE_WORK = Object.freeze({
  OH1: R1_WORK_TYPES.BLOCK_BACK_LONG,
  MB1: R1_WORK_TYPES.BLOCK_ALL,
  OP: R1_WORK_TYPES.BLOCK_LONG,
  OH2: R1_WORK_TYPES.DEFEND_SPIKE,
  MB2: R1_WORK_TYPES.DEFEND_SPIKE,
  S: R1_WORK_TYPES.DEFEND_SPIKE,
});

const mirrorPoint = (point) => Object.freeze({ ...point, x: SIMULATOR_WORLD.width - point.x });
const pointForTeam = (team, point) => team === "AWAY" ? point : mirrorPoint(point);

function freezePlan(team, phase, reason, assignments) {
  return Object.freeze({ rotation: "R1", team, phase, reason,
    assignments: Object.freeze(assignments.map((entry) => Object.freeze(entry))) });
}

export function isR1ReceiveJob(job) {
  return R1_RECEIVE_JOBS.includes(job);
}

export function isR1DefenseReceiveJob(job) {
  return R1_DEFENSE_RECEIVE_JOBS.includes(job);
}

export function createR1ServePlan(team, serverJob = "S") {
  if (serverJob !== "S") throw new Error("R1 發球員必須為 S。");
  return freezePlan(team, "SERVE_INITIAL", "R1_SERVE_PREPARE", R1_JOBS.map((job) => ({
    job,
    workType: job === "S" ? R1_WORK_TYPES.SERVE : R1_WORK_TYPES.HOLD,
    implementationStatus: "IMPLEMENTED",
    target: null,
    moveEnabled: false,
  })));
}

export function createR1ReceivePlan(team, incomingKind = "SERVE") {
  const defenseReceive = incomingKind === "ATTACK";
  const receiveJobs = defenseReceive ? R1_DEFENSE_RECEIVE_JOBS : R1_RECEIVE_JOBS;
  return freezePlan(team, defenseReceive ? "DEFENSE_RECEIVE" : "RECEIVE",
    defenseReceive ? "OPPONENT_ATTACK_IN_PLAY" : "OPPONENT_SERVE_IN_PLAY", R1_JOBS.map((job) => ({
    job,
    workType: receiveJobs.includes(job) ? R1_WORK_TYPES.RECEIVE
      : job === "S" ? R1_WORK_TYPES.SET : R1_WORK_TYPES.HOLD,
    implementationStatus: defenseReceive && ["OH1", "MB1", "OP"].includes(job)
      ? "POSITION_ONLY" : "IMPLEMENTED",
    target: defenseReceive ? pointForTeam(team, RIGHT_DEFENSE_POINTS[job]) : null,
    moveEnabled: defenseReceive && !receiveJobs.includes(job),
  })));
}

export function createR1FormationStandbyPlan(team, positions, profile, reason) {
  if (!Array.isArray(positions) || positions.length !== R1_JOBS.length) {
    throw new TypeError("R1 接球待命計畫需要六名 Job 的有效站位快照。");
  }
  const byJob = new Map(positions.map((entry) => [entry.position, entry]));
  if (byJob.size !== R1_JOBS.length || R1_JOBS.some((job) => !byJob.has(job))) {
    throw new RangeError("R1 接球待命站位缺少必要 Job。");
  }
  if (!["RECEIVE", "DEFENSE"].includes(profile)) throw new RangeError("R1 待命配置必須為 RECEIVE 或 DEFENSE。");
  return freezePlan(team, `${profile}_STANDBY`, reason, R1_JOBS.map((job) => ({
    job,
    workType: DEFENSE_WORK[job],
    implementationStatus: "IMPLEMENTED",
    target: Object.freeze({ x: byJob.get(job).x, y: byJob.get(job).y }),
    moveEnabled: true,
  })));
}

export function createR1DefensePlan(team, reason) {
  return freezePlan(team, "DEFENSE", reason, R1_JOBS.map((job) => ({
    job,
    workType: DEFENSE_WORK[job],
    implementationStatus: job === "OH1" || job === "MB1" || job === "OP"
      ? "POSITION_ONLY" : "IMPLEMENTED",
    target: pointForTeam(team, RIGHT_DEFENSE_POINTS[job]),
    area: RIGHT_DEFENSE_POINTS[job].area,
    moveEnabled: true,
  })));
}

export function getR1BlockJobs(attackType) {
  const jobs = R1_BLOCK_JOB_MAP[attackType];
  if (!jobs) throw new RangeError(`R1 尚未定義 ${attackType} 的攔網責任。`);
  return jobs;
}

export function createR1BlockPlan(team, attackType, laneY, defensePositions = null) {
  if (!Number.isFinite(laneY)) throw new TypeError("攔網路線 Y 必須為有限數值。");
  const blockers = getR1BlockJobs(attackType);
  const defense = defensePositions
    ? createR1FormationStandbyPlan(team, defensePositions, "DEFENSE", `OPPONENT_${attackType}`)
    : createR1DefensePlan(team, `OPPONENT_${attackType}`);
  const x = team === "HOME" ? SIMULATOR_WORLD.width / 2 - 70 : SIMULATOR_WORLD.width / 2 + 70;
  const innerDirection = Math.sign(SIMULATOR_WORLD.height / 2 - laneY) || 1;
  return freezePlan(team, "BLOCK_PREPARE", `OPPONENT_${attackType}`, defense.assignments.map((entry) => {
    const index = blockers.indexOf(entry.job);
    if (index < 0) return entry;
    const offset = blockers.length === 2
      ? (entry.job === "MB1" ? innerDirection : -innerDirection) * 30 : 0;
    return {
      ...entry,
      workType: `BLOCK_${attackType}`,
      implementationStatus: "IMPLEMENTED",
      target: Object.freeze({ x, y: Math.max(120, Math.min(SIMULATOR_WORLD.height - 120, laneY + offset)) }),
      moveEnabled: true,
    };
  }));
}

export function createR1AttackPreparationPlan(team, {
  firstTouchJob,
  attackConfigurations = {},
} = {}) {
  const alternateSetter = firstTouchJob === "S";
  const workByJob = {
    S: alternateSetter ? R1_WORK_TYPES.HOLD : R1_WORK_TYPES.SET,
    OH1: attackConfigurations.OH1?.workType ?? R1_WORK_TYPES.PREPARE_BACK_LONG,
    OH2: R1_WORK_TYPES.PREPARE_BACK_CENTER_ATTACK,
    MB1: R1_WORK_TYPES.PREPARE_MIDDLE_QUICK,
    MB2: R1_WORK_TYPES.HOLD,
    OP: alternateSetter ? R1_WORK_TYPES.ALTERNATE_SET
      : attackConfigurations.OP?.workType ?? R1_WORK_TYPES.PREPARE_LONG,
  };
  return freezePlan(team, "ATTACK_PREPARE", "RECEIVE_SUCCESS", R1_JOBS.map((job) => ({
    job,
    workType: workByJob[job],
    implementationStatus: ["S", "OH1", "OH2", "MB1", "MB2", "OP"].includes(job)
      ? "IMPLEMENTED" : "PENDING_R1_FOLLOWUP",
    target: attackConfigurations[job]?.readyPosition
      ? Object.freeze({ ...attackConfigurations[job].readyPosition }) : null,
    moveEnabled: Boolean(attackConfigurations[job]?.readyPosition)
      && !(alternateSetter && job === "OP") && job !== "MB2",
  })));
}
