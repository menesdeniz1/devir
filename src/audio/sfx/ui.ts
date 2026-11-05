import { midiToFreq, type Layer } from '../dsp';
import type { SfxId } from './ids';
import { GLASS, noise, ring, thump, tone, type Recipe } from './layers';

/** Arayüz sesleri ve maç sonu kısa müzik parçaları (stinger). */

const uiClick: Recipe = {
  dur: 0.09,
  layers: () => [tone('triangle', 1200, 0.025, 0.7, { fEnd: 800, sweep: 0.01 }), noise('bp', 4200, 0.008, 0.4)],
};

const uiError: Recipe = {
  dur: 0.35,
  layers: () => [
    tone('square', 330, 0.05, 0.6, { hold: 0.07 }),
    tone('sine', 165, 0.05, 0.2, { hold: 0.07 }),
    tone('square', 262, 0.06, 0.6, { hold: 0.08, delay: 0.14 }),
    tone('sine', 131, 0.06, 0.2, { hold: 0.08, delay: 0.14 }),
  ],
};

const uiNotice: Recipe = {
  dur: 0.6,
  layers: () => [
    tone('sine', 880, 0.18, 0.7),
    tone('sine', 1319, 0.25, 0.6, { delay: 0.12 }),
    ring(2637, GLASS, 0.2, 0.15, { delay: 0.12 }),
  ],
};

function notes(midis: readonly number[], delays: readonly number[], wave: 'triangle' | 'sine' | 'square', gain: number, tau: number, hold = 0): Layer[] {
  return midis.map((m, i) => tone(wave, midiToFreq(m), tau, gain, { delay: delays[i] ?? 0, attack: 0.01, hold }));
}

/** Zafer: yükselen majör arpej + parlak son akor. */
const stingerWin: Recipe = {
  dur: 2.6,
  layers: () => [
    ...notes([60, 64, 67, 72], [0, 0.14, 0.28, 0.42], 'triangle', 0.5, 0.35),
    ...notes([60, 67, 72, 76], [0.7, 0.7, 0.7, 0.7], 'triangle', 0.4, 0.7, 0.6),
    ...notes([48, 55], [0.7, 0.7], 'square', 0.12, 0.7, 0.5),
    ring(2093, GLASS, 0.8, 0.2, { delay: 0.7 }),
    thump(100, 60, 0.1, 0.6, { delay: 0.7 }),
  ],
};

/** Yenilgi: alçalan minör çizgi + alçak son akor. */
const stingerLoss: Recipe = {
  dur: 3.0,
  layers: () => [
    ...notes([67, 63, 60, 55], [0, 0.35, 0.7, 1.05], 'triangle', 0.5, 0.45),
    ...notes([48, 51, 55], [1.4, 1.4, 1.4], 'square', 0.18, 1.0, 0.4),
    thump(70, 35, 0.4, 0.8, { delay: 1.4 }),
  ],
};

/** Beraberlik: çözülmeyen asılı akor. */
const stingerDraw: Recipe = {
  dur: 2.4,
  layers: () => [
    ...notes([60, 65, 67], [0, 0.3, 0.6], 'triangle', 0.45, 0.4),
    ...notes([60, 65, 67], [0.9, 0.9, 0.9], 'sine', 0.4, 0.8, 0.7),
    ring(1046, GLASS, 0.8, 0.2, { delay: 0.9 }),
  ],
};

export const UI_RECIPES: Partial<Record<SfxId, Recipe>> = {
  uiClick,
  uiError,
  uiNotice,
  stingerWin,
  stingerLoss,
  stingerDraw,
};
