import { AGES } from '../data/ages';
import type { AgeDef, UnitDef } from '../data/types';
import { UNITS } from '../data/units';
import { WORLD } from '../data/world';

/** Kayan nokta karşılaştırmaları için ortak tolerans (denge değeri değildir). */
export const EPS = 1e-6;

/**
 * Saniyeyi tamsayı tick'e çevirir; en az 1 tick (TDD §3).
 * Yukarı yuvarlar: aşağı yuvarlama saldırı aralığını kısaltıp K-02'yi bozabilir.
 * Küçük çıkarma, 0,1 × 20 gibi kayan nokta artıklarının fazladan tick doğurmasını önler.
 */
export function secToTicks(seconds: number): number {
  return Math.max(1, Math.ceil(seconds * WORLD.tickRate - 1e-9));
}

/** Veri tanımının tick cinsinden hazırlanmış hâli. Salt okunurdur; duruma asla girmez. */
export interface CompiledUnit {
  readonly def: UnitDef;
  readonly buildTicks: number;
  readonly attackIntervalTicks: number;
  readonly speedPerTick: number;
}

function compileUnit(def: UnitDef): CompiledUnit {
  return {
    def,
    buildTicks: secToTicks(def.buildTimeSec),
    attackIntervalTicks: secToTicks(def.attackIntervalSec),
    speedPerTick: def.speed / WORLD.tickRate,
  };
}

const UNIT_LOOKUP: ReadonlyMap<string, CompiledUnit> = new Map(UNITS.map((def) => [def.id, compileUnit(def)]));

export function getUnit(id: string): CompiledUnit | undefined {
  return UNIT_LOOKUP.get(id);
}

/** Durumda geçen tür kimliği veride yoksa hata verir (bozuk kayıt). */
export function mustGetUnit(id: string): CompiledUnit {
  const unit = UNIT_LOOKUP.get(id);
  if (unit === undefined) {
    throw new Error(`Bilinmeyen birlik türü: ${id}`);
  }
  return unit;
}

export function getAge(age: number): AgeDef | undefined {
  const def = AGES[age - 1];
  return def !== undefined && def.age === age ? def : undefined;
}

export function mustGetAge(age: number): AgeDef {
  const def = getAge(age);
  if (def === undefined) {
    throw new Error(`Bilinmeyen çağ: ${age}`);
  }
  return def;
}

/** Çağın kadrosundaki ilk birlik; yoksa undefined. Aşama 1 botları tek birlik türüyle oynar. */
export function primaryUnitOfAge(age: number): CompiledUnit | undefined {
  const ageDef = getAge(age);
  if (ageDef === undefined) return undefined;
  for (const id of ageDef.unitIds) {
    const unit = getUnit(id);
    if (unit !== undefined) return unit;
  }
  return undefined;
}
