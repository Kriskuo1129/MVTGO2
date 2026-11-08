import { getExpectedAttackContact, ATTACK_CONTACT_CONFIG } from "./attack-contact.js";

// 暫時測試預設，尚未正式定案。時間為直到自然落地的秒數；弧度為基線上額外世界像素。
export const THIRD_PASS_TEST_DEFAULTS = Object.freeze({ flightDuration: 1.6, arcHeight: 260, contactHeight: 180 });

export function validateThirdPassParameters(parameters) {
  const { flightDuration, arcHeight, contactHeight } = parameters;
  if (!Number.isFinite(flightDuration) || flightDuration < 0.1 || flightDuration > 10
    || !Number.isFinite(contactHeight) || contactHeight < ATTACK_CONTACT_CONFIG.minimumBaseHeight + ATTACK_CONTACT_CONFIG.heightTolerance
    || contactHeight > 400 || !Number.isFinite(arcHeight) || arcHeight < contactHeight || arcHeight > 1000) {
    throw new RangeError("第三段測試參數：時間 0.1～10 秒、接觸高度 160～400、弧度介於接觸高度與 1000 世界像素。低於接觸高度的弧度不支援。");
  }
  return Object.freeze({ flightDuration, arcHeight, contactHeight });
}

export function planThirdPass({ start, attackPosition, assignedPlayerId, parameters, geometry, anticipatedJumpHeight = 0 }) {
  // D1 在第三段開始時傳入預期跳躍高度一次，與實際碰撞的 jumpHeight 使用相同高度慣例。
  const expectedContact = getExpectedAttackContact({ ...attackPosition, jumpHeight: anticipatedJumpHeight }, geometry);
  // 沿用 Ball 的 h(u)=h0(1-u)+4*arc*u*(1-u)。求下降段指定高度的 u，
  // 再反推落地座標，使球在 u 時通過 ATTACK 專屬接觸區，而非落到球員中心。
  const arc = parameters.arcHeight, b = 4 * arc - start.height;
  const discriminant = b * b + 16 * arc * (start.height - expectedContact.height);
  const contactProgress = (b + Math.sqrt(discriminant)) / (8 * arc);
  if (!Number.isFinite(contactProgress) || contactProgress <= 0 || contactProgress >= 1) throw new RangeError("第三段無法建立有效的下降段接觸區。");
  return Object.freeze({ status: "IN_PLAY", start: Object.freeze({ ...start }), expectedContact,
    attackPosition: Object.freeze({ ...attackPosition }), assignedPlayerId,
    landingTarget: Object.freeze({ x: start.x + (expectedContact.x - start.x) / contactProgress,
      y: start.y + (expectedContact.y - start.y) / contactProgress }),
    duration: parameters.flightDuration, arcHeight: arc, contactProgress,
    expectedContactTime: parameters.flightDuration * contactProgress,
  });
}
