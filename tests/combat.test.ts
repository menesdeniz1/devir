import { describe, expect, it } from 'vitest';
import { stepMatch } from '../src/match/runner';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import { mustGetUnit } from '../src/sim/compile';
import { rngFromSeed, rngInt } from '../src/sim/rng';
import { step } from '../src/sim/step';
import { validate } from '../src/sim/validate';
import type { Controller } from '../src/ai/controller';
import { createStackerBot } from '../src/ai/testBots';
import { checkInvariants, goldBalanceProblems, STALL_SECONDS, StallDetector } from '../src/sim/invariants';
import type { GameState, SideId, SimEvent } from '../src/sim/types';
import { WORLD } from '../src/data/world';
import { BOT_KINDS, FRONT_ID, addUnit, makeControllers, newState, spawnX, unitDef } from './helpers';

const FACE_1 = WORLD.worldWidth - WORLD.baseWidth;

describe('K-02: menzil ve saldırı aralığı', () => {
  it('K-02: saldırılar yalnız mesafe <= menzil iken olur ve ardışık saldırılar >= aralık tick aralıklıdır', () => {
    let attacks = 0;
    let baseAttacks = 0;
    const attackerTypes = new Set<string>();
    for (let g = 0; g < 24; g++) {
      const seed = 500 + g;
      const s = newState(seed);
      const rng = rngFromSeed(seed);
      const controllers = makeControllers(BOT_KINDS[g % BOT_KINDS.length]!, seed);
      if (g % 2 === 0) {
        s.sides[0].gold += 2000;
        s.sides[1].gold += 2000;
      }
      const lastAttack = new Map<number, number>();
      for (let t = 0; t < 4000 && s.outcome === null; t++) {
        if (rngInt(rng, 300) === 0) s.sides[rngInt(rng, 2) as SideId].gold += 500;
        const pre = new Map(s.units.map((u) => [u.id, { side: u.side, x: u.x, type: u.type }]));
        const tickBefore = s.tick;
        const events = stepMatch(s, [], controllers);
        for (const e of events) {
          if (e.type === 'unitSpawned') pre.set(e.id, { side: e.side, x: spawnX(e.side, e.unitType), type: e.unitType });
        }
        for (const e of events) {
          if (e.type !== 'attack') continue;
          attacks += 1;
          const a = pre.get(e.attackerId);
          expect(a).toBeDefined();
          // Her birlik kendi rolünün menzil ve aralığına uyar (menzilli/ağır dahil: mermi başlatma anı).
          const def = mustGetUnit(a!.type);
          attackerTypes.add(a!.type);
          const dir = a!.side === 0 ? 1 : -1;
          let gap: number;
          if (e.target === 'base') {
            baseAttacks += 1;
            const baseFace = a!.side === 0 ? FACE_1 : WORLD.baseWidth;
            gap = dir * (baseFace - (a!.x + (dir * def.def.width) / 2));
          } else {
            const target = pre.get(e.target);
            expect(target).toBeDefined();
            gap = dir * (target!.x - a!.x) - (def.def.width + mustGetUnit(target!.type).def.width) / 2;
          }
          expect(gap).toBeLessThanOrEqual(def.def.range + 1e-9);
          const last = lastAttack.get(e.attackerId);
          if (last !== undefined) expect(tickBefore - last).toBeGreaterThanOrEqual(def.attackIntervalTicks);
          lastAttack.set(e.attackerId, tickBefore);
        }
      }
    }
    expect(attacks).toBeGreaterThan(200);
    // Üç rol de saldırmış olmalı (mermili saldırılar da aynı menzil ve aralık kuralına uyar).
    // (Botlar çağ atlayabildiği için kontrol tür değil rol düzeyindedir.)
    expect([...new Set([...attackerTypes].map((type) => mustGetUnit(type).role))].sort()).toEqual(['front', 'heavy', 'ranged']);
    // Üsse saldırı yolu da gerçekten sınanmış olmalı (bu tohumlarda ölçülen ~180).
    expect(baseAttacks).toBeGreaterThan(50);
  });

  it('K-02: üsse yalnız menzil içindeyken, tam saldırı aralığında saldırılır', () => {
    const s = newState();
    const def = mustGetUnit(FRONT_ID);
    const unit = addUnit(s, 0, 1000);
    const ticks: number[] = [];
    for (let t = 0; t < 600 && ticks.length < 4; t++) {
      const gap = FACE_1 - (unit.x + def.def.width / 2);
      const events = step(s, []);
      for (const e of events) {
        if (e.type !== 'attack') continue;
        expect(e.target).toBe('base');
        expect(gap).toBeLessThanOrEqual(def.def.range + 1e-9);
        ticks.push(t);
      }
    }
    expect(ticks).toHaveLength(4);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBe(def.attackIntervalTicks);
  });

  it('K-02: menzil dışındaki birlik saldırmaz', () => {
    const s = newState();
    const w = unitDef().width;
    // Boşluk menzilden 1 birim fazla; ikisi de ilerleyip temas edene kadar saldırı olmamalı.
    addUnit(s, 0, 500);
    addUnit(s, 1, 500 + w + unitDef().range + 1);
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'attack')).toHaveLength(0);
  });
});

