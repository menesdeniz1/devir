import { AI_TUNING } from '../../data/ai';
import type { AiProfileDef } from '../../data/types';
import type { Observation } from '../observation';
import type { Threat } from './threat';

/**
 * Sınır Taşı ağırlığı (GDD §9 modül 6). Birlikler zaten ileri yürüdüğünden "ileri itme", üretimi artırmak
 * (kuyruk hedefini yükseltmek) demektir. 1: taş düşmandaysa ve güç oranı uygunsa; 2: taş bizde değilse ve
 * güçler en az eşitse de.
 */
export function wantsPush(obs: Observation, threat: Threat, profile: AiProfileDef): boolean {
  if (profile.stoneWeight === 0) return false;
  const enemy = obs.side === 0 ? 1 : 0;
  if (obs.stone.owner === enemy && threat.ratio >= AI_TUNING.pushRatio) return true;
  return profile.stoneWeight === 2 && obs.stone.owner !== obs.side && threat.ratio >= 1;
}
