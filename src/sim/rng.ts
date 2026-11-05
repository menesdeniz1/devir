/**
 * sfc32 üreteci. Durum, JSON'a yazılabilen dört 32 bit tamsayıdır (yapay zekâ belleğinde tutulur).
 * Üreteç durumu yerinde değiştirilir.
 */
export type RngState = number[];

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** İki tamsayıyı (ör. maç tohumu ve taraf) tek bir tohuma karıştırır; yakın girdiler birbirinden uzak tohumlar verir. */
export function mixSeed(seed: number, salt: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ Math.imul(salt | 0, 0x27d4eb2f), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Tohumdan dört kelimelik başlangıç durumu üretir (ısınma turlarıyla). */
export function rngFromSeed(seed: number): RngState {
  const mix = splitmix32(seed);
  const state: RngState = [mix(), mix(), mix(), 1];
  for (let i = 0; i < 12; i++) rngNext(state);
  return state;
}

/** [0, 1) aralığında sayı döndürür. */
export function rngNext(state: RngState): number {
  let a = state[0]!;
  let b = state[1]!;
  let c = state[2]!;
  let d = state[3]!;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  state[0] = a >>> 0;
  state[1] = b >>> 0;
  state[2] = c >>> 0;
  state[3] = d >>> 0;
  return (t >>> 0) / 4294967296;
}

/** [0, n) aralığında tamsayı. */
export function rngInt(state: RngState, n: number): number {
  return Math.floor(rngNext(state) * n);
}
