// rng.js — a seeded random number generator (mulberry32) plus the helpers the city and the
// staged screenshot scenes use. Everything random in the world comes from one of these, never
// from Math.random, so a seed always builds the same Sirena Bay and the same screenshot frame.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Float in [min, max). */
    range(min, max) { return min + next() * (max - min); },
    /** Integer in [min, max] inclusive. */
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    /** True with probability p. */
    chance(p) { return next() < p; },
    /** One element of an array. */
    pick(items) { return items[Math.floor(next() * items.length)]; },
    /** A shuffled copy of an array. */
    shuffle(items) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
      }
      return copy;
    },
  };
}

/** Deterministic 2D hash noise in [0, 1), for facade variation that needs no stored table. */
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
