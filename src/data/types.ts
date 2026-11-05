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

/** Kule türü (GDD §6): A = hızlı tek hedef, B = ağır alan hasarlı. */
export type TowerKind = 'fast' | 'heavy';

export interface TowerDef {
  /** Kalıcı kimlik. Görünen ad i18n'dedir: `tower.<id>`. */
  id: string;
  /** 1..5 */
  age: number;
  kind: TowerKind;
  cost: number;
  damage: number;
  attackIntervalSec: number;
  /** Üssün ön yüzünden koridora doğru ölçülen menzil. */
  range: number;
  splash?: SplashDef;
}

export interface DefenseDef {
  /** Yuva açma ücretleri; index = yuva. Yuva 0 başlangıçta açıktır (ücret 0). Yuvalar sırayla açılır. */
  slotUnlockCosts: number[];
  /** Kule satışında ödenen fiyatın iade oranı; iade aşağı yuvarlanır (PRD E-05). */
  sellRefundRatio: number;
  /** Kule türü → birlik rolü → hasar çarpanı (GDD §3). */
  multipliers: Record<TowerKind, Record<Role, number>>;
  /** Kule mermisi hızı (birim/sn). */
  projectileSpeed: number;
}

/**
 * Özel yetenek (GDD §7). Bir merkez noktası seçilir; alan = merkez ± width/2, savaş alanına kırpılır.
 * Yalnız düşman birliklerini etkiler; üsse ve dost birliklere etki etmez (PRD Y-03).
 * Hasarlar tamsayıdır. Süreli alan hasarı saniyede bir (her tickRate tick'te) uygulanır.
 */
export interface AbilityDef {
  /** Kalıcı kimlik. Görünen ad i18n'dedir: `ability.<id>`. */
  id: string;
  /** 1..5 */
  age: number;
  width: number;
  cooldownSec: number;
  /** Vuruş anında alandaki düşmanlara hasar (delaySec varsa gecikme sonunda). */
  impactDamage?: number;
  /** Gecikmeli vuruş: alan önceden gösterilir, bu süre sonunda vurur. */
  delaySec?: number;
  /** Vuruşta alandaki düşmanlara uygulanan durum etkisi. */
  status?: AbilityStatusDef;
  /** Süreli alan: süre boyunca içindeki düşmanlara etki eder. */
  zone?: AbilityZoneDef;
}

export interface AbilityStatusDef {
  /** stun: hareket ve saldırı yok. freeze: stun + alınan hasar artışı. */
  kind: 'stun' | 'freeze';
  durationSec: number;
  /** freeze için alınan hasar artışı (%); hasar tamsayıya yuvarlanır. */
  damageTakenPct?: number;
}

export interface AbilityZoneDef {
  durationSec: number;
  /** Saniyede bir uygulanan hasar (tamsayı). */
  damagePerSec?: number;
  /** Alandaki düşmanların hız azalması (%). */
  slowPct?: number;
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
  /** Bu çağda kurulabilen kuleler (PRD Ç-06: yalnız güncel çağınkiler). */
  towerIds: string[];
  /** Bu çağın özel yeteneği (AbilityDef.id). */
  abilityId: string;
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
  /** Kule kullanımı: üs ön yüzüne bu mesafede düşman birliği varken boş yuvaya kule kurar; en çok maxSlots yuva kullanır. */
  tower: { threatDistance: number; maxSlots: number };
}

// ---- Yapay zekâ zorluk profilleri (GDD §9) ----------------------------------

export type AiDifficulty = 'easy' | 'normal' | 'hard';

/**
 * Kule kullanım politikası (GDD §9 tablosu):
 * - 'lowHp': yalnız üs canı `hpTrigger` oranının altındayken kurar (Kolay).
 * - 'pressure': üsse yakın düşman varken ya da üs can kaybederken kurar (Normal).
 * - 'anticipate': kendi yarısında düşman gücü kendi gücünü aşınca da kurar (Zor).
 */
export type AiTowerPolicy = 'lowHp' | 'pressure' | 'anticipate';

