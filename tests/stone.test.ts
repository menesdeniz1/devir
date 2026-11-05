import { describe, expect, it } from 'vitest';
import { createBasicBot } from '../src/ai/basicBot';
import { createRandomBot, createStackerBot } from '../src/ai/testBots';
import { AGES } from '../src/data/ages';
import { STONE } from '../src/data/stone';
import { WORLD } from '../src/data/world';
import { stepMatch } from '../src/match/runner';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import { checkInvariants } from '../src/sim/invariants';
import { step } from '../src/sim/step';
import type { GameState, SideId, SimEvent } from '../src/sim/types';
import { addUnit, newState, setAge, ZONE_MID_X } from './helpers';

/** Birliği bölgenin içinde sabit tutar (kendi hareketi sıfırlanır) ve bir adım ilerletir. */
function stepHolding(s: GameState, held: { unit: { x: number }; x: number }[]): SimEvent[] {
  for (const h of held) h.unit.x = h.x;
  return step(s, []);
}

describe('Sınır Taşı verisi', () => {
  it('bölge koridorun ortasındadır ve sayaç sınırı veriden gelir (100 tick = 5 sn)', () => {
    expect(STONE.zoneStart).toBeLessThan(STONE.zoneEnd);
    expect(STONE.zoneStart).toBeGreaterThan(WORLD.baseWidth);
    expect(STONE.zoneEnd).toBeLessThan(WORLD.worldWidth - WORLD.baseWidth);
    expect(STONE.counterMax).toBe(100);
    expect(STONE.counterMax / WORLD.tickRate).toBe(5);
  });
});

