import { EPS, mustGetUnit } from './compile';
import { dirOf, enemyBaseFaceX, gapBetween, otherSide } from './geometry';
import type { GameState } from './types';

/** Hedef türü: birlik kimliği, 'base' ya da hedef yok. */
export type Target = number | 'base' | null;

/** Saldırgan tarafın ileri koordinatında, bir düşman birliğin saldırgana bakan kenarı; dizi sırası kaydı. */
interface EnemyEntry {
  /** state.units içindeki sıra (eşitlikte küçük sıra kazanır). */
  index: number;
  /** dirOf(saldıran) * x - genişlik / 2: düşmanın saldırgana bakan kenarı, saldıranın ileri koordinatında. */
  nearEdge: number;
}

/**
 * Hedefleme (TDD §3 adım 6): tüm birlikler tick başındaki konumlara göre menzildeki en yakın düşman birliğini,
 * yoksa menzildeki rakip üssü seçer. Her taraf için düşmanlar bakan kenara göre sıralanır; her saldırgan için
 * ikili aramayla pencereye girilir, böylece arama O(n²) değil O(n log n) olur.
 * Sonuç, tüm düşmanları dizi sırasıyla tarayan kaba arama ile birebir aynıdır (en küçük mesafe, eşitlikte küçük sıra).
 */
export function selectTargets(state: GameState): Target[] {
  const units = state.units;
  const defs = units.map((u) => mustGetUnit(u.type).def);
  const sorted: [EnemyEntry[], EnemyEntry[]] = [[], []];
  const widest: [number, number] = [0, 0];
  for (const attackerSide of [0, 1] as const) {
    const enemySide = otherSide(attackerSide);
    const dir = dirOf(attackerSide);
    const list = sorted[attackerSide];
    for (let i = 0; i < units.length; i++) {
      const e = units[i]!;
      if (e.side !== enemySide) continue;
      const width = defs[i]!.width;
      list.push({ index: i, nearEdge: dir * e.x - width / 2 });
      if (width > widest[attackerSide]) widest[attackerSide] = width;
    }
    list.sort((p, q) => p.nearEdge - q.nearEdge || p.index - q.index);
  }

  const targets: Target[] = [];
  for (let ai = 0; ai < units.length; ai++) {
    const a = units[ai]!;
    const aDef = defs[ai]!;
    const list = sorted[a.side];
    const dir = dirOf(a.side);
    const frontForward = dir * a.x + aDef.width / 2;
    // Geçerli aday: gap > -(aW + eW) ve gap <= menzil. gap = nearEdge - frontForward.
    let k = lowerBound(list, frontForward - aDef.width - widest[a.side] - EPS);
    let best: Target = null;
    let bestGap = Infinity;
    let bestIndex = Infinity;
    for (; k < list.length; k++) {
      const entry = list[k]!;
      const approx = entry.nearEdge - frontForward;
      if (approx > aDef.range + EPS || approx > bestGap + EPS) break;
      const e = units[entry.index]!;
      const eWidth = defs[entry.index]!.width;
      const gap = gapBetween(a, aDef.width, e, eWidth);
      // Tamamen arkada kalmış düşman (yan yana değil, geride) hedef olamaz; birlikler birbirini geçemediği için
      // normal oyunda bu durum oluşmaz, yalnızca bozuk/elle kurulmuş durumlara karşı koruma.
      if (gap <= -(aDef.width + eWidth)) continue;
      if (gap <= aDef.range && (gap < bestGap || (gap === bestGap && entry.index < bestIndex))) {
        best = e.id;
        bestGap = gap;
        bestIndex = entry.index;
      }
    }
    if (best === null) {
      const baseGap = dir * (enemyBaseFaceX(a.side) - (a.x + (dir * aDef.width) / 2));
      if (baseGap <= aDef.range) best = 'base';
    }
    targets.push(best);
  }
  return targets;
}

/** nearEdge >= value olan ilk dizinin sırası (dizi nearEdge'e göre artan sıralıdır). */
function lowerBound(list: readonly EnemyEntry[], value: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.nearEdge < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
