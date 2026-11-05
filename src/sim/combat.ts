import { EPS, mustGetUnit } from './compile';
import { dirOf, otherSide } from './geometry';
import type { GameState, SideId, UnitState } from './types';

/** Bekleyen hasar: adım 10'da eşzamanlı uygulanır (PRD S-09). */
export interface PendingDamage {
  attackerSide: SideId;
  /** Öldürme istatistiği ve ödül kaynağı: atan birliğin türü (atan ölmüş olsa bile). */
  attackerType: string;
  /** Hedef birlik kimliği ya da 'base'. */
  target: number | 'base';
  damage: number;
}

export interface StrikeResult {
  /** Ana hedefe verilen hasar (ana hedef yoksa 0). */
  mainDamage: number;
  /** Hasar alan birlik sayısı (üs dahil değil). */
  unitsHit: number;
  hitBase: boolean;
}

/**
 * Bir vuruşun (yakın dövüş saldırısı ya da mermi çarpması) tüm hasarını bekleyen hasara ekler:
 * ana hedef, delme (ana hedefin arkasındaki en yakın `count` düşman) ve alan hasarı (çarpma noktasına `radius`
 * içindeki diğer düşmanlar, falloff'lu). Her birlik bir vuruştan en fazla bir kez hasar alır; üs alan hasarından etkilenmez.
 *
 * `target`: canlı hedef birlik, 'base' (rakip üs) ya da null (hedef ölmüş; yalnız alan hasarı patlar).
 */
export function strike(
  state: GameState,
  side: SideId,
  sourceType: string,
  target: UnitState | 'base' | null,
  impactX: number,
  pending: PendingDamage[],
): StrikeResult {
  const source = mustGetUnit(sourceType);
  const enemySide = otherSide(side);
  const dir = dirOf(side);
  const hitIds = new Set<number>();
  let mainDamage = 0;
  let hitBase = false;

  if (target === 'base') {
    mainDamage = source.damageVs.base;
    hitBase = true;
    pending.push({ attackerSide: side, attackerType: sourceType, target: 'base', damage: mainDamage });
  } else if (target !== null) {
    const targetDef = mustGetUnit(target.type);
    mainDamage = source.damageVs[targetDef.role];
    hitIds.add(target.id);
    pending.push({ attackerSide: side, attackerType: sourceType, target: target.id, damage: mainDamage });

    const pierce = source.def.pierce;
    if (pierce !== undefined) {
      const mainRear = dir * target.x + targetDef.def.width / 2;
      const behind: { unit: UnitState; nearEdge: number; index: number }[] = [];
      state.units.forEach((e, index) => {
        if (e.side !== enemySide || e.id === target.id) return;
        const nearEdge = dir * e.x - mustGetUnit(e.type).def.width / 2;
        // Yalnız ana hedefin arkasındakiler (saldırgandan daha uzakta).
        if (dir * e.x > dir * target.x) behind.push({ unit: e, nearEdge, index });
      });
      behind.sort((p, q) => p.nearEdge - q.nearEdge || p.index - q.index);
      for (const candidate of behind.slice(0, pierce.count)) {
        if (candidate.nearEdge - mainRear > pierce.length + EPS) continue;
        const role = mustGetUnit(candidate.unit.type).role;
        hitIds.add(candidate.unit.id);
        pending.push({ attackerSide: side, attackerType: sourceType, target: candidate.unit.id, damage: source.damageVs[role] });
      }
    }
  }

  const splash = source.def.splash;
  if (splash !== undefined && source.splashDamageVs !== null) {
    for (const e of state.units) {
      if (e.side !== enemySide || hitIds.has(e.id)) continue;
      const eDef = mustGetUnit(e.type);
      const half = eDef.def.width / 2;
      if (e.x - half <= impactX + splash.radius + EPS && e.x + half >= impactX - splash.radius - EPS) {
        hitIds.add(e.id);
        pending.push({ attackerSide: side, attackerType: sourceType, target: e.id, damage: source.splashDamageVs[eDef.role] });
      }
    }
  }

  return { mainDamage, unitsHit: hitIds.size, hitBase };
}
