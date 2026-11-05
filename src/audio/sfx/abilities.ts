import { midiToFreq, type Layer } from '../dsp';
import type { SfxId } from './ids';
import { GLASS, noise, ring, thump, tone, type Recipe } from './layers';

/**
 * Özel yetenek sesleri (GDD §7): yetenek kimliği başına bir ses, çağdan bağımsız ve birbirinden belirgin biçimde ayrışır.
 * Eşleme: primitive_stampede, ancient_fire_trench, medieval_caltrops, industrial_barrage (+ isabet), future_stasis.
 */

/** Sürü Hücumu: dörtnala toynak gümbürtüsü + hırıltı + toz. */
const abilityStampede: Recipe = {
  dur: 2.2,
  layers: () => {
    const layers: Layer[] = [];
    for (let g = 0; g < 6; g++) {
      const base = g * 0.3;
      for (const d of [0, 0.09, 0.17]) layers.push(thump(95, 50, 0.08, 0.8 - g * 0.04, { delay: base + d }));
    }
    layers.push(noise('lp', 350, 0.9, 0.7, { attack: 0.2, hold: 0.9 }));
    layers.push(tone('saw', 110, 0.4, 0.3, { fEnd: 80, attack: 0.1, hold: 0.8, vibHz: 7, vibDepth: 0.05 }));
    layers.push(noise('bp', 1200, 0.5, 0.2, { attack: 0.3, hold: 0.6, q: 0.6 }));
    return layers;
  },
};

/** Ateş Hendeği: tutuşma hışırtısı + alev uğultusu + çıtırtılar. */
const CRACKLE_DELAYS = [0.1, 0.18, 0.3, 0.37, 0.5, 0.62, 0.71, 0.9, 1.05, 1.2] as const;
const abilityFireTrench: Recipe = {
  dur: 1.8,
  layers: () => [
    noise('bp', 500, 0.5, 0.8, { attack: 0.12, fEnd: 1800, sweepTau: 0.25, q: 0.6 }),
    noise('lp', 600, 0.7, 0.6, { attack: 0.1, hold: 0.6 }),
    thump(90, 50, 0.15, 0.5, { delay: 0.05 }),
    // Çıtırtılar: odun kıvılcımı, orta bantta kısa tıkırtılar (tiz cızırtı değil)
    ...CRACKLE_DELAYS.map((d, i) => noise('bp', 1600 + i * 120, 0.012, 0.45, { delay: d, q: 0.8 })),
  ],
};

/** Çivi Kapanı: saçılan metal çivilerin cıngırtısı. */
const CALTROP_DELAYS = [0, 0.03, 0.07, 0.1, 0.16, 0.19, 0.27, 0.33, 0.4, 0.52, 0.6, 0.75] as const;
const abilityCaltrops: Recipe = {
  dur: 1.2,
  layers: () => [
    noise('bp', 900, 0.2, 0.4, { attack: 0.05 }),
    ...CALTROP_DELAYS.flatMap((d, i): Layer[] => [
      ring(1200 + ((i * 397) % 900), [1, 2.7], 0.045, 0.4, { delay: d }),
      thump(220, 120, 0.03, 0.4, { delay: d }),
    ]),
  ],
};

/** Baraj Ateşi, kullanım anı: roketlerin fırlayışı + yaklaşan ıslık. */
const abilityBarrage: Recipe = {
  dur: 1.7,
  layers: () => [
    thump(120, 50, 0.15, 0.7),
    noise('bp', 800, 0.4, 0.6, { attack: 0.05, fEnd: 2200, sweepTau: 0.4 }),
    tone('sine', 1800, 0.9, 0.45, { fEnd: 600, sweep: 0.6, attack: 0.03, hold: 0.4, delay: 0.1 }),
  ],
};

/** Baraj Ateşi, vuruş anı: art arda üç gümbürtü. */
const abilityBarrageImpact: Recipe = {
  dur: 1.5,
  layers: () => [
    ...[0, 0.12, 0.25].flatMap((d): Layer[] => [thump(75, 30, 0.35, 1, { delay: d }), noise('lp', 2800, 0.3, 0.9, { delay: d })]),
    noise('lp', 600, 0.6, 0.6, { delay: 0.1 }),
  ],
};

/** Durağanlık Alanı: kristalleşen, tiz ve uğuldayan buzlu ses. */
const abilityStasis: Recipe = {
  dur: 2.2,
  layers: () => [
    tone('sine', 1500, 0.7, 0.5, { fEnd: 300, sweep: 0.5, hold: 0.2, attack: 0.01 }),
    ring(1200, GLASS, 0.9, 0.5, { attack: 0.01 }),
    ring(1600, GLASS, 0.7, 0.35, { delay: 0.1 }),
    tone('sine', 110, 0.8, 0.5, { attack: 0.3, hold: 0.8 }),
    tone('triangle', midiToFreq(81), 0.5, 0.25, { vibHz: 6, vibDepth: 0.03, attack: 0.2, hold: 0.6 }),
    noise('bp', 3000, 0.3, 0.15, { attack: 0.2, q: 0.7 }),
  ],
};

/** Bilinmeyen yetenek kimlikleri için yedek ses. */
const abilityGeneric: Recipe = {
  dur: 1.0,
  layers: () => [noise('bp', 600, 0.3, 0.6, { attack: 0.1, fEnd: 2500, sweepTau: 0.3 }), ring(900, GLASS, 0.5, 0.4, { delay: 0.1 }), thump(120, 60, 0.12, 0.6)],
};

export const ABILITY_RECIPES: Partial<Record<SfxId, Recipe>> = {
  abilityStampede,
  abilityFireTrench,
  abilityCaltrops,
  abilityBarrage,
  abilityBarrageImpact,
  abilityStasis,
  abilityGeneric,
};
