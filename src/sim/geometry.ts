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