describe('E-10 / GDD §8: Sınır Taşı ele geçirme', () => {
  it('başlangıç: sayaç 0, sahip yok', () => {
    const s = newState();
    expect(s.stone).toEqual({ counter: 0, owner: null });
  });

  it('tarafsızdan 100 tick\'te ele geçirme: 99. tick\'te sahip yok, 100. tick\'te sahip ve stoneCaptured olayı', () => {
    for (const side of [0, 1] as SideId[]) {
      const s = newState();
      const unit = addUnit(s, side, ZONE_MID_X);
      const held = [{ unit, x: ZONE_MID_X }];
      const captured: SimEvent[] = [];
      for (let i = 1; i <= STONE.counterMax; i++) {
        captured.push(...stepHolding(s, held).filter((e) => e.type === 'stoneCaptured'));
        expect(s.stone.counter).toBe(side === 0 ? i : -i);
        if (i < STONE.counterMax) expect(s.stone.owner).toBeNull();
      }
      expect(s.stone.owner).toBe(side);
      expect(captured).toEqual([{ type: 'stoneCaptured', side }]);
      // Sınırda durur; daha fazla artmaz ve olay tekrarlanmaz.
      const more = stepHolding(s, held);
      expect(Math.abs(s.stone.counter)).toBe(STONE.counterMax);
      expect(more.some((e) => e.type === 'stoneCaptured')).toBe(false);
    }
  });

  it('bölgeyle yalnızca gövdesi kesişen birlik sayılır (kenar dahil); dışarıdaki sayılmaz', () => {
    const s = newState();
    const half = 18; // primitive_front genişliğinin yarısı
    const stepPerTick = 3; // 60 birim/sn ÷ 20 tick/sn: birlik adım içinde ilerler, taş hareketten sonra bakar
    const unit = addUnit(s, 0, 0);
    // Adım sonunda ön kenar bölge başlangıcının 1 gerisinde: sayılmaz.
    unit.x = STONE.zoneStart - 1 - stepPerTick - half;
    step(s, []);
    expect(s.stone.counter).toBe(0);
    // Adım sonunda ön kenar tam bölge başlangıcında: kesişir.
    unit.x = STONE.zoneStart - stepPerTick - half;
    step(s, []);
    expect(s.stone.counter).toBe(1);
    // Adım sonunda arka kenar bölge bitişinin 1 ötesinde: sayılmaz.
    unit.x = STONE.zoneEnd + 1 + half - stepPerTick;
    step(s, []);
    expect(s.stone.counter).toBe(1);
    // Arka kenar tam bölge bitişinde: kesişir.
    unit.x = STONE.zoneEnd + half - stepPerTick;
    step(s, []);
    expect(s.stone.counter).toBe(2);
  });

  it('iki taraf da bölgedeyken sayaç donar; olay ve sahiplik değişmez', () => {
    const s = newState();
    const a = addUnit(s, 0, ZONE_MID_X - 60);
    const b = addUnit(s, 1, ZONE_MID_X + 60);
    s.stone.counter = 37;
    for (let i = 0; i < 50; i++) {
      const events = stepHolding(s, [
        { unit: a, x: ZONE_MID_X - 60 },
        { unit: b, x: ZONE_MID_X + 60 },
      ]);
      expect(events.some((e) => e.type === 'stoneCaptured' || e.type === 'stoneLost')).toBe(false);
    }
    expect(s.stone).toEqual({ counter: 37, owner: null });
  });

  it('bölge boşken sayaç ve sahiplik sabit kalır', () => {
    const s = newState();
    s.stone.counter = -64;
    for (let i = 0; i < 80; i++) step(s, []);
    expect(s.stone).toEqual({ counter: -64, owner: null });
    s.stone.counter = STONE.counterMax;
    s.stone.owner = 0;
    for (let i = 0; i < 80; i++) step(s, []);
    expect(s.stone).toEqual({ counter: STONE.counterMax, owner: 0 });
  });

  it('sayaç sıfırı geçince sahiplik düşer (sıfırda hâlâ sahip); stoneLost bir kez; −100\'de rakip ele geçirir', () => {
    const s = newState();
    s.stone.counter = STONE.counterMax;
    s.stone.owner = 0;
    const enemy = addUnit(s, 1, ZONE_MID_X);
    const held = [{ unit: enemy, x: ZONE_MID_X }];
    let lostAt = -1;
    let capturedAt = -1;
    const lostEvents: SimEvent[] = [];
    for (let i = 1; i <= 2 * STONE.counterMax; i++) {
      const events = stepHolding(s, held);
      lostEvents.push(...events.filter((e) => e.type === 'stoneLost'));
      if (events.some((e) => e.type === 'stoneLost')) lostAt = i;
      if (events.some((e) => e.type === 'stoneCaptured')) capturedAt = i;
      if (s.stone.counter === 0) expect(s.stone.owner).toBe(0);
      expect(checkInvariants(s)).toEqual([]);
    }
    // 100 → 0 için 100 adım; −1'e inen 101. adımda sahiplik düşer.
    expect(lostAt).toBe(STONE.counterMax + 1);
    expect(lostEvents).toEqual([{ type: 'stoneLost', side: 0 }]);
    expect(capturedAt).toBe(2 * STONE.counterMax);
    expect(s.stone).toEqual({ counter: -STONE.counterMax, owner: 1 });
  });

  it('sayaç her zaman −counterMax..counterMax aralığında ve tamsayıdır', () => {
    const s = newState();
    const a = addUnit(s, 0, ZONE_MID_X);
    for (let i = 0; i < 300; i++) {
      stepHolding(s, [{ unit: a, x: ZONE_MID_X }]);
      expect(Number.isInteger(s.stone.counter)).toBe(true);
      expect(Math.abs(s.stone.counter)).toBeLessThanOrEqual(STONE.counterMax);
    }
  });
});

