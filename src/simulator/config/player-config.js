// 球員移動、尺寸與共用接觸幾何。單位除特別註明外皆為世界座標。
export const SIMULATOR_WORLD_CONFIG = Object.freeze({ width: 2280, height: 900 });

export const SIMULATOR_TIMING_CONFIG = Object.freeze({
  fixedStep: 1 / 120,
  maximumFrameDelta: 0.25,
});

export const PLAYER_PHYSICS_CONFIG = Object.freeze({
  defaultAvatarSize: 150,
  teamAvatarSize: 130,
  moveSpeed: 300,
  contactRange: 84,
  initialX: 1140,
  initialY: 650,
  minimumAvatarSize: 32,
  maximumAvatarSize: 160,
  minimumMoveSpeed: 20,
  maximumMoveSpeed: 1600,
  minimumContactRange: 10,
  maximumContactRange: 240,
});

export const PLAYER_CONTACT_CONFIG = Object.freeze({
  maximumReceiveHeight: 118,
  receiveAnchorDistance: 75,
  predictionSampleStep: 1 / 60,
  receiveAvatarScale: 0.78,
  ballOverlapRatio: 0.5,
  receiveMinimumOverlapDepth: 10,
  receiveTolerance: 10,
  setHorizontalTolerance: 10,
  setVerticalTolerance: 16,
});
