export const RECEIVE_QUALITY_PARAMETERS = Object.freeze({
  incomingDifficulty: Object.freeze({ ULTRA_FAST: 35, FAST: 25, MEDIUM: 15, SLOW: 5 }),
  maximumPositionBonus: 10,
  maximumPreparationBonus: 12,
  preparationSecondsForMaximum: 0.4,
  maximumMoraleBonus: 8,
  randomMinimum: -10,
  randomMaximum: 10,
  perfectThreshold: 75,
  normalThreshold: 40,
});

export const RECEIVE_SUCCESS_PARAMETERS = Object.freeze({
  scoreAnchors: Object.freeze([
    Object.freeze({ score: -35, probability: 0.05 }),
    Object.freeze({ score: 0, probability: 0.18 }),
    Object.freeze({ score: 25, probability: 0.42 }),
    Object.freeze({ score: 50, probability: 0.68 }),
    Object.freeze({ score: 75, probability: 0.86 }),
    Object.freeze({ score: 100, probability: 0.95 }),
  ]),
  errorFlight: Object.freeze({
    minimumDuration: 0.45,
    maximumDuration: 0.9,
    minimumArcHeight: 45,
    maximumArcHeight: 150,
    minimumDistance: 180,
    maximumDistance: 520,
    directionSpreadRadians: Math.PI * 0.78,
  }),
});
