import { describe, expect, it } from 'vitest';
import { buildObservation } from '../src/ai/observation';
import { AGES } from '../src/data/ages';
import { DEFENSE, TOWERS } from '../src/data/towers';
import { WORLD } from '../src/data/world';
import { stepMatch } from '../src/match/runner';
import { mustGetTower, mustGetUnit, sellRefund } from '../src/sim/compile';
import { applyCommand } from '../src/sim/commands';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import { checkInvariants, goldBalanceProblems } from '../src/sim/invariants';
import { rngFromSeed, rngInt } from '../src/sim/rng';
import { step } from '../src/sim/step';
import type { Command, GameState, SideId, SimEvent, TowerState } from '../src/sim/types';
import { validate } from '../src/sim/validate';
import { FRONT_ID, TOWER_BOT_KINDS, addUnit, clone, makeControllers, newState, setAge } from './helpers';

const FAST = 'primitive_tower_fast';
const HEAVY = 'primitive_tower_heavy';
const BASE_FACE_0 = WORLD.baseWidth;

const unlock = (side: SideId, slot: number): Command => ({ type: 'unlockSlot', side, slot });
const build = (side: SideId, slot: number, towerId: string): Command => ({ type: 'buildTower', side, slot, towerId });
const sell = (side: SideId, slot: number): Command => ({ type: 'sellTower', side, slot });

/** Taraf 0'ın üs ön yüzünden `gap` uzakta (bakan kenar) duran taraf 1 birliği. */
function enemyAt(s: GameState, gap: number, type = FRONT_ID, overrides: { hp?: number } = {}) {
  const w = mustGetUnit(type).def.width;
  return addUnit(s, 1, BASE_FACE_0 + gap + w / 2, overrides, type);
}

function towerOf(s: GameState, side: SideId, slot: number): TowerState {
  const t = s.sides[side].slots[slot]!.tower;
  if (t === null) throw new Error('kule yok');
  return t;
}

/** Yuvaları doğrudan kurar (doğrulamasız): önek açık, kule yerleşik. */
function place(s: GameState, side: SideId, slot: number, type: string): void {
  for (let i = 0; i <= slot; i++) s.sides[side].slots[i]!.unlocked = true;
  s.sides[side].slots[slot]!.tower = { type, paid: mustGetTower(type).def.cost, cooldown: 0 };
}

