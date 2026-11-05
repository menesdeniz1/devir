import { AGES } from '../data/ages';
import { COMBAT } from '../data/combat';
import type { AgeDef, Role, TargetClass, UnitDef } from '../data/types';
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

/** Çarpanlı hasarı tamsayıya çevirir; en az 1 (ilerleme garantisi). Yarım değerler yukarı yuvarlanır. */
export function roundDamage(value: number): number {
  return Math.max(1, Math.round(value + EPS));
}

/** Hedef sınıfları: üç rol ve üs (hasar tablosunun sütunları). */
export const TARGET_CLASSES: readonly TargetClass[] = ['front', 'ranged', 'heavy', 'base'];
/** Birlik hedef sınıfları (üs hariç): alan hasarı yalnız bunlara uygulanır. */
export const UNIT_CLASSES: readonly Role[] = ['front', 'ranged', 'heavy'];

/** Veri tanımının tick cinsinden hazırlanmış hâli. Salt okunurdur; duruma asla girmez. */
export interface CompiledUnit {
  readonly def: UnitDef;
  readonly role: Role;
  readonly buildTicks: number;
  readonly attackIntervalTicks: number;
  readonly speedPerTick: number;
  /** Hedef sınıfına göre tamsayı hasar tablosu (rol çarpanı uygulanmış; çalışma anında çarpan hesaplanmaz). */
  readonly damageVs: Readonly<Record<TargetClass, number>>;
  /** Alan hasarının ikincil hedeflere verdiği tamsayı hasar (hedef sınıfına göre); alan hasarı yoksa null. */
  readonly splashDamageVs: Readonly<Record<Role, number>> | null;
  /** Mermi adımı (birim/tick); null ise saldırı anlıktır (yakın dövüş). */
  readonly projectileStep: number | null;
}

function compileUnit(def: UnitDef): CompiledUnit {
  const multipliers = COMBAT.roleMultipliers[def.role];
  const damageVs = {} as Record<TargetClass, number>;
  for (const cls of TARGET_CLASSES) damageVs[cls] = roundDamage(def.damage * (def.multiplierOverrides?.[cls] ?? multipliers[cls]));
  let splashDamageVs: Record<Role, number> | null = null;
  if (def.splash !== undefined) {
    splashDamageVs = {} as Record<Role, number>;
    for (const cls of UNIT_CLASSES) splashDamageVs[cls] = roundDamage(damageVs[cls] * def.splash.falloff);
  }
  const speed = COMBAT.projectileSpeed[def.role];
  return {
    def,
    role: def.role,
    buildTicks: secToTicks(def.buildTimeSec),
    attackIntervalTicks: secToTicks(def.attackIntervalSec),
    speedPerTick: def.speed / WORLD.tickRate,
    damageVs,
    splashDamageVs,
    projectileStep: speed === null ? null : speed / WORLD.tickRate,
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

/** Çağın kadrosundaki ilk birlik; yoksa undefined. */
export function primaryUnitOfAge(age: number): CompiledUnit | undefined {
  const ageDef = getAge(age);
  if (ageDef === undefined) return undefined;
  for (const id of ageDef.unitIds) {
    const unit = getUnit(id);
    if (unit !== undefined) return unit;
  }
  return undefined;
}

/** Çağın kadrosunda verilen role sahip ilk birlik; yoksa undefined. */
export function unitOfRole(age: number, role: Role): CompiledUnit | undefined {
  const ageDef = getAge(age);
  if (ageDef === undefined) return undefined;
  for (const id of ageDef.unitIds) {
    const unit = getUnit(id);
    if (unit !== undefined && unit.role === role) return unit;
  }
  return undefined;
}
