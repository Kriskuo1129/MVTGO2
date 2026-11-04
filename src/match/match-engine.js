import { MATCH_PHASES } from "./match-state.js";
import { getReceivingTeam, settleServeResult } from "./match-rules.js";
import { resolveServe, SERVE_OUTCOMES } from "./match-resolver.js";
import { getServingPlayer } from "./serving-player.js";

export const MATCH_ENGINE_STATES = MATCH_PHASES;

function validateTestOverride(override) {
  if (!override || override.eventType !== "SERVE" || override.outcome !== SERVE_OUTCOMES.ACE) {
    throw new TypeError("Phase 3A-4 測試覆寫只支援本次 SERVE 的 ACE 結果。");
  }
  return Object.freeze({
    eventType: "SERVE",
    outcome: SERVE_OUTCOMES.ACE,
    errorType: null,
    source: "TEST_OVERRIDE",
  });
}

function createTeamSnapshot(team) {
  return Object.freeze({
    name: team.name,
    players: team.players,
    startingLineup: team.startingLineup,
  });
}

function createMatchSnapshot(match) {
  return Object.freeze({
    id: match.id,
    name: match.name,
    courtId: match.courtId,
    phase: match.runtime.phase,
    servingTeam: match.runtime.servingTeam,
    rotations: Object.freeze({ ...match.rotations }),
    score: Object.freeze({ ...match.score }),
    rally: match.runtime.rally ? Object.freeze({ ...match.runtime.rally }) : null,
    teams: Object.freeze({
      HOME: createTeamSnapshot(match.teams.HOME),
      AWAY: createTeamSnapshot(match.teams.AWAY),
    }),
  });
}

export class MatchEngine {
  constructor({
    match,
    random = Math.random,
    resolver = resolveServe,
    rules = settleServeResult,
  }) {
    if (!match?.runtime || !match?.teams || !match?.rotations || !match?.score) {
      throw new TypeError("Match Engine 需要正式 Match 狀態與球隊資料。");
    }
    if (typeof random !== "function" || typeof resolver !== "function" || typeof rules !== "function") {
      throw new TypeError("Match Engine 的亂數、Resolver 與 Rules 必須是函數。");
    }
    this.match = match;
    this.random = random;
    this.resolver = resolver;
    this.rules = rules;
    this.activeRally = false;
  }

  getState() {
    return Object.freeze({
      state: this.match.runtime.phase,
      phase: this.match.runtime.phase,
      eventSequence: this.match.runtime.eventSequence,
      rallySequence: this.match.runtime.rallySequence,
      active: this.activeRally,
    });
  }

  getMatchState() {
    return createMatchSnapshot(this.match);
  }

  getEvents() {
    return Object.freeze([...this.match.runtime.events]);
  }