describe('K-03: ödül tekliği', () => {
  it('K-03: iki birlik aynı adımda aynı hedefi öldürürse ödül bir kez verilir', () => {
    const s = newState();
    const def = unitDef();
    const target = addUnit(s, 1, 1000, { hp: def.damage + 10 });
    // Her iki saldırgan da menzilde (üst üste yerleştirilmiş test senaryosu).
    addUnit(s, 0, 1000 - def.width - 5);
    addUnit(s, 0, 1000 - def.width - 5);
    const g = s.sides[0].gold;
    const xp = s.sides[0].xp;
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'attack' && e.target === target.id)).toHaveLength(2);
    expect(events.filter((e) => e.type === 'unitDied' && e.id === target.id)).toHaveLength(1);
    expect(s.sides[0].gold).toBe(g + def.bountyGold);
    expect(s.sides[0].xp).toBe(xp + def.bountyXp);
    expect(s.sides[0].stats.kills[FRONT_ID]).toBe(1);
    expect(s.sides[1].stats.lost[FRONT_ID]).toBe(1);
    expect(s.units.find((u) => u.id === target.id)).toBeUndefined();
    // Sonraki adımlarda tekrar ödül yok.
    step(s, []);
    step(s, []);
    expect(s.sides[0].gold).toBe(g + def.bountyGold);
    expect(s.sides[0].xp).toBe(xp + def.bountyXp);
  });

  it('K-03: iki birlik aynı adımda birbirini öldürür; her taraf ödülü bir kez alır (S-09)', () => {
    const s = newState();
    const def = unitDef();
    addUnit(s, 0, 1000 - def.width / 2 - 3, { hp: 5 });
    addUnit(s, 1, 1000 + def.width / 2 + 3, { hp: 5 });
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'unitDied')).toHaveLength(2);
    expect(s.units).toHaveLength(0);
    for (const side of [0, 1] as const) {
      expect(s.sides[side].gold).toBe(150 + def.bountyGold);
      expect(s.sides[side].xp).toBe(def.bountyXp);
      expect(s.sides[side].stats.lost[FRONT_ID]).toBe(1);
      expect(s.sides[side].stats.kills[FRONT_ID]).toBe(1);
    }
  });
});

