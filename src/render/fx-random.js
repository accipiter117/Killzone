// Cosmetic randomness only (tracer jitter, smoke puffs, debris). Kept apart
// from the simulation's seeded RNG so visuals can never change an outcome.

export function makeFxRandom(seed = Date.now()) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.range = (lo, hi) => lo + (hi - lo) * rnd();
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  return rnd;
}

export const fx = makeFxRandom();
