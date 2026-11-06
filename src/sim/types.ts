/**
 * Simülasyon sözleşmesi (TDD §3). Lead tarafından tanımlanır; değişiklik lead onayıyla yapılır.
 *
 * Kurallar:
 * - GameState düz, JSON'a serileştirilebilir veridir (sınıf, Map, fonksiyon, döngüsel başvuru yok).
 * - Altın ve deneyim tamsayıdır. Sayaçlar (cooldown, ilerleme) tamsayı tick'tir. Konum ve can kayan noktalı olabilir.
 * - Taraf 0 = oyuncu (solda, +x yönüne ilerler); taraf 1 = rakip (sağda, -x yönüne ilerler).
 */

export type SideId = 0 | 1;

export type Outcome =
  | { kind: 'win'; winner: SideId; tick: number }
  | { kind: 'draw'; tick: number };

export interface QueueOrder {
  unitId: string;
  /** Üretimde geçen tick. Kuyruğun başındaki (index 0) sipariş üretimdedir ve iptal edilemez. */
  progressTicks: number;
  /** Ödenen altın; iptalde bu tutar iade edilir. */
  paid: number;
}

export interface SideStats {
  /** unitId → adet */
  produced: Record<string, number>;
  lost: Record<string, number>;
  /** Öldüren birlik türüne göre öldürme sayısı (unitId → adet). */
  kills: Record<string, number>;
  goldEarned: number;
  goldSpent: number;
  goldRefunded: number;
  baseDamageDealt: number;
  /** Çağ geçişlerinin tick'leri: [0] = 2. çağa geçiş, … (sonuç ekranı için). */
  ageUpTicks: number[];
}

export interface SideState {
  gold: number;
  xp: number;
  /** 1..5 */
  age: number;
  baseHp: number;
  baseMaxHp: number;
  queue: QueueOrder[];
  /** Üç savunma yuvası (PRD D-01). index 0 başlangıçta açıktır; yuvalar sırayla açılır. */
  slots: TowerSlotState[];
  /** Güncel çağ yeteneğinin kalan beklemesi (tick). Maç başında ABILITY_RULES.initialCooldownSec. */
  abilityCooldown: number;
  stats: SideStats;
}

export interface TowerState {
  /** TowerDef.id — kurulduğu çağın kulesi; çağ geçişinde değişmez (PRD Ç-06). */
  type: string;
  /** Ödenen fiyat; satışta iade bundan hesaplanır. */
  paid: number;
  /** Bir sonraki atışa kalan tick; 0 ise atabilir. */
  cooldown: number;
}

export interface TowerSlotState {
  unlocked: boolean;
  tower: TowerState | null;
}

export type UnitMode = 'walk' | 'attack' | 'wait';

export interface UnitState {
  /** Maç içinde tekil, artan kimlik. */
  id: number;
  side: SideId;
  /** UnitDef.id */
  type: string;
  /** Birliğin merkezi (dünya birimi). Kenarlar: x ± width/2. */
  x: number;
  hp: number;
  /** Bir sonraki saldırıya kalan tick; 0 ise saldırabilir. */
  cooldown: number;
  /** Son adımda ne yaptığı (çizim ve test kolaylığı için; simülasyon kararlarında kullanılmaz). */
  mode: UnitMode;
  /** Sersemletme/donma: > 0 iken birlik hareket etmez ve saldırmaz (sayacı da azalmaz). Tick. */
  stunTicks: number;
  /** Savunmasızlık: > 0 iken aldığı hasar (100 + vulnPct)% olur, tamsayıya yuvarlanır. Tick. */
  vulnTicks: number;
  vulnPct: number;
}

/** Süreli yetenek alanı (GDD §7). Alan hasarı her tickRate tick'te bir uygulanır; yavaşlatma alandayken geçerlidir. */
export interface AbilityZoneState {
  id: number;
  /** Yeteneği kullanan taraf; yalnız karşı tarafın birlikleri etkilenir. */
  side: SideId;
  abilityId: string;
  x0: number;
  x1: number;
  ticksLeft: number;
}

/** Gecikmeli yetenek vuruşu (ör. Baraj Ateşi); ticksLeft 0 olunca alandaki düşmanlara vurur. */
export interface PendingStrikeState {
  id: number;
  side: SideId;
  abilityId: string;
  x0: number;
  x1: number;
  ticksLeft: number;
}

/**
 * Uçan mermi (GDD §3). Menzilli ve ağır saldırılar mermi üretir; yakın dövüş anlıktır.
 * Mermi hedefini izler. Hedef mermi varmadan ölürse: alan hasarı olmayan mermi kaybolur;
 * alan hasarlı mermi hedefin son bilinen konumuna düşer ve patlar.
 */
