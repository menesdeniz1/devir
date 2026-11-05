import type { DefenseDef, TowerDef } from './types';

/**
 * Savunma verisi (GDD §6). Ölçekleme: maliyet 120/160 × 1,75^(n−1) (en yakın 5'e, ortada yukarı),
 * hasar 16/40 × 2^(n−1); menzil ve aralık sabit.
 * Hızlı kulenin (A) menzili 270, ağır birliklerin 300+ menzilinden kısadır: kuşatma üssü A kulesinin dışından döver
 * (PRD B-03, D-07). Ağır kule (B) kısa menzilli alan hasarı verir.
 */
export const DEFENSE: DefenseDef = {
  slotUnlockCosts: [0, 200, 500],
  sellRefundRatio: 0.5,
  multipliers: {
    fast: { front: 1.0, ranged: 1.2, heavy: 0.7 },
    heavy: { front: 0.9, ranged: 1.3, heavy: 1.2 },
  },
  projectileSpeed: 700,
};

export const TOWERS: readonly TowerDef[] = [
  // İlkel Çağ
  { id: 'primitive_tower_fast', age: 1, kind: 'fast', cost: 120, damage: 16, attackIntervalSec: 0.6, range: 270 }, // Sapan Direği
  { id: 'primitive_tower_heavy', age: 1, kind: 'heavy', cost: 160, damage: 40, attackIntervalSec: 2, range: 200, splash: { radius: 60, falloff: 0.5 } }, // Kaya Oluğu
  // Antik Çağ
  { id: 'ancient_tower_fast', age: 2, kind: 'fast', cost: 210, damage: 32, attackIntervalSec: 0.6, range: 270 }, // Ok Burcu
  { id: 'ancient_tower_heavy', age: 2, kind: 'heavy', cost: 280, damage: 80, attackIntervalSec: 2, range: 200, splash: { radius: 60, falloff: 0.5 } }, // Kızgın Kum Kazanı
  // Orta Çağ
  { id: 'medieval_tower_fast', age: 3, kind: 'fast', cost: 370, damage: 64, attackIntervalSec: 0.6, range: 270 }, // Arbalet Mazgalı
  { id: 'medieval_tower_heavy', age: 3, kind: 'heavy', cost: 490, damage: 160, attackIntervalSec: 2, range: 200, splash: { radius: 60, falloff: 0.5 } }, // Kaynar Yağ Oluğu
  // Endüstri Çağı
  { id: 'industrial_tower_fast', age: 4, kind: 'fast', cost: 645, damage: 128, attackIntervalSec: 0.6, range: 270 }, // Makineli Yuva
  { id: 'industrial_tower_heavy', age: 4, kind: 'heavy', cost: 860, damage: 320, attackIntervalSec: 2, range: 200, splash: { radius: 60, falloff: 0.5 } }, // Havan Mevzisi
  // Gelecek Çağı
  { id: 'future_tower_fast', age: 5, kind: 'fast', cost: 1125, damage: 256, attackIntervalSec: 0.6, range: 270 }, // Darbe Lazeri
  { id: 'future_tower_heavy', age: 5, kind: 'heavy', cost: 1500, damage: 640, attackIntervalSec: 2, range: 200, splash: { radius: 60, falloff: 0.5 } }, // Plazma Havanı
];
