import { DEFENSE } from '../data/towers';
import { launchAbility } from './abilities';
import { abilityOfAge, mustGetAbility, mustGetAge, mustGetTower, mustGetUnit, sellRefund } from './compile';
import { abilityArea } from './geometry';
import type { Command, GameState, SimEvent } from './types';
import { validate } from './validate';

/**
 * Tek komutu uygular. Reddedilen komut durumu DEĞİŞTİRMEZ; yalnızca 'commandRejected' olayı üretir.
 */
export function applyCommand(state: GameState, cmd: Command, events: SimEvent[]): void {
  const result = validate(state, cmd);
  if (!result.ok) {
    events.push({ type: 'commandRejected', command: cmd, reason: result.reason });
    return;
  }
  const side = state.sides[cmd.side];
  switch (cmd.type) {
    case 'queueUnit': {
      const cost = mustGetUnit(cmd.unitId).def.cost;
      side.gold -= cost;
      side.stats.goldSpent += cost;
      side.queue.push({ unitId: cmd.unitId, progressTicks: 0, paid: cost });
      events.push({ type: 'unitQueued', side: cmd.side, unitId: cmd.unitId, paid: cost });
      break;
    }
    case 'ageUp': {
      // Çağlar sırayla; deneyim harcanmaz; saha ve kuyruk değişmez; üs can yüzdesi korunur (PRD Ç-02…Ç-07).
      const oldMax = side.baseMaxHp;
      const next = mustGetAge(side.age + 1);
      side.gold -= next.ageUpCost;
      side.stats.goldSpent += next.ageUpCost;
      side.age = next.age;
      side.baseHp = side.baseHp > 0 ? Math.max(1, Math.round((side.baseHp * next.baseMaxHp) / oldMax)) : 0;
      side.baseMaxHp = next.baseMaxHp;
      side.stats.ageUpTicks.push(state.tick);
      // Kalan yetenek beklemesi korunur ama yeni yeteneğin tam beklemesini aşamaz (PRD Y-05).
      side.abilityCooldown = Math.min(side.abilityCooldown, mustGetAbility(next.abilityId).cooldownTicks);
      events.push({ type: 'agedUp', side: cmd.side, age: next.age, paid: next.ageUpCost, baseHp: side.baseHp, baseMaxHp: side.baseMaxHp });
      break;
    }
    case 'unlockSlot': {
      // Yuva ücreti iade edilmez (PRD E-05).
      const cost = DEFENSE.slotUnlockCosts[cmd.slot] ?? 0;
      side.gold -= cost;
      side.stats.goldSpent += cost;
      side.slots[cmd.slot]!.unlocked = true;
      events.push({ type: 'slotUnlocked', side: cmd.side, slot: cmd.slot, paid: cost });
      break;
    }
    case 'buildTower': {
      const cost = mustGetTower(cmd.towerId).def.cost;
      side.gold -= cost;
      side.stats.goldSpent += cost;
      side.slots[cmd.slot]!.tower = { type: cmd.towerId, paid: cost, cooldown: 0 };
      events.push({ type: 'towerBuilt', side: cmd.side, slot: cmd.slot, towerType: cmd.towerId, paid: cost });
      break;
    }
    case 'sellTower': {
      // İade = floor(ödenen × oran); havadaki mermiler sürer (PRD E-05, D-05).
      const slot = side.slots[cmd.slot]!;
      const tower = slot.tower;
      if (tower === null) return; // validate bunu zaten dışlar
      const refund = sellRefund(tower.paid);
      slot.tower = null;
      side.gold += refund;
      side.stats.goldRefunded += refund;
      events.push({ type: 'towerSold', side: cmd.side, slot: cmd.slot, towerType: tower.type, refund });
      break;
    }
    case 'castAbility': {
      // Yalnız kayıt yapılır; etkiler adım 5 (alan) ve adım 9 (vuruş) içinde işlenir. Bekleme tam değerle başlar (PRD Y-04).
      const ability = abilityOfAge(side.age);
      const area = ability === undefined ? null : abilityArea(cmd.x, ability.def.width);
      if (ability === undefined || area === null) return; // validate bunu zaten dışlar
      side.abilityCooldown = ability.cooldownTicks;
      events.push({ type: 'abilityCast', side: cmd.side, abilityId: ability.def.id, x0: area.x0, x1: area.x1 });
      launchAbility(state, cmd.side, ability, area.x0, area.x1);
      break;
    }
    case 'cancelOrder': {
      const [order] = side.queue.splice(cmd.index, 1);
      if (order === undefined) return; // validate bunu zaten dışlar
      side.gold += order.paid;
      side.stats.goldRefunded += order.paid;
      events.push({ type: 'orderCancelled', side: cmd.side, index: cmd.index, unitId: order.unitId, refund: order.paid });
      break;
    }
  }
}
