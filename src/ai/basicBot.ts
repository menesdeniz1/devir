import { BASIC_BOT } from '../data/ai';
import { primaryUnitOfAge, secToTicks } from '../sim/compile';
import type { Command, JsonValue } from '../sim/types';
import type { Controller } from './controller';
import type { Observation } from './observation';

interface BasicBotMemory {
  nextDecisionTick: number;
}

function readMemory(memory: JsonValue): BasicBotMemory {
  if (memory !== null && typeof memory === 'object' && !Array.isArray(memory)) {
    const next = memory['nextDecisionTick'];
    if (typeof next === 'number') return { nextDecisionTick: next };
  }
  return { nextDecisionTick: 0 };
}

/**
 * Aşama 1 basit rakip botu (GDD §9 öncesi). Karar aralığında, kuyruk hedef uzunluğun altındayken ve
 * altın yettiğinde güncel çağın kadrosundaki ilk birliği sipariş eder. Yalnızca gözlemi kullanır.
 */
export function createBasicBot(): Controller {
  return {
    id: 'basic-bot',
    wantsDecision(memory: JsonValue, tick: number) {
      return tick >= readMemory(memory).nextDecisionTick;
    },
    decide(obs: Observation, memory: JsonValue, tick: number) {
      const mem = readMemory(memory);
      const commands: Command[] = [];
      if (tick < mem.nextDecisionTick) {
        return { commands, memory: { nextDecisionTick: mem.nextDecisionTick } };
      }
      const unit = primaryUnitOfAge(obs.self.age);
      if (unit !== undefined) {
        let gold = obs.self.gold;
        let queued = obs.self.queue.length;
        while (queued < BASIC_BOT.targetQueueLength && gold >= unit.def.cost) {
          commands.push({ type: 'queueUnit', side: obs.side, unitId: unit.def.id });
          gold -= unit.def.cost;
          queued += 1;
        }
      }
      return { commands, memory: { nextDecisionTick: tick + secToTicks(BASIC_BOT.decisionIntervalSec) } };
    },
  };
}
