import { rngFromSeed, rngInt } from '../src/sim/rng';

/** Toplamı tam olarak totalMs olan, tamsayı milisaniyelik sabit fps kare süreleri. */
export function steadyFrames(fps: number, totalMs: number): number[] {
  const frames: number[] = [];
  let prev = 0;
  for (let i = 1; ; i++) {
    const boundary = Math.round((i * 1000) / fps);
    if (boundary >= totalMs) break;
    frames.push(boundary - prev);
    prev = boundary;
  }
  frames.push(totalMs - prev);
  return frames;
}

/** 5..60 ms arası rastgele (tohumlu) kare süreleri; toplam tam olarak totalMs. */
export function jitterFrames(seed: number, totalMs: number): number[] {
  const rng = rngFromSeed(seed);
  const frames: number[] = [];
  let sum = 0;
  while (sum < totalMs) {
    const f = Math.min(5 + rngInt(rng, 56), totalMs - sum);
    frames.push(f);
    sum += f;
  }
  return frames;
}
