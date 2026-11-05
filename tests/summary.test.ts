import { describe, expect, it } from 'vitest';
import { TOWERS } from '../src/data/towers';
import { ABILITIES } from '../src/data/abilities';
import { UNITS } from '../src/data/units';
import { WORLD } from '../src/data/world';
import { summarizeMatch } from '../src/game/summary';
import { versionLabel } from '../src/game/version';
import { tr } from '../src/i18n/tr';
import { createMatch } from '../src/sim/create';
import { fallbackLabel, loadKeyLabeler, shortcutRows } from '../src/ui/shortcuts';

describe('Sonuç özeti (EK-06, GDD §13)', () => {
  it('boş maç: birlik satırı yok, sıfır toplamlar', () => {
    const summary = summarizeMatch(createMatch({ seed: 1, opponent: 'none' }));
    expect(summary.unitRows).toEqual([]);
    expect(summary.durationSeconds).toBe(0);
    expect(summary.sides[0]).toMatchObject({ age: 1, goldEarned: 0, goldSpent: 0, baseDamageDealt: 0, towerKills: 0, abilityKills: 0, ageUpSeconds: [] });
  });

  it('istatistikler iki taraf için doğru toplanır; süre sonuç tick inden gelir', () => {
    const state = createMatch({ seed: 1, opponent: 'none' });
    const [a, b] = state.sides;
    const front = UNITS[0]!.id;
    const heavy = UNITS[2]!.id;
    a.stats.produced[front] = 5;
    a.stats.lost[front] = 2;
    a.stats.kills[front] = 3;
    a.stats.kills[heavy] = 1;
    a.stats.kills[TOWERS[0]!.id] = 4;
    a.stats.kills[TOWERS[1]!.id] = 1;
    a.stats.kills[ABILITIES[0]!.id] = 7;
    a.stats.goldEarned = 900;
    a.stats.goldSpent = 800;
    a.stats.goldRefunded = 125;
    a.stats.baseDamageDealt = 250;
    a.stats.ageUpTicks = [WORLD.tickRate * 90];
    a.age = 2;
    b.stats.goldEarned = 400;
    b.stats.kills[ABILITIES[1]!.id] = 2;
    state.tick = WORLD.tickRate * 130;
    state.outcome = { kind: 'win', winner: 0, tick: WORLD.tickRate * 125 };

    const summary = summarizeMatch(state);
    expect(summary.durationSeconds).toBe(125);
    expect(summary.unitRows).toEqual([
      { unitId: front, produced: 5, lost: 2, kills: 3 },
      { unitId: heavy, produced: 0, lost: 0, kills: 1 },
    ]);
    expect(summary.sides[0]).toMatchObject({ age: 2, goldEarned: 900, goldSpent: 675, baseDamageDealt: 250, towerKills: 5, abilityKills: 7, ageUpSeconds: [90] });
    expect(summary.sides[1]).toMatchObject({ goldEarned: 400, abilityKills: 2, towerKills: 0, age: 1 });
  });
});

describe('Sonuç ekranı etiketi', () => {
  it('harcanan altın net olarak etiketlenir', () => {
    expect(tr.result.goldSpent).toBe('Harcanan (net)');
  });
});

describe('Kısayol listesi (EK-07, TDD §7)', () => {
  it('Türkçe Q varsayımıyla etiketler', () => {
    const rows = shortcutRows();
    const flat = rows.flatMap((r) => r.keys);
    expect(flat).toEqual(expect.arrayContaining(['1', '2', '3', 'Backspace', 'Q', 'E', 'P', 'Esc']));
    expect(rows.every((r) => r.action.length > 0)).toBe(true);
  });

  it('Keyboard Map API varsa düzene göre etiket (ör. AZERTY: KeyQ → A)', async () => {
    const map = new Map([['KeyQ', 'a'], ['KeyE', 'e'], ['KeyP', 'p'], ['Digit1', '&']]);
    const label = await loadKeyLabeler({ keyboard: { getLayoutMap: () => Promise.resolve({ get: (c: string) => map.get(c) }) } });
    expect(label('KeyQ')).toBe('A');
    expect(label('Digit1')).toBe('&');
    expect(label('Escape')).toBe('Esc');
    expect(shortcutRows(label).flatMap((r) => r.keys)).toContain('A');
  });

  it('API yoksa ya da başarısızsa yedek etiketleyici', async () => {
    expect(await loadKeyLabeler({})).toBe(fallbackLabel);
    expect(await loadKeyLabeler(undefined)).toBe(fallbackLabel);
    const failing = { keyboard: { getLayoutMap: () => Promise.reject(new Error('izin yok')) } };
    expect(await loadKeyLabeler(failing)).toBe(fallbackLabel);
  });
});

describe('Sürüm gösterimi (TDD §11)', () => {
  it('sürüm ve kısa karma; tanımsızken 0.0.0 (dev)', () => {
    expect(versionLabel('1.2.3', 'abc1234')).toBe('1.2.3 (abc1234)');
    expect(versionLabel().length).toBeGreaterThan(0);
  });
});
