/**
 * Test ve CLI araçları için botlar. Oynanış içeriği değildir; sayılar denge değil, test yoğunluğu ayarıdır.
 */
import { DEFENSE } from '../data/towers';
import { ECONOMY } from '../data/world';
import type { Role, TowerKind } from '../data/types';
import { getAge, getTower, sellRefund, unitOfRole } from '../sim/compile';
import { battlefieldBounds } from '../sim/geometry';
import { planAgeUp } from './ageUpPlan';
import { mixSeed, rngFromSeed, rngInt, rngNext, type RngState } from '../sim/rng';
import type { Command, JsonValue, SideId } from '../sim/types';
import type { Controller } from './controller';
import type { Observation } from './observation';
import { towerOfKind } from './towerPlan';

/** Rastgele botun her tick'te bir şey yapma olasılığı. */
const RANDOM_ACT_CHANCE = 0.04;
/** Eylem seçiminde sipariş olasılığı; kalanı çağ atlama veya iptal denemesi. */
const RANDOM_QUEUE_SHARE = 0.7;
/** Sipariş dışı eylemlerde çağ atlama payı (yalnız komut geçerliyken verilir). */
const RANDOM_AGE_UP_SHARE = 0.5;
/** Siparişlerde geçersiz/kullanılamaz kimlik deneme olasılığı (ret yollarını sınamak için). */
const RANDOM_BAD_ID_CHANCE = 0.1;
/** Rastgele botun her tick'te kule komutu deneme olasılığı (yuva açma, kurma, satma; ret yollarını da dener). */
const RANDOM_TOWER_CHANCE = 0.02;
/** Kule komutlarında eylem payları: açma, kurma; kalanı satma. */
const RANDOM_UNLOCK_SHARE = 0.25;
const RANDOM_BUILD_SHARE = 0.5;
/** Kurma denemesinde güncel çağın dışından (başka çağın ya da bilinmeyen) kimlik seçme olasılığı. */
const RANDOM_BAD_TOWER_CHANCE = 0.2;
const BAD_TOWER_IDS: readonly string[] = ['no_such_tower', 'future_tower_fast', 'primitive_tower_heavy'];
const BAD_UNIT_ID = 'no_such_unit';
/** Rastgele botun bekleme bittiyken her tick'te yetenek kullanma olasılığı (yeteneği sık sınamak için; denge değil). */
const RANDOM_ABILITY_CHANCE = 0.03;
/** Bekleme sürerken yetenek deneme olasılığı (abilityCooldown ret yolunu sınar). */
const RANDOM_ABILITY_EARLY_CHANCE = 0.004;

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
        } else if (rngNext(rng) < RANDOM_AGE_UP_SHARE) {
          // Rastgele zamanda çağ atlar, ama yalnız geçerliyse (ücret ve eşik karşılanmışsa).
          if (planAgeUp(obs.self) === 'ageUp') commands.push({ type: 'ageUp', side: obs.side });
        } else {
          // Geçerli aralığın bir ötesi dahil: ret yollarını da dener.
          commands.push({ type: 'cancelOrder', side: obs.side, index: rngInt(rng, obs.self.queue.length + 1) });
        }
      }
      if (rngNext(rng) < RANDOM_TOWER_CHANCE) commands.push(randomTowerCommand(rng, obs));
      // Yetenek: bekleme bittiyse rastgele bir noktaya (savaş alanı içinde); bekleme sürerken seyrek deneme (ret yolu).
      const abilityChance = obs.self.abilityCooldown === 0 ? RANDOM_ABILITY_CHANCE : RANDOM_ABILITY_EARLY_CHANCE;
      if (rngNext(rng) < abilityChance) {
        const field = battlefieldBounds();
        commands.push({ type: 'castAbility', side: obs.side, x: field.x0 + rngNext(rng) * (field.x1 - field.x0) });
      }
      const next: RandomMemory = { rng };
      return { commands, memory: next as unknown as JsonValue };
    },
  };
}

