import type { Role } from '../data/types';
import type { SfxId } from './sfx/ids';

/**
 * Ses ayarları (karışım düzeyleri, öncelikler, sınırlar). Oyun dengesi değil, mikser ayarıdır;
 * mantık kodunda sihirli sayı olmaması için burada toplanır.
 *
 * Düzey ölçümü ve hedefler `analysis.ts` ve tests/audio-levels.test.ts ile doğrulanır.
 */

export const MIX = {
  /** Ayar eğrisi üssü: gain = (v/100)^üs (algısal). */
  volumeCurveExponent: 2,
  defaultMusicVolume: 60,
  defaultSfxVolume: 80,
  /** Ana çıkış kazancı (üst üste binen seslerde kırpılmayı önler). */
  masterGain: 0.8,
  /** Kendi birliklerinin/yapılarının sesleri tam, rakibinki ≈3 dB kısık (20·log10(0,7) = −3,1 dB). */
  ownGain: 1,
  enemyGain: 0.7,
  /** Aynı karede n tane birleşen olayın kazancı: 1 + coalesceGain * ln(n), en çok coalesceMax. */
  coalesceGain: 0.25,
  coalesceMax: 1.8,
  /** Her çalışta çalma hızına eklenen rastgele sapma (±). */
  rateJitter: 0.05,
  /** Rol başına çalma hızı: ağır birlikler daha kalın, menziller daha ince. */
  roleRate: { front: 1, ranged: 1.12, heavy: 0.8 } satisfies Record<Role, number>,
  /** Üs hasarı gürlüğü: hasar/baseHitFullDamage ile ölçeklenir, alt sınır baseHitMinGain. */
  baseHitMinGain: 0.55,
  baseHitFullDamage: 60,
  /** Eşzamanlı ses sınırı (TDD §8). */
  maxPerSfx: 4,
  maxTotal: 24,
  /** Duraklatma/ses değişimi yumuşatma süresi (sn). */
  rampSec: 0.03,
  /** Maç sonu müzik kısma: müzik kazancı bu oranda çarpılır. */
  stingerDuck: 0.25,
  stingerDuckSec: 4,
  /** Sesin sönerek kesilmesi (evict) süresi (sn). */
  evictFadeSec: 0.02,
  /** Ana çıkıştaki sınırlayıcı (DynamicsCompressor; bağlam desteklemiyorsa atlanır). Çok sesli anlarda kırpılmayı önler. */
  limiter: { thresholdDb: -6, kneeDb: 6, ratio: 12, attackSec: 0.003, releaseSec: 0.15 },
} as const;

export const MUSIC = {
  /** Zamanlayıcı aralığı ve ileri bakış penceresi (sn). */
  timerMs: 80,
  lookaheadSec: 0.4,
  /** Çağ değişiminde çapraz geçiş süresi (sn). */
  crossfadeSec: 2.5,
  /** Gerilimin (0..1) tempoya en çok katkısı: tempo × (1 + tempoBoost × gerilim). */
  tempoBoost: 0.08,
  /** Müzik örnek hızı (bellek için düşük). */
  sampleRate: 22050,
  /** Zamanlama kayıpta (duraklama sonrası vb.) yeniden başlarken eklenen pay (sn). */
  restartPadSec: 0.05,
  /**
   * Çağ başına müzik düzeyi düzeltmesi (doğrusal kazanç, çağ 1..5): çevrimdışı ölçümle, varsayılan ses düzeylerinde
   * döngü ortalama RMS'i tipik savaş efektinin ≈10 dB altına gelecek biçimde ayarlanır.
   */
  levelTrim: [0.217, 0.23, 0.242, 0.148, 0.166],
  /** Döngü süresi sınırları (sn) — test garantisi. */
  minLoopSec: 60,
  maxLoopSec: 90,
} as const;

// ---- Düzey hedefleri (dBFS, çıkışta; ana çıkış ve kendi-taraf kazancı dahil, kanal ses düzeyi 100) ----------

export type SfxCategory = 'strike' | 'impact' | 'death' | 'base' | 'tower' | 'cue' | 'ability' | 'fanfare' | 'ui' | 'spawn';

export const SFX_LEVEL = {
  /** Her efekt tamponu, 400 ms pencere RMS'i bu değere (dBFS) normalleştirilerek üretilir. */
  refWindowRmsDb: -22,
  /** Kategori hedefleri: kısa pencere (400 ms) en yüksek RMS, dBFS. */
  targets: {
    strike: -22, // yakın dövüş vuruşu, mızrak/ok/top atışı
    impact: -18, // çarpma ve patlama
    death: -24, // birlik ölümü
    base: -18, // üs vuruşu
    tower: -22, // kule atışı
    cue: -20, // kule kurma/satma, yuva açma, Sınır Taşı
    ability: -16, // yetenekler
    fanfare: -14, // çağ fanfarı ve stingerlar
    ui: -26, // arayüz
    spawn: -26, // birlik doğması (arka plan dokusu)
  } satisfies Record<SfxCategory, number>,
  /** Hedefe izin verilen sapma (±dB). */
  toleranceDb: 3,
  /** Tepe sınırı (dBFS), her yerde. */
  peakCeilingDb: -1,
  /** Aynı efektin çağlar arası pencere RMS farkı üst sınırı (dB). */
  maxAgeSpreadDb: 3,
  /** Müzik ortalama RMS'i, tipik savaş efektinin (varsayılan düzeylerde) bu kadar dB altında olmalı. */
  musicBelowSfxDb: { min: 8, max: 12 },
  /** Tıklama ölçütü: son 10 ms'deki en büyük genlik bu değerin (dBFS) altında olmalı. */
  maxTailDb: -40,
  /** DC sapması üst sınırı (doğrusal). */
  maxDc: 0.001,
} as const;

