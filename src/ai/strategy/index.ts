import { AI_PROFILES, AI_TUNING } from '../../data/ai';
import type { AiDifficulty, AiProfileDef, Role } from '../../data/types';
import { secToTicks } from '../../sim/compile';
import { rngInt, rngNext, type RngState } from '../../sim/rng';
import type { Command, JsonValue, SideId } from '../../sim/types';
import type { Controller } from '../controller';
import type { Observation } from '../observation';
import { planAbility } from './ability';
import { planAge } from './agePlan';
import { planArmy, updateStance } from './army';
import { planDefense } from './defense';
import { readMemory, writeMemory } from './memory';
import { wantsPush } from './stone';
import { assessThreat } from './threat';

export interface AiBotOptions {
  /** Yalnız bu rolü üretir; diğer kararlar profilinki (GDD §10 tek rol ölçümü). */
  roleLock?: Role;
  /** Profilin yerine kullanılacak profil (denge denemeleri için). */
  profile?: AiProfileDef;
  /** Duruştan bağımsız sabit üretim dizisi (denge ölçümü: sabit bileşimli bot; diğer kararlar profilinki). */
  pattern?: readonly Role[];
}

/**
 * Bilgisayar rakibi (GDD §9). Yalnızca gözlemi kullanır (PRD R-03, K-13); oyuncuyla aynı komutları üretir.
 * Her karar anında sırayla: tehdit → çağ → savunma → ordu → yetenek; Sınır Taşı ağırlığı ordu
 * hedefini değiştirir. Bellek düz JSON'dur; rastgelelik bellekteki üreteçten gelir ve ilk değeri yalnızca
 * (config.seed, taraf) çiftinden türer, böylece denetleyici kayıttan `createAiBot(zorluk, config.seed, taraf)` ile
 * yeniden kurulabilir.
 */
export function createAiBot(difficulty: AiDifficulty, configSeed: number, side: SideId, options: AiBotOptions = {}): Controller {
  const profile = options.profile ?? AI_PROFILES[difficulty];
  const roleLock = options.roleLock ?? null;
  const pattern = options.pattern ?? null;
  const interval = secToTicks(profile.decisionIntervalSec);
  return {
    id: roleLock !== null ? `${difficulty}-${roleLock}` : pattern !== null ? `${difficulty}-${pattern.join('-')}` : difficulty,
    wantsDecision(memory: JsonValue, tick: number) {
      return tick >= readNext(memory);
    },
    decide(obs: Observation, memory: JsonValue, tick: number) {
      const mem = readMemory(memory, configSeed, side);
      if (memory === null) {
        // İlk karar rastgele bir tick'e kayar (aynı tohumlu yapay zekâlar aynı anda karar vermesin).
        mem.next = tick + rngInt(mem.rng, interval);
      }
      if (tick < mem.next) return { commands: [], memory: writeMemory(mem) };
      mem.next = tick + jittered(interval, mem.rng);
      const commands: Command[] = [];
      const threat = assessThreat(obs, mem);
      const age = planAge(obs, mem, profile, threat);
      if (age.ageUp) {
        commands.push({ type: 'ageUp', side: obs.side });
        return { commands, memory: writeMemory(mem) };
      }
      const available = Math.max(0, obs.self.gold - age.reserve);
      const defense = planDefense(obs, threat, profile, available);
      commands.push(...defense.commands);
      const push = wantsPush(obs, threat, profile);
      mem.stance = updateStance(mem.stance, threat, profile, mem.rng);
      commands.push(...planArmy(obs, mem, profile, available - defense.spent, push, roleLock, pattern));
      commands.push(...planAbility(obs, mem, threat, profile));
      return { commands, memory: writeMemory(mem) };
    },
  };
}

/**
 * Yalnız yetenek kullanan denetleyici (karşılık senaryoları için; GDD §3 döngüsünün yetenekli ölçümü). Birlik,
 * kule ve çağ kararı vermez; yetenek modülünü verilen zorluğun profiliyle her karar aralığında çalıştırır.
 */
export function createAbilityOnlyBot(difficulty: AiDifficulty, configSeed: number, side: SideId): Controller {
  const profile = AI_PROFILES[difficulty];
  const interval = secToTicks(profile.decisionIntervalSec);
  return {
    id: `${difficulty}-ability`,
    wantsDecision(memory: JsonValue, tick: number) {
      return tick >= readNext(memory);
    },
    decide(obs: Observation, memory: JsonValue, tick: number) {
      const mem = readMemory(memory, configSeed, side);
      if (tick < mem.next) return { commands: [], memory: writeMemory(mem) };
      mem.next = tick + interval;
      const threat = assessThreat(obs, mem);
      return { commands: planAbility(obs, mem, threat, profile), memory: writeMemory(mem) };
    },
  };
}

/** Karar aralığı ±AI_TUNING.decisionJitter oranında rastgele (en az 1 tick). */
function jittered(interval: number, rng: RngState): number {
  return Math.max(1, Math.round(interval * (1 + AI_TUNING.decisionJitter * (2 * rngNext(rng) - 1))));
}

function readNext(memory: JsonValue): number {
  if (memory !== null && typeof memory === 'object' && !Array.isArray(memory)) {
    const next = memory['next'];
    if (typeof next === 'number') return next;
  }
  return 0;
}
