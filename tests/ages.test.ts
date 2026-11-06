import { describe, expect, it } from 'vitest';
import { createBasicBot } from '../src/ai/basicBot';
import { buildObservation } from '../src/ai/observation';
import { createMonoBot, createRandomBot, createStackerBot } from '../src/ai/testBots';
import { AGES } from '../src/data/ages';
import { COMBAT } from '../src/data/combat';
import { UNITS } from '../src/data/units';
import { ECONOMY, WORLD } from '../src/data/world';
import { stepMatch } from '../src/match/runner';
import { applyCommand } from '../src/sim/commands';
import { mustGetAge, mustGetUnit, TARGET_CLASSES } from '../src/sim/compile';
import { stateHash } from '../src/sim/hash';
import { checkInvariants, goldBalanceProblems } from '../src/sim/invariants';
import { rngFromSeed, rngInt } from '../src/sim/rng';
import { step } from '../src/sim/step';
import type { Command, GameState, SimEvent } from '../src/sim/types';
import { validate } from '../src/sim/validate';
import { addUnit, clone, newState, randomCommand, setAge } from './helpers';

const AGE_UP = (side: 0 | 1): Command => ({ type: 'ageUp', side });

/** Çağ atlamaya hazır durum: deneyim ve altın bol. */
function richState(): GameState {
  const s = newState();
  for (const side of [0, 1] as const) {
    s.sides[side].xp = 100_000;
    s.sides[side].gold = 100_000;
  }
  return s;
}

describe('Çağ verisi', () => {
  it('beş çağ sırayla tanımlıdır; eşikler, ücretler ve üs canı artar; her çağın üç birliği veride vardır', () => {
    expect(AGES.map((a) => a.age)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < AGES.length; i++) {
      expect(AGES[i]!.xpThreshold).toBeGreaterThan(AGES[i - 1]!.xpThreshold);
      expect(AGES[i]!.ageUpCost).toBeGreaterThan(AGES[i - 1]!.ageUpCost);
      expect(AGES[i]!.baseMaxHp).toBeGreaterThan(AGES[i - 1]!.baseMaxHp);
      expect(AGES[i]!.incomePerSec).toBeGreaterThan(AGES[i - 1]!.incomePerSec);
    }
    for (const age of AGES) {
      expect(age.unitIds).toHaveLength(3);
      for (const id of age.unitIds) expect(mustGetUnit(id).def.age, id).toBe(age.age);
      for (const n of [age.incomePerSec, age.stoneGoldPerSec, age.stoneXpPerSec, age.xpThreshold, age.ageUpCost, age.baseMaxHp]) {
        expect(Number.isInteger(n)).toBe(true);
      }
    }
  });
});

describe('Ç-02: çağlar sırayla açılır', () => {
  it('Ç-02: tek komut yalnız +1 çağ verir; deneyim ve altın ne kadar bol olursa olsun çağ atlanmaz', () => {
    const s = richState();
    for (let expected = 2; expected <= 5; expected++) {
      const events = step(s, [AGE_UP(0)]);
      expect(s.sides[0].age).toBe(expected);
      expect(s.sides[1].age).toBe(1);
      expect(events.filter((e) => e.type === 'agedUp')).toEqual([
        { type: 'agedUp', side: 0, age: expected, paid: mustGetAge(expected).ageUpCost, baseHp: s.sides[0].baseHp, baseMaxHp: s.sides[0].baseMaxHp },
      ]);
    }
    expect(s.sides[0].stats.ageUpTicks).toEqual([0, 1, 2, 3]);
  });

  it('Ç-02: iki taraf birbirinden bağımsız gelişir', () => {
    const s = richState();
    step(s, [AGE_UP(1)]);
    step(s, [AGE_UP(1)]);
    expect(s.sides[0].age).toBe(1);
    expect(s.sides[1].age).toBe(3);
  });

  it('E-09: deneyim harcanmaz (çağ atlama deneyimi düşürmez)', () => {
    const s = richState();
    const before = s.sides[0].xp;
    step(s, [AGE_UP(0)]);
    expect(s.sides[0].xp).toBe(before);
    expect(s.sides[0].stats.goldSpent).toBe(mustGetAge(2).ageUpCost);
  });

  it('Ç-08: son çağa ulaşmak maçı bitirmez', () => {
    const s = richState();
    for (let i = 0; i < 4; i++) step(s, [AGE_UP(0)]);
    expect(s.sides[0].age).toBe(5);
    expect(s.outcome).toBeNull();
    step(s, []);
    expect(s.outcome).toBeNull();
  });
});

