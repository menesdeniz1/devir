import { DEFENSE } from '../data/towers';
import { ECONOMY } from '../data/world';
import { abilityOfAge, getAge, getTower, getUnit } from './compile';
import { abilityArea } from './geometry';
import type { Command, GameState, SideId, Validation } from './types';

export function isSideId(value: unknown): value is SideId {
  return value === 0 || value === 1;
}

function isSlotIndex(slot: number, count: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < count;
}

/** Komutun biçimi (taraf, tür ve tür alanlarının tipleri) geçerli mi? Hiçbir girdide istisna fırlatmaz. */
export function isWellFormedCommand(raw: unknown): raw is Command {
  if (typeof raw !== 'object' || raw === null) return false;
  const c = raw as Record<string, unknown>;
  if (!isSideId(c['side'])) return false;
  switch (c['type']) {
    case 'queueUnit':
      return typeof c['unitId'] === 'string';
    case 'cancelOrder':
      return typeof c['index'] === 'number';
    case 'ageUp':
      return true;
    case 'unlockSlot':
    case 'sellTower':
      return typeof c['slot'] === 'number';
    case 'buildTower':
      return typeof c['slot'] === 'number' && typeof c['towerId'] === 'string';
    case 'castAbility':
      return typeof c['x'] === 'number';
    default:
      return false;
  }
}

/**
 * Komutun şu anki durumda kabul edilip edilmeyeceği. Arayüz ve simülasyon aynı yolu kullanır.
 * Bozuk komutlar (taraf 0/1 değil, bilinmeyen tür, eksik alan) önce, sonuçtan bağımsız olarak 'invalidCommand' ile reddedilir.
 */
export function validate(state: GameState, cmd: Command): Validation {
  if (!isWellFormedCommand(cmd)) return { ok: false, reason: 'invalidCommand' };
  // Yetenek: x sonlu değilse ya da alan savaş alanıyla kesişmiyorsa bozuk komuttur (sonuçtan bağımsız; PRD Y-02).
  if (cmd.type === 'castAbility') {
    const ability = abilityOfAge(state.sides[cmd.side].age);
    if (ability === undefined || abilityArea(cmd.x, ability.def.width) === null) return { ok: false, reason: 'invalidCommand' };
  }
  if (state.outcome !== null) {
    return { ok: false, reason: 'matchOver' };
  }
  const side = state.sides[cmd.side];
  switch (cmd.type) {
    case 'queueUnit': {
      const unit = getUnit(cmd.unitId);
      if (unit === undefined) {
        return { ok: false, reason: 'unknownUnit' };
      }
      const age = getAge(side.age);
      if (age === undefined || !age.unitIds.includes(cmd.unitId)) {
        return { ok: false, reason: 'unitNotAvailable' };
      }
      if (side.queue.length >= ECONOMY.maxQueue) {
        return { ok: false, reason: 'queueFull' };
      }
      if (side.gold < unit.def.cost) {
        return { ok: false, reason: 'notEnoughGold', missingGold: unit.def.cost - side.gold };
      }
      return { ok: true };
    }
    case 'ageUp': {
      // Sıra: maxAge → notEnoughXp → notEnoughGold (PRD Ç-02, E-08).
      const next = getAge(side.age + 1);
      if (next === undefined) return { ok: false, reason: 'maxAge' };
      if (side.xp < next.xpThreshold) return { ok: false, reason: 'notEnoughXp', xp: side.xp, xpRequired: next.xpThreshold };
      if (side.gold < next.ageUpCost) return { ok: false, reason: 'notEnoughGold', missingGold: next.ageUpCost - side.gold };
      return { ok: true };
    }
    case 'unlockSlot': {
      // Sıra: noSuchSlot → slotAlreadyUnlocked → previousSlotLocked → notEnoughGold (PRD D-01).
      if (!isSlotIndex(cmd.slot, side.slots.length)) return { ok: false, reason: 'noSuchSlot' };
      if (side.slots[cmd.slot]!.unlocked) return { ok: false, reason: 'slotAlreadyUnlocked' };
      if (cmd.slot > 0 && !side.slots[cmd.slot - 1]!.unlocked) return { ok: false, reason: 'previousSlotLocked' };
      const cost = DEFENSE.slotUnlockCosts[cmd.slot] ?? 0;
      if (side.gold < cost) return { ok: false, reason: 'notEnoughGold', missingGold: cost - side.gold };
      return { ok: true };
    }
    case 'buildTower': {
      // Sıra: noSuchSlot → unknownTower → towerNotAvailable → slotLocked → slotOccupied → notEnoughGold.
      if (!isSlotIndex(cmd.slot, side.slots.length)) return { ok: false, reason: 'noSuchSlot' };
      const tower = getTower(cmd.towerId);
      if (tower === undefined) return { ok: false, reason: 'unknownTower' };
      const age = getAge(side.age);
      if (age === undefined || !age.towerIds.includes(cmd.towerId)) return { ok: false, reason: 'towerNotAvailable' };
      const slot = side.slots[cmd.slot]!;
      if (!slot.unlocked) return { ok: false, reason: 'slotLocked' };
      if (slot.tower !== null) return { ok: false, reason: 'slotOccupied' };
      if (side.gold < tower.def.cost) return { ok: false, reason: 'notEnoughGold', missingGold: tower.def.cost - side.gold };
      return { ok: true };
    }
    case 'sellTower': {
      if (!isSlotIndex(cmd.slot, side.slots.length)) return { ok: false, reason: 'noSuchSlot' };
      if (side.slots[cmd.slot]!.tower === null) return { ok: false, reason: 'slotEmpty' };
      return { ok: true };
    }
    case 'castAbility': {
      // Sıra: invalidCommand → matchOver (yukarıda) → abilityCooldown (PRD Y-04, Y-07).
      if (side.abilityCooldown > 0) return { ok: false, reason: 'abilityCooldown', cooldownTicks: side.abilityCooldown };
      return { ok: true };
    }
    case 'cancelOrder': {
      if (!Number.isInteger(cmd.index) || cmd.index < 0 || cmd.index >= side.queue.length) {
        return { ok: false, reason: 'noSuchOrder' };
      }
      if (cmd.index === 0) {
        return { ok: false, reason: 'orderInProduction' };
      }
      return { ok: true };
    }
  }
}
