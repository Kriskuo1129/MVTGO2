// 球體、固定飛行實驗相容值與自然飛行物理。
export const BALL_CONFIG = Object.freeze({
  teamDiameter: 65,
  singlePlayerDisplayDiameter: 46,
  initial: Object.freeze({ x: 250, y: 450, height: 72 }),
  minimumLegacyFlightDuration: 0.7,
  maximumLegacyFlightDuration: 1.5,
  legacyHighArcHeight: 360,
});

export const NATURAL_BALL_PHYSICS = Object.freeze({
  gravity: 980,
  verticalRestitution: 0.48,
  horizontalBounceRetention: 0.72,
  horizontalDampingPerSecond: 1.8,
  minimumBounceSpeed: 70,
  restHorizontalSpeed: 18,
  netHorizontalRetention: 0.15,
  netDownwardSpeed: 120,
});
