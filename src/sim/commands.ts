import { mustGetUnit } from './compile';
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