  #setPhase(phase) {
    this.match.runtime.phase = phase;
  }

  #appendEvent(type, rally, details = {}) {
    const event = Object.freeze({
      matchId: this.match.id,
      rallyId: rally.id,
      rallyNumber: rally.number,
      sequence: ++this.match.runtime.eventSequence,
      type,
      ...details,
    });
    this.match.runtime.events.push(event);
    return event;
  }

  startRally() {
    const phase = this.match.runtime.phase;
    const canStart = phase === MATCH_PHASES.NOT_STARTED || phase === MATCH_PHASES.RALLY_ENDED;
    if (!canStart || this.activeRally) throw new Error("目前 Rally 正在進行中，不可重複啟動。");

    const server = getServingPlayer(this.match);
    const rallyNumber = ++this.match.runtime.rallySequence;
    const rally = {
      id: `${this.match.id}-R${rallyNumber}`,
      number: rallyNumber,
      eventType: "SERVE",
      servingTeam: server.servingTeam,
      legalServerId: server.player.id,
      server,
      resolverResult: null,
      result: null,
      landed: false,
      settled: false,
    };
    this.match.runtime.rally = rally;
    this.activeRally = true;
    this.#setPhase(MATCH_PHASES.RALLY_PREPARE);
    return this.#appendEvent("RALLY_PREPARED", rally, {
      teamId: server.servingTeam,
      playerId: server.player.id,
      playerName: server.player.name,
      lineupPosition: server.lineupPosition,
      rotation: server.rotation,
      score: Object.freeze({ ...this.match.score }),
    });
  }

  advanceRally({ testOverride = null } = {}) {
    if (!this.activeRally || !this.match.runtime.rally) {
      throw new Error("目前沒有可推進的 Rally；請先呼叫 startRally()。");
    }
    const rally = this.match.runtime.rally;
    const server = rally.server;
    const phase = this.match.runtime.phase;

    if (phase === MATCH_PHASES.RALLY_PREPARE) {
      if (rally.resolverResult !== null) throw new Error("同一 Rally 的 Resolver 不得重複執行。");
      this.#setPhase(MATCH_PHASES.SERVE);
      const resolvedResult = this.resolver({
        server: server.player,
        servingTactics: this.match.tactics?.[server.servingTeam] ?? null,
        random: this.random,
      });
      let finalResult = resolvedResult;

      // [MVTGO_TEST_HOOK]
      // 功能：正式 Resolver 完成後，允許測試比賽將本次發球結果覆寫為 ACE。
      // 啟用：僅於 match.environment.testMode === true 且本次推進明確傳入覆寫。
      // 範圍：只替換 Engine 採用的結果；不指定球員、比分、球路或視覺動畫。
      if (this.match.environment.testMode === true && testOverride) {
        finalResult = validateTestOverride(testOverride);
      }
      rally.resolverResult = resolvedResult;
      rally.result = finalResult;
      return this.#appendEvent("SERVE_RESOLVED", rally, {
        teamId: server.servingTeam,
        playerId: server.player.id,
        playerName: server.player.name,
        result: finalResult,
        resolverResult: resolvedResult,
      });
    }

    if (phase === MATCH_PHASES.SERVE) {
      if (!rally.result) throw new Error("發球尚未完成正式判定，不能進入飛行階段。");
      if (rally.result.outcome !== SERVE_OUTCOMES.ACE) {
        const unsupported = this.#appendEvent("UNSUPPORTED_RESULT", rally, {
          teamId: server.servingTeam,
          playerId: server.player.id,
          result: rally.result,
        });
        this.#setPhase(MATCH_PHASES.RALLY_ENDED);
        this.#appendEvent("RALLY_ENDED", rally, { status: "UNSUPPORTED" });
        this.activeRally = false;
        const error = new Error(`發球結果 ${rally.result.outcome} 尚未支援，未進行得分結算。`);
        error.code = "UNSUPPORTED_SERVE_RESULT";
        error.event = unsupported;
        throw error;
      }
      const receivingTeam = getReceivingTeam(server.servingTeam);
      this.#setPhase(MATCH_PHASES.BALL_IN_FLIGHT);
      return this.#appendEvent("BALL_IN_FLIGHT", rally, {
        teamId: server.servingTeam,
        playerId: server.player.id,
        playerName: server.player.name,
        receivingTeam,
        result: rally.result,
      });
    }

    if (phase === MATCH_PHASES.BALL_IN_FLIGHT) {
      if (rally.landed) throw new Error("同一 Rally 不得重複建立落地事件。");
      rally.landed = true;
      const receivingTeam = getReceivingTeam(server.servingTeam);
      this.#setPhase(MATCH_PHASES.BALL_LANDED);
      return this.#appendEvent("BALL_LANDED", rally, {
        receivingTeam,
        result: rally.result,
      });
    }

    if (phase === MATCH_PHASES.BALL_LANDED) {
      if (!rally.landed) throw new Error("排球尚未落地，不能進行得分結算。");
      if (rally.settled) throw new Error("同一 Rally 不得重複結算。");
      this.#setPhase(MATCH_PHASES.RALLY_RESULT);
      const scoreBefore = Object.freeze({ ...this.match.score });
      const rotationsBefore = Object.freeze({ ...this.match.rotations });
      const servingTeamBefore = this.match.runtime.servingTeam;
      const serveEvent = Object.freeze({
        id: rally.id,
        eventType: "SERVE",
        servingTeam: server.servingTeam,
        server,
        resolverResult: rally.resolverResult,
        result: rally.result,
      });
      const settlement = this.rules(this.match, serveEvent);
      rally.settled = true;
      return this.#appendEvent("SCORE_UPDATED", rally, {
        scoringTeam: settlement.scoringTeam,
        scoreBefore,
        scoreAfter: Object.freeze({ ...this.match.score }),
        servingTeamBefore,
        servingTeamAfter: this.match.runtime.servingTeam,
        rotationsBefore,
        rotationsAfter: Object.freeze({ ...this.match.rotations }),
      });
    }

    if (phase === MATCH_PHASES.RALLY_RESULT) {
      if (!rally.settled) throw new Error("Rally 尚未完成規則結算，不能結束。");
      this.#setPhase(MATCH_PHASES.RALLY_ENDED);
      this.activeRally = false;
      return this.#appendEvent("RALLY_ENDED", rally, { status: "COMPLETED" });
    }

    throw new Error(`目前階段 ${phase} 不允許推進 Rally。`);
  }

  startSingleRally({ testOverride = null } = {}) {
    const eventStartIndex = this.match.runtime.events.length;
    this.startRally();
    while (this.activeRally) this.advanceRally({ testOverride });
    const rally = this.match.runtime.rally;
    const events = Object.freeze(this.match.runtime.events.slice(eventStartIndex));
    const scoreEvent = events.find((event) => event.type === "SCORE_UPDATED");
    const serveEventRecord = events.find((event) => event.type === "SERVE_RESOLVED");
    const serveEvent = Object.freeze({
      id: rally.id,
      eventType: "SERVE",
      servingTeam: rally.servingTeam,
      server: rally.server,
      resolverResult: rally.resolverResult,
      result: rally.result,
    });
    const settlement = Object.freeze({
      scoringTeam: scoreEvent.scoringTeam,
      servingTeam: scoreEvent.servingTeamAfter,
      score: scoreEvent.scoreAfter,
    });
    return Object.freeze({
      serveEvent,
      serveEventRecord,
      settlement,
      events,
      state: MATCH_PHASES.RALLY_ENDED,
    });
  }
}