export interface ProjectileState {
  id: number;
  /** Atan taraf. */
  side: SideId;
  /** Atan birlik mi kule mi. */
  sourceKind: 'unit' | 'tower';
  /** Atanın türü (UnitDef.id veya TowerDef.id); hasar ve istatistik buradan hesaplanır. Atan ölmüş/satılmış olabilir. */
  sourceType: string;
  /** Birlik için birlik kimliği; kule için yuva indeksi (0..2). */
  sourceId: number;
  /** Hedef birlik kimliği; null ise hedef rakip üstür. */
  targetId: number | null;
  /** Merminin anlık konumu (dünya birimi). */
  x: number;
  /** Hedefin son bilinen çarpma noktası (birliğin bakan kenarı veya üs ön yüzü). */
  targetX: number;
  /** Hedef öldüyse true; mermi targetX'e düşer (alan hasarı varsa patlar, yoksa kaybolur). */
  targetLost: boolean;
}

/**
 * Sınır Taşı (GDD §8). counter tamsayıdır: −counterMax (rakip) … +counterMax (oyuncu).
 * Gövdesi bölgeyle kesişen birlikler sayılır. Yalnız bir tarafın birliği varsa sayaç her tick o tarafa 1 ilerler;
 * iki taraf da varsa veya kimse yoksa değişmez. ±counterMax'a ulaşınca o taraf sahip olur;
 * sahip 0 iken sayaç < 0 olursa, sahip 1 iken sayaç > 0 olursa sahiplik düşer.
 */
export interface StoneState {
  counter: number;
  owner: SideId | null;
  /** Kazan (GDD §8): sahibin taş ödülünün biriken payı; taşı sahibinden söken taraf alır. */
  potGold: number;
  potXp: number;
}

/** Yapay zekâ belleği: yalnızca JSON değerleri. Biçimi ai/ katmanı belirler. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface MatchConfig {
  seed: number;
  /**
   * Rakip (taraf 1) denetleyicisi. 'easy' | 'normal' | 'hard': Aşama 6 yapay zekâsı (GDD §9).
   * 'basic-bot': Aşama 1–5 sabit bileşimli bot (test aracı). 'none': denetleyicisiz.
   */
  opponent: 'easy' | 'normal' | 'hard' | 'basic-bot' | 'none';
  /** Aşınma (GDD §8.1). Yoksa açık sayılır; maç kurulumunda kapatılabilir (uzun maç), öğretici kapalı kurar. */
  erosion?: boolean;
}

/** Aşınma bu maçta açık mı (alan yoksa açık). */
export function erosionEnabled(config: MatchConfig): boolean {
  return config.erosion !== false;
}

export interface GameState {
  schemaVersion: 1;
  config: MatchConfig;
  tick: number;
  nextId: number;
  outcome: Outcome | null;
  sides: [SideState, SideState];
  /** Sabit sırayla (oluşturulma sırası) tutulur. */
  units: UnitState[];
  /** Sabit sırayla (oluşturulma sırası) tutulur. */
  projectiles: ProjectileState[];
  /** Etkin yetenek alanları ve bekleyen gecikmeli vuruşlar (oluşturulma sırasıyla). */
  zones: AbilityZoneState[];
  strikes: PendingStrikeState[];
  stone: StoneState;
  /** Taraf başına yapay zekâ belleği; denetlenmeyen taraf için null. */
  ai: [JsonValue, JsonValue];
}

// ---- Komutlar --------------------------------------------------------------

export type Command =
  | { type: 'queueUnit'; side: SideId; unitId: string }
  /** index ≥ 1 olmalı (index 0 üretimdedir). */
  | { type: 'cancelOrder'; side: SideId; index: number }
  /** Sonraki çağa geçiş (PRD Ç-01…Ç-08). Ücret anında düşer; can yüzdesi korunur. */
  | { type: 'ageUp'; side: SideId }
  /** Kilitli yuvayı açar (yalnız sıradaki kilitli yuva). Ücret iade edilmez. */
  | { type: 'unlockSlot'; side: SideId; slot: number }
  /** Açık ve boş yuvaya güncel çağın kulesini kurar. */
  | { type: 'buildTower'; side: SideId; slot: number; towerId: string }
  /** Yuvadaki kuleyi satar; ödenen fiyatın sellRefundRatio'su (aşağı yuvarlanmış) iade edilir, yuva boşalır. */
  | { type: 'sellTower'; side: SideId; slot: number }
  /** Güncel çağ yeteneğini x merkezli alana kullanır; alan savaş alanına kırpılır (PRD Y-02). */
  | { type: 'castAbility'; side: SideId; x: number };

