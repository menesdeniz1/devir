import { ECONOMY } from '../data/world';
import { getAge, getUnit } from './compile';
import type { Command, GameState, SideId, Validation } from './types';

export function isSideId(value: unknown): value is SideId {
  return value === 0 || value === 1;
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
