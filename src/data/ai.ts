import type { BasicBotDef } from './types';

/**
 * Aşama 1 basit rakip botu. Aşama 6'da zorluk profilleriyle değiştirilir (GDD §9).
 *
 * Neden üretimi kısıtlı: Tek ve aynı birlik türüyle cephede yalnızca öndeki çift dövüşür ve her düello
 * karşılıklı ölümle biter (GDD §10, aynalı takas). Her düelloda (≈9 sn) bir birlik yenileyebilen taraf asla
 * geri itilemez. Bu bot en fazla ~12 sn'de bir birlik çıkarır; altınını hızlı harcayan oyuncu cepheyi
 * itebilir, hiç üretmeyen oyuncu ise kaybeder.
 */
export const BASIC_BOT: BasicBotDef = {
  decisionIntervalSec: 12,
  targetQueueLength: 1,
};
