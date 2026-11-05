import type { CombatDef } from './types';

/**
 * Savaş hesapları (GDD §3). Hasar = taban hasar × roleMultipliers[saldıran rol][hedef sınıfı].
 * Simülasyon bu tabloyu yüklerken tür başına tamsayı hasar tablosuna çevirir (en az 1).
 *
 * Amaçlanan karşılık döngüsü: ön hat > ağır · ağır > menzilli kümesi · menzilli > ön hat · ağır > üs.
 * Birlikler arası en küçük çarpan 0,6'dır; temas eden düşmanlar her zaman birbirine hasar verir (ilerleme garantisi).
 */
export const COMBAT: CombatDef = {
  roleMultipliers: {
    front: { front: 1.0, ranged: 1.2, heavy: 1.5, base: 1.0 },
    ranged: { front: 1.3, ranged: 1.0, heavy: 0.7, base: 0.5 },
    heavy: { front: 0.6, ranged: 1.5, heavy: 1.0, base: 2.5 },
  },
  projectileSpeed: {
    front: null,
    ranged: 600,
    heavy: 400,
  },
};