function eventsOf<T extends SimEvent['type']>(events: SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

describe('Aşama 4: yuvalar ve veri', () => {
  it('createMatch: üç yuva, yalnız yuva 0 açık, kule yok; öldürme istatistiği kule kimliklerini de taşır', () => {
    const s = newState();
    for (const side of [0, 1] as const) {
      expect(s.sides[side].slots).toEqual([
        { unlocked: true, tower: null },
        { unlocked: false, tower: null },
        { unlocked: false, tower: null },
      ]);
      for (const t of TOWERS) expect(s.sides[side].stats.kills[t.id], t.id).toBe(0);
    }
    expect(DEFENSE.slotUnlockCosts).toEqual([0, 200, 500]);
  });

  it('veri: her çağın iki kulesi vardır (hızlı + ağır) ve kimlikler kule tablosunda bulunur', () => {
    for (const age of AGES) {
      expect(age.towerIds).toHaveLength(2);
      const kinds = age.towerIds.map((id) => mustGetTower(id).def.kind).sort();
      expect(kinds).toEqual(['fast', 'heavy']);
      for (const id of age.towerIds) expect(mustGetTower(id).def.age).toBe(age.age);
    }
  });
});

describe('K-01: yuva açma ve kule kurma bir kez ücretlenir', () => {
  it('K-01: yuva açma ücreti anında ve bir kez düşer; olay, istatistik ve altın korunumu tutar', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    const before = s.sides[0].gold;
    const events = step(s, [unlock(0, 1)]);
    expect(eventsOf(events, 'slotUnlocked')).toEqual([{ type: 'slotUnlocked', side: 0, slot: 1, paid: 200 }]);
    expect(s.sides[0].slots[1]!.unlocked).toBe(true);
    expect(s.sides[0].gold).toBe(before - 200);
    expect(s.sides[0].stats.goldSpent).toBe(200);
    step(s, []);
    step(s, []);
    expect(s.sides[0].gold).toBe(before - 200);
    // İkinci açma denemesi reddedilir ve altın değişmez.
    const again = step(s, [unlock(0, 1)]);
    expect(eventsOf(again, 'commandRejected')[0]).toMatchObject({ reason: 'slotAlreadyUnlocked' });
    expect(s.sides[0].gold).toBe(before - 200);
  });

  it('K-01: kule kurma ücreti anında ve bir kez düşer; kule ödenen fiyat ve sıfır bekleme ile yerleşir', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    const events = step(s, [build(0, 0, FAST)]);
    expect(eventsOf(events, 'towerBuilt')).toEqual([{ type: 'towerBuilt', side: 0, slot: 0, towerType: FAST, paid: 120 }]);
    expect(towerOf(s, 0, 0)).toMatchObject({ type: FAST, paid: 120 });
    expect(s.sides[0].gold).toBe(880);
    expect(s.sides[0].stats.goldSpent).toBe(120);
    step(s, []);
    expect(s.sides[0].gold).toBe(880);
    // Dolu yuvaya ikinci kurulum reddedilir.
    const again = step(s, [build(0, 0, HEAVY)]);
    expect(eventsOf(again, 'commandRejected')[0]).toMatchObject({ reason: 'slotOccupied' });
    expect(s.sides[0].gold).toBe(880);
  });

  it('K-01: bulanık test — rastgele kule komutları ve botlarla altın korunumu, değişmezler ve ret durumu değiştirmez', () => {
    let built = 0;
    let sold = 0;
    let unlocked = 0;
    let fired = 0;
    let rejected = 0;
    for (let g = 0; g < 40; g++) {
      const seed = 7000 + g;
      const s = createMatch({ seed, opponent: 'none' });
      const rng = rngFromSeed(seed);
      const controllers = makeControllers(g % 2 === 0 ? 'random-random' : 'random-basic', seed);
      for (let t = 0; t < 2500 && s.outcome === null; t++) {
        if (rngInt(rng, 80) === 0) s.sides[rngInt(rng, 2) as SideId].gold += rngInt(rng, 900);
        if (rngInt(rng, 200) === 0) s.sides[rngInt(rng, 2) as SideId].xp += rngInt(rng, 2500);
        const cmds: Command[] = [];
        if (rngInt(rng, 6) === 0) {
          const side = rngInt(rng, 2) as SideId;
          const slot = rngInt(rng, 5) - 1; // -1..3: geçersiz indeksler dahil
          const roll = rngInt(rng, 3);
          const ids = [...TOWERS.map((x) => x.id), 'no_such_tower'];
          if (roll === 0) cmds.push(unlock(side, slot));
          else if (roll === 1) cmds.push(build(side, slot, ids[rngInt(rng, ids.length)]!));
          else cmds.push(sell(side, slot));
        }
        for (const c of cmds) {
          if (!validate(s, c).ok) {
            const hash = stateHash(s);
            const sink: SimEvent[] = [];
            applyCommand(s, c, sink);
            expect(stateHash(s)).toBe(hash);
            expect(sink.map((e) => e.type)).toEqual(['commandRejected']);
            rejected += 1;
          }
        }
        const goldBefore: [number, number] = [s.sides[0].gold, s.sides[1].gold];
        const events = stepMatch(s, cmds, controllers);
        built += eventsOf(events, 'towerBuilt').length;
        sold += eventsOf(events, 'towerSold').length;
        unlocked += eventsOf(events, 'slotUnlocked').length;
        fired += eventsOf(events, 'towerFired').length;
        expect(checkInvariants(s)).toEqual([]);
        expect(goldBalanceProblems(goldBefore, s, events)).toEqual([]);
        for (const side of [0, 1] as const) expect(s.sides[side].gold).toBeGreaterThanOrEqual(0);
      }
    }
    expect(rejected).toBeGreaterThan(100);
    expect(built).toBeGreaterThan(30);
    expect(sold).toBeGreaterThan(5);
    expect(unlocked).toBeGreaterThan(15);
    expect(fired).toBeGreaterThan(30);
  });
});

