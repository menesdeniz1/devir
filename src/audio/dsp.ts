/**
 * Küçük sayısal ses sentezi araç kutusu (osilatör, gürültü, zarf, süzgeç).
 * Saf fonksiyonlar/sınıflar; AudioContext veya DOM gerektirmez. Efekt ve müzik notaları
 * bununla Float32Array olarak üretilir, sonra AudioBuffer'a kopyalanır.
 */

export type Rng = () => number;

/** Tohumlu, tekrarlanabilir [0,1) üreteci (mulberry32). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAU = Math.PI * 2;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** MIDI nota numarası -> Hz (A4 = 69 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Dizgeden kararlı bir tohum üretir (FNV-1a). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function sampleCount(sr: number, seconds: number): number {
  return Math.max(1, Math.round(sr * seconds));
}

// ---- Osilatör ---------------------------------------------------------------

export type Wave = 'sine' | 'triangle' | 'saw' | 'square' | 'pulse25';

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Sınırlı bant genişlikli (polyBLEP) osilatör; frekans her örnekte değiştirilebilir. */
export class Osc {
  private phase: number;

  constructor(
    private readonly sr: number,
    private readonly wave: Wave,
    phase0 = 0,
  ) {
    this.phase = phase0 - Math.floor(phase0);
  }

  next(freq: number): number {
    const dt = clamp(freq / this.sr, 0, 0.45);
    const p = this.phase;
    let v: number;
    switch (this.wave) {
      case 'sine':
        v = Math.sin(TAU * p);
        break;
      case 'triangle':
        v = 4 * Math.abs(p - 0.5) - 1;
        break;
      case 'saw':
        v = 2 * p - 1 - polyBlep(p, dt);
        break;
      case 'square':
        v = (p < 0.5 ? 1 : -1) + polyBlep(p, dt) - polyBlep((p + 0.5) % 1, dt);
        break;
      case 'pulse25':
        v = (p < 0.25 ? 1 : -1) + polyBlep(p, dt) - polyBlep((p + 0.75) % 1, dt);
        break;
    }
    let np = p + dt;
    if (np >= 1) np -= Math.floor(np);
    this.phase = np;
    return v;
  }
}

// ---- Süzgeç -----------------------------------------------------------------

export type FilterKind = 'lp' | 'hp' | 'bp';

/** RBJ ikinci dereceden süzgeç. Kesim sıklığı `set` ile çalışırken değiştirilebilir. */
export class Biquad {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(
    private readonly sr: number,
    private readonly kind: FilterKind,
    freq: number,
    private readonly q = 0.707,
  ) {
    this.set(freq);
  }

  set(freq: number): void {
    const f = clamp(freq, 20, this.sr * 0.45);
    const w0 = (TAU * f) / this.sr;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * this.q);
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (this.kind === 'lp') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
    } else if (this.kind === 'hp') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// ---- Zarf -------------------------------------------------------------------

/**
 * Genel zarf: `attack` sn'de 0'dan 1'e çıkar, `hold` sn sabit kalır, sonra `tau` zaman sabitiyle üstel söner.
 */
export function envelope(t: number, attack: number, hold: number, tau: number): number {
  if (t < attack) return attack > 0 ? t / attack : 1;
  const u = t - attack;
  if (u < hold) return 1;
  return Math.exp(-(u - hold) / tau);
}

// ---- Katmanlı efekt sentezi -------------------------------------------------

interface LayerBase {
  /** Katmanın doruk genliği (karıştırmadan önce). */
  gain: number;
  /** Söne başladıktan sonraki üstel zaman sabiti (sn). */
  tau: number;
  /** Katmanın başlama gecikmesi (sn). */
  delay?: number;
  /** Yükselme süresi (sn). */
  attack?: number;
  /** Sabit tutma süresi (sn); sonra söner. */
  hold?: number;
}

/** Osilatör katmanı; `fEnd` verilirse frekans `sweep` zaman sabitiyle f -> fEnd kayar. */
export interface ToneLayer extends LayerBase {
  k: 'tone';
  wave: Wave;
  f: number;
  fEnd?: number;
  sweep?: number;
  vibHz?: number;
  /** Oransal vibrato derinliği (0.01 = %1). */
  vibDepth?: number;
}

/** Süzgeçli beyaz gürültü; `fEnd` verilirse süzgeç sıklığı `sweepTau` ile kayar. */
export interface NoiseLayer extends LayerBase {
  k: 'noise';
  filter: FilterKind | 'none';
  f: number;
  fEnd?: number;
  q?: number;
  sweepTau?: number;
}

/** Metalik/çınlayan katman: f * ratios[i] frekanslı, giderek hızlı sönen kısmi sesler. */
export interface RingLayer extends LayerBase {
  k: 'ring';
  f: number;
  ratios: readonly number[];
}

export type Layer = ToneLayer | NoiseLayer | RingLayer;

/** Üstel frekans kayması: t=0'da f, sonsuzda fEnd. */
function sweptFreq(f: number, fEnd: number | undefined, sweep: number, t: number): number {
  return fEnd === undefined ? f : fEnd + (f - fEnd) * Math.exp(-t / sweep);
}

function layerSpan(l: Layer): number {
  return (l.delay ?? 0) + (l.attack ?? 0) + (l.hold ?? 0) + l.tau * 9.5;
}

