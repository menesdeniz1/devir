import { midiToFreq, type Layer } from '../dsp';
import type { SfxId } from './ids';
import { AGE_WAVE, BRONZE, GLASS, IRON, byAge, noise, ring, thump, tone, type Recipe } from './layers';

/** Kule, yuva, çağ geçişi ve Sınır Taşı sesleri. */

const towerFast: Recipe = {
  dur: 0.35,
  peak: 0.6,
  layers: (age) =>
    byAge<Layer[]>(age, [
      // Sapan çıtırtısı
      [noise('bp', 1600, 0.03, 0.7, { q: 1 }), thump(230, 120, 0.04, 0.6), noise('bp', 700, 0.08, 0.3, { attack: 0.02 })],
      // Ok
      [ring(380, [1, 2, 3.01], 0.1, 0.6), noise('bp', 2400, 0.05, 0.35, { attack: 0.015 })],
      // Okçu mazgalı
      [thump(300, 100, 0.04, 0.7), ring(900, IRON, 0.08, 0.35), noise('hp', 3000, 0.03, 0.3)],
      // Makineli yuva: dört kısa patlama
      [0, 0.055, 0.11, 0.165].flatMap((d): Layer[] => [noise('lp', 4500, 0.025, 0.7, { delay: d }), thump(180, 70, 0.04, 0.6, { delay: d })]),
      // Darbe lazeri: iki kısa atım
      [0, 0.08].flatMap((d): Layer[] => [tone('square', 2200, 0.05, 0.5, { fEnd: 500, sweep: 0.03, delay: d }), noise('hp', 6000, 0.015, 0.2, { delay: d })]),
    ]),
};

const towerHeavy: Recipe = {
  dur: 0.9,
  peak: 0.8,
  layers: (age) =>
    byAge<Layer[]>(age, [
      // Kaya oluğu
      [noise('lp', 500, 0.3, 0.7, { attack: 0.08 }), thump(100, 50, 0.15, 0.8, { delay: 0.1 }), noise('hp', 2200, 0.05, 0.4, { delay: 0.12 })],
      // Kızgın kum
      [noise('bp', 3200, 0.4, 0.5, { attack: 0.1, q: 0.6 }), thump(90, 45, 0.15, 0.7, { delay: 0.05 }), ring(240, BRONZE, 0.2, 0.3, { delay: 0.05 })],
      // Kaynar yağ
      [
        noise('bp', 800, 0.25, 0.5, { attack: 0.05, fEnd: 300 }),
        thump(80, 40, 0.2, 0.8, { delay: 0.05 }),
        ring(380, IRON, 0.2, 0.3, { delay: 0.05 }),
        tone('sine', 180, 0.1, 0.3, { fEnd: 90, delay: 0.15 }),
      ],
      // Havan
      [thump(85, 35, 0.25, 1), noise('lp', 2200, 0.12, 0.6), tone('sine', 1800, 0.35, 0.3, { fEnd: 500, sweep: 0.3, delay: 0.1, attack: 0.05 })],
      // Plazma havanı
      [tone('sine', 200, 0.3, 0.9, { fEnd: 50, sweep: 0.2 }), tone('saw', 900, 0.3, 0.4, { fEnd: 120, sweep: 0.2 }), noise('bp', 2500, 0.2, 0.3, { q: 1.5, fEnd: 600 })],
    ]),
};

const towerBuilt: Recipe = {
  dur: 0.7,
  peak: 0.7,
  layers: (age) =>
    byAge<Layer[]>(age, [
      // Ahşap çekiç
      [0, 0.15, 0.3].flatMap((d): Layer[] => [thump(230, 140, 0.04, 0.9, { delay: d }), noise('bp', 1100, 0.025, 0.5, { delay: d })]),
      // Bronz çekiç
      [0, 0.15, 0.3].flatMap((d): Layer[] => [thump(260, 180, 0.03, 0.5, { delay: d }), ring(900, BRONZE, 0.1, 0.5, { delay: d })]),
      // Demir örs
      [0, 0.15, 0.3].flatMap((d): Layer[] => [thump(240, 160, 0.03, 0.4, { delay: d }), ring(1100, IRON, 0.2, 0.55, { delay: d })]),
      // Perçin tabancası + buhar
      [
        ...[0, 0.07, 0.14, 0.21].flatMap((d): Layer[] => [noise('hp', 3500, 0.02, 0.6, { delay: d }), thump(170, 80, 0.03, 0.7, { delay: d })]),
        noise('hp', 6000, 0.2, 0.3, { delay: 0.25, attack: 0.05 }),
      ],
      // Enerji bileşimi: yükselen darbeler
      [
        ...[0, 1, 2, 3].map((i) => tone('square', 400 * Math.pow(2, i / 3), 0.06, 0.4, { delay: i * 0.1 })),
        ring(1800, GLASS, 0.3, 0.3, { delay: 0.3 }),
      ],
    ]),
};