describe('GDD §8: Sınır Taşı bonusu', () => {
  it('bonus yalnız sahibe, sahibin çağına göre ve tamsayıdır; goldEarned içerir; deneyim de eklenir', () => {
    for (const ageDef of AGES) {
      for (const owner of [0, 1] as SideId[]) {
        const s = newState();
        setAge(s, owner, ageDef.age);
        setAge(s, owner === 0 ? 1 : 0, 1);
        s.stone.counter = owner === 0 ? STONE.counterMax : -STONE.counterMax;
        s.stone.owner = owner;
        const other = owner === 0 ? 1 : 0;
        const before = [s.sides[0].gold, s.sides[1].gold];
        const xpBefore = [s.sides[0].xp, s.sides[1].xp];
        const events: SimEvent[] = [];
        for (let t = 0; t < WORLD.tickRate; t++) events.push(...step(s, []));
        const gain = ageDef.incomePerSec + ageDef.stoneGoldPerSec;
        expect(s.sides[owner].gold - before[owner]!).toBe(gain);
        expect(s.sides[owner].xp - xpBefore[owner]!).toBe(ageDef.stoneXpPerSec);
        expect(s.sides[owner].stats.goldEarned).toBe(gain);
        expect(Number.isInteger(s.sides[owner].gold)).toBe(true);
        expect(Number.isInteger(s.sides[owner].xp)).toBe(true);
        // Diğer taraf yalnız temel gelir alır, deneyim kazanmaz.
        expect(s.sides[other].gold - before[other]!).toBe(AGES[0]!.incomePerSec);
        expect(s.sides[other].xp - xpBefore[other]!).toBe(0);
        expect(events.filter((e) => e.type === 'income')).toContainEqual({ type: 'income', side: owner, amount: gain });
      }
    }
  });

  it('sahip yokken (sayaç ±100 değilken) bonus yoktur', () => {
    const s = newState();
    s.stone.counter = 99;
    const before = s.sides[0].gold;
    for (let t = 0; t < WORLD.tickRate; t++) step(s, []);
    expect(s.sides[0].gold - before).toBe(AGES[0]!.incomePerSec);
    expect(s.sides[0].xp).toBe(0);
  });

  it('E-10: yalnız savunma yapan taraf bile taşla deneyim kazanabilir (saniyede stoneXpPerSec)', () => {
    const s = newState();
    s.stone.counter = STONE.counterMax;
    s.stone.owner = 0;
    for (let t = 0; t < 10 * WORLD.tickRate; t++) step(s, []);
    expect(s.sides[0].xp).toBe(10 * AGES[0]!.stoneXpPerSec);
  });
});

describe('Taş: oyun içi akış, determinizm ve kaydet-yükle', () => {
  function play(seed: number, ticks: number, reloadAt: number[]): { hash: string; ageUps: number; captures: number; losses: number } {
    let s = createMatch({ seed, opponent: 'none' });
    s.sides[0].gold += 1500;
    s.sides[1].gold += 1500;
    s.sides[0].xp = 2500;
    s.sides[1].xp = 2500;
    let controllers = [createStackerBot(), seed % 2 === 0 ? createRandomBot(seed, 1) : createBasicBot()] as const;
    let ageUps = 0;
    let captures = 0;
    let losses = 0;
    for (let t = 0; t < ticks; t++) {
      if (reloadAt.includes(t)) {
        s = JSON.parse(JSON.stringify(s)) as GameState;
        controllers = [createStackerBot(), seed % 2 === 0 ? createRandomBot(seed, 1) : createBasicBot()] as const;
      }
      const events = stepMatch(s, [], controllers);
      for (const e of events) {
        if (e.type === 'agedUp') ageUps += 1;
        if (e.type === 'stoneCaptured') captures += 1;
        if (e.type === 'stoneLost') losses += 1;
      }
      expect(checkInvariants(s)).toEqual([]);
    }
    return { hash: stateHash(s), ageUps, captures, losses };
  }

  it('K-07: ageUp ve taş içeren koşu aynı tohumda aynı karmayı verir; kaydet-yükle kesintisiz koşuyla aynıdır', () => {
    let ageUps = 0;
    let captures = 0;
    for (const seed of [41, 42, 43, 44]) {
      const a = play(seed, 5000, []);
      const b = play(seed, 5000, []);
      expect(a).toEqual(b);
      const reloaded = play(seed, 5000, [700, 2600, 4400]);
      expect(reloaded.hash).toBe(a.hash);
      ageUps += a.ageUps;
      captures += a.captures;
    }
    // Koşular gerçekten çağ atlama ve taş ele geçirme içerir.
    expect(ageUps).toBeGreaterThan(0);
    expect(captures).toBeGreaterThan(0);
  });

  it('durum düz JSON verisidir: taş ve çağ geçiş kayıtları dahil kaydet-yükle birebir aynıdır', () => {
    const s = newState();
    s.stone.counter = -STONE.counterMax;
    s.stone.owner = 1;
    s.sides[0].stats.ageUpTicks = [12, 99];
    expect(JSON.parse(JSON.stringify(s))).toStrictEqual(s);
  });
});