describe('K-01: çağ ücreti bir kez ve ret nedenleri', () => {
  it('K-01: kabul edilen çağ atlama ücreti anında ve yalnız bir kez düşer; altın korunumu olaylarla tutar', () => {
    const s = richState();
    const goldBefore: [number, number] = [s.sides[0].gold, s.sides[1].gold];
    const events = step(s, [AGE_UP(0)]);
    const cost = mustGetAge(2).ageUpCost;
    expect(s.sides[0].gold).toBe(goldBefore[0] - cost);
    expect(s.sides[0].stats.goldSpent).toBe(cost);
    expect(goldBalanceProblems(goldBefore, s, events)).toEqual([]);
    // Sonraki adımlarda ücret yeniden düşmez.
    const after = s.sides[0].gold;
    step(s, []);
    expect(s.sides[0].gold).toBe(after);
  });

  it('K-01: bulanık test — rastgele komut/deneyim/altın ile çağ atlama; ücret bir kez, değişmezler korunur, ret durumu değiştirmez', () => {
    let aged = 0;
    let rejectedAge = 0;
    for (let g = 0; g < 40; g++) {
      const seed = 5000 + g;
      const s = newState(seed);
      const rng = rngFromSeed(seed);
      for (let t = 0; t < 2500 && s.outcome === null; t++) {
        if (rngInt(rng, 60) === 0) s.sides[rngInt(rng, 2) as 0 | 1].gold += rngInt(rng, 900);
        if (rngInt(rng, 80) === 0) s.sides[rngInt(rng, 2) as 0 | 1].xp += rngInt(rng, 1500);
        const cmds: Command[] = [];
        for (let i = rngInt(rng, 3); i > 0; i--) cmds.push(randomCommand(rng));
        for (const c of cmds) {
          if (c.type === 'ageUp' && !validate(s, c).ok) {
            const before = stateHash(s);
            const sink: SimEvent[] = [];
            applyCommand(s, c, sink);
            expect(stateHash(s)).toBe(before);
            expect(sink).toHaveLength(1);
            expect(sink[0]!.type).toBe('commandRejected');
            rejectedAge += 1;
          }
        }
        const goldBefore: [number, number] = [s.sides[0].gold, s.sides[1].gold];
        const events = step(s, cmds);
        aged += events.filter((e) => e.type === 'agedUp').length;
        expect(checkInvariants(s)).toEqual([]);
        expect(goldBalanceProblems(goldBefore, s, events)).toEqual([]);
      }
    }
    expect(aged).toBeGreaterThan(20);
    expect(rejectedAge).toBeGreaterThan(50);
  });

  it('notEnoughXp: xp ve xpRequired dolu; deneyim eşikten bir eksikken reddedilir, eşikte kabul edilir', () => {
    const s = newState();
    s.sides[0].gold = 10_000;
    const need = mustGetAge(2).xpThreshold;
    s.sides[0].xp = need - 1;
    expect(validate(s, AGE_UP(0))).toEqual({ ok: false, reason: 'notEnoughXp', xp: need - 1, xpRequired: need });
    const before = stateHash(s);
    const events = step(s, [AGE_UP(0)]);
    expect(events.find((e) => e.type === 'commandRejected')).toMatchObject({ reason: 'notEnoughXp' });
    expect(s.sides[0].age).toBe(1);
    expect(stateHash(s)).not.toBe(before); // tick ilerledi, ama çağ ve altın aynı
    s.sides[0].xp = need;
    expect(validate(s, AGE_UP(0))).toEqual({ ok: true });
  });

  it('notEnoughGold: missingGold eksik miktardır; deneyim eşiği geçmişken yalnız altın engeller', () => {
    const s = newState();
    const cost = mustGetAge(2).ageUpCost;
    s.sides[0].xp = 5000;
    s.sides[0].gold = cost - 35;
    expect(validate(s, AGE_UP(0))).toEqual({ ok: false, reason: 'notEnoughGold', missingGold: 35 });
    s.sides[0].gold = cost;
    expect(validate(s, AGE_UP(0))).toEqual({ ok: true });
  });

  it('maxAge: son çağda reddedilir; sıra maxAge → notEnoughXp → notEnoughGold, bozuk komut ve bitmiş maç önce gelir', () => {
    const s = newState();
    setAge(s, 0, 5);
    s.sides[0].xp = 0;
    s.sides[0].gold = 0;
    expect(validate(s, AGE_UP(0))).toEqual({ ok: false, reason: 'maxAge' });
    // Hem deneyim hem altın eksik: önce deneyim bildirilir.
    s.sides[1].xp = 0;
    s.sides[1].gold = 0;
    expect(validate(s, AGE_UP(1))).toMatchObject({ ok: false, reason: 'notEnoughXp' });
    // Yalnız altın eksik.
    s.sides[1].xp = 100_000;
    expect(validate(s, AGE_UP(1))).toMatchObject({ ok: false, reason: 'notEnoughGold' });
    // Bozuk taraf.
    expect(validate(s, { type: 'ageUp', side: 2 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
    // Bitmiş maç.
    s.outcome = { kind: 'draw', tick: 0 };
    expect(validate(s, AGE_UP(0))).toEqual({ ok: false, reason: 'matchOver' });
  });
});

describe('K-04: çağ geçişi sahayı, kuyruğu ve üs can yüzdesini korur', () => {
  it('K-04: sahadaki birlikler aynı tür ve canla kalır; kuyruk siparişleri aynı unitId ile korunur ve eski türle doğar', () => {
    const s = richState();
    s.sides[0].gold = 100_000;
    // Hasarlı iki birlik (yalnız taraf 0: çatışma olmaz).
    addUnit(s, 0, 300, { hp: 77 }, 'primitive_front');
    addUnit(s, 0, 400, { hp: 31 }, 'primitive_ranged');
    step(s, [
      { type: 'queueUnit', side: 0, unitId: 'primitive_heavy' },
      { type: 'queueUnit', side: 0, unitId: 'primitive_front' },
      { type: 'queueUnit', side: 0, unitId: 'primitive_ranged' },
    ]);
    const unitsBefore = s.units.map((u) => ({ id: u.id, type: u.type, hp: u.hp }));
    const queueBefore = s.sides[0].queue.map((o) => ({ unitId: o.unitId, paid: o.paid }));

    step(s, [AGE_UP(0)]);
    expect(s.sides[0].age).toBe(2);
    expect(s.units.map((u) => ({ id: u.id, type: u.type, hp: u.hp }))).toEqual(unitsBefore);
    expect(s.sides[0].queue.map((o) => ({ unitId: o.unitId, paid: o.paid }))).toEqual(queueBefore);

    // Sipariş tamamlanınca eski çağın türüyle doğar.
    for (let i = 0; i < 600 && s.units.length < 5; i++) step(s, []);
    const spawnedTypes = s.units.slice(2).map((u) => u.type);
    expect(spawnedTypes).toEqual(['primitive_heavy', 'primitive_front', 'primitive_ranged']);
    expect(s.sides[0].queue).toHaveLength(0);
  });

  it('K-04: yeni siparişler yalnız güncel çağın kadrosundandır (unitNotAvailable)', () => {
    const s = richState();
    expect(validate(s, { type: 'queueUnit', side: 0, unitId: 'ancient_front' })).toMatchObject({ ok: false, reason: 'unitNotAvailable' });
    step(s, [AGE_UP(0)]);
    expect(validate(s, { type: 'queueUnit', side: 0, unitId: 'primitive_front' })).toMatchObject({ ok: false, reason: 'unitNotAvailable' });
    expect(validate(s, { type: 'queueUnit', side: 0, unitId: 'ancient_front' })).toEqual({ ok: true });
    // Rakip hâlâ 1. çağda.
    expect(validate(s, { type: 'queueUnit', side: 1, unitId: 'primitive_front' })).toEqual({ ok: true });
  });

  it('K-04: üs can yüzdesi korunur (tam ve hasarlı üs, her geçişte); tam üs tam kalır', () => {
    for (const fraction of [1, 0.75, 0.5, 0.1, 0.0004]) {
      const s = richState();
      s.sides[0].baseHp = Math.max(1, Math.round(s.sides[0].baseMaxHp * fraction));
      for (let age = 2; age <= 5; age++) {
        const old = s.sides[0];
        const oldHp = old.baseHp;
        const oldMax = old.baseMaxHp;
        step(s, [AGE_UP(0)]);
        const now = s.sides[0];
        expect(now.baseMaxHp).toBe(mustGetAge(age).baseMaxHp);
        expect(Number.isInteger(now.baseHp)).toBe(true);
        expect(now.baseHp).toBeGreaterThanOrEqual(1);
        expect(Math.abs(now.baseHp / now.baseMaxHp - oldHp / oldMax)).toBeLessThanOrEqual(0.5 / now.baseMaxHp + 1e-9);
        if (oldHp === oldMax) expect(now.baseHp).toBe(now.baseMaxHp);
        else expect(now.baseHp).toBeLessThan(now.baseMaxHp); // ücretsiz tam iyileşme yok (Ç-07)
      }
    }
  });

  it('K-04: çatışma sürerken çağ atlamak sahadaki birliklerin canını ve türünü değiştirmez', () => {
    const s = richState();
    addUnit(s, 0, 800, {}, 'primitive_front');
    addUnit(s, 1, 800 + 36 + 6, {}, 'primitive_front');
    for (let i = 0; i < 10; i++) step(s, []);
    const before = s.units.map((u) => ({ id: u.id, type: u.type }));
    step(s, [AGE_UP(0)]);
    expect(s.units.map((u) => ({ id: u.id, type: u.type }))).toEqual(before);
  });
});

describe('Çağa göre gelir', () => {
  it('gelir her saniye sonunda güncel çağın incomePerSec değeridir (tamsayı, goldEarned içerir)', () => {
    for (const age of AGES) {
      const s = newState();
      setAge(s, 0, age.age);
      setAge(s, 1, 1);
      const before = [s.sides[0].gold, s.sides[1].gold];
      for (let t = 0; t < WORLD.tickRate; t++) step(s, []);
      expect(s.sides[0].gold - before[0]!, `çağ ${age.age}`).toBe(age.incomePerSec);
      expect(s.sides[1].gold - before[1]!).toBe(AGES[0]!.incomePerSec);
      expect(s.sides[0].stats.goldEarned).toBe(age.incomePerSec);
    }
  });

  it('çağ atlayınca bir sonraki saniye yeni çağın gelirini verir', () => {
    const s = richState();
    step(s, [AGE_UP(0)]);
    const before = s.sides[0].gold;
    for (let t = 1; t < WORLD.tickRate; t++) step(s, []);
    expect(s.sides[0].gold - before).toBe(AGES[1]!.incomePerSec);
  });
});

describe('Çoklu çağ: birlik verisi', () => {
  it('multiplierOverrides: Arbaletçi ön hata çarpan 1,5; diğer sınıflar rol tablosundan', () => {
    const def = UNITS.find((u) => u.id === 'medieval_ranged')!;
    expect(def.multiplierOverrides).toEqual({ front: 1.5 });
    const compiled = mustGetUnit('medieval_ranged');
    for (const cls of TARGET_CLASSES) {
      const multiplier = def.multiplierOverrides?.[cls] ?? COMBAT.roleMultipliers.ranged[cls];
      expect(compiled.damageVs[cls], cls).toBe(Math.max(1, Math.round(def.damage * multiplier)));
    }
    expect(compiled.damageVs.front).toBe(Math.round(def.damage * 1.5));
    expect(compiled.damageVs.front).toBeGreaterThan(Math.round(def.damage * COMBAT.roleMultipliers.ranged.front));
    expect(compiled.damageVs.ranged).toBe(Math.round(def.damage * COMBAT.roleMultipliers.ranged.ranged));
  });

  it('her çağın kadrosu sırayla ön hat, menzilli ve ağır birliktir', () => {
    for (const age of AGES) {
      expect(age.unitIds.map((id) => mustGetUnit(id).role)).toEqual(['front', 'ranged', 'heavy']);
    }
  });
});

describe('K-13: gözlem', () => {
  it('K-13: gözlem Sınır Taşı durumunu içerir (kopya), karşı tarafın çağını içerir; gizli bilgiyi içermez', () => {
    const s = newState();
    s.stone.counter = 42;
    s.sides[0].xp = 777;
    s.sides[1].xp = 5557;
    s.sides[1].gold = 4242;
    setAge(s, 1, 3);
    s.sides[1].queue.push({ unitId: 'medieval_front', progressTicks: 31337, paid: 8191 });
    const obs = buildObservation(s, 0);
    expect(obs.stone).toEqual({ counter: 42, owner: null, potGold: 0, potXp: 0 });
    obs.stone.counter = -1;
    expect(s.stone.counter).toBe(42);
    expect(obs.enemy).toEqual({
      age: 3,
      baseHp: s.sides[1].baseHp,
      baseMaxHp: s.sides[1].baseMaxHp,
      slots: [
        { unlocked: true, towerType: null },
        { unlocked: false, towerType: null },
        { unlocked: false, towerType: null },
      ],
    });
    const json = JSON.stringify(obs);
    expect(json).not.toContain('4242');
    expect(json).not.toContain('5557');
    expect(json).not.toContain('31337');
    expect(json).not.toContain('8191');
    expect(obs.self.xp).toBe(777);
    expect(obs.self.stats.ageUpTicks).toEqual(s.sides[0].stats.ageUpTicks);
    expect(obs.self.stats.ageUpTicks).not.toBe(s.sides[0].stats.ageUpTicks);
  });
});

describe('Botlar çağ atlar', () => {
  it('basicBot: eşik geçildiğinde üretimi durdurup altın biriktirir, yetince çağ atlar, sonra yeni çağın birliğini üretir', () => {
    const s = newState();
    const bot = createBasicBot();
    const controllers = [null, bot] as const;
    const need = mustGetAge(2).xpThreshold;
    const cost = mustGetAge(2).ageUpCost;
    s.sides[1].gold = 0;
    s.sides[1].xp = need;
    let agedAt = -1;
    let producedWhileSaving = 0;
    for (let t = 0; t < 3000 && s.sides[1].age === 1; t++) {
      const events = stepMatch(s, [], controllers);
      producedWhileSaving += events.filter((e) => e.type === 'unitQueued' && e.side === 1).length;
      if (events.some((e) => e.type === 'agedUp')) agedAt = s.tick;
    }
    expect(s.sides[1].age).toBe(2);
    expect(producedWhileSaving).toBe(0);
    // Gelir 4/sn: ücret kadar altın birikmeden çağ atlanmaz (+ karar gecikmesi yok: biriktirirken her tick karar verir).
    expect(agedAt).toBeGreaterThanOrEqual(Math.ceil(cost / AGES[0]!.incomePerSec) * WORLD.tickRate);
    expect(agedAt).toBeLessThanOrEqual(Math.ceil(cost / AGES[0]!.incomePerSec) * WORLD.tickRate + 2 * WORLD.tickRate);
    // Yeni çağın birlikleri üretilir.
    s.sides[1].gold += 2000;
    for (let t = 0; t < 600; t++) stepMatch(s, [], controllers);
    const ids = AGES[1]!.unitIds;
    const produced = ids.reduce((total, id) => total + (s.sides[1].stats.produced[id] ?? 0), 0);
    expect(produced).toBeGreaterThan(0);
  });

  it('stacker ve mono botlar: geçerliyse hemen çağ atlar; deneyim yetmiyorsa atlamaz', () => {
    const s = newState();
    const poor = buildObservation(s, 0);
    const stacker = createStackerBot();
    const mono = createMonoBot('front');
    const random = createRandomBot(1, 0);
    expect(stacker.decide(poor, null, 0).commands.some((c) => c.type === 'ageUp')).toBe(false);
    expect(mono.decide(poor, null, 0).commands.some((c) => c.type === 'ageUp')).toBe(false);
    s.sides[0].xp = 10_000;
    s.sides[0].gold = 10_000;
    const rich = buildObservation(s, 0);
    expect(stacker.decide(rich, null, 0).commands).toEqual([AGE_UP(0)]);
    expect(mono.decide(rich, null, 0).commands).toEqual([AGE_UP(0)]);
    // Rastgele bot yalnız geçerliyken çağ atlar (hiç geçersiz ageUp vermez).
    let ageUps = 0;
    let memory = null as ReturnType<typeof random.decide>['memory'];
    for (let t = 0; t < 4000; t++) {
      const result = random.decide(rich, memory, t);
      memory = result.memory;
      for (const c of result.commands) if (c.type === 'ageUp') ageUps += 1;
    }
    expect(ageUps).toBeGreaterThan(0);
  });

  it('botlu maçlar uçtan uca: çağ atlanır, değişmezler korunur ve çağ geçiş tick\'leri artandır', () => {
    let reachedAge3 = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = newState(seed);
      s.sides[0].xp = 3000;
      s.sides[1].xp = 3000;
      s.sides[0].gold += 2000;
      s.sides[1].gold += 2000;
      const controllers = [createStackerBot(), createBasicBot()] as const;
      for (let t = 0; t < 6000 && s.outcome === null; t++) {
        const goldBefore: [number, number] = [s.sides[0].gold, s.sides[1].gold];
        const events = stepMatch(s, [], controllers);
        expect(checkInvariants(s)).toEqual([]);
        expect(goldBalanceProblems(goldBefore, s, events)).toEqual([]);
      }
      for (const side of [0, 1] as const) {
        const ticks = s.sides[side].stats.ageUpTicks;
        expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
        if (s.sides[side].age >= 3) reachedAge3 += 1;
      }
    }
    expect(reachedAge3).toBeGreaterThan(0);
  });
});

describe('Yapılandırma sabitleri', () => {
  it('kuyruk üst sınırı çağ atlayınca değişmez', () => {
    const s = richState();
    for (let i = 0; i < ECONOMY.maxQueue; i++) step(s, [{ type: 'queueUnit', side: 0, unitId: 'primitive_front' }]);
    expect(s.sides[0].queue).toHaveLength(ECONOMY.maxQueue);
    const snapshot = clone(s.sides[0].queue);
    step(s, [AGE_UP(0)]);
    expect(s.sides[0].queue.map((o) => o.unitId)).toEqual(snapshot.map((o) => o.unitId));
  });
});