export const SFX_CATEGORY: Record<SfxId, SfxCategory> = {
  meleeHit: 'strike',
  shootRanged: 'strike',
  shootHeavy: 'strike',
  impact: 'impact',
  explosion: 'impact',
  unitDeath: 'death',
  unitSpawn: 'spawn',
  baseHit: 'base',
  towerFast: 'tower',
  towerHeavy: 'tower',
  towerBuilt: 'cue',
  towerSold: 'cue',
  slotUnlocked: 'cue',
  ageUp: 'fanfare',
  stoneCapture: 'cue',
  stoneLose: 'cue',
  abilityStampede: 'ability',
  abilityFireTrench: 'ability',
  abilityCaltrops: 'ability',
  abilityBarrage: 'ability',
  abilityBarrageImpact: 'ability',
  abilityStasis: 'ability',
  abilityGeneric: 'ability',
  uiClick: 'ui',
  uiError: 'ui',
  uiNotice: 'ui',
  stingerWin: 'fanfare',
  stingerLoss: 'fanfare',
  stingerDraw: 'fanfare',
};

/**
 * Hedef çıkış düzeyini veren kazanç: tampon pencere RMS'i refWindowRmsDb iken
 * gain × ownGain × masterGain çarpımı hedefe ulaştırır. 0,01 hassasiyetle yuvarlanır.
 */
export function levelGain(targetDb: number): number {
  const linear = Math.pow(10, (targetDb - SFX_LEVEL.refWindowRmsDb) / 20) / (MIX.ownGain * MIX.masterGain);
  return Math.round(linear * 100) / 100;
}

// ---- Efekt ayarları ---------------------------------------------------------

export interface SfxSettings {
  /** Efektin kazancı: kategori hedefine göre `levelGain` ile türetilir (+ efekte özgü ince ayar). */
  gain: number;
  /** Eşzamanlı ses sınırı aşıldığında hangisinin atılacağını belirler (büyük = önemli). */
  priority: number;
  /** Aynı efektin iki başlangıcı arasındaki en kısa süre (sn); makineli yağmuru önler. */
  minGapSec: number;
}

interface SfxBase {
  priority: number;
  minGapSec: number;
  /** Kategori hedefine göre efekte özgü ince ayar (dB). */
  trimDb?: number;
}

const BATTLE_GAP = 0.04;

const SFX_BASE: Record<SfxId, SfxBase> = {
  meleeHit: { priority: 1, minGapSec: BATTLE_GAP },
  shootRanged: { priority: 1, minGapSec: BATTLE_GAP },
  shootHeavy: { priority: 2, minGapSec: BATTLE_GAP },
  impact: { priority: 1, minGapSec: BATTLE_GAP, trimDb: -1.5 },
  explosion: { priority: 3, minGapSec: 0.06 },
  unitDeath: { priority: 2, minGapSec: 0.05 },
  unitSpawn: { priority: 1, minGapSec: 0.05 },
  baseHit: { priority: 5, minGapSec: 0.1 },
  towerFast: { priority: 2, minGapSec: BATTLE_GAP },
  towerHeavy: { priority: 3, minGapSec: BATTLE_GAP },
  towerBuilt: { priority: 6, minGapSec: 0 },
  towerSold: { priority: 6, minGapSec: 0 },
  slotUnlocked: { priority: 6, minGapSec: 0 },
  ageUp: { priority: 8, minGapSec: 0 },
  stoneCapture: { priority: 6, minGapSec: 0 },
  stoneLose: { priority: 6, minGapSec: 0 },
  abilityStampede: { priority: 7, minGapSec: 0 },
  abilityFireTrench: { priority: 7, minGapSec: 0 },
  abilityCaltrops: { priority: 7, minGapSec: 0 },
  abilityBarrage: { priority: 7, minGapSec: 0 },
  abilityBarrageImpact: { priority: 7, minGapSec: 0 },
  abilityStasis: { priority: 7, minGapSec: 0 },
  abilityGeneric: { priority: 7, minGapSec: 0 },
  uiClick: { priority: 9, minGapSec: 0 },
  uiError: { priority: 9, minGapSec: 0.1 },
  uiNotice: { priority: 9, minGapSec: 0.1 },
  stingerWin: { priority: 10, minGapSec: 0 },
  stingerLoss: { priority: 10, minGapSec: 0 },
  stingerDraw: { priority: 10, minGapSec: 0 },
};

export const SFX_SETTINGS: Record<SfxId, SfxSettings> = Object.fromEntries(
  (Object.keys(SFX_BASE) as SfxId[]).map((id) => {
    const base = SFX_BASE[id];
    const target = SFX_LEVEL.targets[SFX_CATEGORY[id]] + (base.trimDb ?? 0);
    return [id, { gain: levelGain(target), priority: base.priority, minGapSec: base.minGapSec }];
  }),
) as Record<SfxId, SfxSettings>;
