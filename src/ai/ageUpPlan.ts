import { getAge } from '../sim/compile';
import type { SideState } from '../sim/types';

/**
 * Botların ortak çağ atlama kararı (yalnızca kendi durumuna bakar):
 * - 'none': deneyim sonraki eşiğe ulaşmadı ya da son çağdayız; normal üretim sürer.
 * - 'save': eşik geçildi ama altın yetmiyor; üretimi durdurup biriktir.
 * - 'ageUp': eşik geçildi ve altın yetiyor; çağ atla.
 */
export type AgeUpPlan = 'none' | 'save' | 'ageUp';

export function planAgeUp(self: Pick<SideState, 'age' | 'xp' | 'gold'>): AgeUpPlan {
  const next = getAge(self.age + 1);
  if (next === undefined || self.xp < next.xpThreshold) return 'none';
  return self.gold >= next.ageUpCost ? 'ageUp' : 'save';
}
