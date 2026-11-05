import { describe, expect, it } from 'vitest';
import { COMBAT } from '../src/data/combat';
import { UNITS } from '../src/data/units';
import { WORLD } from '../src/data/world';
import { stepMatch } from '../src/match/runner';
import { mustGetUnit, TARGET_CLASSES, UNIT_CLASSES } from '../src/sim/compile';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import { checkInvariants } from '../src/sim/invariants';
import { step } from '../src/sim/step';
import type { GameState, SimEvent } from '../src/sim/types';
import { createBasicBot } from '../src/ai/basicBot';
import { createStackerBot } from '../src/ai/testBots';
import { FRONT_ID, addUnit, clone, newState } from './helpers';

const R = 'primitive_ranged';
const H = 'primitive_heavy';
const FACE_1 = WORLD.worldWidth - WORLD.baseWidth;

function eventsOf<T extends SimEvent['type']>(events: SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/** Mermi kalmayana kadar (en çok `max` adım) ilerler; tüm olayları toplar. */
function runUntilNoProjectiles(s: GameState, max = 200): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && s.projectiles.length > 0 && s.outcome === null; i++) all.push(...step(s, []));
  return all;
}

describe('Hasar tablosu (compile)', () => {
  it('her birlik ve hedef sınıfı için hasar = max(1, round(hasar × çarpan)) ve tamsayıdır', () => {
    for (const def of UNITS) {
      const compiled = mustGetUnit(def.id);
      for (const cls of TARGET_CLASSES) {
        const expected = Math.max(1, Math.round(def.damage * (def.multiplierOverrides?.[cls] ?? COMBAT.roleMultipliers[def.role][cls])));
        expect(compiled.damageVs[cls], `${def.id} → ${cls}`).toBe(expected);
        expect(Number.isInteger(compiled.damageVs[cls])).toBe(true);
        expect(compiled.damageVs[cls]).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('GDD §3 başlangıç tablosundan beklenen İlkel Çağ değerleri', () => {
    expect(mustGetUnit(FRONT_ID).damageVs).toEqual({ front: 20, ranged: 24, heavy: 30, base: 20 });
    expect(mustGetUnit(R).damageVs).toEqual({ front: 18, ranged: 14, heavy: 10, base: 7 });
    expect(mustGetUnit(H).damageVs).toEqual({ front: 29, ranged: 72, heavy: 48, base: 120 });
  });

  it('alan ikincil hasarı = max(1, round(o sınıfa hasar × falloff)); alanı olmayan birlikte tablo yok', () => {
    const heavy = mustGetUnit(H);
    const falloff = heavy.def.splash!.falloff;
    for (const cls of UNIT_CLASSES) {
      expect(heavy.splashDamageVs![cls]).toBe(Math.max(1, Math.round(heavy.damageVs[cls] * falloff)));
      expect(Number.isInteger(heavy.splashDamageVs![cls])).toBe(true);
    }
    expect(heavy.splashDamageVs).toEqual({ front: 15, ranged: 36, heavy: 24 });
    expect(mustGetUnit(FRONT_ID).splashDamageVs).toBeNull();
    expect(mustGetUnit(R).splashDamageVs).toBeNull();
  });

  it('tüm birlik verisi tamsayı can taşır; mermi hızı yalnız mermili rollerde tanımlıdır', () => {
    for (const def of UNITS) {
      expect(Number.isInteger(def.hp), def.id).toBe(true);
      const compiled = mustGetUnit(def.id);
      const speed = COMBAT.projectileSpeed[def.role];
      expect(compiled.projectileStep).toBe(speed === null ? null : speed / WORLD.tickRate);
    }
  });

  it('değişmez: tamsayı olmayan birlik ya da üs canı ihlal olarak yakalanır', () => {
    const s = newState();
    const u = addUnit(s, 0, 500);
    expect(checkInvariants(s)).toEqual([]);
    u.hp = 100.5;
    expect(checkInvariants(s).some((p) => p.includes('can tamsayı değil'))).toBe(true);
    u.hp = 100;
    s.sides[1].baseHp = 3999.5;
    expect(checkInvariants(s).some((p) => p.includes('üs canı tamsayı değil'))).toBe(true);
  });
});

describe('Yakın dövüş anlıktır; menzilli ve ağır mermi üretir', () => {
  it('ön hat: hasar aynı adımda uygulanır, olayda hasar sayısaldır, mermi yok', () => {
    const s = newState();
    addUnit(s, 0, 500);
    const enemy = addUnit(s, 1, 500 + 36 + 5);
    const events = step(s, []);
    const attack = eventsOf(events, 'attack').find((e) => e.side === 0)!;
    expect(attack.damage).toBe(20);
    expect(enemy.hp).toBe(160);
    expect(s.projectiles).toHaveLength(0);
    expect(eventsOf(events, 'projectileFired')).toHaveLength(0);
  });

  it('menzilli: saldırı anında hasar yok (damage null), mermi doğar; çarpınca tablo hasarı uygulanır', () => {
    const s = newState();
    const shooter = addUnit(s, 0, 500, {}, R);
    // Boşluk 150 (menzil 190 içinde).
    const enemy = addUnit(s, 1, 515 + 150 + 18);
    const first = step(s, []);
    const attack = eventsOf(first, 'attack').find((e) => e.attackerId === shooter.id)!;
    expect(attack.damage).toBeNull();
    expect(attack.target).toBe(enemy.id);
    const fired = eventsOf(first, 'projectileFired');
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ side: 0, sourceType: R, target: enemy.id });
    expect(enemy.hp).toBe(180);
    expect(s.projectiles).toHaveLength(1);
    expect(s.projectiles[0]).toMatchObject({ side: 0, sourceType: R, sourceId: shooter.id, targetId: enemy.id, targetLost: false });

    let impactTicks = 0;
    const rest: SimEvent[] = [];
    while (s.projectiles.length > 0 && impactTicks < 30) {
      // Uçarken mermi hedefin güncel çarpma noktasını (bakan kenar) izler.
      const p = s.projectiles[0]!;
      expect(p.targetX).toBeCloseTo(enemy.x - 18, 9);
      rest.push(...step(s, []));
      impactTicks += 1;
    }
    const impact = eventsOf(rest, 'projectileImpact');
    expect(impact).toHaveLength(1);
    expect(impact[0]).toMatchObject({ side: 0, hits: 1, hitBase: false });
    // Mesafe ≈ 150 / (600/20 = 30 birim/tick): birkaç tick uçuş.
    expect(impactTicks).toBeGreaterThanOrEqual(3);
    expect(impactTicks).toBeLessThanOrEqual(8);
    expect(enemy.hp).toBe(180 - 18);
  });

  it('çarpmada birlik sınıfına göre doğru tablo değeri: menzilli → ağır 10, ağır → menzilli 72', () => {
    const s = newState();
    addUnit(s, 0, 500, {}, R);
    const heavyTarget = addUnit(s, 1, 515 + 25 + 28, {}, H);
    step(s, []);
    runUntilNoProjectiles(s);
    expect(heavyTarget.hp).toBe(420 - 10);

    const s2 = newState();
    addUnit(s2, 0, 500, {}, H);
    const rangedTarget = addUnit(s2, 1, 528 + 25 + 15, {}, R);
    step(s2, []);
    runUntilNoProjectiles(s2);
    expect(rangedTarget.hp).toBe(90 - 72);
  });

  it('K-02 (mermi sürümü): menzil dışına mermi atılmaz; menzildeki ANA hedef en yakın düşmandır; aralık korunur', () => {
    const s = newState();
    const shooter = addUnit(s, 0, 500, {}, R);
    // Menzilin 1 birim ötesinde bir düşman: ilk adımda atış yok.
    addUnit(s, 1, 515 + 191 + 18, { hp: 1_000_000 });
    // Not: düşman yürür; yine de ilk adımdaki hedefleme tick başı konumlara göre yapılır.
    const first = step(s, []);
    expect(eventsOf(first, 'projectileFired')).toHaveLength(0);

    // İki düşman menzilde: yakın olan hedeflenir.
    const s2 = newState();
    addUnit(s2, 0, 500, {}, R);
    const far = addUnit(s2, 1, 515 + 120 + 18 + 60, { hp: 1_000_000 });
    const near = addUnit(s2, 1, 515 + 120 + 18, { hp: 1_000_000 });
    const events = step(s2, []);
    const fired = eventsOf(events, 'projectileFired');
    expect(fired).toHaveLength(1);
    expect(fired[0]!.target).toBe(near.id);
    expect(fired[0]!.target).not.toBe(far.id);

    // Ardışık atışlar arası tam saldırı aralığı kadar tick.
    const s3 = newState();
    addUnit(s3, 0, 500, {}, R);
    addUnit(s3, 1, 515 + 150 + 18, { hp: 1_000_000_000 });
    const fireTicks: number[] = [];
    for (let t = 0; t < 140; t++) {
      for (const e of step(s3, [])) if (e.type === 'projectileFired') fireTicks.push(t);
    }
    expect(fireTicks.length).toBeGreaterThanOrEqual(4);
    const interval = mustGetUnit(R).attackIntervalTicks;
    for (let i = 1; i < fireTicks.length; i++) expect(fireTicks[i]! - fireTicks[i - 1]!).toBe(interval);
    expect(shooter.cooldown).toBeLessThanOrEqual(interval);
  });
});

describe('Alan hasarı', () => {
  /** Ağır birlik B'ye bitişik (boşluk 10) ateş eder; E1 çarpma yarıçapı içinde, E2 dışında, hepsi aynı adımda çarpar. */
  function splashScene(): { s: GameState; heavy: ReturnType<typeof addUnit>; main: ReturnType<typeof addUnit>; e1: ReturnType<typeof addUnit>; e2: ReturnType<typeof addUnit> } {
    const s = newState();
    const heavy = addUnit(s, 0, 500, {}, H);
    const main = addUnit(s, 1, 556, {});
    const e1 = addUnit(s, 1, 598, {});
    const e2 = addUnit(s, 1, 640, {});
    return { s, heavy, main, e1, e2 };
  }

  it('ana hedef tam, yarıçap içindeki diğer düşmanlar falloff\'lu hasar alır; yarıçap dışı ve dost etkilenmez', () => {
    const { s, heavy, main, e1, e2 } = splashScene();
    const events = step(s, []);
    expect(main.hp).toBe(180 - 29);
    expect(e1.hp).toBe(180 - 15);
    expect(e2.hp).toBe(180);
    // Ağır birlik çarpma noktasına yakın ama dosttur: yalnız ana hedefin yakın dövüş saldırısını (30) alır.
    expect(heavy.hp).toBe(420 - 30);
    const impact = eventsOf(events, 'projectileImpact');
    expect(impact).toHaveLength(1);
    expect(impact[0]!.hits).toBe(2);
  });

  it('üs alan hasarından etkilenmez; üs yakınındaki birlik ana hedefken üs canı sabit kalır', () => {
    const s = newState();
    addUnit(s, 0, 1500, {}, H);
    // Düşman üssünün hemen önünde doğmuş birlik (çarpma noktasına yarıçap içinde üs ön yüzü de düşüyor).
    const target = addUnit(s, 1, FACE_1 - 18, { hp: 1_000_000 });
    step(s, []);
    expect(s.projectiles).toHaveLength(1);
    runUntilNoProjectiles(s);
    expect(target.hp).toBeLessThan(1_000_000);
    expect(s.sides[1].baseHp).toBe(s.sides[1].baseMaxHp);
    expect(s.sides[0].baseHp).toBe(s.sides[0].baseMaxHp);
  });

  it('üs hedefli ağır mermi üsse tam tablo hasarı verir (120) ve baseDamaged olayı üretir', () => {
    const s = newState();
    addUnit(s, 0, 1500, {}, H);
    const events = [...step(s, []), ...runUntilNoProjectiles(s)];
    const impact = eventsOf(events, 'projectileImpact');
    expect(impact).toHaveLength(1);
    expect(impact[0]).toMatchObject({ hitBase: true, hits: 0 });
    expect(s.sides[1].baseHp).toBe(s.sides[1].baseMaxHp - 120);
    expect(eventsOf(events, 'baseDamaged')).toEqual([{ type: 'baseDamaged', side: 1, amount: 120 }]);
    expect(s.sides[0].stats.baseDamageDealt).toBe(120);
  });
});

describe('Hedef ölürse', () => {
  function farShot(type: string): { s: GameState; shooter: ReturnType<typeof addUnit>; victim: ReturnType<typeof addUnit>; bystander: ReturnType<typeof addUnit> } {
    const s = newState();
    const shooter = addUnit(s, 0, 300, {}, type);
    const half = mustGetUnit(type).def.width / 2;
    const victim = addUnit(s, 1, 300 + half + 150 + 18, { hp: 180 });
    // Hedefin hemen arkasındaki dost düşman birliği (alan yarıçapı içinde).
    const bystander = addUnit(s, 1, victim.x + 42, { hp: 180 });
    return { s, shooter, victim, bystander };
  }

  it('alan hasarı olmayan mermi hasarsız kaybolur (hits 0); başka birlik ve ödül etkilenmez', () => {
    const { s, victim, bystander } = farShot(R);
    step(s, []);
    expect(s.projectiles).toHaveLength(1);
    // Hedef mermi varmadan ölür (bu test için doğrudan kaldırılır).
    s.units = s.units.filter((u) => u.id !== victim.id);
    const gold = s.sides[0].gold;
    const xp = s.sides[0].xp;
    const events = runUntilNoProjectiles(s);
    const impact = eventsOf(events, 'projectileImpact');
    expect(impact).toHaveLength(1);
    expect(impact[0]!.hits).toBe(0);
    expect(bystander.hp).toBe(180);
    expect(s.sides[0].gold).toBe(gold);
    expect(s.sides[0].xp).toBe(xp);
    expect(eventsOf(events, 'unitDied')).toHaveLength(0);
  });

  it('alan hasarlı mermi hedefin son konumuna düşer ve patlar: yarıçap içindekiler falloff alır, ötesi almaz', () => {
    const s = newState();
    addUnit(s, 0, 300, {}, H);
    // Ağır birlik menzili 300; hedef ~250 uzakta.
    const victim = addUnit(s, 1, 328 + 250 + 18, { hp: 180 });
    const near = addUnit(s, 1, victim.x + 42, { hp: 180 });
    const far = addUnit(s, 1, victim.x + 42 + 42 + 42, { hp: 180 });
    step(s, []);
    const projectile = s.projectiles[0]!;
    expect(projectile).toBeDefined();
    s.units = s.units.filter((u) => u.id !== victim.id);
    // Kısa süre uç: hedef ölü, targetLost işaretlenir ve targetX sabit kalır.
    step(s, []);
    const lost = s.projectiles[0]!;
    expect(lost.targetLost).toBe(true);
    const lastKnown = lost.targetX;
    step(s, []);
    expect(s.projectiles[0]?.targetX ?? lastKnown).toBe(lastKnown);
    const events = runUntilNoProjectiles(s);
    const impact = eventsOf(events, 'projectileImpact');
    expect(impact).toHaveLength(1);
    expect(impact[0]!.x).toBe(lastKnown);
    // near, hedefin arkasında 42 birim (boşluk 6): çarpma noktası hedefin bakan kenarı → yarıçap 50 içine girer.
    const nearHit = near.hp < 180;
    expect(nearHit).toBe(true);
    expect(near.hp).toBe(180 - 15);
    expect(far.hp).toBe(180);
    expect(impact[0]!.hits).toBe(1);
  });
});

describe('K-03: mermiyle ödül tekliği', () => {
  it('K-03: iki menzilli aynı adımda aynı hedefi mermiyle öldürürse ödül bir kez verilir', () => {
    const s = newState();
    addUnit(s, 0, 500, {}, R);
    addUnit(s, 0, 500, {}, R);
    const target = addUnit(s, 1, 515 + 20 + 18, { hp: 36 });
    const gold = s.sides[0].gold;
    const xp = s.sides[0].xp;
    const events = step(s, []);
    expect(eventsOf(events, 'projectileImpact')).toHaveLength(2);
    expect(eventsOf(events, 'unitDied').filter((e) => e.id === target.id)).toHaveLength(1);
    const def = mustGetUnit(FRONT_ID).def;
    expect(s.sides[0].gold).toBe(gold + def.bountyGold);
    expect(s.sides[0].xp).toBe(xp + def.bountyXp);
    expect(s.sides[0].stats.kills[R]).toBe(1);
    expect(s.sides[1].stats.lost[FRONT_ID]).toBe(1);
    step(s, []);
    step(s, []);
    expect(s.sides[0].gold).toBe(gold + def.bountyGold);
  });

  it('K-03: iki ağır birliğin mermisi ve alan hasarı aynı birimleri aynı adımda öldürür; her ödül tek', () => {
    const s = newState();
    addUnit(s, 0, 500, {}, H);
    addUnit(s, 0, 500, {}, H);
    // Ana hedef iki ana vuruşla (29+29), komşu iki alan vuruşuyla (15+15) ölür.
    const main = addUnit(s, 1, 556, { hp: 58 });
    const neighbour = addUnit(s, 1, 598, { hp: 30 });
    const gold = s.sides[0].gold;
    const xp = s.sides[0].xp;
    const events = step(s, []);
    const died = eventsOf(events, 'unitDied');
    expect(died.map((e) => e.id).sort()).toEqual([main.id, neighbour.id].sort());
    const def = mustGetUnit(FRONT_ID).def;
    expect(s.sides[0].gold).toBe(gold + 2 * def.bountyGold);
    expect(s.sides[0].xp).toBe(xp + 2 * def.bountyXp);
    expect(s.sides[0].stats.kills[H]).toBe(2);
    expect(s.sides[1].stats.lost[FRONT_ID]).toBe(2);
    for (let i = 0; i < 5; i++) step(s, []);
    expect(s.sides[0].gold).toBe(gold + 2 * def.bountyGold);
  });

  it('K-03: hedef yakın dövüşle ölürse uçuştaki mermi geç gelir ama ödül yine tektir', () => {
    const s = newState();
    // Menzilli (uzakta) ile ön hat (bitişik) aynı düşmanı hedefler; ön hat hedefi hemen öldürür.
    addUnit(s, 0, 450, {}, R);
    addUnit(s, 0, 600, {});
    const target = addUnit(s, 1, 600 + 18 + 2 + 18, { hp: 20 });
    const gold = s.sides[0].gold;
    const first = step(s, []);
    expect(eventsOf(first, 'unitDied').map((e) => e.id)).toEqual([target.id]);
    expect(s.projectiles).toHaveLength(1);
    const rest = runUntilNoProjectiles(s);
    expect(eventsOf(rest, 'unitDied')).toHaveLength(0);
    expect(eventsOf(rest, 'projectileImpact')[0]!.hits).toBe(0);
    expect(s.sides[0].gold).toBe(gold + mustGetUnit(FRONT_ID).def.bountyGold);
    expect(s.sides[0].stats.kills[FRONT_ID]).toBe(1);
    expect(s.sides[0].stats.kills[R] ?? 0).toBe(0);
  });

  it('öldürme istatistiği atan birlik ölse bile kaynak türüne yazılır; mermi yoluna devam eder', () => {
    const s = newState();
    const shooter = addUnit(s, 0, 300, {}, R);
    const target = addUnit(s, 1, 315 + 150 + 18, { hp: 18 });
    step(s, []);
    expect(s.projectiles).toHaveLength(1);
    s.units = s.units.filter((u) => u.id !== shooter.id);
    const events = runUntilNoProjectiles(s);
    expect(eventsOf(events, 'unitDied').map((e) => e.id)).toEqual([target.id]);
    expect(s.sides[0].stats.kills[R]).toBe(1);
  });
});

describe('Maç sonu ve serileştirme', () => {
  it('K-06: maç bitince uçuştaki mermiler durur; sonrasında durum ve karma değişmez', () => {
    const s = newState();
    s.sides[1].baseHp = 10;
    addUnit(s, 0, FACE_1 - 18);
    addUnit(s, 0, 1000, {}, R);
    addUnit(s, 1, 1000 + 15 + 120 + 18, { hp: 1_000_000 });
    const events = step(s, []);
    expect(eventsOf(events, 'matchEnded')).toHaveLength(1);
    expect(s.outcome).not.toBeNull();
    expect(s.projectiles.length).toBeGreaterThan(0);
    const hash = stateHash(s);
    const xs = s.projectiles.map((p) => p.x);
    for (let i = 0; i < 30; i++) expect(step(s, [])).toEqual([]);
    expect(stateHash(s)).toBe(hash);
    expect(s.projectiles.map((p) => p.x)).toEqual(xs);
  });

  it('durum (mermiler dahil) JSON ile gidip gelir ve devam eden koşu aynı karmayı verir', () => {
    const run = (cutAt: number | null): string => {
      let s = createMatch({ seed: 7, opponent: 'none' });
      s.sides[0].gold += 3000;
      s.sides[1].gold += 3000;
      const controllers = [createStackerBot(), createBasicBot()] as const;
      for (let t = 0; t < 1500; t++) {
        if (t === cutAt) {
          const copy = clone(s);
          expect(copy.projectiles.length).toBeGreaterThanOrEqual(0);
          s = copy;
        }
        stepMatch(s, [], controllers);
        expect(checkInvariants(s)).toEqual([]);
      }
      return stateHash(s);
    };
    const straight = run(null);
    expect(run(400)).toBe(straight);
    expect(run(900)).toBe(straight);
  });

  it('aynı tohum ve botlarla iki koşu aynı karmayı verir (mermiler karmaya dahildir)', () => {
    const play = (): { hash: string; shots: number } => {
      const s = createMatch({ seed: 3, opponent: 'none' });
      s.sides[0].gold += 3000;
      s.sides[1].gold += 3000;
      const controllers = [createStackerBot(), createStackerBot()] as const;
      let shots = 0;
      for (let t = 0; t < 2000; t++) {
        shots += eventsOf(stepMatch(s, [], controllers), 'projectileFired').length;
      }
      return { hash: stateHash(s), shots };
    };
    const a = play();
    const b = play();
    expect(a.shots).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });
});
