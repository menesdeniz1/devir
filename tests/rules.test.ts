import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/data/world';
import { secToTicks } from '../src/sim/compile';
import { stateHash } from '../src/sim/hash';
import { step } from '../src/sim/step';
import { validate } from '../src/sim/validate';
import { stepMatch } from '../src/match/runner';
import type { Command, SimEvent } from '../src/sim/types';
import { addUnit, FRONT_ID, newState, spawnX, unitDef } from './helpers';
import { mustGetUnit } from '../src/sim/compile';

describe('Kural: zaman ve ekonomi', () => {
  it('secToTicks yukarı yuvarlar ve en az 1 döndürür', () => {
    expect(secToTicks(3)).toBe(60);
    expect(secToTicks(0.1)).toBe(2);
    expect(secToTicks(0.001)).toBe(1);
    expect(secToTicks(0.05)).toBe(1);
  });

  it('gelir tam saniyede, tamsayı olarak yazılır', () => {
    const s = newState();
    const start = s.sides[0].gold;
    for (let i = 0; i < WORLD.tickRate - 1; i++) {
      expect(step(s, [])).toEqual([]);
    }
    expect(s.sides[0].gold).toBe(start);
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'income')).toHaveLength(2);
    expect(s.sides[0].gold).toBe(start + 4);
    expect(s.sides[0].stats.goldEarned).toBe(4);
  });

  it('komutlar önce taraf 0, sonra taraf 1 uygulanır (verilen sıradan bağımsız)', () => {
    const s = newState();
    const events = step(s, [
      { type: 'queueUnit', side: 1, unitId: FRONT_ID },
      { type: 'queueUnit', side: 0, unitId: FRONT_ID },
    ]);
    const queued = events.filter((e) => e.type === 'unitQueued').map((e) => (e.type === 'unitQueued' ? e.side : -1));
    expect(queued).toEqual([0, 1]);
  });
});

describe('Kural: üretim ve doğma', () => {
  it('birlik üretim süresi dolunca üssün önünde doğar (taraf 0 solda, taraf 1 sağda)', () => {
    const s = newState();
    const build = mustGetUnit(FRONT_ID).buildTicks;
    step(s, [
      { type: 'queueUnit', side: 0, unitId: FRONT_ID },
      { type: 'queueUnit', side: 1, unitId: FRONT_ID },
    ]);
    for (let i = 1; i < build - 1; i++) step(s, []);
    expect(s.units).toHaveLength(0);
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'unitSpawned')).toHaveLength(2);
    const [a, b] = s.units;
    // Doğduğu adımda hareket de eder (üretimden sonra hareket aşaması gelir).
    const speed = mustGetUnit(FRONT_ID).speedPerTick;
    expect(a!.x).toBeCloseTo(spawnX(0) + speed);
    expect(b!.x).toBeCloseTo(spawnX(1) - speed);
    expect(s.sides[0].queue).toHaveLength(0);
    expect(s.sides[0].stats.produced[FRONT_ID]).toBe(1);
  });

  it('düşman birliği doğmayı engellemez', () => {
    const s = newState();
    s.sides[0].queue.push({ unitId: FRONT_ID, progressTicks: mustGetUnit(FRONT_ID).buildTicks - 1, paid: 50 });
    addUnit(s, 1, spawnX(0) + 20, { hp: 1e9 });
    step(s, []);
    expect(s.units.filter((u) => u.side === 0)).toHaveLength(1);
  });
});

describe('Kural: hareket', () => {
  it('yalnız birlik hız/tick kadar ilerler', () => {
    const s = newState();
    const u = addUnit(s, 0, 300);
    step(s, []);
    expect(u.x).toBeCloseTo(300 + mustGetUnit(FRONT_ID).speedPerTick);
    expect(u.mode).toBe('walk');
    const v = addUnit(s, 1, 1500);
    step(s, []);
    expect(v.x).toBeCloseTo(1500 - mustGetUnit(FRONT_ID).speedPerTick);
  });

  it('öndeki dost birlik yolu kapatınca arkadaki bekler, aralık korunur', () => {
    const s = newState();
    const w = unitDef().width;
    const front = addUnit(s, 0, 500);
    addUnit(s, 1, 500 + w + 5, { hp: 1e9 }); // front ile temas
    const back = addUnit(s, 0, 500 - w - WORLD.friendlyGap);
    const backX = back.x;
    step(s, []);
    expect(front.mode).toBe('attack');
    expect(back.mode).toBe('wait');
    expect(back.x).toBe(backX);
  });

  it('birlik rakip üssünün ön yüzünü aşmaz ve üsse saldırır', () => {
    const s = newState();
    const w = unitDef().width;
    const faceX = WORLD.worldWidth - WORLD.baseWidth;
    const u = addUnit(s, 0, faceX - w / 2 - 1);
    const events = step(s, []);
    expect(u.x + w / 2).toBeLessThanOrEqual(faceX + 1e-9);
    expect(u.mode).toBe('attack');
    expect(events.some((e) => e.type === 'baseDamaged' && e.side === 1 && e.amount === unitDef().damage)).toBe(true);
    expect(s.sides[1].baseHp).toBe(s.sides[1].baseMaxHp - unitDef().damage);
    expect(s.sides[0].stats.baseDamageDealt).toBe(unitDef().damage);
  });
});

