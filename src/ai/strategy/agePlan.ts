import type { AiProfileDef } from '../../data/types';
import { getAge, secToTicks } from '../../sim/compile';
import { rngNext } from '../../sim/rng';
import type { Observation } from '../observation';
import type { AiMemory } from './memory';
import type { Threat } from './threat';

/** Çağ planı sonucu: çağ atla ya da birlik/kule harcamasından korunacak altın (rezerv). */
export interface AgeDecision {
  ageUp: boolean;
  reserve: number;
}

/**
 * Çağ planı (GDD §9 modül 2). Deneyim eşiği geçince profilin gecikmesi kadar bekler; sonra altın yetiyorsa çağ atlar,
 * yetmiyorsa ücreti biriktirir. `ageThreatCheck` açıkken tehdit yüksekse biriktirmez (savunmaya harcar).
 * Hesaplı rezerv (`agePreReserve`) eşikten önce ücretin bir kısmını korumaya başlar.
 */
export function planAge(obs: Observation, mem: AiMemory, profile: AiProfileDef, threat: Threat): AgeDecision {
  const next = getAge(obs.self.age + 1);
  if (next === undefined) {
    mem.ageReadyTick = -1;
    return { ageUp: false, reserve: 0 };
  }
  // Düşman bir çağ öndeyse çağ atlamak tek geri dönüş yoludur: tehdit altında da biriktirilir.
  const threatened = profile.ageThreatCheck && threat.high && obs.enemy.age <= obs.self.age;
  const pre = profile.agePreReserve;
  const preReserve = pre === null || threatened ? 0 : Math.round(next.ageUpCost * pre.goldFraction);
  if (obs.self.xp < next.xpThreshold) {
    mem.ageReadyTick = -1;
    return { ageUp: false, reserve: pre !== null && obs.self.xp >= next.xpThreshold * pre.xpFraction ? preReserve : 0 };
  }
  if (mem.ageReadyTick < 0) {
    mem.ageReadyTick = obs.tick;
    const [lo, hi] = profile.ageUpDelaySec;
    mem.ageDelay = secToTicks(lo + (hi - lo) * rngNext(mem.rng));
  }
  if (obs.tick < mem.ageReadyTick + mem.ageDelay) return { ageUp: false, reserve: preReserve };
  if (obs.self.gold >= next.ageUpCost) {
    mem.ageReadyTick = -1;
    return { ageUp: true, reserve: 0 };
  }
  return { ageUp: false, reserve: threatened ? 0 : next.ageUpCost };
}
