import { AI_TUNING } from '../../data/ai';
import { DEFENSE } from '../../data/towers';
import type { AiProfileDef, TowerKind } from '../../data/types';
import { getAge, getTower, sellRefund } from '../../sim/compile';
import type { Command } from '../../sim/types';
import type { Observation } from '../observation';
import { towerOfKind } from '../towerPlan';
import type { Threat } from './threat';

export interface DefensePlan {
  commands: Command[];
  /** Net harcanan altın (satış iadesi düşülmüş). */
  spent: number;
}

/** Düşman bileşimine göre kule türü (GDD §3, §6): menzilli ağırlıklı orduya karşı alan hasarlı B, aksi hâlde A. */
function chooseKind(threat: Threat, profile: AiProfileDef): TowerKind {
  if (!profile.tower.chooseKind) return 'fast';
  return threat.enemyShare.ranged >= AI_TUNING.heavyTowerShare ? 'heavy' : 'fast';
}

function wantsTower(obs: Observation, threat: Threat, profile: AiProfileDef): boolean {
  switch (profile.tower.policy) {
    case 'lowHp':
      return obs.self.baseHp < obs.self.baseMaxHp * profile.tower.hpTrigger;
    case 'pressure':
      return threat.pressure;
    case 'anticipate':
      return threat.pressure || (threat.halfEnemy > 0 && threat.halfEnemy > AI_TUNING.anticipateRatio * threat.halfOwn);
  }
}

/**
 * Savunma (GDD §9 modül 3). Karar başına en çok bir kule işlemi: baskı varken sıradaki boş yuvaya (gerekirse önce
 * açarak) güncel çağın uygun kulesini kurar; baskı yokken (yalnız `renew`) eski çağın kulesini satıp yenisini kurar.
 * `budget`: bu karar için kullanılabilir altın (çağ rezervi düşülmüş).
 */
export function planDefense(obs: Observation, threat: Threat, profile: AiProfileDef, budget: number): DefensePlan {
  const none: DefensePlan = { commands: [], spent: 0 };
  const ageDef = getAge(obs.self.age);
  if (ageDef === undefined) return none;
  const limit = Math.min(profile.tower.maxSlots, obs.self.slots.length);
  const side = obs.side;

  if (wantsTower(obs, threat, profile)) {
    for (let i = 0; i < limit; i++) {
      const slot = obs.self.slots[i]!;
      if (slot.tower !== null) continue;
      const towerId = towerOfKind(ageDef.towerIds, chooseKind(threat, profile));
      const tower = towerId === undefined ? undefined : getTower(towerId);
      if (tower === undefined) return none;
      const unlockCost = slot.unlocked ? 0 : (DEFENSE.slotUnlockCosts[i] ?? 0);
      const cost = unlockCost + tower.def.cost;
      if (budget < cost) return none;
      const commands: Command[] = [];
      if (!slot.unlocked) commands.push({ type: 'unlockSlot', side, slot: i });
      commands.push({ type: 'buildTower', side, slot: i, towerId: tower.def.id });
      return { commands, spent: cost };
    }
  }

  if (profile.tower.renew && !threat.pressure) {
    for (let i = 0; i < limit; i++) {
      const old = obs.self.slots[i]!.tower;
      if (old === null) continue;
      const oldDef = getTower(old.type);
      if (oldDef === undefined || oldDef.def.age >= obs.self.age) continue;
      const towerId = towerOfKind(ageDef.towerIds, oldDef.def.kind);
      const tower = towerId === undefined ? undefined : getTower(towerId);
      if (tower === undefined) continue;
      const net = tower.def.cost - sellRefund(old.paid);
      if (budget < net + AI_TUNING.renewSpare || budget + sellRefund(old.paid) < tower.def.cost) continue;
      return {
        commands: [
          { type: 'sellTower', side, slot: i },
          { type: 'buildTower', side, slot: i, towerId: tower.def.id },
        ],
        spent: net,
      };
    }
  }
  return none;
}
