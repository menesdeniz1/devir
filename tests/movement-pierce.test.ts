import { describe, expect, it, vi } from 'vitest';

/**
 * Bu dosya veriye test birlikleri enjekte eder (gerçek veride "boşluğun yarısı" sınırına ve delmeye ulaşan
 * birlik yoktur). Yalnızca bu test dosyasını etkiler.
 */
const injected = vi.hoisted(() => {
  const base = { age: 1, cost: 1, buildTimeSec: 1, bountyGold: 1, bountyXp: 1 };
  return [
    // Çok hızlı, çok kısa menzilli: tek adımda boşluğu aşabilir (30 birim/tick).
    { ...base, id: 'test_dasher', role: 'front' as const, hp: 100, damage: 10, attackIntervalSec: 1, range: 1, speed: 600, width: 20 },
    // Çok yavaş (1 birim/tick), kısa menzilli.
    { ...base, id: 'test_slowpoke', role: 'front' as const, hp: 100, damage: 10, attackIntervalSec: 1, range: 1, speed: 20, width: 20 },
    // Delici menzilli: ana hedef + arkasındaki en yakın 2 düşman (ana hedeften en çok 100 birim).
    {
      ...base,
      id: 'test_piercer',
      role: 'ranged' as const,
      hp: 100,
      damage: 10,
      attackIntervalSec: 1,
      range: 300,
      speed: 55,
      width: 20,
      pierce: { count: 2, length: 100 },
    },
  ];
});

vi.mock('../src/data/units', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/data/units')>();
  return { ...original, UNITS: [...original.UNITS, ...injected] };
});

import { WORLD } from '../src/data/world';
import { mustGetUnit } from '../src/sim/compile';
import { checkInvariants } from '../src/sim/invariants';
import { rngFromSeed, rngInt } from '../src/sim/rng';
import { step } from '../src/sim/step';
import type { GameState, SimEvent } from '../src/sim/types';
import { FRONT_ID, addUnit, newState } from './helpers';

const DASHER = 'test_dasher';
const SLOW = 'test_slowpoke';
const PIERCER = 'test_piercer';

/** Sol birliğin ön kenarı ile sağ birliğin ön kenarı arasındaki boşluk (iki taraf bakışır). */
function gapOf(s: GameState, leftId: number, rightId: number): number {
  const l = s.units.find((u) => u.id === leftId)!;
  const r = s.units.find((u) => u.id === rightId)!;
  return r.x - mustGetUnit(r.type).def.width / 2 - (l.x + mustGetUnit(l.type).def.width / 2);
}

describe('Hareket: "boşluğun yarısı" sınırı iç içe geçmeyi önler (TDD §3 adım 7)', () => {
  it('veri enjeksiyonu: test birlikleri gerçekten yüklendi ve sınır olmadan geçerdi', () => {
    const dasher = mustGetUnit(DASHER);
    expect(dasher.speedPerTick).toBe(30);
    // İki birlik de boşluğun tamamını aşacak hızda: 30 + 30 > 40.
    expect(2 * dasher.speedPerTick).toBeGreaterThan(40);
  });

  it('simetrik: boşluk 40, iki hızlı birlik de 20 ilerler ve tam temas eder (iç içe geçmez)', () => {
    const s = newState();
    const a = addUnit(s, 0, 300, {}, DASHER);
    const b = addUnit(s, 1, 300 + 10 + 40 + 10, {}, DASHER);
    expect(gapOf(s, a.id, b.id)).toBeCloseTo(40, 9);
    step(s, []);
    expect(gapOf(s, a.id, b.id)).toBeCloseTo(0, 9);
    expect(a.x).toBeCloseTo(320, 9);
    expect(b.x).toBeCloseTo(340, 9);
    expect(checkInvariants(s)).toEqual([]);
    // Temas sonrası ikisi de hedef bulur ve ilerlemeden saldırır.
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'attack')).toHaveLength(2);
    expect(gapOf(s, a.id, b.id)).toBeCloseTo(0, 9);
  });

  it('boşluk bir adımdan küçükse (0,5) birlikler birbirinin içine girmez', () => {
    const s = newState();
    const a = addUnit(s, 0, 300, {}, DASHER);
    const b = addUnit(s, 1, 300 + 20 + 0.5, {}, DASHER);
    for (let i = 0; i < 5; i++) {
      step(s, []);
      expect(gapOf(s, a.id, b.id)).toBeGreaterThanOrEqual(-1e-9);
      expect(checkInvariants(s)).toEqual([]);
    }
  });

  it('asimetrik: hızlı birlik yavaş birliğe yaklaşırken sınır geçişi engeller, saldırı menzile girince başlar', () => {
    const s = newState();
    const fast = addUnit(s, 0, 300, {}, DASHER);
    const slow = addUnit(s, 1, 300 + 20 + 40, {}, SLOW);
    let firstAttackTick = -1;
    for (let t = 0; t < 40; t++) {
      const events = step(s, []);
      expect(gapOf(s, fast.id, slow.id)).toBeGreaterThanOrEqual(-1e-9);
      expect(checkInvariants(s)).toEqual([]);
      if (firstAttackTick < 0 && events.some((e) => e.type === 'attack')) firstAttackTick = t;
    }
    // Boşluk her adımda ≥ yarıya iner; menzil (1) içine kısa sürede girilir.
    expect(firstAttackTick).toBeGreaterThanOrEqual(0);
    expect(firstAttackTick).toBeLessThan(12);
  });

  it('rastgele boşluklarda ve sıralarda 300 adım boyunca hiç kimse karşı tarafı geçmez', () => {
    const rng = rngFromSeed(11);
    for (let round = 0; round < 60; round++) {
      const s = newState();
      const types = [DASHER, SLOW, FRONT_ID];
      const leftCount = 1 + rngInt(rng, 3);
      const rightCount = 1 + rngInt(rng, 3);
      // x: sol ordunun en ön kenarı; sonraki birlikler arkaya dizilir.
      let x = 250;
      for (let i = 0; i < leftCount; i++) {
        const type = types[rngInt(rng, types.length)]!;
        const w = mustGetUnit(type).def.width;
        addUnit(s, 0, x - w / 2, { hp: 1_000_000 }, type);
        x -= w + WORLD.friendlyGap + 1;
      }
      let rx = 250 + 30 + rngInt(rng, 400);
      for (let i = 0; i < rightCount; i++) {
        const type = types[rngInt(rng, types.length)]!;
        const w = mustGetUnit(type).def.width;
        addUnit(s, 1, rx + w / 2, { hp: 1_000_000 }, type);
        rx += w + WORLD.friendlyGap + 1;
      }
      for (let t = 0; t < 300; t++) {
        step(s, []);
        const problems = checkInvariants(s).filter((p) => p.includes('geçti') || p.includes('üst üste'));
        expect(problems, `tur ${round} tick ${t}`).toEqual([]);
      }
    }
  });
});

