/**
 * Test ve CLI araçları için botlar. Oynanış içeriği değildir; sayılar denge değil, test yoğunluğu ayarıdır.
 */
import { ECONOMY } from '../data/world';
import type { Role } from '../data/types';
import { getAge, unitOfRole } from '../sim/compile';
import { mixSeed, rngFromSeed, rngInt, rngNext, type RngState } from '../sim/rng';
import type { Command, JsonValue, SideId } from '../sim/types';
import type { Controller } from './controller';
import type { Observation } from './observation';

/** Rastgele botun her tick'te bir şey yapma olasılığı. */
const RANDOM_ACT_CHANCE = 0.04;
/** Eylem seçiminde sipariş olasılığı; kalanı iptal denemesi. */
const RANDOM_QUEUE_SHARE = 0.75;
/** Siparişlerde geçersiz/kullanılamaz kimlik deneme olasılığı (ret yollarını sınamak için). */
const RANDOM_BAD_ID_CHANCE = 0.1;
const BAD_UNIT_ID = 'no_such_unit';

interface RandomMemory {
  rng: number[];
}

/** Bellek boşken rng başlangıcı yalnızca (maç tohumu, taraf) çiftinden türetilir. */
function readRng(memory: JsonValue, seed: number, side: SideId): RngState {
  if (memory !== null && typeof memory === 'object' && !Array.isArray(memory)) {
    const rng = memory['rng'];
    if (Array.isArray(rng) && rng.length === 4 && rng.every((v) => typeof v === 'number')) {
      return (rng as number[]).slice();
    }
  }
  return rngFromSeed(mixSeed(seed, side + 1));
}

/**
 * Tohumlu rastgele bot: rastgele zamanlarda rastgele sipariş verir veya iptal dener.
 * Rng durumu belleğin içindedir; kayıt/yükleme sonrası aynı akış sürer. Bellek boşken (ilk karar) başlangıç
 * durumu yalnızca `state.config.seed` ve taraftan türetilir; bu yüzden denetleyici yalnız config'ten
 * `createRandomBot(config.seed, side)` ile yeniden kurulabilir.
 */
export function createRandomBot(configSeed: number, side: SideId): Controller {
  return {
    id: 'random',
    decide(obs: Observation, memory: JsonValue) {
      const rng = readRng(memory, configSeed, side);
      const commands: Command[] = [];
      if (rngNext(rng) < RANDOM_ACT_CHANCE) {
        if (rngNext(rng) < RANDOM_QUEUE_SHARE) {
          const ageDef = getAge(obs.self.age);
          const ids = ageDef === undefined ? [] : ageDef.unitIds;
          const bad = ids.length === 0 || rngNext(rng) < RANDOM_BAD_ID_CHANCE;
          const unitId = bad ? BAD_UNIT_ID : ids[rngInt(rng, ids.length)]!;
          commands.push({ type: 'queueUnit', side: obs.side, unitId });
        } else {
          // Geçerli aralığın bir ötesi dahil: ret yollarını da dener.
          commands.push({ type: 'cancelOrder', side: obs.side, index: rngInt(rng, obs.self.queue.length + 1) });
        }
      }
      const next: RandomMemory = { rng };
      return { commands, memory: next as unknown as JsonValue };
    },
  };
}

/** Yığan botun kuyruğa dizdiği karışım (test yoğunluğu ayarı; denge değil). Uzunluğu kuyruk sınırını aşmaz. */
const STACKER_MIX: readonly Role[] = ['front', 'ranged', 'heavy', 'front', 'ranged'];

/** Tek rol botunun kuyrukta tuttuğu sipariş sayısı (test yoğunluğu ayarı; denge değil). */
const MONO_TARGET_QUEUE = 2;

/**
 * "Yığan" bot: altın karışımın toplam maliyetine ulaşana kadar bekler, sonra kuyruğu boşken karışımla doldurur.
 * Kuyruk dolu, doğma engeli ve toplu çatışma yollarını zorlar.
 */
export function createStackerBot(): Controller {
  return {
    id: 'stacker',
    decide(obs: Observation) {
      const commands: Command[] = [];
      if (obs.self.queue.length > 0) return { commands, memory: null };
      const mix: string[] = [];
      let total = 0;
      for (const role of STACKER_MIX.slice(0, ECONOMY.maxQueue)) {
        const unit = unitOfRole(obs.self.age, role);
        if (unit === undefined) continue;
        mix.push(unit.def.id);
        total += unit.def.cost;
      }
      if (mix.length > 0 && obs.self.gold >= total) {
        for (const unitId of mix) commands.push({ type: 'queueUnit', side: obs.side, unitId });
      }
      return { commands, memory: null };
    },
  };
}

/**
 * "Tek rol" botu: yalnız verilen rolün birliğini üretir (GDD §10, PRD B-07 ölçümü). Kuyruk hedef uzunluğun
 * altındayken ve altın yettiğinde sipariş verir.
 */
export function createMonoBot(role: Role): Controller {
  return {
    id: `mono-${role}`,
    decide(obs: Observation) {
      const commands: Command[] = [];
      const unit = unitOfRole(obs.self.age, role);
      if (unit !== undefined) {
        let gold = obs.self.gold;
        let queued = obs.self.queue.length;
        while (queued < MONO_TARGET_QUEUE && gold >= unit.def.cost) {
          commands.push({ type: 'queueUnit', side: obs.side, unitId: unit.def.id });
          gold -= unit.def.cost;
          queued += 1;
        }
      }
      return { commands, memory: null };
    },
  };
}
