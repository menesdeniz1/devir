import { describe, expect, it } from 'vitest';
import { stepMatch } from '../src/match/runner';
import { applyCommand } from '../src/sim/commands';
import { goldBalanceProblems, checkInvariants } from '../src/sim/invariants';
import { stateHash } from '../src/sim/hash';
import { rngFromSeed, rngInt } from '../src/sim/rng';
import { step } from '../src/sim/step';
import { validate } from '../src/sim/validate';
import type { SimEvent } from '../src/sim/types';
import { ECONOMY } from '../src/data/world';
import { BOT_KINDS, FRONT_ID, makeControllers, newState, randomCommand, unitDef } from './helpers';

const FUZZ_GAMES = 60;
const FUZZ_TICKS = 3000;

describe('K-01: altın ve ücretlendirme', () => {
  it('K-01: bulanık test — altın her tick tamsayı ve >= 0, sipariş bir kez ücretlendirilir, ret durumu değiştirmez', () => {
    let rejectionsChecked = 0;
    let accepted = 0;
    for (let g = 0; g < FUZZ_GAMES; g++) {
      const seed = 1000 + g;
      const s = newState(seed);
      const rng = rngFromSeed(seed);
      const controllers = makeControllers(BOT_KINDS[g % BOT_KINDS.length]!, seed);
      for (let t = 0; t < FUZZ_TICKS && s.outcome === null; t++) {
        // Rastgele altın enjeksiyonu: büyük ordu, dolu kuyruk ve doğma engeli üretir.
        if (rngInt(rng, 200) === 0) s.sides[rngInt(rng, 2) as 0 | 1].gold += rngInt(rng, 600);
        const cmds = [];
        const n = rngInt(rng, 3);
        for (let i = 0; i < n; i++) cmds.push(randomCommand(rng));

        // Ret nedeniyle durum değişmemeli: adımdan bağımsız denetle.
        for (const c of cmds) {
          if (!validate(s, c).ok) {
            const before = stateHash(s);
            const sink: SimEvent[] = [];
            applyCommand(s, c, sink);
            expect(stateHash(s)).toBe(before);
            expect(sink).toHaveLength(1);
            expect(sink[0]!.type).toBe('commandRejected');
            rejectionsChecked += 1;
          }
        }

        const goldBefore: [number, number] = [s.sides[0].gold, s.sides[1].gold];
        const events = stepMatch(s, cmds, controllers);
        accepted += events.filter((e) => e.type === 'unitQueued').length;
        expect(checkInvariants(s)).toEqual([]);
        expect(goldBalanceProblems(goldBefore, s, events)).toEqual([]);
        for (const side of [0, 1] as const) {
          const stats = s.sides[side].stats;
          expect(stats.goldSpent - stats.goldRefunded).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(rejectionsChecked).toBeGreaterThan(500);
    expect(accepted).toBeGreaterThan(100);
  });

  it('K-01: kabul edilen sipariş altını hemen ve yalnız bir kez düşürür', () => {
    const s = newState();
    const start = s.sides[0].gold;
    const cost = unitDef().cost;
    step(s, [{ type: 'queueUnit', side: 0, unitId: FRONT_ID }]);
    expect(s.sides[0].gold).toBe(start - cost);
    expect(s.sides[0].stats.goldSpent).toBe(cost);
    expect(s.sides[0].queue).toEqual([{ unitId: FRONT_ID, progressTicks: 1, paid: cost }]);
    // Üretim ve doğma sırasında tekrar ücret alınmaz (gelirler hariç).
    for (let i = 0; i < 100; i++) step(s, []);
    expect(s.sides[0].stats.goldSpent).toBe(cost);
    expect(s.sides[0].gold).toBe(start - cost + s.sides[0].stats.goldEarned);
  });

  it('K-01: altın yetmeyen komut reddedilir, altın negatife düşmez', () => {
    const s = newState();
    s.sides[0].gold = unitDef().cost - 1;
    const events = step(s, [{ type: 'queueUnit', side: 0, unitId: FRONT_ID }]);
    expect(events).toEqual([
      { type: 'commandRejected', command: { type: 'queueUnit', side: 0, unitId: FRONT_ID }, reason: 'notEnoughGold' },
    ]);
    expect(s.sides[0].gold).toBe(unitDef().cost - 1);
    expect(s.sides[0].queue).toHaveLength(0);
  });
});

describe('K-10: kuyruk ve iptal', () => {
  it('K-10: index 0 iptali reddedilir, index >= 1 tam iade eder', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    step(s, [
      { type: 'queueUnit', side: 0, unitId: FRONT_ID },
      { type: 'queueUnit', side: 0, unitId: FRONT_ID },
      { type: 'queueUnit', side: 0, unitId: FRONT_ID },
    ]);
    const cost = unitDef().cost;
    const goldAfterQueue = s.sides[0].gold;
    expect(goldAfterQueue).toBe(1000 - 3 * cost);

    const rejected = step(s, [{ type: 'cancelOrder', side: 0, index: 0 }]);
    expect(rejected).toEqual([
      { type: 'commandRejected', command: { type: 'cancelOrder', side: 0, index: 0 }, reason: 'orderInProduction' },
    ]);
    expect(s.sides[0].queue).toHaveLength(3);
    expect(s.sides[0].gold).toBe(goldAfterQueue);

    const ok = step(s, [{ type: 'cancelOrder', side: 0, index: 2 }]);
    expect(ok).toContainEqual({ type: 'orderCancelled', side: 0, index: 2, unitId: FRONT_ID, refund: cost });
    expect(s.sides[0].gold).toBe(goldAfterQueue + cost);
    expect(s.sides[0].stats.goldRefunded).toBe(cost);
    expect(s.sides[0].queue).toHaveLength(2);

    const none = step(s, [{ type: 'cancelOrder', side: 0, index: 5 }]);
    expect(none[0]).toMatchObject({ type: 'commandRejected', reason: 'noSuchOrder' });
  });

  it('K-10: kuyruk azami uzunluğu aşamaz; 6. sipariş queueFull', () => {
    const s = newState();
    s.sides[0].gold = 10_000;
    const cmds = Array.from({ length: ECONOMY.maxQueue + 1 }, () => ({ type: 'queueUnit' as const, side: 0 as const, unitId: FRONT_ID }));
    const events = step(s, cmds);
    expect(events.filter((e) => e.type === 'unitQueued')).toHaveLength(ECONOMY.maxQueue);
    expect(events[events.length - 1]).toMatchObject({ type: 'commandRejected', reason: 'queueFull' });
    expect(s.sides[0].queue).toHaveLength(ECONOMY.maxQueue);
    expect(s.sides[0].gold).toBe(10_000 - ECONOMY.maxQueue * unitDef().cost);
  });

  it('K-10: çağında olmayan birlik unitNotAvailable, bilinmeyen kimlik unknownUnit', () => {
    const s = newState();
    const age = s.sides[0].age;
    s.sides[0].age = 2; // veride olmayan çağ → hiçbir birlik kullanılamaz
    expect(validate(s, { type: 'queueUnit', side: 0, unitId: FRONT_ID })).toEqual({ ok: false, reason: 'unitNotAvailable' });
    s.sides[0].age = age;
    expect(validate(s, { type: 'queueUnit', side: 0, unitId: 'nope' })).toEqual({ ok: false, reason: 'unknownUnit' });
  });
});
