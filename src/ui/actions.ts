import { PLAYER_SIDE } from '../game/constants';
import type { Check, Session } from '../game/session';
import { getAge } from '../sim/compile';
import type { Command } from '../sim/types';

/** Oyuncunun şu anki çağında sipariş verilebilen birlik kimlikleri (sıra = düğme/kısayol sırası). */
export function availableUnitIds(session: Session): readonly string[] {
  return getAge(session.state.sides[PLAYER_SIDE].age)?.unitIds ?? [];
}

export function queueCommand(unitId: string): Command {
  return { type: 'queueUnit', side: PLAYER_SIDE, unitId };
}

export function cancelCommand(index: number): Command {
  return { type: 'cancelOrder', side: PLAYER_SIDE, index };
}

/** index'inci birliği sipariş eder (düğme ve kısayol aynı yolu kullanır). */
export function produceUnit(session: Session, index: number): Check | null {
  const unitId = availableUnitIds(session)[index];
  if (unitId === undefined) return null;
  return session.submit(queueCommand(unitId));
}

export function cancelOrderAt(session: Session, index: number): Check {
  return session.submit(cancelCommand(index));
}

/** Son bekleyen (üretimde olmayan) siparişi iptal eder; bekleyen yoksa null. */
export function cancelLastWaiting(session: Session): Check | null {
  const length = session.state.sides[PLAYER_SIDE].queue.length;
  if (length < 2) return null;
  return cancelOrderAt(session, length - 1);
}
