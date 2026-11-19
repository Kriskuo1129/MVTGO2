import { createSeededRandom } from "./attack-quality.js";
import { createFormalRallyAdapter } from "./formal-rally-adapter.js";
import { nextRallyRotation } from "./rotation-config.js";
import { FORMAL_MATCH_RULES } from "./config/rally-config.js";
import { createFormalMatchRoster } from "./formal-match-roster.js";
import { createRallyTacticEffect, drawTacticHand, resolveTacticCard } from "./formal-tactics.js";
import { TACTIC_RULES } from "./config/tactics-config.js";

export const FORMAL_MATCH_STATES = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  RALLY_RUNNING: "RALLY_RUNNING",
  RALLY_ENDED: "RALLY_ENDED",
  BETWEEN_SETS: "BETWEEN_SETS",
  PAUSED: "PAUSED",
  MATCH_ENDED: "MATCH_ENDED",
  ABORTED: "ABORTED",
});

const TEAMS = Object.freeze(["HOME", "AWAY"]);
const opposite = (team) => team === "HOME" ? "AWAY" : "HOME";
const freezeScores = (scores) => Object.freeze({ HOME: scores.HOME, AWAY: scores.AWAY });

function validateSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Match Seed 必須是 0～4294967295 的整數。");
  }
  return seed >>> 0;
}

function setHasWinner(scores, target) {
  const leader = scores.HOME > scores.AWAY ? "HOME" : scores.AWAY > scores.HOME ? "AWAY" : null;
  if (!leader) return null;
  return scores[leader] >= target
    && scores[leader] - scores[opposite(leader)] >= FORMAL_MATCH_RULES.minimumWinningMargin
    ? leader : null;
}

export class FormalMatchSession {
  constructor({ teams, seed = 1, rallyAdapterFactory = createFormalRallyAdapter,
    parameters, fixedStep, formationLibrary,
    maximumRallySimulationTime = FORMAL_MATCH_RULES.maximumRallySimulationTime,
    maximumMatchRallies = FORMAL_MATCH_RULES.maximumMatchRallies } = {}) {
    this.roster = createFormalMatchRoster(teams);
    this.matchSeed = validateSeed(seed);
    if (typeof rallyAdapterFactory !== "function") throw new TypeError("rallyAdapterFactory 必須是函式。");
    if (!(maximumRallySimulationTime > 0) || !Number.isFinite(maximumRallySimulationTime)) {
      throw new RangeError("Rally 模擬安全上限必須是正有限秒數。");
    }
    if (!Number.isInteger(maximumMatchRallies) || maximumMatchRallies < 1) {
      throw new RangeError("Match Rally 安全上限必須是正整數。");
    }
    this.rallyAdapterFactory = rallyAdapterFactory;
    this.adapterOptions = Object.freeze({ parameters, fixedStep, formationLibrary });
    this.maximumRallySimulationTime = maximumRallySimulationTime;
    this.maximumMatchRallies = maximumMatchRallies;
    this.reset();
  }

  reset() {
    this.status = FORMAL_MATCH_STATES.NOT_STARTED;
    this.currentSetNumber = 0;
    this.setScores = { HOME: 0, AWAY: 0 };
    this.setsWon = { HOME: 0, AWAY: 0 };
    this.rotations = { HOME: "R1", AWAY: "R1" };
    this.servingTeam = null;
    this.firstSetServingTeam = null;
    this.rallyNumber = 0;
    this.setRallyNumber = 0;
    this.currentRallySeed = null;
    this.currentRally = null;
    this.teamMorale = { HOME: 30, AWAY: 30 };
    this.streak = { team: null, count: 0 };
    this.tacticHands = { HOME: Object.freeze([]), AWAY: Object.freeze([]) };
    this.tacticUses = { HOME: 0, AWAY: 0 };
    this.pendingTactic = null;
    this.currentRallyTactics = { HOME: null, AWAY: null };
    this.pausedState = null;
    this.setResults = [];
    this.rallyResults = [];
    this.events = [];
    this.matchResult = null;
    this.fault = null;
    this.usedRallySeeds = new Set();
    this.random = createSeededRandom(this.matchSeed);
    this.tacticRandom = createSeededRandom((this.matchSeed ^ 0xa5a5f00d) >>> 0);
    this.roster.resetSet();
    return this.getSnapshot();
  }

