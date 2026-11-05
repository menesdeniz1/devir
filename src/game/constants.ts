/**
 * Oyun döngüsü ve oturum sabitleri. Bunlar denge değil, altyapı ayarıdır (TDD §4).
 * Adım hızı (tick/sn) burada değil, `src/data/world.ts` içindedir.
 */

/** Tek karede biriktirilebilecek en uzun süre (ms): uzun duraksamalardan sonra "ölüm sarmalı" olmasın (TDD §4). */
export const MAX_FRAME_MS = 250;

/** Ardışık bu kadar karede hata olursa oyun döngüsü durur ve hata ekranı gösterilir. */
export const MAX_CONSECUTIVE_FRAME_ERRORS = 30;

/** Konsola yazılan farklı kare hatası sayısının üst sınırı (aynı hata her karede tekrarlanabilir). */
export const MAX_LOGGED_FRAME_ERRORS = 5;

/** Oyuncunun oynadığı taraf. */
export const PLAYER_SIDE = 0 as const;

/** Varsayılan maç tohumu. */
export const DEFAULT_SEED = 1;

/** Geliştirme panelindeki hız çarpanları (kare başına adım sayısı çarpanı). */
export const DEBUG_SPEEDS = [1, 4, 16] as const;

/** Geliştirme panelindeki "altın ver" miktarı. */
export const DEBUG_GOLD_GRANT = 500;

/** Geliştirme panelindeki "deneyim ver" miktarı. */
export const DEBUG_XP_GRANT = 1000;

/** Geliştirme panelinde üs canının ayarlandığı değer. */
export const DEBUG_LOW_BASE_HP = 1;

/** Geliştirme panelindeki "rakip üssüne hasar" miktarı. */
export const DEBUG_BASE_HIT = 1;

// ---- Kalıcılık (TDD §9) ---------------------------------------------------------

/** localStorage anahtarları. */
export const STORAGE_KEYS = {
  settings: 'devir.settings.v1',
  results: 'devir.results.v1',
  tutorial: 'devir.tutorial.v1',
  save: 'devir.save.v1',
} as const;

/** Periyodik kayıt aralığı (oyun saniyesi; PRD ÖK-03: en geç 10 sn). Tick karşılığı `WORLD.tickRate` ile çarpılarak bulunur. */
export const SAVE_INTERVAL_SEC = 10;

/** Kayıt biçimi sürümü; uyumsuz kayıt silinir (ilk sürümde göç yok, TDD §9). */
export const SAVE_SCHEMA_VERSION = 1;

/** Saklanan son sonuç sayısı (GDD §13). */
export const RESULTS_HISTORY_MAX = 20;

/** Ayarların varsayılanları ve sınırları (PRD EK-07). */
export const DEFAULT_SETTINGS = { musicVolume: 60, sfxVolume: 80, screenShake: true } as const;
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 100;

/** Maç kurulumunda ön seçili zorluk. */
export const DEFAULT_DIFFICULTY = 'normal' as const;