describe('K-06 ve K-15: sonuç', () => {
  function winScenario(): GameState {
    const s = newState();
    s.sides[1].baseHp = 10;
    addUnit(s, 0, FACE_1 - unitDef().width / 2);
    return s;
  }

  it('K-06: sonuç bir kez yazılır; sonrasında ek adımlar durumu ve karmayı değiştirmez', () => {
    const s = winScenario();
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'matchEnded')).toHaveLength(1);
    expect(s.outcome).toEqual({ kind: 'win', winner: 0, tick: 1 });
    expect(s.sides[1].baseHp).toBe(0);
    const hash = stateHash(s);
    for (let i = 0; i < 50; i++) {
      const more = step(s, [{ type: 'queueUnit', side: 0, unitId: FRONT_ID }]);
      expect(more).toEqual([]);
    }
    expect(stateHash(s)).toBe(hash);
    expect(s.tick).toBe(1);
    expect(validate(s, { type: 'queueUnit', side: 0, unitId: FRONT_ID })).toEqual({ ok: false, reason: 'matchOver' });
    expect(validate(s, { type: 'cancelOrder', side: 1, index: 1 })).toEqual({ ok: false, reason: 'matchOver' });
  });

  it('K-06: sonuç belirlendikten sonra denetleyiciler çalışmaz', () => {
    const s = winScenario();
    let calls = 0;
    const counting: Controller = {
      id: 'sayac',
      decide() {
        calls += 1;
        return { commands: [], memory: null };
      },
    };
    stepMatch(s, [], [counting, counting]);
    const afterFirst = calls;
    expect(afterFirst).toBe(2);
    const hash = stateHash(s);
    stepMatch(s, [], [counting, counting]);
    expect(calls).toBe(afterFirst);
    expect(stateHash(s)).toBe(hash);
  });

  it('K-15: iki üs aynı adımda sıfırlanırsa beraberlik', () => {
    const s = newState();
    s.sides[0].baseHp = 10;
    s.sides[1].baseHp = 10;
    addUnit(s, 0, FACE_1 - unitDef().width / 2);
    addUnit(s, 1, WORLD.baseWidth + unitDef().width / 2);
    const events = step(s, []);
    expect(s.outcome).toEqual({ kind: 'draw', tick: 1 });
    expect(events.filter((e) => e.type === 'matchEnded')).toHaveLength(1);
    expect(s.sides[0].baseHp).toBe(0);
    expect(s.sides[1].baseHp).toBe(0);
  });

  it('K-15: üs canı azami değerden fazla düşmez (hasar fazlası kırpılır)', () => {
    const s = winScenario();
    const events = step(s, []);
    expect(events.find((e) => e.type === 'baseDamaged')).toEqual({ type: 'baseDamaged', side: 1, amount: 10 });
    expect(s.sides[0].stats.baseDamageDealt).toBe(10);
  });
});

describe('K-06: tam maç sonu', () => {
  it('K-06: pasif rakibe karşı oynanan maç biter; sonuç ve matchEnded tek, sonrasında karma sabit', () => {
    const s = createMatch({ seed: 1, opponent: 'none' });
    const controllers: [Controller, null] = [createStackerBot(), null];
    let ended = 0;
    let steps = 0;
    while (s.outcome === null && steps < 20 * 60 * WORLD.tickRate) {
      const events = stepMatch(s, [], controllers);
      ended += events.filter((e) => e.type === 'matchEnded').length;
      expect(checkInvariants(s)).toEqual([]);
      steps += 1;
    }
    expect(s.outcome).toMatchObject({ kind: 'win', winner: 0 });
    expect(s.outcome!.tick).toBe(s.tick);
    expect(s.sides[1].baseHp).toBe(0);
    expect(s.sides[0].stats.baseDamageDealt).toBe(s.sides[1].baseMaxHp);
    const hash = stateHash(s);
    for (let i = 0; i < 100; i++) ended += stepMatch(s, [], controllers).filter((e) => e.type === 'matchEnded').length;
    expect(ended).toBe(1);
    expect(stateHash(s)).toBe(hash);
  });
});