  nextRandomUint32() { return Math.floor(this.random() * 0x100000000) >>> 0; }

  drawServingTeam() { return this.random() < 0.5 ? "HOME" : "AWAY"; }

  nextRallySeed() {
    let seed = this.nextRandomUint32();
    while (this.usedRallySeeds.has(seed)) seed = (seed + 0x9e3779b9) >>> 0;
    this.usedRallySeeds.add(seed);
    return seed;
  }

  start() {
    if (this.status !== FORMAL_MATCH_STATES.NOT_STARTED) {
      throw new Error("正式比賽已開始；如需重開請建立新 Session 或先呼叫 reset()。 ");
    }
    this.events.push(Object.freeze({ type: "MATCH_STARTED", seed: this.matchSeed }));
    this.startSet(1);
    this.startRally();
    return this.getSnapshot();
  }

  startSet(setNumber) {
    this.currentSetNumber = setNumber;
    this.setScores = { HOME: 0, AWAY: 0 };
    this.rotations = { HOME: "R1", AWAY: "R1" };
    this.setRallyNumber = 0;
    this.roster.resetSet();
    this.tacticHands = { HOME: drawTacticHand(this.tacticRandom),
      AWAY: drawTacticHand(this.tacticRandom) };
    this.tacticUses = { HOME: 0, AWAY: 0 };
    this.pendingTactic = null;
    if (setNumber === 1) {
      this.firstSetServingTeam = this.drawServingTeam();
      this.servingTeam = this.firstSetServingTeam;
    } else if (setNumber === 2) {
      this.servingTeam = opposite(this.firstSetServingTeam);
    } else {
      this.servingTeam = this.drawServingTeam();
    }
    this.events.push(Object.freeze({ type: "SET_STARTED", setNumber,
      targetPoints: FORMAL_MATCH_RULES.setTargetPoints[setNumber - 1],
      servingTeam: this.servingTeam }));
  }

  startRally() {
    if (this.status === FORMAL_MATCH_STATES.MATCH_ENDED
      || this.status === FORMAL_MATCH_STATES.ABORTED) return false;
    if (this.rallyNumber >= this.maximumMatchRallies) {
      this.abort("MATCH_RALLY_LIMIT", `比賽超過 ${this.maximumMatchRallies} 球安全上限。`);
      return false;
    }
    this.rallyNumber += 1;
    this.setRallyNumber += 1;
    this.currentRallySeed = this.nextRallySeed();
    const activeTactic = this.pendingTactic;
    this.currentRallyTactics = { HOME: activeTactic?.team === "HOME"
      ? createRallyTacticEffect(activeTactic.cardId) : null,
    AWAY: activeTactic?.team === "AWAY" ? createRallyTacticEffect(activeTactic.cardId) : null };
    const options = { teams: this.roster.getActiveTeams({ morale: this.teamMorale }),
      rotations: { ...this.rotations }, servingTeam: this.servingTeam,
      seed: this.currentRallySeed, tactics: this.currentRallyTactics };
    for (const [key, value] of Object.entries(this.adapterOptions)) {
      if (value !== undefined) options[key] = value;
    }
    this.currentRally = this.rallyAdapterFactory(options);
    if (!this.currentRally || typeof this.currentRally.start !== "function"
      || typeof this.currentRally.advance !== "function") {
      throw new TypeError("rallyAdapterFactory 必須回傳 Formal Rally Adapter 相容物件。");
    }
    this.currentRally.start();
    this.pendingTactic = null;
    this.status = FORMAL_MATCH_STATES.RALLY_RUNNING;
    this.events.push(Object.freeze({ type: "RALLY_STARTED", setNumber: this.currentSetNumber,
      setRallyNumber: this.setRallyNumber, rallyNumber: this.rallyNumber,
      seed: this.currentRallySeed, servingTeam: this.servingTeam,
      rotations: Object.freeze({ ...this.rotations }) }));
    return true;
  }

