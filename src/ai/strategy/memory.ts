import type { AiStance } from '../../data/types';
import type { JsonValue, SideId } from '../../sim/types';
import { mixSeed, rngFromSeed, type RngState } from '../../sim/rng';

/**
 * Yapay zekâ belleği (düz JSON; state.ai[side] içinde kayda girer). Alanlar sayı ve kısa metindir; JSON
 * gidiş-dönüşünde birebir korunur. Bellek boşken (ilk karar) yalnızca (config.seed, taraf) çiftinden kurulur (TDD §5).
 */
export interface AiMemory {
  /** sfc32 üreteç durumu (dört 32 bit tamsayı). */
  rng: RngState;
  /** Bir sonraki karar tick'i. */
  next: number;
  /** Çağ koşullarının ilk sağlandığı tick; −1: henüz sağlanmadı. */
  ageReadyTick: number;
  /** Bu çağ geçişi için çekilmiş gecikme (tick). */
  ageDelay: number;
  /** Üs canı eğilimi: pencere başındaki can oranı ve tick'i, son tamamlanan pencerede kaybedilen oran. */
  hpMark: number;
  hpMarkTick: number;
  hpLoss: number;
  /** Yetenek: bekleme bitince kullanılabilecek en erken tick (tepki gecikmesi); −1: henüz çekilmedi. */
  abilityWait: number;
  /** Seçilen açılış dizisinin indeksi (AI_TUNING.openings); −1: henüz seçilmedi. */
  opening: number;
  /** Üretim dizisindeki sıra (sınırsız artar; kullanırken dizi uzunluğuna göre mod alınır). */
  seq: number;
  /** Ordu duruşu: son başarılı karşılık değerlendirmesinin sonucu (GDD §9 "doğru karşılık seçme"). */
  stance: AiStance;
}

const STANCES: readonly AiStance[] = ['opening', 'antiFront', 'antiSwarm', 'antiRanged', 'antiHeavy', 'antiTower'];

/** Rastgele üreteç tuzu: rastgele botla aynı tohumu paylaşmasın diye ayrı tuz (taraf + bu değer). */
const RNG_SALT = 0x5a17;

export function initialMemory(configSeed: number, side: SideId): AiMemory {
  return { rng: rngFromSeed(mixSeed(configSeed, RNG_SALT + side)), next: 0, ageReadyTick: -1, ageDelay: 0, hpMark: 1, hpMarkTick: 0, hpLoss: 0, abilityWait: -1, opening: -1, seq: 0, stance: 'opening' };
}

function num(obj: { [key: string]: JsonValue }, key: string, fallback: number): number {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Bellekten okur; boş ya da bozuksa başlangıç belleğini kurar. Girdiyi değiştirmez (kopya döndürür). */
export function readMemory(memory: JsonValue, configSeed: number, side: SideId): AiMemory {
  const init = initialMemory(configSeed, side);
  if (memory === null || typeof memory !== 'object' || Array.isArray(memory)) return init;
  const rng = memory['rng'];
  if (!Array.isArray(rng) || rng.length !== 4 || !rng.every((v) => typeof v === 'number')) return init;
  return {
    rng: (rng as number[]).slice(),
    next: num(memory, 'next', init.next),
    ageReadyTick: num(memory, 'ageReadyTick', init.ageReadyTick),
    ageDelay: num(memory, 'ageDelay', init.ageDelay),
    hpMark: num(memory, 'hpMark', init.hpMark),
    hpMarkTick: num(memory, 'hpMarkTick', init.hpMarkTick),
    hpLoss: num(memory, 'hpLoss', init.hpLoss),
    abilityWait: num(memory, 'abilityWait', init.abilityWait),
    opening: num(memory, 'opening', init.opening),
    seq: num(memory, 'seq', init.seq),
    stance: STANCES.find((x) => x === memory['stance']) ?? init.stance,
  };
}

export function writeMemory(mem: AiMemory): JsonValue {
  return {
    rng: mem.rng.slice(),
    next: mem.next,
    ageReadyTick: mem.ageReadyTick,
    ageDelay: mem.ageDelay,
    hpMark: mem.hpMark,
    hpMarkTick: mem.hpMarkTick,
    hpLoss: mem.hpLoss,
    abilityWait: mem.abilityWait,
    opening: mem.opening,
    seq: mem.seq,
    stance: mem.stance,
  };
}
