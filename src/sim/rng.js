// mulberry32: tiny, fast, seeded. The generator's whole state is one 32 bit
// integer kept in state.rng, so a battle can be copied or resumed exactly.

export function seedFrom(seed) {
  // Accept numbers or strings so "Ypres" works as a seed too.
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function next(holder) {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const range = (h, a, b) => a + (b - a) * next(h);
export const int = (h, a, b) => Math.floor(range(h, a, b + 1));
