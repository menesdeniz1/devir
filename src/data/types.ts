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

/** Alan hasarı: ana hedef tam hasar; çarpma noktasına `radius` içindeki diğer düşman birlikleri `falloff` oranında. */
export interface SplashDef {
  radius: number;
  /** 0..1 */
  falloff: number;
}

/** Delme: ana hedef ve arkasındaki en yakın `count` düşman birliği (ana hedeften en fazla `length` uzakta) tam hasar alır. */
export interface PierceDef {
  count: number;
  length: number;
}

/** Hasar çarpanı tablosunda hedef sınıfı. */
export type TargetClass = Role | 'base';

export interface CombatDef {
  /** Saldıran rol → hedef sınıfı → çarpan (GDD §3). Kule satırları Aşama 4'te eklenir. */
  roleMultipliers: Record<Role, Record<TargetClass, number>>;
  /** Rol başına mermi hızı (birim/sn); null ise saldırı anlıktır (yakın dövüş). */
  projectileSpeed: Record<Role, number | null>;
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
  splash?: SplashDef;
  pierce?: PierceDef;
  /** Rol çarpanının bu birlik için değiştirilen değerleri (ör. Arbaletçi'nin ön hata karşı 1,5'i). */
  multiplierOverrides?: Partial<Record<TargetClass, number>>;
}

export interface StoneDef {
  /** Bölgenin dünya koordinatı aralığı (GDD §8). */
  zoneStart: number;
  zoneEnd: number;
  /** Sayaç sınırı; tarafsızdan tam kontrole counterMax tick. */
  counterMax: number;
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
  /** Sınır Taşı sahibine bu çağda saniyede verilen ek altın ve deneyim (tamsayı; GDD §8). */
  stoneGoldPerSec: number;
  stoneXpPerSec: number;
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
  /** Sipariş sırası; döngüsel tekrarlanır. Aşama 6'da gözleme dayalı karşılık seçimiyle değiştirilir. */
  composition: Role[];
}
