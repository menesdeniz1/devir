/**
 * Oyun döngüsü ve oturum sabitleri. Bunlar denge değil, altyapı ayarıdır (TDD §4).
 * Adım hızı (tick/sn) burada değil, `src/data/world.ts` içindedir.
 */

/** Tek karede biriktirilebilecek en uzun süre (ms): uzun duraksamalardan sonra "ölüm sarmalı" olmasın (TDD §4). */
export const MAX_FRAME_MS = 250;

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
