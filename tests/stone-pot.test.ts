import { describe, expect, it } from 'vitest';
import { AGES } from '../src/data/ages';
import { EROSION, STONE } from '../src/data/stone';
import { WORLD } from '../src/data/world';
import { checksumOf, createSave, parseSave, serializeSave } from '../src/game/save';
import { createMatch } from '../src/sim/create';
import { checkInvariants, goldBalanceProblems } from '../src/sim/invariants';
import { step } from '../src/sim/step';
import { erosionEnabled, type GameState, type SimEvent } from '../src/sim/types';
import { addUnit, newState, setAge, ZONE_MID_X } from './helpers';

function runSeconds(s: GameState, sec: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < sec * WORLD.tickRate; t++) events.push(...step(s, []));
  return events;
}

describe('GDD §8: Sınır Taşı kazanı', () => {
  it('sahip ödülün yarısını hemen alır, yarısı kazanda birikir; toplam korunur', () => {
    const s = newState();
    setAge(s, 0, 3);
    s.stone.counter = STONE.counterMax;
    s.stone.owner = 0;
    const age = AGES[2]!;
    const goldBefore = s.sides[0].gold;
    runSeconds(s, 10);
    const keepGold = Math.round(age.stoneGoldPerSec * (1 - STONE.potShare));
    const keepXp = Math.round(age.stoneXpPerSec * (1 - STONE.potShare));
    expect(s.sides[0].gold - goldBefore).toBe(10 * (age.incomePerSec + keepGold));
    expect(s.sides[0].xp).toBe(10 * keepXp);
    expect(s.stone.potGold).toBe(10 * (age.stoneGoldPerSec - keepGold));
    expect(s.stone.potXp).toBe(10 * (age.stoneXpPerSec - keepXp));
    expect(s.stone.potGold).toBeGreaterThan(0);
  });

  it('taşı sahibinden söken taraf kazanın tamamını alır; olay bir kez, kazan boşalır, altın korunur', () => {
    const s = newState();
    s.stone.counter = 0;
    s.stone.owner = 0;
    s.stone.potGold = 340;
    s.stone.potXp = 250;
    addUnit(s, 1, ZONE_MID_X);
    const goldBefore: [number, number] = [s.sides[0].gold, s.sides[1].gold];
    const xpBefore = s.sides[1].xp;
    const earnedBefore = s.sides[1].stats.goldEarned;
    const events = step(s, []);
    expect(s.stone.owner).toBeNull();
    expect(events.filter((e) => e.type === 'stoneLost')).toEqual([{ type: 'stoneLost', side: 0 }]);
    expect(events.filter((e) => e.type === 'stonePotClaimed')).toEqual([{ type: 'stonePotClaimed', side: 1, gold: 340, xp: 250 }]);
    expect(s.sides[1].gold - goldBefore[1]).toBeGreaterThanOrEqual(340);
    expect(s.sides[1].xp - xpBefore).toBeGreaterThanOrEqual(250);
    expect(s.sides[1].stats.goldEarned - earnedBefore).toBeGreaterThanOrEqual(340);
    expect(s.stone.potGold).toBe(0);
    expect(s.stone.potXp).toBe(0);
    expect(goldBalanceProblems(goldBefore, s, events)).toEqual([]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('kazan boşken söküm olay üretmez; sahipsiz taş kazan biriktirmez', () => {
    const s = newState();
    s.stone.counter = 0;
    s.stone.owner = 0;
    addUnit(s, 1, ZONE_MID_X);
    const events = step(s, []);
    expect(events.some((e) => e.type === 'stonePotClaimed')).toBe(false);
    const n = newState();
    runSeconds(n, 5);
    expect(n.stone).toMatchObject({ owner: null, potGold: 0, potXp: 0 });
  });

  it('değişmez: negatif ya da kesirli kazan yakalanır', () => {
    const s = newState();
    s.stone.potGold = -1;
    expect(checkInvariants(s).some((p) => p.includes('kazan'))).toBe(true);
    s.stone.potGold = 0;
    s.stone.potXp = 1.5;
    expect(checkInvariants(s).some((p) => p.includes('kazan'))).toBe(true);
  });
});

describe('GDD §8.1: Aşınma', () => {
  it('varsayılan açık: başlangıca kadar üs canı değişmez, başlangıçta erosionStarted bir kez', () => {
    const s = newState();
    expect(erosionEnabled(s.config)).toBe(true);
    const hp = [s.sides[0].baseHp, s.sides[1].baseHp];
    const events = runSeconds(s, EROSION.startSec);
    expect([s.sides[0].baseHp, s.sides[1].baseHp]).toEqual(hp);
    expect(events.filter((e) => e.type === 'erosionStarted')).toHaveLength(1);
  });

  it('başlangıçtan sonra iki üs da her saniye azami canın binde perSecPermille kadarını kaybeder', () => {
    const s = newState();
    runSeconds(s, EROSION.startSec);
    const hp = [s.sides[0].baseHp, s.sides[1].baseHp];
    const events = runSeconds(s, 10);
    for (const side of [0, 1] as const) {
      const loss = Math.ceil((s.sides[side].baseMaxHp * EROSION.perSecPermille) / 1000);
      expect(hp[side]! - s.sides[side].baseHp).toBe(10 * loss);
    }
    expect(events.some((e) => e.type === 'erosionStarted')).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('kapalıyken (uzun maç) üs canı aşınmaz ve olay yoktur', () => {
    const s = createMatch({ seed: 1, opponent: 'none', erosion: false });
    expect(erosionEnabled(s.config)).toBe(false);
    const events = runSeconds(s, EROSION.startSec + 30);
    expect(s.sides[0].baseHp).toBe(s.sides[0].baseMaxHp);
    expect(s.sides[1].baseHp).toBe(s.sides[1].baseMaxHp);
    expect(events.some((e) => e.type === 'erosionStarted')).toBe(false);
  });

  it('aşınma maçı bitirir: aynı canla iki üs aynı anda düşerse beraberlik, az canlı üs önce düşer', () => {
    const tie = newState();
    runSeconds(tie, EROSION.startSec);
    tie.sides[0].baseHp = 50;
    tie.sides[1].baseHp = 50;
    runSeconds(tie, 2);
    expect(tie.outcome?.kind).toBe('draw');

    const win = newState();
    runSeconds(win, EROSION.startSec);
    win.sides[0].baseHp = 50;
    win.sides[1].baseHp = 5000;
    runSeconds(win, 2);
    expect(win.outcome).toMatchObject({ kind: 'win', winner: 1 });
  });
});

describe('Kayıt uyumu (1.1 → 1.2)', () => {
  it('kazan alanı olmayan eski kayıt açılır ve 0 ile tamamlanır; aşınma alanı yoksa açık sayılır', () => {
    const state = newState();
    const old = JSON.parse(JSON.stringify(state)) as GameState;
    const oldStone = old.stone as unknown as Record<string, unknown>;
    delete oldStone['potGold'];
    delete oldStone['potXp'];
    const save = { ...createSave(old, '1.1.0', 1), checksum: checksumOf(old) };
    const result = parseSave(serializeSave(save), '1.2.0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state.stone.potGold).toBe(0);
    expect(result.save.state.stone.potXp).toBe(0);
    expect(erosionEnabled(result.save.state.config)).toBe(true);
  });

  it('aşınma kapalı maç kaydedilip açılınca kapalı kalır', () => {
    const state = createMatch({ seed: 9, opponent: 'none', erosion: false });
    const result = parseSave(serializeSave(createSave(state, '1.2.0', 1)), '1.2.0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.matchConfig.erosion).toBe(false);
    expect(erosionEnabled(result.save.state.config)).toBe(false);
  });
});
