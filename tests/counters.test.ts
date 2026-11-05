import { describe, expect, it } from 'vitest';
import { createBattle, playBattle, repeatUnit, runBattle, type BattleResult } from '../src/match/matchup';
import { checkInvariants } from '../src/sim/invariants';
import { stateHash } from '../src/sim/hash';
import type { SideId } from '../src/sim/types';

/**
 * Karşılık senaryoları (GDD §3 döngüsü; yol haritası Aşama 2 testleri). Eşit altınlı, önceden yerleştirilmiş
 * ordular; gelir etkisiz, üsler çok yüksek canlı; biri tamamen ölene kadar oynar.
 * Sayılar ordu büyüklükleridir (≈480 altın), denge değeri değildir; birlik değerleri src/data'dadır.
 */
const F = 'primitive_front';
const R = 'primitive_ranged';
const H = 'primitive_heavy';

const nineFront = repeatUnit(F, 9); // 450 altın
const threeHeavy = repeatUnit(H, 3); // 480 altın
const sevenRanged = repeatUnit(R, 7); // 490 altın
const mixed = [...repeatUnit(F, 4), ...repeatUnit(R, 4)]; // 480 altın (önde ön hat, arkada menzilli)

function describeResult(label: string, r: BattleResult): string {
  return `${label}: kazanan=${r.winner}, kalan can=${r.remainingHp.join('/')}, birlik=${r.remainingUnits.join('/')}, tick=${r.ticks}, zaman aşımı=${r.timedOut}`;
}

/** Ordu A'yı verilen tarafa koyup oynatır; sonucu "A kazandı mı" olarak döndürür. Her iki taraf düzeninde de aynı olmalı. */
function winnerOfFirst(a: readonly string[], b: readonly string[]): { aWins: boolean; both: BattleResult[] } {
  const asLeft = runBattle(a, b);
  const asRight = runBattle(b, a);
  const leftWin = asLeft.winner === 0;
  const rightWin = asRight.winner === 1;
  expect(leftWin, describeResult('A solda', asLeft)).toBe(rightWin);
  return { aWins: leftWin, both: [asLeft, asRight] };
}

describe('Karşılık ilişkileri (Aşama 2)', () => {
  it('(a) ≈480 altın: 9 ön hat > 3 ağır', () => {
    const { aWins, both } = winnerOfFirst(nineFront, threeHeavy);
    expect(aWins, both.map((r, i) => describeResult(`koşu ${i}`, r)).join(' | ')).toBe(true);
    expect(both[0]!.timedOut).toBe(false);
  });

  it('(b) ≈480 altın: 3 ağır > 7 menzilli', () => {
    const { aWins, both } = winnerOfFirst(threeHeavy, sevenRanged);
    expect(aWins, both.map((r, i) => describeResult(`koşu ${i}`, r)).join(' | ')).toBe(true);
  });

  it('(c) ≈480 altın: 4 ön hat + 4 menzilli > 9 ön hat', () => {
    const { aWins, both } = winnerOfFirst(mixed, nineFront);
    expect(aWins, both.map((r, i) => describeResult(`koşu ${i}`, r)).join(' | ')).toBe(true);
  });

  it('kazanan tarafın birlikleri kalır, yenilenin kalmaz; sonuç belirlidir (aynı girdi aynı karma)', () => {
    const run = (): { hash: string; result: BattleResult } => {
      const state = createBattle(nineFront, threeHeavy);
      const result = playBattle(state);
      return { hash: stateHash(state), result };
    };
    const first = run();
    const second = run();
    expect(second.hash).toBe(first.hash);
    expect(first.result.remainingUnits[1]).toBe(0);
    expect(first.result.remainingUnits[0]).toBeGreaterThan(0);
    expect(first.result.remainingHp[0]).toBeGreaterThan(0);
  });

  it('savaş boyunca değişmezler korunur (tamsayı can, mermi kimlikleri, kimse kimseyi geçmez)', () => {
    for (const [a, b] of [
      [nineFront, threeHeavy],
      [threeHeavy, sevenRanged],
      [mixed, nineFront],
      [sevenRanged, nineFront],
    ] as const) {
      const state = createBattle(a, b);
      playBattle(state, {
        onStep: (s) => {
          const problems = checkInvariants(s);
          if (problems.length > 0) throw new Error(`tick ${s.tick}: ${problems.join('; ')}`);
        },
      });
    }
  });

  it('senaryo: ordular iki yanda eşit dizilir ve üsler sonucu bitirmez', () => {
    const state = createBattle(nineFront, threeHeavy);
    const sides: SideId[] = [0, 1];
    for (const side of sides) {
      expect(state.sides[side].baseHp).toBe(state.sides[side].baseMaxHp);
      expect(Number.isInteger(state.sides[side].baseHp)).toBe(true);
    }
    expect(state.units.filter((u) => u.side === 0)).toHaveLength(9);
    expect(state.units.filter((u) => u.side === 1)).toHaveLength(3);
    expect(checkInvariants(state)).toEqual([]);
    const result = playBattle(state);
    expect(state.outcome).toBeNull();
    expect(result.timedOut).toBe(false);
  });
});
