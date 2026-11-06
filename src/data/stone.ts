import type { ErosionDef, StoneDef } from './types';

/** Sınır Taşı (GDD §8). Bölge koridorun ortasıdır; çağ başına bonuslar ages.ts'tedir. */
export const STONE: StoneDef = {
  zoneStart: 860,
  zoneEnd: 1060,
  counterMax: 100,
  // Ölçüm (N–N 200 maç, aşınmayla): taşı ilk alan %48 kazanır (kazansız %81,5); Zor–Normal %77,5, Normal–Kolay %98,5.
  potShare: 0.5,
};

/** Aşınma: 13:00'ten sonra saniyede azami canın ‰5'i; kilitlenen maç bırakmaz (ölçüm: %0, kazansız %5,5). */
export const EROSION: ErosionDef = {
  startSec: 780,
  perSecPermille: 5,
};