/** Rastgele kule komutu: yuva indeksi geçerli aralığın bir ötesini de dener; kimlik bazen kullanılamaz ya da bilinmez. */
function randomTowerCommand(rng: RngState, obs: Observation): Command {
  const slot = rngInt(rng, obs.self.slots.length + 1);
  const roll = rngNext(rng);
  if (roll < RANDOM_UNLOCK_SHARE) return { type: 'unlockSlot', side: obs.side, slot };
  if (roll < RANDOM_UNLOCK_SHARE + RANDOM_BUILD_SHARE) {
    const ids = getAge(obs.self.age)?.towerIds ?? [];
    const bad = ids.length === 0 || rngNext(rng) < RANDOM_BAD_TOWER_CHANCE;
    const pool = bad ? BAD_TOWER_IDS : ids;
    return { type: 'buildTower', side: obs.side, slot, towerId: pool[rngInt(rng, pool.length)]! };
  }
  return { type: 'sellTower', side: obs.side, slot };
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
      const plan = planAgeUp(obs.self);
      if (plan === 'ageUp') return { commands: [{ type: 'ageUp', side: obs.side }], memory: null };
      if (plan === 'save' || obs.self.queue.length > 0) return { commands, memory: null };
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
      const plan = planAgeUp(obs.self);
      if (plan === 'ageUp') return { commands: [{ type: 'ageUp', side: obs.side }], memory: null };
      const unit = unitOfRole(obs.self.age, role);
      if (unit !== undefined && plan === 'none') {
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

/** Savunmacı botun birlik üretmeden önce elinde tuttuğu altın rezervi (test yoğunluğu ayarı; denge değil). */
export const DEFENDER_GOLD_RESERVE = 300;
/** Savunmacı botun kuyrukta tuttuğu en çok sipariş (gecikmeli, küçük saldırı). */
const DEFENDER_TARGET_QUEUE = 1;
/** Savunmacı botun birlik sırası (üretilen toplam sayıya göre döngüsel; test ayarı). */
const DEFENDER_ROLES: readonly Role[] = ['front', 'ranged', 'front', 'heavy'];
/** Yuva sırasına göre kule türü (çift yuva hızlı, tek yuva ağır). */
const DEFENDER_TOWER_KINDS: readonly TowerKind[] = ['fast', 'heavy'];

/**
 * "Savunmacı" bot (GDD §10 "Yalnız savunma yok"): önce yuvaları açıp güncel çağın kuleleriyle doldurur; çağ atlayınca
 * eski çağın kulelerini satıp yenisini kurar; çağ atlar. Birlik yalnızca üç yuva da güncel çağ kulesiyle doluyken ve
 * altın rezervin üstündeyken üretilir. Çağ biriktirirken (save) hiçbir şey harcamaz. Belleği yoktur.
 */
export function createDefenderBot(): Controller {
  return {
    id: 'defender',
    decide(obs: Observation) {
      const commands: Command[] = [];
      const plan = planAgeUp(obs.self);
      if (plan === 'ageUp') return { commands: [{ type: 'ageUp', side: obs.side }], memory: null };
      if (plan === 'save') return { commands, memory: null };
      const ageDef = getAge(obs.self.age);
      if (ageDef === undefined) return { commands, memory: null };
      let gold = obs.self.gold;
      let allCurrent = true;
      for (let i = 0; i < obs.self.slots.length; i++) {
        const slot = obs.self.slots[i]!;
        if (slot.tower !== null && ageDef.towerIds.includes(slot.tower.type)) continue;
        // Eski çağın kulesi satılırsa iadesi sayılır; yenisi karşılanamıyorsa satış da yapılmaz.
        const refund = slot.tower === null ? 0 : sellRefund(slot.tower.paid);
        const towerId = towerOfKind(ageDef.towerIds, DEFENDER_TOWER_KINDS[i % DEFENDER_TOWER_KINDS.length]!);
        const tower = towerId === undefined ? undefined : getTower(towerId);
        const unlockCost = slot.unlocked ? 0 : (DEFENSE.slotUnlockCosts[i] ?? 0);
        if (tower === undefined || gold + refund < unlockCost + tower.def.cost) {
          allCurrent = false;
          break;
        }
        if (slot.tower !== null) commands.push({ type: 'sellTower', side: obs.side, slot: i });
        if (!slot.unlocked) commands.push({ type: 'unlockSlot', side: obs.side, slot: i });
        commands.push({ type: 'buildTower', side: obs.side, slot: i, towerId: tower.def.id });
        gold += refund - unlockCost - tower.def.cost;
      }
      // Birlik yalnız yuvalar bu karardan ÖNCE zaten güncel kulelerle doluyken üretilir (bu kararda kule komutu yoksa).
      if (allCurrent && commands.length === 0 && obs.self.queue.length < DEFENDER_TARGET_QUEUE) {
        const produced = Object.values(obs.self.stats.produced).reduce((a, b) => a + b, 0);
        const unit = unitOfRole(obs.self.age, DEFENDER_ROLES[produced % DEFENDER_ROLES.length]!);
        if (unit !== undefined && gold >= DEFENDER_GOLD_RESERVE + unit.def.cost) {
          commands.push({ type: 'queueUnit', side: obs.side, unitId: unit.def.id });
        }
      }
      return { commands, memory: null };
    },
  };
}
