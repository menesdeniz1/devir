import type { Role } from '../data/types';
import type { SfxId } from './sfx/ids';

/**
 * Ses ayarları (karışım düzeyleri, öncelikler, sınırlar). Oyun dengesi değil, mikser ayarıdır;
 * mantık kodunda sihirli sayı olmaması için burada toplanır.
 */

export interface SfxSettings {
  /** Efektin göreli kazancı (1 = tarif doruğu). */
  gain: number;
  /** Eşzamanlı ses sınırı aşıldığında hangisinin atılacağını belirler (büyük = önemli). */
  priority: number;
  /** Aynı efektin iki başlangıcı arasındaki en kısa süre (sn); makineli yağmuru önler. */
  minGapSec: number;
}

const BATTLE_GAP = 0.04;

export const SFX_SETTINGS: Record<SfxId, SfxSettings> = {
  meleeHit: { gain: 0.55, priority: 1, minGapSec: BATTLE_GAP },
  shootRanged: { gain: 0.45, priority: 1, minGapSec: BATTLE_GAP },
  shootHeavy: { gain: 0.6, priority: 2, minGapSec: BATTLE_GAP },
  impact: { gain: 0.5, priority: 1, minGapSec: BATTLE_GAP },
  explosion: { gain: 0.7, priority: 3, minGapSec: 0.06 },
  unitDeath: { gain: 0.5, priority: 2, minGapSec: 0.05 },
  unitSpawn: { gain: 0.4, priority: 1, minGapSec: 0.05 },
  baseHit: { gain: 0.85, priority: 5, minGapSec: 0.1 },
  towerFast: { gain: 0.5, priority: 2, minGapSec: BATTLE_GAP },
  towerHeavy: { gain: 0.65, priority: 3, minGapSec: BATTLE_GAP },
  towerBuilt: { gain: 0.7, priority: 6, minGapSec: 0 },
  towerSold: { gain: 0.7, priority: 6, minGapSec: 0 },
  slotUnlocked: { gain: 0.7, priority: 6, minGapSec: 0 },
  ageUp: { gain: 0.9, priority: 8, minGapSec: 0 },
  stoneCapture: { gain: 0.75, priority: 6, minGapSec: 0 },
  stoneLose: { gain: 0.75, priority: 6, minGapSec: 0 },
  abilityStampede: { gain: 0.9, priority: 7, minGapSec: 0 },
  abilityFireTrench: { gain: 0.8, priority: 7, minGapSec: 0 },
  abilityCaltrops: { gain: 0.8, priority: 7, minGapSec: 0 },
  abilityBarrage: { gain: 0.8, priority: 7, minGapSec: 0 },
  abilityBarrageImpact: { gain: 0.95, priority: 7, minGapSec: 0 },
  abilityStasis: { gain: 0.8, priority: 7, minGapSec: 0 },
  abilityGeneric: { gain: 0.8, priority: 7, minGapSec: 0 },
  uiClick: { gain: 0.6, priority: 9, minGapSec: 0 },
  uiError: { gain: 0.7, priority: 9, minGapSec: 0.1 },
  uiNotice: { gain: 0.7, priority: 9, minGapSec: 0.1 },
  stingerWin: { gain: 0.9, priority: 10, minGapSec: 0 },
  stingerLoss: { gain: 0.9, priority: 10, minGapSec: 0 },
  stingerDraw: { gain: 0.9, priority: 10, minGapSec: 0 },
};

export const MIX = {
  /** Ayar eğrisi üssü: gain = (v/100)^üs (algısal). */
  volumeCurveExponent: 2,
  defaultMusicVolume: 60,
  defaultSfxVolume: 80,
  /** Ana çıkış kazancı (üst üste binen seslerde kırpılmayı önler). */
  masterGain: 0.8,
  /** Kendi birliklerinin/yapılarının sesleri tam, rakibinki biraz kısık (GDD §15 yönü). */
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
  /** Döngü süresi sınırları (sn) — test garantisi. */
  minLoopSec: 60,
  maxLoopSec: 90,
} as const;
