import type { Layer, NoiseLayer, RingLayer, ToneLayer, Wave } from '../dsp';

/** Bir efekt tarifi: süre, doruk düzeyi ve çağa göre katman listesi. */
export interface Recipe {
  /** Arabellek uzunluğu (sn). */
  dur: number;
  /** Normalleştirme doruğu (0..1); göreli gürlük `config.ts` içindeki kazançla ayarlanır. */
  peak: number;
  layers(age: number): Layer[];
}

/** 1..5 çağ için beşli tablodan seçim (aralık dışı değerler kırpılır). */
export function byAge<T>(age: number, table: readonly [T, T, T, T, T]): T {
  const i = Math.min(5, Math.max(1, Math.round(age))) - 1;
  return table[i]!;
}

type Opt = { delay?: number; attack?: number; hold?: number };

/** Sinüs sesi, hızlı frekans düşüşü: gümbürtü/vuruş gövdesi. */
export function thump(f0: number, f1: number, tau: number, gain: number, o: Opt = {}): ToneLayer {
  return { k: 'tone', wave: 'sine', f: f0, fEnd: f1, sweep: tau * 0.4, tau, gain, ...o };
}

export function tone(wave: Wave, f: number, tau: number, gain: number, o: Partial<ToneLayer> = {}): ToneLayer {
  return { k: 'tone', wave, f, tau, gain, ...o };
}

export function noise(
  filter: NoiseLayer['filter'],
  f: number,
  tau: number,
  gain: number,
  o: Partial<NoiseLayer> = {},
): NoiseLayer {
  return { k: 'noise', filter, f, tau, gain, ...o };
}

export function ring(f: number, ratios: readonly number[], tau: number, gain: number, o: Opt = {}): RingLayer {
  return { k: 'ring', f, ratios, tau, gain, ...o };
}

/** Kısmi oranları: bronz, demir, cam/kristal. */
export const BRONZE = [1, 2.32, 3.7, 5.1] as const;
export const IRON = [1, 2.76, 5.4, 8.93] as const;
export const GLASS = [1, 2.0, 3.01, 4.2] as const;

/** Çağ başına temel dalga biçimi (ahşap/flüt -> lir -> sert -> testere -> sayısal). */
export const AGE_WAVE: readonly [Wave, Wave, Wave, Wave, Wave] = ['triangle', 'sine', 'square', 'saw', 'sine'];
