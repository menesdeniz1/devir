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
}

export interface SideState {
  gold: number;
  xp: number;
  /** 1..5 */
  age: number;
  baseHp: number;
  baseMaxHp: number;
  queue: QueueOrder[];
  stats: SideStats;
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
  /** Atan birliğin türü (UnitDef.id); hasar ve istatistik buradan hesaplanır. Atan birlik ölmüş olabilir. */
  sourceType: string;
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

/** Yapay zekâ belleği: yalnızca JSON değerleri. Biçimi ai/ katmanı belirler. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface MatchConfig {
  seed: number;
  /** Rakip denetleyicisi. Aşama 1: 'basic-bot'. Aşama 6'da zorluk seviyeleri eklenir. */
  opponent: 'basic-bot' | 'none';
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
  /** Taraf başına yapay zekâ belleği; denetlenmeyen taraf için null. */
  ai: [JsonValue, JsonValue];
}

// ---- Komutlar --------------------------------------------------------------

export type Command =
  | { type: 'queueUnit'; side: SideId; unitId: string }
  /** index ≥ 1 olmalı (index 0 üretimdedir). */
  | { type: 'cancelOrder'; side: SideId; index: number };

export type RejectReason =
  /** Bozuk komut: taraf 0/1 değil, bilinmeyen tür ya da eksik/yanlış tipli alan. */
  | 'invalidCommand'
  | 'matchOver'
  | 'unknownUnit'
  | 'unitNotAvailable'
  | 'notEnoughGold'
  | 'queueFull'
  | 'orderInProduction'
  | 'noSuchOrder';

export type Validation =
  | { ok: true }
  | { ok: false; reason: RejectReason; /** notEnoughGold için eksik miktar */ missingGold?: number };

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
  | { type: 'matchEnded'; outcome: Outcome };
