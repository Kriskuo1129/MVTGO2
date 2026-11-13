const TYPE_MAP = Object.freeze({
  SERVE_PREPARED: "RALLY_START",
  SERVE_STARTED: "RALLY_START",
  SERVE_CONTACT: "SERVE_CONTACT",
  RECEIVE_PHASE_STARTED: "RECEIVE_ASSIGN",
  RECEIVE_TOUCH: "RECEIVE_CONTACT",
  RECEIVE_RESULT: "RECEIVE_RESULT",
  ATTACK_PLAN_CREATED: "ATTACK_PLAN",
  ATTACK_SELECTED: "SET_SELECT",
  ATTACK_SELECTION_FAILED: "SET_SELECT",
  SECOND_TOUCH: "SET_CONTACT",
  ATTACK_JUMP_STARTED: "ATTACK_READY",
  THIRD_TOUCH: "ATTACK_CONTACT",
  BLOCK_ASSIGN: "BLOCK_ASSIGN",
  BLOCK_READY: "BLOCK_READY",
  BLOCK_JUMP: "BLOCK_JUMP",
  BLOCK_CONTACT: "BLOCK_CONTACT",
  BLOCK_RESULT: "BLOCK_RESULT",
  BLOCK_MISS: "BLOCK_MISS",
  RALLY_RESULT_LOCKED: "RALLY_END",
});

const FAILURE_TYPES = new Set(["SET_MISSED", "RECEIVE_ERROR", "SERVE_TOSS_MISSED",
  "SERVE_NET", "SERVE_OUT", "THIRD_TOUCH_MISSED"]);