  advance(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("推進時間必須是非負有限秒數。");
    }
    if (this.status === FORMAL_MATCH_STATES.NOT_STARTED
      || this.status === FORMAL_MATCH_STATES.MATCH_ENDED
      || this.status === FORMAL_MATCH_STATES.ABORTED
      || this.status === FORMAL_MATCH_STATES.PAUSED) return this.getSnapshot();
    if (this.status === FORMAL_MATCH_STATES.RALLY_ENDED) {
      this.startRally();
      return this.getSnapshot();
    }
    if (this.status === FORMAL_MATCH_STATES.BETWEEN_SETS) {
      this.startSet(this.currentSetNumber + 1);
      this.startRally();
      return this.getSnapshot();
    }
    const rallySnapshot = this.currentRally.advance(deltaSeconds);
    if (rallySnapshot.simulationTime > this.maximumRallySimulationTime) {
      this.abort("RALLY_TIME_LIMIT", `Rally ${this.rallyNumber} 超過模擬時間安全上限。`);
      return this.getSnapshot();
    }
    if (rallySnapshot.status === "ENDED") this.settleCurrentRally();
    return this.getSnapshot();
  }

  settleCurrentRally() {
    if (this.status !== FORMAL_MATCH_STATES.RALLY_RUNNING) return false;
    const result = this.currentRally.getResult();
    if (!TEAMS.includes(result?.scoringTeam)) {
      this.abort("INVALID_RALLY_RESULT", "Continuous Rally 結束但缺少合法得分方。");
      return false;
    }
    const servingTeam = this.servingTeam;
    const rotationsBefore = Object.freeze({ ...this.rotations });
    this.setScores[result.scoringTeam] += 1;
    if (result.scoringTeam !== servingTeam) {
      this.rotations[result.scoringTeam] = nextRallyRotation(this.rotations[result.scoringTeam]);
    }
    this.servingTeam = result.scoringTeam;
    this.updateMoraleStreak(result.scoringTeam);
    const record = Object.freeze({ setNumber: this.currentSetNumber,
      setRallyNumber: this.setRallyNumber, rallyNumber: this.rallyNumber,
      seed: this.currentRallySeed, servingTeam, scoringTeam: result.scoringTeam,
      reason: result.reason, score: freezeScores(this.setScores), rotationsBefore,
      rotationsAfter: Object.freeze({ ...this.rotations }),
      events: this.currentRally.getEvents() });
    this.rallyResults.push(record);
    this.events.push(Object.freeze({ type: "RALLY_SETTLED", setNumber: record.setNumber,
      setRallyNumber: record.setRallyNumber, rallyNumber: record.rallyNumber,
      seed: record.seed, servingTeam: record.servingTeam, scoringTeam: record.scoringTeam,
      reason: record.reason, score: record.score, rotationsBefore: record.rotationsBefore,
      rotationsAfter: record.rotationsAfter }));
    const target = FORMAL_MATCH_RULES.setTargetPoints[this.currentSetNumber - 1];
    const setWinner = setHasWinner(this.setScores, target);
    if (setWinner) this.finishSet(setWinner, target);
    else this.status = FORMAL_MATCH_STATES.RALLY_ENDED;
    return true;
  }

  updateMoraleStreak(scoringTeam) {
    if (this.streak.team === scoringTeam) this.streak.count += 1;
    else this.streak = { team: scoringTeam, count: 1 };
    const delta = this.streak.count >= 5 ? 3 : this.streak.count === 4 ? 2
      : this.streak.count === 3 ? 1 : 0;
    if (delta === 0) return;
    const losingTeam = opposite(scoringTeam);
    this.teamMorale[scoringTeam] = Math.min(99, this.teamMorale[scoringTeam] + delta);
    this.teamMorale[losingTeam] = Math.max(0, this.teamMorale[losingTeam] - delta);
    this.events.push(Object.freeze({ type: "MORALE_UPDATED", rallyNumber: this.rallyNumber,
      streakTeam: scoringTeam, streakCount: this.streak.count, delta,
      morale: freezeScores(this.teamMorale) }));
  }

  operationBoundaryState() {
    return this.status === FORMAL_MATCH_STATES.PAUSED ? this.pausedState : this.status;
  }

  pause(team) {
    if (!TEAMS.includes(team)) throw new RangeError("暫停隊伍必須為 HOME 或 AWAY。 ");
    if (![FORMAL_MATCH_STATES.RALLY_ENDED, FORMAL_MATCH_STATES.BETWEEN_SETS]
      .includes(this.status)) throw new Error("只能在 Rally 結束後暫停。 ");
    this.pausedState = this.status;
    this.status = FORMAL_MATCH_STATES.PAUSED;
    this.events.push(Object.freeze({ type: "MATCH_PAUSED", team,
      setNumber: this.currentSetNumber, rallyNumber: this.rallyNumber }));
    return this.getSnapshot();
  }

  resume() {
    if (this.status !== FORMAL_MATCH_STATES.PAUSED) throw new Error("比賽目前未暫停。 ");
    this.status = this.pausedState;
    this.pausedState = null;
    this.events.push(Object.freeze({ type: "MATCH_RESUMED",
      setNumber: this.currentSetNumber, rallyNumber: this.rallyNumber }));
    return this.getSnapshot();
  }

  substitute({ team, job, playerInId }) {
    if (this.operationBoundaryState() !== FORMAL_MATCH_STATES.RALLY_ENDED) {
      throw new Error("只能在同一局的 Rally 結束後換人。 ");
    }
    const result = this.roster.substitute({ team, job, playerInId });
    this.events.push(Object.freeze({ type: "SUBSTITUTION", setNumber: this.currentSetNumber,
      rallyNumber: this.rallyNumber, ...result }));
    return result;
  }

  activateTactic({ team, cardId }) {
    if (!TEAMS.includes(team)) throw new RangeError("戰術隊伍必須為 HOME 或 AWAY。 ");
    if (this.operationBoundaryState() !== FORMAL_MATCH_STATES.RALLY_ENDED) {
      throw new Error("戰術卡只能在同一局的下一球開始前使用。 ");
    }
    if (this.pendingTactic) throw new Error("每個 Rally 最多使用一張戰術卡。 ");
    if (this.tacticUses[team] >= TACTIC_RULES.maximumUsesPerSet) throw new Error("本局戰術卡使用次數已達上限。 ");
    const hand = [...this.tacticHands[team]];
    const index = hand.indexOf(cardId);
    if (index < 0) throw new Error("戰術卡不在本局手牌中。 ");
    const card = resolveTacticCard(cardId);
    hand.splice(index, 1);
    this.tacticHands[team] = Object.freeze(hand);
    this.tacticUses[team] += 1;
    if (card.kind === "MORALE") {
      this.teamMorale[team] = Math.min(99, this.teamMorale[team] + card.moraleDelta);
    }
    this.pendingTactic = Object.freeze({ team, cardId });
    this.events.push(Object.freeze({ type: "TACTIC_ACTIVATED", team, cardId,
      name: card.name, setNumber: this.currentSetNumber, appliesToRally: this.rallyNumber + 1,
      morale: this.teamMorale[team] }));
    return card;
  }

  getRosterSnapshot() { return this.roster.getSnapshot(); }

  getOperationAvailability() {
    const operationState = this.operationBoundaryState();
    const boundary = [FORMAL_MATCH_STATES.RALLY_ENDED, FORMAL_MATCH_STATES.BETWEEN_SETS]
      .includes(operationState);
    const rallyBoundary = operationState === FORMAL_MATCH_STATES.RALLY_ENDED;
    return Object.freeze({ canPause: boundary && this.status !== FORMAL_MATCH_STATES.PAUSED,
      canResume: this.status === FORMAL_MATCH_STATES.PAUSED,
      canSubstitute: rallyBoundary && this.roster.substitutionCount.HOME < 6,
      canActivateTactic: rallyBoundary && !this.pendingTactic });
  }

  finishSet(winner, targetPoints) {
    this.setsWon[winner] += 1;
    const setResult = Object.freeze({ setNumber: this.currentSetNumber, winner,
      targetPoints, initialServingTeam: this.events.find((event) => event.type === "SET_STARTED"
        && event.setNumber === this.currentSetNumber)?.servingTeam ?? null,
      score: freezeScores(this.setScores), rallyCount: this.setRallyNumber });
    this.setResults.push(setResult);
    this.events.push(Object.freeze({ type: "SET_ENDED", ...setResult }));
    if (this.setsWon[winner] >= FORMAL_MATCH_RULES.setsToWin) {
      this.status = FORMAL_MATCH_STATES.MATCH_ENDED;
      this.matchResult = Object.freeze({ winner, seed: this.matchSeed,
        setsWon: freezeScores(this.setsWon), sets: Object.freeze([...this.setResults]),
        rallyCount: this.rallyNumber });
      this.events.push(Object.freeze({ type: "MATCH_ENDED", ...this.matchResult }));
    } else {
      this.status = FORMAL_MATCH_STATES.BETWEEN_SETS;
    }
  }

  abort(code, message) {
    this.status = FORMAL_MATCH_STATES.ABORTED;
    this.fault = Object.freeze({ code, message, setNumber: this.currentSetNumber,
      rallyNumber: this.rallyNumber, seed: this.currentRallySeed });
    this.events.push(Object.freeze({ type: "MATCH_ABORTED", ...this.fault }));
  }

  isEnded() { return this.status === FORMAL_MATCH_STATES.MATCH_ENDED; }
  getRallySnapshot() { return this.currentRally?.getSnapshot() ?? null; }
  getRallyResult() { return this.currentRally?.getResult() ?? null; }
  getRallyEvents() { return this.currentRally?.getEvents() ?? Object.freeze([]); }
  getRallyResults() { return Object.freeze([...this.rallyResults]); }
  getSetResults() { return Object.freeze([...this.setResults]); }
  getMatchResult() { return this.matchResult; }
  getEvents() { return Object.freeze([...this.events]); }

  getSnapshot() {
    return Object.freeze({ status: this.status, seed: this.matchSeed,
      currentSetNumber: this.currentSetNumber, setScores: freezeScores(this.setScores),
      setsWon: freezeScores(this.setsWon), servingTeam: this.servingTeam,
      rotations: Object.freeze({ ...this.rotations }), rallyNumber: this.rallyNumber,
      setRallyNumber: this.setRallyNumber, currentRallySeed: this.currentRallySeed,
      rally: this.getRallySnapshot(), rallyResult: this.getRallyResult(),
      rallyResults: this.getRallyResults(), setResults: this.getSetResults(), matchResult: this.matchResult,
      morale: freezeScores(this.teamMorale), streak: Object.freeze({ ...this.streak }),
      tactics: Object.freeze({ hands: Object.freeze({ ...this.tacticHands }),
        uses: Object.freeze({ ...this.tacticUses }), pending: this.pendingTactic,
        current: Object.freeze({ ...this.currentRallyTactics }) }),
      roster: this.getRosterSnapshot(), operations: this.getOperationAvailability(),
      fault: this.fault, events: this.getEvents() });
  }
}
