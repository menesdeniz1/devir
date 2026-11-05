import { WORLD } from '../data/world';
import type { SideId, UnitState } from './types';

/** Taraf yönü: taraf 0 +x, taraf 1 -x. */
export function dirOf(side: SideId): 1 | -1 {
  return side === 0 ? 1 : -1;
}

export function otherSide(side: SideId): SideId {
  return side === 0 ? 1 : 0;
}

/** `side` tarafının saldırdığı rakip üssünün ön yüzünün x değeri. */
export function enemyBaseFaceX(side: SideId): number {
  return side === 0 ? WORLD.worldWidth - WORLD.baseWidth : WORLD.baseWidth;
}

/** `side` tarafının kendi üssünün ön yüzünün x değeri (kule menzili ve kule mermisinin çıkışı buradan ölçülür). */
export function ownBaseFaceX(side: SideId): number {
  return side === 0 ? WORLD.baseWidth : WORLD.worldWidth - WORLD.baseWidth;
}

/** İki birlik arasında birbirine bakan kenarlar arası mesafe (negatif olabilir). */
export function gapBetween(a: UnitState, aWidth: number, b: UnitState, bWidth: number): number {
  return dirOf(a.side) * (b.x - a.x) - (aWidth + bWidth) / 2;
}

/** `attackerSide` tarafından bakıldığında hedef birliğin saldırgana bakan kenarı (mermi çarpma noktası). */
export function facingEdgeX(target: UnitState, targetWidth: number, attackerSide: SideId): number {
  return attackerSide === 0 ? target.x - targetWidth / 2 : target.x + targetWidth / 2;
}

/** Savaş alanı (üsler arası): [sol üs ön yüzü, sağ üs ön yüzü]. Yetenek alanları buraya kırpılır (PRD Y-02). */
export function battlefieldBounds(): { x0: number; x1: number } {
  return { x0: WORLD.baseWidth, x1: WORLD.worldWidth - WORLD.baseWidth };
}

/**
 * Yetenek alanı: merkez ± genişliğin yarısı, savaş alanına kırpılır. Kırpılmış alan boşsa (merkez sonlu değil ya da
 * alan savaş alanıyla kesişmiyor) null döner.
 */
export function abilityArea(x: number, width: number): { x0: number; x1: number } | null {
  if (!Number.isFinite(x)) return null;
  const field = battlefieldBounds();
  const x0 = Math.max(field.x0, x - width / 2);
  const x1 = Math.min(field.x1, x + width / 2);
  return x0 < x1 ? { x0, x1 } : null;
}

/** Gövdesi [x0, x1] ile kesişen birlik mi (kenar teması dahil)? */
export function bodyOverlaps(unit: UnitState, unitWidth: number, x0: number, x1: number): boolean {
  const half = unitWidth / 2;
  return unit.x + half >= x0 && unit.x - half <= x1;
}