function immutableDetails(value) {
  if (value === undefined) return null;
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

const attackRoleLabel = (candidate) => candidate.attackRole === "LONG" ? "長攻"
  : candidate.attackRole === "BACK_LONG" ? "背長"
    : candidate.attackRole === "MIDDLE_QUICK" ? "快攻"
      : candidate.attackRole === "BACK_CENTER_LONG" ? "6 號位後排攻擊"
        : candidate.attackType ?? candidate.workType ?? "未指定攻擊";

function describeAttackPlan(details) {
  const phaseLabel = details.attackPhase === "SERVE_RECEIVE" ? "接發進攻"
    : details.attackPhase === "COUNTERATTACK" ? "防守反擊" : "未知階段";
  const candidates = (details.candidates ?? []).map((candidate) =>
    `${candidate.job} ${attackRoleLabel(candidate)}`).join("、");
  const alternateSet = details.setterJob === "OP"
    ? `；OP 代舉，固定候選 ${details.forcedCandidateJob ?? "—"}` : "";
  return `${details.attackPhase ?? "UNKNOWN"}（${phaseLabel}）｜計畫 ${details.attackPlanId}`
    + `｜候選：${candidates || "—"}${alternateSet}`;
}

function describe(entry) {
  const d = entry.details ?? {};
  const attackLabel = d.attackRole === "LONG" ? "長攻"
    : d.attackRole === "BACK_LONG" ? "背長" : d.attackType;
  switch (entry.type) {
    case "RALLY_START": return `Seed ${d.seed}，${d.servingTeam ?? entry.team} 發球`;
    case "SERVE_CONTACT": return `發球實際擊球${d.speedLevel ? `，球速 ${d.speedLevel}` : ""}`;
    case "RECEIVE_ASSIGN": return `指派 ${entry.job ?? d.playerId ?? "—"} 接球`;
    case "RECEIVE_CONTACT": return "第一觸球完成";
    case "RECEIVE_RESULT": return `接球結果 ${d.result}${d.quality ? `／${d.quality}` : ""}`;
    case "ATTACK_PLAN": return describeAttackPlan(d);
    case "SET_SELECT": return d.selectedJob
      ? d.forced && d.setterJob === "OP"
        ? `OP 代舉 → ${d.selectedJob} ${attackLabel}（指定）`
        : `選擇 ${d.selectedJob} ${attackLabel}${d.forced ? "（指定）" : ""}`
      : `無可行攻擊手${d.reason ? `：${d.reason}` : ""}`;
    case "SET_CONTACT": return "第二觸球完成";
    case "ATTACK_READY": return `${entry.job ?? d.playerId ?? "攻擊手"} 到達擊球位置並起跳`;
    case "ATTACK_CONTACT": return `${d.attackType ?? "攻擊"}第三觸球完成`;
    case "BLOCK_ASSIGN": return `${d.attackType} 攔網責任：${(d.jobs ?? []).join("＋")}`;
    case "BLOCK_READY": return `${entry.job} 已抵達攔網位置`;
    case "BLOCK_JUMP": return `${entry.job} 實際起跳攔網`;
    case "BLOCK_CONTACT": return `${entry.job} 真正攔網觸球，高度 ${Number(d.height).toFixed(1)}`;
    case "BLOCK_RESULT": return d.result === "STUFF_BLOCK" ? "攔網反彈回攻擊方場內" : "攔網觸球減速進入防守方場內";
    case "BLOCK_MISS": return `${entry.job} 未碰到球：${d.reason}`;
    case "FORMATION_TRANSITION": return `${d.reason} → ${String(d.phase).replace("_STANDBY", "")}`;
    case "DEFENSE_TRANSITION": return `切換 R1 防守工作（${d.reason}）`;
    case "RALLY_END": return `${d.reason}，得分 ${d.scoringTeam}`;
    default: return d.reason ?? entry.type;
  }
}

export function mapSimulatorEventToRallyLog(event, context) {
  let type = TYPE_MAP[event.type];
  if (event.type === "R1_WORK_PLAN_ASSIGNED" && event.phase === "DEFENSE") type = "DEFENSE_TRANSITION";
  if (event.type === "R1_WORK_PLAN_ASSIGNED"
    && ["RECEIVE_STANDBY", "DEFENSE_STANDBY"].includes(event.phase)) type = "FORMATION_TRANSITION";
  if (!type && FAILURE_TYPES.has(event.type)) type = event.type;
  if (!type) return null;
  const player = context.players?.find((candidate) => candidate.id === event.playerId);
  const details = {
    ...event,
    seed: context.seed,
    servingTeam: context.servingTeam,
  };
  delete details.type;
  delete details.time;
  delete details.team;
  delete details.playerId;
  if (type === "SET_SELECT") {
    details.selectedJob = event.job ?? null;
    details.selectedPlayerId = event.playerId ?? null;
  }
  const entry = {
    rallyId: context.rallyId,
    sequence: context.sequence,
    simTime: Number.isFinite(event.time) ? event.time : 0,
    team: event.team ?? null,
    job: type === "SET_SELECT" ? event.setterJob ?? null : event.job ?? player?.job ?? null,
    playerId: type === "SET_SELECT" ? event.setterPlayerId ?? null : event.playerId ?? null,
    type,
    details: immutableDetails(details),
  };
  entry.message = describe(entry);
  return Object.freeze(entry);
}

export class RallyEventLogStore {
  constructor() { this.clear(); }

  clear() {
    this.entries = [];
    this.rallyStates = new Map();
    this.singleRallySerial = 0;
    this.sessionBase = 0;
    this.maximumRallyId = 0;
  }

  beginSession() {
    this.sessionBase = this.maximumRallyId;
    this.rallyStates = new Map();
  }

  consume(snapshot) {
    const sessionRally = snapshot.session?.rallyNumber;
    let rallyId = Number.isInteger(sessionRally) && sessionRally > 0
      ? this.sessionBase + sessionRally : this.singleRallySerial || this.maximumRallyId + 1;
    let state = this.rallyStates.get(rallyId);
    if (!state || snapshot.events.length < state.eventCursor) {
      if (!snapshot.session && state) rallyId = ++this.singleRallySerial;
      else if (!snapshot.session && this.singleRallySerial === 0) this.singleRallySerial = rallyId;
      state = { eventCursor: 0, sequence: 0 };
      this.rallyStates.set(rallyId, state);
      this.maximumRallyId = Math.max(this.maximumRallyId, Number(rallyId) || 0);
    }
    const servingTeam = snapshot.session?.results?.find((result) => result.rallyNumber === rallyId)?.servingTeam
      ?? snapshot.serveResolution?.team ?? snapshot.events.find((event) =>
        ["SERVE_PREPARED", "SERVE_STARTED"].includes(event.type))?.team ?? null;
    for (let index = state.eventCursor; index < snapshot.events.length; index += 1) {
      const mapped = mapSimulatorEventToRallyLog(snapshot.events[index], {
        rallyId, sequence: state.sequence + 1, seed: snapshot.seed,
        servingTeam, players: snapshot.players,
      });
      if (mapped) { this.entries.push(mapped); state.sequence += 1; }
    }
    state.eventCursor = snapshot.events.length;
    return Object.freeze([...this.entries]);
  }
}

export function formatRallyEventLog(entries) {
  let currentRally = null;
  const lines = [];
  for (const entry of entries) {
    if (entry.rallyId !== currentRally) {
      currentRally = entry.rallyId;
      if (lines.length) lines.push("");
      lines.push(`Rally #${entry.rallyId} | Seed ${entry.details?.seed ?? "—"}`);
    }
    const team = entry.team ?? "SYSTEM";
    const job = entry.job ?? "—";
    lines.push(`[${entry.simTime.toFixed(3)}] ${team.padEnd(6)} ${job.padEnd(4)} | ${entry.type} | ${entry.message}`);
    if (entry.type === "SET_SELECT" && Array.isArray(entry.details?.evaluations)) {
      const candidates = entry.details.evaluations.map((candidate) =>
        `${candidate.job}:${candidate.feasible ? "可行" : candidate.reason ?? "不可行"}`).join("、");
      lines.push(`        候選：${candidates}`);
    }
  }
  return lines.join("\n");
}
