import { BALANCE } from '../config';
import { Biquad, type Rng } from '../dsp';
import { bandShares, type BandShares } from '../loudness';

/**
 * Frekans dengesi düzeltmesi (tarifin son katmanı). Bir efektin enerjisi tek bantta (< 250 Hz, 250 Hz–4 kHz, > 4 kHz)
 * `BALANCE.trigger` payını aşıyorsa, yetersiz kalan bantlara efektin kendi zarfını izleyen küçük bir süzgeçli gürültü
 * katmanı eklenir (bas efekte hışırtı ve gövde, tam tonal efekte hava ve gümbürtü). Böylece hiçbir efekt "tamamen bas"
 * ya da "tamamen tonal" kalmaz. Saf ve tekrarlanabilir (gürültü tarifin tohumundan gelir).
 */

type Band = keyof BandShares;

/** Ana sinyalin kısa zaman zarfı: hızlı yükselen, yavaş sönen |x| takipçisi. */
function followEnvelope(buf: Float32Array, sr: number): Float32Array {
  const up = Math.exp(-1 / (BALANCE.envAttackSec * sr));
  const down = Math.exp(-1 / (BALANCE.envReleaseSec * sr));
  const env = new Float32Array(buf.length);
  let e = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]!);
    e = a > e ? a + (e - a) * up : a + (e - a) * down;
    env[i] = e;
  }
  return env;
}

function bandNoise(band: Band, sr: number, env: Float32Array, rng: Rng): Float32Array {
  const filters =
    band === 'low'
      ? [new Biquad(sr, 'lp', BALANCE.lowHz, 0.7), new Biquad(sr, 'lp', BALANCE.lowHz, 0.7)]
      : band === 'mid'
        ? [new Biquad(sr, 'bp', BALANCE.midHz, 0.4)]
        : [new Biquad(sr, 'hp', BALANCE.highHz, 0.7), new Biquad(sr, 'hp', BALANCE.highHz, 0.7)];
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) {
    let v = rng() * 2 - 1;
    for (const f of filters) v = f.process(v);
    out[i] = v * env[i]!;
  }
  return out;
}

/** Gerekirse `buf`a bant dengeleyici katman ekler (yerinde). */
export function balanceBands(buf: Float32Array, sr: number, rng: Rng): void {
  const shares = bandShares(buf, sr);
  if (Math.max(shares.low, shares.mid, shares.high) <= BALANCE.trigger) return;

  let energy = 0;
  for (const v of buf) energy += v * v;
  if (energy <= 0) return;
  const env = followEnvelope(buf, sr);

  for (const band of ['low', 'mid', 'high'] as const) {
    if (shares[band] >= BALANCE.minShare) continue;
    const filler = bandNoise(band, sr, env, rng);
    let fe = 0;
    for (const v of filler) fe += v * v;
    if (fe <= 0) continue;
    const g = Math.sqrt((BALANCE.fillShare * energy) / fe);
    for (let i = 0; i < buf.length; i++) buf[i]! += filler[i]! * g;
  }
}