export type RejectReason =
  /** Bozuk komut: taraf 0/1 değil, bilinmeyen tür ya da eksik/yanlış tipli alan. */
  | 'invalidCommand'
  | 'matchOver'
  | 'unknownUnit'
  | 'unitNotAvailable'
  | 'notEnoughGold'
  | 'queueFull'
  | 'orderInProduction'
  | 'noSuchOrder'
  /** Sonraki çağın deneyim eşiğine ulaşılmadı. */
  | 'notEnoughXp'
  /** Son çağdasın. */
  | 'maxAge'
  /** Yuva indeksi geçersiz (0..2 değil). */
  | 'noSuchSlot'
  /** Yuva kilitli (kurulum için). */
  | 'slotLocked'
  /** Yuva zaten açık (açma için). */
  | 'slotAlreadyUnlocked'
  /** Önceki yuva hâlâ kilitli; yuvalar sırayla açılır. */
  | 'previousSlotLocked'
  /** Yuvada zaten kule var (kurulum için; önce sat). */
  | 'slotOccupied'
  /** Yuva boş (satış için). */
  | 'slotEmpty'
  | 'unknownTower'
  /** Kule güncel çağın kulelerinden değil. */
  | 'towerNotAvailable'
  /** Yetenek beklemede (Validation.cooldownTicks kalan süre). */
  | 'abilityCooldown';

export type Validation =
  | { ok: true }
  | {
      ok: false;
      reason: RejectReason;
      /** notEnoughGold için eksik miktar */
      missingGold?: number;
      /** notEnoughXp için mevcut ve gereken toplam deneyim */
      xp?: number;
      xpRequired?: number;
      /** abilityCooldown için kalan tick */
      cooldownTicks?: number;
    };

// ---- Olaylar (duruma yazılmaz; çizim, ses, arayüz ve testler dinler) --------

export type SimEvent =
  | { type: 'commandRejected'; command: Command; reason: RejectReason }
  | { type: 'unitQueued'; side: SideId; unitId: string; paid: number }
  | { type: 'orderCancelled'; side: SideId; index: number; unitId: string; refund: number }
  | { type: 'unitSpawned'; side: SideId; id: number; unitType: string }
  /** damage: yakın dövüşte uygulanan hasar; mermili saldırıda null (hasar çarpmada uygulanır). */
  | { type: 'attack'; side: SideId; attackerId: number; target: number | 'base'; damage: number | null }
  | { type: 'projectileFired'; side: SideId; id: number; sourceType: string; target: number | 'base' }
  /** hits: hasar alan birlik sayısı (üs dahil değil); 0 ise mermi boşa gitti. */
  | { type: 'projectileImpact'; side: SideId; id: number; x: number; hits: number; hitBase: boolean }
  | { type: 'baseDamaged'; side: SideId; amount: number }
  | { type: 'unitDied'; side: SideId; id: number; unitType: string; bountyGold: number; bountyXp: number }
  | { type: 'income'; side: SideId; amount: number }
  | { type: 'agedUp'; side: SideId; age: number; paid: number; baseHp: number; baseMaxHp: number }
  | { type: 'slotUnlocked'; side: SideId; slot: number; paid: number }
  | { type: 'towerBuilt'; side: SideId; slot: number; towerType: string; paid: number }
  | { type: 'towerSold'; side: SideId; slot: number; towerType: string; refund: number }
  /** Kule atışı (mermi 'projectileFired' ile ayrıca bildirilir). */
  | { type: 'towerFired'; side: SideId; slot: number; towerType: string; target: number }
  /** Yetenek kullanıldı (alan kırpılmış x0..x1). Anlık vuruşlu yeteneklerde 'abilityImpact' aynı adımda gelir. */
  | { type: 'abilityCast'; side: SideId; abilityId: string; x0: number; x1: number }
  /** Yeteneğin vuruşu (anlık, gecikmeli veya alanın her saniyelik hasarı); hits: etkilenen düşman birlik sayısı. */
  | { type: 'abilityImpact'; side: SideId; abilityId: string; x0: number; x1: number; hits: number }
  | { type: 'zoneExpired'; side: SideId; id: number; abilityId: string }
  | { type: 'stoneCaptured'; side: SideId }
  | { type: 'stoneLost'; side: SideId }
  /** Taşı sahibinden söken taraf (side) taştaki kazanı aldı. */
  | { type: 'stonePotClaimed'; side: SideId; gold: number; xp: number }
  /** Aşınma başladı (maçta bir kez). */
  | { type: 'erosionStarted' }
  | { type: 'matchEnded'; outcome: Outcome };