const towerSold: Recipe = {
  dur: 0.7,
  peak: 0.6,
  layers: (age) => {
    const k = byAge(age, [0.8, 0.9, 1, 1.1, 1.2]);
    return [
      ring(2400 * k, [1, 1.51, 2.4], 0.25, 0.6),
      ring(3000 * k, [1, 1.51, 2.4], 0.25, 0.5, { delay: 0.09 }),
      thump(180, 110, 0.05, 0.4),
      tone('triangle', 700 * k, 0.2, 0.35, { fEnd: 300 * k, sweep: 0.2, delay: 0.1 }),
    ];
  },
};

const slotUnlocked: Recipe = {
  dur: 0.7,
  peak: 0.6,
  layers: (age) => {
    const wave = byAge(age, AGE_WAVE);
    return [
      thump(300, 150, 0.02, 0.8),
      noise('hp', 3500, 0.015, 0.5),
      tone(wave, 523, 0.25, 0.6, { delay: 0.08 }),
      tone(wave, 659, 0.25, 0.6, { delay: 0.16 }),
      tone(wave, 784, 0.3, 0.6, { delay: 0.24 }),
      ring(1568, GLASS, 0.3, 0.2, { delay: 0.24 }),
    ];
  },
};

/** Çağ geçişi fanfarı: çağ başına farklı kök nota ve tını (davul -> bronz -> demir çan -> buhar -> sentezleyici). */
const AGE_UP_ROOTS = [60, 62, 64, 65, 67] as const;
const ageUp: Recipe = {
  dur: 3.0,
  peak: 0.9,
  layers: (age) => {
    const root = byAge(age, AGE_UP_ROOTS);
    const wave = byAge(age, AGE_WAVE);
    const f = (semi: number) => midiToFreq(root + semi);
    const layers: Layer[] = [];
    [0, 4, 7, 12].forEach((semi, i) => layers.push(tone(wave, f(semi), 0.5, 0.45, { delay: i * 0.18, attack: 0.01 })));
    const chord = age >= 3 ? [0, 7, 12, 16, 19] : [0, 7, 12, 16];
    for (const semi of chord) layers.push(tone(wave, f(semi), 0.9, 0.3, { delay: 0.8, attack: 0.03, hold: 0.5 }));
    layers.push(noise('bp', 1200, 0.5, 0.2, { attack: 0.5, fEnd: 3000, sweepTau: 0.8 }));
    layers.push(
      ...byAge<Layer[]>(age, [
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => thump(110, 70, 0.1, 0.6, { delay: i * 0.06 })),
        [ring(1400, BRONZE, 1.0, 0.3, { delay: 0.8 })],
        [ring(700, IRON, 1.0, 0.3, { delay: 0.8 }), ring(1050, IRON, 0.9, 0.2, { delay: 0.9 })],
        [noise('lp', 3000, 0.5, 0.6, { delay: 0.8 }), thump(80, 40, 0.3, 0.7, { delay: 0.8 })],
        [tone('sine', 200, 0.4, 0.4, { fEnd: 2400, sweep: 0.4, attack: 0.1 }), ring(2400, GLASS, 0.8, 0.2, { delay: 0.8 })],
      ]),
    );
    return layers;
  },
};

const stoneCapture: Recipe = {
  dur: 1.0,
  peak: 0.7,
  layers: (age) => {
    const wave = byAge(age, AGE_WAVE);
    return [
      tone(wave, midiToFreq(60), 0.4, 0.6, { hold: 0.1 }),
      tone(wave, midiToFreq(67), 0.5, 0.6, { delay: 0.15, hold: 0.15 }),
      ring(1568, GLASS, 0.35, 0.3, { delay: 0.15 }),
      thump(150, 100, 0.05, 0.4),
    ];
  },
};

const stoneLose: Recipe = {
  dur: 1.1,
  peak: 0.7,
  layers: (age) => {
    const wave = byAge(age, AGE_WAVE);
    return [
      tone(wave, midiToFreq(63), 0.4, 0.6, { hold: 0.1 }),
      tone(wave, midiToFreq(58), 0.5, 0.6, { delay: 0.18, hold: 0.15 }),
      thump(90, 45, 0.2, 0.7, { delay: 0.18 }),
      noise('lp', 500, 0.3, 0.3, { delay: 0.18 }),
    ];
  },
};

export const STRUCTURE_RECIPES: Partial<Record<SfxId, Recipe>> = {
  towerFast,
  towerHeavy,
  towerBuilt,
  towerSold,
  slotUnlocked,
  ageUp,
  stoneCapture,
  stoneLose,
};
