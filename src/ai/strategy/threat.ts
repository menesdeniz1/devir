import { AI_TUNING } from '../../data/ai';
import type { Role } from '../../data/types';
import { WORLD } from '../../data/world';
import { getUnit, secToTicks } from '../../sim/compile';
import type { Observation } from '../observation';
import type { AiMemory } from './memory';

/** Tehdit değerlendirmesi (GDD §9 modül 1). Yalnızca gözlemden hesaplanır. */
export interface Threat {
  /** Sahadaki toplam güç (birlik gücü: maliyet × can oranı × çağ çarpanı). */
  ownPower: number;
  enemyPower: number;
  /** Güç oranı kendi / düşman (ikisi de 0 ise 1). */
  ratio: number;
  /** Kendi üs ön yüzüne `nearBaseDistance` içindeki güçler. */
  nearEnemy: number;
  nearOwn: number;
  /** Koridorun kendi yarısındaki güçler. */
  halfEnemy: number;
  halfOwn: number;
  /** Görünür düşman ordusunun rol payları (güç ağırlıklı; ordu yoksa hepsi 0). */
  enemyShare: Record<Role, number>;
  /** Görünür düşman birliklerinin rol başına sayısı. */
  enemyCount: Record<Role, number>;
  /** Kendi sahadaki birliklerinin rol başına sayısı. */
  ownCount: Record<Role, number>;
  /** Düşmanın kurulu kule sayısı (görünür). */
  enemyTowers: number;
  /** Son eğilim penceresinde (ve sürmekte olanda) kaybedilen üs canı oranı. */
  hpLoss: number;
  /** Baskı: yakındaki düşman yakındaki kendi gücünü aşıyor ya da üs can kaybediyor. */
  pressure: boolean;
  /** Yüksek tehdit: yakındaki düşman gücü kendi gücünün `highThreatRatio` katını aşıyor. */
  high: boolean;
}

const zeroRoles = (): Record<Role, number> => ({ front: 0, ranged: 0, heavy: 0 });

export function unitPower(type: string, hp: number): number {
  const unit = getUnit(type);
  if (unit === undefined) return 0;
  return unit.def.cost * (hp / unit.def.hp) * AI_TUNING.agePowerFactor ** (unit.def.age - 1);
}

/** Üs canı eğilimini günceller (bellekte; pencere dolunca kayıp oranı yazılır) ve tehdidi hesaplar. */
export function assessThreat(obs: Observation, mem: AiMemory): Threat {
  const hpFrac = obs.self.baseMaxHp > 0 ? obs.self.baseHp / obs.self.baseMaxHp : 0;
  if (obs.tick - mem.hpMarkTick >= secToTicks(AI_TUNING.trendWindowSec)) {
    mem.hpLoss = Math.max(0, mem.hpMark - hpFrac);
    mem.hpMark = hpFrac;
    mem.hpMarkTick = obs.tick;
  }
  const hpLoss = Math.max(mem.hpLoss, mem.hpMark - hpFrac);

  const face = obs.side === 0 ? WORLD.baseWidth : WORLD.worldWidth - WORLD.baseWidth;
  const half = (WORLD.worldWidth - 2 * WORLD.baseWidth) / 2;
  const t: Threat = {
    ownPower: 0,
    enemyPower: 0,
    ratio: 1,
    nearEnemy: 0,
    nearOwn: 0,
    halfEnemy: 0,
    halfOwn: 0,
    enemyShare: zeroRoles(),
    enemyCount: zeroRoles(),
    ownCount: zeroRoles(),
    enemyTowers: obs.enemy.slots.filter((s) => s.towerType !== null).length,
    hpLoss,
    pressure: false,
    high: false,
  };
  for (const u of obs.units) {
    const unit = getUnit(u.type);
    if (unit === undefined) continue;
    const p = unitPower(u.type, u.hp);
    const halfWidth = unit.def.width / 2;
    // Kendi üs ön yüzünden birliğin üsse bakan kenarına mesafe.
    const dist = obs.side === 0 ? u.x - halfWidth - face : face - (u.x + halfWidth);
    if (u.side === obs.side) {
      t.ownPower += p;
      t.ownCount[unit.role] += 1;
      if (dist <= AI_TUNING.nearBaseDistance) t.nearOwn += p;
      if (dist <= half) t.halfOwn += p;
    } else {
      t.enemyPower += p;
      t.enemyShare[unit.role] += p;
      t.enemyCount[unit.role] += 1;
      if (dist <= AI_TUNING.nearBaseDistance) t.nearEnemy += p;
      if (dist <= half) t.halfEnemy += p;
    }
  }
  if (t.enemyPower > 0) for (const r of ['front', 'ranged', 'heavy'] as const) t.enemyShare[r] /= t.enemyPower;
  t.ratio = t.enemyPower === 0 ? (t.ownPower === 0 ? 1 : Infinity) : t.ownPower / t.enemyPower;
  t.high = t.nearEnemy > 0 && t.nearEnemy > AI_TUNING.highThreatRatio * t.nearOwn;
  t.pressure = (t.nearEnemy > 0 && t.nearEnemy > t.nearOwn) || hpLoss >= AI_TUNING.trendPressure;
  return t;
}