describe('Delme (ana hedef + arkasındaki en yakın count düşman)', () => {
  const pierceDamage = (): number => mustGetUnit(PIERCER).damageVs.front;

  function lineScene(thirdGap: number): { s: GameState; ids: number[] } {
    const s = newState();
    addUnit(s, 0, 500, {}, PIERCER);
    // Ön hat düşmanlar: B1 (ana hedef), B2 (6 birim arkada), B3 (thirdGap arkada), B4 (6 daha arkada).
    const b1 = addUnit(s, 1, 548);
    const b2 = addUnit(s, 1, 548 + 42);
    const b3 = addUnit(s, 1, 548 + 42 + 18 + thirdGap + 18);
    const b4 = addUnit(s, 1, b3.x + 42);
    return { s, ids: [b1.id, b2.id, b3.id, b4.id] };
  }

  it('hasar tablosu menzilli → ön hat: 13; delici mermi ana hedef ve arkasındaki 2 düşmana tam hasar verir', () => {
    expect(pierceDamage()).toBe(13);
    const { s, ids } = lineScene(6);
    const events = step(s, []);
    const hp = (id: number): number => s.units.find((u) => u.id === id)!.hp;
    expect(hp(ids[0]!)).toBe(180 - 13);
    expect(hp(ids[1]!)).toBe(180 - 13);
    expect(hp(ids[2]!)).toBe(180 - 13);
    expect(hp(ids[3]!)).toBe(180);
    const impact = events.filter((e): e is Extract<SimEvent, { type: 'projectileImpact' }> => e.type === 'projectileImpact');
    expect(impact).toHaveLength(1);
    expect(impact[0]!.hits).toBe(3);
  });

  it('ana hedefe 100 birimden uzak olan düşman delinmez (length sınırı)', () => {
    const { s, ids } = lineScene(150);
    step(s, []);
    const hp = (id: number): number => s.units.find((u) => u.id === id)!.hp;
    expect(hp(ids[0]!)).toBe(180 - 13);
    expect(hp(ids[1]!)).toBe(180 - 13);
    expect(hp(ids[2]!)).toBe(180);
    expect(hp(ids[3]!)).toBe(180);
  });

  it('dost birlikler delinmez; delinen düşmanın ölümü ödülü bir kez verir', () => {
    const s = newState();
    const shooter = addUnit(s, 0, 500, {}, PIERCER);
    const friendBehind = addUnit(s, 0, 440, {});
    const b1 = addUnit(s, 1, 548, { hp: 13 });
    const b2 = addUnit(s, 1, 590, { hp: 13 });
    const gold = s.sides[0].gold;
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'unitDied').map((e) => (e.type === 'unitDied' ? e.id : -1)).sort()).toEqual([b1.id, b2.id].sort());
    expect(s.sides[0].gold).toBe(gold + 2 * mustGetUnit(FRONT_ID).def.bountyGold);
    expect(shooter.hp).toBe(100);
    expect(friendBehind.hp).toBe(180);
    expect(s.sides[0].stats.kills[PIERCER]).toBe(2);
  });
});
