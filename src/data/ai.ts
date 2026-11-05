import type { BasicBotDef } from './types';

/**
 * Aşama 1–5 basit rakip botu. Aşama 6'da zorluk profilleriyle değiştirilir (GDD §9).
 * Gözlemi okumaz; sabit bir bileşimi döngüsel sipariş eder. Bu yüzden karşılık seçen oyuncu onu yenebilir.
 * Aynalı takas (GDD §10) nedeniyle üretim hızı bilerek sınırlıdır.
 */
export const BASIC_BOT: BasicBotDef = {
  decisionIntervalSec: 6,
  targetQueueLength: 2,
  composition: ['front', 'front', 'ranged', 'front', 'ranged', 'heavy'],
};