describe('Kural: doğrulama', () => {
  it('yetersiz altın, bilinmeyen birlik ve kullanılamayan çağ nedenleri', () => {
    const s = newState();
    s.sides[0].gold = 10;
    expect(validate(s, { type: 'queueUnit', side: 0, unitId: FRONT_ID })).toEqual({
      ok: false,
      reason: 'notEnoughGold',
      missingGold: unitDef().cost - 10,
    });
    expect(validate(s, { type: 'queueUnit', side: 0, unitId: 'x' })).toEqual({ ok: false, reason: 'unknownUnit' });
    expect(validate(s, { type: 'cancelOrder', side: 0, index: 0 })).toEqual({ ok: false, reason: 'noSuchOrder' });
  });

  it('K-01: reddedilen komut durumu değiştirmez', () => {
    const s = newState();
    s.sides[0].gold = 10;
    const before = stateHash(s);
    const events = step(s, [{ type: 'queueUnit', side: 0, unitId: FRONT_ID }]);
    expect(events[0]).toMatchObject({ type: 'commandRejected', reason: 'notEnoughGold' });
    // Tick dışında hiçbir şey değişmedi.
    s.tick = 0;
    expect(stateHash(s)).toBe(before);
  });
});

describe('Bozuk komut sağlamlığı', () => {
  const bad: [string, unknown][] = [
    ['bilinmeyen tür', { type: 'foo', side: 0 }],
    ['tür yok', { side: 0 }],
    ['taraf 2', { type: 'queueUnit', side: 2, unitId: FRONT_ID }],
    ['taraf -1', { type: 'cancelOrder', side: -1, index: 1 }],
    ['taraf metin', { type: 'queueUnit', side: '0', unitId: FRONT_ID }],
    ['taraf yok', { type: 'queueUnit', unitId: FRONT_ID }],
    ['unitId yok', { type: 'queueUnit', side: 0 }],
    ['unitId sayı', { type: 'queueUnit', side: 0, unitId: 5 }],
    ['index yok', { type: 'cancelOrder', side: 1 }],
    ['index metin', { type: 'cancelOrder', side: 1, index: '1' }],
    ['boş nesne', {}],
    ['null', null],
    ['undefined', undefined],
    ['sayı', 42],
    ['metin', 'queueUnit'],
    ['dizi', []],
  ];

  it('validate bozuk girdilerin hiçbirinde istisna fırlatmaz ve invalidCommand döndürür', () => {
    const s = newState();
    for (const [name, cmd] of bad) {
      expect(() => validate(s, cmd as Command), name).not.toThrow();
      expect(validate(s, cmd as Command), name).toEqual({ ok: false, reason: 'invalidCommand' });
    }
    // Sonuç belirlenmiş olsa bile bozuk komutun nedeni değişmez.
    s.outcome = { kind: 'draw', tick: 1 };
    expect(validate(s, { type: 'foo', side: 0 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
  });

  it('step bozuk komutu commandRejected ile reddeder, durum karması değişmez, istisna yok', () => {
    for (const [name, cmd] of bad) {
      const s = newState();
      s.sides[0].gold = 500;
      const reference = newState();
      reference.sides[0].gold = 500;
      let events: SimEvent[] = [];
      expect(() => {
        events = step(s, [cmd as Command]);
      }, name).not.toThrow();
      step(reference, []);
      const rejected = events.filter((e) => e.type === 'commandRejected');
      expect(rejected, name).toHaveLength(1);
      expect(rejected[0], name).toMatchObject({ type: 'commandRejected', reason: 'invalidCommand' });
      // Boş komut listesiyle aynı adım: bozuk komut hiçbir etki bırakmamıştır.
      expect(stateHash(s), name).toBe(stateHash(reference));
    }
  });

  it('bozuk komut geçerli komutların uygulanmasını engellemez; sıra: geçerli komutlar, sonra reddedilenler', () => {
    const s = newState();
    const events = step(s, [
      { type: 'foo', side: 0 } as unknown as Command,
      { type: 'queueUnit', side: 1, unitId: FRONT_ID },
      { type: 'queueUnit', side: 2, unitId: FRONT_ID } as unknown as Command,
      { type: 'queueUnit', side: 0, unitId: FRONT_ID },
    ]);
    expect(events.map((e) => e.type).filter((t) => t === 'unitQueued' || t === 'commandRejected')).toEqual([
      'unitQueued',
      'unitQueued',
      'commandRejected',
      'commandRejected',
    ]);
    expect(s.sides[0].queue).toHaveLength(1);
    expect(s.sides[1].queue).toHaveLength(1);
  });

  it('stepMatch dış bozuk komutları da sessizce atmaz', () => {
    const s = newState();
    const events = stepMatch(s, [{ type: 'queueUnit', side: 2, unitId: FRONT_ID } as unknown as Command, { type: 'foo', side: 1 } as unknown as Command], [null, null]);
    expect(events.filter((e) => e.type === 'commandRejected' && e.reason === 'invalidCommand')).toHaveLength(2);
  });
});

describe('matchEnded olayı', () => {
  it('olaydaki sonuç state.outcome ile nesne paylaşmaz; olayı değiştirmek duruma ve karmaya sızmaz', () => {
    const s = newState();
    s.sides[1].baseHp = 10;
    addUnit(s, 0, WORLD.worldWidth - WORLD.baseWidth - unitDef().width / 2);
    const events = step(s, []);
    const ended = events.find((e) => e.type === 'matchEnded');
    expect(ended).toBeDefined();
    if (ended?.type !== 'matchEnded') throw new Error('matchEnded yok');
    expect(ended.outcome).toEqual(s.outcome);
    expect(ended.outcome).not.toBe(s.outcome);
    const hash = stateHash(s);
    const snapshot = JSON.stringify(s.outcome);
    (ended.outcome as { tick: number }).tick = 9999;
    ended.outcome = { kind: 'draw', tick: 5 };
    expect(JSON.stringify(s.outcome)).toBe(snapshot);
    expect(stateHash(s)).toBe(hash);
  });
});
