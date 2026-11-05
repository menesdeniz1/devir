import {
  Biquad,
  Osc,
  TAU,
  clamp,
  createRng,
  finalize,
  hashString,
  midiToFreq,
  renderLayers,
  sampleCount,
  type Layer,
  type Rng,
  type Wave,
} from '../dsp';

/**
 * Müzik enstrümanları: her biri bir nota için (örnek hızı, MIDI, süre) Float32Array üretir.
 * Çağ paleti: 1 davul + kemik flüt, 2 lir + bronz zil, 3 org + yaylı, 4 bakır nefesli + mekanik ritim, 5 sentezleyici.
 */

export const INSTRUMENT_IDS = [
  // İlkel
  'frameDrum', 'skinDrum', 'stickClick', 'shaker', 'boneFlute', 'droneHum',
  // Antik
  'lyre', 'bronzeBell', 'handDrum', 'softPad', 'aulos',
  // Orta
  'organ', 'strings', 'taborDrum', 'lute', 'bowedBass',
  // Endüstri
  'brass', 'clank', 'kickMech', 'steamHiss', 'pistonBass', 'pistonArp',
  // Gelecek
  'synthLead', 'synthArp', 'synthPad', 'eKick', 'eSnare', 'eHat', 'subBass',
] as const;

export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

export interface NoteCtx {
  sr: number;
  midi: number;
  /** Nota süresi (sn); bırakma kuyruğu bunun üstüne eklenir. */
  dur: number;
  rng: Rng;
}

type InstrumentFn = (c: NoteCtx) => Float32Array;

// ---- Çıkarmalı sentezleyici (süzgeç + zarf + vibrato) -----------------------

interface SynthParams {
  waves?: readonly Wave[];
  /** Sinüs kısmi sesleri [çarpan, genlik]; verilirse `waves` yerine eklemeli sentez yapılır. */
  partials?: readonly (readonly [number, number])[];
  /** Sesler arası toplam ayar farkı (cent). */
  detuneCents?: number;
  cutoff0: number;
  cutoff1: number;
  cutoffTau: number;
  attack: number;
  decayTau: number;
  sustain: number;
  release: number;
  vibHz?: number;
  vibDepth?: number;
  vibDelay?: number;
  breath?: number;
  tremHz?: number;
  tremDepth?: number;
  drive?: number;
}

function synth(p: SynthParams): InstrumentFn {
  return ({ sr, midi, dur, rng }) => {
    const total = dur + p.release;
    const out = new Float32Array(sampleCount(sr, total));
    const f0 = midiToFreq(midi);
    const voiceCount = p.partials ? p.partials.length : (p.waves?.length ?? 1);
    const oscs: Osc[] = [];
    for (let v = 0; v < voiceCount; v++) {
      const wave: Wave = p.partials ? 'sine' : (p.waves?.[v] ?? 'saw');
      oscs.push(new Osc(sr, wave, v * 0.37));
    }
    const spread = p.detuneCents ?? 0;
    const lp = new Biquad(sr, 'lp', p.cutoff0, 0.9);
    const breath = p.breath ? new Biquad(sr, 'bp', clamp(f0 * 1.5, 200, 6000), 2) : null;
    const norm = 1 / Math.sqrt(voiceCount);
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      let f = f0;
      if (p.vibHz) f *= 1 + (p.vibDepth ?? 0.008) * Math.sin(TAU * p.vibHz * t) * (t > (p.vibDelay ?? 0) ? 1 : 0);
      let s = 0;
      for (let v = 0; v < voiceCount; v++) {
        if (p.partials) {
          const [mul, amp] = p.partials[v]!;
          s += oscs[v]!.next(f * mul) * amp;
        } else {
          const cents = voiceCount > 1 ? (v / (voiceCount - 1) - 0.5) * spread : 0;
          s += oscs[v]!.next(f * Math.pow(2, cents / 1200));
        }
      }
      s *= norm;
      if (breath) s += breath.process(rng() * 2 - 1) * (p.breath ?? 0) * 2;
      if ((i & 31) === 0) lp.set(p.cutoff1 + (p.cutoff0 - p.cutoff1) * Math.exp(-t / p.cutoffTau));
      s = lp.process(s);
      if (p.drive) s = Math.tanh(s * p.drive);
      if (p.tremHz) s *= 1 - (p.tremDepth ?? 0.05) * (0.5 + 0.5 * Math.sin(TAU * p.tremHz * t));
      // Genlik zarfı: yükselme, düşüş -> sustain, nota bitince bırakma.
      let amp = t < p.attack ? t / p.attack : p.sustain + (1 - p.sustain) * Math.exp(-(t - p.attack) / p.decayTau);
      if (t > dur) {
        const r = 1 - (t - dur) / p.release;
        amp *= r > 0 ? r * r : 0;
      }
      out[i] = s * amp;
    }
    return finalize(out, sr, 0.7);
  };
}

// ---- Vurmalılar -------------------------------------------------------------

