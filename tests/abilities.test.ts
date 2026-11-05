import { describe, expect, it } from 'vitest';
import { createBasicBot } from '../src/ai/basicBot';
import { buildObservation } from '../src/ai/observation';
import { createRandomBot } from '../src/ai/testBots';
import { ABILITIES, ABILITY_RULES } from '../src/data/abilities';
import { AGES } from '../src/data/ages';
import { WORLD } from '../src/data/world';
import { stepMatch } from '../src/match/runner';
import { mustGetAbility, mustGetUnit, secToTicks } from '../src/sim/compile';
import { createMatch } from '../src/sim/create';
import { abilityArea, battlefieldBounds } from '../src/sim/geometry';
import { stateHash } from '../src/sim/hash';
import { checkInvariants, goldBalanceProblems, STALL_SECONDS, StallDetector } from '../src/sim/invariants';
import { step } from '../src/sim/step';
import type { Command, GameState, SideId, SimEvent } from '../src/sim/types';
import { validate } from '../src/sim/validate';
import { FRONT_ID, addUnit, clone, makeControllers, newState, setAge } from './helpers';

const FIELD = battlefieldBounds();
const TICK = WORLD.tickRate;

function ability(age: number) {
  return mustGetAbility(AGES[age - 1]!.abilityId);
}

/** Bekleme bitmiş, `age` çağında bir taraf. */
function readyState(age: number, side: SideId = 0): GameState {
  const s = newState();
  setAge(s, side, age);
  s.sides[side].abilityCooldown = 0;
  return s;
}

function castCmd(x: number, side: SideId = 0): Command {
  return { type: 'castAbility', side, x };
}

function cast(s: GameState, x: number, side: SideId = 0): SimEvent[] {
  return step(s, [castCmd(x, side)]);
}

function run(s: GameState, ticks: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) all.push(...step(s, []));
  return all;
}

/** Üsse saldıran, yerinde duran ağır birlik (savaş alanının sol ucunda; hareket etmez). */
function standingEnemy(s: GameState, x = 400, hp = 5000) {
  return addUnit(s, 1, x, { hp }, 'primitive_heavy');
}

describe('Y-04: bekleme süresi', () => {
  it('Y-04: maç başında iki tarafın beklemesi ABILITY_RULES.initialCooldownSec; tam o kadar adım sonra kullanılabilir', () => {
    const s = newState();
    const initial = secToTicks(ABILITY_RULES.initialCooldownSec);
    expect(s.sides[0].abilityCooldown).toBe(initial);
    expect(s.sides[1].abilityCooldown).toBe(initial);
    expect(s.zones).toEqual([]);
    expect(s.strikes).toEqual([]);
    for (let t = 0; t < initial; t++) {
      expect(validate(s, castCmd(900))).toEqual({ ok: false, reason: 'abilityCooldown', cooldownTicks: initial - t });
      step(s, []);
    }
    expect(s.sides[0].abilityCooldown).toBe(0);
    expect(validate(s, castCmd(900))).toEqual({ ok: true });
  });

  it('Y-04: kullanım sonrası bekleme yeteneğin tam beklemesine kurulur ve tam o kadar adım sonra yeniden kullanılabilir', () => {
    const s = readyState(1);
    const events = cast(s, 900);
    expect(events.some((e) => e.type === 'abilityCast')).toBe(true);
    const full = ability(1).cooldownTicks;
    // Kullanım adımı bekleme sayacını da bir azaltır: (full - 1) kaldı.
    expect(s.sides[0].abilityCooldown).toBe(full - 1);
    // Karşı tarafın beklemesi etkilenmez.
    expect(s.sides[1].abilityCooldown).toBe(secToTicks(ABILITY_RULES.initialCooldownSec) - 1);
    for (let k = 1; k < full; k++) {
      const v = validate(s, castCmd(900));
      expect(v, `adım ${k}`).toMatchObject({ ok: false, reason: 'abilityCooldown', cooldownTicks: full - k });
      step(s, []);
    }
    expect(validate(s, castCmd(900))).toEqual({ ok: true });
  });

  it('Y-04: bekleme sürerken komut reddedilir ve durumu değiştirmez (yalnız tick/sayaçlar ilerler)', () => {
    const s = newState();
    const events = cast(s, 900);
    expect(events[0]).toMatchObject({ type: 'commandRejected', reason: 'abilityCooldown' });
    expect(s.zones).toEqual([]);
    expect(s.strikes).toEqual([]);
    expect(events.some((e) => e.type === 'abilityCast')).toBe(false);
  });
});

