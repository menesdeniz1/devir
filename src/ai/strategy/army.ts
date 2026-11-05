import { AI_TUNING } from '../../data/ai';
import type { AiProfileDef, AiStance, Role } from '../../data/types';
import { ECONOMY } from '../../data/world';
import { getUnit, unitOfRole } from '../../sim/compile';
import { rngNext, type RngState } from '../../sim/rng';
import type { Command } from '../../sim/types';
import type { Observation } from '../observation';
import type { Threat } from './threat';

export const ROLES: readonly Role[] = ['front', 'ranged', 'heavy'];

/**
 * Görünür düşman bileşimine karşılık duruşu (GDD §3 döngüsü, dizilişle birlikte): kule savunmasına ağır kuşatma,
 * ağır yığınına ön hat ağırlıklı, menzilli içeren orduya uzun menzilli ağır, ön hat yığınına ön hat + arkasında menzilli.
 */
export function chooseStance(threat: Threat): AiStance {
  const c = threat.enemyCount;
  const total = c.front + c.ranged + c.heavy;
  const siege = AI_TUNING.siege;
  if (threat.enemyTowers >= siege.towers && total < siege.fewUnits) return 'antiTower';
  if (total < AI_TUNING.minEnemyUnits) return 'opening';
  if (c.heavy / total >= AI_TUNING.stanceShare.heavy) return 'antiHeavy';
  if (c.ranged / total >= AI_TUNING.stanceShare.ranged) return 'antiRanged';
  return 'antiFront';
}

/** Sahadaki ve kuyruktaki kendi birliklerinin rol başına sayısı. */
function tally(obs: Observation, threat: Threat): Record<Role, number> {
  const count = { ...threat.ownCount };
  for (const order of obs.self.queue) {
    const unit = getUnit(order.unitId);
    if (unit !== undefined) count[unit.role] += 1;
  }
  return count;
}

/** Duruşun hedef payından en çok eksik olan rol (eşitlikte ROLES sırası). */
function mostLacking(mix: Record<Role, number>, count: Record<Role, number>): Role {
  const total = count.front + count.ranged + count.heavy + 1;
  let role: Role = 'front';
  let best = -Infinity;
  for (const r of ROLES) {
    if (mix[r] <= 0) continue;
    const deficit = mix[r] - count[r] / total;
    if (deficit > best) {
      best = deficit;
      role = r;
    }
  }
  return role;
}

/**
 * Karşılık değerlendirmesi: her kararda `counterAccuracy` olasılığıyla duruşu görünür düşman bileşimine göre
 * günceller; başarısızsa önceki duruşu (eski bilgiyle verilmiş karşılığı) korur.
 */
export function updateStance(stance: AiStance, threat: Threat, profile: AiProfileDef, rng: RngState): AiStance {
  return rngNext(rng) < profile.counterAccuracy ? chooseStance(threat) : stance;
}

/**
 * Ordu bileşimi (GDD §9 modül 4): kuyruğu hedef uzunluğa kadar doldurur; her sipariş, duruşun hedef payından en
 * çok eksik olan roldür. Seçilen rolün altını yetmezse bekler (sırayı atlamaz). `roleLock` verilirse yalnız o rol
 * (tek rol ölçüm botu, GDD §10).
 */
export function planArmy(
  obs: Observation,
  threat: Threat,
  profile: AiProfileDef,
  rng: RngState,
  stance: AiStance,
  budget: number,
  push: boolean,
  roleLock: Role | null,
): Command[] {
  const commands: Command[] = [];
  const target = Math.min(ECONOMY.maxQueue, push ? profile.queueTarget[1] : profile.queueTarget[0]);
  if (obs.self.queue.length >= target) return commands;
  if (profile.idleChance > 0 && rngNext(rng) < profile.idleChance) return commands;
  const mix = AI_TUNING.stances[stance];
  const count = tally(obs, threat);
  let gold = budget;
  for (let queued = obs.self.queue.length; queued < target; queued++) {
    const role = roleLock ?? mostLacking(mix, count);
    const unit = unitOfRole(obs.self.age, role);
    if (unit === undefined || gold < unit.def.cost) break;
    commands.push({ type: 'queueUnit', side: obs.side, unitId: unit.def.id });
    gold -= unit.def.cost;
    count[role] += 1;
  }
  return commands;
}
