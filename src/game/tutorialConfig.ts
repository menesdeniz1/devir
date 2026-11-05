/**
 * Öğretici senaryosu (GDD §12). Bunlar denge verisi değil, öğretici maçının kurulum sabitleridir.
 * Birlik ve çağ sayıları `src/data/`'dan okunur; burada yalnız senaryoya özgü ayarlar bulunur.
 */

/** Adım kimlikleri, GDD §12 sırasıyla. */
export const TUTORIAL_STEP_IDS = [
  'welcome',
  'produceFront',
  'firstKill',
  'produceRanged',
  'cancelOrder',
  'buildTower',
  'useAbility',
  'ageUp',
  'captureStone',
  'destroyBase',
] as const;

export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

export const TUTORIAL = {
  /** Oyuncunun başlangıç altını (adımlar altın yüzünden tıkanmasın). */
  startGold: 1000,
  /** Rakibin başlangıç altını (betikli üretim komutları için). */
  enemyStartGold: 1000,
  /** Her adım başında oyuncunun altını en az bu değere tamamlanır. */
  goldFloor: 600,
  /** Azami canın bu oranının altına düşen (son adım öncesi rakip ve her zaman oyuncu) üs canı bu orana çekilir. */
  baseHpFloorFraction: 0.5,
  /** Adım 3: rakibin tek birliğinin canı, azami canın bu oranına indirilir. */
  weakUnitHpFraction: 0.3,
  /** Adım 7: rakip kümesindeki birlik sayısı ve kümenin rakip üssünün kenarından uzaklığı (dünya birimi). */
  clusterSize: 5,
  clusterDistanceFromBase: 500,
  /** Adım 9: Sınır Taşı sayacı, oyuncu lehine azami değerin bu oranına çekilir (kısa sürede ele geçirilsin). */
  stoneHeadStartFraction: 0.5,
  /** Adım 10: rakip üs canı bu değere indirilir (azami canı aşmaz). */
  finalEnemyBaseHp: 300,
  /** Adım 8'de oyuncunun geçeceği çağ. */
  ageUpTargetAge: 2,
} as const;