describe('Y-02: alan ve kırpma', () => {
  it('Y-02: alan = merkez ± genişliğin yarısı; savaş alanı sınırlarına kırpılır; event kırpılmış alanı taşır', () => {
    const width = ability(1).def.width;
    const mid = readyState(1);
    const e1 = cast(mid, 900).find((e) => e.type === 'abilityCast');
    expect(e1).toMatchObject({ type: 'abilityCast', side: 0, abilityId: 'primitive_stampede', x0: 900 - width / 2, x1: 900 + width / 2 });

    const left = readyState(1);
    const e2 = cast(left, FIELD.x0 + 10).find((e) => e.type === 'abilityCast');
    expect(e2).toMatchObject({ x0: FIELD.x0, x1: FIELD.x0 + 10 + width / 2 });

    const right = readyState(1);
    const e3 = cast(right, FIELD.x1 - 30).find((e) => e.type === 'abilityCast');
    expect(e3).toMatchObject({ x0: FIELD.x1 - 30 - width / 2, x1: FIELD.x1 });

    expect(abilityArea(FIELD.x0, width)).toEqual({ x0: FIELD.x0, x1: FIELD.x0 + width / 2 });
    // Alan hiçbir zaman savaş alanının dışına taşmaz.
    for (const x of [FIELD.x0 - width / 2 + 1, FIELD.x0, 1000, FIELD.x1, FIELD.x1 + width / 2 - 1]) {
      const a = abilityArea(x, width)!;
      expect(a.x0).toBeGreaterThanOrEqual(FIELD.x0);
      expect(a.x1).toBeLessThanOrEqual(FIELD.x1);
      expect(a.x0).toBeLessThanOrEqual(a.x1);
    }
  });

  it('Y-02: kullanılan alan durumdaki bölge/vuruş kaydında da kırpılmış tutulur (x0 ≤ x1, savaş alanı içinde)', () => {
    const s = readyState(2);
    cast(s, FIELD.x0 - 20);
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0]!.x0).toBe(FIELD.x0);
    expect(s.zones[0]!.x1).toBe(FIELD.x0 - 20 + ability(2).def.width / 2);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('Y-02/doğrulama sırası: sonlu olmayan x ve savaş alanıyla kesişmeyen alan invalidCommand; sonuçtan ve beklemeden önce gelir', () => {
    const s = newState(); // bekleme sürüyor
    for (const x of [Number.NaN, Infinity, -Infinity, FIELD.x0 - 1000, FIELD.x1 + 1000]) {
      expect(validate(s, castCmd(x)), String(x)).toEqual({ ok: false, reason: 'invalidCommand' });
    }
    expect(validate(s, { type: 'castAbility', side: 0, x: '900' as unknown as number })).toEqual({ ok: false, reason: 'invalidCommand' });
    expect(validate(s, { type: 'castAbility', side: 0 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
    expect(validate(s, { type: 'castAbility', side: 2, x: 900 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
    // Bitmiş maçta bile bozuk komut invalidCommand'dır; geçerli komut matchOver; sıra: invalid → matchOver → cooldown.
    s.outcome = { kind: 'draw', tick: 0 };
    expect(validate(s, castCmd(Number.NaN))).toEqual({ ok: false, reason: 'invalidCommand' });
    expect(validate(s, castCmd(900))).toEqual({ ok: false, reason: 'matchOver' });
  });

  it('Y-02: kenar çizgisinde (alan sınırı) gövdesi temas eden birlik etkilenir, gerisindeki etkilenmez', () => {
    const s = readyState(1);
    const w = mustGetUnit(FRONT_ID).def.width;
    const x1 = 900 + ability(1).def.width / 2;
    const inside = addUnit(s, 1, x1 + w / 2 - 0.5, {}); // gövdesi alana 0,5 girer
    const outside = addUnit(s, 1, x1 + w / 2 + 40, {}); // tamamen dışında
    cast(s, 900);
    expect(inside.hp).toBe(mustGetUnit(FRONT_ID).def.hp - ability(1).def.impactDamage!);
    expect(outside.hp).toBe(mustGetUnit(FRONT_ID).def.hp);
  });
});

describe('K-12: yetenek üsse ve dost birliklere zarar vermez; kullanılabilirlik', () => {
  it('K-12: her çağın yeteneği alandaki dost birliğe ve iki üsse zarar vermez; alandaki düşman etkilenir, alan dışındaki etkilenmez', () => {
    for (const a of ABILITIES) {
      const s = readyState(a.age);
      // Kimse saldırmasın (savaş yetenek etkisini bulandırmasın): tüm birliklerin saldırı sayacı çok yüksek.
      const quiet = { hp: 5000, cooldown: 100_000 };
      const friend = addUnit(s, 0, 1000, quiet, 'primitive_heavy');
      const foe = addUnit(s, 1, 1060, quiet, 'primitive_heavy');
      const farFoe = addUnit(s, 1, FIELD.x1 - 100, quiet, 'primitive_heavy');
      // Üs ön yüzüne yaslı bir düşman: alan üs ön yüzüne değse de üs etkilenmez.
      const nearBase = addUnit(s, 1, FIELD.x0 + 40, quiet, 'primitive_heavy');
      const bases = [s.sides[0].baseHp, s.sides[1].baseHp];
      const events = [...cast(s, 1030)];
      let foeAffected = false;
      const ticks = Math.max(secToTicks(a.delaySec ?? 0), ability(a.age).zoneTicks, ability(a.age).statusTicks) + 2;
      for (let t = 0; t < ticks; t++) {
        events.push(...step(s, []));
        foeAffected ||= foe.hp < 5000 || foe.stunTicks > 0 || foe.vulnTicks > 0;
        // Dost ve uzaktaki düşman hiçbir adımda etkilenmez.
        expect(friend.hp, `${a.id} dost can`).toBe(5000);
        expect([friend.stunTicks, friend.vulnTicks, friend.vulnPct], `${a.id} dost durum`).toEqual([0, 0, 0]);
        expect([farFoe.hp, farFoe.stunTicks, farFoe.vulnTicks], `${a.id} uzak düşman`).toEqual([5000, 0, 0]);
        expect([nearBase.hp, nearBase.stunTicks], `${a.id} üs yanındaki düşman alan dışında`).toEqual([5000, 0]);
      }
      expect(events.filter((e) => e.type === 'abilityImpact').length, a.id).toBeGreaterThan(0);
      foeAffected ||= foe.hp < 5000 || foe.stunTicks > 0 || foe.vulnTicks > 0;
      expect(foeAffected, `${a.id} alandaki düşman etkilendi`).toBe(true);
      expect([s.sides[0].baseHp, s.sides[1].baseHp], `${a.id} üsler`).toEqual(bases);
    }
  });

  it('K-12: üs ön yüzüne değen alan üsse hasar vermez ve üssü etkilemez; üs yanındaki düşman etkilenir', () => {
    for (const a of ABILITIES) {
      const s = readyState(a.age);
      const quiet = { hp: 5000, cooldown: 100_000 };
      const nearBase = addUnit(s, 1, FIELD.x0 + 40, quiet, 'primitive_heavy');
      const farBase = addUnit(s, 0, FIELD.x1 - 40, quiet, 'primitive_heavy');
      const bases = [s.sides[0].baseHp, s.sides[1].baseHp];
      cast(s, FIELD.x0); // sol üs ön yüzüne yaslı alan
      run(s, Math.max(secToTicks(a.delaySec ?? 0), ability(a.age).zoneTicks) + 2);
      expect([s.sides[0].baseHp, s.sides[1].baseHp], a.id).toEqual(bases);
      expect(nearBase.hp < 5000 || nearBase.stunTicks > 0 || nearBase.vulnTicks > 0, `${a.id} üs yanındaki düşman etkilendi`).toBe(true);
      expect(farBase.hp, a.id).toBe(5000);
    }
  });

  it('K-12: alanda yalnız dost birlik varsa vuruş/alan hiçbir şeye vurmaz (hits 0) ve hiçbir birliğin sayacı değişmez', () => {
    for (const a of ABILITIES) {
      const s = readyState(a.age);
      const friend = addUnit(s, 0, 1000, { hp: 900 }, 'primitive_heavy');
      const events = [...cast(s, 1000), ...run(s, secToTicks(a.delaySec ?? 0) + 25)];
      for (const e of events) if (e.type === 'abilityImpact') expect(e.hits, a.id).toBe(0);
      expect(friend.hp, a.id).toBe(900);
      expect(friend.stunTicks, a.id).toBe(0);
      expect(friend.vulnTicks, a.id).toBe(0);
    }
  });

  it('K-12: bitmiş maçta yetenek reddedilir ve hiçbir şey değişmez', () => {
    const s = readyState(1);
    s.outcome = { kind: 'win', winner: 1, tick: 5 };
    expect(validate(s, castCmd(900))).toEqual({ ok: false, reason: 'matchOver' });
    const before = stateHash(s);
    expect(step(s, [castCmd(900)])).toEqual([]);
    expect(stateHash(s)).toBe(before);
  });

  it('K-12: maçı bitiren adımda kullanılan komut kabul edilmez (bitmiş maç matchOver)', () => {
    const s = readyState(1);
    s.sides[1].baseHp = 1;
    addUnit(s, 0, WORLD.worldWidth - WORLD.baseWidth - 18 - 1, {}); // üsse saldıran birlik
    const events = step(s, []);
    expect(events.some((e) => e.type === 'matchEnded')).toBe(true);
    expect(validate(s, castCmd(900))).toEqual({ ok: false, reason: 'matchOver' });
  });

  it('K-12: çağ geçişi bekleme süresini sıfırlamaz; kalan = min(kalan, yeni yeteneğin beklemesi)', () => {
    const s = newState();
    s.sides[0].gold = 100_000;
    s.sides[0].xp = 100_000;
    run(s, 10);
    const left = s.sides[0].abilityCooldown;
    expect(left).toBeGreaterThan(0);
    step(s, [{ type: 'ageUp', side: 0 }]);
    expect(s.sides[0].age).toBe(2);
    // Kalan süre korunur (yeni yeteneğin tam beklemesinden küçük); yalnızca o adımın azaltması uygulanır.
    expect(s.sides[0].abilityCooldown).toBe(left - 1);

    // Yeni yeteneğin beklemesini aşan kalan süre kırpılır (min kuralı).
    const t = newState();
    t.sides[0].gold = 100_000;
    t.sides[0].xp = 100_000;
    t.sides[0].abilityCooldown = 100_000;
    step(t, [{ type: 'ageUp', side: 0 }]);
    expect(t.sides[0].abilityCooldown).toBe(ability(2).cooldownTicks - 1);

    // Hazırken çağ atlamak bekleme başlatmaz.
    const u = readyState(1);
    u.sides[0].gold = 100_000;
    u.sides[0].xp = 100_000;
    step(u, [{ type: 'ageUp', side: 0 }]);
    expect(u.sides[0].abilityCooldown).toBe(0);
    // Yetenek yeni çağın yeteneğidir.
    const events = cast(u, 900);
    expect(events.find((e) => e.type === 'abilityCast')).toMatchObject({ abilityId: 'ancient_fire_trench' });
  });

  it('K-12: yetenek taraf başına bağımsızdır; taraf 1 kullanınca taraf 0 birlikleri etkilenir, taraf 1 birlikleri etkilenmez', () => {
    const s = readyState(1, 1);
    const mine = addUnit(s, 1, 1000, { cooldown: 100_000 });
    const foe = addUnit(s, 0, 1000 - 40, { cooldown: 100_000 });
    const events = cast(s, 1000, 1);
    expect(events.find((e) => e.type === 'abilityCast')).toMatchObject({ side: 1, abilityId: 'primitive_stampede' });
    expect(foe.hp).toBe(mustGetUnit(FRONT_ID).def.hp - ability(1).def.impactDamage!);
    expect(foe.stunTicks).toBe(ability(1).statusTicks);
    expect(mine.hp).toBe(mustGetUnit(FRONT_ID).def.hp);
    expect(mine.stunTicks).toBe(0);
    expect(s.sides[0].abilityCooldown).toBe(secToTicks(ABILITY_RULES.initialCooldownSec) - 1);
  });
});

describe('Y-03: yetenek etkileri', () => {
  it('Y-03 Sürü Hücumu: alandaki düşmana anında hasar; 1 sn sersemletme (hareket yok, tam statusTicks adım)', () => {
    const s = readyState(1);
    const e = addUnit(s, 1, 1200, {});
    const out = addUnit(s, 1, 1200 + 400, {});
    const x1 = e.x;
    const events = cast(s, 1200);
    const impact = events.find((ev) => ev.type === 'abilityImpact');
    expect(impact).toMatchObject({ side: 0, abilityId: 'primitive_stampede', hits: 1 });
    // Hasar aynı adımda.
    expect(e.hp).toBe(mustGetUnit(FRONT_ID).def.hp - ability(1).def.impactDamage!);
    expect(e.stunTicks).toBe(secToTicks(1));
    const stunned = e.stunTicks;
    expect(stunned).toBe(TICK);
    const xAfterCast = e.x;
    expect(xAfterCast).toBeLessThan(x1); // kullanım adımında hareket etti (sersemleme sonraki adımdan başlar)
    for (let k = 0; k < stunned; k++) {
      step(s, []);
      expect(e.x, `sersemleme adımı ${k + 1}`).toBe(xAfterCast);
      expect(e.mode).toBe('wait');
    }
    expect(e.stunTicks).toBe(0);
    step(s, []);
    expect(e.x).toBeLessThan(xAfterCast);
    // Alan dışındaki etkilenmez.
    expect(out.hp).toBe(mustGetUnit(FRONT_ID).def.hp);
    expect(out.stunTicks).toBe(0);
  });

  it('Y-03 sersemleme: sersemlemiş birlik saldırmaz, saldırı sayacı azalmaz ve hedef olmaya devam eder', () => {
    const s = readyState(1);
    const friend = addUnit(s, 0, 854, {});
    const foe = addUnit(s, 1, 900, { hp: 5000 });
    // Düşmanın sayacını 7 yap: sersemleme boyunca 7 kalmalı.
    foe.cooldown = 7;
    friend.cooldown = 7;
    cast(s, 900);
    // Kullanım adımında düşman sayacı 6'ya indi (henüz sersem değildi).
    expect(foe.cooldown).toBe(6);
    expect(foe.stunTicks).toBe(TICK);
    const hpFriend = friend.hp;
    const foeHp = foe.hp;
    run(s, TICK);
    // Sersemleme bitti: düşman bu süre içinde saldırmadı, sayacı korundu.
    expect(foe.cooldown).toBe(6);
    expect(friend.hp).toBe(hpFriend);
    // Hedef olmaya devam etti: dost saldırdı.
    expect(foe.hp).toBeLessThan(foeHp);
    // Sersemleme bitince sayaç kaldığı yerden azalır ve saldırı olur.
    run(s, 7);
    expect(friend.hp).toBeLessThan(hpFriend);
  });

  it('Y-03 sersemleme yenilenir, üst üste binmez (aynı tür etki)', () => {
    const s = readyState(1);
    const e = addUnit(s, 1, 1200, { hp: 5000 });
    cast(s, 1200);
    run(s, 9);
    expect(e.stunTicks).toBe(TICK - 9);
    s.sides[0].abilityCooldown = 0;
    cast(s, 1200);
    expect(e.stunTicks).toBe(TICK); // 2·TICK değil: süre yenilendi
  });

  it('Y-03 Ateş Hendeği: 6 sn boyunca her saniyede bir 50 hasar; süre bitince zoneExpired ve kayıt silinir', () => {
    const s = readyState(2);
    const e = standingEnemy(s, 400, 5000);
    const outside = standingEnemy(s, 1500, 5000);
    const events = cast(s, 400);
    expect(s.zones).toHaveLength(1);
    const zoneTicks = ability(2).zoneTicks;
    expect(zoneTicks).toBe(6 * TICK);
    expect(s.zones[0]!.ticksLeft).toBe(zoneTicks - 1);
    const hits: number[] = [];
    let prev = e.hp;
    const all = [...events];
    for (let k = 1; k <= zoneTicks + 5; k++) {
      if (k > 1) all.push(...step(s, []));
      if (e.hp < prev) {
        // Yalnız yetenek hasarı: düşmanın kendi saldırı hasarı bu senaryoda yok (üsse vuruyor, birliğe değil).
        hits.push(k);
        expect(prev - e.hp).toBe(50);
      }
      prev = e.hp;
    }
    expect(hits).toEqual([20, 40, 60, 80, 100, 120]);
    expect(all.filter((ev) => ev.type === 'zoneExpired')).toHaveLength(1);
    expect(s.zones).toEqual([]);
    expect(e.hp).toBe(5000 - 6 * 50);
    expect(outside.hp).toBe(5000);
    // Saniyelik vuruşlar abilityImpact olarak bildirilir (altı kez, her biri 1 birlik).
    const impacts = all.filter((ev) => ev.type === 'abilityImpact');
    expect(impacts).toHaveLength(6);
    for (const ev of impacts) expect(ev).toMatchObject({ abilityId: 'ancient_fire_trench', hits: 1 });
  });

  it('Y-03 Ateş Hendeği: alana sonradan giren birlik de yanar, alandan çıkan yanmaz', () => {
    const s = readyState(2);
    const walker = addUnit(s, 1, 1000 + 110 + 18 + 60, { hp: 5000 }); // alanın dışında, sola yürüyecek
    cast(s, 1000);
    expect(s.zones).toHaveLength(1);
    // Yürüyüşle girer (3 px/tick): ~20 adım sonra gövdesi alana değer; ilk saniyelik vuruş adım 20'de.
    run(s, 59);
    expect(walker.hp).toBeLessThan(5000);
    expect(walker.hp % 50).toBe(0);
  });

  it('Y-03 Çivi Kapanı: alandaki düşman %50 yavaşlar; 40 hasar/sn; süre 10 sn', () => {
    const s = readyState(3);
    const e = addUnit(s, 1, 1200, { hp: 5000 });
    const free = addUnit(s, 1, 1700, { hp: 5000 });
    const speed = mustGetUnit(FRONT_ID).speedPerTick;
    cast(s, 1200);
    const x0 = e.x;
    const f0 = free.x;
    // Kullanım adımında yavaşlatma işlenir (alan adım 5'te): ilk adımdan itibaren yarı hız.
    expect(1200 - x0).toBeCloseTo(speed / 2, 9);
    expect(1700 - f0).toBeCloseTo(speed, 9);
    for (let k = 1; k <= 30; k++) {
      step(s, []);
      expect(e.x).toBeCloseTo(x0 - (k * speed) / 2, 6);
    }
    // Hasar: 20. ve 40. adımlarda 40'ar; 30 adımda bir vuruş yapılmış olmalı (adım 20).
    expect(e.hp).toBe(5000 - 40);
    run(s, 10); // adım 40
    expect(e.hp).toBe(5000 - 80);
    expect(ability(3).zoneTicks).toBe(10 * TICK);
  });

  it('Y-03 Çivi Kapanı: alandan çıkınca hız normale döner; alan süresi bitince yavaşlatma kalkar', () => {
    const s = readyState(3);
    const e = addUnit(s, 1, 1200, { hp: 100_000 });
    const speed = mustGetUnit(FRONT_ID).speedPerTick;
    cast(s, 1200);
    run(s, ability(3).zoneTicks);
    expect(s.zones).toEqual([]);
    const before = e.x;
    step(s, []);
    expect(before - e.x).toBeCloseTo(speed, 9);
  });

  it('Y-03 Baraj Ateşi: alan önceden kaydedilir; 1,5 sn sonra (kullanım adımı dahil 30. adımda) 1100 hasar; öncesinde hasar yok', () => {
    const s = readyState(4);
    const e = standingEnemy(s, 600, 20_000);
    const delay = secToTicks(1.5);
    expect(delay).toBe(30);
    const events = cast(s, 600);
    expect(s.strikes).toHaveLength(1);
    expect(s.strikes[0]).toMatchObject({ side: 0, abilityId: 'industrial_barrage', ticksLeft: delay - 1 });
    expect(events.some((ev) => ev.type === 'abilityImpact')).toBe(false);
    expect(e.hp).toBe(20_000);
    for (let k = 2; k < delay; k++) {
      const ev = step(s, []);
      expect(e.hp, `adım ${k}`).toBe(20_000);
      expect(ev.some((x) => x.type === 'abilityImpact')).toBe(false);
      expect(s.strikes).toHaveLength(1);
    }
    const last = step(s, []);
    expect(last.find((x) => x.type === 'abilityImpact')).toMatchObject({ side: 0, abilityId: 'industrial_barrage', hits: 1 });
    expect(e.hp).toBe(20_000 - 1100);
    expect(s.strikes).toEqual([]);
    // Gecikmeli vuruş tek seferliktir.
    run(s, 40);
    expect(e.hp).toBe(20_000 - 1100);
  });

  it('Y-03 Baraj Ateşi: patlama anında alandaki hedefler vurulur (alandan çıkan kurtulur, alana giren vurulur)', () => {
    const s = readyState(4);
    const half = ability(4).def.width / 2;
    const leaver = addUnit(s, 1, 1000 - half + 5 + 18, { hp: 5000 }); // alanın sol sınırına yakın, sola yürüyüp çıkar
    const comer = addUnit(s, 1, 1000 + half + 18 + 60, { hp: 5000 }); // alanın dışında, sola yürüyüp girer
    cast(s, 1000);
    run(s, 30 - 1);
    // 30 adım yürüdü: ~90 px.
    expect(leaver.x + 18).toBeLessThan(1000 - half);
    expect(comer.x - 18).toBeLessThanOrEqual(1000 + half);
    expect(leaver.hp).toBe(5000);
    expect(comer.hp).toBe(5000 - 1100);
  });

  it('Y-03 Durağanlık Alanı: 4 sn dondurma (hareket+saldırı yok) ve donmuşlar %30 fazla hasar alır; süre bitince normale döner', () => {
    const s = readyState(5);
    const friend = addUnit(s, 0, 854, {});
    const foe = addUnit(s, 1, 900, { hp: 5000 });
    const dmg = mustGetUnit(FRONT_ID).damageVs.front;
    const boosted = Math.round((dmg * 130) / 100);
    expect(boosted).toBe(26);
    const freezeTicks = ability(5).statusTicks;
    expect(freezeTicks).toBe(4 * TICK);
    const foeAttacks = (events: SimEvent[]) => events.filter((e) => e.type === 'attack' && e.attackerId === foe.id).length;
    let foeAttackCount = 0;
    const events = cast(s, 900);
    foeAttackCount += foeAttacks(events); // kullanım adımında dondurulmadan önce saldırdı
    expect(foe.stunTicks).toBe(freezeTicks);
    expect(foe.vulnTicks).toBe(freezeTicks);
    expect(foe.vulnPct).toBe(30);
    expect(friend.stunTicks).toBe(0);
    // Kullanım adımında dost 20 vurdu (henüz savunmasız değil).
    expect(foe.hp).toBe(5000 - dmg);
    const hits: number[] = [];
    let prev = foe.hp;
    for (let k = 2; k <= freezeTicks + 40; k++) {
      const ev = step(s, []);
      foeAttackCount += foeAttacks(ev);
      if (foe.hp < prev) hits.push(prev - foe.hp);
      prev = foe.hp;
    }
    // Dost her 20 adımda vurur: adım 21,41,61,81 savunmasız (26), sonrası 20.
    expect(hits.slice(0, 4)).toEqual([boosted, boosted, boosted, boosted]);
    expect(hits[4]).toBe(dmg);
    // Donmuş düşman 80 adım boyunca saldırmadı; kullanım adımındaki saldırısından sonra bir sonrakini dondurma bitince yaptı.
    expect(foeAttackCount).toBe(2);
    expect(foe.stunTicks).toBe(0);
    expect(foe.vulnTicks).toBe(0);
    expect(foe.vulnPct).toBe(0);
  });

  it('Y-03 savunmasızlık: hasar round(hasar × (100 + yüzde) / 100) tamsayıdır (yetenek hasarı dahil)', () => {
    const s = readyState(1);
    const e = addUnit(s, 1, 1200, { hp: 5000, vulnTicks: 5, vulnPct: 33 });
    cast(s, 1200);
    // hasar × 1,33, tamsayıya yuvarlanır (ör. 60 × 1,33 = 79,8 → 80)
    expect(5000 - e.hp).toBe(Math.round((ability(1).def.impactDamage! * 133) / 100));
    expect(Number.isInteger(e.hp)).toBe(true);
    run(s, 5);
    expect(e.vulnTicks).toBe(0);
    expect(e.vulnPct).toBe(0);
  });
});

describe('K-03 / Y-08: yeteneğin öldürdüğü birliğin ödülü bir kez verilir', () => {
  it('Y-08/K-03: yetenekle ölen birlik ödül verir; kill istatistiği yetenek kimliğine; ödül tek', () => {
    const s = readyState(1);
    // Vuruş hasarından az canlı kurban (veriden: tek vuruşta ölür).
    const victim = addUnit(s, 1, 1200, { hp: ability(1).def.impactDamage! - 10 });
    const def = mustGetUnit(FRONT_ID).def;
    const gold0 = s.sides[0].gold;
    const xp0 = s.sides[0].xp;
    const events = cast(s, 1200);
    expect(events.filter((e) => e.type === 'unitDied')).toHaveLength(1);
    expect(s.units.find((u) => u.id === victim.id)).toBeUndefined();
    expect(s.sides[0].gold - gold0).toBe(def.bountyGold);
    expect(s.sides[0].xp - xp0).toBe(def.bountyXp);
    expect(s.sides[0].stats.kills['primitive_stampede']).toBe(1);
    expect(s.sides[1].stats.lost[FRONT_ID]).toBe(1);
    expect(goldBalanceProblems([gold0, s.sides[1].gold], s, events).filter((p) => p.includes('taraf 0'))).toEqual([]);
  });

  it('K-03: aynı adımda birden çok yetenek vuruşu ve birlik saldırısı aynı birliği öldürse de ödül tek; kill ilk ölümcül vuruşa', () => {
    const s = readyState(1);
    // Vuruş hasarından az canlı kurban (veriden: tek vuruşta ölür).
    const victim = addUnit(s, 1, 1200, { hp: ability(1).def.impactDamage! - 10 });
    const friend = addUnit(s, 0, 1200 - 36 - 10, {});
    // İki gecikmesiz vuruş daha: aynı adımda patlar.
    const abilityDef = ability(1).def;
    for (let i = 0; i < 2; i++) {
      s.strikes.push({ id: s.nextId, side: 0, abilityId: abilityDef.id, x0: 1100, x1: 1300, ticksLeft: 0 });
      s.nextId += 1;
    }
    const gold0 = s.sides[0].gold;
    const events = step(s, []);
    expect(events.filter((e) => e.type === 'unitDied' && e.id === victim.id)).toHaveLength(1);
    expect(s.sides[0].gold - gold0 - incomeOf(events, 0)).toBe(mustGetUnit(FRONT_ID).def.bountyGold);
    // Dostun saldırısı (20) önce geldi (hp 80), ölümcül vuruş yetenek: kill yetenek kimliğine.
    expect(s.sides[0].stats.kills['primitive_stampede']).toBe(1);
    expect(s.sides[0].stats.kills[FRONT_ID]).toBe(0);
    expect(friend.hp).toBeLessThan(mustGetUnit(FRONT_ID).def.hp); // kurban da aynı adımda vurdu (eşzamanlı hasar)
  });

  it('Y-08: zorunlu gerçeklik — alan hasarıyla ölen birlik de ödül verir (Ateş Hendeği)', () => {
    const s = readyState(2);
    const victim = standingEnemy(s, 400, 100);
    const gold0 = s.sides[0].gold;
    const events = [...cast(s, 400), ...run(s, 60)];
    const died = events.filter((e) => e.type === 'unitDied');
    expect(died).toHaveLength(1);
    expect(s.units.find((u) => u.id === victim.id)).toBeUndefined();
    expect(s.sides[0].stats.kills['ancient_fire_trench']).toBe(1);
    const bounty = mustGetUnit('primitive_heavy').def.bountyGold;
    expect(s.sides[0].gold - gold0 - incomeOf(events, 0)).toBe(bounty);
  });
});

function incomeOf(events: readonly SimEvent[], side: SideId): number {
  return events.reduce((sum, e) => (e.type === 'income' && e.side === side ? sum + e.amount : sum), 0);
}

describe('R-03: gözlem', () => {
  it('R-03: etkin alanlar ve bekleyen vuruşlar iki taraf için görünür; kendi bekleme süresi görünür, karşı tarafınki değil', () => {
    const s = readyState(2);
    cast(s, 700);
    s.sides[1].age = 4;
    s.strikes.push({ id: s.nextId, side: 1, abilityId: 'industrial_barrage', x0: 1000, x1: 1200, ticksLeft: 12 });
    s.nextId += 1;
    for (const side of [0, 1] as const) {
      const obs = buildObservation(s, side);
      expect(obs.zones).toEqual(s.zones);
      expect(obs.strikes).toEqual(s.strikes);
      expect(obs.zones[0]!.side).toBe(0);
      expect(obs.strikes[0]!.side).toBe(1);
      expect(obs.self.abilityCooldown).toBe(s.sides[side].abilityCooldown);
      expect(JSON.stringify(obs.enemy)).not.toContain('abilityCooldown');
      expect(Object.keys(obs.enemy).sort()).toEqual(['age', 'baseHp', 'baseMaxHp', 'slots']);
    }
    // Gözlem derin kopyadır: değiştirmek duruma sızmaz.
    const obs = buildObservation(s, 0);
    obs.zones[0]!.ticksLeft = 9999;
    obs.strikes[0]!.x0 = -5;
    expect(s.zones[0]!.ticksLeft).not.toBe(9999);
    expect(s.strikes[0]!.x0).toBe(1000);
  });
});

describe('Botlar: yetenek kullanımı', () => {
  it('basicBot: bekleme bitti ve bir alan genişliğinde ≥3 düşman varsa en kalabalık kümenin ortasına yetenek kullanır', () => {
    const s = readyState(1, 1);
    // Taraf 1 botu: taraf 0 birlikleri düşman. Küme: 3 birlik 1000..1100; tek birlik uzakta.
    addUnit(s, 0, 1000, {});
    addUnit(s, 0, 1050, {});
    addUnit(s, 0, 1100, {});
    addUnit(s, 0, 400, {});
    const bot = createBasicBot();
    const decision = bot.decide(buildObservation(s, 1), null, 0);
    const cast = decision.commands.find((c) => c.type === 'castAbility');
    expect(cast).toEqual({ type: 'castAbility', side: 1, x: 1050 });
  });

  it('basicBot: 2 düşman, kümelerin alan genişliğine sığmaması ya da bekleme sürmesi yetenek kullandırmaz', () => {
    const s = readyState(1, 1);
    addUnit(s, 0, 1000, {});
    addUnit(s, 0, 1050, {});
    expect(createBasicBot().decide(buildObservation(s, 1), null, 0).commands.some((c) => c.type === 'castAbility')).toBe(false);
    // Üç birlik ama genişlikten (240) uzakta dağınık.
    const t = readyState(1, 1);
    addUnit(t, 0, 500, {});
    addUnit(t, 0, 900, {});
    addUnit(t, 0, 1300, {});
    expect(createBasicBot().decide(buildObservation(t, 1), null, 0).commands.some((c) => c.type === 'castAbility')).toBe(false);
    // Bekleme sürüyor.
    const u = readyState(1, 1);
    u.sides[1].abilityCooldown = 5;
    addUnit(u, 0, 1000, {});
    addUnit(u, 0, 1010, {});
    addUnit(u, 0, 1020, {});
    expect(createBasicBot().decide(buildObservation(u, 1), null, 0).commands.some((c) => c.type === 'castAbility')).toBe(false);
  });

  it('basicBot: tam maçta yeteneği kullanır ve komutu doğrulamadan geçer (reddedilmez)', () => {
    let casts = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = createMatch({ seed, opponent: 'basic-bot' });
      s.sides[0].gold += 3000;
      const controllers = makeControllers('stacker-basic', seed);
      for (let t = 0; t < 8000 && s.outcome === null; t++) {
        for (const e of stepMatch(s, [], controllers)) {
          if (e.type === 'abilityCast' && e.side === 1) casts += 1;
          if (e.type === 'commandRejected' && e.command.side === 1) throw new Error(`bot komutu reddedildi: ${e.reason}`);
        }
      }
    }
    expect(casts).toBeGreaterThan(0);
  });

  it('randomBot: bekleme bitince savaş alanı içinde rastgele noktaya yetenek dener; bekleme sürerken de seyrek dener (ret yolu)', () => {
    const bot = createRandomBot(7, 0);
    let ready = 0;
    let early = 0;
    let memory: unknown = null;
    const s = newState(7);
    for (let t = 0; t < 4000; t++) {
      s.sides[0].abilityCooldown = t % 2 === 0 ? 0 : 50;
      const obs = buildObservation(s, 0);
      const r = bot.decide(obs, memory as never, t);
      memory = r.memory;
      for (const c of r.commands) {
        if (c.type !== 'castAbility') continue;
        expect(c.x).toBeGreaterThanOrEqual(FIELD.x0);
        expect(c.x).toBeLessThanOrEqual(FIELD.x1);
        if (t % 2 === 0) ready += 1;
        else early += 1;
      }
    }
    expect(ready).toBeGreaterThan(20);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(ready);
  });
});

describe('Determinizm ve kaydet-yükle: alan ve gecikmeli vuruş içeren koşu', () => {
  /** Taraf 0 ve 1'i 2. (ateş alanı) ve 4. çağa (gecikmeli vuruş) koyar; birlikleri yerleştirir. */
  function scenario(): GameState {
    const s = newState(11);
    setAge(s, 0, 2);
    setAge(s, 1, 4);
    s.sides[0].abilityCooldown = 0;
    s.sides[1].abilityCooldown = 0;
    addUnit(s, 0, 800, {}, 'ancient_front');
    addUnit(s, 0, 840, {}, 'ancient_ranged');
    addUnit(s, 1, 1100, {}, 'industrial_front');
    addUnit(s, 1, 1060, {}, 'industrial_ranged');
    return s;
  }

  function play(reloadAt: number[]): { hash: string; sawZone: boolean; sawStrike: boolean; casts: number } {
    let s = scenario();
    let sawZone = false;
    let sawStrike = false;
    let casts = 0;
    for (let t = 0; t < 400; t++) {
      if (reloadAt.includes(t)) s = JSON.parse(JSON.stringify(s)) as GameState;
      const cmds: Command[] = t === 3 ? [castCmd(950, 0)] : t === 5 ? [castCmd(900, 1)] : [];
      for (const e of step(s, cmds)) if (e.type === 'abilityCast') casts += 1;
      if (s.zones.length > 0) sawZone = true;
      if (s.strikes.length > 0) sawStrike = true;
    }
    return { hash: stateHash(s), sawZone, sawStrike, casts };
  }

  it('aynı koşu iki kez aynı karmayı verir; alan etkinken ve vuruş beklerken JSON kaydet-yükle sonucu değiştirmez', () => {
    const a = play([]);
    const b = play([]);
    expect(a.casts).toBe(2);
    expect(a.sawZone).toBe(true);
    expect(a.sawStrike).toBe(true);
    expect(b.hash).toBe(a.hash);
    // Tick 10: ateş alanı etkin (6 sn) ve baraj vuruşu bekliyor (30 adım); 7 ve 25 de.
    for (const at of [10, 7, 25, 36]) expect(play([at]).hash, `yükleme ${at}`).toBe(a.hash);
    expect(play([4, 8, 12, 20, 30, 40]).hash).toBe(a.hash);
  });

  it('kaydedilmiş durum alan ve vuruş kayıtlarını düz JSON olarak taşır', () => {
    const s = scenario();
    step(s, [castCmd(950, 0), castCmd(900, 1)]);
    expect(s.zones).toHaveLength(1);
    expect(s.strikes).toHaveLength(1);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(copy.zones).toEqual(s.zones);
    expect(copy.strikes).toEqual(s.strikes);
    expect(stateHash(copy)).toBe(stateHash(s));
    expect(checkInvariants(s)).toEqual([]);
  });

  it('tohumlu botlarla (yetenek kullanan) iki koşu aynı karmayı verir; yükleme noktaları sonucu değiştirmez', () => {
    const hashOf = (reloads: number[]): { hash: string; casts: number } => {
      let s = createMatch({ seed: 5, opponent: 'none' });
      s.sides[0].gold += 1500;
      s.sides[1].gold += 1500;
      s.sides[0].xp += 6000;
      s.sides[1].xp += 6000;
      let controllers = makeControllers('random-random', 5);
      let casts = 0;
      for (let t = 0; t < 3000; t++) {
        if (reloads.includes(t)) {
          s = JSON.parse(JSON.stringify(s)) as GameState;
          controllers = makeControllers('random-random', 5);
        }
        for (const e of stepMatch(s, [], controllers)) if (e.type === 'abilityCast') casts += 1;
      }
      return { hash: stateHash(s), casts };
    };
    const base = hashOf([]);
    expect(base.casts).toBeGreaterThan(3);
    expect(hashOf([]).hash).toBe(base.hash);
    expect(hashOf([700, 1500, 2200]).hash).toBe(base.hash);
  });
});

describe('Değişmezler ve soak: yetenek kullanan botlar', () => {
  it('soak: yetenek kullanan bot eşleşmelerinde değişmezler, altın korunumu ve kilitlenme dedektörü temiz; yetenek kullanıldı ve öldürdü', () => {
    let casts = 0;
    let rejects = 0;
    let abilityKills = 0;
    for (const [g, kind] of (['random-random', 'random-basic', 'stacker-random', 'stacker-basic'] as const).entries()) {
      for (let i = 0; i < 3; i++) {
        const seed = 800 + g * 10 + i;
        const s = createMatch({ seed, opponent: kind.endsWith('basic') ? 'basic-bot' : 'none' });
        s.sides[0].gold += 1200 * i;
        s.sides[1].gold += 1200 * i;
        s.sides[0].xp += 4000 * i;
        s.sides[1].xp += 4000 * i;
        const controllers = makeControllers(kind, seed);
        const stall = new StallDetector();
        for (let t = 0; t < 5000 && s.outcome === null; t++) {
          const goldBefore: [number, number] = [s.sides[0].gold, s.sides[1].gold];
          const events = stepMatch(s, [], controllers);
          for (const e of events) {
            if (e.type === 'abilityCast') casts += 1;
            if (e.type === 'commandRejected' && e.command.type === 'castAbility') rejects += 1;
          }
          expect(checkInvariants(s), `${kind} ${seed} tick ${s.tick}`).toEqual([]);
          expect(goldBalanceProblems(goldBefore, s, events), `${kind} ${seed} tick ${s.tick}`).toEqual([]);
          expect(stall.observe(s, events), `${kind} ${seed} kilitlenme`).toBe(false);
        }
        for (const side of s.sides) for (const a of ABILITIES) abilityKills += side.stats.kills[a.id] ?? 0;
      }
    }
    expect(casts).toBeGreaterThan(10);
    expect(rejects).toBeGreaterThan(0);
    expect(abilityKills).toBeGreaterThan(0);
  });

  it('değişmezler: bozuk yetenek durumu bildirilir (negatif sayaç, savaş alanı dışı alan, bilinmeyen kimlik)', () => {
    const s = newState();
    expect(checkInvariants(s)).toEqual([]);
    s.sides[0].abilityCooldown = -1;
    expect(checkInvariants(s).some((p) => p.includes('yetenek beklemesi'))).toBe(true);
    s.sides[0].abilityCooldown = 3;
    s.zones.push({ id: s.nextId, side: 0, abilityId: 'ancient_fire_trench', x0: 10, x1: 500, ticksLeft: 5 });
    s.nextId += 1;
    expect(checkInvariants(s).some((p) => p.includes('alan sınır dışı'))).toBe(true);
    s.zones[0]!.x0 = 600;
    s.zones[0]!.x1 = 500;
    expect(checkInvariants(s).some((p) => p.includes('alan sınır dışı'))).toBe(true);
    s.zones[0]!.x0 = 300;
    s.zones[0]!.abilityId = 'yok';
    expect(checkInvariants(s).some((p) => p.includes('bilinmeyen yetenek'))).toBe(true);
    s.zones.length = 0;
    const u = addUnit(s, 1, 1000, {});
    u.stunTicks = 1.5;
    u.vulnPct = 30;
    const problems = checkInvariants(s);
    expect(problems.some((p) => p.includes('sersemleme'))).toBe(true);
    expect(problems.some((p) => p.includes('savunmasızlık bitti'))).toBe(true);
  });

  it('TDD §3 ilerleme garantisi: sersemlemiş birlik kilitlenme dedektörü için süreli etkidir', () => {
    const s = newState();
    const u = addUnit(s, 0, 500, {});
    u.stunTicks = 100_000; // dedektörün süresinden uzun
    const limit = STALL_SECONDS * TICK;
    const d1 = new StallDetector();
    let tripped = false;
    for (let i = 0; i < limit + 5; i++) tripped = d1.observe(s, []);
    expect(tripped).toBe(false);
    u.stunTicks = 0;
    const d2 = new StallDetector();
    tripped = false;
    for (let i = 0; i < limit + 5; i++) tripped = d2.observe(s, []);
    expect(tripped).toBe(true);
  });

  it('createMatch: öldürme istatistiği anahtarlarında her yetenek kimliği vardır ve sıfırdır; birliklerde durum sayaçları 0', () => {
    const s = newState();
    for (const side of s.sides) for (const a of ABILITIES) expect(side.stats.kills[a.id]).toBe(0);
    const q = newState();
    q.sides[0].gold = 1000;
    run(q, 1);
    step(q, [{ type: 'queueUnit', side: 0, unitId: FRONT_ID }]);
    run(q, 200);
    const spawned = q.units.find((x) => x.side === 0);
    expect(spawned).toMatchObject({ stunTicks: 0, vulnTicks: 0, vulnPct: 0 });
    expect(clone(q.units).length).toBe(q.units.length);
  });
});
