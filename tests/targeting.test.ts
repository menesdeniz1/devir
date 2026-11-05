import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/data/units';
import { WORLD } from '../src/data/world';
import { mustGetUnit } from '../src/sim/compile';
import { dirOf, enemyBaseFaceX, gapBetween, otherSide } from '../src/sim/geometry';
import { rngFromSeed, rngInt, rngNext, type RngState } from '../src/sim/rng';
import { selectTargets, type Target } from '../src/sim/targeting';
import type { GameState, SideId } from '../src/sim/types';
import { addUnit, newState } from './helpers';

/**
 * Referans: taraf başına sıralı dizi kullanmayan, tüm düşmanları dizi sırasıyla tarayan kaba arama
 * (Aşama 1'deki özgün algoritma). Hızlı sürüm bununla birebir aynı sonucu vermelidir.
 */
function bruteForceTargets(state: GameState): Target[] {
  const out: Target[] = [];
  for (const a of state.units) {
    const aDef = mustGetUnit(a.type).def;
    let best: Target = null;
    let bestGap = Infinity;
    for (const e of state.units) {
      if (e.side !== otherSide(a.side)) continue;
      const eDef = mustGetUnit(e.type).def;
      const gap = gapBetween(a, aDef.width, e, eDef.width);
      if (gap <= -(aDef.width + eDef.width)) continue;
      if (gap <= aDef.range && gap < bestGap) {
        best = e.id;
        bestGap = gap;
      }
    }
    if (best === null) {
      const dir = dirOf(a.side);
      const baseGap = dir * (enemyBaseFaceX(a.side) - (a.x + (dir * aDef.width) / 2));
      if (baseGap <= aDef.range) best = 'base';
    }
    out.push(best);
  }
  return out;
}

function randomState(rng: RngState, count: number, clustered: boolean): GameState {
  const s = newState();
  const types = UNITS.map((u) => u.id);
  for (let i = 0; i < count; i++) {
    const side = rngInt(rng, 2) as SideId;
    const type = types[rngInt(rng, types.length)]!;
    // Bazı durumlarda tam çakışma/eşit mesafe üretmek için tamsayı ızgara; bazılarında sürekli değer.
    const x = clustered ? 900 + rngInt(rng, 40) * 5 : WORLD.baseWidth + rngNext(rng) * (WORLD.worldWidth - 2 * WORLD.baseWidth);
    addUnit(s, side, x, {}, type);
  }
  return s;
}

describe('Hedefleme: sıralı dizilerle arama kaba aramayla birebir aynıdır', () => {
  it('rastgele konum, tür ve taraf karışımlarında (çakışma ve eşit mesafe dahil) sonuçlar aynı', () => {
    const rng = rngFromSeed(42);
    let withTarget = 0;
    let baseTargets = 0;
    for (let round = 0; round < 400; round++) {
      const count = 1 + rngInt(rng, 40);
      const s = randomState(rng, count, round % 2 === 0);
      const fast = selectTargets(s);
      const slow = bruteForceTargets(s);
      expect(fast).toEqual(slow);
      for (const t of fast) {
        if (t === 'base') baseTargets += 1;
        else if (t !== null) withTarget += 1;
      }
    }
    // Test gerçekten hedef bulan durumları da kapsıyor.
    expect(withTarget).toBeGreaterThan(500);
    expect(baseTargets).toBeGreaterThan(20);
  });

  it('dizi sırası eşitliği bozar: aynı mesafedeki iki düşmandan listede önce gelen seçilir', () => {
    const s = newState();
    addUnit(s, 0, 1000);
    const first = addUnit(s, 1, 1000 + 36 + 5);
    addUnit(s, 1, 1000 + 36 + 5);
    expect(selectTargets(s)[0]).toBe(first.id);
    expect(selectTargets(s)).toEqual(bruteForceTargets(s));
  });

  it('büyük orduda (her taraf 150 birlik) hedefleme kaba aramayla aynı sonucu verir', () => {
    const rng = rngFromSeed(7);
    const s = newState();
    for (let i = 0; i < 150; i++) {
      addUnit(s, 0, 200 + i * 5.5 + rngNext(rng), {}, UNITS[rngInt(rng, UNITS.length)]!.id);
      addUnit(s, 1, 1720 - i * 5.5 - rngNext(rng), {}, UNITS[rngInt(rng, UNITS.length)]!.id);
    }
    expect(selectTargets(s)).toEqual(bruteForceTargets(s));
  });
});
