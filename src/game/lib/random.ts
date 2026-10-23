// Deterministic random (mulberry32): the same seed gives the same sequence on every run and on the server.
// Its first numbers follow a small seed closely (seed 7 starts 0.012, 0.062: two misses on any die), so a seed that
// isn't fixed in the code goes through streamSeed first
export function createRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A well-mixed seed for one of a match's generators (`stream`: 1 the dice, 2 the bots…) from the match's own seed:
 * unrelated sequences for each, and no small numbers for mulberry32 to start from. The mixing is MurmurHash3's finaliser
 */
export function streamSeed(seed: number, stream: number) {
  let h = (seed ^ Math.imul(stream, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
