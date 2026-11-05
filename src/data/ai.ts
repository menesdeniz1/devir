import type { AiDifficulty, AiProfileDef, AiTuningDef, BasicBotDef } from './types';

/**
 * Aşama 1–5 basit rakip botu. Aşama 6'dan sonra test aracı olarak kalır (oyunun rakibi AI_PROFILES'tır).
 * Gözlemi okumaz; sabit bir bileşimi döngüsel sipariş eder. Bu yüzden karşılık seçen oyuncu onu yenebilir.
 * Aynalı takas (GDD §10) nedeniyle üretim hızı bilerek sınırlıdır.
 */
export const BASIC_BOT: BasicBotDef = {
  decisionIntervalSec: 6,
  targetQueueLength: 2,
  composition: ['front', 'front', 'ranged', 'front', 'ranged', 'heavy'],
  tower: { threatDistance: 350, maxSlots: 2 },
};

/** Bilgisayar rakibi zorluk profilleri (GDD §9 zorluk tablosu). Hiçbir seviye ek kaynak veya hasar almaz. */
export const AI_PROFILES: Readonly<Record<AiDifficulty, AiProfileDef>> = {
  easy: {
    decisionIntervalSec: 3,
    counterAccuracy: 0.35,
    ageUpDelaySec: [20, 60],
    ageThreatCheck: false,
    agePreReserve: null,
    tower: { policy: 'lowHp', maxSlots: 1, hpTrigger: 0.5, chooseKind: false, renew: false },
    queueTarget: [1, 1],
    idleChance: 0.3,
    baseMix: { front: 0.45, ranged: 0.35, heavy: 0.2 },
    counterWeight: 0.6,
    formation: false,
    stoneWeight: 0,
  },
  normal: {
    decisionIntervalSec: 1.5,
    counterAccuracy: 0.7,
    ageUpDelaySec: [5, 15],
    ageThreatCheck: true,
    agePreReserve: null,
    tower: { policy: 'pressure', maxSlots: 2, hpTrigger: 1, chooseKind: true, renew: false },
    queueTarget: [2, 3],
    idleChance: 0,
    baseMix: { front: 0.45, ranged: 0.35, heavy: 0.2 },
    counterWeight: 0.6,
    formation: true,
    stoneWeight: 1,
  },
  hard: {
    decisionIntervalSec: 0.6,
    counterAccuracy: 0.95,
    ageUpDelaySec: [0, 3],
    ageThreatCheck: true,
    agePreReserve: { xpFraction: 0.7, goldFraction: 0.6 },
    tower: { policy: 'anticipate', maxSlots: 3, hpTrigger: 1, chooseKind: true, renew: true },
    queueTarget: [5, 5],
    idleChance: 0,
    baseMix: { front: 0.45, ranged: 0.35, heavy: 0.2 },
    counterWeight: 0.6,
    formation: true,
    stoneWeight: 2,
  },
};

/** Zorluklardan bağımsız ölçüm ve eşikler (AiTuningDef açıklamaları). */
export const AI_TUNING: AiTuningDef = {
  agePowerFactor: 1.15,
  nearBaseDistance: 450,
  highThreatRatio: 1.5,
  trendWindowSec: 10,
  trendPressure: 0.02,
  anticipateRatio: 1.2,
  heavyTowerShare: 0.5,
  renewSpare: 100,
  pushRatio: 1.2,
  frontRatio: 0.5,
  heavyPerEnemyTower: 0.1,
};
