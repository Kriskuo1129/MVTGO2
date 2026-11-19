import { ABILITY_PERFORMANCE_CONFIG, POSITION_JOB_COMPATIBILITY } from "./config/ability-config.js";

export const PERFORMANCE_ABILITY_KEYS = Object.freeze(["attack", "block", "set", "receive", "serve"]);

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function isPositionCompatible(position, job) {
  return POSITION_JOB_COMPATIBILITY[position]?.includes(job) ?? false;
}

export function deriveAttackConsistency(attack, config = ABILITY_PERFORMANCE_CONFIG) {
  return clamp(Math.round(attack * config.attackConsistency.scale
    + config.attackConsistency.offset), config.minimumEffectiveAbility, config.maximumEffectiveAbility);
}

export function calculatePlayerPerformance({ abilities, position, job, mood, morale = 30,
  tacticModifiers = {}, config = ABILITY_PERFORMANCE_CONFIG }) {
  const mismatched = !isPositionCompatible(position, job);
  const moodModifier = config.moodModifiers[mood];
  if (!Number.isFinite(moodModifier)) throw new RangeError("情緒必須是 1～5。 ");
  if (!Number.isInteger(morale) || morale < 0 || morale > 99) throw new RangeError("士氣必須是 0～99 整數。 ");
  const moraleModifier = (morale - config.moraleNeutral) * config.moraleModifierPerPoint;
  const effective = {};
  const diagnostics = {};
  for (const key of PERFORMANCE_ABILITY_KEYS) {
    const raw = abilities?.[key];
    if (!Number.isInteger(raw) || raw < 1 || raw > 99) throw new RangeError(`${key} 必須是 1～99 整數。`);
    const afterMismatch = raw * (mismatched ? config.mismatchMultiplier : 1);
    const tacticModifier = Number(tacticModifiers[key] ?? 0);
    if (!Number.isFinite(tacticModifier)) throw new TypeError(`${key} 戰術修正必須是有限數值。`);
    effective[key] = clamp(Math.round(afterMismatch + moodModifier + moraleModifier + tacticModifier),
      config.minimumEffectiveAbility, config.maximumEffectiveAbility);
    diagnostics[key] = Object.freeze({ raw, afterMismatch, moodModifier, moraleModifier,
      tacticModifier, effective: effective[key] });
  }
  return Object.freeze({ rawAbilities: Object.freeze({ ...abilities }),
    effectiveAbilities: Object.freeze(effective), position, job, mismatched, mood, morale,
    attackConsistency: deriveAttackConsistency(effective.attack, config),
    diagnostics: Object.freeze(diagnostics) });
}
