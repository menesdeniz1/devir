import { BASIC_BOT } from '../data/ai';
import { DEFENSE } from '../data/towers';
import type { TowerKind } from '../data/types';
import { getAge, getTower, mustGetUnit, secToTicks, unitOfRole } from '../sim/compile';
import { WORLD } from '../data/world';
import { planAgeUp } from './ageUpPlan';
import type { Command, JsonValue } from '../sim/types';
import type { Controller } from './controller';
import { towerOfKind } from './towerPlan';
import type { Observation } from './observation';

interface BasicBotMemory {
  nextDecisionTick: number;
  /** BASIC_BOT.composition içindeki bir sonraki sıra (sınırsız artar; kullanırken uzunluğa göre mod alınır). */
  sequenceIndex: number;
  /** Çağ ücreti için altın biriktiriyor (her tick karar verir; yetince çağ atlar). */
  saving: boolean;
}

function readMemory(memory: JsonValue): BasicBotMemory {
  const result: BasicBotMemory = { nextDecisionTick: 0, sequenceIndex: 0, saving: false };
  if (memory !== null && typeof memory === 'object' && !Array.isArray(memory)) {
    const next = memory['nextDecisionTick'];
    if (typeof next === 'number') result.nextDecisionTick = next;
    const index = memory['sequenceIndex'];
    if (typeof index === 'number' && Number.isInteger(index) && index >= 0) result.sequenceIndex = index;
    result.saving = memory['saving'] === true;
  }
  return result;
}

/** Sıradaki kule türleri: ilk kurulan hızlı, sonraki ağır (yuva sırasına göre tekrarlanır). */
const TOWER_KIND_ORDER: readonly TowerKind[] = ['fast', 'heavy'];

/** Üs ön yüzüne bakan kenar mesafesi eşikten yakın bir düşman birliği var mı? */
function threatened(obs: Observation): boolean {
  const face = obs.side === 0 ? WORLD.baseWidth : WORLD.worldWidth - WORLD.baseWidth;
  return obs.units.some((u) => {
    if (u.side === obs.side) return false;
    const half = mustGetUnit(u.type).def.width / 2;
    const edge = obs.side === 0 ? u.x - half : u.x + half;
    const gap = obs.side === 0 ? edge - face : face - edge;
    return gap <= BASIC_BOT.tower.threatDistance;
  });
}

/**
 * Tehdit varken ilk boş yuvaya (en çok BASIC_BOT.tower.maxSlots yuva) güncel çağın kulesini kurar; yuva kilitliyse
 * (önceki açıkken) önce açar. Karar başına en çok bir kule. Altın yetmezse hiçbir şey yapmaz (yuva-açma tek başına yapılmaz).
 */
function planBasicTowers(obs: Observation): { commands: Command[]; spent: number } {
  const none = { commands: [] as Command[], spent: 0 };
  if (!threatened(obs)) return none;
  const ageDef = getAge(obs.self.age);
  if (ageDef === undefined) return none;
  const limit = Math.min(BASIC_BOT.tower.maxSlots, obs.self.slots.length);
  for (let i = 0; i < limit; i++) {
    const slot = obs.self.slots[i]!;
    if (slot.tower !== null) continue;
    const towerId = towerOfKind(ageDef.towerIds, TOWER_KIND_ORDER[i % TOWER_KIND_ORDER.length]!);
    const tower = towerId === undefined ? undefined : getTower(towerId);
    if (tower === undefined) return none;
    const unlockCost = slot.unlocked ? 0 : (DEFENSE.slotUnlockCosts[i] ?? 0);
    if (obs.self.gold < unlockCost + tower.def.cost) return none;
    const commands: Command[] = [];
    if (!slot.unlocked) commands.push({ type: 'unlockSlot', side: obs.side, slot: i });
    commands.push({ type: 'buildTower', side: obs.side, slot: i, towerId: tower.def.id });
    return { commands, spent: unlockCost + tower.def.cost };
  }
  return none;
}

/**
 * Çağ: deneyim sonraki eşiği geçince üretimi durdurup çağ ücretini biriktirir, yetince `ageUp` verir.
 * Basit rakip botu (GDD §9 öncesi). Karar aralığında, kuyruk hedef uzunluğun altındayken `BASIC_BOT.composition`
 * sırasını döngüsel izler: sıradaki rolün güncel çağdaki birliğini sipariş eder. Altın yetmezse sırayı atlamadan
 * bekler. Yalnızca gözlemi kullanır; sıra indeksi bellektedir.
 */
export function createBasicBot(): Controller {
  return {
    id: 'basic-bot',
    wantsDecision(memory: JsonValue, tick: number) {
      const mem = readMemory(memory);
      return mem.saving || tick >= mem.nextDecisionTick;
    },
    decide(obs: Observation, memory: JsonValue, tick: number) {
      const mem = readMemory(memory);
      const commands: Command[] = [];
      // Çağ eşiği geçildiyse üretim durur; altın yetince çağ atlanır (sonraki tick yeni çağın birlikleriyle sürer).
      const plan = planAgeUp(obs.self);
      if (plan === 'ageUp') {
        commands.push({ type: 'ageUp', side: obs.side });
        return { commands, memory: { nextDecisionTick: tick + 1, sequenceIndex: mem.sequenceIndex, saving: false } };
      }
      if (plan === 'save') {
        return { commands, memory: { nextDecisionTick: mem.nextDecisionTick, sequenceIndex: mem.sequenceIndex, saving: true } };
      }
      if (tick < mem.nextDecisionTick) {
        return { commands, memory: { nextDecisionTick: mem.nextDecisionTick, sequenceIndex: mem.sequenceIndex, saving: false } };
      }
      // Kule: eşikteki tehdit varken boş yuvaya güncel çağın kulesi (çağ biriktirme öncelikli: yukarıda döndü).
      const towers = planBasicTowers(obs);
      commands.push(...towers.commands);
      const sequence = BASIC_BOT.composition;
      let index = mem.sequenceIndex;
      let gold = obs.self.gold - towers.spent;
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
      return { commands, memory: { nextDecisionTick: tick + secToTicks(BASIC_BOT.decisionIntervalSec), sequenceIndex: index, saving: false } };
    },
  };
}
