import type { UnitDef } from './types';

/**
 * Birlik verisi (GDD §5). Aşama 2: İlkel Çağ'ın üç rolü. Diğer çağlar Aşama 3'te eklenir.
 * Kimlikler kalıcıdır; kayıt dosyalarında geçer. Görünen adlar i18n'dedir: `unit.<id>`.
 */
export const UNITS: readonly UnitDef[] = [
  {
    // Taşbaltacı
    id: 'primitive_front',
    age: 1,
    role: 'front',
    cost: 50,
    buildTimeSec: 3,
    hp: 180,
    damage: 20,
    attackIntervalSec: 1,
    range: 12,
    speed: 60,
    width: 36,
    bountyGold: 30,
    bountyXp: 25,
  },
  {
    // Mızrak Savuran
    id: 'primitive_ranged',
    age: 1,
    role: 'ranged',
    cost: 70,
    buildTimeSec: 3.5,
    hp: 90,
    damage: 14,
    attackIntervalSec: 1.2,
    range: 190,
    speed: 55,
    width: 30,
    bountyGold: 40,
    bountyXp: 35,
  },
  {
    // Kaya Kaldıracı
    id: 'primitive_heavy',
    age: 1,
    role: 'heavy',
    cost: 160,
    buildTimeSec: 6,
    hp: 420,
    damage: 48,
    attackIntervalSec: 3,
    range: 300,
    speed: 32,
    width: 56,
    bountyGold: 95,
    bountyXp: 80,
    splash: { radius: 50, falloff: 0.5 },
  },
];
