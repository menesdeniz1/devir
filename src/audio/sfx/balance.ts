import { BALANCE } from '../config';
import { Biquad, type Rng } from '../dsp';
import { bandShares, type BandShares } from '../loudness';

/**
 * Frekans dengesi düzeltmesi (tarifin son katmanı). Bir efektin enerjisi tek bantta (< 250 Hz, 250 Hz–4 kHz, > 4 kHz)
 * `BALANCE.trigger` payını aşıyorsa, komşu banda efektin kendi zarfını izleyen küçük bir süzgeçli gürültü katmanı
 * eklenir: bas efekte orta bantta gövde/doku, tonal (orta bant) efekte alçak bantta gövde, tiz efekte orta bant.
 * Dolgu yalnızca baskın bandı eşiğe indirecek kadardır. Tiz banda (> 4 kHz) hiçbir zaman dolgu eklenmez: önceki
 * sürüm her efekte zarfı izleyen 5,5 kHz üstü hışırtı ekliyordu ve bu, ilk oyun testindeki "itici" tınının ana
 * nedeniydi. Saf ve tekrarlanabilir (gürültü tarifin tohumundan gelir).
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

function bandNoise(band: Exclude<Band, 'high'>, sr: number, env: Float32Array, rng: Rng): Float32Array {
  const filters =
    band === 'low'
      ? [new Biquad(sr, 'lp', BALANCE.lowHz, 0.7), new Biquad(sr, 'lp', BALANCE.lowHz, 0.7)]
      : [new Biquad(sr, 'bp', BALANCE.midHz, 0.4), new Biquad(sr, 'lp', BALANCE.midCeilHz, 0.7)];
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) {
    let v = rng() * 2 - 1;
    for (const f of filters) v = f.process(v);
    out[i] = v * env[i]!;
  }
  return out;
}

/** Baskın banda göre dolgunun gideceği komşu bant (tiz bant hiç doldurulmaz). */
const FILL_BAND: Record<Band, Exclude<Band, 'high'>> = { low: 'mid', mid: 'low', high: 'mid' };

/** Dengeleyici en çok bu kadar tur döner (dolgunun bir kısmı başka banda düşebilir). */
const MAX_PASSES = 3;

/** Gerekirse `buf`a bant dengeleyici katman ekler (yerinde). */
export function balanceBands(buf: Float32Array, sr: number, rng: Rng): void {
  for (let pass = 0; pass < MAX_PASSES; pass++) if (!balancePass(buf, sr, rng)) return;
}

/** Tek dengeleme turu; dolgu eklendiyse true. */
function balancePass(buf: Float32Array, sr: number, rng: Rng): boolean {
  const shares = bandShares(buf, sr);
  const dominant = (['low', 'mid', 'high'] as const).reduce((a, b) => (shares[b] > shares[a] ? b : a));
  if (shares[dominant] <= BALANCE.trigger) return false;

  let energy = 0;
  for (const v of buf) energy += v * v;
  if (energy <= 0) return false;
  const env = followEnvelope(buf, sr);

  const filler = bandNoise(FILL_BAND[dominant], sr, env, rng);
  let fe = 0;
  for (const v of filler) fe += v * v;
  if (fe <= 0) return false;
  // Baskın payı eşiğe indirecek dolgu oranı (tamamı komşu banda düşmeyebileceği için küçük pay), en çok fillShare.
  const share = Math.min(BALANCE.fillShare, (shares[dominant] / BALANCE.trigger - 1) * 1.25 + 0.01);
  const g = Math.sqrt((share * energy) / fe);
  for (let i = 0; i < buf.length; i++) buf[i]! += filler[i]! * g;
  return true;
}
