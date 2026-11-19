import { TACTIC_CARDS, TACTIC_RULES } from "./config/tactics-config.js";

export function drawTacticHand(random, count = TACTIC_RULES.cardsPerSet) {
  if (typeof random !== "function") throw new TypeError("抽戰術卡需要 RNG。 ");
  const pool = Object.keys(TACTIC_CARDS);
  const hand = [];
  while (hand.length < count && pool.length > 0) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    hand.push(pool.splice(index, 1)[0]);
  }
  return Object.freeze(hand);
}

export function resolveTacticCard(cardId) {
  const card = TACTIC_CARDS[cardId];
  if (!card) throw new RangeError(`未知戰術卡：${cardId}`);
  return Object.freeze({ id: cardId, ...card });
}

export function createRallyTacticEffect(cardId) {
  if (!cardId) return null;
  const card = resolveTacticCard(cardId);
  return Object.freeze({ id: card.id, name: card.name, kind: card.kind,
    selectionMode: card.selectionMode ?? null,
    abilityModifiers: Object.freeze({ ...(card.abilityModifiers ?? {}) }) });
}
