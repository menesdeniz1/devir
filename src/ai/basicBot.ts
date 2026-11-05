import { BASIC_BOT } from '../data/ai';
import { secToTicks, unitOfRole } from '../sim/compile';
import type { Command, JsonValue } from '../sim/types';
import type { Controller } from './controller';
import type { Observation } from './observation';

interface BasicBotMemory {
  nextDecisionTick: number;
  /** BASIC_BOT.composition içindeki bir sonraki sıra (sınırsız artar; kullanırken uzunluğa göre mod alınır). */
  sequenceIndex: number;
}

function readMemory(memory: JsonValue): BasicBotMemory {
  const result: BasicBotMemory = { nextDecisionTick: 0, sequenceIndex: 0 };
  if (memory !== null && typeof memory === 'object' && !Array.isArray(memory)) {
    const next = memory['nextDecisionTick'];
    if (typeof next === 'number') result.nextDecisionTick = next;
    const index = memory['sequenceIndex'];
    if (typeof index === 'number' && Number.isInteger(index) && index >= 0) result.sequenceIndex = index;
  }
  return result;
}

/**
 * Basit rakip botu (GDD §9 öncesi). Karar aralığında, kuyruk hedef uzunluğun altındayken `BASIC_BOT.composition`
 * sırasını döngüsel izler: sıradaki rolün güncel çağdaki birliğini sipariş eder. Altın yetmezse sırayı atlamadan
 * bekler. Yalnızca gözlemi kullanır; sıra indeksi bellektedir.
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
        return { commands, memory: { nextDecisionTick: mem.nextDecisionTick, sequenceIndex: mem.sequenceIndex } };
      }
      const sequence = BASIC_BOT.composition;
      let index = mem.sequenceIndex;
      let gold = obs.self.gold;
      let queued = obs.self.queue.length;
      while (sequence.length > 0 && queued < BASIC_BOT.targetQueueLength) {
        const role = sequence[index % sequence.length]!;
        const unit = unitOfRole(obs.self.age, role);
        // Çağda bu rol yoksa sıra ilerler (sonsuz döngüyü önlemek için tek tur sınırı).
        if (unit === undefined) {
          index += 1;
          if (index - mem.sequenceIndex >= sequence.length) break;
          continue;
        }
        if (gold < unit.def.cost) break;
        commands.push({ type: 'queueUnit', side: obs.side, unitId: unit.def.id });
        gold -= unit.def.cost;
        queued += 1;
        index += 1;
      }
      return { commands, memory: { nextDecisionTick: tick + secToTicks(BASIC_BOT.decisionIntervalSec), sequenceIndex: index } };
    },
  };
}
