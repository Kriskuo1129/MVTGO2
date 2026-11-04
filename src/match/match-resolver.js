export const SERVE_OUTCOMES = Object.freeze({
  ACE: "ACE",
  SERVICE_ERROR: "SERVICE_ERROR",
});

export const SERVICE_ERROR_TYPES = Object.freeze({
  OUT: "OUT",
  NET: "NET",
});

// 暫定發球判定公式：只供目前 ACE／失誤事件使用，並非最終遊戲平衡。
export const TEMPORARY_SERVE_RESOLUTION = Object.freeze({
  baseAceWeight: 30,
  abilityAceWeight: 0.75,
  baseErrorWeight: 48,
  abilityErrorReduction: 0.38,
  serveTypeAceBonus: Object.freeze({ 一般: 0, 跳飄: 7, 跳發: 14 }),
  serveTypeErrorBonus: Object.freeze({ 一般: 0, 跳飄: 4, 跳發: 11 }),
  minimumWeight: 1,
  netErrorRatio: 0.42,
});

function assertRandomValue(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Resolver 亂數來源必須回傳 0（含）到 1（不含）的數值。");
  }
}

export function resolveServe({ server, random }) {
  if (!server?.abilities || !Number.isInteger(server.abilities.serve)) {
    throw new TypeError("發球判定需要具有正式發球能力的球員資料。");
  }
  if (typeof random !== "function") {
    throw new TypeError("發球判定需要可測試的亂數來源。");
  }
  const config = TEMPORARY_SERVE_RESOLUTION;
  const aceWeight = Math.max(
    config.minimumWeight,
    config.baseAceWeight
      + server.abilities.serve * config.abilityAceWeight
      + config.serveTypeAceBonus[server.serveType],
  );
  const errorWeight = Math.max(
    config.minimumWeight,
    config.baseErrorWeight
      - server.abilities.serve * config.abilityErrorReduction
      + config.serveTypeErrorBonus[server.serveType],
  );
  const resultRoll = random();
  assertRandomValue(resultRoll);
  const aceProbability = aceWeight / (aceWeight + errorWeight);
  if (resultRoll < aceProbability) {
    return Object.freeze({
      eventType: "SERVE",
      outcome: SERVE_OUTCOMES.ACE,
      errorType: null,
      source: "RESOLVER",
      resolution: Object.freeze({ aceWeight, errorWeight, aceProbability }),
    });
  }

  const errorRoll = random();
  assertRandomValue(errorRoll);
  return Object.freeze({
    eventType: "SERVE",
    outcome: SERVE_OUTCOMES.SERVICE_ERROR,
    errorType: errorRoll < config.netErrorRatio
      ? SERVICE_ERROR_TYPES.NET
      : SERVICE_ERROR_TYPES.OUT,
    source: "RESOLVER",
    resolution: Object.freeze({ aceWeight, errorWeight, aceProbability }),
  });
}
