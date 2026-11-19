function validateSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Match Seed 必須是 0～4294967295 的整數。 ");
  }
  return seed >>> 0;
}

export function createRandomMatchSeed({ cryptoSource = globalThis.crypto,
  now = Date.now, random = Math.random } = {}) {
  if (typeof cryptoSource?.getRandomValues === "function") {
    const value = new Uint32Array(1);
    cryptoSource.getRandomValues(value);
    return value[0] >>> 0;
  }
  const timePart = Number(now()) >>> 0;
  const randomPart = Math.floor(Number(random()) * 0x100000000) >>> 0;
  return (timePart ^ randomPart ^ 0x9e3779b9) >>> 0;
}

export function createMatchSeedSource({ fixedSeed = null,
  randomSeed = createRandomMatchSeed } = {}) {
  if (fixedSeed !== null) validateSeed(fixedSeed);
  if (typeof randomSeed !== "function") throw new TypeError("randomSeed 必須是函數。 ");
  return Object.freeze({ next: () => fixedSeed === null
    ? validateSeed(randomSeed()) : validateSeed(fixedSeed) });
}
