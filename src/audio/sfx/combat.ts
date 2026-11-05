import type { Layer } from '../dsp';
import type { SfxId } from './ids';
import { BRONZE, GLASS, IRON, byAge, noise, ring, thump, tone, type Recipe } from './layers';

/**
 * Savaş efektleri. Tını çağla değişir:
 * 1 ahşap/taş, 2 bronz, 3 demir, 4 barut/buhar, 5 elektronik.
 */

const meleeHit: Recipe = {
  dur: 0.35,
  layers: (age) =>
    byAge<Layer[]>(age, [
      [thump(190, 80, 0.07, 0.9), noise('bp', 950, 0.05, 0.7, { q: 0.9 }), noise('lp', 500, 0.09, 0.4)],
      [thump(210, 110, 0.05, 0.5), ring(560, BRONZE, 0.18, 0.5), noise('bp', 2600, 0.02, 0.4, { q: 1.2 })],
      [thump(220, 120, 0.05, 0.4), ring(780, IRON, 0.24, 0.55), noise('hp', 3200, 0.035, 0.5)],
      [thump(150, 55, 0.1, 0.9), noise('lp', 1900, 0.09, 0.8), ring(900, IRON, 0.1, 0.25), noise('hp', 4000, 0.02, 0.35)],
      [tone('saw', 1900, 0.09, 0.55, { fEnd: 220 }), noise('bp', 5200, 0.03, 0.35, { q: 1.5 }), thump(260, 90, 0.07, 0.5)],
    ]),
};

const shootRanged: Recipe = {
  dur: 0.45,
  layers: (age) =>
    byAge<Layer[]>(age, [
      // Mızrak fırlatma: hışırtı + ahşap tok sesi
      [noise('bp', 500, 0.07, 0.7, { attack: 0.03, fEnd: 1700, sweepTau: 0.08, q: 1.1 }), thump(140, 90, 0.04, 0.5)],
      // Yay kirişi
      [ring(310, [1, 2, 3.01, 4.05], 0.14, 0.6), noise('bp', 2000, 0.06, 0.4, { attack: 0.02, q: 1 }), thump(200, 150, 0.03, 0.3)],
      // Arbalet çıtırtısı
      [thump(320, 110, 0.04, 0.7), ring(1200, [1, 2.1], 0.05, 0.4), noise('hp', 2500, 0.05, 0.35)],
      // Tüfek patlaması
      [noise('lp', 5500, 0.04, 0.9), thump(210, 60, 0.08, 0.8), noise('lp', 1300, 0.2, 0.4, { delay: 0.02 })],
      // Lazer
      [tone('saw', 2600, 0.1, 0.6, { fEnd: 500, sweep: 0.05 }), tone('sine', 1300, 0.12, 0.4, { fEnd: 260, sweep: 0.06 }), noise('hp', 6000, 0.02, 0.2)],
    ]),
};

const shootHeavy: Recipe = {
  dur: 0.9,
  layers: (age) =>
    byAge<Layer[]>(age, [
      // Kaya kaldıracı: gıcırtı + fırlatma
      [
        noise('bp', 350, 0.18, 0.6, { attack: 0.06, fEnd: 900, q: 0.8 }),
        thump(110, 50, 0.15, 0.9, { delay: 0.05 }),
        noise('bp', 700, 0.12, 0.25, { attack: 0.1 }),
      ],
      // Balista
      [ring(120, [1, 2, 3.01, 4.05], 0.3, 0.8), thump(100, 50, 0.15, 0.7), noise('bp', 1800, 0.08, 0.4, { attack: 0.02 })],
      // Mancınık
      [
        noise('bp', 500, 0.25, 0.5, { attack: 0.15, fEnd: 1500 }),
        thump(120, 45, 0.2, 0.9, { delay: 0.12 }),
        ring(300, IRON, 0.1, 0.2, { delay: 0.12 }),
      ],
      // Top
      [thump(95, 32, 0.3, 1), noise('lp', 2500, 0.2, 0.9), noise('lp', 700, 0.4, 0.5, { delay: 0.03 })],
      // Plazma topu
      [
        tone('saw', 500, 0.35, 0.6, { fEnd: 70, sweep: 0.2 }),
        tone('sine', 1100, 0.3, 0.4, { fEnd: 300, sweep: 0.15, delay: 0.02 }),
        noise('bp', 3200, 0.15, 0.3, { q: 2, fEnd: 800 }),
      ],
    ]),
};

const impact: Recipe = {
  dur: 0.3,
  layers: (age) =>
    byAge<Layer[]>(age, [
      [thump(150, 70, 0.06, 0.9), noise('lp', 700, 0.06, 0.5)],
      [thump(170, 90, 0.05, 0.5), ring(480, BRONZE, 0.12, 0.4), noise('bp', 1800, 0.03, 0.3)],
      [thump(160, 80, 0.05, 0.4), ring(650, IRON, 0.15, 0.45), noise('hp', 2500, 0.03, 0.3)],
      [thump(120, 50, 0.08, 0.9), noise('lp', 1500, 0.06, 0.6), ring(800, IRON, 0.08, 0.2)],
      [tone('saw', 1400, 0.06, 0.5, { fEnd: 150 }), noise('bp', 4500, 0.04, 0.35, { q: 1.5 }), thump(200, 70, 0.06, 0.5)],
    ]),
};