describe('K-05: ilerleme ve doğma bekletmesi', () => {
  function blockedSetup(): { s: GameState; blocker: ReturnType<typeof addUnit> } {
    const s = newState();
    s.sides[0].gold = 1000;
    const def = unitDef();
    // Doğma noktasında duran, düşmanla dövüşen (yerinden kıpırdamayan) dost birlik.
    const blocker = addUnit(s, 0, spawnX(0), { hp: 1e9 });
    addUnit(s, 1, spawnX(0) + def.width + 5, { hp: 1e9 });
    return { s, blocker };
  }

  it('K-05: doğma noktası doluyken tamamlanan sipariş bekler, sonraki başlamaz; alan açılınca doğar', () => {
    const { s, blocker } = blockedSetup();
    const build = mustGetUnit(FRONT_ID).buildTicks;
    step(s, [
      { type: 'queueUnit', side: 0, unitId: FRONT_ID },
      { type: 'queueUnit', side: 0, unitId: FRONT_ID },
    ]);
    for (let i = 0; i < build * 3; i++) step(s, []);
    expect(s.units.filter((u) => u.side === 0)).toHaveLength(1);
    expect(s.sides[0].queue).toHaveLength(2);
    expect(s.sides[0].queue[0]!.progressTicks).toBe(build);
    expect(s.sides[0].queue[1]!.progressTicks).toBe(0);
    // Bekleyen sipariş iptal edilemez.
    expect(validate(s, { type: 'cancelOrder', side: 0, index: 0 })).toEqual({ ok: false, reason: 'orderInProduction' });

    // Alan açılır → ertesi adımda doğar; sonraki sipariş o adımdan sonra başlar.
    s.units = s.units.filter((u) => u.id !== blocker.id);
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'unitSpawned')).toHaveLength(1);
    expect(s.sides[0].queue).toHaveLength(1);
    expect(s.sides[0].queue[0]!.progressTicks).toBe(0);
    step(s, []);
    expect(s.sides[0].queue[0]!.progressTicks).toBe(1);
  });

  it('K-05: dost birlik doğma bölgesinin hemen dışındaysa doğma engellenmez', () => {
    const s = newState();
    const def = unitDef();
    s.sides[0].queue.push({ unitId: FRONT_ID, progressTicks: mustGetUnit(FRONT_ID).buildTicks - 1, paid: 50 });
    // Arka kenar tam olarak ön yüz + genişlik + aralıkta: engellemez.
    addUnit(s, 0, WORLD.baseWidth + def.width + WORLD.friendlyGap + def.width / 2, { hp: 1e9 });
    addUnit(s, 1, WORLD.baseWidth + 2 * def.width + WORLD.friendlyGap + 5 + def.width / 2, { hp: 1e9 });
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'unitSpawned')).toHaveLength(1);
  });

  it('K-05: soak — rastgele maçlarda değişmezler korunur ve 30 sn boyunca hareket ve hasar yok durumu oluşmaz', () => {
    let finished = 0;
    let idleGames = 0;
    let idleFinished = 0;
    for (let g = 0; g < 60; g++) {
      const seed = 9000 + g;
      const s = createMatch({ seed, opponent: 'none' });
      const rng = rngFromSeed(seed + 1);
      s.sides[0].gold += rngInt(rng, 2500);
      s.sides[1].gold += rngInt(rng, 2500);
      // Her beşinci oyun pasif rakibe karşıdır: bu maçların hepsi bitmelidir (bitiş yolunu sınar).
      // Aynalı botlar arasındaki maçlar zaman aşımına uğrayabilir (GDD §10 aynalı takas).
      const idle = g % 5 === 4;
      const controllers: [Controller, Controller | null] = idle
        ? [createStackerBot(), null]
        : makeControllers(BOT_KINDS[g % BOT_KINDS.length]!, seed);
      if (idle) idleGames += 1;
      const stall = new StallDetector();
      for (let t = 0; t < 6000 && s.outcome === null; t++) {
        const goldBefore: [number, number] = [s.sides[0].gold, s.sides[1].gold];
        const events = stepMatch(s, [], controllers);
        expect(checkInvariants(s)).toEqual([]);
        expect(goldBalanceProblems(goldBefore, s, events)).toEqual([]);
        expect(stall.observe(s, events)).toBe(false);
      }
      if (s.outcome !== null) {
        finished += 1;
        if (idle) idleFinished += 1;
      }
    }
    expect(idleGames).toBe(12);
    expect(idleFinished).toBe(idleGames);
    expect(finished).toBeGreaterThanOrEqual(idleGames);
  });

  it('K-05: kilitlenme dedektörü gerçekten kilitlenmeyi yakalar, boş sahada saymaz', () => {
    const limit = STALL_SECONDS * WORLD.tickRate;
    const frozen = newState();
    addUnit(frozen, 0, 500);
    const d = new StallDetector();
    let tripped = -1;
    for (let i = 0; i < limit + 5; i++) {
      if (d.observe(frozen, [])) {
        tripped = i;
        break;
      }
    }
    // İlk gözlem birliği "yeni" sayar; ardından limit tick durağanlık gerekir.
    expect(tripped).toBe(limit);

    const empty = newState();
    const d2 = new StallDetector();
    for (let i = 0; i < limit * 2; i++) expect(d2.observe(empty, [])).toBe(false);
  });
});

