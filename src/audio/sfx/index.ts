import { MIX, SFX_LEVEL, SFX_SETTINGS, SOFTEN } from '../config';
import { Biquad, createRng, finalize, hashString, renderLayers, type Layer, type Rng } from '../dsp';
import { measureLoudness } from '../loudness';
import { balanceBands } from './balance';
import { ABILITY_RECIPES } from './abilities';
import { COMBAT_RECIPES } from './combat';
import { SFX_IDS, type SfxId } from './ids';
import type { Recipe } from './layers';
import { STRUCTURE_RECIPES } from './structures';
import { UI_RECIPES } from './ui';

export { SFX_IDS } from './ids';
export type { SfxId } from './ids';
export type { Recipe } from './layers';

/** Tüm efekt tarifleri. Her SfxId için bir tarif bulunur (test garantisi). */
export const SFX_RECIPES = {
  ...COMBAT_RECIPES,
  ...STRUCTURE_RECIPES,
  ...ABILITY_RECIPES,
  ...UI_RECIPES,
} as Record<SfxId, Recipe>;

/** Efekt örnek hızı; yüksek tizler gerekmediğinden bellek için 32 kHz. */
export const SFX_SAMPLE_RATE = 32000;

export function clampAge(age: number): number {
  return Math.min(5, Math.max(1, Math.round(Number.isFinite(age) ? age : 1)));
}

/** Tını çeşidi sapmaları (±oran): perde, sönüm süresi, katman kazancı. Çeşit 0 tarifin kendisidir. */
const VARIANT_SPREAD = { pitch: 0.05, tau: 0.12, gain: 0.15 } as const;

/** Bir tını çeşidi: her katmanın perdesi, sönümü ve kazancı tohumlu küçük sapmalarla değişir (organik çeşitlilik). */
function varyLayers(layers: readonly Layer[], rng: Rng): Layer[] {
  const dev = (spread: number) => 1 + (rng() * 2 - 1) * spread;
  return layers.map((l) => {
    const p = dev(VARIANT_SPREAD.pitch);
    const v = { ...l, tau: l.tau * dev(VARIANT_SPREAD.tau), gain: l.gain * dev(VARIANT_SPREAD.gain), f: l.f * p };
    if ((l.k === 'tone' || l.k === 'noise') && l.fEnd !== undefined) return { ...v, fEnd: l.fEnd * p } as Layer;
    return v as Layer;
  });
}

/**
 * Efekt veriyolu süzgeci (üretimde, yerinde): SOFTEN.busShelfHz üstünü yumuşakça kısan yüksek raf + üst alçak geçiren.
 * Tüm efektlere aynı "yumuşak" tınıyı verir; gürlük normalleştirmesi bundan sonra yapılır.
 */
export function softenBus(buf: Float32Array, sr: number): void {
  const shelf = new Biquad(sr, 'hs', SOFTEN.busShelfHz, 0.707, SOFTEN.busShelfDb);
  const lp = new Biquad(sr, 'lp', SOFTEN.busLpHz, 0.707);
  for (let i = 0; i < buf.length; i++) buf[i] = lp.process(shelf.process(buf[i]!));
}

/**
 * Bir efekti çağ tınısıyla örneklere çevirir (saf ve tekrarlanabilir: tohum kimlikten, çağdan ve çeşitten türetilir).
 * Süre tarifin kendi uzunluğudur. `variant` > 0 tarifin küçük sapmalı bir çeşididir (sık seslerin tekrarını kırar).
 *
 * Tını: önce veriyolu süzgeci (softenBus), sonra tek bantta yığılan efektlere küçük bir bant dolgusu (balance.ts).
 * Gürlük: her tampon, kapılamasız en yüksek 400 ms blok K-ağırlıklı gürlüğü (LUFS) SFX_LEVEL.refMomentaryLufs olacak
 * biçimde ölçeklenir; böylece aynı efektin çağlar ve çeşitler arası gürlüğü eşit olur ve kategori düzeyi yalnızca
 * config.ts'teki efekt kazancıyla ayarlanır.
 */
export function renderSfx(id: SfxId, age: number, sampleRate: number = SFX_SAMPLE_RATE, variant = 0): Float32Array {
  const recipe = SFX_RECIPES[id];
  const a = clampAge(age);
  const v = Math.max(0, Math.floor(variant));
  const rng = createRng(hashString(v === 0 ? `${id}:${a}` : `${id}:${a}:${v}`));
  const layers = recipe.layers(a);
  const raw = renderLayers(sampleRate, recipe.dur, v === 0 ? layers : varyLayers(layers, rng), rng);
  softenBus(raw, sampleRate);
  balanceBands(raw, sampleRate, rng);
  finalize(raw, sampleRate, 1);
  const { momentaryMaxLufs } = measureLoudness(raw, sampleRate);
  const scale = Number.isFinite(momentaryMaxLufs) && momentaryMaxLufs > -100 ? Math.pow(10, (SFX_LEVEL.refMomentaryLufs - momentaryMaxLufs) / 20) : 0;
  for (let i = 0; i < raw.length; i++) raw[i]! *= scale;
  // Tepe güvencesi: çıkışta (efekt kazancı × ana çıkış) tepe sınırının altında kalsın.
  const outGain = SFX_SETTINGS[id].gain * MIX.ownGain * MIX.masterGain;
  limitPeaks(raw, sampleRate, Math.pow(10, (SFX_LEVEL.peakCeilingDb - SOFTEN.limiterMarginDb) / 20) / outGain);
  return raw;
}

/**
 * Yumuşak tepe sınırlayıcı (yerinde): ileri bakışlı kazanç azaltma, bakış süresince doğrusal iniş ve üstel bırakma.
 * Sert kırpma yapmaz (tını bozulmaz); yalnızca nadir, kısa üst üste binme tepelerini `ceiling` altına çeker.
 */
export function limitPeaks(buf: Float32Array, sr: number, ceiling: number): void {
  const n = buf.length;
  let over = false;
  for (let i = 0; i < n; i++) if (Math.abs(buf[i]!) > ceiling) over = true;
  if (!over) return;
  const look = Math.max(1, Math.round(SOFTEN.limiterLookSec * sr));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(buf[i]!);
    need[i] = a > ceiling ? ceiling / a : 1;
  }
  // İleri pencere en küçüğü: i anındaki kazanç, sonraki `look` örnekteki en çok azaltmayı karşılar.
  const ahead = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let j = i; j < Math.min(n, i + look + 1); j++) if (need[j]! < m) m = need[j]!;
    ahead[i] = m;
  }
  // Kutu ortalaması (bakış süresince doğrusal iniş) + üstel bırakma; her adımda gereken kazancın altında kalır.
  const rel = 1 - Math.exp(-1 / (SOFTEN.limiterReleaseSec * sr));
  let sum = 0;
  let g = 1;
  for (let i = 0; i < n; i++) {
    sum += ahead[i]!;
    if (i >= look) sum -= ahead[i - look]!;
    const boxed = Math.min(sum / Math.min(i + 1, look), need[i]!);
    g = Math.min(boxed, g + (1 - g) * rel);
    buf[i]! *= g;
  }
}

export function isSfxId(x: string): x is SfxId {
  return (SFX_IDS as readonly string[]).includes(x);
}
