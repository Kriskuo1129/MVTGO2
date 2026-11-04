import { createServeBehavior, getServingPlayer } from "./player-behavior.js";
import { resolveServe, SERVICE_ERROR_TYPES, SERVE_OUTCOMES } from "./match-resolver.js";
import { settleServeResult } from "./match-rules.js";

export const MATCH_ENGINE_STATES = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  SERVE_IN_PROGRESS: "SERVE_IN_PROGRESS",
  WAITING_ANIMATION: "WAITING_ANIMATION",
  RALLY_ENDED: "RALLY_ENDED",
});

function validateTestOverride(override) {
  if (!override || override.eventType !== "SERVE") {
    throw new TypeError("測試覆寫必須對應本次 SERVE 事件。");
  }
  if (!Object.values(SERVE_OUTCOMES).includes(override.outcome)) {
    throw new RangeError(`不支援的測試發球結果：${override.outcome}`);
  }
  if (
    override.outcome === SERVE_OUTCOMES.SERVICE_ERROR
    && !Object.values(SERVICE_ERROR_TYPES).includes(override.errorType)
  ) {
    throw new RangeError("發球失誤覆寫必須指定 OUT 或 NET。");
  }
  return Object.freeze({
    eventType: "SERVE",
    outcome: override.outcome,
    errorType: override.outcome === SERVE_OUTCOMES.ACE ? null : override.errorType,
    source: "TEST_OVERRIDE",
  });
}

export class MatchEngine {
  constructor({
    match,
    animationPort,
    random = Math.random,
    resolver = resolveServe,
    behaviorPlanner = createServeBehavior,
    rules = settleServeResult,
  }) {
    if (!match?.runtime || typeof animationPort?.playBehaviorCommands !== "function") {
      throw new TypeError("Match Engine 需要正式 Match 與動畫完成通知接口。");
    }
    if (typeof random !== "function" || typeof resolver !== "function") {
      throw new TypeError("Match Engine 的亂數來源與 Resolver 必須是函數。");
    }
    this.match = match;
    this.animationPort = animationPort;
    this.random = random;
    this.resolver = resolver;
    this.behaviorPlanner = behaviorPlanner;
    this.rules = rules;
    this.state = MATCH_ENGINE_STATES.NOT_STARTED;
    this.eventSequence = 0;
    this.activeRun = null;
  }

  getState() {
    return Object.freeze({
      state: this.state,
      eventSequence: this.eventSequence,
      active: this.activeRun !== null,
    });
  }

  async startSingleRally({ testOverride = null } = {}) {
    const canStart = this.state === MATCH_ENGINE_STATES.NOT_STARTED
      || this.state === MATCH_ENGINE_STATES.RALLY_ENDED;
    if (!canStart || this.activeRun) {
      throw new Error("目前 Rally 正在進行中，不可重複啟動。");
    }
    const retryState = this.state;
    const runToken = Object.freeze({ id: this.eventSequence + 1 });
    this.activeRun = runToken;
    this.eventSequence = runToken.id;
    this.state = MATCH_ENGINE_STATES.SERVE_IN_PROGRESS;

    try {
      const server = getServingPlayer(this.match);
      const resolvedResult = this.resolver({ server: server.player, random: this.random });
      let finalResult = resolvedResult;

    // [MVTGO_TEST_HOOK]
    // 功能：在正式 Resolver 完成後，允許單次發球測試替換最終結果。
    // 啟用：僅於 match.environment.testMode === true 且本次明確傳入覆寫。
    // 範圍：只替換本事件結果；Player Behavior、動畫與 Rules 仍走正式流程。
      if (this.match.environment.testMode === true && testOverride) {
        finalResult = validateTestOverride(testOverride);
      }

      const serveEvent = Object.freeze({
        id: runToken.id,
        eventType: "SERVE",
        servingTeam: server.servingTeam,
        server,
        resolverResult: resolvedResult,
        result: finalResult,
      });
      const behavior = this.behaviorPlanner(this.match, serveEvent);
      this.state = MATCH_ENGINE_STATES.WAITING_ANIMATION;
      await this.animationPort.playBehaviorCommands(behavior.commands);

      if (this.activeRun !== runToken) {
        throw new Error("發球事件在動畫完成前已失效，禁止結算。");
      }
      const settlement = this.rules(this.match, serveEvent);
      this.state = MATCH_ENGINE_STATES.RALLY_ENDED;
      this.activeRun = null;
      this.animationPort.updateScoreboard?.();
      return Object.freeze({ serveEvent, behavior, settlement, state: this.state });
    } catch (error) {
      if (this.activeRun === runToken) {
        this.activeRun = null;
        if (this.state !== MATCH_ENGINE_STATES.RALLY_ENDED) {
          this.state = retryState;
        }
      }
      throw error;
    }
  }
}