describe('S-06: hedef önceliği', () => {
  /** Taraf 0 saldırganının olaylardaki hedefleri. */
  function attackTargets(events: SimEvent[], attackerId: number): (number | 'base')[] {
    return events.flatMap((e) => (e.type === 'attack' && e.attackerId === attackerId ? [e.target] : []));
  }

  it('S-06: menzilde hem düşman birliği hem rakip üs varken birlik hedeflenir', () => {
    const s = newState();
    const def = unitDef();
    // Saldırganın ön yüzü rakip üssüne değiyor (üs menzilde); düşman birliği de tam o noktada doğmuş (menzilde).
    const attacker = addUnit(s, 0, FACE_1 - def.width / 2, { hp: 1e9 });
    const enemy = addUnit(s, 1, spawnX(1), { hp: 1e9 });
    const events = step(s, []);
    expect(attackTargets(events, attacker.id)).toEqual([enemy.id]);
    expect(events.some((e) => e.type === 'attack' && e.attackerId === attacker.id && e.target === 'base')).toBe(false);
    expect(events.some((e) => e.type === 'baseDamaged')).toBe(false);
  });

  it('S-06: yalnız üs menzildeyken üs hedeflenir (karşıt kontrol)', () => {
    const s = newState();
    const attacker = addUnit(s, 0, FACE_1 - unitDef().width / 2, { hp: 1e9 });
    expect(attackTargets(step(s, []), attacker.id)).toEqual(['base']);
  });

  it('S-06: menzilde birden çok düşman varken en yakını hedeflenir (dizi sırasından bağımsız)', () => {
    const def = unitDef();
    const attackerX = 1000;
    const gapToX = (gap: number): number => attackerX + def.width + gap;
    for (const nearFirst of [true, false]) {
      const s = newState();
      const attacker = addUnit(s, 0, attackerX, { hp: 1e9 });
      // Aralarında çakışma olan elle kurulmuş durum: ikisi de menzilde (aralık 3 ve 10; menzil 12).
      const near = { x: gapToX(3), tag: 'yakın' };
      const far = { x: gapToX(10), tag: 'uzak' };
      const order = nearFirst ? [near, far] : [far, near];
      const ids = new Map<string, number>();
      for (const e of order) ids.set(e.tag, addUnit(s, 1, e.x, { hp: 1e9 }).id);
      expect(def.range).toBeGreaterThanOrEqual(10);
      const events = step(s, []);
      expect(attackTargets(events, attacker.id)).toEqual([ids.get('yakın')]);
    }
  });
});

describe('Değişmezler: yakalama gücü', () => {
  it('S-05: taraf 0 birliği taraf 1 birliğini tamamen geçmişse ihlal verir; normal sıralamada vermez', () => {
    const ok = newState();
    addUnit(ok, 0, 400);
    addUnit(ok, 1, 500);
    expect(checkInvariants(ok)).toEqual([]);

    const crossed = newState();
    addUnit(crossed, 0, 500);
    addUnit(crossed, 1, 400);
    const problems = checkInvariants(crossed);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes('geçti'))).toBe(true);

    // Yalnız bir tarafta birlik varsa kontrol uygulanmaz.
    const solo = newState();
    addUnit(solo, 0, 500);
    expect(checkInvariants(solo)).toEqual([]);
  });

  it('kuyrukta index >= 1 olan siparişin ilerlemesi 0 olmalı', () => {
    const s = newState();
    s.sides[0].queue.push({ unitId: FRONT_ID, progressTicks: 5, paid: 50 }, { unitId: FRONT_ID, progressTicks: 0, paid: 50 });
    expect(checkInvariants(s)).toEqual([]);
    s.sides[0].queue[1]!.progressTicks = 1;
    expect(checkInvariants(s).some((p) => p.includes('kuyruk sırası 1'))).toBe(true);
  });

  it('birlik bekleme süresi 0..saldırı aralığı dışına çıkarsa ihlal verir', () => {
    const interval = mustGetUnit(FRONT_ID).attackIntervalTicks;
    const s = newState();
    const u = addUnit(s, 0, 500, { cooldown: interval });
    expect(checkInvariants(s)).toEqual([]);
    u.cooldown = interval + 1;
    expect(checkInvariants(s).some((p) => p.includes('bekleme'))).toBe(true);
    u.cooldown = -1;
    expect(checkInvariants(s).some((p) => p.includes('bekleme'))).toBe(true);
  });

  it('üs canı 0 iken sonuç boşsa ihlal verir', () => {
    const s = newState();
    s.sides[1].baseHp = 0;
    expect(checkInvariants(s).some((p) => p.includes('sonuç belirlenmemiş'))).toBe(true);
    s.outcome = { kind: 'win', winner: 0, tick: 1 };
    expect(checkInvariants(s)).toEqual([]);
  });
});
