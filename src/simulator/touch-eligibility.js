export const TOUCH_PHASES = Object.freeze({
  RECEIVE: "RECEIVE",
  SET: "SET",
  ATTACK: "ATTACK",
});

export function createTouchEligibilityState({
  phase = TOUCH_PHASES.RECEIVE,
  eligiblePlayerIds = [],
} = {}) {
  return {
    phase,
    revision: 0,
    touchNumber: 0,
    eligiblePlayerIds: [...new Set(eligiblePlayerIds)],
    lastTouch: null,
    blockTouchExceptionReserved: false,
  };
}

export function configureTouchEligibility(state, { phase, eligiblePlayerIds }) {
  if (!state || !Object.values(TOUCH_PHASES).includes(phase)) {
    throw new RangeError(`不支援的觸球階段：${phase}`);
  }
  if (!Array.isArray(eligiblePlayerIds)) {
    throw new TypeError("觸球資格必須提供球員 ID 陣列。");
  }
  state.phase = phase;
  state.revision += 1;
  state.eligiblePlayerIds = [...new Set(eligiblePlayerIds)];
  return state;
}

export function isPlayerTouchEligible(state, playerId) {
  return Boolean(state?.eligiblePlayerIds.includes(playerId));
}

export function recordEligibleTouch(state, { playerId, teamId = "RECEIVING_TEAM" }) {
  if (!isPlayerTouchEligible(state, playerId)) {
    throw new Error(`球員 ${playerId} 不具備目前 ${state?.phase} 階段的觸球資格。`);
  }
  state.touchNumber += 1;
  state.lastTouch = Object.freeze({ playerId, teamId, touchNumber: state.touchNumber });
  return state.lastTouch;
}

export function createTouchEligibilitySnapshot(state) {
  return Object.freeze({
    phase: state.phase,
    revision: state.revision,
    touchNumber: state.touchNumber,
    eligiblePlayerIds: Object.freeze([...state.eligiblePlayerIds]),
    lastTouch: state.lastTouch,
    blockTouchExceptionReserved: state.blockTouchExceptionReserved,
  });
}
