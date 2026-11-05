/**
 * Denge ve içerik verisi şemaları.
 * Sayıların kendisi bu klasördeki diğer dosyalardadır (tek kaynak: GDD'nin başlangıç tabloları buraya taşınır).
 * Süreler saniye cinsinden yazılır; simülasyon yüklerken tamsayı tick'e çevirir.
 */

export type Role = 'front' | 'ranged' | 'heavy';

export interface WorldDef {
  /** Simülasyon adım hızı (tick/sn). */
  tickRate: number;
  /** Mantıksal dünya genişliği (birim). */
  worldWidth: number;
  /** Her üssün genişliği; oyuncu üssü [0, baseWidth], rakip üssü [worldWidth - baseWidth, worldWidth]. */
  baseWidth: number;
  /** Aynı taraftaki iki birlik arasındaki en küçük boşluk. */
  friendlyGap: number;
}

export interface UnitDef {
  /** Kalıcı kimlik (kayıtlarda geçer, değiştirilmez). Görünen ad i18n'dedir: `unit.<id>`. */
  id: string;
  /** 1..5 */
  age: number;
  role: Role;
  cost: number;
  buildTimeSec: number;
  hp: number;
  damage: number;
  attackIntervalSec: number;
  /** Birbirine bakan kenarlar arası en büyük saldırı mesafesi. 0'dan büyük olmalı (ilerleme garantisi). */
  range: number;
  /** birim/sn */
  speed: number;
  /** Koridordaki uzunluk (birim). */
  width: number;
  bountyGold: number;
  bountyXp: number;
}

export interface AgeDef {
  /** 1..5 */
  age: number;
  /** Bu çağa geçmek için gereken toplam deneyim. */
  xpThreshold: number;
  /** Bu çağa geçiş ücreti (altın). İlk çağ için 0. */
  ageUpCost: number;
  baseMaxHp: number;
  /** Saniyelik temel gelir; tamsayı. */
  incomePerSec: number;
  /** Bu çağda sipariş verilebilen birlikler. */
  unitIds: string[];
}

export interface EconomyDef {
  startGold: number;
  /** Üretimdeki dahil en fazla sipariş. */
  maxQueue: number;
}

export interface BasicBotDef {
  /** Karar aralığı (sn). */
  decisionIntervalSec: number;
  /** Bot bu sayıdan az sipariş varken yenisini verir. */
  targetQueueLength: number;
}