function renderLayer(out: Float32Array, sr: number, l: Layer, rng: Rng): void {
  const start = Math.round((l.delay ?? 0) * sr);
  const attack = l.attack ?? 0.002;
  const hold = l.hold ?? 0;
  const end = Math.min(out.length, Math.round(layerSpan(l) * sr));
  if (start >= out.length) return;
  const nyq = sr * 0.45;

  if (l.k === 'tone') {
    const osc = new Osc(sr, l.wave);
    const sweep = l.sweep ?? l.tau * 0.35;
    for (let i = start; i < end; i++) {
      const t = (i - start) / sr;
      let f = sweptFreq(l.f, l.fEnd, sweep, t);
      if (l.vibHz) f *= 1 + (l.vibDepth ?? 0.01) * Math.sin(TAU * l.vibHz * t);
      out[i]! += osc.next(f) * l.gain * envelope(t, attack, hold, l.tau);
    }
  } else if (l.k === 'noise') {
    const filter = l.filter === 'none' ? null : new Biquad(sr, l.filter, l.f, l.q ?? 0.8);
    const sweepTau = l.sweepTau ?? l.tau;
    for (let i = start; i < end; i++) {
      const t = (i - start) / sr;
      if (filter && l.fEnd !== undefined && (i & 15) === 0) filter.set(sweptFreq(l.f, l.fEnd, sweepTau, t));
      const n = rng() * 2 - 1;
      out[i]! += (filter ? filter.process(n) : n) * l.gain * envelope(t, attack, hold, l.tau);
    }
  } else {
    const freqs: number[] = [];
    const amps: number[] = [];
    const taus: number[] = [];
    l.ratios.forEach((r, idx) => {
      const f = l.f * r;
      if (f < nyq) {
        freqs.push(f);
        amps.push(1 / (1 + idx * 0.6));
        taus.push(l.tau / (1 + idx * 0.7));
      }
    });
    for (let i = start; i < end; i++) {
      const t = (i - start) / sr;
      let s = 0;
      for (let p = 0; p < freqs.length; p++) {
        s += Math.sin(TAU * freqs[p]! * t) * amps[p]! * envelope(t, attack, hold, taus[p]!);
      }
      out[i]! += s * l.gain;
    }
  }
}

/** Katmanları toplayıp `durSec` uzunluğunda tek arabellek üretir (normalleştirilmemiş). */
export function renderLayers(sr: number, durSec: number, layers: readonly Layer[], rng: Rng): Float32Array {
  const out = new Float32Array(sampleCount(sr, durSec));
  for (const layer of layers) renderLayer(out, sr, layer, rng);
  return out;
}

/** Tepeyi `peak`e ölçekler, başa/sona tıklamayı önleyen kısa yükselme-sönme uygular, sonlu değerleri garanti eder. */
export function finalize(buf: Float32Array, sr: number, peak: number): Float32Array {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    if (!Number.isFinite(buf[i]!)) buf[i] = 0;
    sum += buf[i]!;
  }
  // Ortalama (DC) sapmasını kaldır.
  const mean = sum / buf.length;
  let max = 0;
  for (let i = 0; i < buf.length; i++) {
    buf[i]! -= mean;
    if (Math.abs(buf[i]!) > max) max = Math.abs(buf[i]!);
  }
  const scale = max > 1e-9 ? peak / max : 0;
  const fadeIn = Math.min(buf.length, Math.round(sr * 0.0015));
  const fadeOut = Math.min(buf.length, Math.round(sr * 0.03));
  // Sönümlerden sonra kalan ortalama, sönüm profiliyle ağırlıklı çıkarılır (uçlar sıfır kalır, DC ≈ 0).
  const fade = new Float32Array(buf.length);
  let sumY = 0;
  let sumW = 0;
  for (let i = 0; i < buf.length; i++) {
    let w = 1;
    if (i < fadeIn) w *= i / fadeIn;
    const fromEnd = buf.length - 1 - i;
    if (fromEnd < fadeOut) w *= (fromEnd / fadeOut) ** 2;
    fade[i] = w;
    buf[i]! *= scale * w;
    sumY += buf[i]!;
    sumW += w;
  }
  const c = sumW > 0 ? sumY / sumW : 0;
  for (let i = 0; i < buf.length; i++) buf[i]! -= c * fade[i]!;
  return buf;
}

// ---- Ölçüm ------------------------------------------------------------------

/** Kısa pencere (varsayılan 400 ms) en yüksek RMS (doğrusal). Pencere arabellek sonunda sıfırla doldurulmuş sayılır. */
export function windowRms(data: Float32Array, sr: number, windowSec = 0.4, hopSec = 0.025): number {
  const win = Math.max(1, Math.round(windowSec * sr));
  const hop = Math.max(1, Math.round(hopSec * sr));
  const ps = new Float64Array(data.length + 1);
  for (let i = 0; i < data.length; i++) ps[i + 1] = ps[i]! + data[i]! * data[i]!;
  let best = 0;
  for (let s = 0; s < data.length; s += hop) {
    const e = Math.min(data.length, s + win);
    best = Math.max(best, ps[e]! - ps[s]!);
  }
  return Math.sqrt(best / win);
}
