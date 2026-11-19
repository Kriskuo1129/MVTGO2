import { SET_QUALITY_PARAMETERS } from "./config/set-config.js";

export const SET_QUALITIES = Object.freeze({ PERFECT: "PERFECT", NORMAL: "NORMAL", BAD: "BAD" });

export function resolveSetQuality({ receiveQuality, setAbility, random,
  config = SET_QUALITY_PARAMETERS }) {
  if (!Object.values(SET_QUALITIES).includes(receiveQuality)) throw new RangeError("一傳品質不合法。 ");
  if (!Number.isInteger(setAbility) || setAbility < 1 || setAbility > 99) {
    throw new RangeError("舉球能力必須是 1～99 整數。 ");
  }
  if (typeof random !== "function") throw new TypeError("舉球品質需要 Seeded RNG。 ");
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("舉球 RNG 必須介於 0～1。 ");
  const receiveModifier = config.receiveQualityModifiers[receiveQuality];
  const randomPerformance = config.randomMinimum
    + roll * (config.randomMaximum - config.randomMinimum);
  const score = setAbility + receiveModifier + randomPerformance;
  const quality = score >= config.perfectThreshold ? SET_QUALITIES.PERFECT
    : score >= config.normalThreshold ? SET_QUALITIES.NORMAL : SET_QUALITIES.BAD;
  return Object.freeze({ quality, score, setAbility, receiveQuality,
    receiveModifier, randomPerformance, roll });
}