describe('Doğrulama sıraları ve yuva sırası (PRD D-01, D-02)', () => {
  it('unlockSlot: invalidCommand → matchOver → noSuchSlot → slotAlreadyUnlocked → previousSlotLocked → notEnoughGold', () => {
    const s = newState();
    s.sides[0].gold = 0;
    expect(validate(s, { type: 'unlockSlot', side: 0, slot: 'x' } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
    expect(validate(s, { type: 'unlockSlot', side: 2, slot: 1 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
    expect(validate(s, unlock(0, -1))).toEqual({ ok: false, reason: 'noSuchSlot' });
    expect(validate(s, unlock(0, 3))).toEqual({ ok: false, reason: 'noSuchSlot' });
    expect(validate(s, unlock(0, 1.5))).toEqual({ ok: false, reason: 'noSuchSlot' });
    // Açık yuva, altın yokken bile slotAlreadyUnlocked.
    expect(validate(s, unlock(0, 0))).toEqual({ ok: false, reason: 'slotAlreadyUnlocked' });
    // Önceki kilitli yuva, altın yokken bile previousSlotLocked.
    expect(validate(s, unlock(0, 2))).toEqual({ ok: false, reason: 'previousSlotLocked' });
    expect(validate(s, unlock(0, 1))).toEqual({ ok: false, reason: 'notEnoughGold', missingGold: 200 });
    s.sides[0].gold = 199;
    expect(validate(s, unlock(0, 1))).toEqual({ ok: false, reason: 'notEnoughGold', missingGold: 1 });
    s.sides[0].gold = 200;
    expect(validate(s, unlock(0, 1))).toEqual({ ok: true });
    s.outcome = { kind: 'win', winner: 1, tick: 3 };
    expect(validate(s, unlock(0, 1))).toEqual({ ok: false, reason: 'matchOver' });
    // Bozuk komut, sonuç belirlenmiş olsa da invalidCommand.
    expect(validate(s, { type: 'unlockSlot', side: 0 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
  });

  it('buildTower: invalidCommand → matchOver → noSuchSlot → unknownTower → towerNotAvailable → slotLocked → slotOccupied → notEnoughGold', () => {
    const s = newState();
    s.sides[0].gold = 0;
    expect(validate(s, { type: 'buildTower', side: 0, slot: 0 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
    expect(validate(s, { type: 'buildTower', side: 0, slot: 0, towerId: 5 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
    // noSuchSlot, bilinmeyen kuleden önce gelir.
    expect(validate(s, build(0, 3, 'no_such_tower'))).toEqual({ ok: false, reason: 'noSuchSlot' });
    // unknownTower, kilitli yuvadan önce gelir.
    expect(validate(s, build(0, 1, 'no_such_tower'))).toEqual({ ok: false, reason: 'unknownTower' });
    // towerNotAvailable (başka çağın kulesi), kilitli yuvadan ve altın eksikliğinden önce gelir.
    expect(validate(s, build(0, 1, 'ancient_tower_fast'))).toEqual({ ok: false, reason: 'towerNotAvailable' });
    expect(validate(s, build(0, 0, 'ancient_tower_fast'))).toEqual({ ok: false, reason: 'towerNotAvailable' });
    // slotLocked, altın eksikliğinden önce gelir.
    expect(validate(s, build(0, 1, FAST))).toEqual({ ok: false, reason: 'slotLocked' });
    // slotOccupied, altın eksikliğinden önce gelir.
    place(s, 0, 0, FAST);
    expect(validate(s, build(0, 0, HEAVY))).toEqual({ ok: false, reason: 'slotOccupied' });
    s.sides[0].slots[0]!.tower = null;
    expect(validate(s, build(0, 0, FAST))).toEqual({ ok: false, reason: 'notEnoughGold', missingGold: 120 });
    s.sides[0].gold = 120;
    expect(validate(s, build(0, 0, FAST))).toEqual({ ok: true });
    s.outcome = { kind: 'draw', tick: 1 };
    expect(validate(s, build(0, 0, FAST))).toEqual({ ok: false, reason: 'matchOver' });
  });

  it('sellTower: invalidCommand → matchOver → noSuchSlot → slotEmpty', () => {
    const s = newState();
    expect(validate(s, { type: 'sellTower', side: 0 } as unknown as Command)).toEqual({ ok: false, reason: 'invalidCommand' });
    expect(validate(s, sell(0, 7))).toEqual({ ok: false, reason: 'noSuchSlot' });
    expect(validate(s, sell(0, 0))).toEqual({ ok: false, reason: 'slotEmpty' });
    place(s, 0, 0, FAST);
    expect(validate(s, sell(0, 0))).toEqual({ ok: true });
    s.outcome = { kind: 'win', winner: 0, tick: 9 };
    expect(validate(s, sell(0, 0))).toEqual({ ok: false, reason: 'matchOver' });
  });

  it('yuva sırası: yuvalar sırayla açılır (2, 1’den önce açılamaz); açma ücretleri 200 ve 500', () => {
    const s = newState();
    s.sides[0].gold = 5000;
    const events = step(s, [unlock(0, 2), unlock(0, 1), unlock(0, 2)]);
    expect(eventsOf(events, 'commandRejected').map((e) => e.reason)).toEqual(['previousSlotLocked']);
    expect(eventsOf(events, 'slotUnlocked').map((e) => [e.slot, e.paid])).toEqual([
      [1, 200],
      [2, 500],
    ]);
    expect(s.sides[0].slots.map((x) => x.unlocked)).toEqual([true, true, true]);
    expect(s.sides[0].gold).toBe(5000 - 700);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('kilitli yuvaya kule kurulamaz; açıldıktan sonra kurulabilir', () => {
    const s = newState();
    s.sides[0].gold = 5000;
    const first = step(s, [build(0, 1, FAST)]);
    expect(eventsOf(first, 'commandRejected')[0]).toMatchObject({ reason: 'slotLocked' });
    const second = step(s, [unlock(0, 1), build(0, 1, FAST)]);
    expect(eventsOf(second, 'towerBuilt')).toHaveLength(1);
    expect(towerOf(s, 0, 1).type).toBe(FAST);
  });

  it('değişmezler: kilitli yuvada kule, önek bozukluğu, sınır dışı sayaç ve geçersiz ödeme yakalanır', () => {
    const base = newState();
    expect(checkInvariants(base)).toEqual([]);
    const lockedWithTower = clone(base);
    lockedWithTower.sides[0].slots[1]!.tower = { type: FAST, paid: 120, cooldown: 0 };
    expect(checkInvariants(lockedWithTower).join('\n')).toContain('kilitli yuva 1');
    const gap = clone(base);
    gap.sides[1].slots[2]!.unlocked = true;
    expect(checkInvariants(gap).join('\n')).toContain('yuva 2 açık ama önceki kilitli');
    const cooldown = clone(base);
    place(cooldown, 0, 0, FAST);
    cooldown.sides[0].slots[0]!.tower!.cooldown = mustGetTower(FAST).attackIntervalTicks + 1;
    expect(checkInvariants(cooldown).join('\n')).toContain('kule sayacı sınır dışı');
    const paid = clone(base);
    place(paid, 0, 0, FAST);
    paid.sides[0].slots[0]!.tower!.paid = 0;
    expect(checkInvariants(paid).join('\n')).toContain('kule ödemesi geçersiz');
    const short = clone(base);
    short.sides[0].slots.pop();
    expect(checkInvariants(short).join('\n')).toContain('yuva sayısı');
  });
});

describe('K-02: kule yalnız menzildeki birliğe atar ve aralığa uyar', () => {
  it('K-02: bakan kenar mesafesi menzile eşitken atar, menzilden 0,5 fazlayken atmaz', () => {
    const range = mustGetTower(FAST).def.range;
    const near = newState();
    near.sides[0].gold = 1000;
    enemyAt(near, range, 'primitive_heavy');
    const nearEvents = step(near, [build(0, 0, FAST)]);
    expect(eventsOf(nearEvents, 'towerFired')).toEqual([{ type: 'towerFired', side: 0, slot: 0, towerType: FAST, target: near.units[0]!.id }]);
    expect(eventsOf(nearEvents, 'projectileFired').filter((e) => e.sourceType === FAST)).toHaveLength(1);

    const far = newState();
    far.sides[0].gold = 1000;
    enemyAt(far, range + 0.5, 'primitive_heavy');
    let fired = 0;
    for (let t = 0; t < 6; t++) {
      const events = step(far, t === 0 ? [build(0, 0, FAST)] : []);
      fired += eventsOf(events, 'towerFired').length;
    }
    expect(fired).toBe(0);
    expect(far.projectiles.filter((p) => p.sourceKind === 'tower')).toHaveLength(0);
  });

  it('K-02: ardışık atışlar tam attackIntervalTicks aralıklıdır (hızlı 12, ağır 40 tick)', () => {
    for (const [towerId, interval] of [
      [FAST, 12],
      [HEAVY, 40],
    ] as const) {
      expect(mustGetTower(towerId).attackIntervalTicks).toBe(interval);
      const s = newState();
      s.sides[0].gold = 1000;
      // Menzil içinde duran, çok canlı ağır birlik (üsse kendi menzilinden saldırır, kıpırdamaz).
      enemyAt(s, 150, 'primitive_heavy', { hp: 1_000_000 });
      const ticks: number[] = [];
      for (let t = 0; t < 200; t++) {
        const events = step(s, t === 0 ? [build(0, 0, towerId)] : []);
        for (const e of events) if (e.type === 'towerFired') ticks.push(t);
        for (const p of checkInvariants(s)) if (!p.includes('can sınır')) expect(p).toBe('');
      }
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks[0]).toBe(0);
      for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBe(interval);
    }
  });

  it('K-02: kule sayacı 0..aralık arasında kalır ve atıştan sonra aralığa kurulur', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    enemyAt(s, 150, 'primitive_heavy', { hp: 1_000_000 });
    step(s, [build(0, 0, FAST)]);
    expect(towerOf(s, 0, 0).cooldown).toBe(12);
    for (let t = 0; t < 11; t++) {
      step(s, []);
      expect(towerOf(s, 0, 0).cooldown).toBeGreaterThan(0);
    }
    step(s, []);
    // 12. tick sonunda sayaç 0'a inip yeniden atış yapılmıştır.
    expect(towerOf(s, 0, 0).cooldown).toBe(12);
  });

  it('K-02: en yakın düşman seçilir (dizideki sıradan bağımsız); kendi tarafın birliği hedef olmaz', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    addUnit(s, 0, 250); // kendi birliği: hedef olmaz
    const far = enemyAt(s, 200, 'primitive_heavy', { hp: 1_000_000 });
    const near = enemyAt(s, 120, 'primitive_heavy', { hp: 1_000_000 });
    // Yakın olan sonradan eklendi; kule yine de yakını seçer.
    expect(s.units.indexOf(near)).toBeGreaterThan(s.units.indexOf(far));
    const events = step(s, [build(0, 0, FAST)]);
    expect(eventsOf(events, 'towerFired')[0]!.target).toBe(near.id);
  });

  it('K-02: düşman yoksa kule atmaz; kuleler üsse hasar vermez (hedef her zaman bir birliktir)', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    s.sides[1].gold = 1000;
    step(s, [build(0, 0, FAST), build(1, 0, HEAVY)]);
    let fired = 0;
    for (let t = 0; t < 300; t++) fired += eventsOf(step(s, []), 'towerFired').length;
    expect(fired).toBe(0);
    expect(s.projectiles).toHaveLength(0);
    expect(s.sides[0].baseHp).toBe(s.sides[0].baseMaxHp);
    expect(s.sides[1].baseHp).toBe(s.sides[1].baseMaxHp);
  });

  it('K-02: taraf 1 kulesi de kendi üs ön yüzünden ölçer ve taraf 0 birliğine atar', () => {
    const s = newState();
    s.sides[1].gold = 1000;
    const face1 = WORLD.worldWidth - WORLD.baseWidth;
    const w = mustGetUnit('primitive_heavy').def.width;
    const range = mustGetTower(FAST).def.range;
    const inRange = addUnit(s, 0, face1 - range - w / 2, { hp: 1_000_000 }, 'primitive_heavy');
    const events = step(s, [build(1, 0, FAST)]);
    expect(eventsOf(events, 'towerFired')[0]).toMatchObject({ side: 1, target: inRange.id });
    const projectile = s.projectiles.find((p) => p.sourceKind === 'tower')!;
    expect(projectile).toMatchObject({ side: 1, sourceType: FAST, sourceId: 0, targetId: inRange.id });
    expect(projectile.x).toBe(face1);
  });

  it('kule mermisi: hız DEFENSE.projectileSpeed/tickRate, kaynak türü ve yuva kaydı doğrudur', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    enemyAt(s, 250, 'primitive_heavy', { hp: 1_000_000 });
    step(s, [unlock(0, 1), build(0, 1, FAST)]);
    const p = s.projectiles.find((x) => x.sourceKind === 'tower')!;
    expect(p).toMatchObject({ sourceKind: 'tower', sourceType: FAST, sourceId: 1, side: 0, x: BASE_FACE_0 });
    step(s, []);
    expect(s.projectiles.find((x) => x.id === p.id)!.x).toBeCloseTo(BASE_FACE_0 + DEFENSE.projectileSpeed / WORLD.tickRate, 9);
  });

  it('hasar tamsayı tablodan gelir: hızlı kule 16/19/11, ağır kule 36/52/48; alan hasarı 18/26/24', () => {
    expect(mustGetTower(FAST).damageVs).toMatchObject({ front: 16, ranged: 19, heavy: 11 });
    expect(mustGetTower(HEAVY).damageVs).toMatchObject({ front: 36, ranged: 52, heavy: 48 });
    expect(mustGetTower(HEAVY).splashDamageVs).toEqual({ front: 18, ranged: 26, heavy: 24 });
    expect(mustGetTower(FAST).splashDamageVs).toBeNull();

    for (const [role, type, expected] of [
      ['front', 'primitive_front', 16],
      ['ranged', 'primitive_ranged', 19],
      ['heavy', 'primitive_heavy', 11],
    ] as const) {
      const s = newState();
      s.sides[0].gold = 1000;
      const enemy = enemyAt(s, 200, type);
      const hp0 = enemy.hp;
      step(s, [build(0, 0, FAST)]);
      let impact = false;
      for (let t = 0; t < 30 && !impact; t++) {
        impact = eventsOf(step(s, []), 'projectileImpact').length > 0;
      }
      expect(impact, role).toBe(true);
      expect(hp0 - enemy.hp, role).toBe(expected);
    }
  });

  it('alan hasarı: ağır kule ana hedefe 36, yakındaki başka sınıfa falloff’lu 26 verir; hızlı kule alan hasarı vermez', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    const main = enemyAt(s, 150, 'primitive_front', { hp: 1000 });
    const w = mustGetUnit('primitive_ranged').def.width;
    const mainWidth = mustGetUnit('primitive_front').def.width;
    const second = addUnit(s, 1, main.x + mainWidth / 2 + 6 + w / 2, { hp: 1000 }, 'primitive_ranged');
    step(s, [build(0, 0, HEAVY)]);
    for (let t = 0; t < 30; t++) step(s, []);
    // İlk patlamadan sonra (ikinci atış 40 tick'te) ana hedef 36, ikincil 26 hasar almıştır.
    expect(1000 - main.hp).toBe(36);
    expect(1000 - second.hp).toBe(26);

    const t2 = newState();
    t2.sides[0].gold = 1000;
    const m2 = enemyAt(t2, 150, 'primitive_front', { hp: 1000 });
    const s2 = addUnit(t2, 1, m2.x + mainWidth / 2 + 6 + w / 2, { hp: 1000 }, 'primitive_ranged');
    step(t2, [build(0, 0, FAST)]);
    for (let t = 0; t < 8; t++) step(t2, []);
    expect(1000 - m2.hp).toBe(16);
    expect(s2.hp).toBe(1000);
  });
});

describe('K-03: kule öldürmesinde ödül tektir', () => {
  it('K-03: iki kule aynı adımda aynı birliği öldürürse ödül ve öldürme bir kez sayılır', () => {
    const s = newState();
    s.sides[0].gold = 5000;
    const def = mustGetUnit(FRONT_ID).def;
    const victim = enemyAt(s, 100, FRONT_ID, { hp: 1 });
    step(s, [unlock(0, 1), build(0, 0, FAST), build(0, 1, FAST)]);
    expect(s.projectiles.filter((p) => p.sourceKind === 'tower')).toHaveLength(2);
    const goldBefore = s.sides[0].gold;
    const xpBefore = s.sides[0].xp;
    let died = 0;
    for (let t = 0; t < 20 && died === 0; t++) {
      const before: [number, number] = [s.sides[0].gold, s.sides[1].gold];
      const events = step(s, []);
      died += eventsOf(events, 'unitDied').length;
      expect(goldBalanceProblems(before, s, events)).toEqual([]);
    }
    expect(died).toBe(1);
    expect(s.units.find((u) => u.id === victim.id)).toBeUndefined();
    expect(s.sides[0].stats.kills[FAST]).toBe(1);
    expect(s.sides[1].stats.lost[FRONT_ID]).toBe(1);
    expect(s.sides[0].xp).toBe(xpBefore + def.bountyXp);
    // Birkaç tick sonra ödül tekrar verilmez (gelir hariç tutulur: olay toplamı).
    let income = 0;
    for (let t = 0; t < 40; t++) income += eventsOf(step(s, []), 'income').filter((e) => e.side === 0).reduce((a, e) => a + e.amount, 0);
    expect(s.sides[0].gold).toBe(goldBefore + def.bountyGold + income);
  });

  it('K-03 / D-06: ağır kulenin alan hasarı iki birliği öldürür; her birlik için ödül bir kez, öldürmeler kule türüne yazılır', () => {
    const s = newState();
    s.sides[0].gold = 5000;
    const a = mustGetUnit(FRONT_ID).def;
    const main = enemyAt(s, 150, FRONT_ID, { hp: 1 });
    const second = addUnit(s, 1, main.x + a.width + 6, { hp: 1 }, FRONT_ID);
    step(s, [build(0, 0, HEAVY)]);
    const xp0 = s.sides[0].xp;
    let died = 0;
    for (let t = 0; t < 30; t++) {
      const before: [number, number] = [s.sides[0].gold, s.sides[1].gold];
      const events = step(s, []);
      died += eventsOf(events, 'unitDied').length;
      expect(goldBalanceProblems(before, s, events)).toEqual([]);
    }
    expect(died).toBe(2);
    expect(s.units.filter((u) => u.id === main.id || u.id === second.id)).toHaveLength(0);
    expect(s.sides[0].stats.kills[HEAVY]).toBe(2);
    expect(s.sides[0].xp).toBe(xp0 + 2 * a.bountyXp);
    expect(s.sides[1].stats.lost[FRONT_ID]).toBe(2);
  });

  it('hedef mermi varmadan ölürse: hızlı kule mermisi kaybolur (hasar ve ödül yok), ağır kule hedefin son konumuna düşer', () => {
    // Hızlı.
    const f = newState();
    f.sides[0].gold = 1000;
    const victimF = enemyAt(f, 200, FRONT_ID, { hp: 50 });
    step(f, [build(0, 0, FAST)]);
    f.units = f.units.filter((u) => u.id !== victimF.id); // hedef başka bir nedenle öldü
    let impacts: Extract<SimEvent, { type: 'projectileImpact' }>[] = [];
    for (let t = 0; t < 20; t++) {
      const before: [number, number] = [f.sides[0].gold, f.sides[1].gold];
      const events = step(f, []);
      impacts = impacts.concat(eventsOf(events, 'projectileImpact'));
      expect(eventsOf(events, 'unitDied')).toHaveLength(0);
      expect(goldBalanceProblems(before, f, events)).toEqual([]);
    }
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({ hits: 0, hitBase: false });
    expect(f.sides[0].stats.kills[FAST]).toBe(0);

    // Ağır: hedef öldü, yanındaki birlik son konumdaki patlamadan zarar görür.
    const h = newState();
    h.sides[0].gold = 1000;
    const w = mustGetUnit(FRONT_ID).def.width;
    const main = enemyAt(h, 150, FRONT_ID, { hp: 50 });
    const bystander = addUnit(h, 1, main.x + w + 6, { hp: 1000 }, FRONT_ID);
    step(h, [build(0, 0, HEAVY)]);
    h.units = h.units.filter((u) => u.id !== main.id);
    for (let t = 0; t < 30; t++) step(h, []);
    expect(1000 - bystander.hp).toBe(18); // alan hasarı yalnız ikincil: round(36 × 0,5)
  });
});

describe('K-11: satış iadesi', () => {
  it('K-11: iade ödenen fiyatın yarısı, aşağı yuvarlanır (645 → 322, 1125 → 562, 210 → 105)', () => {
    expect(sellRefund(645)).toBe(322);
    expect(sellRefund(1125)).toBe(562);
    expect(sellRefund(210)).toBe(105);
    for (const [type, paid, refund] of [
      ['industrial_tower_fast', 645, 322],
      ['future_tower_fast', 1125, 562],
      ['ancient_tower_fast', 210, 105],
    ] as const) {
      const s = newState();
      place(s, 0, 0, type);
      s.sides[0].gold = 0;
      expect(towerOf(s, 0, 0).paid).toBe(paid);
      const events = step(s, [sell(0, 0)]);
      expect(eventsOf(events, 'towerSold')).toEqual([{ type: 'towerSold', side: 0, slot: 0, towerType: type, refund }]);
      expect(s.sides[0].gold).toBe(refund);
      expect(s.sides[0].stats.goldRefunded).toBe(refund);
      expect(s.sides[0].slots[0]!.tower).toBeNull();
    }
  });

  it('K-11: iade ödenen fiyattan hesaplanır (kule verisinin sonradan değişmesinden bağımsız); satış sonrası yuva açık kalır', () => {
    const s = newState();
    place(s, 0, 0, FAST);
    s.sides[0].slots[0]!.tower!.paid = 123; // eski bir kayıtta farklı fiyat ödenmiş olabilir
    s.sides[0].gold = 0;
    step(s, [sell(0, 0)]);
    expect(s.sides[0].gold).toBe(61);
    expect(s.sides[0].slots[0]!.unlocked).toBe(true);
  });

  it('K-11: yuva açma ücreti iade edilmez; kur–sat sonrası net kayıp = yuva ücreti + fiyatın yarısı', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    step(s, [unlock(0, 1), build(0, 1, FAST)]);
    expect(s.sides[0].gold).toBe(1000 - 200 - 120);
    const events = step(s, [sell(0, 1)]);
    expect(eventsOf(events, 'towerSold')[0]!.refund).toBe(60);
    expect(s.sides[0].gold).toBe(1000 - 200 - 120 + 60);
    expect(s.sides[0].stats.goldSpent).toBe(320);
    expect(s.sides[0].stats.goldRefunded).toBe(60);
    // Yuva hâlâ açıktır, yeniden açma ücreti yoktur; yeni kule kurulabilir.
    expect(s.sides[0].slots[1]!.unlocked).toBe(true);
    const rebuild = step(s, [build(0, 1, HEAVY)]);
    expect(eventsOf(rebuild, 'towerBuilt')).toHaveLength(1);
  });

  it('satıştan sonra havadaki mermi sürer ve öldürme kule türüne yazılır', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    const victim = enemyAt(s, 250, FRONT_ID, { hp: 16 });
    step(s, [build(0, 0, FAST)]);
    expect(s.projectiles).toHaveLength(1);
    const sold = step(s, [sell(0, 0)]);
    expect(eventsOf(sold, 'towerSold')).toHaveLength(1);
    expect(s.sides[0].slots[0]!.tower).toBeNull();
    expect(s.projectiles).toHaveLength(1); // satış mermiyi silmez
    let died = 0;
    for (let t = 0; t < 30; t++) died += eventsOf(step(s, []), 'unitDied').length;
    expect(died).toBe(1);
    expect(s.units.find((u) => u.id === victim.id)).toBeUndefined();
    expect(s.sides[0].stats.kills[FAST]).toBe(1);
    // Satılan kule yeni mermi atmaz.
    expect(s.projectiles).toHaveLength(0);
  });
});

describe('Ç-06: çağ geçişinde kuleler korunur, yalnız güncel çağ kurulabilir', () => {
  it('Ç-06: çağ geçişi kuleyi değiştirmez (tür, ödenen, sayaç); eski kule kendi çağının değerleriyle atar', () => {
    const s = newState();
    s.sides[0].gold = 5000;
    s.sides[0].xp = 800;
    enemyAt(s, 150, 'primitive_heavy', { hp: 1_000_000 });
    step(s, [build(0, 0, FAST)]);
    const before = clone(towerOf(s, 0, 0));
    const events = step(s, [{ type: 'ageUp', side: 0 }]);
    expect(eventsOf(events, 'agedUp')).toHaveLength(1);
    expect(s.sides[0].age).toBe(2);
    const after = towerOf(s, 0, 0);
    expect(after.type).toBe(FAST);
    expect(after.paid).toBe(before.paid);
    expect(after.cooldown).toBe(before.cooldown - 1);
    // Eski kule, birliğe ilkel çağ hasarıyla (16 × 0,7 = 11) vurmaya devam eder.
    const enemy = s.units[0]!;
    const hp = enemy.hp;
    for (let t = 0; t < 40; t++) step(s, []);
    expect(hp - enemy.hp).toBeGreaterThanOrEqual(11);
    expect((hp - enemy.hp) % 11).toBe(0);
    // Test birliğinin canı veri üst sınırını aştığı için yalnız can ihlalleri dışarıda bırakılır.
    expect(checkInvariants(s).filter((p) => !p.includes('can sınır'))).toEqual([]);
  });

  it('Ç-06: yalnız güncel çağın kuleleri kurulur (çağ 1’de antik, çağ 2’de ilkel kule reddedilir)', () => {
    const s = newState();
    s.sides[0].gold = 10_000;
    s.sides[0].xp = 800;
    step(s, [unlock(0, 1)]);
    const rejected1 = step(s, [build(0, 0, 'ancient_tower_fast')]);
    expect(eventsOf(rejected1, 'commandRejected')[0]).toMatchObject({ reason: 'towerNotAvailable' });
    step(s, [{ type: 'ageUp', side: 0 }]);
    const rejected2 = step(s, [build(0, 0, FAST)]);
    expect(eventsOf(rejected2, 'commandRejected')[0]).toMatchObject({ reason: 'towerNotAvailable' });
    const ok = step(s, [build(0, 0, 'ancient_tower_fast'), build(0, 1, 'ancient_tower_heavy')]);
    expect(eventsOf(ok, 'towerBuilt').map((e) => e.paid)).toEqual([210, 280]);
  });

  it('Ç-06: eski çağ kulesi satılıp yerine güncel çağın kulesi kurulabilir', () => {
    const s = newState();
    s.sides[0].gold = 10_000;
    s.sides[0].xp = 800;
    step(s, [build(0, 0, FAST), { type: 'ageUp', side: 0 }]);
    expect(validate(s, build(0, 0, 'ancient_tower_fast'))).toEqual({ ok: false, reason: 'slotOccupied' });
    const events = step(s, [sell(0, 0), build(0, 0, 'ancient_tower_fast')]);
    expect(eventsOf(events, 'towerSold')[0]).toMatchObject({ towerType: FAST, refund: 60 });
    expect(towerOf(s, 0, 0).type).toBe('ancient_tower_fast');
  });
});

describe('Maç sonu ve gözlem', () => {
  it('D-04: maç bitince kuleler durur (adım hiçbir şeyi değiştirmez, olay üretmez)', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    enemyAt(s, 150, 'primitive_heavy', { hp: 1_000_000 });
    step(s, [build(0, 0, FAST)]);
    step(s, []);
    s.outcome = { kind: 'win', winner: 0, tick: s.tick };
    const hash = stateHash(s);
    for (let t = 0; t < 60; t++) expect(step(s, [])).toEqual([]);
    expect(stateHash(s)).toBe(hash);
  });

  it('D-04: üs yıkıldığı adımdan sonra yeni kule mermisi atılmaz', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    s.sides[1].baseHp = 1;
    place(s, 0, 0, FAST);
    // Taraf 0'ın üs ön yüzüne dayanmış taraf 0 birliği taraf 1 üssüne saldırır; elle: üs canı 0 yap, bir adım at.
    enemyAt(s, 150, 'primitive_heavy', { hp: 1_000_000 });
    s.sides[0].baseHp = 0;
    step(s, []);
    expect(s.outcome).not.toBeNull();
    const projectiles = s.projectiles.length;
    for (let t = 0; t < 40; t++) step(s, []);
    expect(s.projectiles).toHaveLength(projectiles);
  });

  it('R-03: gözlem kendi yuvalarını tam, karşı tarafınkini yalnız açık mı ve kule türü olarak içerir (fiyat ve sayaç yok)', () => {
    const s = newState();
    s.sides[0].gold = 1000;
    s.sides[1].gold = 1000;
    step(s, [build(0, 0, FAST), unlock(1, 1), build(1, 1, HEAVY)]);
    const obs = buildObservation(s, 0);
    expect(obs.self.slots[0]).toEqual({ unlocked: true, tower: { type: FAST, paid: 120, cooldown: s.sides[0].slots[0]!.tower!.cooldown } });
    expect(obs.enemy.slots).toEqual([
      { unlocked: true, towerType: null },
      { unlocked: true, towerType: HEAVY },
      { unlocked: false, towerType: null },
    ]);
    const enemyJson = JSON.stringify(obs.enemy);
    expect(enemyJson).not.toContain('paid');
    expect(enemyJson).not.toContain('cooldown');
    expect(enemyJson).not.toContain('160');
    for (const slot of obs.enemy.slots) expect(Object.keys(slot).sort()).toEqual(['towerType', 'unlocked']);
    // Gözlem kopyadır.
    obs.self.slots[0]!.tower!.paid = 1;
    expect(towerOf(s, 0, 0).paid).toBe(120);
    obs.enemy.slots[0]!.unlocked = false;
    expect(s.sides[1].slots[0]!.unlocked).toBe(true);
  });
});

describe('Determinizm ve kaydet-yükle (kule içeren koşular)', () => {
  function playTowers(kind: (typeof TOWER_BOT_KINDS)[number], seed: number, total: number, cuts: number[]): { hash: string; fired: number; built: number } {
    let s = createMatch({ seed, opponent: kind === 'defender-basic' ? 'basic-bot' : 'none' });
    s.sides[0].gold += 1500;
    s.sides[1].gold += 1500;
    let controllers = makeControllers(kind, seed);
    let fired = 0;
    let built = 0;
    for (let t = 0; t < total; t++) {
      if (cuts.includes(t)) {
        s = JSON.parse(JSON.stringify(s)) as GameState;
        controllers = makeControllers(kind, s.config.seed);
      }
      const events = stepMatch(s, [], controllers);
      fired += eventsOf(events, 'towerFired').length;
      built += eventsOf(events, 'towerBuilt').length;
    }
    return { hash: stateHash(s), fired, built };
  }

  it('K-07/K-08: kule içeren koşu tekrarlanabilir; JSON kaydet-yükle sonrası aynı son karma', () => {
    let firedByStacker = 0;
    for (const kind of TOWER_BOT_KINDS) {
      for (const seed of [41, 42]) {
        const straight = playTowers(kind, seed, 6000, []);
        expect(straight.built, `${kind} ${seed}`).toBeGreaterThan(0);
        // Savunmacı rakibin ortada tutulduğu eşleşmelerde kule atışı olmayabilir; saldıran yığan botla atış zorunlu.
        if (kind === 'stacker-defender') firedByStacker += straight.fired;
        expect(playTowers(kind, seed, 6000, [])).toEqual(straight);
        expect(playTowers(kind, seed, 6000, [900, 2500, 4800]).hash, `${kind} ${seed}`).toBe(straight.hash);
      }
    }
    expect(firedByStacker).toBeGreaterThan(0);
  });

  it('yuva ve kule durumu düz JSON’dur (sınıf/Map yok): kayıt–yükleme durumu birebir korur', () => {
    const s = newState();
    s.sides[0].gold = 3000;
    step(s, [unlock(0, 1), build(0, 0, FAST), build(0, 1, HEAVY)]);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(stateHash(copy)).toBe(stateHash(s));
    expect(copy.sides[0].slots).toEqual(s.sides[0].slots);
  });
});
