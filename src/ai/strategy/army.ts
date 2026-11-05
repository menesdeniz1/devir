import { AI_TUNING } from '../../data/ai';
import type { AiProfileDef, AiStance, Role } from '../../data/types';
import { ECONOMY } from '../../data/world';
import { unitOfRole } from '../../sim/compile';
import { rngInt, rngNext, type RngState } from '../../sim/rng';
import type { Command } from '../../sim/types';
import type { Observation } from '../observation';
import type { AiMemory } from './memory';
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

/**
 * Karşılık değerlendirmesi: her kararda `counterAccuracy` olasılığıyla duruşu görünür düşman bileşimine göre
 * günceller; başarısızsa önceki duruşu (eski bilgiyle verilmiş karşılığı) korur.
 */
export function updateStance(stance: AiStance, threat: Threat, profile: AiProfileDef, rng: RngState): AiStance {
  return rngNext(rng) < profile.counterAccuracy ? chooseStance(threat) : stance;
}

/**
 * Ordu bileşimi (GDD §9 modül 4): kuyruğu hedef uzunluğa kadar doldurur; siparişler duruşun üretim dizisini
 * (bellekteki `seq` sırasından) döngüsel izler. Sıradaki rolün altını yetmezse bekler (sırayı atlamaz).
 * `roleLock` verilirse yalnız o rol (tek rol ölçüm botu, GDD §10); `fixedPattern` verilirse duruş yerine o dizi.
 */
export function planArmy(
  obs: Observation,
  mem: AiMemory,
  profile: AiProfileDef,
  budget: number,
  push: boolean,
  roleLock: Role | null,
  fixedPattern: readonly Role[] | null = null,
): Command[] {
  const commands: Command[] = [];
  const target = Math.min(ECONOMY.maxQueue, push ? profile.queueTarget[1] : profile.queueTarget[0]);
  if (obs.self.queue.length >= target) return commands;
  if (profile.idleChance > 0 && rngNext(mem.rng) < profile.idleChance) return commands;
  if (mem.opening < 0) mem.opening = rngInt(mem.rng, AI_TUNING.openings.length);
  const opening = AI_TUNING.openings[mem.opening] ?? AI_TUNING.stances.opening;
  const pattern = fixedPattern ?? (mem.stance === 'opening' ? opening : AI_TUNING.stances[mem.stance]);
  let gold = budget;
  for (let queued = obs.self.queue.length; queued < target; queued++) {
    const role = roleLock ?? pattern[mem.seq % pattern.length] ?? 'front';
    const unit = unitOfRole(obs.self.age, role);
    if (unit === undefined || gold < unit.def.cost) break;
    commands.push({ type: 'queueUnit', side: obs.side, unitId: unit.def.id });
    gold -= unit.def.cost;
    mem.seq += 1;
  }
  return commands;
}
