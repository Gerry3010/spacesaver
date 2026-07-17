// Deterministic RNG (mulberry32). Multi-display windows must generate
// identical starfields/nebulae, so world content never uses Math.random.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap stateless hash → [0,1), for per-cycle variation without allocations. */
export function hash01(n) {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}
