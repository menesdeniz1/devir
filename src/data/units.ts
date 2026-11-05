import type { UnitDef } from './types';

/**
 * Birlik verisi (GDD §5). Aşama 1: yalnızca İlkel Çağ ön hat birliği.
 * Kimlikler kalıcıdır; kayıt dosyalarında geçer.
 */
export const UNITS: readonly UnitDef[] = [
  {
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
];