export interface AiProfileDef {
  /** Karar aralığı (sn). */
  decisionIntervalSec: number;
  /** Her siparişte doğru karşılığı (gözleme dayalı bileşim) seçme olasılığı; başarısızsa rastgele rol. */
  counterAccuracy: number;
  /** Çağ koşulları oluştuktan sonra biriktirmeye başlamadan önceki gecikme aralığı (sn, [en az, en çok]). */
  ageUpDelaySec: [number, number];
  /** true ise tehdit yüksekken çağ için biriktirmez (üretime devam eder). */
  ageThreatCheck: boolean;
  /**
   * Hesaplı çağ rezervi: deneyim sonraki eşiğin `xpFraction` oranına ulaşınca çağ ücretinin `goldFraction` oranı
   * kadar altın, birlik harcamasından korunur (eşik geçince ani üretim boşluğunu kısaltır). null: yok.
   */
  agePreReserve: { xpFraction: number; goldFraction: number } | null;
  tower: {
    policy: AiTowerPolicy;
    /** Kullanılabilecek en çok yuva sayısı (sırayla). */
    maxSlots: number;
    /** 'lowHp' politikasında tetik: üs canı oranı bunun altına inince. */
    hpTrigger: number;
    /** true: düşman bileşimine göre A/B seçer; false: her zaman hızlı (A). */
    chooseKind: boolean;
    /** true: eski çağın kulesini satıp güncel çağınkini kurar. */
    renew: boolean;
  };
  /** Kuyrukta tutulan sipariş sayısı: [olağan, ileri itmede]. */
  queueTarget: [number, number];
  /** Karar anında hiç sipariş vermeme olasılığı (Kolay: "altın boşta bekler"). */
  idleChance: number;
  /** Sınır Taşı: 0 yok sayar, 1 taş kaybedilince ve güç uygunken iter, 2 tarafsızken de aktif hedefler. */
  stoneWeight: 0 | 1 | 2;
}

/** Zorluklardan bağımsız yapay zekâ ayarları (ölçüm ve eşikler). */
export interface AiTuningDef {
  /** Birlik gücü = maliyet × can oranı × agePowerFactor^(çağ−1) (çağın değeri, GDD §4). */
  agePowerFactor: number;
  /** Üssün "yakını": düşman birliğin üs ön yüzüne bakan kenarı bu mesafedeyse (birim). */
  nearBaseDistance: number;
  /** Tehdit yüksek: yakındaki düşman gücü, yakındaki kendi gücünün bu katını aşarsa. */
  highThreatRatio: number;
  /** Üs canı eğilimi penceresi (sn); pencere başına kaybedilen can oranı ölçülür. */
  trendWindowSec: number;
  /** Pencerede bu orandan fazla can kaybı "baskı" sayılır. */
  trendPressure: number;
  /** 'anticipate': kendi yarısındaki düşman gücü kendi gücünün bu katını aşınca baskı öngörülür. */
  anticipateRatio: number;
  /** Kule türü seçimi: düşmanın menzilli + ağır payı bu oranı aşarsa ağır kule (B). */
  heavyTowerShare: number;
  /** Yenilemede yeni kule ücretinin üstünde elde kalması gereken altın. */
  renewSpare: number;
  /** İleri itme: güç oranı (kendi / düşman) bunun üstündeyse. */
  pushRatio: number;
  /**
   * Ordu duruşları: rol başına hedef sayı payı (toplamı 1). Sıradaki rol, sahadaki + kuyruktaki kendi birliklerinin
   * sayı payına göre en çok eksik olandır. Karşılık döngüsü (GDD §3) dizilişle birlikte okunur: ön hat + arkasında
   * menzilli düzeni ön hat yığınını, uzun menzilli ağır yığını menzilli + ön hat karışımını, ön hat ağırlıklı düzen
   * ağır yığınını yener.
   */
  stances: Record<AiStance, Record<Role, number>>;
  /** Duruş seçimi (görünür düşman birliklerinin sayı payı): ağır payı ≥ heavy → antiHeavy; menzilli payı ≥ ranged → antiRanged. */
  stanceShare: { heavy: number; ranged: number };
  /** Görünür düşman birliği sayısı bunun altındaysa varsayılan duruş. */
  minEnemyUnits: number;
  /**
   * Kuşatma duruşu (antiTower): düşmanın en az `towers` kulesi varken görünür birliği `fewUnits`'ten azsa (kuleye
   * yaslanan savunma). Ağır birlik hızlı kulenin menzili dışından üssü döver (GDD §3, §6); başka rol kulelere yürür.
   */
  siege: { towers: number; fewUnits: number };
}

/** Ordu duruşu: varsayılan ya da görünür düşman bileşimine karşılık. */
export type AiStance = 'opening' | 'antiFront' | 'antiRanged' | 'antiHeavy' | 'antiTower';
