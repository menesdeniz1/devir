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
    stoneWeight: 0,
    ability: { minTargets: 1, minValue: null, aimJitter: 80, reactionDelaySec: [2, 12], defenseWeight: 1, defenseMinTargets: 1, leadDelayed: false },
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
    stoneWeight: 1,
    ability: { minTargets: 3, minValue: 4, aimJitter: 0, reactionDelaySec: [0, 0], defenseWeight: 2, defenseMinTargets: 1, leadDelayed: false },
  },
  hard: {
    decisionIntervalSec: 0.6,
    counterAccuracy: 0.95,
    ageUpDelaySec: [0, 3],
    ageThreatCheck: false,
    agePreReserve: { xpFraction: 0.9, goldFraction: 0.5 },
    tower: { policy: 'anticipate', maxSlots: 3, hpTrigger: 1, chooseKind: true, renew: true },
    queueTarget: [5, 5],
    idleChance: 0,
    stoneWeight: 2,
    ability: { minTargets: 2, minValue: 3, aimJitter: 0, reactionDelaySec: [0, 0], defenseWeight: 2, defenseMinTargets: 1, leadDelayed: true },
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
  decisionJitter: 0.3,
  abilityScanStep: 10,
  stances: {
    opening: ['front', 'heavy', 'front', 'ranged'],
    antiFront: ['front', 'front', 'ranged'],
    antiSwarm: ['front', 'front', 'front', 'ranged'],
    antiRanged: ['heavy'],
    antiHeavy: ['front', 'front', 'heavy'],
    antiTower: ['heavy'],
  },
  openings: [
    ['front', 'front', 'ranged'],
    ['front', 'front', 'heavy'],
    ['front'],
  ],
  stanceShare: { heavy: 0.4, ranged: 0.2 },
  swarm: { front: 0.9, minUnits: 4 },
  minEnemyUnits: 1,
  siege: { towers: 3, fewUnits: 3 },
};
