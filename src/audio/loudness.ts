import { TAU } from './dsp';

/**
 * ITU-R BS.1770-4 algısal gürlük ölçümü (tek kanal) ve frekans dengesi.
 * Saf fonksiyonlar; ses bağlamı gerekmez. K-filtresi katsayıları 48 kHz tablosu yerine standardın tanımladığı
 * analog prototipten (ön filtre: yüksek raf, RLB: yüksek geçiren) çift doğrusal dönüşümle her örnekleme hızı için türetilir.
 * 48 kHz için türetilen değerler standardın yayımladığı katsayılarla eşleşir (testle doğrulanır).
 */

export const LUFS_OFFSET = -0.691;
export const BLOCK_SEC = 0.4;
export const HOP_SEC = 0.1;
export const ABS_GATE_LUFS = -70;
export const REL_GATE_LU = -10;
const FLOOR_LUFS = -120;

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Ön filtre (yüksek raf): f0 = 1681,97 Hz, G = +4,0 dB, Q = 0,7072. */
export function shelfCoefficients(fs: number): BiquadCoefficients {
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const f0 = 1681.974450955533;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}

/** RLB ağırlık süzgeci (yüksek geçiren): f0 = 38,14 Hz, Q = 0,5003. */
export function highPassCoefficients(fs: number): BiquadCoefficients {
  const Q = 0.5003270373238773;
  const f0 = 38.13547087602444;
  const K = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + K / Q + K * K;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
}

function runBiquad(x: Float64Array, c: BiquadCoefficients): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const out = c.b0 * v + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = out;
    y[i] = out;
  }
  return y;
}

/** K-ağırlıklı sinyal (ön filtre + RLB). */
export function kWeight(data: Float32Array | Float64Array, fs: number): Float64Array {
  const x = Float64Array.from(data);
  return runBiquad(runBiquad(x, shelfCoefficients(fs)), highPassCoefficients(fs));
}

/** Ortalama kare -> LUFS (tek kanal). */
export function meanSquareToLufs(ms: number): number {
  return ms > 1e-14 ? LUFS_OFFSET + 10 * Math.log10(ms) : FLOOR_LUFS;
}

/** 400 ms blokların (%75 örtüşmeli) K-ağırlıklı ortalama kareleri. Son bloklar sıfırla doldurulmuş sayılır. */
export function blockMeanSquares(weighted: Float64Array, fs: number): number[] {
  const win = Math.max(1, Math.round(BLOCK_SEC * fs));
  const hop = Math.max(1, Math.round(HOP_SEC * fs));
  const ps = new Float64Array(weighted.length + 1);
  for (let i = 0; i < weighted.length; i++) ps[i + 1] = ps[i]! + weighted[i]! * weighted[i]!;
  const out: number[] = [];
  const last = Math.max(0, weighted.length - win);
  for (let s = 0; ; s += hop) {
    const start = Math.min(s, last);
    out.push((ps[Math.min(weighted.length, start + win)]! - ps[start]!) / win);
    if (start >= last) break;
  }
  return out;
}

export interface Loudness {
  /** Kapılamasız en yüksek 400 ms blok gürlüğü (LUFS) — kısa efektler için. */
  momentaryMaxLufs: number;
  /** Mutlak (−70 LUFS) ve göreli (−10 LU) kapılı entegre gürlük (LUFS) — müzik için. */
  integratedLufs: number;
}

/**
 * BS.1770-4 gürlüğü. Kısa tamponlar (< 400 ms) tek bloğa sıfır dolgulu sayılır: kısa bir tıklama,
 * bir blok boyunca ortalandığında ölçülür.
 */
export function measureLoudness(data: Float32Array, fs: number, gain = 1): Loudness {
  const weighted = kWeight(data, fs);
  const g2 = gain * gain;
  const blocks = blockMeanSquares(weighted, fs).map((ms) => ms * g2);
  const momentaryMax = Math.max(...blocks);

  const aboveAbs = blocks.filter((ms) => meanSquareToLufs(ms) > ABS_GATE_LUFS);
  let integrated = FLOOR_LUFS;
  if (aboveAbs.length > 0) {
    const relGate = meanSquareToLufs(aboveAbs.reduce((a, b) => a + b, 0) / aboveAbs.length) + REL_GATE_LU;
    const gated = aboveAbs.filter((ms) => meanSquareToLufs(ms) > relGate);
    if (gated.length > 0) integrated = meanSquareToLufs(gated.reduce((a, b) => a + b, 0) / gated.length);
  }
  return { momentaryMaxLufs: meanSquareToLufs(momentaryMax), integratedLufs: integrated };
}

// ---- Frekans dengesi --------------------------------------------------------

export const BAND_EDGES_HZ = { low: 250, high: 4000 } as const;

export interface BandShares {
  /** < 250 Hz enerji payı (0..1) */
  low: number;
  /** 250 Hz – 4 kHz */
  mid: number;
  /** > 4 kHz */
  high: number;
}

/** Yerinde radix-2 FFT (karmaşık). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Güç spektrumu özeti: üç bant payı ve spektral ağırlık merkezi (Hz). */
export interface SpectrumStats extends BandShares {
  /** Güçle ağırlıklı ortalama frekans (Hz): tınının "parlaklığı". */
  centroidHz: number;
}

/** Tüm tamponun güç spektrumundan (Parseval) bant payları ve spektral ağırlık merkezi. */
export function spectrumStats(data: Float32Array, fs: number): SpectrumStats {
  let n = 1;
  while (n < data.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < data.length; i++) re[i] = data[i]!;
  fft(re, im);
  const binHz = fs / n;
  let low = 0;
  let mid = 0;
  let high = 0;
  let moment = 0;
  for (let k = 1; k <= n / 2; k++) {
    const p = re[k]! * re[k]! + im[k]! * im[k]!;
    const f = k * binHz;
    moment += p * f;
    if (f < BAND_EDGES_HZ.low) low += p;
    else if (f < BAND_EDGES_HZ.high) mid += p;
    else high += p;
  }
  const total = low + mid + high;
  return total > 0
    ? { low: low / total, mid: mid / total, high: high / total, centroidHz: moment / total }
    : { low: 0, mid: 0, high: 0, centroidHz: 0 };
}

/** Üç bant (< 250 Hz, 250 Hz–4 kHz, > 4 kHz) enerji payları (tüm tamponun güç spektrumu, Parseval). */
export function bandShares(data: Float32Array, fs: number): BandShares {
  const { low, mid, high } = spectrumStats(data, fs);
  return { low, mid, high };
}
