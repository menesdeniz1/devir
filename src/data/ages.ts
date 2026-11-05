import type { AgeDef } from './types';

/** Çağ verisi (GDD §4). Aşama 1: yalnızca İlkel Çağ. Diğer çağlar Aşama 3'te eklenir. */
export const AGES: readonly AgeDef[] = [
  {
    age: 1,
    xpThreshold: 0,
    ageUpCost: 0,
    baseMaxHp: 4000,
    incomePerSec: 4,
    unitIds: ['primitive_front'],
  },
];