interface DrumParams {
  /** Başlangıç frekans çarpanı (1 + f0Mul) ve inişi. */
  f0Mul: number;
  pitchTau: number;
  tau: number;
  noise?: { filter: 'lp' | 'hp' | 'bp'; f: number; tau: number; gain: number };
  len: number;
}

function drum(p: DrumParams): InstrumentFn {
  return ({ sr, midi, rng }) => {
    const f = midiToFreq(midi);
    const layers: Layer[] = [{ k: 'tone', wave: 'sine', f: f * (1 + p.f0Mul), fEnd: f, sweep: p.pitchTau, tau: p.tau, gain: 1 }];
    if (p.noise) layers.push({ k: 'noise', filter: p.noise.filter, f: p.noise.f, tau: p.noise.tau, gain: p.noise.gain, q: 1 });
    return finalize(renderLayers(sr, p.len, layers, rng), sr, 0.85);
  };
}

function noiseHit(filter: 'lp' | 'hp' | 'bp', f: number, tau: number, len: number, q = 1, attack = 0.002): InstrumentFn {
  return ({ sr, rng }) => finalize(renderLayers(sr, len, [{ k: 'noise', filter, f, q, tau, gain: 1, attack }], rng), sr, 0.6);
}

// ---- Telli (Karplus-Strong) -------------------------------------------------

function pluck(decay: number, bright: number): InstrumentFn {
  return ({ sr, midi, dur, rng }) => {
    const f = midiToFreq(midi);
    const n = Math.max(2, Math.round(sr / f));
    const len = sampleCount(sr, clamp(dur + 0.5, 0.4, 2.6));
    const y = new Float32Array(len);
    let prev = 0;
    for (let i = 0; i < Math.min(n, len); i++) {
      prev = prev + bright * (rng() * 2 - 1 - prev); // tek kutuplu süzülmüş gürültü
      y[i] = prev;
    }
    for (let i = n; i < len; i++) {
      const a = y[i - n]!;
      const b = i - n - 1 >= 0 ? y[i - n - 1]! : a;
      y[i] = decay * 0.5 * (a + b);
    }
    return finalize(y, sr, 0.7);
  };
}

// ---- Çınlayan metal ---------------------------------------------------------

function bell(ratios: readonly number[], tau: number, len: number): InstrumentFn {
  return ({ sr, midi, rng }) =>
    finalize(renderLayers(sr, len, [{ k: 'ring', f: midiToFreq(midi), ratios, tau, gain: 1 }], rng), sr, 0.7);
}

