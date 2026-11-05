import type { AgeDef } from './types';

/**
 * Çağ verisi (GDD §4, §8). Görünen adlar i18n'dedir: `age.<n>`.
 * xpThreshold: o çağa geçmek için gereken TOPLAM deneyim. Deneyim harcanmaz (PRD E-09).
 * Sınır Taşı bonusu temel gelirin ≈%30'u (tamsayıya yuvarlanmış) ve 1,5 × 1,75^(n−1) deneyim/sn.
 */
export const AGES: readonly AgeDef[] = [
  {
    age: 1,
    xpThreshold: 0,
    ageUpCost: 0,
    baseMaxHp: 4000,
    incomePerSec: 4,
    stoneGoldPerSec: 1,
    stoneXpPerSec: 2,
    unitIds: ['primitive_front', 'primitive_ranged', 'primitive_heavy'],
    towerIds: ['primitive_tower_fast', 'primitive_tower_heavy'],
    abilityId: 'primitive_stampede',
  },
  {
    age: 2,
    xpThreshold: 800,
    ageUpCost: 400,
    baseMaxHp: 6400,
    incomePerSec: 7,
    stoneGoldPerSec: 2,
    stoneXpPerSec: 3,
    unitIds: ['ancient_front', 'ancient_ranged', 'ancient_heavy'],
    towerIds: ['ancient_tower_fast', 'ancient_tower_heavy'],
    abilityId: 'ancient_fire_trench',
  },
  {
    age: 3,
    xpThreshold: 2200,
    ageUpCost: 750,
    baseMaxHp: 10200,
    incomePerSec: 12,
    stoneGoldPerSec: 4,
    stoneXpPerSec: 5,
    unitIds: ['medieval_front', 'medieval_ranged', 'medieval_heavy'],
    towerIds: ['medieval_tower_fast', 'medieval_tower_heavy'],
    abilityId: 'medieval_caltrops',
  },
  {
    age: 4,
    xpThreshold: 4800,
    ageUpCost: 1400,
    baseMaxHp: 16400,
    incomePerSec: 21,
    stoneGoldPerSec: 6,
    stoneXpPerSec: 8,
    unitIds: ['industrial_front', 'industrial_ranged', 'industrial_heavy'],
    towerIds: ['industrial_tower_fast', 'industrial_tower_heavy'],
    abilityId: 'industrial_barrage',
  },
  {
    age: 5,
    xpThreshold: 9500,
    ageUpCost: 2600,
    baseMaxHp: 26200,
    incomePerSec: 37,
    stoneGoldPerSec: 11,
    stoneXpPerSec: 14,
    unitIds: ['future_front', 'future_ranged', 'future_heavy'],
    towerIds: ['future_tower_fast', 'future_tower_heavy'],
    abilityId: 'future_stasis',
  },
];