const explosion: Recipe = {
  dur: 1.1,
  layers: (age) =>
    byAge<Layer[]>(age, [
      // Kaya yıkımı: gümbürtü + saçılan taş parçaları
      [
        thump(85, 38, 0.25, 1),
        noise('lp', 1100, 0.3, 0.8),
        noise('hp', 2200, 0.07, 0.4, { delay: 0.04 }),
        noise('hp', 2600, 0.07, 0.3, { delay: 0.11 }),
        noise('hp', 1900, 0.06, 0.25, { delay: 0.19 }),
      ],
      [thump(80, 35, 0.25, 0.9), noise('lp', 1600, 0.3, 0.7), ring(420, BRONZE, 0.3, 0.4), noise('hp', 3000, 0.06, 0.35, { delay: 0.05 })],
      [thump(75, 32, 0.3, 1), noise('lp', 1500, 0.35, 0.8), ring(520, IRON, 0.35, 0.35), noise('hp', 2400, 0.09, 0.35, { delay: 0.06 })],
      // Barut patlaması
      [thump(70, 28, 0.45, 1), noise('lp', 3200, 0.3, 0.9), noise('lp', 900, 0.5, 0.6, { delay: 0.04 })],
      // Enerji patlaması
      [
        tone('saw', 900, 0.25, 0.6, { fEnd: 60, sweep: 0.15 }),
        noise('bp', 2500, 0.25, 0.6, { q: 0.7, fEnd: 400 }),
        thump(90, 30, 0.4, 0.8),
        tone('sine', 2400, 0.4, 0.25, { fEnd: 600, sweep: 0.25 }),
      ],
    ]),
};

/** Birlik ölümü: kansız, hafif mizahi "pof" düşüşü. Rol, çalma hızıyla ince/kalın yapılır. */
const unitDeath: Recipe = {
  dur: 0.6,
  layers: (age) =>
    byAge<Layer[]>(age, [
      [tone('triangle', 520, 0.18, 0.7, { fEnd: 130, sweep: 0.18 }), noise('lp', 800, 0.08, 0.4, { delay: 0.15 }), thump(110, 60, 0.08, 0.5, { delay: 0.2 })],
      [tone('sine', 600, 0.2, 0.7, { fEnd: 150, sweep: 0.2 }), ring(900, GLASS, 0.1, 0.25), thump(120, 60, 0.08, 0.5, { delay: 0.22 })],
      [tone('square', 460, 0.18, 0.5, { fEnd: 110, sweep: 0.18 }), noise('hp', 3000, 0.04, 0.3), thump(100, 55, 0.09, 0.6, { delay: 0.2 })],
      [tone('saw', 420, 0.2, 0.5, { fEnd: 90, sweep: 0.2 }), noise('lp', 2000, 0.12, 0.5), thump(90, 45, 0.12, 0.7, { delay: 0.18 })],
      [tone('saw', 1400, 0.2, 0.5, { fEnd: 100, sweep: 0.12 }), tone('sine', 700, 0.25, 0.4, { fEnd: 50, sweep: 0.2 }), noise('bp', 4000, 0.05, 0.3)],
    ]),
};

const unitSpawn: Recipe = {
  dur: 0.25,
  layers: (age) => [
    tone(byAge(age, ['triangle', 'sine', 'square', 'saw', 'sine']), 300, 0.07, 0.7, { fEnd: 620, sweep: 0.05, attack: 0.01 }),
    noise('bp', 2200, 0.04, 0.25, { attack: 0.01 }),
    ...(age >= 5 ? [ring(1800, GLASS, 0.08, 0.2)] : []),
  ],
};

const baseHit: Recipe = {
  dur: 1.0,
  layers: (age) => [
    thump(75, 32, 0.3, 1),
    noise('lp', 600, 0.4, 0.7),
    noise('hp', 2000, 0.05, 0.5),
    ...byAge<Layer[]>(age, [
      [ring(210, [1, 1.6, 2.4], 0.25, 0.4)],
      [ring(300, BRONZE, 0.3, 0.4)],
      [ring(420, IRON, 0.4, 0.45)],
      [noise('lp', 2800, 0.3, 0.5), ring(500, IRON, 0.3, 0.3)],
      [tone('saw', 600, 0.3, 0.4, { fEnd: 80 })],
    ]),
  ],
};

export const COMBAT_RECIPES: Partial<Record<SfxId, Recipe>> = {
  meleeHit,
  shootRanged,
  shootHeavy,
  impact,
  explosion,
  unitDeath,
  unitSpawn,
  baseHit,
};
