export const TACTIC_CARD_IDS = Object.freeze({
  HEAVY_HITTER: "HEAVY_HITTER",
  QUICK_ATTACK: "QUICK_ATTACK",
  RECEIVE_FOCUS: "RECEIVE_FOCUS",
  COACH_CONFIDENCE: "COACH_CONFIDENCE",
  CHEER_SQUAD: "CHEER_SQUAD",
});

export const TACTIC_CARDS = Object.freeze({
  HEAVY_HITTER: Object.freeze({ name: "球給大砲", kind: "ATTACK_SELECTION", selectionMode: "POWER" }),
  QUICK_ATTACK: Object.freeze({ name: "球給快攻", kind: "ATTACK_SELECTION", selectionMode: "QUICK" }),
  RECEIVE_FOCUS: Object.freeze({ name: "專注接發", kind: "ABILITY", abilityModifiers: Object.freeze({ receive: 8 }) }),
  COACH_CONFIDENCE: Object.freeze({ name: "教練信心喊話", kind: "MORALE", moraleDelta: 10 }),
  CHEER_SQUAD: Object.freeze({ name: "啦啦隊助威", kind: "MORALE", moraleDelta: 30 }),
});

export const TACTIC_RULES = Object.freeze({ cardsPerSet: 3, maximumUsesPerSet: 3,
  maximumCardsPerRally: 1 });