const INSTRUMENTS: Record<InstrumentId, InstrumentFn> = {
  // İlkel Çağ
  frameDrum: drum({ f0Mul: 1.1, pitchTau: 0.03, tau: 0.14, noise: { filter: 'lp', f: 350, tau: 0.03, gain: 0.35 }, len: 0.6 }),
  skinDrum: drum({ f0Mul: 0.8, pitchTau: 0.02, tau: 0.09, noise: { filter: 'bp', f: 1500, tau: 0.02, gain: 0.3 }, len: 0.35 }),
  stickClick: noiseHit('bp', 2400, 0.02, 0.15, 2),
  shaker: noiseHit('hp', 6000, 0.04, 0.2, 0.7, 0.012),
  boneFlute: synth({
    partials: [[1, 1], [2, 0.18], [3, 0.08]],
    cutoff0: 4000, cutoff1: 4000, cutoffTau: 1,
    attack: 0.05, decayTau: 0.4, sustain: 0.85, release: 0.15,
    vibHz: 5.2, vibDepth: 0.008, vibDelay: 0.15, breath: 0.18,
  }),
  droneHum: synth({
    waves: ['saw', 'saw'], detuneCents: 8,
    cutoff0: 260, cutoff1: 260, cutoffTau: 1,
    attack: 0.5, decayTau: 1, sustain: 1, release: 1.0,
  }),
  // Antik Çağ
  lyre: pluck(0.995, 0.5),
  bronzeBell: bell([1, 2.0, 2.76, 4.07, 5.43], 0.9, 2.2),
  handDrum: drum({ f0Mul: 0.9, pitchTau: 0.02, tau: 0.11, noise: { filter: 'bp', f: 1800, tau: 0.02, gain: 0.4 }, len: 0.4 }),
  softPad: synth({
    waves: ['triangle', 'triangle', 'sine'], detuneCents: 10,
    cutoff0: 2000, cutoff1: 2000, cutoffTau: 1,
    attack: 0.4, decayTau: 1, sustain: 1, release: 0.8,
  }),
  aulos: synth({
    waves: ['pulse25'],
    cutoff0: 2200, cutoff1: 1600, cutoffTau: 0.3,
    attack: 0.03, decayTau: 0.5, sustain: 0.8, release: 0.12,
    vibHz: 5, vibDepth: 0.01, vibDelay: 0.2, breath: 0.08,
  }),
  // Orta Çağ
  organ: synth({
    partials: [[1, 1], [2, 0.7], [3, 0.5], [4, 0.35], [6, 0.22], [8, 0.15]],
    cutoff0: 5000, cutoff1: 5000, cutoffTau: 1,
    attack: 0.03, decayTau: 1, sustain: 1, release: 0.1,
    tremHz: 5.5, tremDepth: 0.12,
  }),
  strings: synth({
    waves: ['saw', 'saw', 'saw'], detuneCents: 14,
    cutoff0: 2600, cutoff1: 2600, cutoffTau: 1,
    attack: 0.25, decayTau: 1, sustain: 1, release: 0.5,
    vibHz: 5.5, vibDepth: 0.006, vibDelay: 0.25,
  }),
  taborDrum: drum({ f0Mul: 1.0, pitchTau: 0.025, tau: 0.1, noise: { filter: 'hp', f: 3000, tau: 0.09, gain: 0.6 }, len: 0.4 }),
  lute: pluck(0.992, 0.35),
  bowedBass: synth({
    waves: ['saw'],
    cutoff0: 500, cutoff1: 500, cutoffTau: 1,
    attack: 0.12, decayTau: 1, sustain: 0.9, release: 0.2,
  }),
  // Endüstri Çağı
  brass: synth({
    waves: ['saw', 'saw'], detuneCents: 6,
    cutoff0: 3500, cutoff1: 1600, cutoffTau: 0.25,
    attack: 0.04, decayTau: 0.5, sustain: 0.85, release: 0.12,
    vibHz: 5, vibDepth: 0.008, vibDelay: 0.2, drive: 1.5,
  }),
  clank: ({ sr, midi, rng }) =>
    finalize(
      renderLayers(
        sr,
        0.5,
        [
          { k: 'ring', f: midiToFreq(midi), ratios: [1, 2.76, 5.4, 8.93, 13], tau: 0.12, gain: 1 },
          { k: 'noise', filter: 'hp', f: 4000, tau: 0.01, gain: 0.8 },
        ],
        rng,
      ),
      sr,
      0.7,
    ),
  kickMech: drum({ f0Mul: 2.2, pitchTau: 0.03, tau: 0.12, noise: { filter: 'hp', f: 3000, tau: 0.005, gain: 0.5 }, len: 0.5 }),
  steamHiss: noiseHit('bp', 5500, 0.08, 0.3, 0.6, 0.006),
  pistonBass: synth({
    waves: ['saw', 'square'], detuneCents: 4,
    cutoff0: 1400, cutoff1: 300, cutoffTau: 0.15,
    attack: 0.005, decayTau: 0.25, sustain: 0.3, release: 0.08,
  }),
  pistonArp: synth({
    waves: ['pulse25'],
    cutoff0: 4500, cutoff1: 1200, cutoffTau: 0.1,
    attack: 0.003, decayTau: 0.12, sustain: 0.2, release: 0.05,
  }),
  // Gelecek Çağı
  synthLead: synth({
    waves: ['saw', 'saw', 'square'], detuneCents: 12,
    cutoff0: 5000, cutoff1: 1800, cutoffTau: 0.3,
    attack: 0.01, decayTau: 0.5, sustain: 0.6, release: 0.25,
    vibHz: 5.5, vibDepth: 0.01, vibDelay: 0.25,
  }),
  synthArp: synth({
    waves: ['pulse25', 'square'], detuneCents: 6,
    cutoff0: 5500, cutoff1: 1400, cutoffTau: 0.08,
    attack: 0.003, decayTau: 0.1, sustain: 0.15, release: 0.06,
  }),
  synthPad: synth({
    waves: ['saw', 'saw', 'saw', 'saw'], detuneCents: 16,
    cutoff0: 1500, cutoff1: 1500, cutoffTau: 1,
    attack: 0.6, decayTau: 1, sustain: 1, release: 1.0,
  }),
  eKick: drum({ f0Mul: 3, pitchTau: 0.02, tau: 0.16, len: 0.5 }),
  eSnare: ({ sr, rng }) =>
    finalize(
      renderLayers(
        sr,
        0.35,
        [
          { k: 'noise', filter: 'hp', f: 1800, tau: 0.1, gain: 0.8, q: 0.8 },
          { k: 'tone', wave: 'sine', f: 330, fEnd: 190, sweep: 0.03, tau: 0.06, gain: 0.5 },
        ],
        rng,
      ),
      sr,
      0.75,
    ),
  eHat: noiseHit('hp', 8500, 0.035, 0.15, 0.7),
  subBass: synth({
    partials: [[1, 1], [2, 0.25]],
    cutoff0: 400, cutoff1: 400, cutoffTau: 1,
    attack: 0.01, decayTau: 0.5, sustain: 0.8, release: 0.1,
  }),
};

/** Bir enstrümanın bırakma kuyruğunu da içeren örnekleri üretir (tohum: enstrüman+nota, tekrarlanabilir). */
export function renderInstrument(id: InstrumentId, sr: number, midi: number, durSec: number): Float32Array {
  const rng = createRng(hashString(`${id}:${midi}`));
  const dur = Math.max(0.05, durSec);
  return INSTRUMENTS[id]({ sr, midi, dur, rng });
}
