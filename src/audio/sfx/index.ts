import { SFX_LEVEL } from '../config';
import { createRng, finalize, hashString, renderLayers, windowRms } from '../dsp';
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

/**
 * Bir efekti çağ tınısıyla örneklere çevirir (saf ve tekrarlanabilir: tohum kimlikten ve çağdan türetilir).
 * Süre tarifin kendi uzunluğudur.
 *
 * Gürlük: her tampon, 400 ms kayan pencere RMS'i SFX_LEVEL.refWindowRmsDb olacak biçimde ölçeklenir; böylece aynı
 * efektin çağlar arası gürlüğü eşit olur ve kategori düzeyi yalnızca config.ts'teki efekt kazancıyla ayarlanır.
 */
export function renderSfx(id: SfxId, age: number, sampleRate: number = SFX_SAMPLE_RATE): Float32Array {
  const recipe = SFX_RECIPES[id];
  const a = clampAge(age);
  const rng = createRng(hashString(`${id}:${a}`));
  const raw = renderLayers(sampleRate, recipe.dur, recipe.layers(a), rng);
  finalize(raw, sampleRate, 1);
  const rms = windowRms(raw, sampleRate);
  const scale = rms > 1e-9 ? Math.pow(10, SFX_LEVEL.refWindowRmsDb / 20) / rms : 0;
  for (let i = 0; i < raw.length; i++) raw[i]! *= scale;
  return raw;
}

export function isSfxId(x: string): x is SfxId {
  return (SFX_IDS as readonly string[]).includes(x);
}
